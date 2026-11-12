// Interactive StratumZero board: the carrier and its compute module from the KiCad
// designs (GLB per board, one node per reference designator), board faces textured
// from the copper, mask and silkscreen layers. Renders on demand: frames run only
// while the camera moves, a transition plays or auto-rotate is on and the canvas is
// visible.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { BLOCKS } from './blocks.js';
import { CARRIER, MODULE } from './parts.js';

const root = document.getElementById('board3d');
const stage = root.querySelector('.viewer-stage');
const status = root.querySelector('.viewer-status');
const info = root.querySelector('.viewer-info');
const tip = root.querySelector('.viewer-tip');
const legend = root.querySelector('.viewer-blocks');
const btn = name => root.querySelector(`[data-action="${name}"]`);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const byId = Object.fromEntries(BLOCKS.map(b => [b.id, b]));
const MM = 0.001;
// module seat: module (100,101.45) mm -> carrier (145,10) mm; underside 2 mm above the carrier's top
const MODULE_AT = new THREE.Vector3(45 * MM, 3.6 * MM, -91.45 * MM);
const LIFT = 22 * MM;

let renderer, scene, camera, controls, pick = [], parts = new Map(), moduleGroup;
let frame = 0, visible = false, tweens = [], autoRotate = !reduced.matches, lifted = false;
let selectedBlock = null, selectedPart = null, hovered = null;

function setStatus(text) { status.textContent = text; status.hidden = !text; }

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

async function start() {
  if (!webglOK()) { setStatus('This browser has no WebGL, so the interactive model is unavailable. The renders below show the same board.'); return; }
  setStatus('Loading the 3D model…');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Interactive 3D model of the StratumZero board. Drag to rotate, scroll or pinch to zoom; use the block buttons to highlight parts.');
  stage.prepend(canvas);
  scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-0.2, 0.5, 0.25); scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x1a1b26, 0.5));
  camera = new THREE.PerspectiveCamera(32, 1, 0.002, 3);
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 0.03; controls.maxDistance = 0.7;
  controls.autoRotateSpeed = 0.6;
  controls.addEventListener('change', request);
  controls.addEventListener('start', () => setAutoRotate(false));

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const tex = new THREE.TextureLoader();
  const [carrier, module, ...faces] = await Promise.all([
    loader.loadAsync('model/carrier.glb'), loader.loadAsync('model/module.glb'),
    ...['carrier-top', 'carrier-bottom', 'module-top', 'module-bottom'].map(n => tex.loadAsync(`model/${n}.webp`))
  ]);
  for (const t of faces) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); }
  // the bottom layers are plotted as seen from above; the downward-facing plane needs them unflipped
  faces[1].flipY = faces[3].flipY = false;
  // dress before placing, so each board's own frame is the world frame
  dress(carrier.scene, CARRIER, '', faces[0], faces[1], { x0: 20, z0: 10, w: 180, h: 100 });
  dress(module.scene, MODULE, 'M:', faces[2], faces[3], { x0: 100, z0: 101.45, w: 20, h: 45 });
  const board = new THREE.Group();
  // KiCad: X = board x, Z = board y (down the page), Y up; centre the carrier on the origin
  board.position.set(-0.11, 0, -0.06);
  scene.add(board);
  board.add(carrier.scene);
  moduleGroup = new THREE.Group(); moduleGroup.position.copy(MODULE_AT); moduleGroup.add(module.scene); board.add(moduleGroup);
  buildLegend();
  resize(); new ResizeObserver(() => { resize(); request(); }).observe(stage);
  home(false);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', () => hover(null));
  canvas.addEventListener('click', onClick);
  for (const [name, fn] of Object.entries({ rotate: () => setAutoRotate(!autoRotate), lift: toggleLift, flip, reset: () => { select(null); home(true); } })) {
    btn(name).disabled = false; btn(name).addEventListener('click', fn);
  }
  setAutoRotate(autoRotate);
  setStatus('');
  root.classList.add('ready');
  request();
}

// Board body gets an FR4 edge; its faces get the layer textures as planes just outside it.
function dress(sceneRoot, table, prefix, top, bottom, o) {
  const holder = sceneRoot.children[0] || sceneRoot;
  sceneRoot.updateMatrixWorld(true);
  for (const node of [...holder.children]) {
    const name = node.name;
    if (!/^[A-Z]+\d+$/.test(name)) {
      node.traverse(m => { if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ color: 0x5a5236, roughness: 0.8 }); });
      const box = new THREE.Box3().setFromObject(node);
      for (const [map, y, down] of [[top, box.max.y + 0.00002, false], [bottom, box.min.y - 0.00002, true]]) {
        const g = new THREE.PlaneGeometry(o.w * MM, o.h * MM);
        const mat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.62, metalness: 0, color: 0x8c8c8c, envMapIntensity: 0.5 });
        const plane = new THREE.Mesh(g, mat);
        plane.rotation.x = down ? Math.PI / 2 : -Math.PI / 2;
        plane.position.set((o.x0 + o.w / 2) * MM, y, (o.z0 + o.h / 2) * MM);
        holder.add(plane);
      }
      continue;
    }
    const ref = prefix + name, row = table[name];
    if (!row) continue;
    const part = { ref, name, value: row[0], block: prefix ? 'module' : row[1], node, mats: [] };
    node.traverse(m => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      if (m.material.emissive) part.mats.push(m.material);
      m.userData.part = part; pick.push(m);
    });
    parts.set(ref, part);
  }
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}

function request() { if (!frame && renderer) frame = requestAnimationFrame(tick); }
function tick(t) {
  frame = 0;
  let busy = false;
  tweens = tweens.filter(tw => { const k = Math.min(1, (t - tw.t0) / tw.ms); tw.step(ease(k)); if (k < 1) busy = true; return k < 1; });
  if (controls.update()) busy = true;
  renderer.render(scene, camera);
  if ((busy || (autoRotate && visible && !document.hidden))) request();
}
const ease = k => k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
function tween(ms, step) {
  if (reduced.matches || ms === 0) { step(1); request(); return; }
  tweens.push({ t0: performance.now(), ms, step }); request();
}

function setAutoRotate(on) {
  autoRotate = on;
  controls.autoRotate = autoRotate;
  const b = btn('rotate'); b.setAttribute('aria-pressed', String(autoRotate)); b.textContent = autoRotate ? 'Pause rotation' : 'Rotate';
  request();
}

function fly(target, dir, dist, animate = true) {
  const p0 = controls.target.clone(), c0 = camera.position.clone();
  const p1 = target.clone(), c1 = target.clone().add(dir.clone().normalize().multiplyScalar(dist));
  tween(animate ? 900 : 0, k => { controls.target.lerpVectors(p0, p1, k); camera.position.lerpVectors(c0, c1, k); });
}
function home(animate) { fly(new THREE.Vector3(0, 0, 0.004), new THREE.Vector3(0.35, 0.75, 0.75), 0.27, animate); }
function flip() { setAutoRotate(false); fly(controls.target.clone(), new THREE.Vector3(0.25, -0.8, 0.55), 0.26, true); }

function toggleLift() {
  lifted = !lifted;
  const y0 = moduleGroup.position.y, y1 = MODULE_AT.y + (lifted ? LIFT : 0);
  tween(700, k => { moduleGroup.position.y = y0 + (y1 - y0) * k; });
  const b = btn('lift'); b.setAttribute('aria-pressed', String(lifted)); b.textContent = lifted ? 'Seat the module' : 'Lift the module';
}

// ---------------------------------------------------------------- highlight + picking
function paint() {
  for (const p of parts.values()) {
    const on = selectedPart === p ? 0.55 : hovered === p ? 0.35 : selectedBlock && p.block === selectedBlock.id ? 0.4 : 0;
    const col = new THREE.Color(selectedPart === p || hovered === p ? '#ffffff' : (byId[p.block] || {}).color || '#ffffff');
    for (const m of p.mats) { m.emissive.copy(col); m.emissiveIntensity = on; }
  }
  request();
}

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function hit(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const h = ray.intersectObjects(pick, false)[0];
  return h ? h.object.userData.part : null;
}
let moveQueued = null;
function onMove(e) {
  if (e.pointerType === 'touch') return;
  if (!moveQueued) requestAnimationFrame(() => { const ev = moveQueued; moveQueued = null; const p = hit(ev); hover(p, ev); });
  moveQueued = e;
}
function hover(p, e) {
  if (p !== hovered) { hovered = p; paint(); }
  if (!p) { tip.hidden = true; renderer && (renderer.domElement.style.cursor = ''); return; }
  renderer.domElement.style.cursor = 'pointer';
  const r = stage.getBoundingClientRect();
  tip.textContent = `${p.ref.replace('M:', 'module ')} · ${p.value}`;
  tip.style.left = `${e.clientX - r.left + 14}px`; tip.style.top = `${e.clientY - r.top + 14}px`;
  tip.hidden = false;
}
let downAt = null;
root.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
function onClick(e) {
  if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;  // a drag, not a click
  const p = hit(e);
  if (p) selectPart(p.ref); else select(null);
}

function select(block, focus = true) {
  selectedBlock = block; selectedPart = null;
  for (const b of legend.querySelectorAll('button')) b.setAttribute('aria-pressed', String(!!block && b.dataset.block === block.id));
  if (!block) { info.innerHTML = '<p class="muted">Choose a block, or click any part on the board.</p>'; paint(); return; }
  showBlock(block);
  if (focus) frameParts([...parts.values()].filter(p => p.block === block.id));
  paint();
}
function selectPart(ref) {
  const p = parts.get(ref); if (!p) return;
  const block = byId[p.block];
  selectedBlock = block; selectedPart = p;
  for (const b of legend.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.block === block.id));
  showBlock(block, p);
  frameParts([p], 0.06);
  paint();
}
function frameParts(list, minDist = 0.09) {
  if (!list.length) return;
  setAutoRotate(false);
  const box = new THREE.Box3(); for (const p of list) box.expandByObject(p.node);
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
  const dir = camera.position.clone().sub(controls.target); if (dir.y < 0.02) dir.y = Math.abs(dir.y) + 0.05;
  fly(c, dir, Math.max(minDist, size * 1.6));
}

function showBlock(block, part) {
  const named = Object.entries(block.parts);
  info.replaceChildren();
  // the side panel scrolls on its own on wide screens: start each description at the top
  const side = info.parentElement;
  if (side.scrollHeight > side.clientHeight) side.scrollTo({ top: info.offsetTop - side.offsetTop - 8 });
  const h = document.createElement('h3'); h.textContent = block.name; info.append(h);
  if (part) {
    const p = document.createElement('p'); p.className = 'viewer-part';
    const label = part.ref.replace('M:', 'Module ');
    p.textContent = `${label} · ${part.value}` + (block.parts[part.ref] ? ` — ${block.parts[part.ref]}` : ` — ${generic(part)}`);
    info.append(p);
  }
  const s = document.createElement('p'); s.textContent = block.detail; info.append(s);
  const ul = document.createElement('ul'); ul.className = 'viewer-parts';
  for (const [ref, text] of named) {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.textContent = ref.replace('M:', 'Module '); b.addEventListener('click', () => selectPart(ref));
    if (part && part.ref === ref) b.setAttribute('aria-current', 'true');
    li.append(b, ` ${text}`); ul.append(li);
  }
  info.append(ul);
}
function generic(p) {
  const kind = { R: 'Resistor', C: 'Capacitor', L: 'Inductor', D: 'LED or diode', Q: 'MOSFET', TP: 'Test point', FB: 'Ferrite bead' }[p.name.match(/^[A-Z]+/)[0]] || 'Part';
  return `${kind} in the ${byId[p.block].name.toLowerCase()} block.`;
}

function buildLegend() {
  for (const b of BLOCKS) {
    const n = [...parts.values()].filter(p => p.block === b.id).length;
    const li = document.createElement('li'), el = document.createElement('button');
    el.type = 'button'; el.dataset.block = b.id; el.setAttribute('aria-pressed', 'false');
    el.style.setProperty('--swatch', b.color);
    el.innerHTML = `<span class="swatch" aria-hidden="true"></span>${b.name} <span class="count">${n}</span>`;
    el.addEventListener('click', () => select(selectedBlock === b && !selectedPart ? null : b));
    li.append(el); legend.append(li);
  }
  select(null);
}

// ---------------------------------------------------------------- lifecycle
new IntersectionObserver(es => {
  for (const e of es) {
    visible = e.isIntersecting;
    if (visible && !renderer && !root.dataset.started) { root.dataset.started = '1'; start().catch(err => { console.error(err); setStatus('The 3D model could not be loaded. The renders below show the same board.'); }); }
    if (visible) request();
  }
}, { rootMargin: '200px' }).observe(stage);
document.addEventListener('visibilitychange', () => { if (!document.hidden) request(); });
reduced.addEventListener('change', () => { if (reduced.matches && renderer) setAutoRotate(false); });
