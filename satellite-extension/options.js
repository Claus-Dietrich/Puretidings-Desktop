document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('bridge-status');
  const launchBtn = document.getElementById('launch-btn');

  if (launchBtn) {
    launchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      SatelliteBridge.launchDesktop();
      setTimeout(async () => {
        await SatelliteBridge.openSettings();
        try { window.close(); } catch (_) {}
      }, 1000);
    });
  }

  try {
    let st = await SatelliteBridge.checkStatus(400);
    if (!st.connected) {
      if (statusEl) statusEl.textContent = 'PureTidings Desktop wird gestartet...';
      SatelliteBridge.launchDesktop();
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 500));
        st = await SatelliteBridge.checkStatus(300);
        if (st.connected) break;
      }
    }

    if (st.connected) {
      if (statusEl) statusEl.textContent = 'Einstellungen in PureTidings Desktop geöffnet!';
      await SatelliteBridge.openSettings();
      setTimeout(() => {
        try {
          window.close();
        } catch (_) {}
      }, 700);
    } else {
      if (statusEl) statusEl.textContent = 'PureTidings Desktop ist nicht gestartet. Bitte App starten:';
    }
  } catch (err) {
    console.warn('Error bridging options to desktop:', err);
  }
});
