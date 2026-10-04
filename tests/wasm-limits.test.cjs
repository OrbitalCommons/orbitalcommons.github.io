const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('the shipped FITS parser has a hard 128 MiB linear-memory limit', async () => {
  const module = await WebAssembly.compile(fs.readFileSync('projects/fitsio-pure/wasm/fits_inspector_bg.wasm'));
  const imports = {};
  for (const entry of WebAssembly.Module.imports(module)) {
    assert.equal(entry.kind, 'function');
    imports[entry.module] ??= {};
    imports[entry.module][entry.name] = () => { throw new Error('The memory-limit test does not call parser imports.'); };
  }
  const instance = await WebAssembly.instantiate(module, imports);
  const memory = instance.exports.memory;
  const maxPages = 128 * 1024 * 1024 / 65536;
  memory.grow(maxPages - memory.buffer.byteLength / 65536);
  assert.equal(memory.buffer.byteLength, 128 * 1024 * 1024);
  assert.throws(() => memory.grow(1), RangeError);
});
