// A real blind solve on synthetic detections. Truth is used only to construct
// the frame and score the result; it is never sent to OCZodiacal.
(function () {
  'use strict';
  var S = window.OCSky, engine = window.OCZodiacal;
  var panel = document.getElementById('plate-workbench');
  if (!panel || !S || !engine) return;
  var canvas = document.getElementById('plate-frame'), ctx = canvas.getContext('2d');
  if (!ctx) return;
  var field = document.getElementById('plate-field');
  var roll = document.getElementById('plate-roll');
  var noise = document.getElementById('plate-noise');
  var rollValue = document.getElementById('plate-roll-value');
  var controls = document.getElementById('plate-controls');
  var button = document.getElementById('plate-solve');
  var status = document.getElementById('plate-status');
  var results = document.getElementById('plate-results');
  var W = 1024, H = 768, FOV = 27, D2R = Math.PI / 180;
  var fields = {
    orion: { ra: 84, dec: 0 }, cassiopeia: { ra: 10, dec: 58 },
    crux: { ra: 192, dec: -60 }, leo: { ra: 160, dec: 15 }
  };
  var sources = [], truth, result = null, busy = false;

  // Repeatable noise makes changing the roll easy to compare. No identifiers
  // or catalogue coordinates are retained in the measured source list.
  function randomGenerator(seed) {
    return function () { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed + 1) / 4294967297; };
  }
  function regenerate() {
    if (busy) return;
    var centre = fields[field.value], angle = +roll.value * D2R;
    truth = { ra: centre.ra, dec: centre.dec, roll: +roll.value };
    var c = Math.cos(angle), s = Math.sin(angle), random = randomGenerator(20261003);
    function gaussian() { return Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random()); }
    sources = S.tanField(centre.ra, centre.dec, FOV, W, H, 6.3).map(function (p) {
      var dx = p.x - W / 2, dy = p.y - H / 2;
      return { x: W / 2 + c * dx + s * dy, y: H / 2 - s * dx + c * dy, flux: p.flux };
    });
    if (noise.checked) {
      sources = sources.filter(function () { return random() > .08; }).map(function (p) {
        return { x: p.x + .6 * gaussian(), y: p.y + .6 * gaussian(), flux: p.flux };
      });
      for (var i = 0; i < 3; i++) sources.push({ x: random() * W, y: random() * H, flux: Math.pow(10, -.4 * (5 + random())) });
    }
    // Match the SDK's selection order so returned source indices refer to the
    // exact points drawn here, including any false detections.
    sources = sources.filter(function (p) { return p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H; })
      .sort(function (a, b) { return b.flux - a.flux; }).slice(0, engine.info.sourcesMax);
    rollValue.value = roll.value + '°';
    result = null;
    results.hidden = true;
    results.replaceChildren();
    status.classList.remove('error');
    status.textContent = sources.length + ' detections ready. No pointing hint will be sent.';
    draw();
  }
  function draw() {
    ctx.fillStyle = '#080d18'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(124,196,255,.065)'; ctx.lineWidth = 1;
    for (var x = 64; x < W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (var y = 64; y < H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(124,196,255,.4)';
    ctx.beginPath(); ctx.moveTo(W / 2 - 12, H / 2); ctx.lineTo(W / 2 + 12, H / 2);
    ctx.moveTo(W / 2, H / 2 - 12); ctx.lineTo(W / 2, H / 2 + 12); ctx.stroke();
    var matched = new Set(result ? result.pairs.map(function (p) { return p[0]; }) : []);
    sources.forEach(function (p, i) {
      var mag = -2.5 * Math.log10(p.flux), radius = Math.max(1.2, Math.min(4.5, 4.8 - mag * .55));
      var glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 4);
      glow.addColorStop(0, 'rgba(197,220,255,.35)'); glow.addColorStop(1, 'rgba(197,220,255,0)');
      ctx.fillStyle = glow; ctx.fillRect(p.x - radius * 4, p.y - radius * 4, radius * 8, radius * 8);
      ctx.fillStyle = '#e8ecf6'; ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI); ctx.fill();
      if (matched.has(i)) {
        ctx.strokeStyle = '#8be3b0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, radius + 6, 0, 2 * Math.PI); ctx.stroke();
      }
    });
    ctx.fillStyle = 'rgba(8,13,24,.9)'; ctx.fillRect(0, 0, W, 46); ctx.fillRect(0, H - 42, W, 42);
    ctx.font = '16px ui-monospace, monospace'; ctx.fillStyle = '#b4bdd2';
    ctx.fillText('SYNTHETIC DETECTIONS / 1024 × 768', 20, 29);
    ctx.textAlign = 'right'; ctx.fillText(FOV + '° FIELD', W - 20, 29); ctx.textAlign = 'left';
    ctx.fillStyle = result ? '#8be3b0' : '#7cc4ff';
    ctx.fillText(result ? matched.size + ' MATCHED DETECTIONS' : sources.length + ' DETECTIONS / POINTING UNKNOWN TO SOLVER', 20, H - 16);
    canvas.setAttribute('aria-label', 'Synthetic ' + field.options[field.selectedIndex].text + ' field, camera roll ' + truth.roll + ' degrees, ' + sources.length + ' detections. ' +
      (result ? matched.size + ' detections have green match rings. Recovered coordinates follow below.' : 'Not yet solved.'));
  }
  function metric(label, value) {
    var item = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = value; item.append(dt, dd); results.appendChild(item);
  }
  function separation(ra, dec) {
    // atan2 of cross and dot products stays accurate near zero separation.
    var a = S.radec(truth.ra, truth.dec), b = S.radec(ra, dec);
    var cross = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    return Math.atan2(Math.hypot.apply(Math, cross), a[0]*b[0]+a[1]*b[1]+a[2]*b[2]) / D2R * 3600;
  }
  async function solve() {
    if (busy) return;
    busy = true; button.disabled = true; controls.disabled = true;
    status.classList.remove('error');
    status.textContent = 'Loading the local engine and matching star patterns…';
    try {
      result = await engine.solve(sources, W, H, { timeoutMs: 10000 });
      results.replaceChildren();
      results.hidden = !result;
      if (!result) {
        status.textContent = 'No verified match in this compact index. Try another field or turn off noise.';
      } else {
        var error = separation(result.ra, result.dec);
        metric('Recovered centre', S.fmtRa(result.ra) + ' / ' + S.fmtDec(result.dec));
        metric('Camera roll', result.rotationDeg.toFixed(2) + '° (input ' + truth.roll + '°)');
        metric('Plate scale', result.scaleArcsecPerPx.toFixed(2) + '″ / pixel');
        metric('Synthetic centre error', error < .1 ? '< 0.1″' : error.toFixed(1) + '″');
        status.textContent = result.matched + ' of ' + sources.length + ' detections matched in ' + Math.round(result.ms) + ' ms of engine time. Matched stars refined with least squares.';
      }
      draw();
    } catch (error) {
      status.classList.add('error');
      status.textContent = 'Could not solve this frame. ' + (error.message || String(error));
    } finally {
      busy = false; button.disabled = false; controls.disabled = false;
    }
  }
  field.addEventListener('change', regenerate);
  roll.addEventListener('input', regenerate);
  noise.addEventListener('change', regenerate);
  button.addEventListener('click', solve);
  regenerate();
  panel.hidden = false;
})();
