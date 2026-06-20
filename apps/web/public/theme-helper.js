(function() {
  "use strict";
  const saved = localStorage.getItem("oatlet_ui_theme") || "default";
  document.documentElement.setAttribute("data-ui-theme", saved);

  window.OatletTheme = {
    getTheme() {
      return localStorage.getItem("oatlet_ui_theme") || "default";
    },
    setTheme(theme) {
      localStorage.setItem("oatlet_ui_theme", theme);
      document.documentElement.setAttribute("data-ui-theme", theme);
      window.dispatchEvent(new CustomEvent("oatlet:themechange", { detail: { theme } }));
    },
    toggleTheme() {
      const next = this.getTheme() === "default" ? "playful" : "default";
      this.setTheme(next);
      return next;
    }
  };
})();
