// Real-sky hero: Hipparcos stars and Stellarium constellation lines under a stereographic camera,
// with a looping illustration of how a blind plate solver matches star patterns. Requires sky-core.js.
(function () {
  "use strict";
  var canvas = document.getElementById("sky");
  if (!canvas || !window.OC_SKY || !window.OCSky || !canvas.getContext) return;

  var S = window.OCSky, D2R = S.D2R, QUAD = S.QUAD;
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
  var solve = null, CYCLE = 10.5;
  // Top of the hero's control row in canvas coordinates; on phones the field sits just above it.
  function footTop() {
    var foot = document.querySelector(".hero-foot");
    return foot ? foot.getBoundingClientRect().top - canvas.getBoundingClientRect().top : H - 64;
  }
  function newSolve(t, at) {
    var mobile = W < 760;
    var size = mobile ? 116 : 190;
    var sx = at ? at[0] : mobile ? W - size / 2 - 22 - Math.random() * 20 : W * (0.56 + Math.random() * 0.1);
    var sy = at ? at[1] : mobile ? footTop() - size / 2 - 14 : H * (0.3 + Math.random() * 0.35);
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
    // Phones show the sky at a smaller scale, so they solve the smallest frame to keep the quad on screen.
    var truth = S.toRaDec(sv.v), fov = W < 760 ? 15 : Math.max(15, Math.min(40, sv.size / view.scale / D2R));
    var sources = S.tanField(truth[0], truth[1], fov, FRAME, FRAME, 6.3).map(function (p) { return { x: p.x, y: p.y, flux: p.flux }; });
    sv.real = { status: "pending", fov: fov, n: sources.length };
    setBusy(true);
    announce("Solving a synthetic " + fov.toFixed(0) + " degree frame with " + sources.length + " catalogue stars.");
    loadSolver().then(function () {
      return window.OCZodiacal.solve(sources, FRAME, FRAME, { timeoutMs: 8000 });
    }).then(function (r) {
      setBusy(false);
      if (solve !== sv) { announce("The view changed before the solve finished, so its result was set aside."); return; }
      // Resume from the panel so the real match plays in: rows, match box, then the result.
      if (performance.now() / 1000 - sv.t0 > T_PANEL) sv.t0 = performance.now() / 1000 - T_PANEL - 0.3;
      if (!r) {
        sv.real.status = "none";
        announce("No solution for this field.");
      } else {
        var a = S.radec(truth[0], truth[1]), b = S.radec(r.ra, r.dec);
        sv.real = { status: "done", fov: fov, n: sources.length, r: r,
          err: Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) / D2R * 60 };
        announce("Solved in " + Math.round(r.ms) + " milliseconds: right ascension " + S.fmtRa(r.ra) + ", declination " +
          S.fmtDec(r.dec) + ", " + r.matched + " stars matched, " +
          (sv.real.err * 60 < 0.1 ? "under 0.1" : (sv.real.err * 60).toFixed(1)) + " arcseconds from the true centre of the synthetic frame." +
          matchSummary(r.match));
      }
      if (!running) frame(performance.now());
    }, function () {
      setBusy(false);
      if (solve !== sv) { announce("The view changed before the solve finished, so its result was set aside."); return; }
      if (performance.now() / 1000 - sv.t0 > T_PANEL) sv.t0 = performance.now() / 1000 - T_DONE;
      sv.real.status = "fail";
      announce("The solver could not load.");
      if (!running) frame(performance.now());
    });
  }
  // The overlay's content in words: the winning index entry and its code.
  function matchSummary(match) {
    if (!match || !match.code) return "";
    var row = (match.rows || []).filter(function (r) { return r.matched; })[0];
    var code = match.code.map(function (v) { return v.toFixed(2); }).join(", ");
    return " Matched index entry" + (row ? " " + row.id : "") + " with code " + code +
      "; the index rows shown are a sample around it, not the search order.";
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
    // End the opening zoom first: a field picked mid-zoom drifts off screen as the view closes in.
    if (!reduced) { intro = performance.now() / 1000 - 3.4; view.scale = baseScale; }
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

  // The quad and index overlay follow the zodiacal Manim animation: A/B/C/D in fixed colours, the
  // AB line and its diameter circle, then a "query code" and index rows scrolling in until the
  // matching entry is boxed. Times are seconds into the cycle.
  var T_QUAD = 2.6, T_PANEL = 3.7, T_ROWS = 4.1, ROW_DT = 0.28, T_DONE = 7.1, END = 9;

  // Pick the brightest detections that form a valid quad, as the solver prefers bright stars.
  function pickQuad(found) {
    var pool = found.slice(0, 8), best = null;
    for (var a = 0; a < pool.length && !best; a++)
      for (var b = a + 1; b < pool.length && !best; b++)
        for (var c = b + 1; c < pool.length && !best; c++)
          for (var d = c + 1; d < pool.length && !best; d++) {
            var ids = [pool[a], pool[b], pool[c], pool[d]];
            var q = S.quadCode(ids.map(function (i) { return [SX[i], SY[i]]; }));
            if (q.valid) best = { stars: q.order.map(function (k) { return ids[k]; }), code: q.code };
          }
    return best;
  }
  // Illustration rows: codes of other real quads of catalogue stars (each a star and its three
  // nearest visible neighbours), ending with the field's own quad as the match.
  function illustrationRows(quad) {
    var rows = [], seen = {};
    for (var i = 0; i < FAINT_LIMIT && rows.length < 8; i += 3) {
      if (!VIS[i] || seen[i]) continue;
      var near = [];
      for (var j = 0; j < FAINT_LIMIT; j++) {
        if (j === i || !VIS[j]) continue;
        var d = Math.pow(SX[j] - SX[i], 2) + Math.pow(SY[j] - SY[i], 2);
        near.push([d, j]);
      }
      near.sort(function (p, q) { return p[0] - q[0]; });
      var ids = [i].concat(near.slice(0, 3).map(function (p) { return p[1]; }));
      if (ids.length < 4) continue;
      var q = S.quadCode(ids.map(function (k) { return [SX[k], SY[k]]; }));
      if (!q.valid) continue;
      seen[i] = true;
      rows.push({ id: 1000 + i * 37 % 89000, code: q.code, matched: false });
    }
    rows.push({ id: 1000 + quad.stars[0] * 37 % 89000, code: quad.code, matched: true });
    return rows;
  }
  var FAINT_LIMIT = 400;
  // The solver's sample is centred on the winning entry; stream the others in their order and the
  // winner last, so the scrolling list ends on the match.
  function winnerLast(rows) {
    return rows.filter(function (r) { return !r.matched; }).concat(rows.filter(function (r) { return r.matched; }));
  }

  function drawSolve(t) {
    // With reduced motion there is no loop: only a solve the visitor asked for, shown in its final state.
    if (reduced) {
      if (!solve) return;
    } else {
      if (t - intro < 3.4 && !solve) return;
      if (!solve || (t - solve.t0 > CYCLE && !pendingUserSolve())) newSolve(t);
    }
    // A pending visitor solve holds before the match until the answer arrives.
    var e = reduced ? END : pendingUserSolve() ? Math.min(t - solve.t0, T_PANEL + 0.35) : t - solve.t0, v = solve.v;
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
    // Source detection, in neutral grey; the quad's roles bring the colour.
    for (var i = 0; i < found.length; i++) {
      var appear = 1.2 + i * 0.1;
      if (e < appear) break;
      var p = Math.min(1, (e - appear) / 0.35), si = found[i];
      ctx.globalAlpha = 0.7 * A;
      ctx.strokeStyle = QUAD.label;
      ctx.beginPath();
      ctx.arc(SX[si], SY[si], 4 + 10 * (1 - p) + 2, 0, 6.283);
      ctx.stroke();
    }

    // The quad: the real winning quad once a visitor solve returns its match, else the brightest
    // valid quad among the detections.
    var real = solve.real, match = real && real.status === "done" && real.r.match;
    if (!solve.real && !solve.quad && found.length >= 4 && e > T_QUAD - 0.2) {
      var picked = pickQuad(found);
      solve.quad = picked ? { pts: function () { return picked.stars.map(function (k) { return [SX[k], SY[k]]; }); },
        code: picked.code, rows: illustrationRows(picked), real: false } : null;
    }
    if (match && !(solve.quad && solve.quad.real)) {
      solve.quad = { pts: function () {
          return match.stars.map(function (s) {
            var u = S.radec(s.ra, s.dec), out = [0, 0];
            return view.project(u[0], u[1], u[2], out) ? out : [NaN, NaN];
          });
        }, code: match.code, rows: winnerLast(match.rows || []), real: true };
    }
    var quad = solve.quad;
    if (quad && e > T_QUAD) S.drawQuad(ctx, quad.pts(), Math.min(1, (e - T_QUAD) / 1.0), A, "700 10px " + MONO);

    if (e > T_PANEL) drawPanel(quad, e, A, px, py, h, v, found.length, half);
    ctx.globalAlpha = 1;
  }

  // Query code, index rows scrolling in (new rows enter at the top), the match boxed in green,
  // then the solution. Placed beside the field, inside the canvas.
  function drawPanel(quad, e, A, px, py, h, v, nsrc, half) {
    var mobile = W < 760, real = solve.real, done = real && real.status === "done";
    // A visitor solve shows no code or rows until the solver answers, and none if it fails.
    var waiting = real && !done;
    if (waiting) quad = null;
    var lh = 15, visible = mobile ? 3 : 7, showId = !mobile;
    ctx.font = "600 11px " + MONO;
    var codeW = ctx.measureText("(+0.00, +0.00, +0.00, +0.00)").width;
    var idW = showId ? ctx.measureText("#00000  ").width : 0;
    var pw = Math.max(codeW + idW, 170) + 20;
    var rows = quad ? quad.rows : [];
    var resultLines = panelResult(real, quad, v, nsrc, half).slice(0, mobile ? 2 : 5);
    var ph = lh * (3 + visible + resultLines.length) + 26;
    // Choose a side once per field so the panel doesn't jump as the sky drifts.
    if (!solve.side) solve.side = px + h + 16 + pw <= W - 8 ? 1 : -1;
    var tx = solve.side > 0 ? px + h + 16 : px - h - pw - 10;
    tx = Math.max(8, Math.min(W - pw - 8, tx));
    var bottom = (mobile ? footTop() : H) - 8;
    var ty = Math.max(66, Math.min(bottom - ph, py - h));
    // Never cover the headline: if the left side would, sit below (or above) the field instead.
    if (solve.side < 0 && textBox && tx < textBox[2] && ty < textBox[3] && ty + ph > textBox[1]) {
      tx = Math.max(8, Math.min(W - pw - 8, Math.max(textBox[2] + 8, px - pw / 2)));
      ty = py + h + 12 + ph <= bottom ? py + h + 12 : Math.max(66, py - h - ph - 12);
    }
    var fade = Math.min(1, (e - T_PANEL) / 0.4) * A;
    ctx.globalAlpha = 0.82 * fade;
    ctx.fillStyle = "#05070d";
    ctx.fillRect(tx, ty, pw, ph);
    ctx.strokeStyle = "rgba(140,170,230,0.28)";
    ctx.lineWidth = 1;
    ctx.strokeRect(tx + 0.5, ty + 0.5, pw - 1, ph - 1);

    var x = tx + 10, y = ty + 16;
    ctx.globalAlpha = fade;
    ctx.fillStyle = QUAD.label;
    ctx.font = "600 10px " + MONO;
    ctx.fillText(real && real.status === "pending" ? "SOLVING…" : quad && quad.real ? "MATCHED INDEX CODE" : "QUERY CODE", x, y);
    ctx.font = "600 11px " + MONO;
    var codeY = y + lh;
    if (quad) S.drawCode(ctx, quad.code, x, codeY, fade);
    else if (real && real.status === "pending") {
      ctx.fillStyle = QUAD.label;
      ctx.fillText("zodiacal · WebAssembly", x, codeY);
    }
    y = codeY + lh + 4;
    ctx.globalAlpha = fade;
    ctx.fillStyle = QUAD.label;
    ctx.font = "600 10px " + MONO;
    ctx.fillText(quad && quad.real ? "INDEX SAMPLE · NOT SEARCH ORDER" : "INDEX · ILLUSTRATION", x, y);
    y += 6;

    // Rows arrive one by one; the newest sits at the top, older ones move down and fade out.
    ctx.font = "600 11px " + MONO;
    // Pace the rows so the whole sample, ending with the match, has arrived before the result.
    var dt = Math.min(ROW_DT, (T_DONE - 0.6 - T_ROWS) / Math.max(1, rows.length));
    var arrived = Math.max(0, Math.min(rows.length, Math.floor((e - T_ROWS) / dt) + 1));
    var slide = Math.min(1, ((e - T_ROWS) % dt) / dt * 2.5);
    if (arrived === rows.length) slide = 1;
    var matchedY = null;
    for (var k = 0; k < Math.min(arrived, visible + 1); k++) {
      var row = rows[arrived - 1 - k];
      var slot = k - 1 + slide;
      var ry = y + lh * (slot + 1);
      if (slot > visible - 0.5) continue;
      var rowAlpha = fade * Math.max(0, Math.min(1, slot + 1)) * (slot > visible - 1.5 ? 0.5 : 1);
      if (showId) {
        ctx.globalAlpha = rowAlpha;
        ctx.fillStyle = QUAD.A;
        ctx.fillText("#" + String(row.id).slice(-5), x, ry);
      }
      S.drawCode(ctx, row.code, x + idW, ry, rowAlpha);
      if (row.matched && arrived === rows.length) matchedY = ry;
    }
    y += lh * (visible + 1);

    // The match: a green box on its row and a dashed green line from the query code.
    if (matchedY !== null && e > T_DONE - 0.4) {
      var m = Math.min(1, (e - (T_DONE - 0.4)) / 0.4);
      ctx.globalAlpha = fade * m;
      ctx.strokeStyle = QUAD.match;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 4, matchedY - 11, idW + codeW + 8, 15);
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(tx + pw - 8, codeY - 4);
      ctx.lineTo(tx + pw - 8, matchedY - 4);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (e > T_DONE || (real && real.status !== "pending" && !done)) {
      var typed = Math.min(1, (e - T_DONE) / 0.8);
      if (real && !done) typed = 1;
      for (var l = 0; l < resultLines.length; l++) {
        var line = resultLines[l], shown = Math.floor(line.text.length * Math.min(1, typed * 1.8 - l * 0.2));
        if (shown <= 0) continue;
        ctx.globalAlpha = fade;
        ctx.fillStyle = line.color;
        ctx.fillText(line.text.slice(0, shown), x, y + lh * l);
      }
    }
    ctx.globalAlpha = 1;
  }

  function panelResult(real, quad, v, nsrc, half) {
    var white = "rgba(232,236,246,0.85)";
    if (real && real.status === "done") {
      var r = real.r, err = real.err * 60;
      return [
        { text: "SOLVED  " + (r.ms < 10 ? r.ms.toFixed(1) : Math.round(r.ms)) + " ms", color: QUAD.match },
        { text: "RA  " + S.fmtRa(r.ra), color: white },
        { text: "DEC " + S.fmtDec(r.dec), color: white },
        { text: "ERR " + (err < 1 ? "<1″" : err < 60 ? err.toFixed(0) + "″" : (err / 60).toFixed(1) + "′") +
          " · " + r.matched + " matched", color: white },
        { text: "zodiacal wasm · synthetic frame", color: QUAD.label }
      ];
    }
    if (real && real.status !== "pending") {
      return [
        { text: real.status === "none" ? "NO SOLUTION" : "SOLVER UNAVAILABLE", color: QUAD.D },
        { text: real.n + " src · " + real.fov.toFixed(0) + "° field", color: white }
      ];
    }
    var rd = S.toRaDec(v), fov = 4 * Math.atan(half / (2 * view.scale)) / D2R;
    return [
      { text: quad ? "QUAD MATCHED" : "TOO FEW STARS", color: quad ? QUAD.match : QUAD.D },
      { text: "RA  " + S.fmtRa(rd[0]), color: white },
      { text: "DEC " + S.fmtDec(rd[1]), color: white },
      { text: "FOV " + fov.toFixed(1) + "° · " + nsrc + " src", color: white }
    ];
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
    dragging = true; goal = null; lx = downX = ev.clientX; ly = downY = ev.clientY;
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
    solveAt(mobile ? W - 70 : W * 0.6, mobile ? footTop() - 72 : H * 0.45);
  }
  var sbtn = document.getElementById("sky-solve");
  if (sbtn) sbtn.addEventListener("click", solveDefault);

  canvas.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); solveDefault(); return; }
    var k = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[ev.key];
    if (!k) return;
    ev.preventDefault();
    goal = null;
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
      // A flight in progress lands at its destination rather than creeping on later redraws.
      if (goal) { cam.ra = goal.ra0 + goal.dra; cam.dec = goal.dec; goal = null; }
      cam.vra = cam.vdec = 0;
      view.scale = baseScale;
      // Any field on screen stays, drawn in its final state, so a paused match can be inspected.
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
