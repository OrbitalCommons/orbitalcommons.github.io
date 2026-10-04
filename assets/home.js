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

  document.querySelectorAll(".card").forEach(function (card) {
    card.addEventListener("pointermove", function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - r.left) + "px");
      card.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  });

  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(btn.dataset.copy).then(function () {
        btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = "Copy"; }, 1600);
      });
    });
  });
})();
