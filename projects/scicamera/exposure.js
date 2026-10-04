/* Illustrative sensor model, independent of scicamera. No camera access. */
(() => {
  'use strict';
  const root = document.querySelector('#exposure-lab');
  if (!root) return;
  const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = 256, height = 192, rate = new Float64Array(width * height).fill(8);
  function random(seed) {
    return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed + .5) / 4294967296; };
  }
  const stars = random(20261003);
  for (let s = 0; s < 65; s++) {
    const x = 8 + stars() * 240, y = 8 + stars() * 176;
    const peak = 25 * Math.pow(100, stars()), sigma = .8 + stars() * .8;
    for (let j = Math.max(0, Math.floor(y - 7)); j <= Math.min(height - 1, y + 7); j++)
      for (let i = Math.max(0, Math.floor(x - 7)); i <= Math.min(width - 1, x + 7); i++)
        rate[j * width + i] += peak * Math.exp(-((i - x) ** 2 + (j - y) ** 2) / (2 * sigma * sigma));
  }
  const slider = root.querySelector('#sensor-time'), noise = root.querySelector('#sensor-noise');
  const status = root.querySelector('#sensor-status'), pixels = new Uint16Array(rate.length);
  let exposure = 1, pending = 0;
  function render() {
    pending = 0;
    exposure = Math.pow(10, Number(slider.value) / 50 - 1);
    const label = exposure.toFixed(2) + ' s';
    root.querySelector('#sensor-time-value').textContent = label;
    slider.setAttribute('aria-valuetext', label);
    const rng = random(72109);
    const normal = () => Math.sqrt(-2 * Math.log(rng())) * Math.cos(2 * Math.PI * rng());
    function poisson(lambda) {
      if (lambda >= 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal()));
      const stop = Math.exp(-lambda); let product = 1, count = 0;
      do { product *= rng(); count++; } while (product > stop);
      return count - 1;
    }
    const image = ctx.createImageData(width, height); let saturated = 0;
    for (let i = 0; i < pixels.length; i++) {
      const mean = rate[i] * exposure;
      const value = Math.round(100 + (noise.checked ? poisson(mean) + 4 * normal() : mean));
      pixels[i] = Math.max(0, Math.min(4095, value));
      if (pixels[i] === 4095) saturated++;
      const shade = Math.round(255 * Math.sqrt(Math.max(0, pixels[i] - 100) / 3995));
      const p = i * 4;
      image.data[p] = image.data[p + 1] = image.data[p + 2] = shade;
      image.data[p + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    status.textContent = `${label} exposure · ${saturated.toLocaleString()} saturated pixels · ${noise.checked ? 'shot + read noise' : 'noise off'}`;
    canvas.setAttribute('aria-label', `Simulated star image. ${status.textContent}. Fixed square-root display stretch.`);
  }
  slider.addEventListener('input', () => { if (!pending) pending = requestAnimationFrame(render); });
  noise.addEventListener('change', render);
  root.querySelector('#sensor-download').addEventListener('click', () => {
    if (pending) { cancelAnimationFrame(pending); render(); }
    const cards = [];
    const card = (key, value) => cards.push((key.padEnd(8) + '= ' + (value.startsWith("'") ? value.padEnd(20) : value.padStart(20))).padEnd(80));
    card('SIMPLE', 'T'); card('BITPIX', '16'); card('NAXIS', '2');
    card('NAXIS1', String(width)); card('NAXIS2', String(height));
    card('EXPTIME', exposure.toFixed(6)); card('BUNIT', "'ADU'");
    card('INSTRUME', "'SIMULATED'"); card('OBJECT', "'SYNTHETIC FIELD'");
    card('NOISE', noise.checked ? 'T' : 'F'); card('GAIN', '1.0'); card('BIAS', '100');
    cards.push('COMMENT Synthetic illustration; not data from a physical camera.'.padEnd(80), 'END'.padEnd(80));
    const buffer = new ArrayBuffer(2880 + Math.ceil(pixels.length * 2 / 2880) * 2880);
    const bytes = new Uint8Array(buffer); bytes.fill(32, 0, 2880);
    bytes.set(new TextEncoder().encode(cards.join('')));
    const view = new DataView(buffer);
    // FITS viewers conventionally place the first row at the bottom; canvas starts at the top.
    for (let i = 0; i < pixels.length; i++) {
      const source = (height - 1 - Math.floor(i / width)) * width + i % width;
      view.setInt16(2880 + i * 2, pixels[source], false);
    }
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/fits' }));
    const a = document.createElement('a'); a.href = url; a.download = `synthetic-${exposure.toFixed(2)}s.fits`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  render(); root.hidden = false;
})();
