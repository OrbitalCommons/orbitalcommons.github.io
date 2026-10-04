// Static real-sky art. Requires stars.js and sky-core.js.
//
//   <svg class="sky-art-fallback">...</svg>
//   <canvas class="sky-art" hidden data-ra="83.8" data-dec="-3" data-fov="34"
//           data-mode="band lines names planets quad readout" data-aspect="1.33"
//           role="img" aria-label="..."></canvas>
//
// data-follow="Jupiter" (any planet) centres on that planet today instead of data-ra/data-dec.
//
// Each canvas renders once (and again on resize); after the first successful frame it is shown
// and a preceding .sky-art-fallback sibling is hidden, so the fallback stays when scripts fail.
(function () {
  "use strict";
  if (!window.OC_SKY || !window.OCSky) return;
  var S = window.OCSky;
  var MONO = getComputedStyle(document.body).getPropertyValue("--mono") || "monospace";

  function render(canvas) {
    var parent = canvas.parentNode, W = parent.clientWidth;
    if (!W) return;
    var aspect = parseFloat(canvas.dataset.aspect) || 4 / 3, H = Math.round(W / aspect);
    var dpr = Math.min(window.devicePixelRatio || 1, 2), mode = " " + (canvas.dataset.mode || "lines") + " ";
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";

    var view = canvas._ocView || (canvas._ocView = new S.View()), cat = view.cat;
    view.size(W, H, parseFloat(canvas.dataset.fov) || 40, parseFloat(canvas.dataset.maglimit) || 99);
    var ra = parseFloat(canvas.dataset.ra) || 0, dec = parseFloat(canvas.dataset.dec) || 0;
    // data-follow centres the panel on a planet's position today.
    S.planets(Date.now()).forEach(function (p) {
      if (p.name === canvas.dataset.follow) { var rd = S.toRaDec([p.x, p.y, p.z]); ra = rd[0]; dec = rd[1]; }
    });
    view.point(ra, dec);
    view.layout();

    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, W, H);
    if (mode.indexOf(" band ") >= 0) view.drawBand(ctx);
    if (mode.indexOf(" lines ") >= 0) view.drawLines(ctx, 0.28);
    view.drawStars(ctx, 0, false);
    if (mode.indexOf(" planets ") >= 0) view.drawPlanets(ctx, S.planets(Date.now()), "600 11px " + MONO);

    var SX = view.SX, SY = view.SY, VIS = view.VIS;
    if (mode.indexOf(" names ") >= 0) {
      ctx.font = "500 11px " + MONO;
      ctx.fillStyle = "rgba(180,189,210,0.7)";
      for (var key in cat.names) {
        var i = +key;
        if (VIS[i] && SX[i] > 8 && SX[i] < W - 80 && SY[i] > 14 && SY[i] < H - 8) ctx.fillText(cat.names[key], SX[i] + 9, SY[i] + 3.5);
      }
    }
    if (mode.indexOf(" quad ") >= 0) drawQuad(ctx, view, W, H, mode.indexOf(" readout ") >= 0);

    if (canvas.hidden) {
      canvas.hidden = false;
      var fb = canvas.previousElementSibling;
      if (fb && fb.classList.contains("sky-art-fallback")) fb.style.display = "none";
    }
  }

  // Reticle on the central field, detections, and the quad formed by the four brightest sources.
  function drawQuad(ctx, view, W, H, readout) {
    var cat = view.cat, SX = view.SX, SY = view.SY, VIS = view.VIS;
    var half = Math.min(W, H) * 0.34, cx = W / 2, cy = H / 2, found = [];
    for (var i = 0; i < cat.n && found.length < 12; i++) {
      if (VIS[i] && cat.MAG[i] < 5.6 && Math.abs(SX[i] - cx) < half - 8 && Math.abs(SY[i] - cy) < half - 8) found.push(i);
    }
    var c = 18;
    ctx.strokeStyle = "#7cc4ff";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
      var x = cx + s[0] * half, y = cy + s[1] * half;
      ctx.moveTo(x - s[0] * c, y); ctx.lineTo(x, y); ctx.lineTo(x, y - s[1] * c);
    });
    ctx.stroke();
    ctx.strokeStyle = "rgba(139,227,176,0.85)";
    ctx.lineWidth = 1;
    found.forEach(function (k) {
      ctx.beginPath();
      ctx.arc(SX[k], SY[k], 6, 0, 6.283);
      ctx.stroke();
    });
    // Quad: the brightest detections that are not crowded together.
    var quad = [];
    for (var f = 0; f < found.length && quad.length < 4; f++) {
      var ok = quad.every(function (o) { return Math.hypot(SX[o] - SX[found[f]], SY[o] - SY[found[f]]) > half * 0.35; });
      if (ok) quad.push(found[f]);
    }
    if (quad.length === 4) {
      var order = [0, 1, 1, 3, 3, 2, 2, 0, 0, 3, 1, 2];
      ctx.strokeStyle = "rgba(255,196,119,0.9)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (var s = 0; s < order.length; s += 2) {
        ctx.moveTo(SX[quad[order[s]]], SY[quad[order[s]]]);
        ctx.lineTo(SX[quad[order[s + 1]]], SY[quad[order[s + 1]]]);
      }
      ctx.stroke();
    }
    if (readout) {
      var rd = S.toRaDec(view.unproject(cx, cy)), fov = 2 * half / view.scale / S.D2R;
      var lines = ["RA  " + S.fmtRa(rd[0]), "DEC " + S.fmtDec(rd[1]), "FOV " + fov.toFixed(1) + "°  ·  " + found.length + " src"];
      ctx.font = "600 11px " + MONO;
      var top = H - 16 - lines.length * 16;
      ctx.fillStyle = "rgba(5,7,13,0.75)";
      ctx.fillRect(10, top - 4, 176, lines.length * 16 + 10);
      ctx.fillStyle = "rgba(232,236,246,0.85)";
      lines.forEach(function (l, j) { ctx.fillText(l, 18, top + 10 + j * 16); });
    }
  }

  var canvases = Array.prototype.slice.call(document.querySelectorAll("canvas.sky-art"));
  function renderAll() { canvases.forEach(function (c) { try { render(c); } catch (e) { /* keep the fallback */ } }); }
  renderAll();
  var timer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(timer);
    timer = setTimeout(renderAll, 150);
  });
})();
