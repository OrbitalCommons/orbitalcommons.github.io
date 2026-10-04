// Lazy, local-only browser port of zodiacal. No assets are fetched until load().
(function () {
  "use strict";
  if (window.OCZodiacal) return;
  var base = new URL(".", document.currentScript.src);
  var worker = null,
    ready = null,
    serial = 0,
    busy = false;
  var pending = new Map();
  var info = {
    indexStars: 7038,
    indexBytes: 773392,
    quads: 79077,
    magLimit: 6.3,
    fovRange: [15, 40],
    sourcesMax: 200,
  };
  function reset(message) {
    if (worker) worker.terminate();
    worker = null;
    ready = null;
    busy = false;
    pending.forEach(function (job) {
      clearTimeout(job.timer);
      job.reject(new Error(message));
    });
    pending.clear();
  }
  function request(type, data, timeout) {
    return new Promise(function (resolve, reject) {
      var id = ++serial;
      var timer = setTimeout(function () {
        reset("The solver timed out. Try a different field.");
      }, timeout);
      pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      worker.postMessage(Object.assign({ id: id, type: type }, data));
    });
  }
  function load() {
    if (ready) return ready;
    if (!window.Worker || !window.WebAssembly)
      return Promise.reject(
        new Error(
          "This browser needs WebAssembly and workers to run the solver.",
        ),
      );
    worker = new Worker(new URL("solver-worker.js", base), { type: "module" });
    worker.onmessage = function (event) {
      var data = event.data,
        job = pending.get(data.id);
      if (!job) return;
      clearTimeout(job.timer);
      pending.delete(data.id);
      if (data.error) {
        if (data.fatal) reset(data.error);
        job.reject(new Error(data.error));
      } else job.resolve(data.result);
    };
    worker.onerror = function () {
      reset("The solver could not start. Please retry.");
    };
    ready = request("load", {}, 30000).then(
      function () {},
      function (error) {
        reset(error.message);
        throw error;
      },
    );
    return ready;
  }
  async function solve(sources, width, height, options) {
    if (
      !Array.isArray(sources) ||
      sources.length > 10000 ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 32 ||
      height < 32 ||
      width > 4096 ||
      height > 4096
    )
      throw new Error("Invalid detector frame.");
    var inputSources = sources.length;
    var selected = sources
      .map(function (s) {
        if (
          !s ||
          !Number.isFinite(s.x) ||
          !Number.isFinite(s.y) ||
          !Number.isFinite(s.flux)
        )
          throw new Error(
            "Source positions and brightness must be finite numbers.",
          );
        return { x: s.x, y: s.y, flux: s.flux };
      })
      .filter(function (s) {
        return (
          s.x >= 0 && s.y >= 0 && s.x <= width && s.y <= height && s.flux > 0
        );
      })
      .sort(function (a, b) {
        return b.flux - a.flux;
      })
      .slice(0, info.sourcesMax);
    if (selected.length < 10) return null;
    await load();
    if (busy) throw new Error("A solve is already running.");
    busy = true;
    var requested = options && options.timeoutMs;
    var timeout = Number.isFinite(requested)
      ? Math.max(250, Math.min(15000, requested))
      : 10000;
    try {
      var result = await request(
        "solve",
        { sources: selected, width: width, height: height },
        timeout,
      );
      if (result) {
        result.inputSources = inputSources;
        result.sourcesUsed = selected.length;
      }
      return result;
    } finally {
      busy = false;
    }
  }
  window.OCZodiacal = { load: load, solve: solve, info: info };
})();
