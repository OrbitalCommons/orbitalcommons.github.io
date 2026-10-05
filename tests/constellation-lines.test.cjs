const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../assets/sky-core.js'), 'utf8'), context);
const S = context.window.OCSky;

function segment(raA, raB) {
  const stars = [S.radec(raA, 0), S.radec(raB, 0)];
  const view = Object.create(S.View.prototype);
  Object.assign(view, {
    W: 320, H: 400, cx: 160, cy: 200, scale: 600,
    // Both sprites culled: lines must not depend on sprite visibility or buffers.
    VIS: [0, 0], SX: [NaN, NaN], SY: [NaN, NaN],
    cat: { X: stars.map(v => v[0]), Y: stars.map(v => v[1]),
      Z: stars.map(v => v[2]), lineSets: [[0, 1]] }
  });
  view.point(0, 0);
  const points = [];
  view.drawLines({ beginPath() {}, stroke() {},
    moveTo(x,y) { points.push([x,y]); }, lineTo(x,y) { points.push([x,y]); } });
  return points;
}

test('constellation segment remains when one endpoint leaves the viewport', () => {
  const p = segment(0, 25);
  assert.equal(p.length, 2);
  assert.ok(p[0][0] > 0 && p[0][0] < 320);
  assert.ok(p[1][0] < 0);
});
test('long constellation segments cross the viewport with both stars outside', () => {
  const p = segment(-25, 25);
  assert.equal(p.length, 2);
  assert.ok(p[0][0] > 320 && p[1][0] < 0);
});
test('rear clipping preserves the visible segment with finite coordinates', () => {
  for (const pair of [[0,110], [110,0]]) {
    const p = segment(...pair);
    assert.equal(p.length, 2);
    assert.ok(p.flat().every(Number.isFinite));
  }
  assert.equal(segment(120,140).length, 0);
});
