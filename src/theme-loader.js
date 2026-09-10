// PureTidings Theme Loader - Synchronous early application
(function () {
  try {
    let isDark = true;
    const raw = localStorage.getItem('pt_sync_darkMode');
    if (raw !== null) {
      isDark = JSON.parse(raw);
    }
    if (isDark) {
      document.documentElement.classList.add('dark-mode');
      if (document.body) document.body.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
      if (document.body) document.body.classList.remove('dark-mode');
    }
  } catch (e) {
    console.warn('Could not apply theme preference:', e);
  }
})();
