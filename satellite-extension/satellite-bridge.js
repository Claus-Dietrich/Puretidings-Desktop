/**
 * PureTidings Satellite - Desktop Bridge Client
 * Communicates with PureTidings Desktop via local loopback http://127.0.0.1:41789
 */
const SatelliteBridge = (function () {
    const DESKTOP_BASE_URL = 'http://127.0.0.1:41789';

    /**
     * Checks if PureTidings Desktop is running and responds.
     * @param {number} timeoutMs
     * @returns {Promise<{ connected: boolean, totalUnread: number, version?: string }>}
     */
    async function checkStatus(timeoutMs = 800) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(`${DESKTOP_BASE_URL}/api/status`, {
                method: 'GET',
                signal: controller.signal,
                cache: 'no-store'
            });
            clearTimeout(timer);
            if (res.ok) {
                const data = await res.json();
                return {
                    connected: true,
                    totalUnread: data.totalUnread || 0,
                    version: data.version || '1.0'
                };
            }
        } catch (_) {
            clearTimeout(timer);
        }
        return { connected: false, totalUnread: 0 };
    }

    /**
     * Fetches complete state snapshot from PureTidings Desktop.
     * @returns {Promise<object|null>}
     */
    async function fetchData() {
        try {
            const res = await fetch(`${DESKTOP_BASE_URL}/api/data`, {
                method: 'GET',
                cache: 'no-store'
            });
            if (res.ok) {
                const data = await res.json();
                // Cache snapshot in chrome.storage.local for fast startup
                chrome.storage.local.set({ satellite_snapshot: data }).catch(() => {});
                if (data.geminiApiKey) {
                    chrome.storage.sync.set({ geminiApiKey: data.geminiApiKey }).catch(() => {});
                }
                return data;
            }
        } catch (e) {
            console.warn('[SatelliteBridge] Failed to fetch desktop data:', e);
        }
        return null;
    }

    /**
     * Toggles an article's read status in PureTidings Desktop.
     * @param {string} link
     * @param {boolean} isRead
     * @returns {Promise<boolean>}
     */
    async function markRead(link, isRead) {
        if (!link) return false;
        try {
            const res = await fetch(`${DESKTOP_BASE_URL}/api/mark-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ link, isRead })
            });
            return res.ok;
        } catch (e) {
            console.warn('[SatelliteBridge] markRead failed:', e);
            return false;
        }
    }

    /**
     * Focuses the Desktop App window and displays the article in Reader Mode.
     * @param {string} link
     * @param {string} [title]
     * @param {string} [feedId]
     * @returns {Promise<boolean>}
     */
    async function openArticle(link, title, feedId) {
        if (!link) return false;
        try {
            const res = await fetch(`${DESKTOP_BASE_URL}/api/open-article`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ link, title, feedId })
            });
            return res.ok;
        } catch (e) {
            console.warn('[SatelliteBridge] openArticle failed:', e);
            return false;
        }
    }

    /**
     * Focuses the Desktop App window and navigates to the specified feed.
     * @param {string} feedId
     * @returns {Promise<boolean>}
     */
    async function openFeed(feedId) {
        try {
            const res = await fetch(`${DESKTOP_BASE_URL}/api/open-feed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedId })
            });
            return res.ok;
        } catch (e) {
            console.warn('[SatelliteBridge] openFeed failed:', e);
            return false;
        }
    }

    /**
     * Triggers a feed refresh in PureTidings Desktop.
     * If feedId is provided, only that feed is refreshed (selective refresh).
     * @param {string|null} [feedId]
     * @returns {Promise<boolean>}
     */
    async function refresh(feedId = null) {
        try {
            const payload = feedId ? { feedId } : {};
            const res = await fetch(`${DESKTOP_BASE_URL}/api/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            return res.ok;
        } catch (e) {
            console.warn('[SatelliteBridge] refresh failed:', e);
            return false;
        }
    }

    /**
     * Focuses the Desktop App window and opens the Settings modal.
     * @returns {Promise<boolean>}
     */
    async function openSettings() {
        try {
            const res = await fetch(`${DESKTOP_BASE_URL}/api/open-settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            return res.ok;
        } catch (e) {
            console.warn('[SatelliteBridge] openSettings failed:', e);
            return false;
        }
    }

    /**
     * Launches the PureTidings Desktop Application on demand via the custom protocol puretidings://open
     */
    function launchDesktop() {
        try {
            if (typeof document !== 'undefined') {
                const a = document.createElement('a');
                a.href = 'puretidings://open';
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    try { a.remove(); } catch (_) {}
                }, 1000);
            } else if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
                chrome.tabs.create({ url: 'puretidings://open' });
            }
        } catch (e) {
            console.warn('[SatelliteBridge] launchDesktop failed:', e);
        }
    }

    return {
        checkStatus,
        fetchData,
        markRead,
        openArticle,
        openFeed,
        refresh,
        openSettings,
        launchDesktop
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SatelliteBridge;
}
