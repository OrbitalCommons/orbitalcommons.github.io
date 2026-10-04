// Keep parsing and any malformed-file failure off the page's main thread.
import init, { inspect_fits } from './wasm/fits_inspector.js';
self.onmessage = async ({ data }) => {
  try {
    await init();
    const result = JSON.parse(inspect_fits(new Uint8Array(data)));
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: String(error?.message || error) });
  }
};
