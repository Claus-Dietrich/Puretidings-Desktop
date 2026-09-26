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
     * @param {string} [feedId]
     * @returns {Promise<boolean>}
     */
    async function markRead(link, isRead, feedId = null) {
        if (!link) return false;
        try {
            const res = await fetch(`${DESKTOP_BASE_URL}/api/mark-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ link, isRead, feedId })
            });
            return res.ok;
        } catch (e) {
            console.warn('[SatelliteBridge] markRead failed:', e);
            return false;
        }
    }

    /**
     * Marks all posts in a specific feed as unread in PureTidings Desktop.
     * @param {string} feedId
     * @returns {Promise<boolean>}
     */
    async function markFeedUnread(feedId) {
        try {
            const res = await fetch(`${DESKTOP_BASE_URL}/api/mark-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedId, isRead: false })
            });
            return res.ok;
        } catch (e) {
            console.warn('[SatelliteBridge] markFeedUnread failed:', e);
            return false;
        }
    }

    /**
     * Marks all posts in a specific feed as read in PureTidings Desktop.
     * @param {string} feedId
     * @returns {Promise<boolean>}
     */
    async function markFeedRead(feedId) {
        try {
            const res = await fetch(`${DESKTOP_BASE_URL}/api/mark-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedId, isRead: true })
            });
            return res.ok;
        } catch (e) {
            console.warn('[SatelliteBridge] markFeedRead failed:', e);
            return false;
        }
    }

    /**
     * Marks all posts across all feeds as read in PureTidings Desktop.
     * @returns {Promise<boolean>}
     */
    async function markAllRead() {
        try {
            const res = await fetch(`${DESKTOP_BASE_URL}/api/mark-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ all: true, isRead: true })
            });
            return res.ok;
        } catch (e) {
            console.warn('[SatelliteBridge] markAllRead failed:', e);
            return false;
        }
    }

    /**
     * Marks all posts across all feeds as unread in PureTidings Desktop.
     * @returns {Promise<boolean>}
     */
    async function markAllUnread() {
        try {
            const res = await fetch(`${DESKTOP_BASE_URL}/api/mark-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ all: true, isRead: false })
            });
            return res.ok;
        } catch (e) {
            console.warn('[SatelliteBridge] markAllUnread failed:', e);
            return false;
        }
    }

    /**
     * Subscribes a new feed in PureTidings Desktop.
     * @param {string} url
     * @param {string} [title]
     * @param {string} [folderId]
     * @returns {Promise<boolean>}
     */
    async function addFeed(url, title, folderId) {
        if (!url) return false;
        try {
            const res = await fetch(`${DESKTOP_BASE_URL}/api/add-feed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, title, folderId })
            });
            return res.ok;
        } catch (e) {
            console.warn('[SatelliteBridge] addFeed failed:', e);
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
     * Focuses the Desktop App window and triggers AI summary for the specified URL in Reader Mode.
     * @param {string} url
     * @returns {Promise<boolean>}
     */
    async function summarizeUrl(url) {
        if (!url) return false;
        try {
            const res = await fetch(`${DESKTOP_BASE_URL}/api/summarize-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            return res.ok;
        } catch (e) {
            console.warn('[SatelliteBridge] summarizeUrl failed:', e);
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
     * Focuses the Desktop App window and navigates to the specified view (all, unread, favorites, keywords, summary).
     * @param {string} view
     * @returns {Promise<boolean>}
     */
    async function openView(view) {
        try {
            const res = await fetch(`${DESKTOP_BASE_URL}/api/open-view`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ view })
            });
            return res.ok;
        } catch (e) {
            console.warn('[SatelliteBridge] openView failed:', e);
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
     * Toggles an article's favorite status in PureTidings Desktop.
     * @param {string} link
     * @param {boolean} isFavorited
     * @returns {Promise<boolean>}
     */
    async function toggleFavorite(link, isFavorited) {
        if (!link) return false;
        try {
            const res = await fetch(`${DESKTOP_BASE_URL}/api/toggle-favorite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ link, isFavorited: !!isFavorited })
            });
            return res.ok;
        } catch (e) {
            console.warn('[SatelliteBridge] toggleFavorite failed:', e);
            return false;
        }
    }

    /**
     * Toggles an article's summary cart status in PureTidings Desktop.
     * @param {string} link
     * @param {boolean} isSummary
     * @returns {Promise<boolean>}
     */
    async function toggleSummary(link, isSummary) {
        if (!link) return false;
        try {
            const res = await fetch(`${DESKTOP_BASE_URL}/api/toggle-summary`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ link, isSummary: !!isSummary })
            });
            return res.ok;
        } catch (e) {
            console.warn('[SatelliteBridge] toggleSummary failed:', e);
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
        markFeedRead,
        markFeedUnread,
        markAllRead,
        markAllUnread,
        toggleFavorite,
        toggleSummary,
        addFeed,
        openArticle,
        summarizeUrl,
        openFeed,
        openView,
        refresh,
        openSettings,
        launchDesktop
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SatelliteBridge;
}
