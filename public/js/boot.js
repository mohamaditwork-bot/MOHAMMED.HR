// Applies saved theme and language before the page paints (kept out of inline scripts for CSP).
(function () {
  var th = "light", lg = "ar";
  try {
    th = localStorage.getItem("hr_theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    lg = localStorage.getItem("hr_lang") === "en" ? "en" : "ar";
  } catch (e) {}
  document.documentElement.setAttribute("data-theme", th);
  document.documentElement.lang = lg;
  document.documentElement.dir = lg === "ar" ? "rtl" : "ltr";
})();
