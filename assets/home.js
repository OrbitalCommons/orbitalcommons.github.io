// Homepage interactions: nav state, scroll reveals, counters, card spotlight, copy button.
(function () {
  "use strict";
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Star dust behind the page: a fresh random field each visit, one screen in size so it never tiles.
  // The CSS tile on body::before stays as the fallback without scripts.
  var dust = document.createElement("canvas"), dustSize = 0;
  dust.className = "dust";
  dust.setAttribute("aria-hidden", "true");
  var TINTS = ["255,255,255", "200,215,255", "255,240,220"];
  function drawDust() {
    var size = Math.max(screen.width, screen.height, innerWidth, innerHeight);
    if (size <= dustSize) return;
    dustSize = size;
    var dpr = Math.min(window.devicePixelRatio || 1, 2), ctx = dust.getContext("2d");
    dust.width = dust.height = Math.round(size * dpr);
    dust.style.width = dust.style.height = size + "px";
    ctx.scale(dpr, dpr);
    for (var i = 0, n = Math.round(size * size / 16000); i < n; i++) {
      var x = Math.random() * size, y = Math.random() * size, b = Math.pow(Math.random(), 3);
      var r = 0.5 + 0.6 * b, a = 0.25 + 0.4 * b, tint = TINTS[Math.random() * TINTS.length | 0];
      ctx.fillStyle = "rgba(" + tint + "," + a / 4 + ")";
      ctx.beginPath(); ctx.arc(x, y, r * 2, 0, 6.283); ctx.fill();
      ctx.fillStyle = "rgba(" + tint + "," + a + ")";
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    }
  }
  if (dust.getContext) {
    drawDust();
    document.body.insertBefore(dust, document.body.firstChild);
    document.documentElement.classList.add("dust-on");
    window.addEventListener("resize", drawDust);
  }

  var nav = document.querySelector(".site-nav");
  function onScroll() { nav.classList.toggle("scrolled", window.scrollY > 40); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function countUp(el) {
    var target = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0), t0 = performance.now();
    function step(now) {
      var p = Math.min(1, (now - t0) / 1400), v = target * (1 - Math.pow(1 - p, 4));
      el.textContent = v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || reduced) {
    items.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        var c = e.target.querySelector("[data-count]");
        if (c) countUp(c);
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    items.forEach(function (el) { io.observe(el); });
  }

  var navLinks = {};
  document.querySelectorAll('.site-nav nav a[href^="#"]').forEach(function (a) { navLinks[a.getAttribute("href").slice(1)] = a; });
  if ("IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var a = navLinks[e.target.id];
        if (!a) return;
        if (e.isIntersecting) {
          Object.keys(navLinks).forEach(function (k) { navLinks[k].removeAttribute("aria-current"); });
          a.setAttribute("aria-current", "true");
        } else a.removeAttribute("aria-current");
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(navLinks).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) spy.observe(el);
    });
  }

  document.querySelectorAll(".card").forEach(function (card) {
    card.addEventListener("pointermove", function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - r.left) + "px");
      card.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  });

  // Copy via the Clipboard API; if that is unavailable or denied, select the command for manual copying.
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    function flash(text) {
      btn.textContent = text;
      setTimeout(function () { btn.textContent = "Copy"; }, 1800);
    }
    function selectCode() {
      var code = btn.parentNode.querySelector(".cmd") || btn.parentNode.querySelector("pre");
      if (!code) return;
      var range = document.createRange();
      range.selectNodeContents(code);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      flash("Press \u2318/Ctrl+C");
    }
    btn.addEventListener("click", function () {
      if (!navigator.clipboard || !window.isSecureContext) return selectCode();
      navigator.clipboard.writeText(btn.dataset.copy).then(function () { flash("Copied"); }, selectCode);
    });
  });
})();
