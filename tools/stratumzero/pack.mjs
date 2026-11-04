// Per-component GLB for the web viewer: one mesh per reference designator (one primitive
// per material), dedup/weld, optional simplify, quantize, meshopt.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, weld, quantize, prune, joinPrimitives, transformPrimitive, simplify, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
const [,, inp, out, ratio = '1'] = process.argv;
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptEncoder });
const doc = await io.read(inp);
await doc.transform(dedup(), weld());
const root = doc.getRoot(); const scene = root.getDefaultScene() || root.listScenes()[0];
const top = scene.listChildren()[0];  // KiCad: one root node
let comps = 0;
for (const c of top.listChildren()) {
  // collect primitives under c, baked into c's local frame
  const groups = new Map();
  const walk = (n, m) => {
    const lm = n === c ? [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] : mul(m, n.getMatrix());
    const mesh = n.getMesh();
    if (mesh) for (const p of mesh.listPrimitives()) {
      const q = p.clone(); transformPrimitive(q, lm);
      const key = q.getMaterial(); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(q);
    }
    for (const k of n.listChildren()) walk(k, lm);
  };
  walk(c, null);
  if (!groups.size) continue;
  const mesh = doc.createMesh(c.getName());
  for (const [, prims] of groups) mesh.addPrimitive(prims.length > 1 ? joinPrimitives(prims) : prims[0]);
  for (const k of c.listChildren()) { c.removeChild(k); }
  if (c.getMesh() && c.getMesh() !== mesh) c.setMesh(null);
  c.setMesh(mesh); comps++;
}
function mul(a, b) { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j*4+i] += a[k*4+i] * b[j*4+k]; return o; }
const tf = [prune(), dedup(), weld()];
if (+ratio < 1) tf.push(simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: 0.0004 }));
tf.push(reorder({ encoder: MeshoptEncoder }), quantize());
await doc.transform(...tf);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(out, doc);
console.log(out, comps, 'components');
