// Real-sky hero: Hipparcos stars and Stellarium constellation lines under a stereographic camera,
// with a looping illustration of how a blind plate solver matches star patterns. Requires sky-core.js.
(function () {
  "use strict";
  var canvas = document.getElementById("sky");
  if (!canvas || !window.OC_SKY || !window.OCSky || !canvas.getContext) return;

  var S = window.OCSky, D2R = S.D2R;
  var ctx = canvas.getContext("2d");
  var hud = document.getElementById("sky-hud");
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var MONO = getComputedStyle(document.body).getPropertyValue("--mono");

  var view = new S.View(), cat = view.cat, n = cat.n, MAG = cat.MAG, names = cat.names;
  var SX = view.SX, SY = view.SY, VIS = view.VIS;
  var planets = S.planets(Date.now());

  // Camera state: centre (ra, dec) in degrees.
  var cam = { ra: 98, dec: -4, vra: 0, vdec: 0 };
  var W = 0, H = 0, dpr = 1, baseScale = 1, intro = -1, frameNo = 0;

  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    view.size(W, H, W < 700 ? 80 : 112, W < 760 ? 5.8 : 99);
    baseScale = view.scale;
    frameNo = 0;
  }

  // Plate-solve illustration: a field locks on, detects sources, matches a quad, reports the centre.
  var solve = null, CYCLE = 9.5;
  function newSolve(t, at) {
    var mobile = W < 760;
    var size = mobile ? 116 : 190;
    var sx = at ? at[0] : mobile ? W - size / 2 - 22 - Math.random() * 20 : W * (0.62 + Math.random() * 0.2);
    var sy = at ? at[1] : mobile ? H - size / 2 - 64 : H * (0.3 + Math.random() * 0.35);
    solve = { t0: t, v: view.unproject(sx, sy), size: size, stars: null };
  }

  function solveStars(px, py, half) {
    var found = [];
    for (var i = 0; i < n && found.length < 14; i++) {
      if (!VIS[i] || MAG[i] > 5.4) continue;
      if (Math.abs(SX[i] - px) < half - 6 && Math.abs(SY[i] - py) < half - 6) found.push(i);
    }
    return found;
  }

  var pt2 = [0, 0];
  function draw(t) {
    // Opening shot: ease in from a wider field.
    if (!reduced) {
      if (intro < 0) intro = t;
      var ip = Math.min(1, (t - intro) / 3.2);
      view.scale = baseScale * (0.62 + 0.38 * (1 - Math.pow(1 - ip, 3)));
    }
    view.point(cam.ra, cam.dec);
    view.layout();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    view.drawBand(ctx, frameNo++ & 1);
    view.drawLines(ctx);
    view.drawStars(ctx, t, !reduced);
    view.drawPlanets(ctx, planets, "600 10.5px " + MONO, function (x, y) {
      return y < 60 ? 0 : W < 760 || x > W * 0.42 ? 0.9 : 0.35;
    });

    // Labels for named bright stars, faded out behind the headline.
    ctx.font = "500 10.5px " + MONO;
    ctx.fillStyle = "#b4bdd2";
    var labelFrom = W < 760 ? 0 : W * 0.42;
    for (var key in names) {
      var idx = +key;
      if (!VIS[idx] || SX[idx] < labelFrom || SX[idx] > W - 90 || SY[idx] < 72) continue;
      var la = W < 760 ? (SY[idx] > H * 0.55 ? 0.55 : 0) : Math.min(1, (SX[idx] - labelFrom) / (W * 0.12)) * 0.55;
      if (la <= 0) continue;
      ctx.globalAlpha = la;
      ctx.fillText(names[key], SX[idx] + 9, SY[idx] + 3.5);
    }
    ctx.globalAlpha = 1;

    if (!reduced) drawSolve(t);
    drawHover();
  }

  function drawSolve(t) {
    if (t - intro < 3.4 && !solve) return;
    if (!solve || t - solve.t0 > CYCLE) newSolve(t);
    var e = t - solve.t0, v = solve.v;
    if (!view.project(v[0], v[1], v[2], pt2)) { solve = null; return; }
    var px = pt2[0], py = pt2[1], half = solve.size / 2;
    if (e > 1.1 && !solve.stars) solve.stars = solveStars(px, py, half);

    var fadeIn = Math.min(1, e / 0.6), fadeOut = Math.min(1, (CYCLE - e) / 0.8), A = Math.max(0, Math.min(fadeIn, fadeOut));
    var shrink = 1 + 0.6 * Math.pow(1 - Math.min(1, e / 0.9), 3);
    var h = half * shrink, c = 16;
    ctx.globalAlpha = A;
    ctx.strokeStyle = "#7cc4ff";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    corner(px - h, py - h, c, c); corner(px + h, py - h, -c, c);
    corner(px - h, py + h, c, -c); corner(px + h, py + h, -c, -c);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(124,196,255,0.25)";
    ctx.beginPath();
    ctx.moveTo(px - 6, py); ctx.lineTo(px + 6, py); ctx.moveTo(px, py - 6); ctx.lineTo(px, py + 6);
    ctx.stroke();

    var found = solve.stars || [];
    // Source detection.
    for (var i = 0; i < found.length; i++) {
      var appear = 1.2 + i * 0.12;
      if (e < appear) break;
      var p = Math.min(1, (e - appear) / 0.35), si = found[i];
      ctx.strokeStyle = "rgba(139,227,176," + (0.85 * A) + ")";
      ctx.beginPath();
      ctx.arc(SX[si], SY[si], 4 + 10 * (1 - p) + 2, 0, 6.283);
      ctx.stroke();
    }
    // Quad match among the four brightest detections.
    if (found.length >= 4 && e > 3.2) {
      var q = Math.min(1, (e - 3.2) / 1.1), order = [0, 1, 1, 3, 3, 2, 2, 0, 0, 3, 1, 2];
      ctx.strokeStyle = "rgba(255,196,119," + (0.9 * A) + ")";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      var segs = Math.ceil(q * 6);
      for (var s = 0; s < segs; s++) {
        var a = found[order[2 * s]], b = found[order[2 * s + 1]];
        ctx.moveTo(SX[a], SY[a]);
        ctx.lineTo(SX[b], SY[b]);
      }
      ctx.stroke();
    }
    // Readout for the field centre.
    if (e > 4.4) {
      var rd = S.toRaDec(v), fov = 2 * half / view.scale / D2R;
      var lines = [
        found.length >= 4 ? "QUAD MATCHED" : "TOO FEW STARS",
        "RA  " + S.fmtRa(rd[0]),
        "DEC " + S.fmtDec(rd[1]),
        "FOV " + fov.toFixed(1) + "°  ·  " + found.length + " src"
      ];
      var tx = px + h + 14, ty = py - h + 4;
      if (tx + 170 > W) tx = px - h - 184;
      var typed = Math.min(1, (e - 4.4) / 0.9);
      ctx.font = "600 11px " + MONO;
      ctx.fillStyle = "rgba(5,7,13," + (0.72 * Math.min(1, typed * 3)) + ")";
      ctx.fillRect(tx - 8, ty - 4, 178, lines.length * 16 + 10);
      for (var l = 0; l < lines.length; l++) {
        var str = lines[l], shown = Math.floor(str.length * Math.min(1, typed * 1.6 - l * 0.2));
        if (shown <= 0) continue;
        ctx.fillStyle = l === 0 ? (found.length >= 4 ? "#8be3b0" : "#ffc477") : "rgba(232,236,246,0.85)";
        ctx.fillText(str.slice(0, shown), tx, ty + 10 + l * 16);
      }
    }
    ctx.globalAlpha = 1;
  }
  function corner(x, y, dx, dy) { ctx.moveTo(x + dx, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy); }

  // Inspect the nearest reasonably bright star under the mouse.
  function drawHover() {
    if (!hover || dragging) return;
    var best = view.nearest(hover[0], hover[1], 22, 5);
    if (best < 0) return;
    var x = SX[best], y = SY[best], name = names[best];
    var info = "V " + MAG[best].toFixed(1) + "  B−V " + (cat.raw[4 * best + 3] / 100).toFixed(2);
    ctx.strokeStyle = "rgba(232,236,246,0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, 6.283);
    ctx.stroke();
    ctx.font = "600 11px " + MONO;
    var w = Math.max(ctx.measureText(info).width, name ? ctx.measureText(name).width : 0) + 16;
    var tx = x + 16 + w > W ? x - 16 - w : x + 16, ty = y - 14;
    ctx.fillStyle = "rgba(10,14,25,0.88)";
    ctx.fillRect(tx, ty, w, name ? 38 : 22);
    ctx.fillStyle = "#e8ecf6";
    if (name) ctx.fillText(name, tx + 8, ty + 15);
    ctx.fillStyle = "#b4bdd2";
    ctx.fillText(info, tx + 8, ty + (name ? 31 : 15));
  }

  var openLink = document.getElementById("sky-open");
  function updateHud() {
    if (openLink) openLink.href = "sky/#ra=" + (((cam.ra % 360) + 360) % 360).toFixed(1) + "&dec=" + cam.dec.toFixed(1) + "&fov=" + Math.round(4 * Math.atan(W / 4 / view.scale) / D2R);
    if (!hud) return;
    hud.textContent = (overhead ? "≈ ZENITH  " : "") + "RA " + S.fmtRa(((cam.ra % 360) + 360) % 360).slice(0, 7) +
      "  DEC " + S.fmtDec(cam.dec) + (W < 560 ? "" : "  ·  " + n.toLocaleString() + " Hipparcos stars");
  }

  // Interaction: drag to look around, with inertia.
  var dragging = false, lx = 0, ly = 0, downX = 0, downY = 0, hover = null;
  canvas.addEventListener("pointerdown", function (ev) {
    dragging = true; lx = downX = ev.clientX; ly = downY = ev.clientY;
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener("pointermove", function (ev) {
    if (!dragging) {
      var r = canvas.getBoundingClientRect();
      hover = ev.pointerType === "mouse" ? [ev.clientX - r.left, ev.clientY - r.top] : null;
      if (reduced) frame(performance.now());
      return;
    }
    var k = 1 / view.scale / D2R * 0.55, dx = ev.clientX - lx, dy = ev.clientY - ly;
    lx = ev.clientX; ly = ev.clientY;
    cam.vra = dx * k; cam.vdec = dy * k;
    cam.ra += cam.vra; cam.dec = Math.max(-80, Math.min(80, cam.dec + cam.vdec));
    if (reduced) frame(performance.now());
  });
  canvas.addEventListener("pointerleave", function () { hover = null; if (reduced) frame(performance.now()); });
  function endDrag() { dragging = false; }
  // A click without a drag runs the illustration on the field under the pointer.
  canvas.addEventListener("pointerup", function (ev) {
    endDrag();
    if (reduced || Math.abs(ev.clientX - downX) + Math.abs(ev.clientY - downY) > 6) return;
    var r = canvas.getBoundingClientRect();
    cam.vra = cam.vdec = 0;
    newSolve(performance.now() / 1000, [ev.clientX - r.left, ev.clientY - r.top]);
  });
  canvas.addEventListener("pointercancel", endDrag);

  // Fly to the local zenith: right ascension equals local sidereal time, declination equals latitude.
  // Longitude is estimated from the timezone offset so no location permission is needed.
  var goal = null, overhead = false;
  function zenith() {
    var jd = Date.now() / 86400000 + 2440587.5;
    var gmst = (280.46061837 + 360.98564736629 * (jd - 2451545)) % 360;
    var lon = -new Date().getTimezoneOffset() / 60 * 15;
    var lat = lon > -30 && lon < 60 ? 48 : lon >= 60 ? 30 : 38;
    return [((gmst + lon) % 360 + 360) % 360, lat];
  }
  function flyTo(ra, dec) {
    var ra0 = ((cam.ra % 360) + 360) % 360, dra = ((ra - ra0 + 540) % 360) - 180;
    cam.vra = cam.vdec = 0;
    solve = null;
    if (reduced) { cam.ra = ra; cam.dec = dec; frame(performance.now()); return; }
    goal = { t0: performance.now() / 1000, ra0: ra0, dra: dra, dec0: cam.dec, dec: dec };
    cam.ra = ra0;
    start();
  }
  var zbtn = document.getElementById("sky-zenith");
  if (zbtn) zbtn.addEventListener("click", function () {
    overhead = !overhead;
    zbtn.setAttribute("aria-pressed", overhead);
    zbtn.textContent = overhead ? "↺ tour the sky" : "⌖ overhead now";
    if (overhead) { var z = zenith(); flyTo(z[0], z[1]); } else flyTo(98, -4);
  });

  // Arrow keys pan when the map has focus.
  canvas.addEventListener("keydown", function (ev) {
    var k = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[ev.key];
    if (!k) return;
    ev.preventDefault();
    cam.vra = k[0] * 1.5; cam.vdec = k[1] * 1.5;
    if (reduced) { cam.ra += cam.vra; cam.dec = Math.max(-80, Math.min(80, cam.dec + cam.vdec)); frame(performance.now()); }
  });

  var running = false, visible = true, last = 0, hudT = -1;
  function frame(now) {
    var t = now / 1000, dt = Math.min(0.05, t - (last || t));
    last = t;
    if (goal) {
      var p = Math.min(1, (t - goal.t0) / 2.2), ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      cam.ra = goal.ra0 + goal.dra * ease;
      cam.dec = goal.dec0 + (goal.dec - goal.dec0) * ease;
      if (p >= 1) goal = null;
    } else if (!dragging && !reduced) {
      cam.vra *= 0.94; cam.vdec *= 0.94;
      cam.ra += cam.vra + dt * (overhead ? 0.0042 : 1.1);
      cam.dec = Math.max(-80, Math.min(80, cam.dec + cam.vdec));
    }
    draw(t);
    if (t - hudT > 0.25) { updateHud(); hudT = t; }
  }
  function loop(now) {
    if (!running) return;
    frame(now);
    requestAnimationFrame(loop);
  }
  function start() {
    if (running || reduced || !visible || document.hidden) return;
    running = true; last = 0;
    requestAnimationFrame(loop);
  }
  function stop() { running = false; }

  resize();
  frame(performance.now());
  window.addEventListener("resize", function () { resize(); solve = null; if (!running) frame(performance.now()); });
  document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      visible ? start() : stop();
    }).observe(canvas);
  }
  start();
})();
