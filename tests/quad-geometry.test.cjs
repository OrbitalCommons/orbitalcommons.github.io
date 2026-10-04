const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/sky-core.js'), 'utf8'), context);
const sky = context.window.OCSky;

test('quad codes preserve canonical roles under similarity transforms and input permutations', () => {
  const points = [[-80, -80], [80, 80], [-30, 20], [20, -30]];
  const baseline = sky.quadCode(points);
  assert.equal(baseline.valid, true);
  for (const angle of [0, .4, 1.8, 3.7]) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const transformed = points.map(([x,y]) => [120 + 2.3*(x*c-y*s), -70 + 2.3*(x*s+y*c)]);
    for (const order of [[0,1,2,3], [1,0,3,2], [2,1,3,0]]) {
      const result = sky.quadCode(order.map(i => transformed[i]));
      assert.equal(result.valid, true);
      result.code.forEach((v, i) => assert.ok(Math.abs(v - baseline.code[i]) < 1e-12));
      assert.ok(result.code[0] <= result.code[2]);
      assert.ok(result.code[0] + result.code[2] <= 1 + 1e-12);
    }
  }
  assert.equal(sky.quadCode([[0,0], [0,0], [0,0], [0,0]]).valid, false);
  assert.equal(sky.quadCode([[0,0], [10,0], [0,10], [10,10]]).valid, false);
});

test('quad palette matches the canonical Manim role colors', () => {
  assert.deepEqual(Array.from(['A','B','C','D','AB','AX','circle'], key => sky.QUAD[key]),
    ['#FC6255','#83C167','#58C4DD','#FF862F','#FFFF00','#58C4DD','#888888']);
});
