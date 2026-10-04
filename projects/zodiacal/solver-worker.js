// All parsing, index construction, and solving stay off the main thread.
import init, { load_index, solve_sources } from "./wasm/zodiacal_browser.js";
let loaded = false;
self.onmessage = async function (event) {
  const { id, type, sources, width, height } = event.data;
  try {
    if (type === "load") {
      if (!loaded) {
        const [, bytes] = await Promise.all([
          init(),
          fetch(new URL("bright-quads.bin", import.meta.url)).then(
            (response) => {
              if (!response.ok)
                throw new Error("The star index could not be loaded.");
              return response.arrayBuffer();
            },
          ),
        ]);
        load_index(new Uint8Array(bytes));
        loaded = true;
      }
      self.postMessage({ id, result: true });
    } else if (type === "solve" && loaded) {
      const start = performance.now();
      const result = JSON.parse(
        solve_sources(JSON.stringify(sources), width, height),
      );
      if (result) result.ms = performance.now() - start;
      self.postMessage({ id, result });
    } else throw new Error("The star index is not ready.");
  } catch (error) {
    self.postMessage({
      id,
      error:
        error instanceof WebAssembly.RuntimeError
          ? "This field exceeded the browser solver limits. Try another view."
          : String(error.message || error),
    });
  }
};
