/* Small page enhancements. The content and links remain useful without JavaScript. */
(() => {
  "use strict";
  const scriptBase = new URL(".", document.currentScript.src);
  const one = (selector) => document.querySelector(selector);
  const all = (selector) => [...document.querySelectorAll(selector)];

  const copyFeedback = document.createElement("span");
  copyFeedback.className = "copy-feedback";
  copyFeedback.setAttribute("role", "status");
  document.body.append(copyFeedback);

  all(".code-block").forEach((block) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-button";
    button.textContent = "Copy";
    button.setAttribute(
      "aria-label",
      `Copy ${block.querySelector(".code-label span").textContent} code`,
    );
    let timer;
    button.addEventListener("click", async () => {
      clearTimeout(timer);
      copyFeedback.textContent = "";
      try {
        await navigator.clipboard.writeText(
          block.querySelector("code").textContent,
        );
        button.textContent = "Copied";
        copyFeedback.textContent = "Code copied to the clipboard.";
      } catch {
        const range = document.createRange();
        range.selectNodeContents(block.querySelector("code"));
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        button.textContent = "Selected — copy manually";
        copyFeedback.textContent =
          "Code selected. Use your keyboard’s copy command.";
      }
      timer = setTimeout(() => {
        button.textContent = "Copy";
      }, 2500);
    });
    block.querySelector(".code-label").append(button);
  });

  const demo = one("[data-demo]");
  if (!demo) return;
  if (demo.dataset.demo !== "catalog") demo.querySelectorAll(".demo-controls[hidden]").forEach((node) => {
    node.hidden = false;
  });

  if (demo.dataset.demo === "quad") {
    const rotation = one("#quad-rotation");
    const scale = one("#quad-scale");
    const update = () => {
      const angle = Number(rotation.value),
        factor = Number(scale.value);
      one("#quad-transformed").setAttribute(
        "transform",
        `translate(540 166) rotate(${angle}) scale(${factor})`,
      );
      one("#quad-angle").value = `${angle}°`;
      one("#quad-size").value = `${factor.toFixed(2)}×`;
    };
    rotation.addEventListener("input", update);
    scale.addEventListener("input", update);
    one("#quad-reset").addEventListener("click", () => {
      rotation.value = 25;
      scale.value = 0.8;
      update();
    });
    update();
  }

  if (demo.dataset.demo === "cache") {
    const scenarios = {
      local: {
        stages: [
          ["hit", "Validated hit"],
          ["", "Not contacted"],
          ["", "Not contacted"],
        ],
        text: "The cached artifact is rehashed and validated, then its local path is returned.",
      },
      mirror: {
        stages: [
          ["miss", "Not cached"],
          ["hit", "Validated hit"],
          ["", "Not contacted"],
        ],
        text: "The configured mirror supplies the artifact. Validation passes, the local cache is populated, and its path is returned.",
      },
      upstream: {
        stages: [
          ["miss", "Not cached"],
          ["miss", "Not found"],
          ["hit", "Explicitly allowed"],
        ],
        text: "With STARFIELD_ALLOW_UPSTREAM=1, the archive supplies the artifact. It is validated and cached locally; client fetches do not write to the mirror.",
      },
      offline: {
        stages: [
          ["miss", "Not cached"],
          ["blocked", "Offline"],
          ["blocked", "Offline"],
        ],
        text: "With STARFIELD_OFFLINE=1 and no local artifact, resolution returns an error. No network requests are made.",
      },
    };
    all("[data-scenario]").forEach((button) =>
      button.addEventListener("click", () => {
        all("[data-scenario]").forEach((item) =>
          item.setAttribute("aria-pressed", String(item === button)),
        );
        const scenario = scenarios[button.dataset.scenario];
        ["local", "mirror", "upstream"].forEach((name, i) => {
          const stage = one(`#cache-${name}`);
          stage.className = scenario.stages[i][0];
          stage.querySelector("span").textContent = scenario.stages[i][1];
        });
        one("#cache-status").textContent = scenario.text;
      }),
    );
  }

  if (demo.dataset.demo === "plots") {
    const plots = {
      signal: [
        "A fading signal · 400 synthetic samples · SVG output",
        "A cyan decaying sinusoid on dark axes. The oscillation amplitude decreases over ten seconds.",
      ],
      sources: [
        "A field of points · 180 synthetic positions · SVG output",
        "A blue scatter plot showing 180 points arranged in a sunflower spiral.",
      ],
      sensor: [
        "A synthetic sensor frame · 64 × 64 samples · SVG output",
        "A heatmap of two synthetic Gaussian sources with a brighter broad source near the center and a compact source above and right.",
      ],
    };
    all("[data-plot]").forEach((button) =>
      button.addEventListener("click", () => {
        const kind = button.dataset.plot;
        all("[data-plot]").forEach((item) =>
          item.setAttribute("aria-pressed", String(item === button)),
        );
        const img = one("#plot-image");
        one("#plot-compact").srcset = `plots/${kind}-mobile.svg`;
        img.src = `plots/${kind}.svg`;
        img.alt = plots[kind][1];
        one("#plot-caption").textContent = plots[kind][0];
        one("#plot-svg").href = `plots/${kind}.svg`;
        one("#plot-png").href = `plots/${kind}.png`;
      }),
    );
  }

  if (demo.dataset.demo === "catalog") {
    const status = one("#catalog-status");
    status.textContent = "Loading the bundled catalog…";
    const initializeCatalog = () => {
      const sky = window.OC_SKY;
      if (!sky || !Array.isArray(sky.stars)) {
        status.textContent =
          "The catalog could not be read. The Rust example below is still available.";
        return;
      }
      const canvas = one("#catalog-canvas");
      canvas.hidden = false;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        status.textContent =
          "Canvas is unavailable in this browser. Try the Rust catalog example below.";
        return;
      }
      const slider = one("#magnitude");
      const guides = one("#constellations");
      const stars = sky.stars, names = sky.names || {};
      const nameSelect = one("#catalog-name"), previous = one("#catalog-prev"), next = one("#catalog-next");
      let selected = null, points = [], visibleIndices = [];
      Object.entries(names).sort((a, b) => a[1].localeCompare(b[1])).forEach(([index, name]) => {
        const option = document.createElement("option");
        option.value = index; option.textContent = name; nameSelect.append(option);
      });
      const describeSelection = () => {
        const detail = one("#catalog-detail"), index = visibleIndices.indexOf(selected);
        previous.disabled = index <= 0;
        next.disabled = !visibleIndices.length || index === visibleIndices.length - 1;
        detail.hidden = selected === null;
        nameSelect.value = selected !== null && names[selected] ? String(selected) : "";
        if (selected === null) {
          one("#catalog-selection-status").textContent = "";
          return;
        }
        const name = names[selected] || "Unnamed catalog star";
        const ra = ((stars[selected * 4] / 20) % 360).toFixed(2);
        const dec = (stars[selected * 4 + 1] / 20).toFixed(2);
        const mag = (stars[selected * 4 + 2] / 10).toFixed(1);
        const bv = (stars[selected * 4 + 3] / 100).toFixed(2);
        one("#catalog-star-name").textContent = name;
        one("#catalog-ra").textContent = `${ra}°`;
        one("#catalog-dec").textContent = `${dec}°`;
        one("#catalog-mag").textContent = mag;
        one("#catalog-bv").textContent = bv;
        one("#catalog-selection-status").textContent = `${name}, ${index + 1} of ${visibleIndices.length} visible stars. Right ascension ${ra} degrees, declination ${dec} degrees, V magnitude ${mag}, B minus V ${bv}.`;
      };
      const draw = () => {
        const W = Math.max(200, canvas.getBoundingClientRect().width);
        const H = Math.max(240, W / 2);
        const left = 42, top = 20, width = W - 60, height = H - 70;
        const point = (i) => [
          left + (1 - stars[i * 4] / 20 / 360) * width,
          top + ((90 - stars[i * 4 + 1] / 20) / 180) * height,
        ];
        canvas.style.height = `${H}px`;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#1a1b26";
        ctx.fillRect(0, 0, W, H);
        ctx.font = "11px ui-monospace, monospace";
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = "#565f89";
        ctx.fillStyle = "#c0caf5";
        for (let dec = -60; dec <= 60; dec += 30) {
          const y = top + ((90 - dec) / 180) * height;
          ctx.beginPath();
          ctx.moveTo(left, y);
          ctx.lineTo(left + width, y);
          ctx.stroke();
          ctx.textAlign = "right";
          ctx.fillText(`${dec > 0 ? "+" : ""}${dec}°`, left - 10, y + 4);
        }
        for (let ra = 0; ra <= 24; ra += W < 400 ? 8 : 4) {
          const x = left + (1 - ra / 24) * width;
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x, top + height);
          ctx.stroke();
          ctx.textAlign = "center";
          ctx.fillText(`${ra}h`, x, top + height + 20);
        }
        ctx.fillText("RIGHT ASCENSION", left + width / 2, H - 10);
        if (guides.checked && sky.lines) {
          ctx.strokeStyle = "#7aa2f755";
          ctx.lineWidth = 0.7;
          for (const pairs of Object.values(sky.lines)) {
            for (let j = 0; j < pairs.length; j += 2) {
              const a = point(pairs[j]),
                b = point(pairs[j + 1]);
              if (Math.abs(a[0] - b[0]) > width / 2) continue;
              ctx.beginPath();
              ctx.moveTo(...a);
              ctx.lineTo(...b);
              ctx.stroke();
            }
          }
        }
        const limit = Number(slider.value);
        let count = 0;
        points = []; visibleIndices = [];
        if (selected !== null && stars[selected * 4 + 2] / 10 > limit) selected = null;
        for (let i = stars.length / 4 - 1; i >= 0; i--) {
          const mag = stars[i * 4 + 2] / 10;
          if (mag > limit) continue;
          count++;
          const [x, y] = point(i);
          points.push([x, y, i]); visibleIndices.push(i);
          const bv = stars[i * 4 + 3] / 100;
          ctx.fillStyle =
            bv > 0.8 ? "#e0af68" : bv < 0.1 ? "#7dcfff" : "#dce3ff";
          ctx.globalAlpha = Math.max(0.25, Math.min(1, (6.5 - mag) / 5));
          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.65, 2.3 - mag * 0.27), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        visibleIndices.reverse();
        if (selected !== null) {
          const [x, y] = point(selected);
          ctx.strokeStyle = "#e8ecf6"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
        }
        describeSelection();
        one("#magnitude-value").value = limit.toFixed(1);
        status.textContent = `${count.toLocaleString()} catalog stars at magnitude ${limit.toFixed(1)} or brighter. Equatorial coordinates; all-sky view.`;
      };
      nameSelect.addEventListener("change", () => {
        selected = nameSelect.value === "" ? null : Number(nameSelect.value);
        if (selected !== null) slider.value = Math.max(Number(slider.value), stars[selected * 4 + 2] / 10);
        draw();
      });
      previous.addEventListener("click", () => {
        selected = visibleIndices[Math.max(0, visibleIndices.indexOf(selected) - 1)] ?? null;
        draw();
      });
      next.addEventListener("click", () => {
        selected = visibleIndices[Math.min(visibleIndices.length - 1, visibleIndices.indexOf(selected) + 1)] ?? null;
        draw();
      });
      canvas.addEventListener("click", (event) => {
        const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
        let best = 15 * 15, found = null;
        for (const [px, py, index] of points) {
          const distance = (x - px) ** 2 + (y - py) ** 2;
          if (distance <= best) { best = distance; found = index; }
        }
        if (found !== null) { selected = found; draw(); }
      });
      one("#catalog-inspector").hidden = false;
      demo.querySelectorAll(".demo-controls[hidden]").forEach(node => { node.hidden = false; });
      slider.addEventListener("input", draw);
      guides.addEventListener("change", draw);
      let previousWidth = 0;
      new ResizeObserver(([entry]) => {
        if (Math.abs(entry.contentRect.width - previousWidth) < 1) return;
        previousWidth = entry.contentRect.width;
        draw();
      }).observe(canvas);
      draw();
    };
    if (window.OC_SKY) {
      initializeCatalog();
    } else {
      const script = document.createElement("script");
      script.src = new URL("../assets/stars.js", scriptBase).href;
      script.onload = initializeCatalog;
      script.onerror = () => {
        status.textContent =
          "The bundled catalog could not load. The Rust example below is still available.";
      };
      document.head.append(script);
    }
  }

  if (demo.dataset.demo === "fits") {
    const status = one("#fits-status");
    const fileInput = one("#fits-file");
    const sampleButton = one("#fits-sample");
    const output = one("#fits-output");
    let preview = null;
    let busy = false;
    status.textContent =
      "Choose a sample or local FITS file to begin. Nothing is uploaded.";

    const draw = () => {
      if (!preview) return;
      const canvas = one("#fits-canvas");
      canvas.width = preview.width;
      canvas.height = preview.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const image = ctx.createImageData(preview.width, preview.height);
      const gamma = Number(one("#stretch").value);
      one("#stretch-value").value = gamma.toFixed(2);
      for (let y = 0; y < preview.height; y++) {
        for (let x = 0; x < preview.width; x++) {
          const source = (preview.height - 1 - y) * preview.width + x;
          const index = (y * preview.width + x) * 4;
          const value = Math.round(
            255 * Math.pow(preview.pixels[source] / 255, gamma),
          );
          image.data[index] = value;
          image.data[index + 1] = value;
          image.data[index + 2] = value;
          image.data[index + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
    };
    one("#stretch").addEventListener("input", draw);

    const parseInWorker = (buffer) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(
          new URL("fitsio-pure/worker.js", scriptBase),
          { type: "module" },
        );
        const finish = (error, result) => {
          clearTimeout(timeout);
          worker.terminate();
          if (error) reject(new Error(error));
          else resolve(result);
        };
        const timeout = setTimeout(
          () =>
            finish(
              "This file took too long to inspect. Try a smaller, uncompressed FITS image.",
            ),
          15000,
        );
        worker.onmessage = (event) =>
          finish(event.data.error, event.data.result);
        worker.onerror = () =>
          finish(
            "The FITS parser could not run. Reload the page or try a different file.",
          );
        worker.postMessage(buffer, [buffer]);
      });

    const inspect = async (getFile, name) => {
      if (busy) return;
      busy = true;
      sampleButton.disabled = true;
      fileInput.disabled = true;
      status.classList.remove("error");
      status.textContent = `Opening ${name}…`;
      output.hidden = true;
      preview = null;
      try {
        const buffer = await getFile();
        if (buffer.byteLength > 16 * 1024 * 1024)
          throw new Error(
            "This demo accepts files up to 16 MiB. Use the Rust library for larger files.",
          );
        const result = await parseInWorker(buffer);
        preview = result.preview;
        const stats = [
          ["HDUs", result.hdus],
          ["Pixel type", result.bitpix ? `BITPIX ${result.bitpix}` : "—"],
          ["Dimensions", result.dimensions.join(" × ") || "No image axes"],
          ["Primary header", `${result.cards.length} cards`],
        ];
        if (preview)
          stats.push(
            ["Minimum", Number(preview.min.toPrecision(6))],
            ["Maximum", Number(preview.max.toPrecision(6))],
          );
        const dl = one("#fits-stats");
        dl.replaceChildren();
        stats.forEach(([label, value]) => {
          const div = document.createElement("div"),
            dt = document.createElement("dt"),
            dd = document.createElement("dd");
          dt.textContent = label;
          dd.textContent = value;
          div.append(dt, dd);
          dl.append(div);
        });
        const tbody = one("#fits-cards");
        tbody.replaceChildren();
        result.cards.forEach((card) => {
          const row = document.createElement("tr");
          [card.keyword, card.value, card.comment].forEach((value) => {
            const td = document.createElement("td");
            td.textContent = value;
            row.append(td);
          });
          tbody.append(row);
        });
        one("#fits-canvas").hidden = !preview;
        one("#fits-stretch").hidden = !preview;
        one("#fits-note").textContent = result.note;
        one("#fits-empty").hidden = true;
        output.hidden = false;
        draw();
        status.textContent = `${name} · ${result.hdus} HDU${result.hdus === 1 ? "" : "s"} · parsed locally with fitsio-pure.`;
      } catch (error) {
        status.classList.add("error");
        status.textContent = error.message || "This file could not be read.";
        one("#fits-empty").hidden = false;
      } finally {
        busy = false;
        sampleButton.disabled = false;
        fileInput.disabled = false;
      }
    };

    sampleButton.addEventListener("click", () =>
      inspect(async () => {
        const response = await fetch(
          new URL("fitsio-pure/sample.fits", scriptBase),
        );
        if (!response.ok)
          throw new Error("The sample could not load. Please try again.");
        return response.arrayBuffer();
      }, "Synthetic star field"),
    );
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) return;
      inspect(async () => {
        if (file.size > 16 * 1024 * 1024)
          throw new Error(
            "This demo accepts files up to 16 MiB. Use the Rust library for larger files.",
          );
        return file.arrayBuffer();
      }, file.name);
      fileInput.value = "";
    });
  }
})();
