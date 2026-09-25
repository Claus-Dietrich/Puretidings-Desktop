/**
 * PureTidings Satellite - Feedpage Forwarder Bridge
 * Automatically forwards any navigation to the PureTidings Desktop Application.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view') || 'all';
  const feedId = params.get('feedId');
  const statusEl = document.getElementById('bridge-status');
  const openBtn = document.getElementById('open-btn');

  async function routeToDesktop() {
    let st = await SatelliteBridge.checkStatus(400);
    if (!st.connected) {
      SatelliteBridge.launchDesktop();
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 250));
        st = await SatelliteBridge.checkStatus(250);
        if (st.connected) break;
      }
    }
    if (feedId) {
      await SatelliteBridge.openFeed(feedId);
    } else {
      await SatelliteBridge.openView(view);
    }
    if (statusEl) statusEl.textContent = 'Opened in PureTidings Desktop!';
    setTimeout(() => {
      try { window.close(); } catch (_) {}
    }, 800);
  }

  if (openBtn) {
    openBtn.addEventListener('click', routeToDesktop);
  }

  await routeToDesktop();
});
