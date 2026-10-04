// Full-screen sky explorer: pan, zoom, search, layer toggles and a date slider that moves the
// planets along their trails. Requires stars.js and sky-core.js. State lives in the URL hash.
(function () {
  "use strict";
  var canvas = document.getElementById("sky-x");
  if (!canvas || !window.OC_SKY || !window.OCSky || !canvas.getContext) return;

  var S = window.OCSky, D2R = S.D2R;
  var ctx = canvas.getContext("2d");
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var MONO = getComputedStyle(document.body).getPropertyValue("--mono");
  var view = new S.View(), cat = view.cat, names = cat.names;
  view.bandRes = 4;
  var DAY = 86400000, TRAIL = 120, today = Date.now();

  var state = { ra: 84, dec: 0, fov: 90, days: 0 };
  var layers = { lines: true, names: true, band: true, planets: true, trails: true };
  var W = 0, H = 0, dpr = 1, planets = [], trails = {};
  var $ = function (id) { return document.getElementById(id); };

  // URL hash: #ra=84.0&dec=0.0&fov=90&d=0
  function readHash() {
    location.hash.slice(1).split("&").forEach(function (kv) {
      var p = kv.split("="), v = parseFloat(p[1]);
      if (!Number.isFinite(v)) return;
      if (p[0] === "ra") state.ra = ((v % 360) + 360) % 360;
      if (p[0] === "dec") state.dec = clamp(v, -89, 89);
      if (p[0] === "fov") state.fov = clamp(v, 8, 160);
      if (p[0] === "d") state.days = clamp(Math.round(v), -730, 730);
    });
  }
  var hashTimer = 0;
  function writeHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(function () {
      var h = "#ra=" + norm(state.ra).toFixed(2) + "&dec=" + state.dec.toFixed(2) + "&fov=" + state.fov.toFixed(0) + "&d=" + state.days;
      if (history.replaceState) history.replaceState(null, "", h);
    }, 250);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function norm(ra) { return ((ra % 360) + 360) % 360; }

  function computePlanets() {
    var t = today + state.days * DAY;
    planets = S.planets(t);
    if (!layers.trails) return;
    trails = {};
    for (var d = -TRAIL; d <= TRAIL; d += 2) {
      S.planets(t + d * DAY).forEach(function (p) { (trails[p.name] = trails[p.name] || []).push(p); });
    }
  }

  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    view.size(W, H, state.fov, W < 760 ? 6 : 99);
  }

  var hover = null, pt = [0, 0];
  function draw() {
    view.size(W, H, state.fov, W < 760 && state.fov > 60 ? 6 : 99);
    view.boost = clamp(1.1 * Math.log(90 / state.fov) / Math.LN2, 0, 2.2);
    view.point(state.ra, state.dec);
    view.layout();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, W, H);
    if (layers.band && state.fov > 35) view.drawBand(ctx);
    if (layers.lines) view.drawLines(ctx, 0.24);
    view.drawStars(ctx, 0, false);

    if (layers.names) {
      ctx.font = "500 11px " + MONO;
      ctx.fillStyle = "rgba(180,189,210,0.75)";
      for (var key in names) {
        var i = +key;
        if (view.VIS[i]) ctx.fillText(names[key], view.SX[i] + 9, view.SY[i] + 3.5);
      }
    }
    if (layers.planets) {
      if (layers.trails) drawTrails();
      view.drawPlanets(ctx, planets, "600 11px " + MONO);
    }
    drawHover();
    updateReadout();
  }

  function drawTrails() {
    ctx.lineWidth = 1.2;
    Object.keys(trails).forEach(function (name) {
      var tr = trails[name], prev = false;
      ctx.strokeStyle = "rgba(255,196,119,0.35)";
      ctx.beginPath();
      for (var i = 0; i < tr.length; i++) {
        var ok = view.project(tr[i].x, tr[i].y, tr[i].z, pt);
        if (ok && prev) ctx.lineTo(pt[0], pt[1]);
        else if (ok) ctx.moveTo(pt[0], pt[1]);
        prev = ok;
      }
      ctx.stroke();
      // Monthly ticks along the trail.
      ctx.fillStyle = "rgba(255,196,119,0.5)";
      for (var j = 0; j < tr.length; j += 15) {
        if (view.project(tr[j].x, tr[j].y, tr[j].z, pt)) ctx.fillRect(pt[0] - 1, pt[1] - 1, 2, 2);
      }
    });
  }

  function planetAt(x, y) {
    for (var i = 0; i < planets.length; i++) {
      var p = planets[i];
      if (view.project(p.x, p.y, p.z, pt) && Math.hypot(pt[0] - x, pt[1] - y) < 14) return p;
    }
    return null;
  }

  function drawHover() {
    var el = $("x-hover");
    if (!hover) { el.innerHTML = "&nbsp;"; return; }
    var p = layers.planets && planetAt(hover[0], hover[1]);
    if (p) {
      var rp = S.toRaDec([p.x, p.y, p.z]);
      el.textContent = p.name + "  ·  RA " + S.fmtRa(rp[0]) + "  DEC " + S.fmtDec(rp[1]);
      return;
    }
    var i = view.nearest(hover[0], hover[1], 18, 7);
    if (i < 0) { el.innerHTML = "&nbsp;"; return; }
    ctx.strokeStyle = "rgba(232,236,246,0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(view.SX[i], view.SY[i], 9, 0, 6.283);
    ctx.stroke();
    var raw = cat.raw;
    el.textContent = (names[i] ? names[i] + "  ·  " : "") + "V " + cat.MAG[i].toFixed(1) +
      "  B−V " + (raw[4 * i + 3] / 100).toFixed(2) + "  ·  RA " + S.fmtRa(raw[4 * i] / 20) + "  DEC " + S.fmtDec(raw[4 * i + 1] / 20);
  }

  function updateReadout() {
    $("x-center").textContent = "RA " + S.fmtRa(norm(state.ra)).slice(0, 7) + "  DEC " + S.fmtDec(state.dec) +
      "  ·  FOV " + state.fov.toFixed(0) + "°";
  }

  function updateDate() {
    var d = new Date(today + state.days * DAY);
    $("x-date").textContent = state.days === 0 ? "today" : d.toISOString().slice(0, 10);
    $("x-days").value = state.days;
  }

  var queued = false;
  function redraw() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; draw(); });
  }
  function changed() { writeHash(); redraw(); }

  // Smooth flights between targets.
  var flight = null;
  function flyTo(ra, dec, fov) {
    var ra0 = norm(state.ra), dra = ((ra - ra0 + 540) % 360) - 180;
    if (reduced) { state.ra = ra; state.dec = dec; if (fov) state.fov = fov; changed(); return; }
    flight = { t0: performance.now(), ra0: ra0, dra: dra, dec0: state.dec, dec: dec, fov0: state.fov, fov: fov || state.fov };
    requestAnimationFrame(fly);
  }
  function fly(now) {
    if (!flight) return;
    var p = Math.min(1, (now - flight.t0) / 1400), e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    state.ra = flight.ra0 + flight.dra * e;
    state.dec = flight.dec0 + (flight.dec - flight.dec0) * e;
    state.fov = flight.fov0 + (flight.fov - flight.fov0) * e;
    draw();
    if (p < 1) requestAnimationFrame(fly); else { flight = null; writeHash(); }
  }

  // Pointer: drag to pan, pinch or wheel to zoom.
  var pointers = {}, lastPinch = 0;
  canvas.addEventListener("pointerdown", function (ev) {
    pointers[ev.pointerId] = [ev.clientX, ev.clientY];
    canvas.setPointerCapture(ev.pointerId);
    flight = null;
  });
  canvas.addEventListener("pointermove", function (ev) {
    var r = canvas.getBoundingClientRect(), ids = Object.keys(pointers);
    if (!pointers[ev.pointerId]) {
      hover = ev.pointerType === "mouse" ? [ev.clientX - r.left, ev.clientY - r.top] : null;
      redraw();
      return;
    }
    var prev = pointers[ev.pointerId];
    pointers[ev.pointerId] = [ev.clientX, ev.clientY];
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]], dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (lastPinch) state.fov = clamp(state.fov * lastPinch / dist, 8, 160);
      lastPinch = dist;
    } else {
      var k = 1 / view.scale / D2R;
      state.ra += (ev.clientX - prev[0]) * k / Math.max(0.2, Math.cos(state.dec * D2R));
      state.dec = clamp(state.dec + (ev.clientY - prev[1]) * k, -89, 89);
    }
    hover = null;
    changed();
  });
  function up(ev) { delete pointers[ev.pointerId]; lastPinch = 0; }
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("pointerleave", function () { hover = null; redraw(); });
  canvas.addEventListener("wheel", function (ev) {
    ev.preventDefault();
    flight = null;
    state.fov = clamp(state.fov * Math.exp(ev.deltaY * 0.0012), 8, 160);
    changed();
  }, { passive: false });
  canvas.addEventListener("keydown", function (ev) {
    var step = state.fov / 20, handled = true;
    if (ev.key === "ArrowLeft") state.ra += step;
    else if (ev.key === "ArrowRight") state.ra -= step;
    else if (ev.key === "ArrowUp") state.dec = clamp(state.dec + step, -89, 89);
    else if (ev.key === "ArrowDown") state.dec = clamp(state.dec - step, -89, 89);
    else if (ev.key === "+" || ev.key === "=") state.fov = clamp(state.fov / 1.15, 8, 160);
    else if (ev.key === "-") state.fov = clamp(state.fov * 1.15, 8, 160);
    else handled = false;
    if (handled) { ev.preventDefault(); flight = null; changed(); }
  });

  function zoomBy(f) {
    flight = null;
    state.fov = clamp(state.fov * f, 8, 160);
    changed();
  }
  $("x-in").addEventListener("click", function () { zoomBy(1 / 1.3); });
  $("x-out").addEventListener("click", function () { zoomBy(1.3); });

  // Search: named stars and planets.
  var dl = $("x-names");
  Object.keys(names).map(function (k) { return names[k]; })
    .concat(["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"]).sort()
    .forEach(function (nm) { var o = document.createElement("option"); o.value = nm; dl.appendChild(o); });
  $("x-search").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var q = $("x-q").value.trim().toLowerCase(), target = null;
    planets.forEach(function (p) { if (p.name.toLowerCase() === q) target = S.toRaDec([p.x, p.y, p.z]); });
    if (!target) for (var key in names) {
      if (names[key].toLowerCase() === q) target = [cat.raw[4 * key] / 20, cat.raw[4 * key + 1] / 20];
    }
    $("x-q").setAttribute("aria-invalid", target ? "false" : "true");
    $("x-status").textContent = target ? "" : "No match. Try a planet or a bright star such as Sirius, Vega or Betelgeuse.";
    if (target) flyTo(target[0], target[1], Math.min(state.fov, 50));
  });

  // Time.
  var playing = false, playLast = 0;
  function setDays(d) {
    state.days = clamp(Math.round(d), -730, 730);
    computePlanets();
    updateDate();
    changed();
  }
  $("x-days").addEventListener("input", function (ev) { setDays(+ev.target.value); });
  $("x-now").addEventListener("click", function () { setDays(0); });
  var playBtn = $("x-play");
  playBtn.addEventListener("click", function () {
    playing = !playing;
    playBtn.setAttribute("aria-pressed", playing);
    playBtn.setAttribute("aria-label", playing ? "Pause time" : "Play time");
    playBtn.innerHTML = playing ? "&#10074;&#10074;" : "&#9654;";
    if (playing) { playLast = 0; requestAnimationFrame(tick); }
  });
  function tick(now) {
    if (!playing) return;
    if (!playLast) playLast = now;
    var adv = (now - playLast) / 1000 * 30;
    if (adv >= 1) {
      playLast = now;
      if (state.days + adv > 730) setDays(-730); else setDays(state.days + adv);
    }
    requestAnimationFrame(tick);
  }

  document.querySelectorAll("[data-layer]").forEach(function (box) {
    box.addEventListener("change", function () {
      layers[box.dataset.layer] = box.checked;
      if (box.dataset.layer === "trails") computePlanets();
      redraw();
    });
  });

  readHash();
  computePlanets();
  updateDate();
  resize();
  draw();
  window.addEventListener("resize", function () { resize(); redraw(); });
  window.addEventListener("hashchange", function () { readHash(); computePlanets(); updateDate(); redraw(); });
})();
