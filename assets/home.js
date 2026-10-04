// Homepage interactions: nav state, scroll reveals, counters, card spotlight, copy button.
(function () {
  "use strict";
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

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
