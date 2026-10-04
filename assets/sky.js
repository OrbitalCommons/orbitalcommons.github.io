// Real-sky hero: Hipparcos stars and Stellarium constellation lines under a stereographic camera,
// with a looping illustration of how a blind plate solver matches star patterns. Requires sky-core.js.
(function () {
  "use strict";
  var canvas = document.getElementById("sky");
  if (!canvas || !window.OC_SKY || !window.OCSky || !canvas.getContext) return;

  var S = window.OCSky, D2R = S.D2R;
  var ctx = canvas.getContext("2d");
  var hud = document.getElementById("sky-hud");
  // `reduced` means no autonomous motion: set by the reduced-motion preference or the pause button.
  var prefersReduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var reduced = prefersReduced;
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
    // Box around the headline copy, in canvas coordinates; labels are kept out of it.
    textBox = null;
    var copy = document.querySelectorAll(".hero-inner > *");
    for (var i = 0; i < copy.length; i++) {
      var b = copy[i].getBoundingClientRect();
      if (!b.width) continue;
      textBox = textBox || [Infinity, Infinity, -Infinity, -Infinity];
      textBox[0] = Math.min(textBox[0], b.left - r.left - 24);
      textBox[1] = Math.min(textBox[1], b.top - r.top - 24);
      textBox[2] = Math.max(textBox[2], b.right - r.left + 24);
      textBox[3] = Math.max(textBox[3], b.bottom - r.top + 24);
    }
  }
  var textBox = null;
  function inText(x, y) {
    return textBox && x > textBox[0] - 80 && x < textBox[2] && y > textBox[1] && y < textBox[3];
  }

  // Plate-solve illustration: a field locks on, detects sources, matches a quad, reports the centre.
  var solve = null, CYCLE = 9.5;
  function newSolve(t, at) {
    var mobile = W < 760;
    var size = mobile ? 116 : 190;
    var sx = at ? at[0] : mobile ? W - size / 2 - 22 - Math.random() * 20 : W * (0.62 + Math.random() * 0.2);
    var sy = at ? at[1] : mobile ? H - size / 2 - 64 : H * (0.3 + Math.random() * 0.35);
    solve = { t0: t, v: view.unproject(sx, sy), size: size, stars: null, real: null };
  }

  // A click runs zodiacal for real (compiled to WebAssembly, fetched on first use) on a synthetic
  // TAN frame of the catalogue around the clicked point; the auto-play loop stays an illustration.
  var solverReady = null, FRAME = 1024;
  function loadSolver() {
    if (solverReady) return solverReady;
    solverReady = new Promise(function (resolve, reject) {
      if (window.OCZodiacal) return resolve();
      var s = document.createElement("script");
      s.src = "projects/zodiacal/solver.js";
      s.onload = function () { window.OCZodiacal ? resolve() : reject(new Error("no solver")); };
      s.onerror = function () { reject(new Error("solver failed to load")); };
      document.head.appendChild(s);
    }).then(function () { return window.OCZodiacal.load(); });
    solverReady.catch(function () { solverReady = null; });
    return solverReady;
  }
  function realSolve(sv) {
    var truth = S.toRaDec(sv.v), fov = Math.max(15, Math.min(40, sv.size / view.scale / D2R));
    var sources = S.tanField(truth[0], truth[1], fov, FRAME, FRAME, 6.3).map(function (p) { return { x: p.x, y: p.y, flux: p.flux }; });
    sv.real = { status: "pending", fov: fov, n: sources.length };
    setBusy(true);
    announce("Solving a synthetic " + fov.toFixed(0) + " degree frame with " + sources.length + " catalogue stars.");
    loadSolver().then(function () {
      return window.OCZodiacal.solve(sources, FRAME, FRAME, { timeoutMs: 8000 });
    }).then(function (r) {
      setBusy(false);
      if (solve !== sv) { announce("The view changed before the solve finished, so its result was set aside."); return; }
      if (performance.now() / 1000 - sv.t0 > CYCLE - 1) sv.t0 = performance.now() / 1000 - 4.6;
      if (!r) {
        sv.real.status = "none";
        announce("No solution for this field.");
      } else {
        var a = S.radec(truth[0], truth[1]), b = S.radec(r.ra, r.dec);
        sv.real = { status: "done", fov: fov, n: sources.length, r: r,
          err: Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) / D2R * 60 };
        announce("Solved in " + Math.round(r.ms) + " milliseconds: right ascension " + S.fmtRa(r.ra) + ", declination " +
          S.fmtDec(r.dec) + ", " + r.matched + " stars matched, " +
          (sv.real.err * 60 < 0.1 ? "under 0.1" : (sv.real.err * 60).toFixed(1)) + " arcseconds from the true centre of the synthetic frame.");
      }
      if (!running) frame(performance.now());
    }, function () {
      setBusy(false);
      if (solve !== sv) { announce("The view changed before the solve finished, so its result was set aside."); return; }
      if (performance.now() / 1000 - sv.t0 > CYCLE - 1) sv.t0 = performance.now() / 1000 - 4.6;
      sv.real.status = "fail";
      announce("The solver could not load.");
      if (!running) frame(performance.now());
    });
  }
  var statusEl = document.getElementById("sky-status");
  function announce(text) { if (statusEl) statusEl.textContent = text; }

  // One visitor solve at a time; the first one may wait on a slow download of the solver.
  var busy = false;
  function setBusy(b) {
    busy = b;
    var btn = document.getElementById("sky-solve");
    if (btn) btn.disabled = b;
  }
  function pendingUserSolve() { return solve && solve.real && solve.real.status === "pending"; }

  // Solve the field at a screen point; with reduced motion the result is drawn statically.
  function solveAt(x, y) {
    if (busy) return;
    cam.vra = cam.vdec = 0;
    newSolve(performance.now() / 1000 - (reduced ? 6 : 0), [x, y]);
    realSolve(solve);
    if (reduced) frame(performance.now());
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
    var labels = new S.Labels();
    view.drawPlanets(ctx, planets, "600 10.5px " + MONO, function (x, y) {
      return y < 60 || inText(x, y) ? 0 : 0.9;
    }, labels);

    // Labels for named bright stars, brightest first, kept clear of the headline and each other.
    ctx.font = "500 10.5px " + MONO;
    ctx.fillStyle = "#b4bdd2";
    ctx.globalAlpha = 0.55;
    for (var key in names) {
      var idx = +key;
      if (!VIS[idx] || SX[idx] > W - 90 || SY[idx] < 72 || inText(SX[idx], SY[idx])) continue;
      labels.text(ctx, names[key], SX[idx] + 9, SY[idx] + 3.5, 10.5);
    }
    ctx.globalAlpha = 1;

    drawSolve(t);
    drawHover();
  }

  function drawSolve(t) {
    // With reduced motion there is no loop: only a solve the visitor asked for, shown in its final state.
    if (reduced) {
      if (!solve) return;
    } else {
      if (t - intro < 3.4 && !solve) return;
      if (!solve || (t - solve.t0 > CYCLE && !pendingUserSolve())) newSolve(t);
    }
    // A pending visitor solve holds at its final frame until the answer arrives.
    var e = reduced ? 6 : pendingUserSolve() ? Math.min(t - solve.t0, CYCLE - 1) : t - solve.t0, v = solve.v;
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
      var rd = S.toRaDec(v), fov = 2 * half / view.scale / D2R, real = solve.real, good = found.length >= 4;
      var lines = [
        good ? "QUAD MATCHED" : "TOO FEW STARS",
        "RA  " + S.fmtRa(rd[0]),
        "DEC " + S.fmtDec(rd[1]),
        "FOV " + fov.toFixed(1) + "°  ·  " + found.length + " src"
      ];
      if (real && real.status === "done") {
        good = true;
        lines = [
          "SOLVED  " + (real.r.ms < 10 ? real.r.ms.toFixed(1) : Math.round(real.r.ms)) + " ms",
          "RA  " + S.fmtRa(real.r.ra),
          "DEC " + S.fmtDec(real.r.dec),
          "ERR " + (real.err * 60 < 1 ? "<1″" : real.err < 1 ? (real.err * 60).toFixed(0) + "″" : real.err.toFixed(1) + "′") + "  ·  " + real.r.matched + " matched",
          "zodiacal wasm · synthetic frame"
        ];
      } else if (real) {
        good = false;
        lines = [real.status === "pending" ? "SOLVING…" : real.status === "none" ? "NO SOLUTION" : "SOLVER UNAVAILABLE",
          real.n + " src  ·  " + real.fov.toFixed(0) + "° field", "zodiacal wasm · synthetic frame"];
      }
      ctx.font = "600 11px " + MONO;
      var bw = 0;
      for (var m = 0; m < lines.length; m++) bw = Math.max(bw, ctx.measureText(lines[m]).width);
      bw += 16;
      var tx = px + h + 14, ty = py - h + 4;
      if (tx + bw > W) tx = px - h - bw - 6;
      var typed = Math.min(1, (e - 4.4) / 0.9);
      ctx.fillStyle = "rgba(5,7,13," + (0.72 * Math.min(1, typed * 3)) + ")";
      ctx.fillRect(tx - 8, ty - 4, bw, lines.length * 16 + 10);
      for (var l = 0; l < lines.length; l++) {
        var str = lines[l], shown = Math.floor(str.length * Math.min(1, typed * (1 + 0.2 * lines.length) - l * 0.2));
        if (shown <= 0) continue;
        ctx.fillStyle = l === 0 ? (good ? "#8be3b0" : "#ffc477") : "rgba(232,236,246,0.85)";
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
    hud.textContent = "RA " + S.fmtRa(((cam.ra % 360) + 360) % 360).slice(0, 7) + "  DEC " + S.fmtDec(cam.dec) +
      (W < 560 ? "" : overhead ? "  ·  overhead guessed from your time zone, " + Math.abs(guessLat) + "°" + (guessLat < 0 ? "S" : "N")
        : "  ·  " + n.toLocaleString() + " Hipparcos stars");
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
    if (Math.abs(ev.clientX - downX) + Math.abs(ev.clientY - downY) > 6) return;
    var r = canvas.getBoundingClientRect();
    solveAt(ev.clientX - r.left, ev.clientY - r.top);
  });
  canvas.addEventListener("pointercancel", endDrag);

  // Fly roughly overhead: the zenith's right ascension is the local sidereal time and its declination
  // is the latitude. Without asking for location we only have a guess: longitude from the UTC offset,
  // hemisphere from the time-zone name, and a typical 35 degree latitude. The HUD says so.
  var goal = null, overhead = false, guessLat = 35;
  var SOUTH = /^(Australia|Antarctica)\/|^Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Apia|Noumea|Efate)|^America\/(Argentina|Sao_Paulo|Santiago|Montevideo|Asuncion|Lima|La_Paz|Bahia|Recife|Fortaleza|Belem|Cuiaba|Campo_Grande|Punta_Arenas)|^Africa\/(Johannesburg|Maputo|Harare|Lusaka|Windhoek|Gaborone|Maseru|Mbabane|Blantyre|Lubumbashi)|^Indian\/(Mauritius|Reunion|Antananarivo)/;
  function zenith() {
    var jd = Date.now() / 86400000 + 2440587.5;
    var gmst = (280.46061837 + 360.98564736629 * (jd - 2451545)) % 360;
    var lon = -new Date().getTimezoneOffset() / 60 * 15, tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { tz = ""; }
    guessLat = SOUTH.test(tz) ? -35 : 35;
    return [((gmst + lon) % 360 + 360) % 360, guessLat];
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
    zbtn.textContent = overhead ? "↺ tour the sky" : "⌖ roughly overhead";
    if (overhead) { var z = zenith(); flyTo(z[0], z[1]); } else flyTo(98, -4);
  });

  // Arrow keys pan when the map has focus.
  function solveDefault() {
    var mobile = W < 760;
    solveAt(mobile ? W - 80 : W * 0.72, mobile ? H - 122 : H * 0.45);
  }
  var sbtn = document.getElementById("sky-solve");
  if (sbtn) sbtn.addEventListener("click", solveDefault);

  canvas.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); solveDefault(); return; }
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
    if (reduced || t - hudT > 0.25) { updateHud(); hudT = t; }
  }
  // The unattended drift is slow, so it runs at about 30 fps; dragging and flights get every frame.
  var lastDraw = 0;
  function loop(now) {
    if (!running) return;
    if (dragging || goal || now - lastDraw > 30) {
      lastDraw = now;
      frame(now);
    }
    requestAnimationFrame(loop);
  }
  function start() {
    if (running || reduced || !visible || document.hidden) return;
    running = true; last = 0;
    requestAnimationFrame(loop);
  }
  function stop() { running = false; }

  // Motion stops if the visitor paused or the system asks for reduced motion; both can change live.
  // The pause button is offered only while the preference allows motion, and keeps its own state.
  var pbtn = document.getElementById("sky-pause"), userPaused = false;
  function applyMotion() {
    var was = reduced;
    reduced = prefersReduced || userPaused;
    if (pbtn) {
      pbtn.hidden = prefersReduced;
      pbtn.setAttribute("aria-pressed", userPaused);
      pbtn.textContent = userPaused ? "▶ resume sky" : "❚❚ pause sky";
    }
    if (reduced === was) return;
    if (reduced) {
      stop();
      view.scale = baseScale;
      if (solve && !pendingUserSolve()) solve = null;
      frame(performance.now());
    } else {
      start();
    }
  }
  if (pbtn) pbtn.addEventListener("click", function () { userPaused = !userPaused; applyMotion(); });
  var motionQuery = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)");
  if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener("change", function (e) {
    prefersReduced = e.matches;
    applyMotion();
  });

  // The sky controls only make sense once this script runs.
  ["sky-solve", "sky-zenith", "sky-open"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.hidden = false;
  });
  if (pbtn) pbtn.hidden = prefersReduced;
  document.querySelectorAll(".hero .hint").forEach(function (el) { el.hidden = false; });

  resize();
  frame(performance.now());
  // A pending visitor solve is anchored to the sky, so it survives a resize.
  window.addEventListener("resize", function () { resize(); if (!pendingUserSolve()) solve = null; if (!running) frame(performance.now()); });
  document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      visible ? start() : stop();
    }).observe(canvas);
  }
  start();
})();
