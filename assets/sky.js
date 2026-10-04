// Real-sky hero: Hipparcos stars and Stellarium constellation lines under a stereographic camera,
// with a looping blind plate-solve visualisation. Vanilla JS, no dependencies.
(function () {
  "use strict";
  var canvas = document.getElementById("sky");
  var data = window.OC_SKY;
  if (!canvas || !data || !canvas.getContext) return;

  var ctx = canvas.getContext("2d");
  var hud = document.getElementById("sky-hud");
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var D2R = Math.PI / 180;

  // Unpack catalogue into unit vectors.
  var raw = data.stars, n = raw.length / 4;
  var X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  var MAG = new Float32Array(n), COL = new Uint8Array(n), PH = new Float32Array(n);
  var SX = new Float32Array(n), SY = new Float32Array(n), VIS = new Uint8Array(n);
  for (var i = 0; i < n; i++) {
    var ra = raw[4 * i] / 20 * D2R, dec = raw[4 * i + 1] / 20 * D2R;
    X[i] = Math.cos(dec) * Math.cos(ra);
    Y[i] = Math.cos(dec) * Math.sin(ra);
    Z[i] = Math.sin(dec);
    MAG[i] = raw[4 * i + 2] / 10;
    var bv = raw[4 * i + 3] / 100;
    COL[i] = bv < -0.1 ? 0 : bv < 0.15 ? 1 : bv < 0.45 ? 2 : bv < 0.75 ? 3 : bv < 1.1 ? 4 : 5;
    PH[i] = Math.random() * 6.283;
  }
  var COLORS = ["#a8bfff", "#d0dcff", "#f6f6ff", "#fff1df", "#ffd9a8", "#ffbf80"];
  var lineSets = Object.keys(data.lines).map(function (k) { return data.lines[k]; });
  var names = data.names;

  // Glow sprites, one per colour class.
  var SPR = 64, sprites = COLORS.map(function (c) {
    var s = document.createElement("canvas");
    s.width = s.height = SPR;
    var g = s.getContext("2d"), grd = g.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2);
    grd.addColorStop(0, "#ffffff");
    grd.addColorStop(0.12, c);
    grd.addColorStop(0.3, hexA(c, 0.35));
    grd.addColorStop(1, hexA(c, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, SPR, SPR);
    return s;
  });
  function hexA(h, a) {
    var v = parseInt(h.slice(1), 16);
    return "rgba(" + (v >> 16) + "," + (v >> 8 & 255) + "," + (v & 255) + "," + a + ")";
  }

  // Camera state: centre (ra0, dec0) in degrees, horizontal field of view.
  var cam = { ra: 70, dec: 4, vra: 0, vdec: 0 };
  var W = 0, H = 0, dpr = 1, scale = 1, cx = 0, cy = 0;
  var basis = { e: [0, 0, 0], nn: [0, 0, 0], f: [0, 0, 0] };

  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    var fov = (W < 700 ? 80 : 112) * D2R;
    scale = (W / 2) / (2 * Math.tan(fov / 4));
    cx = W / 2; cy = H / 2;
  }

  function setBasis() {
    var a = cam.ra * D2R, d = cam.dec * D2R, ca = Math.cos(a), sa = Math.sin(a), cd = Math.cos(d), sd = Math.sin(d);
    basis.f = [cd * ca, cd * sa, sd];
    basis.e = [-sa, ca, 0];
    basis.nn = [-sd * ca, -sd * sa, cd];
  }

  // Sky unit vector -> screen. East is to the left when looking up at the sky.
  function project(x, y, z, out) {
    var f = basis.f, e = basis.e, nn = basis.nn;
    var zc = x * f[0] + y * f[1] + z * f[2];
    if (zc < -0.15) return false;
    var k = 2 / (1 + zc) * scale;
    out[0] = cx - k * (x * e[0] + y * e[1]);
    out[1] = cy - k * (x * nn[0] + y * nn[1] + z * nn[2]);
    return true;
  }

  function unproject(sx, sy) {
    var px = (cx - sx) / scale, py = (cy - sy) / scale, r2 = px * px + py * py;
    var zc = (4 - r2) / (4 + r2), k = (1 + zc) / 2, xe = px * k, yn = py * k;
    var f = basis.f, e = basis.e, nn = basis.nn;
    return [xe * e[0] + yn * nn[0] + zc * f[0], xe * e[1] + yn * nn[1] + zc * f[1], yn * nn[2] + zc * f[2]];
  }

  function toRaDec(v) {
    var ra = Math.atan2(v[1], v[0]) / D2R;
    if (ra < 0) ra += 360;
    return [ra, Math.asin(Math.max(-1, Math.min(1, v[2]))) / D2R];
  }
  function fmtRa(ra) {
    var h = ra / 15, hh = Math.floor(h), m = (h - hh) * 60, mm = Math.floor(m), ss = Math.floor((m - mm) * 60);
    return pad(hh) + "h " + pad(mm) + "m " + pad(ss) + "s";
  }
  function fmtDec(dec) {
    var s = dec < 0 ? "−" : "+", a = Math.abs(dec), d = Math.floor(a), m = Math.floor((a - d) * 60);
    return s + pad(d) + "° " + pad(m) + "′";
  }
  function pad(v) { return v < 10 ? "0" + v : "" + v; }

  // Plate-solve demo: a field locks on, detects sources, matches a quad, reports the solution.
  var solve = null, CYCLE = 9.5;
  function newSolve(t) {
    var mobile = W < 760;
    var sx = mobile ? W * (0.3 + Math.random() * 0.4) : W * (0.62 + Math.random() * 0.2);
    var sy = mobile ? H * 0.8 : H * (0.3 + Math.random() * 0.35);
    solve = { t0: t, v: unproject(sx, sy), size: mobile ? 130 : 190, stars: null };
  }

  function solveStars(px, py, half) {
    var found = [];
    for (var i = 0; i < n && found.length < 14; i++) {
      if (!VIS[i] || MAG[i] > 5.4) continue;
      if (Math.abs(SX[i] - px) < half - 6 && Math.abs(SY[i] - py) < half - 6) found.push(i);
    }
    return found;
  }

  var pt = [0, 0], pt2 = [0, 0];
  function draw(t) {
    setBasis();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < n; i++) {
      if (project(X[i], Y[i], Z[i], pt) && pt[0] > -40 && pt[0] < W + 40 && pt[1] > -40 && pt[1] < H + 40) {
        SX[i] = pt[0]; SY[i] = pt[1]; VIS[i] = 1;
      } else VIS[i] = 0;
    }

    // Constellation figures.
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(124,196,255,0.17)";
    ctx.beginPath();
    for (var s = 0; s < lineSets.length; s++) {
      var L = lineSets[s];
      for (var j = 0; j < L.length; j += 2) {
        var a = L[j], b = L[j + 1];
        if (!VIS[a] || !VIS[b]) continue;
        var dx = SX[b] - SX[a], dy = SY[b] - SY[a], len = Math.sqrt(dx * dx + dy * dy);
        if (len < 9 || len > W * 0.6) continue;
        var g = 5 / len;
        ctx.moveTo(SX[a] + dx * g, SY[a] + dy * g);
        ctx.lineTo(SX[b] - dx * g, SY[b] - dy * g);
      }
    }
    ctx.stroke();

    // Stars, faintest first so bright glows sit on top.
    for (var k = n - 1; k >= 0; k--) {
      if (!VIS[k]) continue;
      var m = MAG[k];
      var tw = m < 3.5 && !reduced ? 0.82 + 0.18 * Math.sin(t * (1.3 + (k % 7) * 0.31) + PH[k]) : 1;
      var alpha = Math.max(0.16, Math.min(1, 1.2 - m * 0.17)) * tw;
      var r = Math.max(0.55, 2.9 - m * 0.45);
      if (m < 2.6) {
        var gs = r * 7.5;
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprites[COL[k]], SX[k] - gs / 2, SY[k] - gs / 2, gs, gs);
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = COLORS[COL[k]];
      ctx.beginPath();
      ctx.arc(SX[k], SY[k], r * 0.62, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Labels for named bright stars.
    ctx.font = "500 10.5px " + getComputedStyle(document.body).getPropertyValue("--mono");
    ctx.fillStyle = "rgba(180,189,210,0.55)";
    for (var key in names) {
      var idx = +key;
      if (VIS[idx] && SX[idx] > 10 && SX[idx] < W - 90) ctx.fillText(names[key], SX[idx] + 9, SY[idx] + 3.5);
    }

    if (!reduced) drawSolve(t);
  }

  function drawSolve(t) {
    if (!solve || t - solve.t0 > CYCLE) newSolve(t);
    var e = t - solve.t0, v = solve.v;
    if (!project(v[0], v[1], v[2], pt2)) { solve = null; return; }
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
      var q = Math.min(1, (e - 3.2) / 0.9), order = [0, 1, 2, 3, 0, 2, 1, 3];
      ctx.strokeStyle = "rgba(255,196,119," + (0.9 * A) + ")";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      var segs = Math.floor(q * 4 + 0.999);
      for (var s = 0; s < segs; s++) {
        var a = found[order[2 * s]], b = found[order[2 * s + 1]];
        ctx.moveTo(SX[a], SY[a]);
        ctx.lineTo(SX[b], SY[b]);
      }
      ctx.stroke();
    }
    // Solution readout.
    if (e > 4.4) {
      var rd = toRaDec(v), fov = 2 * half / scale / D2R * 2;
      var lines = [
        found.length >= 4 ? "SOLVED" : "NO MATCH",
        "RA  " + fmtRa(rd[0]),
        "DEC " + fmtDec(rd[1]),
        "FOV " + fov.toFixed(1) + "°  ·  " + found.length + " src"
      ];
      var tx = px + h + 14, ty = py - h + 4;
      if (tx + 170 > W) tx = px - h - 184;
      var typed = Math.min(1, (e - 4.4) / 0.9);
      ctx.font = "600 11px " + getComputedStyle(document.body).getPropertyValue("--mono");
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

  function updateHud() {
    if (!hud) return;
    hud.textContent = "RA " + fmtRa(((cam.ra % 360) + 360) % 360).slice(0, 7) + "  DEC " + fmtDec(cam.dec) +
      "  ·  " + n.toLocaleString() + " Hipparcos stars";
  }

  // Interaction: drag to look around, with inertia.
  var dragging = false, lx = 0, ly = 0;
  canvas.addEventListener("pointerdown", function (ev) {
    dragging = true; lx = ev.clientX; ly = ev.clientY;
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener("pointermove", function (ev) {
    if (!dragging) return;
    var k = 1 / scale / D2R * 0.55, dx = ev.clientX - lx, dy = ev.clientY - ly;
    lx = ev.clientX; ly = ev.clientY;
    cam.vra = dx * k; cam.vdec = dy * k;
    cam.ra += cam.vra; cam.dec = Math.max(-80, Math.min(80, cam.dec + cam.vdec));
    if (reduced) frame(performance.now());
  });
  function endDrag() { dragging = false; }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  var running = false, visible = true, last = 0, hudT = 0;
  function frame(now) {
    var t = now / 1000, dt = Math.min(0.05, t - (last || t));
    last = t;
    if (!dragging && !reduced) {
      cam.vra *= 0.94; cam.vdec *= 0.94;
      cam.ra += cam.vra + dt * 1.1;
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
