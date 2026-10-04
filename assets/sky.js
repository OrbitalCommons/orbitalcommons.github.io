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
  var MONO = getComputedStyle(document.body).getPropertyValue("--mono");

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

  // Milky Way: soft blobs along the galactic equator, brightest toward the galactic centre.
  var GC = radec(266.405, -28.936), GN = radec(192.859, 27.128);
  var GB = [GN[1] * GC[2] - GN[2] * GC[1], GN[2] * GC[0] - GN[0] * GC[2], GN[0] * GC[1] - GN[1] * GC[0]];
  var band = [];
  for (var l = 0; l < 360; l += 5) {
    var cl = Math.cos(l * D2R), sl = Math.sin(l * D2R), wob = 0.06 * Math.sin(l * D2R * 3);
    band.push([cl * GC[0] + sl * GB[0] + wob * GN[0], cl * GC[1] + sl * GB[1] + wob * GN[1], cl * GC[2] + sl * GB[2] + wob * GN[2],
      0.35 + 0.65 * Math.pow((1 + cl) / 2, 2.2)]);
  }
  var blob = document.createElement("canvas");
  blob.width = blob.height = 128;
  (function () {
    var g = blob.getContext("2d"), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(150,170,255,0.5)");
    grd.addColorStop(0.5, "rgba(120,130,230,0.18)");
    grd.addColorStop(1, "rgba(100,110,220,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  })();
  function radec(ra, dec) {
    ra *= D2R; dec *= D2R;
    return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  }

  // Planets for the current date, J2000 frame to match the catalogue.
  // JPL "Approximate Positions of the Planets" (Standish), valid 1800-2050.
  var EL = {
    Mercury: [0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.25032350, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081],
    Venus: [0.72333566, 0.00000390, 0.00677672, -0.00004107, 3.39467605, -0.00078890, 181.97909950, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418],
    Earth: [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0],
    Mars: [1.52371034, 0.00001847, 0.09339410, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343],
    Jupiter: [5.20288700, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106],
    Saturn: [9.53667594, -0.00125060, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794],
    Uranus: [19.18916464, -0.00196176, 0.04725744, -0.00004397, 0.77263783, -0.00242939, 313.23810451, 428.48202785, 170.95427630, 0.40805281, 74.01692503, 0.04240589],
    Neptune: [30.06992276, 0.00026291, 0.00859048, 0.00005105, 1.77004347, 0.00035372, -55.12002969, 218.45945325, 44.96476227, -0.32241464, 131.78422574, -0.00508664]
  };
  function helio(e, T) {
    var R = Math.PI / 180, a = e[0] + e[1] * T, ec = e[2] + e[3] * T, I = (e[4] + e[5] * T) * R,
      L = e[6] + e[7] * T, w = e[8] + e[9] * T, O = e[10] + e[11] * T;
    var M = ((L - w) % 360 + 540) % 360 - 180, E = M * R;
    for (var k = 0; k < 8; k++) E -= (E - ec * Math.sin(E) - M * R) / (1 - ec * Math.cos(E));
    var xp = a * (Math.cos(E) - ec), yp = a * Math.sqrt(1 - ec * ec) * Math.sin(E);
    var om = (w - O) * R, Or = O * R, co = Math.cos(om), so = Math.sin(om), cO = Math.cos(Or), sO = Math.sin(Or), cI = Math.cos(I), sI = Math.sin(I);
    return [(co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
      (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
      so * sI * xp + co * sI * yp];
  }
  function planetsRaDec(ms) {
    var T = (ms / 86400000 + 2440587.5 - 2451545) / 36525, eps = 23.43928 * Math.PI / 180;
    var earth = helio(EL.Earth, T), out = {};
    Object.keys(EL).forEach(function (k) {
      if (k === "Earth") return;
      var p = helio(EL[k], T), x = p[0] - earth[0], y = p[1] - earth[1], z = p[2] - earth[2];
      var ye = y * Math.cos(eps) - z * Math.sin(eps), ze = y * Math.sin(eps) + z * Math.cos(eps);
      var ra = Math.atan2(ye, x) * 180 / Math.PI;
      out[k] = [(ra + 360) % 360, Math.atan2(ze, Math.hypot(x, ye)) * 180 / Math.PI];
    });
    return out;
  }
  var PCOL = { Mercury: "#c9c3b8", Venus: "#fff3d6", Mars: "#ff9a6b", Jupiter: "#f3d9b0", Saturn: "#e8d18f", Uranus: "#a9e7ef", Neptune: "#8fa8ff" };
  var planets = (function () {
    var pos = planetsRaDec(Date.now());
    return Object.keys(pos).map(function (k) {
      var v = radec(pos[k][0], pos[k][1]);
      return { name: k, x: v[0], y: v[1], z: v[2] };
    });
  })();

  // Camera state: centre (ra0, dec0) in degrees, horizontal field of view.
  var cam = { ra: 98, dec: -4, vra: 0, vdec: 0 };
  var W = 0, H = 0, dpr = 1, scale = 1, baseScale = 1, intro = -1, cx = 0, cy = 0;
  var basis = { e: [0, 0, 0], nn: [0, 0, 0], f: [0, 0, 0] };

  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    var fov = (W < 700 ? 80 : 112) * D2R;
    baseScale = (W / 2) / (2 * Math.tan(fov / 4));
    scale = baseScale;
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
  function newSolve(t, at) {
    var mobile = W < 760;
    var size = mobile ? 116 : 190;
    var sx = at ? at[0] : mobile ? W - size / 2 - 22 - Math.random() * 20 : W * (0.62 + Math.random() * 0.2);
    var sy = at ? at[1] : mobile ? H - size / 2 - 64 : H * (0.3 + Math.random() * 0.35);
    solve = { t0: t, v: unproject(sx, sy), size: size, stars: null };
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
    // Opening shot: ease in from a wider field.
    if (!reduced) {
      if (intro < 0) intro = t;
      var ip = Math.min(1, (t - intro) / 3.2);
      scale = baseScale * (0.62 + 0.38 * (1 - Math.pow(1 - ip, 3)));
    }
    setBasis();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < n; i++) {
      if (project(X[i], Y[i], Z[i], pt) && pt[0] > -40 && pt[0] < W + 40 && pt[1] > -40 && pt[1] < H + 40) {
        SX[i] = pt[0]; SY[i] = pt[1]; VIS[i] = 1;
      } else VIS[i] = 0;
    }

    var bs = scale * 0.62;
    for (var b0 = 0; b0 < band.length; b0++) {
      var B = band[b0];
      if (!project(B[0], B[1], B[2], pt)) continue;
      ctx.globalAlpha = 0.16 * B[3];
      ctx.drawImage(blob, pt[0] - bs, pt[1] - bs * 0.7, bs * 2, bs * 1.4);
    }
    ctx.globalAlpha = 1;

    // Constellation figures.
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(124,196,255,0.2)";
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
      var alpha = Math.max(0.24, Math.min(1, 1.4 - m * 0.16)) * tw;
      var r = Math.max(0.65, 3.3 - m * 0.48);
      if (m < 3.2) {
        var gs = r * (m < 1 ? 9 : 7);
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprites[COL[k]], SX[k] - gs / 2, SY[k] - gs / 2, gs, gs);
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = COLORS[COL[k]];
      var rr = r * 0.62;
      if (rr < 0.9) {
        ctx.fillRect(SX[k] - rr, SY[k] - rr, rr * 2, rr * 2);
      } else {
        ctx.beginPath();
        ctx.arc(SX[k], SY[k], rr, 0, 6.283);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Planets where they are tonight.
    ctx.font = "600 10.5px " + MONO;
    for (var pi = 0; pi < planets.length; pi++) {
      var P = planets[pi];
      if (!project(P.x, P.y, P.z, pt) || pt[0] < -20 || pt[0] > W + 20 || pt[1] < 60 || pt[1] > H + 20) continue;
      var pr = P.name === "Uranus" || P.name === "Neptune" ? 2 : 3.2;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(sprites[3], pt[0] - pr * 4, pt[1] - pr * 4, pr * 8, pr * 8);
      ctx.fillStyle = PCOL[P.name];
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], pr, 0, 6.283);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,196,119,0.55)";
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], pr + 4, 0, 6.283);
      ctx.stroke();
      var pa = W < 760 || pt[0] > W * 0.42 ? 0.9 : 0.35;
      ctx.globalAlpha = pa;
      ctx.fillStyle = "#ffc477";
      ctx.fillText(P.name, pt[0] + pr + 8, pt[1] - pr - 4);
    }
    ctx.globalAlpha = 1;

    // Labels for named bright stars.
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
    // Solution readout.
    if (e > 4.4) {
      var rd = toRaDec(v), fov = 2 * half / scale / D2R;
      var lines = [
        found.length >= 4 ? "SOLVED" : "NO MATCH",
        "RA  " + fmtRa(rd[0]),
        "DEC " + fmtDec(rd[1]),
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
  // Inspect the nearest reasonably bright star under the mouse.
  function drawHover() {
    if (!hover || dragging) return;
    var best = -1, bd = 22 * 22;
    for (var i = 0; i < n && MAG[i] < 5; i++) {
      if (!VIS[i]) continue;
      var dx = SX[i] - hover[0], dy = SY[i] - hover[1], d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return;
    var x = SX[best], y = SY[best], name = names[best];
    var info = "V " + MAG[best].toFixed(1) + "  B\u2212V " + (raw[4 * best + 3] / 100).toFixed(2);
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
  canvas.addEventListener("pointerleave", function () { hover = null; if (reduced) frame(performance.now()); });

  function corner(x, y, dx, dy) { ctx.moveTo(x + dx, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy); }

  function updateHud() {
    if (!hud) return;
    hud.textContent = (overhead ? "\u2248 ZENITH  " : "") + "RA " + fmtRa(((cam.ra % 360) + 360) % 360).slice(0, 7) + "  DEC " + fmtDec(cam.dec) +
      (W < 560 ? "" : "  ·  " + n.toLocaleString() + " Hipparcos stars");
  }

  // Interaction: drag to look around, with inertia.
  var dragging = false, lx = 0, ly = 0;
  var downX = 0, downY = 0;
  canvas.addEventListener("pointerdown", function (ev) {
    dragging = true; lx = downX = ev.clientX; ly = downY = ev.clientY;
    canvas.setPointerCapture(ev.pointerId);
  });
  var hover = null;
  canvas.addEventListener("pointermove", function (ev) {
    if (!dragging) {
      var r = canvas.getBoundingClientRect();
      hover = ev.pointerType === "mouse" ? [ev.clientX - r.left, ev.clientY - r.top] : null;
      if (reduced) frame(performance.now());
      return;
    }
    var k = 1 / scale / D2R * 0.55, dx = ev.clientX - lx, dy = ev.clientY - ly;
    lx = ev.clientX; ly = ev.clientY;
    cam.vra = dx * k; cam.vdec = dy * k;
    cam.ra += cam.vra; cam.dec = Math.max(-80, Math.min(80, cam.dec + cam.vdec));
    if (reduced) frame(performance.now());
  });
  function endDrag() { dragging = false; }
  // A click without a drag solves the field under the pointer.
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
    var now = Date.now(), jd = now / 86400000 + 2440587.5;
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
    zbtn.textContent = overhead ? "\u21ba tour the sky" : "\u2316 overhead now";
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
