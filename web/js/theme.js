// Dark by default. The choice is saved only on this device (localStorage) and never sent anywhere.
(function () {
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) {}
  root.setAttribute("data-theme", saved === "light" ? "light" : "dark");

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
    });
  });
})();
