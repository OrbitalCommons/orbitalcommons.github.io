// Publish the sticky header's real height as --nav-height on <html>. The header can wrap onto
// several lines with large text, and anchors and overlays need to clear it.
(function () {
  "use strict";
  var nav = document.querySelector(".site-nav");
  if (!nav || !window.ResizeObserver) return;
  new ResizeObserver(function () {
    var root = document.documentElement;
    root.style.setProperty("--nav-height", Math.ceil(nav.getBoundingClientRect().height) + "px");
    root.classList.add("nav-ready");
  }).observe(nav);
})();
