/**
 * PureTidings Satellite - Reader Mode Forwarder
 * Routes article reading and AI summaries exclusively to the PureTidings Desktop Application.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const articleUrl = params.get('url');
  const title = params.get('title') || '';
  const feedId = params.get('feedId') || '';
  const statusEl = document.getElementById('status-text');
  const openBtn = document.getElementById('open-btn');

  async function routeToDesktop() {
    if (!articleUrl) {
      if (statusEl) statusEl.textContent = 'No article URL provided.';
      return;
    }
    let st = await SatelliteBridge.checkStatus(400);
    if (!st.connected) {
      SatelliteBridge.launchDesktop();
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 250));
        st = await SatelliteBridge.checkStatus(250);
        if (st.connected) break;
      }
    }
    await SatelliteBridge.openArticle(articleUrl, title, feedId);
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
