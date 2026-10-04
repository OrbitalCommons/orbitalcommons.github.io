const fs = require("fs"),
  vm = require("vm");
const ctx = { window: {} };
vm.runInNewContext(
  fs.readFileSync(
    require("path").join(__dirname, "../../assets/stars.js"),
    "utf8",
  ),
  ctx,
);
const raw = ctx.window.OC_SKY.stars;
const stars = [];
const R = Math.PI / 180;
for (let i = 0; i < raw.length; i += 4) {
  const ra = (raw[i] / 20) * R,
    dec = (raw[i + 1] / 20) * R,
    mag = raw[i + 2] / 10;
  stars.push({
    ra,
    dec,
    mag,
    x: Math.cos(dec) * Math.cos(ra),
    y: Math.cos(dec) * Math.sin(ra),
    z: Math.sin(dec),
  });
}
const quads = new Map();
for (let k = 0; k < 1024; k++) {
  const z = 1 - (2 * (k + 0.5)) / 1024,
    ra = k * Math.PI * (3 - Math.sqrt(5)),
    r = Math.sqrt(1 - z * z),
    x = r * Math.cos(ra),
    y = r * Math.sin(ra);
  for (const radius of [7, 12, 20]) {
    const cos = Math.cos(radius * R),
      near = [];
    for (let i = 0; i < stars.length && near.length < 7; i++) {
      const s = stars[i];
      if (s.x * x + s.y * y + s.z * z > cos) near.push(i);
    }
    for (let a = 0; a < near.length; a++)
      for (let b = a + 1; b < near.length; b++)
        for (let c = b + 1; c < near.length; c++)
          for (let d = c + 1; d < near.length; d++) {
            const ids = [near[a], near[b], near[c], near[d]];
            quads.set(ids.join(","), ids);
          }
  }
}
const buf = Buffer.alloc(16 + stars.length * 20 + quads.size * 8);
buf.write("OCZI0001");
buf.writeUInt32LE(stars.length, 8);
buf.writeUInt32LE(quads.size, 12);
let pos = 16;
for (const s of stars) {
  buf.writeDoubleLE(s.ra, pos);
  buf.writeDoubleLE(s.dec, pos + 8);
  buf.writeFloatLE(s.mag, pos + 16);
  pos += 20;
}
for (const ids of quads.values())
  for (const id of ids) {
    buf.writeUInt16LE(id, pos);
    pos += 2;
  }
fs.writeFileSync(
  require("path").join(__dirname, "../../projects/zodiacal/bright-quads.bin"),
  buf,
);
console.log({ stars: stars.length, quads: quads.size, bytes: buf.length });
