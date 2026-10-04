// Render checked-in social cards from each project's existing artwork.
// Start the site server first. Optional: SITE_URL, CHROME_PATH.
const { chromium } = require("playwright");
const path = require("node:path");
const projects = [
  "scicamera",
  "fitsio-pure",
  "zodiacal",
  "starfield",
  "starfield-datastore",
  "rizzma",
];
(async () => {
  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  );
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    for (const project of projects) {
      await page.goto(
        `${process.env.SITE_URL || "http://127.0.0.1:4173"}/projects/${project}/`,
      );
      await page.evaluate(async () => {
        await Promise.all(
          Array.from(document.images, (i) => i.decode().catch(() => {})),
        );
        const brand = document.querySelector(".site-nav .brand");
        const art = document.querySelector(".project-art");
        const name = document.querySelector("h1");
        const tagline = document.querySelector("#overview-title");
        const meta = document.querySelector(".meta");
        const role = document
          .querySelector(".eyebrow")
          .textContent.split("/")[0]
          .trim();
        const wrap = document.createElement("div");
        wrap.className = "social-card";
        const head = document.createElement("header");
        head.append(brand);
        const eyebrow = document.createElement("p");
        eyebrow.className = "eyebrow";
        eyebrow.textContent = role;
        const text = document.createElement("div");
        text.className = "social-text";
        text.append(eyebrow, name, tagline, meta);
        const grid = document.createElement("main");
        grid.append(text, art);
        const foot = document.createElement("footer");
        foot.textContent = "OPEN SOURCE · ORBITALCOMMONS.GITHUB.IO";
        wrap.append(head, grid, foot);
        document.body.replaceChildren(wrap);
        const sky = art.querySelector("canvas.sky-art");
        if (sky) sky.dataset.mode = sky.dataset.mode.replace("planets", "");
        const style = document.createElement("style");
        style.textContent = `
          *,*::before,*::after { animation:none!important; transition:none!important; }
          body { margin:0; width:1200px; height:630px; overflow:hidden; background:#05070d; }
          .social-card { height:100%; padding:48px 60px 36px; border-top:4px solid #7cc4ff; display:flex; flex-direction:column; background:radial-gradient(ellipse at 90% 30%,#111a2b 0%,#05070d 65%); }
          .social-card header { display:flex; align-items:center; }
          .brand { font-size:24px; gap:12px; } .brand .mark { width:24px; height:42px; }
          .social-card main { display:grid; grid-template-columns:580px 440px; gap:60px; align-items:center; flex:1; }
          .social-text .eyebrow { margin:0 0 16px; font-size:14px; }
          .social-text h1 { font-size:${name.textContent.length > 15 ? 46 : 66}px; line-height:1.1; margin:0 0 22px; letter-spacing:-.05em; }
          .social-text h2 { font-size:29px; font-weight:500; line-height:1.4; color:#b4bdd2; margin:0 0 30px; max-width:550px; }
          .social-text .meta { margin:0; } .meta span { font-size:13px; }
          .project-art { margin:0; width:440px; } .project-art figcaption { font-size:10px; }
          .social-card footer { color:#7b86a3; font:12px var(--mono); letter-spacing:.15em; }
        `;
        document.head.append(style);
        window.dispatchEvent(new Event("resize"));
        await document.fonts.ready;
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        );
      });
      await page.screenshot({
        path: path.join(__dirname, "..", "projects", project, "og.jpg"),
        type: "jpeg",
        quality: 90,
      });
      console.log(`Rendered ${project}`);
    }
  } finally {
    await browser.close();
  }
})();
