// PureTidings Desktop Engine - Native Tauri Adapter & Storage Shim
(function () {
    console.log("[PureTidings Desktop] Initializing Desktop Native Engine...");

    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isAndroid) {
        document.documentElement.classList.add('is-android');
    }

    // ==========================================
    // 1. Unified Tauri IPC Helper
    // ==========================================
    async function tauriInvoke(cmd, args = {}) {
        if (window.__TAURI__?.core?.invoke) {
            return window.__TAURI__.core.invoke(cmd, args);
        }
        if (window.__TAURI__?.invoke) {
            return window.__TAURI__.invoke(cmd, args);
        }
        // Poll briefly if Tauri webview is still initializing
        for (let i = 0; i < 25; i++) {
            await new Promise(r => setTimeout(r, 40));
            if (window.__TAURI__?.core?.invoke) return window.__TAURI__.core.invoke(cmd, args);
            if (window.__TAURI__?.invoke) return window.__TAURI__.invoke(cmd, args);
        }
        if (cmd === 'fetch_url') {
            const res = await fetch(args.url);
            return res.text();
        }
        throw new Error("Tauri IPC invoke not found for " + cmd);
    }
    window.tauriInvoke = tauriInvoke;

    async function tauriOpenBrowser(url) {
        if (!url || typeof url !== 'string') return;
        try {
            await tauriInvoke('open_browser', { url });
        } catch (e) {
            console.warn("[PureTidings Desktop] open_browser IPC failed, falling back to window.open:", e);
            const origOpen = window._nativeWindowOpen || window.open;
            origOpen.call(window, url, '_blank');
        }
    }
    window.tauriOpenBrowser = tauriOpenBrowser;

    // Route standard window.open through native desktop browser opener
    if (!window._nativeWindowOpen) {
        window._nativeWindowOpen = window.open;
        window.open = function (url) {
            if (url) tauriOpenBrowser(url);
            return null;
        };
    }

    function escapeHTML(str) {
        if (!str || typeof str !== 'string') return '';
        return str.replace(/[&<>'"]/g, tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag));
    }
    window.escapeHTML = escapeHTML;

    async function findOgImage(url) {
        if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return null;
        if (url.includes('youtube.com') || url.includes('youtu.be')) return null;
        try {
            const html = await tauriInvoke('fetch_url', { url });
            if (!html) return null;
            const ogMatch = html.match(/<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                            html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
                            html.match(/<meta\s+[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
                            html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
            if (ogMatch && ogMatch[1]) {
                let imgUrl = ogMatch[1].trim();
                imgUrl = imgUrl.replace(/&amp;/g, '&');
                if (imgUrl.startsWith('//')) {
                    imgUrl = 'https:' + imgUrl;
                } else if (imgUrl.startsWith('/')) {
                    const u = new URL(url);
                    imgUrl = u.origin + imgUrl;
                }
                return imgUrl;
            }
        } catch (e) {
            // Non-critical background thumbnail resolution failure
        }
        return null;
    }
    window.findOgImage = findOgImage;

    // ==========================================
    // 2. Browser-like Zoom (Ctrl + Wheel & Ctrl +/-/0)
    // ==========================================
    let currentZoom = parseFloat(localStorage.getItem('puretidings_zoom') || '1.0');
    if (isNaN(currentZoom) || currentZoom < 0.5 || currentZoom > 2.5) {
        currentZoom = 1.0;
    }

    function applyDesktopZoom(zoom) {
        currentZoom = Math.min(Math.max(zoom, 0.5), 2.5);
        currentZoom = Math.round(currentZoom * 100) / 100;
        document.documentElement.style.zoom = currentZoom;
        document.documentElement.style.width = '100%';
        document.documentElement.style.height = '100%';

        if (document.body) {
            document.body.style.width = '100%';
            document.body.style.height = '100%';
        }
        const pageLayout = document.querySelector('.page-layout');
        if (pageLayout) {
            pageLayout.style.width = '100%';
            pageLayout.style.height = '100%';
        }

        localStorage.setItem('puretidings_zoom', currentZoom.toString());
    }

    // Apply saved zoom immediately
    applyDesktopZoom(currentZoom);

    window.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.08 : -0.08;
            applyDesktopZoom(currentZoom + delta);
        }
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey) {
            if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
                e.preventDefault();
                applyDesktopZoom(currentZoom + 0.1);
            } else if (e.key === '-' || e.code === 'NumpadSubtract') {
                e.preventDefault();
                applyDesktopZoom(currentZoom - 0.1);
            } else if (e.key === '0' || e.code === 'Numpad0') {
                e.preventDefault();
                applyDesktopZoom(1.0);
            }
        } else if (e.key === 'Escape') {
            closeAllModals();
        }
    });

    // ==========================================
    // 3. Global Theme Management
    // ==========================================
    function applyDesktopTheme(isDark) {
        if (isDark) {
            document.documentElement.classList.add('dark-mode');
            if (document.body) document.body.classList.add('dark-mode');
        } else {
            document.documentElement.classList.remove('dark-mode');
            if (document.body) document.body.classList.remove('dark-mode');
        }
        const themeBtn = document.getElementById('theme-toggle-btn');
        if (themeBtn) {
            themeBtn.textContent = isDark ? '🌙' : '☀️';
            themeBtn.title = window.i18n ? window.i18n.t(isDark ? 'tooltip_theme_light' : 'tooltip_theme_dark') : (isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
        }
        const mobileThemeBtn = document.getElementById('mobile-theme-btn');
        if (mobileThemeBtn) {
            mobileThemeBtn.title = window.i18n ? window.i18n.t(isDark ? 'tooltip_theme_light' : 'tooltip_theme_dark') : (isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
        }
        setSyncItem('darkMode', isDark);
    }
    window.applyDesktopTheme = applyDesktopTheme;

    // ==========================================
    // 4. Storage Shim (Local & Sync)
    // ==========================================
    const DEFAULT_FEED_TREE = [
        {
            id: 'folder-news',
            name: 'News',
            type: 'folder',
            children: [
                { id: 'feed-tagesschau', name: 'Tagesschau', type: 'feed', url: 'https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml', fetchOgImage: true },
                { id: 'feed-bbc', name: 'BBC News', type: 'feed', url: 'https://feeds.bbci.co.uk/news/rss.xml', fetchOgImage: true }
            ]
        },
        {
            id: 'folder-tech',
            name: 'Technology',
            type: 'folder',
            children: [
                { id: 'feed-theverge', name: 'The Verge', type: 'feed', url: 'https://www.theverge.com/rss/index.xml', fetchOgImage: true },
                { id: 'feed-arstechnica', name: 'Ars Technica', type: 'feed', url: 'https://feeds.arstechnica.com/arstechnica/index', fetchOgImage: true },
                { id: 'feed-mkbhd', name: 'MKBHD (YouTube)', type: 'feed', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCBJycsmduvYEL83R_U4JriQ', fetchOgImage: true }
            ]
        }
    ];

    // =========================================================================
    // IndexedDB Unlimited Desktop Storage Engine
    // Eliminates 5MB Chromium/WebView2 localStorage quota limits.
    // Automatically migrates existing localStorage data into IndexedDB on first run.
    // In-memory key-value cache for instant synchronous access.
    // =========================================================================
    const memLocal = {};
    const memSync = {};
    const storageListeners = [];

    // Populate initial memory cache from localStorage for instant synchronous startup
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (k.startsWith('pt_local_') || k.startsWith('puretidings_local_')) {
                const shortKey = k.replace('puretidings_local_', '').replace('pt_local_', '');
                try {
                    memLocal[shortKey] = JSON.parse(localStorage.getItem(k));
                } catch (_) {}
            } else if (k.startsWith('pt_sync_')) {
                const shortKey = k.replace('pt_sync_', '');
                try {
                    memSync[shortKey] = JSON.parse(localStorage.getItem(k));
                } catch (_) {}
            }
        }
    } catch (_) {}

    // Seed defaults in memory if fresh install
    if (!memLocal.feedTree) {
        memLocal.feedTree = DEFAULT_FEED_TREE;
        memLocal.allPosts = {};
        memLocal.unreadCounts = {};
        memLocal.readLinks = [];
        memLocal.favoritedLinks = [];
        memLocal.summaryLinks = [];
    }
    if (memSync.darkMode === undefined) memSync.darkMode = true;
    if (memSync.rules === undefined) memSync.rules = [];
    if (memSync.checkInterval === undefined) memSync.checkInterval = 30;
    if (memSync.randomizeFetch === undefined) memSync.randomizeFetch = false;
    if (memSync.showNotification === undefined) memSync.showNotification = true;
    if (memSync.showSummaryNotification === undefined) memSync.showSummaryNotification = false;
    if (memSync.summaryInterval === undefined) memSync.summaryInterval = 60;
    if (!memSync.fetchSchedule) {
        const defSchedule = {};
        for (let d = 0; d < 7; d++) defSchedule[d] = { active: true, from: '00:00', to: '23:59' };
        memSync.fetchSchedule = defSchedule;
    }
    if (!memSync.emailAccounts) {
        memSync.emailAccounts = [];
    }

    const DB_NAME = 'PureTidingsDB';
    const DB_VERSION = 1;
    let dbInstance = null;
    let dbInitPromise = null;

    function openDatabase() {
        if (dbInitPromise) return dbInitPromise;
        dbInitPromise = new Promise((resolve) => {
            if (typeof indexedDB === 'undefined') {
                console.warn('[PureTidings Storage] IndexedDB is not supported in this environment, falling back to memory.');
                resolve(null);
                return;
            }
            try {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('local')) {
                        db.createObjectStore('local');
                    }
                    if (!db.objectStoreNames.contains('sync')) {
                        db.createObjectStore('sync');
                    }
                };
                request.onsuccess = async (e) => {
                    dbInstance = e.target.result;
                    try {
                        await syncDatabaseWithMemory(dbInstance);
                    } catch (syncErr) {
                        console.warn('[PureTidings Storage] Database sync error:', syncErr);
                    }
                    resolve(dbInstance);
                };
                request.onerror = (e) => {
                    console.error('[PureTidings Storage] Failed to open IndexedDB:', e.target.error);
                    resolve(null);
                };
            } catch (err) {
                console.error('[PureTidings Storage] Exception opening IndexedDB:', err);
                resolve(null);
            }
        });
        return dbInitPromise;
    }

    function getAllStoreEntries(db, storeName) {
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const req = store.openCursor();
                const result = {};
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        result[cursor.key] = cursor.value;
                        cursor.continue();
                    } else {
                        resolve(result);
                    }
                };
                req.onerror = () => resolve({});
            } catch (_) {
                resolve({});
            }
        });
    }

    async function syncDatabaseWithMemory(db) {
        if (!db) return;
        const [idbLocal, idbSync] = await Promise.all([
            getAllStoreEntries(db, 'local'),
            getAllStoreEntries(db, 'sync')
        ]);

        const hasIdbLocal = Object.keys(idbLocal).length > 0;
        const hasIdbSync = Object.keys(idbSync).length > 0;

        if (!hasIdbLocal && !hasIdbSync) {
            // First run migration: migrate everything from memLocal & memSync into IndexedDB
            console.log('[PureTidings Storage] Performing initial migration of data to IndexedDB...');
            const tx = db.transaction(['local', 'sync'], 'readwrite');
            const localStore = tx.objectStore('local');
            const syncStore = tx.objectStore('sync');
            for (const k in memLocal) {
                localStore.put(memLocal[k], k);
            }
            for (const k in memSync) {
                syncStore.put(memSync[k], k);
            }
            await new Promise(r => {
                tx.oncomplete = r;
                tx.onerror = r;
            });
            console.log('[PureTidings Storage] Migration to IndexedDB completed successfully.');
        } else {
            // IndexedDB already contains data: merge/load into memory
            for (const k in idbLocal) {
                memLocal[k] = idbLocal[k];
            }
            for (const k in idbSync) {
                memSync[k] = idbSync[k];
            }
            if (typeof scheduleSatelliteStateSync === 'function') {
                scheduleSatelliteStateSync();
            }
        }

        // Clean up pt_local_allPosts from localStorage to permanently free up the 5MB quota
        try {
            localStorage.removeItem('pt_local_allPosts');
            localStorage.removeItem('puretidings_local_allPosts');
        } catch (_) {}
    }

    // Start loading IndexedDB immediately in background
    openDatabase();

    function getLocalItem(key, fallback = null) {
        if (key in memLocal && memLocal[key] !== null && memLocal[key] !== undefined) {
            return memLocal[key];
        }
        return fallback;
    }

    // Satellite Companion State Sync Helper
    function calculateTotalUnreadCount() {
        const counts = memLocal.unreadCounts || {};
        let total = 0;
        for (const k in counts) {
            total += (parseInt(counts[k], 10) || 0);
        }
        return total;
    }

    function sanitizePostsForSatellite(postsMap) {
        const result = {};
        if (!postsMap || typeof postsMap !== 'object') return result;
        for (const fId in postsMap) {
            const list = postsMap[fId];
            if (!Array.isArray(list)) continue;
            result[fId] = list.map(p => ({
                id: p.id || p.link,
                link: p.link,
                title: p.title || '',
                date: p.date || p.pubDate || '',
                pubDate: p.pubDate || p.date || '',
                snippet: (p.snippet || p.description || '').substring(0, 350),
                description: (p.description || p.snippet || '').substring(0, 350),
                author: p.author || '',
                feedId: p.feedId || fId,
                feedTitle: p.feedTitle || p.feedName || '',
                feedName: p.feedName || p.feedTitle || '',
                isEmail: !!p.isEmail,
                emailUid: p.emailUid || '',
                accountId: p.accountId || '',
                featuredImage: p.featuredImage || null,
                videoLength: p.videoLength || null,
                readingTime: p.readingTime || null,
                matchedRules: Array.isArray(p.matchedRules) ? p.matchedRules : [],
                isHidden: !!p.isHidden
            }));
        }
        return result;
    }

    function syncSatelliteStateToRust() {
        if (typeof tauriInvoke !== 'function') return;
        try {
            const totalUnread = calculateTotalUnreadCount();
            const snapshot = {
                feedTree: memLocal.feedTree || [],
                allPosts: sanitizePostsForSatellite(memLocal.allPosts || {}),
                readLinks: memLocal.readLinks || [],
                favoritedLinks: memLocal.favoritedLinks || [],
                summaryLinks: memLocal.summaryLinks || [],
                unreadCounts: memLocal.unreadCounts || {},
                rules: memSync.rules || [],
                geminiApiKey: memSync.geminiApiKey || '',
                customAiPrompt: memSync.customAiPrompt || '',
                youtubeAiPrompt: memSync.youtubeAiPrompt || '',
                darkMode: memSync.darkMode !== false,
                totalUnread: totalUnread
            };

            tauriInvoke('update_satellite_state', {
                stateJson: JSON.stringify(snapshot),
                totalUnread: totalUnread
            }).catch(() => {});
        } catch (err) {
            console.warn('[PureTidings Desktop] Satellite sync error:', err);
        }
    }
    window.syncSatelliteStateToRust = syncSatelliteStateToRust;

    let satelliteDebounceTimer = null;
    function scheduleSatelliteStateSync() {
        if (satelliteDebounceTimer) clearTimeout(satelliteDebounceTimer);
        satelliteDebounceTimer = setTimeout(syncSatelliteStateToRust, 300);
    }
    window.scheduleSatelliteStateSync = scheduleSatelliteStateSync;

    let webdavDebounceTimer = null;
    let isWebdavSyncing = false;
    window.isWebdavSyncing = false;

    function scheduleWebdavDebouncedSync(delay = 2500) {
        if (webdavDebounceTimer) clearTimeout(webdavDebounceTimer);
        webdavDebounceTimer = setTimeout(async () => {
            webdavDebounceTimer = null;
            try {
                if (typeof window.executeWebdavSync === 'function') {
                    const { syncWebdavEnabled, syncWebdavAuto } = await chrome.storage.sync.get(['syncWebdavEnabled', 'syncWebdavAuto']);
                    if (syncWebdavEnabled && syncWebdavAuto !== false) {
                        window.executeWebdavSync({ manual: false });
                    }
                }
            } catch (_) {}
        }, delay);
    }
    window.scheduleWebdavDebouncedSync = scheduleWebdavDebouncedSync;

    function flushWebdavSync() {
        if (webdavDebounceTimer) {
            clearTimeout(webdavDebounceTimer);
            webdavDebounceTimer = null;
        }
        chrome.storage.sync.get(['syncWebdavEnabled', 'syncWebdavAuto']).then(({ syncWebdavEnabled, syncWebdavAuto }) => {
            if (syncWebdavEnabled && syncWebdavAuto !== false && typeof window.executeWebdavSync === 'function') {
                window.executeWebdavSync({ manual: false });
            }
        }).catch(() => {});
    }
    window.flushWebdavSync = flushWebdavSync;

    function setLocalItem(key, val) {
        memLocal[key] = val;
        openDatabase().then(db => {
            if (!db) return;
            try {
                const tx = db.transaction('local', 'readwrite');
                tx.objectStore('local').put(val, key);
            } catch (e) {
                console.error(`[PureTidings Storage] IndexedDB put local error for ${key}:`, e);
            }
        });
        if (key !== 'allPosts') {
            try {
                localStorage.setItem('pt_local_' + key, JSON.stringify(val));
            } catch (_) {}
        }
        if (key === 'readLinks' || key === 'favoritedLinks' || key === 'summaryLinks' || key === 'feedTree') {
            scheduleWebdavDebouncedSync();
        }
        if (typeof window.scheduleSatelliteStateSync === 'function') {
            window.scheduleSatelliteStateSync();
        }
    }

    function getSyncItem(key, fallback = null) {
        if (key in memSync && memSync[key] !== null && memSync[key] !== undefined) {
            return memSync[key];
        }
        return fallback;
    }

    function setSyncItem(key, val) {
        memSync[key] = val;
        openDatabase().then(db => {
            if (!db) return;
            try {
                const tx = db.transaction('sync', 'readwrite');
                tx.objectStore('sync').put(val, key);
            } catch (e) {
                console.error(`[PureTidings Storage] IndexedDB put sync error for ${key}:`, e);
            }
        });
        try {
            localStorage.setItem('pt_sync_' + key, JSON.stringify(val));
        } catch (_) {}
        if (key === 'rules' || key === 'emailAccounts' || key === 'geminiApiKey') {
            scheduleWebdavDebouncedSync();
        }
        if (typeof window.scheduleSatelliteStateSync === 'function') {
            window.scheduleSatelliteStateSync();
        }
    }

    window.chrome = {
        storage: {
            local: {
                get: function (keys, callback) {
                    return new Promise(async (resolve) => {
                        await openDatabase();
                        const res = {};
                        if (keys === null) {
                            for (const k in memLocal) {
                                res[k] = memLocal[k];
                            }
                        } else {
                            const isObj = keys && typeof keys === 'object' && !Array.isArray(keys);
                            const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
                            keyList.forEach(k => {
                                const val = memLocal[k];
                                if (val !== null && val !== undefined) {
                                    res[k] = val;
                                } else if (isObj && k in keys) {
                                    res[k] = keys[k];
                                }
                            });
                        }
                        if (typeof callback === 'function') callback(res);
                        resolve(res);
                    });
                },
                set: function (items, callback) {
                    return new Promise(async (resolve) => {
                        await openDatabase();
                        const changes = {};
                        const db = await openDatabase();
                        let tx = null;
                        if (db) {
                            try {
                                tx = db.transaction('local', 'readwrite');
                            } catch (e) {
                                console.error('[PureTidings Storage] Transaction error in local.set:', e);
                            }
                        }
                        const store = tx ? tx.objectStore('local') : null;

                        // Preserve existing feedTreeUpdatedAt when feedTree is modified without explicit timestamp
                        if (items && items.feedTree && items.feedTreeUpdatedAt === undefined) {
                            items.feedTreeUpdatedAt = memLocal.feedTreeUpdatedAt || 0;
                        }

                        for (const k in items) {
                            const oldVal = memLocal[k];
                            memLocal[k] = items[k];
                            changes[k] = { oldValue: oldVal, newValue: items[k] };
                            if (store) {
                                try {
                                    store.put(items[k], k);
                                } catch (e) {
                                    console.error(`[PureTidings Storage] Error putting ${k} to IndexedDB:`, e);
                                }
                            }
                            if (k !== 'allPosts') {
                                try {
                                    localStorage.setItem('pt_local_' + k, JSON.stringify(items[k]));
                                } catch (_) {}
                            }
                        }
                        storageListeners.forEach(fn => {
                            try { fn(changes, 'local'); } catch (err) { console.error(err); }
                        });

                        // Trigger debounced WebDAV sync if any synced content changed
                        const syncLocalKeys = ['readLinks', 'favoritedLinks', 'summaryLinks', 'feedTree'];
                        const hasSyncKey = Object.keys(items).some(k => syncLocalKeys.includes(k));
                        if (hasSyncKey && !isWebdavSyncing && !window.isWebdavSyncing && typeof scheduleWebdavDebouncedSync === 'function') {
                            scheduleWebdavDebouncedSync();
                        }

                        // Trigger debounced Satellite companion state sync
                        if (typeof scheduleSatelliteStateSync === 'function') {
                            scheduleSatelliteStateSync();
                        }

                        if (typeof callback === 'function') callback();
                        resolve();
                    });
                },
                remove: function (keys, callback) {
                    return new Promise(async (resolve) => {
                        await openDatabase();
                        const keyList = Array.isArray(keys) ? keys : [keys];
                        const db = await openDatabase();
                        let tx = null;
                        if (db) {
                            try {
                                tx = db.transaction('local', 'readwrite');
                            } catch (e) {
                                console.error('[PureTidings Storage] Transaction error in local.remove:', e);
                            }
                        }
                        const store = tx ? tx.objectStore('local') : null;
                        const changes = {};

                        keyList.forEach(k => {
                            const oldVal = memLocal[k];
                            delete memLocal[k];
                            changes[k] = { oldValue: oldVal, newValue: undefined };
                            if (store) {
                                try { store.delete(k); } catch (_) {}
                            }
                            try { localStorage.removeItem('pt_local_' + k); } catch (_) {}
                        });
                        storageListeners.forEach(fn => {
                            try { fn(changes, 'local'); } catch (err) { console.error(err); }
                        });
                        if (typeof callback === 'function') callback();
                        resolve();
                    });
                },
                clear: function (callback) {
                    return new Promise(async (resolve) => {
                        await openDatabase();
                        const db = await openDatabase();
                        if (db) {
                            try {
                                const tx = db.transaction('local', 'readwrite');
                                tx.objectStore('local').clear();
                            } catch (_) {}
                        }
                        for (const k in memLocal) delete memLocal[k];
                        try {
                            for (let i = localStorage.length - 1; i >= 0; i--) {
                                const k = localStorage.key(i);
                                if (k && (k.startsWith('pt_local_') || k.startsWith('puretidings_local_'))) {
                                    localStorage.removeItem(k);
                                }
                            }
                        } catch (_) {}
                        if (typeof callback === 'function') callback();
                        resolve();
                    });
                }
            },
            sync: {
                get: function (keys, callback) {
                    return new Promise(async (resolve) => {
                        await openDatabase();
                        const res = {};
                        if (keys === null) {
                            for (const k in memSync) {
                                res[k] = memSync[k];
                            }
                        } else {
                            const isObj = keys && typeof keys === 'object' && !Array.isArray(keys);
                            const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
                            keyList.forEach(k => {
                                const val = memSync[k];
                                if (val !== null && val !== undefined) {
                                    res[k] = val;
                                } else if (isObj && k in keys) {
                                    res[k] = keys[k];
                                }
                            });
                        }
                        if (typeof callback === 'function') callback(res);
                        resolve(res);
                    });
                },
                set: function (items, callback) {
                    return new Promise(async (resolve) => {
                        await openDatabase();
                        const changes = {};
                        const db = await openDatabase();
                        let tx = null;
                        if (db) {
                            try {
                                tx = db.transaction('sync', 'readwrite');
                            } catch (e) {
                                console.error('[PureTidings Storage] Transaction error in sync.set:', e);
                            }
                        }
                        const store = tx ? tx.objectStore('sync') : null;

                        for (const k in items) {
                            const oldVal = memSync[k];
                            memSync[k] = items[k];
                            changes[k] = { oldValue: oldVal, newValue: items[k] };
                            if (store) {
                                try {
                                    store.put(items[k], k);
                                } catch (e) {
                                    console.error(`[PureTidings Storage] Error putting sync key ${k} to IndexedDB:`, e);
                                }
                            }
                            try {
                                localStorage.setItem('pt_sync_' + k, JSON.stringify(items[k]));
                            } catch (_) {}
                            if (k === 'darkMode') {
                                applyDesktopTheme(items[k]);
                            }
                        }
                        storageListeners.forEach(fn => {
                            try { fn(changes, 'sync'); } catch (err) { console.error(err); }
                        });

                        // Trigger debounced WebDAV sync if any synced key changed
                        const syncSyncKeys = ['rules', 'emailAccounts', 'appLanguage', 'syncWebdavEnabled', 'syncWebdavUrl', 'syncWebdavUser', 'syncWebdavPass', 'syncWebdavPath', 'syncWebdavAuto'];
                        const hasSyncKey = Object.keys(items).some(k => syncSyncKeys.includes(k));
                        if (hasSyncKey && !isWebdavSyncing && !window.isWebdavSyncing && typeof scheduleWebdavDebouncedSync === 'function') {
                            scheduleWebdavDebouncedSync();
                        }

                        // Trigger debounced Satellite companion state sync
                        if (typeof scheduleSatelliteStateSync === 'function') {
                            scheduleSatelliteStateSync();
                        }

                        if (typeof callback === 'function') callback();
                        resolve();
                    });
                },
                remove: function (keys, callback) {
                    return new Promise(async (resolve) => {
                        await openDatabase();
                        const keyList = Array.isArray(keys) ? keys : [keys];
                        const db = await openDatabase();
                        let tx = null;
                        if (db) {
                            try {
                                tx = db.transaction('sync', 'readwrite');
                            } catch (_) {}
                        }
                        const store = tx ? tx.objectStore('sync') : null;
                        const changes = {};

                        keyList.forEach(k => {
                            const oldVal = memSync[k];
                            delete memSync[k];
                            changes[k] = { oldValue: oldVal, newValue: undefined };
                            if (store) {
                                try { store.delete(k); } catch (_) {}
                            }
                            try { localStorage.removeItem('pt_sync_' + k); } catch (_) {}
                        });
                        storageListeners.forEach(fn => {
                            try { fn(changes, 'sync'); } catch (err) { console.error(err); }
                        });
                        if (typeof callback === 'function') callback();
                        resolve();
                    });
                },
                clear: function (callback) {
                    return new Promise(async (resolve) => {
                        await openDatabase();
                        const db = await openDatabase();
                        if (db) {
                            try {
                                const tx = db.transaction('sync', 'readwrite');
                                tx.objectStore('sync').clear();
                            } catch (_) {}
                        }
                        for (const k in memSync) delete memSync[k];
                        try {
                            for (let i = localStorage.length - 1; i >= 0; i--) {
                                const k = localStorage.key(i);
                                if (k && k.startsWith('pt_sync_')) {
                                    localStorage.removeItem(k);
                                }
                            }
                        } catch (_) {}
                        if (typeof callback === 'function') callback();
                        resolve();
                    });
                }
            },
            onChanged: {
                addListener: function (callback) {
                    if (typeof callback === 'function') storageListeners.push(callback);
                },
                removeListener: function (callback) {
                    const idx = storageListeners.indexOf(callback);
                    if (idx !== -1) storageListeners.splice(idx, 1);
                }
            }
        },
        runtime: {
            openOptionsPage: function () {
                openSettingsModal();
            },
            getURL: function (path) {
                return path;
            },
            sendMessage: async function (msg) {
                if (!msg || typeof msg !== 'object') return { status: 'error' };
                if (msg.action === 'safeStorageSet') {
                    await chrome.storage.local.set({ [msg.key]: msg.data });
                    return { status: 'ok' };
                }
                if (msg.action === 'fetchArticle' && msg.url) {
                    try {
                        const html = await tauriInvoke('fetch_url', { url: msg.url });
                        return { status: 'ok', html };
                    } catch (e) {
                        return { status: 'error', message: e.toString() };
                    }
                }
                if (msg.action === 'fetchYoutubeTranscript' && msg.videoId) {
                    try {
                        const innerTubeUrl = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
                        const body = JSON.stringify({
                            context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
                            videoId: msg.videoId
                        });
                        let dataStr = '';
                        try {
                            dataStr = await tauriInvoke('post_url', {
                                url: innerTubeUrl,
                                body,
                                userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)'
                            });
                        } catch (postErr) {
                            console.warn('[PureTidings Desktop] IPC post_url failed, falling back to direct fetch:', postErr);
                            const directRes = await fetch(innerTubeUrl, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)'
                                },
                                body
                            });
                            dataStr = await directRes.text();
                        }
                        const data = JSON.parse(dataStr);
                        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                        if (tracks && tracks.length > 0) {
                            // Prefer German/English manual tracks over auto-generated, fallback to first available
                            const deManual = tracks.find(t => (t.languageCode === 'de' || t.languageCode?.startsWith('de')) && !t.vssId?.startsWith('a.'));
                            const deAuto = tracks.find(t => t.languageCode === 'de' || t.languageCode?.startsWith('de'));
                            const enManual = tracks.find(t => (t.languageCode === 'en' || t.languageCode?.startsWith('en')) && !t.vssId?.startsWith('a.'));
                            const enAuto = tracks.find(t => t.languageCode === 'en' || t.languageCode?.startsWith('en'));
                            const track = deManual || deAuto || enManual || enAuto || tracks[0];

                            let transcriptXml = '';
                            try {
                                transcriptXml = await tauriInvoke('fetch_url', { url: track.baseUrl });
                            } catch (fetchErr) {
                                console.warn('[PureTidings Desktop] IPC fetch_url for track failed, falling back to direct fetch:', fetchErr);
                                const tRes = await fetch(track.baseUrl);
                                transcriptXml = await tRes.text();
                            }
                            if (transcriptXml && transcriptXml.trim()) {
                                return { status: 'ok', xml: transcriptXml, track: track };
                            }
                            return { status: 'error', message: 'Empty transcript received from YouTube.' };
                        }
                        return { status: 'error', message: 'No transcript tracks found for this video.' };
                    } catch (e) {
                        return { status: 'error', message: e.toString() };
                    }
                }
                if (msg.action === 'getOgImage' && msg.url) {
                    try {
                        const image = await findOgImage(msg.url);
                        return { status: 'ok', image };
                    } catch (e) {
                        return { status: 'error', message: e.toString() };
                    }
                }
                return { status: 'ok' };
            }
        },
        action: {
            setBadgeText: function () {},
            setTitle: function () {},
            setIcon: function () {}
        },
        tabs: {
            create: function (opts) {
                if (!opts || !opts.url) return;
                if (opts.url.startsWith('reader.html?')) {
                    const params = new URLSearchParams(opts.url.substring('reader.html?'.length));
                    const rawUrl = params.get('url') || '';
                    openReaderModal({
                        url: rawUrl,
                        title: params.get('title') || '',
                        description: params.get('description') || '',
                        videoLength: params.get('videoLength') || '',
                        featuredImage: params.get('featuredImage') || '',
                        source: params.get('source') || '',
                        feedId: params.get('feedId') || '',
                        fullContentHtmlText: params.get('fullContentHtmlText') || '',
                        isEmail: params.get('isEmail') === 'true' || rawUrl.startsWith('imap:'),
                        emailUid: params.get('emailUid') || '',
                        accountId: params.get('accountId') || ''
                    });
                } else {
                    tauriOpenBrowser(opts.url);
                }
            }
        }
    };

    // ==========================================
    // 5. Native Feed Fetcher & Parser
    // ==========================================
    function parseFeedXml(xmlString, feed) {
        if (!xmlString || typeof xmlString !== 'string') return [];
        const parser = new DOMParser();
        let doc = parser.parseFromString(xmlString, "application/xml");
        
        let parseError = doc.getElementsByTagName("parsererror");
        if (parseError.length > 0) {
            const fixedXml = xmlString.replace(/<([a-zA-Z0-9:]+)([^>]+)>/g, (match, tagName, attrs) => {
                const fixedAttrs = attrs.replace(/(\s+)([a-zA-Z0-9:\._\-]+)(?!\s*=)(?=\s|>|$)/g, '$1$2=""');
                return `<${tagName}${fixedAttrs}>`;
            });
            doc = parser.parseFromString(fixedXml, "application/xml");
            if (doc.getElementsByTagName("parsererror").length > 0) {
                doc = parser.parseFromString(xmlString, "text/html");
            }
        }

        let items = doc.getElementsByTagName("item");
        if (items.length === 0) {
            items = doc.getElementsByTagName("entry");
        }

        const posts = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const getText = (tag) => {
                const el = item.getElementsByTagName(tag)[0];
                return el ? el.textContent.trim() : "";
            };

            let title = getText("title") || "Untitled";
            if (title) {
                title = title.replace(/<[^>]+>/g, '').trim();
            }
            let link = "";
            const links = item.getElementsByTagName("link");
            for (let j = 0; j < links.length; j++) {
                const l = links[j];
                const rel = l.getAttribute("rel");
                if (!rel || rel === "alternate") {
                    link = l.getAttribute("href") || l.textContent.trim() || "";
                    if (link) break;
                }
            }
            if (!link && links.length > 0) {
                link = links[0].getAttribute("href") || links[0].textContent.trim() || "";
            }
            if (!link && item.getElementsByTagName("id")[0]) {
                link = item.getElementsByTagName("id")[0].textContent.trim();
            }
            if (link && link.includes('google.com/url?') && link.includes('url=')) {
                try {
                    const parsedUrl = new URL(link);
                    const actualUrl = parsedUrl.searchParams.get('url');
                    if (actualUrl) {
                        link = actualUrl;
                    }
                } catch (_) {}
            }

            let dateRaw = getText("pubDate") || getText("pubdate") || getText("published") || getText("updated") || getText("dc:date");
            let date = new Date().toISOString();
            if (dateRaw) {
                try {
                    const parsed = new Date(dateRaw);
                    if (!isNaN(parsed.getTime())) date = parsed.toISOString();
                } catch (_) {}
            }

            let description = "";
            const ce = item.getElementsByTagName("content:encoded");
            if (ce.length > 0) description = ce[0].textContent;
            else {
                const cnt = item.getElementsByTagName("content");
                if (cnt.length > 0) description = cnt[0].textContent;
                else description = getText("description") || getText("summary");
            }
            if (!description) {
                const mediaDesc = item.getElementsByTagName("media:description");
                if (mediaDesc.length > 0) description = mediaDesc[0].textContent;
            }

            let author = getText("author") || getText("dc:creator") || feed.name;
            let featuredImage = null;

            // Thumbnail extraction via namespaced tags
            const mediaThumb = item.getElementsByTagName("media:thumbnail");
            if (mediaThumb.length > 0) featuredImage = mediaThumb[0].getAttribute("url");

            if (!featuredImage) {
                const mediaContent = item.getElementsByTagName("media:content");
                if (mediaContent.length > 0) featuredImage = mediaContent[0].getAttribute("url");
            }

            if (!featuredImage) {
                const enc = item.getElementsByTagName("enclosure");
                if (enc.length > 0 && (enc[0].getAttribute("type") || '').startsWith("image")) {
                    featuredImage = enc[0].getAttribute("url");
                }
            }

            // YouTube detection
            if (feed.url.includes("youtube.com") || link.includes("youtube.com") || link.includes("youtu.be")) {
                const ytMatch = link.match(/(?:v=|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                if (ytMatch) {
                    featuredImage = `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg`;
                }
            }

            if (!featuredImage && description) {
                const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i) ||
                                 description.match(/&lt;img[^>]+src=(?:&quot;|["'])([^"'&]+)(?:&quot;|["'])/i);
                if (imgMatch) featuredImage = imgMatch[1];
            }

            posts.push({
                feedId: feed.id,
                feedName: feed.name,
                title,
                link,
                date,
                description,
                author,
                featuredImage: featuredImage || null
            });
        }
        return posts;
    }

    // ==========================================
    // Email Accounts & IMAP Native Fetcher
    // ==========================================
    const IMAP_PRESETS = {
        custom: { server: '', port: 993 },
        gmail: { server: 'imap.gmail.com', port: 993 },
        outlook: { server: 'outlook.office365.com', port: 993 },
        yahoo: { server: 'imap.mail.yahoo.com', port: 993 },
        gmx: { server: 'imap.gmx.net', port: 993 },
        webde: { server: 'imap.web.de', port: 993 },
        tonline: { server: 'secureimap.t-online.de', port: 993 },
        icloud: { server: 'imap.mail.me.com', port: 993 }
    };

    async function syncEmailAccountsOrderFromFeedTree(tree) {
        try {
            function findFolder(nodes, targetId) {
                for (const n of (nodes || [])) {
                    if (n && n.type === 'folder' && String(n.id) === String(targetId)) return n;
                    if (n && Array.isArray(n.children)) {
                        const found = findFolder(n.children, targetId);
                        if (found) return found;
                    }
                }
                return null;
            }
            const emailFolder = findFolder(tree, 'folder_email_inboxes');
            if (!emailFolder || !Array.isArray(emailFolder.children)) return;
            const rawAccounts = await chrome.storage.sync.get('emailAccounts');
            const emailAccounts = Array.isArray(rawAccounts?.emailAccounts) ? rawAccounts.emailAccounts : [];
            if (!emailAccounts.length) return;
            const orderMap = new Map();
            emailFolder.children.forEach((c, idx) => {
                const accId = String(c.emailAccountId || (c.id && c.id.startsWith('email_') ? c.id.replace('email_', '') : ''));
                if (accId) orderMap.set(accId, idx);
            });
            const reordered = [...emailAccounts].sort((a, b) => {
                const posA = orderMap.has(String(a.id)) ? orderMap.get(String(a.id)) : 9999;
                const posB = orderMap.has(String(b.id)) ? orderMap.get(String(b.id)) : 9999;
                return posA - posB;
            });
            if (JSON.stringify(reordered) !== JSON.stringify(emailAccounts)) {
                await chrome.storage.sync.set({ emailAccounts: reordered });
            }
        } catch (_) {}
    }
    window.syncEmailAccountsOrderFromFeedTree = syncEmailAccountsOrderFromFeedTree;

    async function syncEmailAccountsToFeedTree() {
        try {
            const rawAccounts = await chrome.storage.sync.get('emailAccounts');
            const emailAccounts = Array.isArray(rawAccounts?.emailAccounts) ? rawAccounts.emailAccounts : [];
            const rawTree = await chrome.storage.local.get('feedTree');
            let feedTree = Array.isArray(rawTree?.feedTree) ? rawTree.feedTree : [];

            const activeAccounts = emailAccounts.filter(a => a && a.enabled !== false);
            const activeMap = new Map(activeAccounts.map(a => [String(a.id), a]));

            function findFolderNode(nodes, targetId) {
                for (const n of (nodes || [])) {
                    if (n && n.type === 'folder' && String(n.id) === String(targetId)) return n;
                    if (n && Array.isArray(n.children)) {
                        const found = findFolderNode(n.children, targetId);
                        if (found) return found;
                    }
                }
                return null;
            }

            function removeFolderNode(nodes, targetId) {
                for (let i = 0; i < nodes.length; i++) {
                    if (String(nodes[i].id) === String(targetId)) {
                        nodes.splice(i, 1);
                        return true;
                    }
                    if (nodes[i].children && Array.isArray(nodes[i].children)) {
                        if (removeFolderNode(nodes[i].children, targetId)) return true;
                    }
                }
                return false;
            }

            function removeDisabledEmailNodes(nodes) {
                for (let i = nodes.length - 1; i >= 0; i--) {
                    const n = nodes[i];
                    if (n.type === 'feed' && (n.isEmail || (n.id && String(n.id).startsWith('email_')))) {
                        const accId = String(n.emailAccountId || n.id.replace('email_', ''));
                        if (!activeMap.has(accId)) {
                            nodes.splice(i, 1);
                        }
                    } else if (n.type === 'folder' && Array.isArray(n.children)) {
                        removeDisabledEmailNodes(n.children);
                    }
                }
            }

            let treeChanged = false;

            if (activeAccounts.length === 0) {
                removeDisabledEmailNodes(feedTree);
                if (removeFolderNode(feedTree, 'folder_email_inboxes')) {
                    treeChanged = true;
                }
                if (treeChanged) {
                    const curUpd = (await chrome.storage.local.get('feedTreeUpdatedAt'))?.feedTreeUpdatedAt || Date.now();
                    const lastEdited = (await chrome.storage.local.get('feedTreeLastEditedLocally'))?.feedTreeLastEditedLocally || 0;
                    await chrome.storage.local.set({ feedTree, feedTreeUpdatedAt: curUpd, feedTreeLastEditedLocally: lastEdited });
                }
                return;
            }

            // Remove any disabled/deleted email feeds from anywhere in the tree
            removeDisabledEmailNodes(feedTree);

            // Locate folder_email_inboxes anywhere in the hierarchy
            let emailFolder = findFolderNode(feedTree, 'folder_email_inboxes');
            if (!emailFolder) {
                emailFolder = {
                    id: 'folder_email_inboxes',
                    name: '📬 Email Inboxes',
                    type: 'folder',
                    children: []
                };
                feedTree.push(emailFolder);
                treeChanged = true;
            }
            if (!Array.isArray(emailFolder.children)) {
                emailFolder.children = [];
                treeChanged = true;
            }

            // Map all email nodes already placed anywhere in the tree (including custom folders)
            const locatedEmailMap = new Map();
            function scanTreeForEmails(nodes) {
                for (const n of (nodes || [])) {
                    if (n.type === 'feed' && (n.isEmail || (n.id && String(n.id).startsWith('email_')))) {
                        const accId = String(n.emailAccountId || n.id.replace('email_', ''));
                        locatedEmailMap.set(accId, n);
                    } else if (n.type === 'folder' && Array.isArray(n.children)) {
                        scanTreeForEmails(n.children);
                    }
                }
            }
            scanTreeForEmails(feedTree);

            // Update existing email nodes in place with latest account properties (name, distinct url)
            for (const a of activeAccounts) {
                const accId = String(a.id);
                const distinctUrl = `imap://${encodeURIComponent(a.username)}@${a.server}/${a.folder || 'INBOX'}`;
                const expectedName = '📬 ' + (a.name || a.username);
                if (locatedEmailMap.has(accId)) {
                    const existingNode = locatedEmailMap.get(accId);
                    if (existingNode.name !== expectedName || existingNode.url !== distinctUrl) {
                        existingNode.name = expectedName;
                        existingNode.url = distinctUrl;
                        existingNode.isEmail = true;
                        existingNode.emailAccountId = a.id;
                        treeChanged = true;
                    }
                } else {
                    // New account: append to emailFolder while preserving existing order!
                    emailFolder.children.push({
                        id: 'email_' + a.id,
                        name: expectedName,
                        type: 'feed',
                        url: distinctUrl,
                        isEmail: true,
                        emailAccountId: a.id
                    });
                    treeChanged = true;
                }
            }

            // Sync order back to chrome.storage.sync.emailAccounts so sync and local never conflict
            await syncEmailAccountsOrderFromFeedTree(feedTree);

            if (treeChanged) {
                const now = Date.now();
                const lastEdited = (await chrome.storage.local.get('feedTreeLastEditedLocally'))?.feedTreeLastEditedLocally || 0;
                await chrome.storage.local.set({
                    feedTree,
                    feedTreeUpdatedAt: now,
                    feedTreeLastEditedLocally: lastEdited > 0 ? lastEdited : now
                });
            }
        } catch (err) {
            console.error('[PureTidings Desktop] Error syncing email accounts to feed tree:', err);
        }
    }
    window.syncEmailAccountsToFeedTree = syncEmailAccountsToFeedTree;

    async function fetchSingleEmailAccountNative(account, readLinksSet, rules) {
        if (!account || !account.server || !account.username || !account.password) {
            return [];
        }
        const server = account.server.trim();
        const port = parseInt(account.port, 10) || 993;
        const username = account.username.trim();
        const password = account.password;
        const folder = (account.folder || 'INBOX').trim();
        const limit = parseInt(account.limit, 10) || 30;

        const items = await tauriInvoke('fetch_imap_emails', {
            server,
            port,
            username,
            password,
            folder,
            limit
        });

        const feedId = 'email_' + account.id;
        const posts = (items || []).map(item => {
            const link = `imap://${account.id}/${item.uid}`;
            const postDate = item.date || new Date().toISOString();
            const postObj = {
                id: link,
                link: link,
                title: item.subject || '(No Subject)',
                date: postDate,
                pubDate: postDate,
                snippet: item.snippet || '',
                description: item.snippet || '',
                content: item.content_html || item.content_text || item.snippet || '',
                fullContentHtml: item.content_html || '',
                fullContentHtmlText: item.content_html || '',
                contentText: item.content_text || '',
                content_text: item.content_text || '',
                author: item.from || account.username,
                feedTitle: account.name || account.username,
                feedName: account.name || account.username,
                feedId: feedId,
                isEmail: true,
                emailUid: item.uid,
                accountId: account.id,
                featuredImage: null
            };

            if (!item.is_unread && readLinksSet) {
                readLinksSet.add(link);
            }

            if (typeof applyRulesToPost === 'function' && rules) {
                applyRulesToPost(postObj, rules, readLinksSet);
            }

            return postObj;
        });

        return posts;
    }

    async function markEmailReadNative(accountId, uid, read = true) {
        try {
            if (!accountId || !uid) return;
            const rawAccounts = await chrome.storage.sync.get('emailAccounts');
            const emailAccounts = Array.isArray(rawAccounts?.emailAccounts) ? rawAccounts.emailAccounts : [];
            const account = emailAccounts.find(a => a && a.id === accountId);
            if (!account) return;
            await tauriInvoke('mark_imap_email_read', {
                server: account.server,
                port: parseInt(account.port, 10) || 993,
                username: account.username,
                password: account.password,
                folder: account.folder || 'INBOX',
                uid: parseInt(uid, 10),
                read: !!read
            });
            console.log(`[PureTidings Desktop] Successfully synced read status (${read}) for email UID ${uid} to IMAP server.`);
        } catch (e) {
            console.warn(`[PureTidings Desktop] Could not sync read status for email UID ${uid} to IMAP:`, e);
        }
    }
    window.markEmailReadNative = markEmailReadNative;

    async function refreshAllFeedsNative() {
        const refreshBtn = document.getElementById('sidebar-refresh-btn');
        if (refreshBtn) refreshBtn.classList.add('spinning');

        const loading = document.getElementById('loading-spinner');
        if (loading) loading.classList.remove('hidden');

        try {
            const rawTree = await chrome.storage.local.get(['feedTree', 'allPosts', 'readLinks']);
            const feedTree = Array.isArray(rawTree?.feedTree) ? rawTree.feedTree : [];
            const allPosts = (rawTree?.allPosts && typeof rawTree.allPosts === 'object') ? rawTree.allPosts : {};
            const readLinks = Array.isArray(rawTree?.readLinks) ? rawTree.readLinks : [];

            const rawSync = await chrome.storage.sync.get(['rules', 'emailAccounts']);
            const rules = Array.isArray(rawSync?.rules) ? rawSync.rules : [];
            const emailAccounts = Array.isArray(rawSync?.emailAccounts) ? rawSync.emailAccounts : [];
            const activeEmailAccounts = emailAccounts.filter(a => a && a.enabled !== false);
            const readLinksSet = new Set(readLinks);

            const feeds = [];
            let feedTreeUpdated = false;
            function gather(nodes) {
                for (const n of (nodes || [])) {
                    if (n.type === 'feed') {
                        if (n.url && n.url.includes('UCBJycsmduPZe6541G3gk22Q')) {
                            n.url = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCBJycsmduvYEL83R_U4JriQ';
                            feedTreeUpdated = true;
                        }
                        if (!n.isEmail && !n.id.startsWith('email_')) {
                            feeds.push(n);
                        }
                    } else if (n.type === 'folder' && n.children) {
                        gather(n.children);
                    }
                }
            }
            gather(feedTree);
            if (feedTreeUpdated) {
                chrome.storage.local.set({ feedTree });
            }

            const newAllPosts = { ...allPosts };
            const unreadCounts = {};

            // Cache previously fetched images to prevent flickering or losing thumbnails
            const existingImageMap = new Map();
            for (const fId in allPosts) {
                if (Array.isArray(allPosts[fId])) {
                    allPosts[fId].forEach(p => {
                        if (p.link && p.featuredImage) {
                            existingImageMap.set(p.link, p.featuredImage);
                        }
                    });
                }
            }

            // Fetch RSS feeds and Email inboxes in parallel
            await Promise.all([
                ...feeds.map(async (feed) => {
                    try {
                        const xml = await tauriInvoke('fetch_url', { url: feed.url });
                        const posts = parseFeedXml(xml, feed);
                        if (posts && posts.length > 0) {
                            posts.forEach(p => {
                                if (!p.featuredImage && existingImageMap.has(p.link)) {
                                    p.featuredImage = existingImageMap.get(p.link);
                                }
                                if (typeof applyRulesToPost === 'function') {
                                    applyRulesToPost(p, rules, readLinksSet);
                                }
                            });
                            newAllPosts[feed.id] = posts;

                            let count = 0;
                            posts.forEach(p => {
                                if (!p.isHidden && !readLinksSet.has(p.link)) count++;
                            });
                            unreadCounts[feed.id] = count;

                            // Save incrementally to render in UI
                            await chrome.storage.local.set({
                                allPosts: { ...newAllPosts },
                                unreadCounts: { ...unreadCounts },
                                readLinks: Array.from(readLinksSet)
                            });

                            // Background fetch missing og:images for newest articles
                            const missingImages = posts.filter(p => !p.featuredImage && p.link && p.link.startsWith('http')).slice(0, 12);
                            if (missingImages.length > 0) {
                                (async () => {
                                    let anyFound = false;
                                    await Promise.all(missingImages.map(async (p) => {
                                        try {
                                            const og = await findOgImage(p.link);
                                            if (og) {
                                                p.featuredImage = og;
                                                anyFound = true;
                                            }
                                        } catch (_) {}
                                    }));
                                    if (anyFound) {
                                        const cur = await chrome.storage.local.get('allPosts');
                                        const updatedPosts = cur.allPosts || {};
                                        updatedPosts[feed.id] = posts;
                                        await chrome.storage.local.set({ allPosts: { ...updatedPosts } });
                                    }
                                })();
                            }
                        }
                    } catch (err) {
                        console.warn(`[PureTidings Desktop] Error fetching ${feed.name} (${feed.url}):`, err);
                    }
                }),
                ...activeEmailAccounts.map(async (account) => {
                    try {
                        const feedId = 'email_' + account.id;
                        const posts = await fetchSingleEmailAccountNative(account, readLinksSet, rules);
                        newAllPosts[feedId] = posts;

                        let count = 0;
                        posts.forEach(p => {
                            if (!p.isHidden && !readLinksSet.has(p.link)) count++;
                        });
                        unreadCounts[feedId] = count;

                        await chrome.storage.local.set({
                            allPosts: { ...newAllPosts },
                            unreadCounts: { ...unreadCounts },
                            readLinks: Array.from(readLinksSet)
                        });
                    } catch (err) {
                        console.warn(`[PureTidings Desktop] Error fetching emails for ${account.name || account.username}:`, err);
                    }
                })
            ]);

            // Final sync
            for (const feed of feeds) {
                if (unreadCounts[feed.id] === undefined) {
                    unreadCounts[feed.id] = 0;
                }
            }
            for (const acc of activeEmailAccounts) {
                const fId = 'email_' + acc.id;
                if (unreadCounts[fId] === undefined) {
                    unreadCounts[fId] = 0;
                }
            }
            await chrome.storage.local.set({
                allPosts: newAllPosts,
                unreadCounts: unreadCounts,
                readLinks: Array.from(readLinksSet)
            });

        } catch (e) {
            console.error("Failed to refresh feeds:", e);
        } finally {
            if (loading) loading.classList.add('hidden');
            if (refreshBtn) refreshBtn.classList.remove('spinning');
        }
    }
    window.refreshAllFeedsNative = refreshAllFeedsNative;

    async function refreshSingleFeedNative(targetFeedId) {
        if (!targetFeedId) return;
        try {
            const rawTree = await chrome.storage.local.get(['feedTree', 'allPosts', 'readLinks']);
            const feedTree = Array.isArray(rawTree?.feedTree) ? rawTree.feedTree : [];
            const allPosts = (rawTree?.allPosts && typeof rawTree.allPosts === 'object') ? rawTree.allPosts : {};
            const readLinks = Array.isArray(rawTree?.readLinks) ? rawTree.readLinks : [];

            const rawSync = await chrome.storage.sync.get(['rules', 'emailAccounts']);
            const rules = Array.isArray(rawSync?.rules) ? rawSync.rules : [];
            const emailAccounts = Array.isArray(rawSync?.emailAccounts) ? rawSync.emailAccounts : [];
            const readLinksSet = new Set(readLinks);

            // Handle native IMAP email feeds
            if (targetFeedId.startsWith('email_')) {
                const accountId = targetFeedId.replace('email_', '');
                const account = emailAccounts.find(a => a && String(a.id) === String(accountId));
                if (!account) {
                    console.warn(`[PureTidings Desktop] Email account not found for feed: ${targetFeedId}`);
                    return;
                }
                const posts = await fetchSingleEmailAccountNative(account, readLinksSet, rules);
                const newAllPosts = { ...allPosts, [targetFeedId]: posts };

                let count = 0;
                posts.forEach(p => {
                    if (!p.isHidden && !readLinksSet.has(p.link)) count++;
                });

                const { unreadCounts = {} } = await chrome.storage.local.get(['unreadCounts']);
                const newUnreadCounts = { ...unreadCounts, [targetFeedId]: count };

                await chrome.storage.local.set({
                    allPosts: newAllPosts,
                    unreadCounts: newUnreadCounts,
                    readLinks: Array.from(readLinksSet)
                });

                if (typeof showInAppToast === 'function') {
                    showInAppToast('Inbox Updated', `${account.name || account.username}: ${posts.length} emails (${count} unread)`);
                }
                return;
            }

            let targetFeed = null;
            function findFeed(nodes) {
                for (const n of (nodes || [])) {
                    if (n.type === 'feed' && String(n.id) === String(targetFeedId)) {
                        targetFeed = n;
                        return;
                    } else if (n.type === 'folder' && n.children) {
                        findFeed(n.children);
                    }
                }
            }
            findFeed(feedTree);

            if (!targetFeed || !targetFeed.url) {
                console.warn(`[PureTidings Desktop] Feed not found: ${targetFeedId}`);
                return;
            }

            // Cache previously fetched images
            const existingImageMap = new Map();
            if (Array.isArray(allPosts[targetFeedId])) {
                allPosts[targetFeedId].forEach(p => {
                    if (p.link && p.featuredImage) {
                        existingImageMap.set(p.link, p.featuredImage);
                    }
                });
            }

            const xml = await tauriInvoke('fetch_url', { url: targetFeed.url });
            const posts = parseFeedXml(xml, targetFeed);
            if (posts && posts.length > 0) {
                posts.forEach(p => {
                    if (!p.featuredImage && existingImageMap.has(p.link)) {
                        p.featuredImage = existingImageMap.get(p.link);
                    }
                    if (typeof applyRulesToPost === 'function') {
                        applyRulesToPost(p, rules, readLinksSet);
                    }
                });
                const newAllPosts = { ...allPosts, [targetFeedId]: posts };

                let count = 0;
                posts.forEach(p => {
                    if (!p.isHidden && !readLinksSet.has(p.link)) count++;
                });

                const { unreadCounts = {} } = await chrome.storage.local.get(['unreadCounts']);
                const newUnreadCounts = { ...unreadCounts, [targetFeedId]: count };

                await chrome.storage.local.set({
                    allPosts: newAllPosts,
                    unreadCounts: newUnreadCounts
                });

                // Background scrape missing og:images
                const missingImages = posts.filter(p => !p.featuredImage && p.link && p.link.startsWith('http')).slice(0, 10);
                if (missingImages.length > 0) {
                    (async () => {
                        let anyFound = false;
                        await Promise.all(missingImages.map(async (p) => {
                            try {
                                const og = await findOgImage(p.link);
                                if (og) {
                                    p.featuredImage = og;
                                    anyFound = true;
                                }
                            } catch (_) {}
                        }));
                        if (anyFound) {
                            const cur = await chrome.storage.local.get('allPosts');
                            const updatedPosts = cur.allPosts || {};
                            updatedPosts[targetFeedId] = posts;
                            await chrome.storage.local.set({ allPosts: { ...updatedPosts } });
                        }
                    })();
                }

                if (typeof showInAppToast === 'function') {
                    showInAppToast('Feed Updated', `${targetFeed.name}: ${posts.length} articles`);
                }
            }
        } catch (err) {
            console.error(`[PureTidings Desktop] Error refreshing single feed ${targetFeedId}:`, err);
            if (typeof showInAppToast === 'function') {
                showInAppToast('Feed Refresh Failed', `${err.message || err}`);
            }
        }
    }
    window.refreshSingleFeedNative = refreshSingleFeedNative;

    async function markAllAsReadNative(feedId = null) {
        const { allPosts = {}, readLinks = [] } = await chrome.storage.local.get(['allPosts', 'readLinks']);
        const readLinksSet = new Set(readLinks || []);
        if (feedId) {
            const feedPosts = allPosts[feedId] || [];
            feedPosts.forEach(p => { if (p.link) readLinksSet.add(p.link); });
        } else {
            Object.values(allPosts).flat().forEach(p => { if (p.link) readLinksSet.add(p.link); });
        }

        const newReadLinks = Array.from(readLinksSet);
        const { unreadCounts = {} } = await chrome.storage.local.get(['unreadCounts']);
        const newUnreadCounts = { ...unreadCounts };

        if (feedId) {
            newUnreadCounts[feedId] = 0;
        } else {
            for (const fId in allPosts) {
                newUnreadCounts[fId] = 0;
            }
        }

        await chrome.storage.local.set({
            readLinks: newReadLinks,
            unreadCounts: newUnreadCounts
        });
    }
    window.markAllAsReadNative = markAllAsReadNative;

    async function markAllAsUnreadNative(feedId = null) {
        const { allPosts = {}, readLinks = [] } = await chrome.storage.local.get(['allPosts', 'readLinks']);
        let readLinksSet = new Set(readLinks || []);
        if (feedId) {
            const feedPosts = allPosts[feedId] || [];
            feedPosts.forEach(p => { if (p.link) readLinksSet.delete(p.link); });
        } else {
            readLinksSet.clear();
        }

        const newReadLinks = Array.from(readLinksSet);
        const { unreadCounts = {} } = await chrome.storage.local.get(['unreadCounts']);
        const newUnreadCounts = { ...unreadCounts };

        if (feedId) {
            let count = 0;
            (allPosts[feedId] || []).forEach(p => {
                if (!p.isHidden && !readLinksSet.has(p.link)) count++;
            });
            newUnreadCounts[feedId] = count;
        } else {
            for (const fId in allPosts) {
                let count = 0;
                (allPosts[fId] || []).forEach(p => {
                    if (!p.isHidden && !readLinksSet.has(p.link)) count++;
                });
                newUnreadCounts[fId] = count;
            }
        }

        await chrome.storage.local.set({
            readLinks: newReadLinks,
            unreadCounts: newUnreadCounts
        });
    }
    window.markAllAsUnreadNative = markAllAsUnreadNative;

    // ==========================================
    // 6. Gemini AI Helper
    // ==========================================
    async function getAvailableGeminiModelsDesktop(apiKey) {
        if (typeof getAvailableGeminiModels === 'function') {
            try {
                const models = await getAvailableGeminiModels(apiKey);
                if (models && models.length > 0) return models;
            } catch (e) {
                console.warn("[PureTidings Desktop] getAvailableGeminiModels failed:", e);
            }
        }
        // Direct fetch from Google API if utils.js isn't available or fails
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (res.ok) {
                const data = await res.json();
                const supported = (data.models || [])
                    .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent') && m.name && m.name.includes('gemini'))
                    .map(m => m.name.replace('models/', ''));
                if (supported.length > 0) {
                    supported.sort((a, b) => {
                        const aIsFlash = a.includes('flash');
                        const bIsFlash = b.includes('flash');
                        const aIsPro = a.includes('pro');
                        const bIsPro = b.includes('pro');
                        if (aIsFlash && !bIsFlash) return -1;
                        if (!aIsFlash && bIsFlash) return 1;
                        if (aIsPro && !bIsPro) return -1;
                        if (!aIsPro && bIsPro) return 1;
                        return b.localeCompare(a);
                    });
                    return supported;
                }
            }
        } catch (_) {}

        return [
            'gemini-2.0-flash',
            'gemini-1.5-flash-latest',
            'gemini-1.5-flash',
            'gemini-1.5-pro-latest',
            'gemini-1.5-pro',
            'gemini-pro'
        ];
    }

    async function callGeminiApi(apiKey, systemPrompt, userContent) {
        const cleanApiKey = (apiKey || '').trim();
        if (!cleanApiKey) {
            throw new Error("Google Gemini API Key is missing. Please enter your key in Settings > AI Features.");
        }

        const promptText = `${(systemPrompt || '').trim()}\n\nContent:\n${(userContent || '').trim().substring(0, 30000)}`;
        const modelsToTry = await getAvailableGeminiModelsDesktop(cleanApiKey);
        console.log("[PureTidings Desktop] Attempting Gemini models:", modelsToTry);

        let lastErrorMsg = null;

        for (const model of modelsToTry) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanApiKey}`;
            const bodyStr = JSON.stringify({
                contents: [{
                    parts: [{
                        text: promptText
                    }]
                }]
            });

            // 1. Try standard browser fetch first (CORS allowed by Google APIs)
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: bodyStr
                });

                if (res.ok) {
                    const data = await res.json();
                    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                        console.log(`[PureTidings Desktop] Successfully generated AI summary using model: ${model}`);
                        return text;
                    }
                } else {
                    const errData = await res.json().catch(() => null);
                    lastErrorMsg = errData?.error?.message || `HTTP Error ${res.status} (${res.statusText})`;
                    console.warn(`[PureTidings Desktop] Model ${model} returned error:`, lastErrorMsg);
                    continue;
                }
            } catch (fetchErr) {
                console.warn(`[PureTidings Desktop] Direct fetch for model ${model} failed, trying IPC post_url:`, fetchErr);
            }

            // 2. Native Rust IPC fallback if fetch is blocked
            try {
                const resText = await tauriInvoke('post_url', {
                    url,
                    body: bodyStr,
                    userAgent: 'PureTidingsDesktop/1.0'
                });
                const data = JSON.parse(resText);
                const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    console.log(`[PureTidings Desktop] Successfully generated AI summary via IPC using model: ${model}`);
                    return text;
                }
            } catch (ipcErr) {
                lastErrorMsg = ipcErr?.message || ipcErr?.toString() || lastErrorMsg;
                console.warn(`[PureTidings Desktop] Native post_url for model ${model} failed:`, lastErrorMsg);
            }
        }

        throw new Error(lastErrorMsg || "AI request failed for all attempted Gemini models.");
    }

    // Helper: Find existing feed by URL in hierarchical feed tree
    function findFeedByUrlInTree(tree, targetUrl) {
        if (!tree || !Array.isArray(tree) || !targetUrl) return null;
        const cleanTarget = targetUrl.trim().replace(/\/+$/, '').toLowerCase();
        function walk(nodes) {
            for (const node of nodes) {
                if (node.type === 'feed' && node.url) {
                    const cleanNodeUrl = node.url.trim().replace(/\/+$/, '').toLowerCase();
                    if (cleanNodeUrl === cleanTarget) {
                        return node;
                    }
                }
                if (node.children && Array.isArray(node.children)) {
                    const found = walk(node.children);
                    if (found) return found;
                }
            }
            return null;
        }
        return walk(tree);
    }
    window.findFeedByUrlInTree = findFeedByUrlInTree;

    // ==========================================
    // 7. Feed Discovery & Subscription (Question 4)
    // ==========================================
    async function discoverAndSubscribeFeed(inputUrl, targetFolderId = '', customName = '') {
        let cleanUrl = inputUrl.trim();
        if (!cleanUrl) return null;
        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
            cleanUrl = 'https://' + cleanUrl;
        }

        const { feedTree = [] } = await chrome.storage.local.get('feedTree');

        // Check if the input URL already exists before network requests
        const preCheckFeed = findFeedByUrlInTree(feedTree, cleanUrl);
        if (preCheckFeed) {
            const promptMsg = (window.i18n && typeof window.i18n.t === 'function')
                ? window.i18n.t('feed_already_exists_confirm', { name: preCheckFeed.name || preCheckFeed.url })
                : `This feed URL is already subscribed as "${preCheckFeed.name || preCheckFeed.url}". Do you really want to add it a second time?`;
            const confirmed = window.confirm(promptMsg);
            if (!confirmed) {
                return null;
            }
        }

        let feedUrl = cleanUrl;
        let feedName = (typeof customName === 'string' && customName.trim()) ? customName.trim() : '';

        // Check if YouTube
        const ytChannelMatch = cleanUrl.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);
        const ytCustomMatch = cleanUrl.match(/youtube\.com\/@([a-zA-Z0-9_-]+)/);
        const ytVideoMatch = cleanUrl.match(/(?:v=|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);

        if (ytChannelMatch) {
            feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${ytChannelMatch[1]}`;
            if (!feedName) feedName = `YouTube Channel`;
        } else if (ytCustomMatch || ytVideoMatch) {
            try {
                const pageHtml = await tauriInvoke('fetch_url', { url: cleanUrl });
                const rssMatch = pageHtml.match(/https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=([a-zA-Z0-9_-]+)/);
                if (rssMatch) {
                    feedUrl = rssMatch[0];
                }
                if (!feedName) {
                    const titleMatch = pageHtml.match(/<title>([^<]+)<\/title>/i);
                    if (titleMatch) feedName = titleMatch[1].replace(' - YouTube', '').trim();
                }
            } catch (e) {
                console.warn("YouTube discovery error:", e);
            }
        } else if (!cleanUrl.endsWith('.xml') && !cleanUrl.endsWith('.rss') && !cleanUrl.includes('/feed') && !cleanUrl.includes('/rss')) {
            // General website: fetch HTML and search for <link rel="alternate" type="application/rss+xml">
            try {
                const pageHtml = await tauriInvoke('fetch_url', { url: cleanUrl });
                const parser = new DOMParser();
                const doc = parser.parseFromString(pageHtml, "text/html");
                const feedLink = doc.querySelector('link[type="application/rss+xml"], link[type="application/atom+xml"]');
                if (feedLink && feedLink.getAttribute('href')) {
                    const href = feedLink.getAttribute('href');
                    feedUrl = new URL(href, cleanUrl).toString();
                }
                if (!feedName) {
                    const titleEl = doc.querySelector('title');
                    if (titleEl) feedName = titleEl.textContent.trim();
                }
            } catch (e) {
                console.warn("HTML feed discovery error:", e);
            }
        }

        // If discovery resolved to a different feed URL, check if that feed URL already exists
        if (feedUrl !== cleanUrl) {
            const resolvedCheckFeed = findFeedByUrlInTree(feedTree, feedUrl);
            if (resolvedCheckFeed) {
                const promptMsg = (window.i18n && typeof window.i18n.t === 'function')
                    ? window.i18n.t('feed_already_exists_confirm', { name: resolvedCheckFeed.name || resolvedCheckFeed.url })
                    : `This feed URL is already subscribed as "${resolvedCheckFeed.name || resolvedCheckFeed.url}". Do you really want to add it a second time?`;
                const confirmed = window.confirm(promptMsg);
                if (!confirmed) {
                    return null;
                }
            }
        }

        if (!feedName) {
            try {
                const u = new URL(cleanUrl);
                feedName = u.hostname.replace(/^www\./, '');
            } catch (e) {
                feedName = cleanUrl;
            }
        }

        const newFeed = {
            id: 'feed-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            name: feedName,
            url: feedUrl,
            type: 'feed',
            fetchOgImage: true
        };

        if (targetFolderId) {
            function addToFolder(nodes) {
                for (const n of nodes) {
                    if (n.id === targetFolderId && n.type === 'folder') {
                        if (!n.children) n.children = [];
                        n.children.push(newFeed);
                        return true;
                    }
                    if (n.children && addToFolder(n.children)) return true;
                }
                return false;
            }
            addToFolder(feedTree);
        } else {
            feedTree.push(newFeed);
        }

        const now = Date.now();
        await chrome.storage.local.set({ feedTree, feedTreeUpdatedAt: now, feedTreeLastEditedLocally: now });
        if (typeof renderSettingsFeeds === 'function') {
            renderSettingsFeeds();
        }
        await refreshSingleFeedNative(newFeed.id);
        return { name: feedName, url: feedUrl };
    }
    window.discoverAndSubscribeFeed = discoverAndSubscribeFeed;

    // ==========================================
    // 8. AI URL Summarizer & Dynamic Prompt Engine
    // ==========================================
    function isLegacyGenericPrompt(text) {
        if (!text || !text.trim()) return true;
        const t = text.trim().toLowerCase();
        return (
            t === "create a concise, insightful summary of this article highlighting the core facts and takeaways." ||
            t === "provide a concise summary and highlight the key takeaways of the following article in markdown format." ||
            t.startsWith("create a concise, insightful summary") ||
            t.startsWith("provide a concise summary and highlight the key takeaways") ||
            t === "create a comprehensive and well-structured summary of this youtube video with key takeaways and bullet points." ||
            t.startsWith("create a comprehensive and well-structured summary of this youtube video") ||
            t.startsWith("you are an assistant that summarizes youtube videos")
        );
    }
    window.isLegacyGenericPrompt = isLegacyGenericPrompt;

    function getDefaultAiPrompt(type, lang = 'en') {
        const l = (lang || 'en').toLowerCase().substring(0, 2);
        if (type === 'youtube') {
            if (l === 'de') {
                return `Du bist ein intelligenter Assistent, der YouTube-Videos präzise und fundiert zusammenfasst. Erstelle die Antwort auf Deutsch, klar gegliedert in zwei Abschnitte mit exakt diesen Markdown-Überschriften:

### 📝 Zusammenfassung aus der Videobeschreibung
[Erstelle hier eine prägnante Zusammenfassung der Videobeschreibung]

### 🎥 Zusammenfassung aus dem Videoskript (Transkript)
[Erstelle hier eine fundierte Zusammenfassung mit 3-5 Kernpunkten als Aufzählung, jeweils beginnend mit einem fettgedruckten Thema (z.B. * **Thema:** Erläuterung), basierend auf dem Transkript/Skript des Videos]

Falls sowohl Beschreibung als auch Transkript vorliegen, zeige BEIDE Abschnitte. Falls kein Transkript geladen werden konnte, zeige dennoch beide Überschriften und notiere unter dem Skript-Abschnitt: 'Kein Videoskript (Transkript) verfügbar. Zusammenfassung basiert nur auf der Beschreibung.' Ignoriere Werbeeinblendungen und Sponsorenhinweise.`;
            }
            if (l === 'es') {
                return `Eres un asistente inteligente que resume videos de YouTube. Genera una respuesta en español claramente dividida en dos secciones con estos encabezados Markdown exactos:

### 📝 Resumen de la descripción del video
[Proporciona un resumen conciso del texto de la descripción aquí]

### 🎥 Resumen del guión del video (transcripción)
[Proporciona un resumen sólido con 3-5 puntos clave, cada uno comenzando con una categoría en negrita (ej. * **Tema:** Explicación), basado en la transcripción/guión del video]

Si se proporcionan tanto la descripción como la transcripción, DEBES mostrar ambas secciones. Si no se pudo cargar la transcripción, muestra ambos encabezados y escribe debajo: 'No hay transcripción disponible. El resumen se basa únicamente en la descripción.' Ignora publicidad o menciones a patrocinadores.`;
            }
            if (l === 'fr') {
                return `Vous êtes un assistant intelligent qui résume des vidéos YouTube. Générez une réponse en français clairement divisée en deux sections avec ces titres Markdown exacts :

### 📝 Résumé de la description de la vidéo
[Fournissez un résumé concis de la description de la vidéo ici]

### 🎥 Résumé du script de la vidéo (transcription)
[Fournissez un résumé approfondi avec 3-5 points clés, chacun commençant par une catégorie en gras (ex. * **Thème :** Explication), basé sur la transcription/script de la vidéo]

Si la description et la transcription sont fournies, vous DEVEZ afficher les deux sections. Si la transcription n'a pas pu être chargée, affichez les deux titres et écrivez : 'Aucune transcription disponible. Le résumé est basé uniquement sur la description.' Ignorez les publicités et sponsors.`;
            }
            // Default English
            return `You are an intelligent assistant that summarizes YouTube videos. Generate a response in English clearly divided into two distinct sections using these exact Markdown headings:

### 📝 Summary from Video Description
[Provide a concise summary of the video's description text here]

### 🎥 Summary from Video Script
[Provide a comprehensive summary and 3-5 key takeaways in bullet points, each beginning with a bold topic category (e.g. * **Topic:** Explanation), based on the video transcript]

If both description and transcript are provided, you MUST show both sections. If the transcript could not be loaded, still display both headers but under the script header write: 'No video script (transcript) available. Summary is based only on the description.' Ignore advertisements or sponsor mentions in the text.`;
        }

        // Default: 'article' / website URL summary
        if (l === 'de') {
            return `Erstelle eine präzise, hochwertige und fundierte Zusammenfassung der bereitgestellten Inhalte (Website oder Artikel) auf Deutsch im Markdown-Format.

Befolge exakt diese Struktur:
1. Einleitender Satz (1-2 Sätze): Eine prägnante Einführung, worum es sich bei der Website bzw. dem Artikel handelt.
2. Überschrift: '### Kerninhalte der Seite' (bzw. '### Kerninhalte des Artikels')
3. Strukturierte Stichpunkte mit fettgedruckter Themenkategorie:
   - Fasse alle wesentlichen Aspekte in klaren Aufzählungspunkten zusammen, jeweils beginnend mit einem prägnanten fettgedruckten Thema (z.B. '* **Zweck & Philosophie:** ...').
   - Falls die Seite Struktur- oder Themenbereiche, Rubriken oder Menüpunkte aufweist (wie Navigation, Kapitel oder Kategorien), liste diese als eingerückte Unterpunkte auf (z.B.:
     * **Struktur & Themenbereiche:**
       * **Kategorie 1:** Kurze Erläuterung
       * **Kategorie 2:** Kurze Erläuterung).
Verwende sauberes Standard-Markdown mit Aufzählungszeichen (* oder -). Keine unnötigen Floskeln.`;
        }
        if (l === 'es') {
            return `Crea un resumen preciso, de alta calidad y bien estructurado del contenido proporcionado (sitio web o artículo) en español en formato Markdown.

Sigue exactamente esta estructura:
1. Oración introductoria (1-2 oraciones): Una descripción general concisa que explique de qué trata el sitio web o artículo.
2. Encabezado: '### Contenidos clave de la página' (o '### Contenidos clave del artículo')
3. Puntos estructurados con categorías en negrita:
   - Resume los aspectos esenciales en viñetas claras, cada una comenzando con una etiqueta de tema en negrita (ej. '* **Propósito y Filosofía:** ...').
   - Si la página presenta secciones estructurales, temas o categorías de navegación, preséntalas como subviñetas sangradas (ej.:
     * **Estructura y Secciones:**
       * **Sección 1:** Breve explicación
       * **Sección 2:** Breve explicación).
Usa Markdown estándar con viñetas (* o -). Evita frases introductorias innecesarias.`;
        }
        if (l === 'fr') {
            return `Créez un résumé précis, de haute qualité et bien structuré du contenu fourni (site web ou article) en français au format Markdown.

Suivez exactement cette structure :
1. Phrase d'introduction (1-2 phrases) : Une vue d'ensemble concise présentant le sujet du site web ou de l'article.
2. Titre : '### Contenus clés de la page' (ou '### Contenus clés de l'article')
3. Points structurés avec catégorie en gras :
   - Résumez les aspects essentiels sous forme de puces claires, commençant chacune par un thème en gras (ex. '* **Objectif & Philosophie :** ...').
   - Si la page comporte des sections structurelles, thèmes ou rubriques de navigation, présentez-les sous forme de sous-puces indentées (ex. :
     * **Structure & Rubriques :**
       * **Rubrique 1 :** Brève explication
       * **Rubrique 2 :** Brève explication).
Utilisez du Markdown propre avec des puces (* ou -). Pas de phrases de remplissage inutiles.`;
        }
        // Default English
        return `Create a precise, high-quality, and well-structured summary of the provided content (website or article) in English using Markdown format.

Follow this exact structure:
1. Introductory sentence (1-2 sentences): A concise overview introducing what the website or article is about.
2. Heading: '### Core Content of the Page' (or '### Core Content of the Article')
3. Structured bullet points with bold topic categories:
   - Summarize key aspects in clear bullet points, each beginning with a bolded topic label (e.g. '* **Purpose & Philosophy:** ...').
   - If the page contains distinct structural sections, topics, or navigation categories, present them as indented sub-bullets (e.g.:
     * **Website Structure & Sections:**
       * **Section 1:** Brief explanation
       * **Section 2:** Brief explanation).
Use clean Markdown with standard bullet points (* or -). Avoid unnecessary filler phrases.`;
    }
    window.getDefaultAiPrompt = getDefaultAiPrompt;

    function isDefaultPrompt(text, type) {
        if (!text || !text.trim() || isLegacyGenericPrompt(text)) return true;
        const clean = text.trim();
        const langs = ['en', 'de', 'es', 'fr'];
        for (const lang of langs) {
            if (clean === getDefaultAiPrompt(type, lang).trim()) {
                return true;
            }
        }
        return false;
    }
    window.isDefaultPrompt = isDefaultPrompt;

    function syncReaderAiContainer(markdown, html, prompt, type) {
        const container = document.getElementById('reader-ai-container');
        const contentEl = document.getElementById('reader-ai-content');
        const promptInput = document.getElementById('reader-ai-prompt-input');
        const headerTitle = document.getElementById('reader-ai-header-title');
        const genBtn = document.getElementById('reader-ai-generate-btn');
        if (container && contentEl) {
            container.style.display = 'block';
            contentEl.innerHTML = html;
            if (headerTitle) {
                headerTitle.textContent = type === 'youtube'
                    ? (window.i18n ? window.i18n.t('reader_ai_yt_summary') : '🎥 AI Video Summary')
                    : (window.i18n ? window.i18n.t('reader_ai_summary') : '🤖 AI Article Summary');
            }
            if (promptInput && prompt) {
                promptInput.value = prompt;
            }
            if (genBtn && type) {
                genBtn.dataset.type = type;
            }
        }
    }

    async function summarizeAnyUrl(inputUrl) {
        const cleanUrl = inputUrl.trim();
        if (!cleanUrl) return;

        openReaderModal({
            url: cleanUrl,
            title: 'Analyzing: ' + cleanUrl,
            description: '<p>Fetching content and preparing AI summary...</p>',
            source: 'Direct URL'
        });

        const isYt = cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be');
        const ytMatch = cleanUrl.match(/(?:v=|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        const currentLang = (window.i18n && window.i18n.currentLanguage) || 'en';

        if (isYt && ytMatch) {
            const videoId = ytMatch[1];
            try {
                const res = await chrome.runtime.sendMessage({ action: 'fetchYoutubeTranscript', videoId });
                let transcriptText = "";
                if (res && res.status === 'ok' && res.xml) {
                    transcriptText = extractTranscriptText(res.xml);
                }
                const { geminiApiKey, youtubeAiPrompt } = await chrome.storage.sync.get(['geminiApiKey', 'youtubeAiPrompt']);
                if (!geminiApiKey) {
                    alert("Please set your Google Gemini API Key in Settings first to generate AI summaries.");
                    return;
                }
                const prompt = (!youtubeAiPrompt || isLegacyGenericPrompt(youtubeAiPrompt))
                    ? getDefaultAiPrompt('youtube', currentLang)
                    : youtubeAiPrompt;

                let contentPayload = `Video URL: ${cleanUrl}\n\n`;
                if (transcriptText) {
                    contentPayload += `Video Script / Transcript:\n${transcriptText}`;
                } else {
                    contentPayload += `Video Script / Transcript:\nNo video script (transcript) available for ${cleanUrl}`;
                }

                const aiResult = await callGeminiApi(geminiApiKey, prompt, contentPayload);
                const formattedHtml = typeof formatMarkdownToHtml === 'function' ? formatMarkdownToHtml(aiResult) : escapeHtml(aiResult).replace(/\n/g, '<br>');

                openReaderModal({
                    url: cleanUrl,
                    title: 'YouTube Video AI Summary',
                    description: `
                        <div class="ai-summary-card">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
                                <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;">
                                    <span>🎥</span> ${window.i18n ? window.i18n.t('reader_ai_yt_summary') : 'AI Video Summary'}
                                </h3>
                                <span style="font-size: 11px; opacity: 0.7;">Powered by Gemini</span>
                            </div>
                            <div class="ai-summary-body">
                                ${formattedHtml}
                            </div>
                        </div>
                    `,
                    source: 'YouTube Video'
                });
                currentReaderAiMarkdown = aiResult;
                syncReaderAiContainer(aiResult, formattedHtml, prompt, 'youtube');
            } catch (err) {
                alert("Failed to summarize video: " + err.message);
            }
        } else {
            // General Web Article or Website URL
            try {
                const html = await tauriInvoke('fetch_url', { url: cleanUrl });
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, "text/html");

                // Extract rich site structure, navigation & sections
                const siteName = doc.querySelector('meta[property="og:site_name"]')?.content || new URL(cleanUrl).hostname;
                const metaDesc = doc.querySelector('meta[name="description"]')?.content || doc.querySelector('meta[property="og:description"]')?.content || '';

                const navLinks = Array.from(doc.querySelectorAll('nav a, header a, .menu a, .nav a, ul.navigation a, [id*="menu"] a, [class*="menu"] a'))
                    .map(a => a.textContent.trim())
                    .filter(t => t.length > 1 && t.length < 50 && !/^(sign in|log in|anmelden|login|register|cookie|datenschutz|privacy|impressum)/i.test(t));
                const uniqueNav = [...new Set(navLinks)].slice(0, 20);

                const headings = Array.from(doc.querySelectorAll('h1, h2, h3'))
                    .map(h => h.textContent.trim())
                    .filter(t => t.length > 2 && t.length < 100);
                const uniqueHeadings = [...new Set(headings)].slice(0, 20);

                let article = null;
                try {
                    const reader = new Readability(doc.cloneNode(true));
                    article = reader.parse();
                } catch (re) {
                    console.warn('[PureTidings Desktop] Readability parse error:', re);
                }

                const bodyText = article?.textContent || (doc.body ? doc.body.innerText : html.substring(0, 15000));
                const title = article?.title || doc.title || cleanUrl;

                let contentPayload = `Website / Article URL: ${cleanUrl}\n`;
                if (siteName) contentPayload += `Site Name: ${siteName}\n`;
                if (title) contentPayload += `Title: ${title}\n`;
                if (metaDesc) contentPayload += `Meta Description: ${metaDesc}\n`;
                if (uniqueNav.length > 0) contentPayload += `Website Navigation / Main Sections: ${uniqueNav.join(', ')}\n`;
                if (uniqueHeadings.length > 0) contentPayload += `Page Headings / Structure: ${uniqueHeadings.join(' | ')}\n`;
                contentPayload += `\nMain Content:\n${bodyText.substring(0, 30000)}`;

                const { geminiApiKey, aiReportPrompt } = await chrome.storage.sync.get(['geminiApiKey', 'aiReportPrompt']);
                if (!geminiApiKey) {
                    alert("Please set your Google Gemini API Key in Settings first to generate AI summaries.");
                    return;
                }

                const prompt = (!aiReportPrompt || isLegacyGenericPrompt(aiReportPrompt))
                    ? getDefaultAiPrompt('article', currentLang)
                    : aiReportPrompt;

                const aiResult = await callGeminiApi(geminiApiKey, prompt, contentPayload);
                const formattedHtml = typeof formatMarkdownToHtml === 'function' ? formatMarkdownToHtml(aiResult) : escapeHtml(aiResult).replace(/\n/g, '<br>');

                const originalArticleHtml = article?.content || (bodyText ? formatContentIfPlain(bodyText) : '<p>Original content extracted.</p>');
                const summaryLabel = window.i18n ? window.i18n.t('reader_ai_summary') : 'AI Article Summary';
                const originalLabel = window.i18n ? (window.i18n.currentLanguage === 'de' ? 'Originaler Seiteninhalt (Volltext)' : 'Original Page Content') : 'Original Page Content';

                openReaderModal({
                    url: cleanUrl,
                    title: title,
                    featuredImage: '',
                    description: `
                        <div class="ai-summary-card">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
                                <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;">
                                    <span>🤖</span> ${summaryLabel}
                                </h3>
                                <span style="font-size: 11px; opacity: 0.7;">Powered by Gemini</span>
                            </div>
                            <div class="ai-summary-body">
                                ${formattedHtml}
                            </div>
                        </div>
                        <details style="margin-top: 24px; border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px; background: var(--hover-bg);">
                            <summary style="font-weight: 600; cursor: pointer; color: var(--accent-color, #1a73e8); outline: none;">
                                📄 ${originalLabel}
                            </summary>
                            <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-color); font-size: 14px; line-height: 1.6;">
                                ${originalArticleHtml}
                            </div>
                        </details>
                    `,
                    source: siteName || new URL(cleanUrl).hostname
                });
                currentReaderAiMarkdown = aiResult;
                syncReaderAiContainer(aiResult, formattedHtml, prompt, 'article');
            } catch (err) {
                alert("Failed to summarize URL: " + err.message);
            }
        }
    }
    window.summarizeAnyUrl = summarizeAnyUrl;

    // ==========================================
    // 9. Modal Management (Settings, Reader, Quick Add, Summarize) & Automation Engine
    // ==========================================
    function escapeHtml(str) {
        return (str || '').replace(/[&<>"']/g, m => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[m]);
    }
    window.escapeHtml = escapeHtml;

    function escapeXml(str) {
        if (!str) return '';
        return String(str).replace(/[<>&'"]/g, c => ({
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            "'": '&apos;',
            '"': '&quot;'
        })[c]);
    }
    window.escapeXml = escapeXml;

    function showInAppToast(title, message, isSummary = false, durationMs = 6000) {
        const container = document.getElementById('desktop-toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'desktop-toast' + (isSummary ? ' toast-summary' : '');
        toast.innerHTML = `
            <div class="desktop-toast-title">
                <span>${isSummary ? '📋' : '🔔'}</span>
                <span>${escapeHtml(title)}</span>
            </div>
            <div class="desktop-toast-body">${escapeHtml(message).replace(/\n/g, '<br>')}</div>
        `;

        const dismiss = () => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, 300);
        };
        toast.addEventListener('click', dismiss);

        container.appendChild(toast);

        if (durationMs > 0) {
            setTimeout(dismiss, durationMs);
        }
    }
    window.showInAppToast = showInAppToast;

    let wakeLockSentinel = null;
    async function applyWakeLock(enable) {
        if (!('wakeLock' in navigator)) return;
        try {
            if (enable) {
                if (!wakeLockSentinel) {
                    wakeLockSentinel = await navigator.wakeLock.request('screen');
                    wakeLockSentinel.addEventListener('release', () => {
                        wakeLockSentinel = null;
                    });
                }
            } else {
                if (wakeLockSentinel) {
                    await wakeLockSentinel.release();
                    wakeLockSentinel = null;
                }
            }
        } catch (err) {
            console.warn("[PureTidings] WakeLock error:", err);
        }
    }
    window.applyWakeLock = applyWakeLock;

    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            try {
                const { keepScreenAwake } = await chrome.storage.sync.get(['keepScreenAwake']);
                if (keepScreenAwake) applyWakeLock(true);
            } catch (_) {}
        }
    });

    async function showDesktopNotification(title, message) {
        try {
            const isAndroid = document.documentElement.classList.contains('is-android') || /Android/i.test(navigator.userAgent);

            // Check / request notification permission and create channel on Android
            if (isAndroid && window.__TAURI__?.core?.invoke) {
                try {
                    await tauriInvoke('plugin:notification|create_channel', {
                        id: 'puretidings_articles',
                        name: 'PureTidings Articles',
                        description: 'Notifications for new articles and unread reminders',
                        importance: 4, // Importance.High
                        visibility: 1, // Visibility.Public
                        lights: true,
                        vibration: true
                    });
                } catch (_) {}

                try {
                    const granted = await tauriInvoke('plugin:notification|is_permission_granted');
                    if (!granted) {
                        await tauriInvoke('plugin:notification|request_permission');
                    }
                } catch (_) {}
            }

            // Attempt native notification via Tauri IPC
            try {
                await tauriInvoke('show_native_notification', {
                    title: title || "PureTidings",
                    message: message || ""
                });
            } catch (ipcErr) {
                console.warn("[PureTidings Desktop] Native notification invoke failed:", ipcErr);
            }

            // Fallback to Web Notification API if supported (desktop browsers)
            if (!isAndroid && 'Notification' in window) {
                if (Notification.permission === 'granted') {
                    new Notification(title, { body: message, icon: 'icon.png' });
                } else if (Notification.permission !== 'denied') {
                    const perm = await Notification.requestPermission();
                    if (perm === 'granted') {
                        new Notification(title, { body: message, icon: 'icon.png' });
                    }
                }
            }
        } catch (err) {
            console.warn("[PureTidings Desktop] Desktop notification error:", err);
        }
    }
    window.showDesktopNotification = showDesktopNotification;

    function showStatusBadge(boxId, type, message, timeoutMs = 6000) {
        const box = document.getElementById(boxId);
        if (!box) return;
        box.innerHTML = `<div class="status-badge ${type}">${escapeHtml(message)}</div>`;
        box.style.display = 'block';
        if (timeoutMs > 0) {
            setTimeout(() => {
                if (box.textContent.includes(message)) {
                    box.style.display = 'none';
                    box.innerHTML = '';
                }
            }, timeoutMs);
        }
    }
    window.showStatusBadge = showStatusBadge;

    function renderDesktopScheduleTable(schedule = {}) {
        const tableBody = document.querySelector('#desktop-schedule-table tbody');
        if (!tableBody) return;
        tableBody.innerHTML = '';
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        days.forEach((day, idx) => {
            const dIdx = (idx + 1) % 7; // 1=Mon, 2=Tue, ..., 6=Sat, 0=Sun
            const conf = schedule[dIdx] || { active: true, from: '00:00', to: '23:59' };
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 500;">${day}</td>
                <td style="text-align: center;"><input type="checkbox" class="schedule-active" ${conf.active !== false ? 'checked' : ''} style="cursor: pointer;"></td>
                <td><input type="time" class="schedule-from" value="${conf.from || '00:00'}" style="padding: 3px 6px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--input-color); width: 95%;"></td>
                <td><input type="time" class="schedule-to" value="${conf.to || '23:59'}" style="padding: 3px 6px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--input-color); width: 95%;"></td>
            `;
            tableBody.appendChild(tr);
        });
    }

    function collectScheduleFromTable() {
        const tableBody = document.querySelector('#desktop-schedule-table tbody');
        if (!tableBody) return {};
        const sch = {};
        const rows = tableBody.querySelectorAll('tr');
        rows.forEach((r, idx) => {
            const dIdx = (idx + 1) % 7;
            const active = r.querySelector('.schedule-active')?.checked ?? true;
            const from = r.querySelector('.schedule-from')?.value || '00:00';
            const to = r.querySelector('.schedule-to')?.value || '23:59';
            sch[dIdx] = { active, from, to };
        });
        return sch;
    }

    function isScheduleActiveNow(fetchSchedule) {
        if (!fetchSchedule) return true;
        const now = new Date();
        const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        const config = fetchSchedule[day];
        if (!config) return true;
        if (config.active === false) return false;
        const nowTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        if (config.from && nowTime < config.from) return false;
        if (config.to && nowTime > config.to) return false;
        return true;
    }

    let bgFetchTimeout = null;
    let bgSummaryTimeout = null;

    async function scheduleNextBackgroundFetch() {
        if (bgFetchTimeout) clearTimeout(bgFetchTimeout);

        const { checkInterval = 30, randomizeFetch = false } = await chrome.storage.sync.get(['checkInterval', 'randomizeFetch']);
        const intervalMinutes = parseInt(checkInterval, 10);
        if (isNaN(intervalMinutes) || intervalMinutes <= 0) {
            console.log("[PureTidings Desktop] Auto-fetch is OFF (checkInterval = 0).");
            return;
        }

        let effectiveMinutes = intervalMinutes;
        if (randomizeFetch) {
            const jitter = 0.8 + (Math.random() * 0.4);
            effectiveMinutes = Math.max(1, intervalMinutes * jitter);
        }

        const ms = Math.round(effectiveMinutes * 60 * 1000);
        console.log(`[PureTidings Desktop] Next background check scheduled in ${effectiveMinutes.toFixed(1)} minute(s).`);

        bgFetchTimeout = setTimeout(async () => {
            await runBackgroundFetchCycle();
            scheduleNextBackgroundFetch();
        }, ms);
    }

    async function runBackgroundFetchCycle() {
        try {
            const { fetchSchedule, showNotification = true, rules = [] } = await chrome.storage.sync.get(['fetchSchedule', 'showNotification', 'rules']);

            if (!isScheduleActiveNow(fetchSchedule)) {
                console.log("[PureTidings Desktop] Outside active fetch schedule hours. Skipping auto-check.");
                return;
            }

            const beforeData = await chrome.storage.local.get(['unreadCounts', 'allPosts', 'readLinks']);
            const beforeReadLinksSet = new Set(beforeData.readLinks || []);
            const prevTotalUnread = Object.values(beforeData.unreadCounts || {}).reduce((a, b) => a + b, 0);

            let prevKeywordMatches = 0;
            if (rules.length > 0) {
                Object.values(beforeData.allPosts || {}).flat().forEach(p => {
                    if (p && !p.isHidden && !beforeReadLinksSet.has(p.link) && p.matchedRules && p.matchedRules.length > 0) {
                        prevKeywordMatches++;
                    }
                });
            }

            console.log("[PureTidings Desktop] Executing background feed check...");
            await refreshAllFeedsNative();

            const afterData = await chrome.storage.local.get(['unreadCounts', 'allPosts', 'readLinks']);
            const afterReadLinksSet = new Set(afterData.readLinks || []);
            const newTotalUnread = Object.values(afterData.unreadCounts || {}).reduce((a, b) => a + b, 0);

            let newKeywordMatches = 0;
            if (rules.length > 0) {
                Object.values(afterData.allPosts || {}).flat().forEach(p => {
                    if (p && !p.isHidden && !afterReadLinksSet.has(p.link) && p.matchedRules && p.matchedRules.length > 0) {
                        newKeywordMatches++;
                    }
                });
            }

            if (showNotification) {
                if (rules.length > 0 && newKeywordMatches > prevKeywordMatches) {
                    const diff = newKeywordMatches - prevKeywordMatches;
                    const title = "PureTidings - Keyword Alert";
                    const msg = diff === 1
                        ? "1 new post matches your keyword rules!"
                        : `${diff} new posts match your keyword rules!`;
                    showDesktopNotification(title, msg);
                    showInAppToast(title, msg);
                } else if (newTotalUnread > prevTotalUnread) {
                    const diff = newTotalUnread - prevTotalUnread;
                    const title = "PureTidings - New Articles";
                    const msg = diff === 1
                        ? "1 new article has arrived."
                        : `${diff} new articles have arrived.`;
                    showDesktopNotification(title, msg);
                    showInAppToast(title, msg);
                }
            }
        } catch (err) {
            console.warn("[PureTidings Desktop] Error during background fetch cycle:", err);
        }
    }

    async function scheduleNextSummaryNotification(initialCheck = false) {
        if (bgSummaryTimeout) clearTimeout(bgSummaryTimeout);

        const { showSummaryNotification = false, summaryInterval = 60 } = await chrome.storage.sync.get(['showSummaryNotification', 'summaryInterval']);
        if (!showSummaryNotification) return;

        const intervalMinutes = Math.max(1, parseInt(summaryInterval, 10) || 60);
        const ms = intervalMinutes * 60 * 1000;
        console.log(`[PureTidings Desktop] Next unread summary reminder in ${intervalMinutes} minute(s).`);

        if (initialCheck) {
            setTimeout(async () => {
                await runSummaryNotificationCycle(false);
            }, 3000);
        }

        bgSummaryTimeout = setTimeout(async () => {
            await runSummaryNotificationCycle(false);
            scheduleNextSummaryNotification(false);
        }, ms);
    }

    async function runSummaryNotificationCycle(isManualTest = false) {
        try {
            const { showSummaryNotification = false } = await chrome.storage.sync.get(['showSummaryNotification']);
            if (!showSummaryNotification && !isManualTest) return;

            const { allPosts = {}, readLinks = [] } = await chrome.storage.local.get(['allPosts', 'readLinks']);
            const readLinksSet = new Set(readLinks || []);
            const unread = Object.values(allPosts)
                .flat()
                .filter(p => p && p.link && !p.isHidden && !readLinksSet.has(p.link))
                .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

            if (unread.length === 0) {
                if (isManualTest) {
                    const title = "PureTidings - Unread Reminder";
                    const body = "All feeds are up-to-date. You have 0 unread articles waiting.";
                    await showDesktopNotification(title, body);
                    showInAppToast(title, body, false, 5000);
                }
                return;
            }

            const title = `Unread Summary: ${unread.length} article(s) waiting`;
            const topTitles = unread.slice(0, 3).map(p => `• ${p.title}`).join('\n');
            const body = unread.length > 3 ? `${topTitles}\n...and ${unread.length - 3} more.` : topTitles;

            await showDesktopNotification(title, body);
            showInAppToast(title, body, true, 8000);
        } catch (err) {
            console.warn("[PureTidings Desktop] Error during summary notification cycle:", err);
            if (isManualTest) {
                showInAppToast("Unread Reminder Error", err.message || String(err));
            }
        }
    }

    function startBackgroundScheduler() {
        scheduleNextBackgroundFetch();
        scheduleNextSummaryNotification();
        scheduleNextAutoBackup();
    }
    window.startBackgroundScheduler = startBackgroundScheduler;

    function closeAllModals() {
        ['settings-modal', 'reader-modal', 'quick-add-modal', 'quick-summarize-modal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const videoEl = document.getElementById('reader-video-info');
        if (videoEl) videoEl.innerHTML = '';
    }
    window.closeAllModals = closeAllModals;

    function getViewportDimensions() {
        const zoom = parseFloat(document.documentElement.style.zoom) || 1.0;
        const w = (window.innerWidth || document.documentElement.clientWidth || 1200) / zoom;
        const h = (window.innerHeight || document.documentElement.clientHeight || 800) / zoom;
        return { w, h, zoom };
    }

    function getBackupTimestamp() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const yyyy = now.getFullYear();
        const mm = pad(now.getMonth() + 1);
        const dd = pad(now.getDate());
        const hh = pad(now.getHours());
        const min = pad(now.getMinutes());
        const ss = pad(now.getSeconds());
        return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
    }

    function sanitizeFolderPath(folder) {
        if (!folder || typeof folder !== 'string') return '';
        return folder.trim().replace(/^["']+|["']+$/g, '').trim();
    }
    window.sanitizeFolderPath = sanitizeFolderPath;

    function updateBackupTabFolderDisplay(path) {
        const lbl = document.getElementById('backup-tab-folder-label');
        if (!lbl) return;
        const clean = sanitizeFolderPath(path);
        if (clean) {
            lbl.textContent = clean;
            lbl.style.color = "var(--link-color)";
        } else {
            lbl.textContent = "(Default browser downloads)";
            lbl.style.color = "var(--text-color-darker)";
        }
    }
    window.updateBackupTabFolderDisplay = updateBackupTabFolderDisplay;

    function joinPath(folder, filename) {
        if (!folder) return filename;
        const clean = sanitizeFolderPath(folder).replace(/[/\\]+$/, '');
        const sep = clean.includes('/') && !clean.includes('\\') ? '/' : '\\';
        return `${clean}${sep}${filename}`;
    }
    window.joinPath = joinPath;

    async function generateOpmlData() {
        const { feedTree = [] } = await chrome.storage.local.get('feedTree');
        let feedCount = 0;
        let opml = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n<head><title>PureTidings Feeds</title></head>\n<body>\n`;
        function writeNodes(nodes) {
            nodes.forEach(n => {
                if (n.type === 'folder') {
                    opml += `  <outline text="${escapeXml(n.name)}">\n`;
                    if (n.children) writeNodes(n.children);
                    opml += `  </outline>\n`;
                } else if (n.type === 'feed') {
                    feedCount++;
                    opml += `  <outline type="rss" text="${escapeXml(n.name)}" title="${escapeXml(n.name)}" xmlUrl="${escapeXml(n.url)}" htmlUrl="${escapeXml(n.url)}"/>\n`;
                }
            });
        }
        writeNodes(feedTree);
        opml += `</body>\n</opml>`;
        return { opml, feedCount };
    }
    window.generateOpmlData = generateOpmlData;

    async function generateBackupJsonData() {
        const local = await chrome.storage.local.get(['feedTree', 'readLinks', 'favoritedLinks', 'summaryLinks']);
        const sync = await chrome.storage.sync.get(null);
        const backup = {
            version: "1.0",
            app: "PureTidings Desktop",
            date: new Date().toISOString(),
            sync,
            local
        };
        const feedCount = (local.feedTree || []).length;
        return { json: JSON.stringify(backup, null, 2), feedCount };
    }
    window.generateBackupJsonData = generateBackupJsonData;

    async function saveBackupFile(filename, content, mimeType, backupFolderPath) {
        let cleanFolder = sanitizeFolderPath(backupFolderPath);
        if (!cleanFolder) {
            try {
                const syncData = await chrome.storage.sync.get('backupFolderPath');
                cleanFolder = sanitizeFolderPath(syncData.backupFolderPath || '');
            } catch (e) {}
        }
        if (!cleanFolder) {
            const domInput = document.getElementById('settings-backup-folder-path');
            if (domInput && domInput.value) {
                cleanFolder = sanitizeFolderPath(domInput.value);
                if (cleanFolder) {
                    await chrome.storage.sync.set({ backupFolderPath: cleanFolder });
                }
            }
        }
        if (!cleanFolder) {
            const lbl = document.getElementById('backup-tab-folder-label');
            if (lbl && lbl.textContent && !lbl.textContent.includes('Default browser')) {
                cleanFolder = sanitizeFolderPath(lbl.textContent);
                if (cleanFolder) {
                    await chrome.storage.sync.set({ backupFolderPath: cleanFolder });
                }
            }
        }

        if (cleanFolder) {
            const targetPath = joinPath(cleanFolder, filename);
            try {
                await tauriInvoke('write_file_text', { path: targetPath, contents: content });
                return { directWrite: true, path: targetPath };
            } catch (err) {
                console.warn(`[PureTidings Desktop] Direct write to "${targetPath}" failed:`, err);
                downloadTextFile(filename, content, mimeType);
                return { directWrite: false, path: null, error: err.message || err };
            }
        } else {
            downloadTextFile(filename, content, mimeType);
            return { directWrite: false, path: null };
        }
    }
    window.saveBackupFile = saveBackupFile;

    async function executeDailyAutoBackup() {
        try {
            const { autoBackupEnabled = false, backupFolderPath = '' } = await chrome.storage.sync.get(['autoBackupEnabled', 'backupFolderPath']);
            if (!autoBackupEnabled) return;

            const cleanFolder = sanitizeFolderPath(backupFolderPath);
            console.log("[PureTidings Desktop] Running scheduled daily backup...");
            const timestamp = getBackupTimestamp();

            // 1. OPML
            const { opml, feedCount: opmlCount } = await generateOpmlData();
            const opmlFilename = `puretidings-feeds-${timestamp}.opml`;
            const opmlRes = await saveBackupFile(opmlFilename, opml, 'text/xml', cleanFolder);

            // 2. JSON
            const { json, feedCount: jsonCount } = await generateBackupJsonData();
            const jsonFilename = `puretidings-backup-${timestamp}.json`;
            const jsonRes = await saveBackupFile(jsonFilename, json, 'application/json', cleanFolder);

            const todayStr = new Date().toISOString().split('T')[0];
            await chrome.storage.local.set({ lastAutoBackupDate: todayStr });

            const destMsg = (opmlRes.directWrite && opmlRes.path)
                ? `Saved directly to: ${cleanFolder}`
                : "Saved to default Downloads";

            const title = "PureTidings - Daily Backup Created";
            const msg = `Automated daily backup completed (${opmlCount} feeds, ${jsonCount} items). ${destMsg}`;
            showDesktopNotification(title, msg);
            showInAppToast("Daily Backup Complete", msg);
            console.log("[PureTidings Desktop] Scheduled backup complete:", msg);
        } catch (err) {
            console.error("[PureTidings Desktop] Error executing scheduled daily backup:", err);
        }
    }
    window.executeDailyAutoBackup = executeDailyAutoBackup;

    let bgAutoBackupTimeout = null;
    async function scheduleNextAutoBackup() {
        if (bgAutoBackupTimeout) clearTimeout(bgAutoBackupTimeout);

        const { autoBackupEnabled = false, autoBackupTime = '20:00' } = await chrome.storage.sync.get(['autoBackupEnabled', 'autoBackupTime']);
        if (!autoBackupEnabled) {
            console.log("[PureTidings Desktop] Automated daily backup is disabled.");
            return;
        }

        const timeParts = (autoBackupTime || '20:00').split(':');
        const hours = parseInt(timeParts[0], 10) || 0;
        const minutes = parseInt(timeParts[1], 10) || 0;

        const now = new Date();
        const target = new Date();
        target.setHours(hours, minutes, 0, 0);

        const { lastAutoBackupDate = '' } = await chrome.storage.local.get('lastAutoBackupDate');
        const todayStr = now.toISOString().split('T')[0];

        if (target.getTime() <= now.getTime()) {
            if (lastAutoBackupDate === todayStr) {
                target.setDate(target.getDate() + 1);
            } else {
                const diffMs = now.getTime() - target.getTime();
                if (diffMs < 30 * 60 * 1000) {
                    console.log("[PureTidings Desktop] Daily backup time was missed recently today. Scheduling in 5 seconds...");
                    bgAutoBackupTimeout = setTimeout(async () => {
                        await executeDailyAutoBackup();
                        scheduleNextAutoBackup();
                    }, 5000);
                    return;
                } else {
                    target.setDate(target.getDate() + 1);
                }
            }
        }

        const delayMs = Math.max(1000, target.getTime() - now.getTime());
        const delayMins = Math.round(delayMs / 60000);
        console.log(`[PureTidings Desktop] Next automated backup scheduled for ${target.toLocaleTimeString()} (${delayMins} min(s) from now).`);

        bgAutoBackupTimeout = setTimeout(async () => {
            await executeDailyAutoBackup();
            scheduleNextAutoBackup();
        }, delayMs);
    }
    window.scheduleNextAutoBackup = scheduleNextAutoBackup;

    function openSettingsModal() {
        closeAllModals();
        const modal = document.getElementById('settings-modal');
        if (!modal) return;
        modal.style.display = 'block';

        // Restore custom modal dimensions & coordinates
        const modalCard = document.getElementById('settings-modal-card');
        if (modalCard) {
            const { w: viewW, h: viewH, zoom } = getViewportDimensions();
            const isAndroid = document.documentElement.classList.contains('is-android') || /Android/i.test(navigator.userAgent);
            let savedGeo = null;
            try {
                savedGeo = JSON.parse(localStorage.getItem('puretidings_settings_geometry') || localStorage.getItem('puretidings_settings_size') || 'null');
            } catch (_) {}

            let w = (savedGeo && savedGeo.width) ? Math.max(280, savedGeo.width) : Math.min(840, Math.max(320, viewW - 40));
            let h = (savedGeo && savedGeo.height) ? Math.max(150, savedGeo.height) : Math.min(680, Math.max(200, viewH - 40));
            let left = (savedGeo && savedGeo.left !== undefined) ? savedGeo.left : Math.round(Math.max(10, (viewW - w) / 2));
            let top = (savedGeo && savedGeo.top !== undefined) ? savedGeo.top : Math.round(Math.max(10, (viewH - h) / 2));

            if (isAndroid) {
                w = Math.max(260, Math.min(w, viewW - 12));
                h = Math.max(140, Math.min(h, viewH - 12));
                left = Math.max(6, Math.min(left, viewW - w - 6));
                top = Math.max(6, Math.min(top, viewH - h - 6));
            } else {
                left = Math.max(-w + 80, Math.min(left, viewW - 80));
                top = Math.max(0, Math.min(top, viewH - 50));
            }

            modalCard.style.width = w + 'px';
            modalCard.style.height = h + 'px';
            modalCard.style.left = left + 'px';
            modalCard.style.top = top + 'px';

            function saveSettingsGeometry() {
                if (!modalCard) return;
                const geo = {
                    left: Math.round(parseFloat(modalCard.style.left) || modalCard.offsetLeft || 0),
                    top: Math.round(parseFloat(modalCard.style.top) || modalCard.offsetTop || 0),
                    width: Math.round(parseFloat(modalCard.style.width) || modalCard.offsetWidth || 840),
                    height: Math.round(parseFloat(modalCard.style.height) || modalCard.offsetHeight || 680)
                };
                try {
                    localStorage.setItem('puretidings_settings_geometry', JSON.stringify(geo));
                    localStorage.setItem('puretidings_settings_size', JSON.stringify({ width: geo.width, height: geo.height }));
                } catch (_) {}
            }

            // Draggable by header (supports mouse and touch)
            const header = modalCard.querySelector('.settings-modal-header');
            if (header && !header._dragAttached) {
                header._dragAttached = true;
                header.style.cursor = 'move';
                header.style.userSelect = 'none';

                function startDrag(e) {
                    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a') || e.target.closest('select')) return;
                    const isTouch = !!e.touches;
                    const point = isTouch ? e.touches[0] : e;
                    if (!point) return;
                    if (!isTouch) e.preventDefault();

                    const startX = point.clientX;
                    const startY = point.clientY;
                    const initialLeft = parseFloat(modalCard.style.left) || modalCard.offsetLeft || 0;
                    const initialTop = parseFloat(modalCard.style.top) || modalCard.offsetTop || 0;

                    function onDrag(ev) {
                        const curPoint = isTouch ? (ev.touches && ev.touches[0]) : ev;
                        if (!curPoint) return;
                        if (ev.cancelable) ev.preventDefault();
                        const { w: curViewW, h: curViewH, zoom: activeZoom } = getViewportDimensions();
                        const dx = (curPoint.clientX - startX) / activeZoom;
                        const dy = (curPoint.clientY - startY) / activeZoom;
                        let nLeft = initialLeft + dx;
                        let nTop = initialTop + dy;

                        const isAndroidMobile = document.documentElement.classList.contains('is-android') || /Android/i.test(navigator.userAgent);
                        if (isAndroidMobile) {
                            const cardW = modalCard.offsetWidth;
                            const cardH = modalCard.offsetHeight;
                            nLeft = Math.max(6, Math.min(nLeft, curViewW - cardW - 6));
                            nTop = Math.max(6, Math.min(nTop, curViewH - cardH - 6));
                        } else {
                            nLeft = Math.max(-modalCard.offsetWidth + 80, Math.min(nLeft, curViewW - 80));
                            nTop = Math.max(0, Math.min(nTop, curViewH - 50));
                        }

                        modalCard.style.left = nLeft + 'px';
                        modalCard.style.top = nTop + 'px';
                    }

                    function stopDrag() {
                        if (isTouch) {
                            window.removeEventListener('touchmove', onDrag);
                            window.removeEventListener('touchend', stopDrag);
                            window.removeEventListener('touchcancel', stopDrag);
                        } else {
                            window.removeEventListener('mousemove', onDrag);
                            window.removeEventListener('mouseup', stopDrag);
                        }
                        saveSettingsGeometry();
                    }

                    if (isTouch) {
                        window.addEventListener('touchmove', onDrag, { passive: false });
                        window.addEventListener('touchend', stopDrag);
                        window.addEventListener('touchcancel', stopDrag);
                    } else {
                        window.addEventListener('mousemove', onDrag);
                        window.addEventListener('mouseup', stopDrag);
                    }
                }

                header.addEventListener('mousedown', startDrag);
                header.addEventListener('touchstart', startDrag, { passive: true });
            }

            // Custom corner resize grip handle (supports mouse and touch)
            const resizeHandle = modalCard.querySelector('.modal-resize-handle');
            if (resizeHandle && !resizeHandle._resizeAttached) {
                resizeHandle._resizeAttached = true;

                function startResize(e) {
                    const isTouch = !!e.touches;
                    const point = isTouch ? e.touches[0] : e;
                    if (!point) return;
                    e.stopPropagation();
                    if (e.cancelable) e.preventDefault();

                    const startX = point.clientX;
                    const startY = point.clientY;
                    const startW = parseFloat(modalCard.style.width) || modalCard.offsetWidth;
                    const startH = parseFloat(modalCard.style.height) || modalCard.offsetHeight;

                    function onGripResize(ev) {
                        const curPoint = isTouch ? (ev.touches && ev.touches[0]) : ev;
                        if (!curPoint) return;
                        if (ev.cancelable) ev.preventDefault();
                        const { zoom: activeZoom, w: curViewW, h: curViewH } = getViewportDimensions();
                        const dx = (curPoint.clientX - startX) / activeZoom;
                        const dy = (curPoint.clientY - startY) / activeZoom;

                        let nW = Math.max(280, startW + dx);
                        let nH = Math.max(150, startH + dy);

                        const isAndroidMobile = document.documentElement.classList.contains('is-android') || /Android/i.test(navigator.userAgent);
                        if (isAndroidMobile) {
                            const curLeft = parseFloat(modalCard.style.left) || modalCard.offsetLeft || 6;
                            const curTop = parseFloat(modalCard.style.top) || modalCard.offsetTop || 6;
                            const maxAllowedW = curViewW - curLeft - 6;
                            const maxAllowedH = curViewH - curTop - 6;
                            nW = Math.min(maxAllowedW, nW);
                            nH = Math.min(maxAllowedH, nH);
                        }

                        modalCard.style.width = nW + 'px';
                        modalCard.style.height = nH + 'px';
                    }

                    function stopGripResize() {
                        if (isTouch) {
                            window.removeEventListener('touchmove', onGripResize);
                            window.removeEventListener('touchend', stopGripResize);
                            window.removeEventListener('touchcancel', stopGripResize);
                        } else {
                            window.removeEventListener('mousemove', onGripResize);
                            window.removeEventListener('mouseup', stopGripResize);
                        }
                        saveSettingsGeometry();
                    }

                    if (isTouch) {
                        window.addEventListener('touchmove', onGripResize, { passive: false });
                        window.addEventListener('touchend', stopGripResize);
                        window.addEventListener('touchcancel', stopGripResize);
                    } else {
                        window.addEventListener('mousemove', onGripResize);
                        window.addEventListener('mouseup', stopGripResize);
                    }
                }

                resizeHandle.addEventListener('mousedown', startResize);
                resizeHandle.addEventListener('touchstart', startResize, { passive: false });
            }

            // Right-edge width resize handle
            const edgeRight = modalCard.querySelector('#settings-resize-edge-right');
            if (edgeRight && !edgeRight._edgeAttached) {
                edgeRight._edgeAttached = true;
                function startEdgeResize(e) {
                    const isTouch = !!e.touches;
                    const point = isTouch ? e.touches[0] : e;
                    if (!point) return;
                    e.stopPropagation();
                    if (e.cancelable) e.preventDefault();
                    const startX = point.clientX;
                    const startW = parseFloat(modalCard.style.width) || modalCard.offsetWidth;

                    function onEdgeDrag(ev) {
                        const curPoint = isTouch ? (ev.touches && ev.touches[0]) : ev;
                        if (!curPoint) return;
                        if (ev.cancelable) ev.preventDefault();
                        const { zoom: activeZoom, w: curViewW } = getViewportDimensions();
                        const dx = (curPoint.clientX - startX) / activeZoom;

                        let nW = Math.max(280, startW + dx);
                        const isAndroidMobile = document.documentElement.classList.contains('is-android') || /Android/i.test(navigator.userAgent);
                        if (isAndroidMobile) {
                            const curLeft = parseFloat(modalCard.style.left) || modalCard.offsetLeft || 6;
                            const maxAllowedW = curViewW - curLeft - 6;
                            nW = Math.min(maxAllowedW, nW);
                        }

                        modalCard.style.width = nW + 'px';
                    }

                    function stopEdgeDrag() {
                        if (isTouch) {
                            window.removeEventListener('touchmove', onEdgeDrag);
                            window.removeEventListener('touchend', stopEdgeDrag);
                            window.removeEventListener('touchcancel', stopEdgeDrag);
                        } else {
                            window.removeEventListener('mousemove', onEdgeDrag);
                            window.removeEventListener('mouseup', stopEdgeDrag);
                        }
                        saveSettingsGeometry();
                    }

                    if (isTouch) {
                        window.addEventListener('touchmove', onEdgeDrag, { passive: false });
                        window.addEventListener('touchend', stopEdgeDrag);
                        window.addEventListener('touchcancel', stopEdgeDrag);
                    } else {
                        window.addEventListener('mousemove', onEdgeDrag);
                        window.addEventListener('mouseup', stopEdgeDrag);
                    }
                }
                edgeRight.addEventListener('mousedown', startEdgeResize);
                edgeRight.addEventListener('touchstart', startEdgeResize, { passive: false });
            }

            // Fit / Maximize Toggle Button
            const fitBtn = modalCard.querySelector('#settings-modal-fit');
            if (fitBtn && !fitBtn._fitAttached) {
                fitBtn._fitAttached = true;
                fitBtn.addEventListener('click', () => {
                    const { w: curViewW, h: curViewH } = getViewportDimensions();
                    const curW = parseFloat(modalCard.style.width) || modalCard.offsetWidth;
                    const curH = parseFloat(modalCard.style.height) || modalCard.offsetHeight;
                    const isMax = curW >= curViewW - 20 && curH >= curViewH - 20;

                    if (isMax) {
                        // Restore to floating size
                        const nW = Math.max(280, Math.min(840, curViewW - 32));
                        const nH = Math.max(160, Math.min(680, curViewH - 32));
                        const nLeft = Math.round(Math.max(10, (curViewW - nW) / 2));
                        const nTop = Math.round(Math.max(10, (curViewH - nH) / 2));
                        modalCard.style.width = nW + 'px';
                        modalCard.style.height = nH + 'px';
                        modalCard.style.left = nLeft + 'px';
                        modalCard.style.top = nTop + 'px';
                    } else {
                        // Maximize to full viewport
                        modalCard.style.width = (curViewW - 12) + 'px';
                        modalCard.style.height = (curViewH - 12) + 'px';
                        modalCard.style.left = '6px';
                        modalCard.style.top = '6px';
                    }
                    saveSettingsGeometry();
                });
            }

            // Attach ResizeObserver to remember resized size across app restarts
            if (window.ResizeObserver && !modalCard._resizeObserverAttached) {
                modalCard._resizeObserverAttached = true;
                let resizeTimer;
                const ro = new ResizeObserver(entries => {
                    for (let entry of entries) {
                        if (entry.contentRect && entry.contentRect.width > 200 && entry.contentRect.height > 100) {
                            clearTimeout(resizeTimer);
                            resizeTimer = setTimeout(() => {
                                saveSettingsGeometry();
                            }, 250);
                        }
                    }
                });
                ro.observe(modalCard);
            }
        }

        loadSettingsValues();
    }

    function closeSettingsModal() {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.style.display = 'none';
        if (typeof flushWebdavSync === 'function') flushWebdavSync();
    }

    function clampActiveModals() {
        const isAndroid = document.documentElement.classList.contains('is-android') || /Android/i.test(navigator.userAgent);
        if (!isAndroid) return; // Desktop is completely unconstrained!

        const { w: viewW, h: viewH } = getViewportDimensions();
        ['settings-modal-card', 'reader-modal-card'].forEach(cardId => {
            const card = document.getElementById(cardId);
            if (!card) return;
            const overlay = card.closest('.desktop-modal-overlay');
            if (overlay && (overlay.style.display === 'none' || getComputedStyle(overlay).display === 'none')) return;

            let curW = parseFloat(card.style.width) || card.offsetWidth;
            let curH = parseFloat(card.style.height) || card.offsetHeight;
            let curLeft = parseFloat(card.style.left) || card.offsetLeft || 6;
            let curTop = parseFloat(card.style.top) || card.offsetTop || 6;

            let nW = Math.max(260, Math.min(curW, viewW - 12));
            let nH = Math.max(140, Math.min(curH, viewH - 12));
            let nLeft = Math.max(6, Math.min(curLeft, viewW - nW - 6));
            let nTop = Math.max(6, Math.min(curTop, viewH - nH - 6));

            card.style.width = nW + 'px';
            card.style.height = nH + 'px';
            card.style.left = nLeft + 'px';
            card.style.top = nTop + 'px';
        });
    }
    window.addEventListener('resize', clampActiveModals);
    window.addEventListener('orientationchange', () => setTimeout(clampActiveModals, 150));

    window.openSettingsModal = openSettingsModal;
    window.closeSettingsModal = closeSettingsModal;

    async function loadSettingsValues() {
        const {
            geminiApiKey,
            aiReportPrompt,
            youtubeAiPrompt,
            rules = [],
            checkInterval = 30,
            randomizeFetch = false,
            fetchSchedule = {},
            showNotification = true,
            showSummaryNotification = false,
            summaryInterval = 60,
            autoBackupEnabled = false,
            autoBackupTime = '20:00',
            backupFolderPath = '',
            syncWebdavEnabled = false,
            syncWebdavUrl = '',
            syncWebdavUser = '',
            syncWebdavPass = '',
            syncWebdavPath = '/puretidings_sync.json',
            syncWebdavAuto = true
        } = await chrome.storage.sync.get([
            'geminiApiKey', 'aiReportPrompt', 'youtubeAiPrompt', 'rules',
            'checkInterval', 'randomizeFetch', 'fetchSchedule',
            'showNotification', 'showSummaryNotification', 'summaryInterval',
            'autoBackupEnabled', 'autoBackupTime', 'backupFolderPath',
            'syncWebdavEnabled', 'syncWebdavUrl', 'syncWebdavUser',
            'syncWebdavPass', 'syncWebdavPath', 'syncWebdavAuto'
        ]);

        const keyInput = document.getElementById('settings-gemini-key');
        if (keyInput) keyInput.value = geminiApiKey || '';
        const currentSettingsLang = (window.i18n && window.i18n.currentLanguage) || 'en';
        const aiPromptInput = document.getElementById('settings-ai-prompt');
        if (aiPromptInput) {
            aiPromptInput.value = (aiReportPrompt && !isLegacyGenericPrompt(aiReportPrompt))
                ? aiReportPrompt
                : getDefaultAiPrompt('article', currentSettingsLang);
        }
        const ytPromptInput = document.getElementById('settings-yt-prompt');
        if (ytPromptInput) {
            ytPromptInput.value = (youtubeAiPrompt && !isLegacyGenericPrompt(youtubeAiPrompt))
                ? youtubeAiPrompt
                : getDefaultAiPrompt('youtube', currentSettingsLang);
        }

        const intervalInput = document.getElementById('settings-check-interval');
        if (intervalInput) intervalInput.value = checkInterval !== undefined ? checkInterval : 30;

        const randomizeInput = document.getElementById('settings-randomize-fetch');
        if (randomizeInput) randomizeInput.checked = !!randomizeFetch;

        const notifInput = document.getElementById('settings-show-notifications');
        if (notifInput) notifInput.checked = showNotification !== undefined ? showNotification : true;

        const sumNotifInput = document.getElementById('settings-show-summary-notifications');
        if (sumNotifInput) sumNotifInput.checked = !!showSummaryNotification;

        const sumIntervalInput = document.getElementById('settings-summary-interval');
        if (sumIntervalInput) sumIntervalInput.value = summaryInterval || 60;

        const autoBackupEnabledInput = document.getElementById('settings-auto-backup-enabled');
        if (autoBackupEnabledInput) autoBackupEnabledInput.checked = !!autoBackupEnabled;

        const autoBackupTimeInput = document.getElementById('settings-auto-backup-time');
        if (autoBackupTimeInput) autoBackupTimeInput.value = autoBackupTime || '20:00';

        const backupFolderInput = document.getElementById('settings-backup-folder-path');
        if (backupFolderInput) backupFolderInput.value = backupFolderPath || '';

        // WebDAV Cloud Sync settings
        const webdavEnabledInput = document.getElementById('setting-sync-webdav-enabled');
        if (webdavEnabledInput) webdavEnabledInput.checked = !!syncWebdavEnabled;
        const webdavUrlInput = document.getElementById('setting-sync-webdav-url');
        if (webdavUrlInput) webdavUrlInput.value = syncWebdavUrl || '';
        const webdavUserInput = document.getElementById('setting-sync-webdav-user');
        if (webdavUserInput) webdavUserInput.value = syncWebdavUser || '';
        const webdavPassInput = document.getElementById('setting-sync-webdav-pass');
        if (webdavPassInput) webdavPassInput.value = syncWebdavPass || '';
        const webdavPathInput = document.getElementById('setting-sync-webdav-path');
        if (webdavPathInput) webdavPathInput.value = syncWebdavPath || '/puretidings_sync.json';
        const webdavAutoInput = document.getElementById('setting-sync-webdav-auto');
        if (webdavAutoInput) webdavAutoInput.checked = syncWebdavAuto !== undefined ? !!syncWebdavAuto : true;

        // Autostart setting (Desktop only)
        const isAndroid = document.documentElement.classList.contains('is-android') || /Android/i.test(navigator.userAgent);
        const autostartContainer = document.getElementById('desktop-autostart-container');
        const autostartCheckbox = document.getElementById('settings-autostart-checkbox');
        if (isAndroid) {
            if (autostartContainer) autostartContainer.style.display = 'none';
        } else {
            if (autostartContainer) autostartContainer.style.display = 'block';
            if (autostartCheckbox) {
                try {
                    const enabled = await tauriInvoke('get_autostart');
                    autostartCheckbox.checked = !!enabled;
                } catch (_) {
                    const { autostart = false } = await chrome.storage.sync.get(['autostart']);
                    autostartCheckbox.checked = !!autostart;
                }
            }
        }

        // Screen Wake Lock setting
        const keepScreenAwakeCheckbox = document.getElementById('settings-keep-screen-awake-checkbox');
        if (keepScreenAwakeCheckbox) {
            const { keepScreenAwake = false } = await chrome.storage.sync.get(['keepScreenAwake']);
            keepScreenAwakeCheckbox.checked = !!keepScreenAwake;
        }

        const langSelect = document.getElementById('settings-language-select');
        if (langSelect && window.i18n) {
            langSelect.value = window.i18n.currentLanguage;
        }

        updateBackupTabFolderDisplay(backupFolderPath);

        renderDesktopScheduleTable(fetchSchedule);
        renderSettingsRules(rules);
        renderSettingsFeeds();
        renderSettingsEmailAccounts();
    }

    async function renderSettingsRules(rules) {
        const container = document.getElementById('settings-rules-list');
        if (!container) return;
        container.innerHTML = '';

        if (!rules || rules.length === 0) {
            container.innerHTML = '<p style="color: var(--secondary-text-color, #777); font-style: italic; margin: 0 0 10px 0;">No active rules configured.</p>';
            return;
        }

        const list = document.createElement('ul');
        list.style.cssText = 'list-style: none; padding: 0; margin: 0;';

        rules.forEach((rule, idx) => {
            const li = document.createElement('li');
            li.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-bottom: 1px solid var(--border-color); font-size: 13px;';
            li.innerHTML = `
                <div>
                    <strong>IF</strong> ${rule.field} <strong>${rule.condition}</strong> "<em>${escapeHtml(rule.value)}</em>" &rarr; <span style="font-weight: bold; color: var(--link-color);">${rule.action}</span>
                </div>
                <button type="button" class="delete-btn rule-del-btn" data-idx="${idx}" style="padding: 2px 8px; font-size: 12px;">Delete</button>
            `;
            list.appendChild(li);
        });

        container.appendChild(list);

        container.querySelectorAll('.rule-del-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const idx = parseInt(e.target.dataset.idx, 10);
                rules.splice(idx, 1);
                await chrome.storage.sync.set({ rules });
                renderSettingsRules(rules);
            });
        });
    }

    // ==========================================
    // Email Accounts Settings Tab Management
    // ==========================================
    function populateEmailFormForEdit(account) {
        document.getElementById('email-account-id').value = account.id;
        document.getElementById('email-preset-select').value = account.preset || 'custom';
        document.getElementById('email-account-name').value = account.name || '';
        document.getElementById('email-imap-server').value = account.server || '';
        document.getElementById('email-imap-port').value = account.port || 993;
        document.getElementById('email-username').value = account.username || '';
        document.getElementById('email-password').value = account.password || '';

        const folderSelect = document.getElementById('email-folder-select');
        if (folderSelect) {
            folderSelect.innerHTML = `<option value="${escapeHtml(account.folder || 'INBOX')}">${escapeHtml(account.folder || 'INBOX')}</option>`;
        }
        document.getElementById('email-fetch-limit').value = account.limit || 30;

        const heading = document.getElementById('email-form-heading');
        if (heading) heading.textContent = window.i18n ? window.i18n.t('email_form_edit_heading') : '✏️ Edit Email Account';

        const saveBtn = document.getElementById('email-save-account-btn');
        if (saveBtn) saveBtn.textContent = window.i18n ? window.i18n.t('email_btn_update_account') : 'Update Account';

        const cancelBtn = document.getElementById('email-cancel-edit-btn');
        if (cancelBtn) cancelBtn.classList.remove('hidden');

        const statusEl = document.getElementById('email-form-status');
        if (statusEl) statusEl.textContent = '';
    }

    function resetEmailAccountForm() {
        document.getElementById('email-account-id').value = '';
        document.getElementById('email-preset-select').value = 'custom';
        document.getElementById('email-account-name').value = '';
        document.getElementById('email-imap-server').value = '';
        document.getElementById('email-imap-port').value = '993';
        document.getElementById('email-username').value = '';
        document.getElementById('email-password').value = '';

        const folderSelect = document.getElementById('email-folder-select');
        if (folderSelect) {
            folderSelect.innerHTML = '<option value="INBOX">INBOX (Default)</option>';
        }
        document.getElementById('email-fetch-limit').value = '30';

        const heading = document.getElementById('email-form-heading');
        if (heading) heading.textContent = window.i18n ? window.i18n.t('email_form_add_heading') : '➕ Add Email Account';

        const saveBtn = document.getElementById('email-save-account-btn');
        if (saveBtn) saveBtn.textContent = window.i18n ? window.i18n.t('email_btn_save_account') : 'Save Account';

        const cancelBtn = document.getElementById('email-cancel-edit-btn');
        if (cancelBtn) cancelBtn.classList.add('hidden');

        const statusEl = document.getElementById('email-form-status');
        if (statusEl) statusEl.textContent = '';
    }

    async function renderSettingsEmailAccounts() {
        const container = document.getElementById('email-accounts-list');
        if (!container) return;

        const raw = await chrome.storage.sync.get('emailAccounts');
        const emailAccounts = Array.isArray(raw?.emailAccounts) ? raw.emailAccounts : [];
        container.innerHTML = '';

        if (emailAccounts.length === 0) {
            const p = document.createElement('p');
            p.id = 'email-empty-accounts';
            p.style.cssText = 'padding: 14px; margin: 0; font-size: 13px; color: var(--secondary-text-color); font-style: italic;';
            p.textContent = window.i18n ? window.i18n.t('email_no_accounts_configured') : 'No email accounts configured yet.';
            container.appendChild(p);
            return;
        }

        const list = document.createElement('ul');
        list.style.cssText = 'list-style: none; padding: 0; margin: 0;';

        emailAccounts.forEach(account => {
            const li = document.createElement('li');
            li.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--border-color); gap: 10px; flex-wrap: wrap;';

            const left = document.createElement('div');
            left.style.cssText = 'display: flex; align-items: center; gap: 10px; flex: 1; min-width: 200px;';

            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = account.enabled !== false;
            chk.title = 'Enable / Disable this email inbox';
            chk.addEventListener('change', async () => {
                account.enabled = chk.checked;
                await chrome.storage.sync.set({ emailAccounts });
                await syncEmailAccountsToFeedTree();
                renderSettingsEmailAccounts();
                if (account.enabled) {
                    refreshSingleFeedNative('email_' + account.id);
                }
            });

            const info = document.createElement('div');
            info.innerHTML = `
                <div style="font-weight: 600; font-size: 13px; color: var(--text-color);">
                    📬 ${escapeHtml(account.name || account.username)}
                    <span style="font-weight: normal; font-size: 12px; color: var(--secondary-text-color);">(${escapeHtml(account.username)})</span>
                </div>
                <div style="font-size: 11px; color: var(--secondary-text-color);">
                    ${escapeHtml(account.server)}:${account.port || 993} &middot; Folder: <strong>${escapeHtml(account.folder || 'INBOX')}</strong>
                </div>
            `;

            left.appendChild(chk);
            left.appendChild(info);

            const actions = document.createElement('div');
            actions.style.cssText = 'display: flex; gap: 6px; align-items: center;';

            // Check Now button
            const checkBtn = document.createElement('button');
            checkBtn.type = 'button';
            checkBtn.className = 'secondary-btn';
            checkBtn.style.cssText = 'padding: 4px 8px; font-size: 11px;';
            checkBtn.textContent = window.i18n ? window.i18n.t('email_btn_check_now') : 'Check Now 🔄';
            checkBtn.addEventListener('click', async () => {
                checkBtn.disabled = true;
                checkBtn.textContent = 'Checking...';
                try {
                    await refreshSingleFeedNative('email_' + account.id);
                } finally {
                    checkBtn.disabled = false;
                    checkBtn.textContent = window.i18n ? window.i18n.t('email_btn_check_now') : 'Check Now 🔄';
                }
            });

            // Edit button
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'secondary-btn';
            editBtn.style.cssText = 'padding: 4px 8px; font-size: 11px;';
            editBtn.textContent = window.i18n ? window.i18n.t('email_btn_edit') : 'Edit';
            editBtn.addEventListener('click', () => {
                populateEmailFormForEdit(account);
            });

            // Delete button
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'delete-btn';
            delBtn.style.cssText = 'padding: 4px 8px; font-size: 11px;';
            delBtn.textContent = window.i18n ? window.i18n.t('email_btn_delete') : 'Delete';
            delBtn.addEventListener('click', async () => {
                const confirmMsg = (window.i18n ? window.i18n.t('email_delete_confirm') : 'Are you sure you want to remove the email account "{name}"?').replace('{name}', account.name || account.username);
                if (confirm(confirmMsg)) {
                    const idx = emailAccounts.findIndex(a => a.id === account.id);
                    if (idx !== -1) {
                        emailAccounts.splice(idx, 1);
                        await chrome.storage.sync.set({ emailAccounts });

                        // Clean up allPosts and unreadCounts
                        const feedId = 'email_' + account.id;
                        const { allPosts = {}, unreadCounts = {} } = await chrome.storage.local.get(['allPosts', 'unreadCounts']);
                        delete allPosts[feedId];
                        delete unreadCounts[feedId];
                        await chrome.storage.local.set({ allPosts, unreadCounts });

                        await syncEmailAccountsToFeedTree();
                        renderSettingsEmailAccounts();
                        resetEmailAccountForm();
                    }
                }
            });

            actions.appendChild(checkBtn);
            actions.appendChild(editBtn);
            actions.appendChild(delBtn);

            li.appendChild(left);
            li.appendChild(actions);
            list.appendChild(li);
        });

        container.appendChild(list);
    }
    window.renderSettingsEmailAccounts = renderSettingsEmailAccounts;

    function moveNodeInSiblings(nodes, targetId, direction) {
        for (let i = 0; i < nodes.length; i++) {
            if (String(nodes[i].id) === String(targetId)) {
                const targetIdx = direction === 'up' ? i - 1 : i + 1;
                if (targetIdx >= 0 && targetIdx < nodes.length) {
                    const temp = nodes[i];
                    nodes[i] = nodes[targetIdx];
                    nodes[targetIdx] = temp;
                    return true;
                }
                return false;
            }
            if (nodes[i].children && nodes[i].children.length > 0) {
                if (moveNodeInSiblings(nodes[i].children, targetId, direction)) {
                    return true;
                }
            }
        }
        return false;
    }
    if (typeof window !== 'undefined') {
        window.moveNodeInSiblings = moveNodeInSiblings;
    }

    let editingNodeId = null;

    async function renderSettingsFeeds() {
        const list = document.getElementById('settings-feed-list');
        const folderSelect = document.getElementById('new-feed-folder');
        const quickFolderSelect = document.getElementById('quick-feed-folder-select');
        if (!list) return;

        let { feedTree = [] } = await chrome.storage.local.get('feedTree');

        // Deduplication pass to clean up any duplicate feeds
        const seenFeedUrls = new Set();
        const seenEmailKeys = new Set();
        let hadDuplicates = false;
        function dedupeNodes(nodes) {
            return nodes.filter(node => {
                if (node.type === 'feed') {
                    const isEmailNode = node.isEmail || (node.id && String(node.id).startsWith('email_')) || (node.url && node.url.startsWith('imap:'));
                    if (isEmailNode) {
                        const emailKey = String(node.emailAccountId || node.id || node.url);
                        if (seenEmailKeys.has(emailKey)) {
                            hadDuplicates = true;
                            return false;
                        }
                        seenEmailKeys.add(emailKey);
                        return true;
                    }
                    if (node.url) {
                        const norm = node.url.trim().toLowerCase().replace(/\/+$/, '');
                        if (seenFeedUrls.has(norm)) {
                            hadDuplicates = true;
                            return false;
                        }
                        seenFeedUrls.add(norm);
                        return true;
                    }
                }
                if (node.type === 'folder' && Array.isArray(node.children)) {
                    node.children = dedupeNodes(node.children);
                }
                return true;
            });
        }
        feedTree = dedupeNodes(feedTree);
        if (hadDuplicates) {
            const curMeta = (await chrome.storage.local.get(['feedTreeUpdatedAt', 'feedTreeLastEditedLocally'])) || {};
            await chrome.storage.local.set({ 
                feedTree, 
                feedTreeUpdatedAt: curMeta.feedTreeUpdatedAt || 0,
                feedTreeLastEditedLocally: curMeta.feedTreeLastEditedLocally || 0
            });
        }

        list.innerHTML = '';
        if (folderSelect) folderSelect.innerHTML = '<option value="">Root (No Folder)</option>';
        if (quickFolderSelect) quickFolderSelect.innerHTML = '<option value="">Root (No Folder)</option>';

        const folders = [];
        function scan(nodes, path = '') {
            for (const n of nodes) {
                if (n.type === 'folder') {
                    const currentPath = path ? `${path} / ${n.name}` : n.name;
                    folders.push({ id: n.id, name: currentPath });
                    if (n.children) scan(n.children, currentPath);
                }
            }
        }
        scan(feedTree);

        folders.forEach(f => {
            if (folderSelect) {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = f.name;
                folderSelect.appendChild(opt);
            }
            if (quickFolderSelect) {
                const opt2 = document.createElement('option');
                opt2.value = f.id;
                opt2.textContent = f.name;
                quickFolderSelect.appendChild(opt2);
            }
        });

        // Helper to check if a folder id is a descendant of a node (prevents circular parenting)
        function isDescendant(node, searchId) {
            if (!node || !node.children) return false;
            for (const child of node.children) {
                if (child.id === searchId || isDescendant(child, searchId)) return true;
            }
            return false;
        }

        function renderList(nodes, parentEl, level = 0, parentId = '') {
            nodes.forEach((node, index) => {
                const isFirst = index === 0;
                const isLast = index === nodes.length - 1;
                const li = document.createElement('li');
                li.className = 'feed-item-row';
                li.dataset.id = node.id;
                li.style.paddingLeft = `${level * 10 + 6}px`;

                const isFolder = node.type === 'folder';
                const isEditing = editingNodeId === node.id;

                if (isEditing) {
                    li.style.background = 'var(--hover-bg)';
                    const validParentFolders = isFolder
                        ? folders.filter(f => f.id !== node.id && !isDescendant(node, f.id))
                        : folders;

                    li.innerHTML = `
                        <div style="display: flex; flex-direction: column; gap: 8px; padding: 6px 0; width: 100%;">
                            <div>
                                <label style="font-size: 11px; font-weight: bold; color: var(--text-color-darker); display: block; margin-bottom: 2px;">Title / Name:</label>
                                <input type="text" id="edit-node-name-${node.id}" value="${escapeHTML(node.name)}" style="width: 100%; padding: 6px; box-sizing: border-box; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-color); color: var(--text-color);">
                            </div>
                            ${!isFolder ? `
                            <div>
                                <label style="font-size: 11px; font-weight: bold; color: var(--text-color-darker); display: block; margin-bottom: 2px;">Feed URL:</label>
                                <input type="text" id="edit-node-url-${node.id}" value="${escapeHTML(node.url || '')}" style="width: 100%; padding: 6px; box-sizing: border-box; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-color); color: var(--text-color);">
                            </div>
                            ` : ''}
                            <div>
                                <label style="font-size: 11px; font-weight: bold; color: var(--text-color-darker); display: block; margin-bottom: 2px;">Parent Folder:</label>
                                <select id="edit-node-folder-${node.id}" style="width: 100%; padding: 6px; box-sizing: border-box; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-color); color: var(--text-color);">
                                    <option value="">Root (No Folder)</option>
                                    ${validParentFolders.map(f => `<option value="${f.id}" ${parentId === f.id ? 'selected' : ''}>${escapeHTML(f.name)}</option>`).join('')}
                                </select>
                            </div>
                            <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px;">
                                <button type="button" class="btn-cancel-node-edit secondary-btn" style="padding: 4px 14px;">Cancel</button>
                                <button type="button" class="btn-save-node-edit" data-id="${node.id}" style="padding: 4px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Save</button>
                            </div>
                        </div>
                    `;
                } else if (isFolder) {
                    li.classList.add('folder-item-row');
                    li.innerHTML = `
                        <div class="drag-handle"></div>
                        <div class="feed-info">
                            <span style="font-size: 16px; flex-shrink: 0;">📁</span>
                            <div class="feed-info-text">
                                <span class="folder-name">${escapeHTML(decodeHTML(node.name))}</span>
                            </div>
                        </div>
                        <div class="folder-actions feed-actions">
                            <button type="button" class="move-btn move-up-btn" data-id="${node.id}" title="${window.i18n ? window.i18n.t('tooltip_move_up') : 'Move up'}" data-i18n-title="tooltip_move_up" ${isFirst ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>▲</button>
                            <button type="button" class="move-btn move-down-btn" data-id="${node.id}" title="${window.i18n ? window.i18n.t('tooltip_move_down') : 'Move down'}" data-i18n-title="tooltip_move_down" ${isLast ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>▼</button>
                            <button type="button" class="edit-btn" data-id="${node.id}">Edit</button>
                            <button type="button" class="delete-btn" data-id="${node.id}">Delete</button>
                        </div>
                    `;
                } else {
                    const faviconUrl = typeof getFaviconUrl === 'function' ? getFaviconUrl(node.url) : '128.png';
                    li.innerHTML = `
                        <div class="drag-handle"></div>
                        <div class="feed-info">
                            <img src="${faviconUrl}" class="feed-favicon" alt="" onerror="this.src='128.png'">
                            <div class="feed-info-text">
                                <span class="feed-name">${escapeHTML(decodeHTML(node.name))}</span>
                                <span class="feed-url">${escapeHTML(node.url)}</span>
                            </div>
                        </div>
                        <div class="feed-actions">
                            <button type="button" class="move-btn move-up-btn" data-id="${node.id}" title="${window.i18n ? window.i18n.t('tooltip_move_up') : 'Move up'}" data-i18n-title="tooltip_move_up" ${isFirst ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>▲</button>
                            <button type="button" class="move-btn move-down-btn" data-id="${node.id}" title="${window.i18n ? window.i18n.t('tooltip_move_down') : 'Move down'}" data-i18n-title="tooltip_move_down" ${isLast ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>▼</button>
                            <button type="button" class="edit-btn" data-id="${node.id}">Edit</button>
                            <button type="button" class="delete-btn" data-id="${node.id}">Delete</button>
                        </div>
                    `;
                }
                parentEl.appendChild(li);

                if (!isEditing) {
                    li.draggable = true;
                    li.addEventListener('dragstart', handleSettingsDragStart);
                    li.addEventListener('dragover', handleSettingsDragOver);
                    li.addEventListener('dragleave', handleSettingsDragLeave);
                    li.addEventListener('drop', handleSettingsDrop);
                    li.addEventListener('dragend', handleSettingsDragEnd);
                }

                if (node.children && node.children.length > 0) {
                    renderList(node.children, parentEl, level + 1, node.id);
                }
            });
        }

        // Drag and Drop Handlers for Settings Feeds & Folders
        let draggedSettingsNodeId = null;

        function handleSettingsDragStart(e) {
            draggedSettingsNodeId = this.dataset.id;
            this.classList.add('dragging');
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggedSettingsNodeId);
            }
        }

        function handleSettingsDragOver(e) {
            if (e.preventDefault) e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

            const rect = this.getBoundingClientRect();
            const height = rect.height;
            const y = e.clientY - rect.top;
            const isFolder = this.classList.contains('folder-item-row');

            // Reset classes
            this.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');

            // If it's a folder, allow dropping INTO it (center zone)
            if (isFolder && y > height * 0.25 && y < height * 0.75) {
                this.classList.add('drag-over-center');
            } else if (y < height / 2) {
                this.classList.add('drag-over-top');
            } else {
                this.classList.add('drag-over-bottom');
            }
            return false;
        }

        function handleSettingsDragLeave() {
            this.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');
        }

        function handleSettingsDragEnd() {
            this.classList.remove('dragging');
            list.querySelectorAll('li').forEach(item => {
                item.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');
            });
        }

        async function handleSettingsDrop(e) {
            if (e.stopPropagation) e.stopPropagation();
            if (e.preventDefault) e.preventDefault();

            const isCenter = this.classList.contains('drag-over-center');
            const isTop = this.classList.contains('drag-over-top');
            this.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');

            const targetNodeId = this.dataset.id;
            if (!draggedSettingsNodeId || String(draggedSettingsNodeId) === String(targetNodeId)) return false;

            // Remove the dragged node from the tree
            function removeNode(nodes, id) {
                for (let i = 0; i < nodes.length; i++) {
                    if (String(nodes[i].id) === String(id)) {
                        return nodes.splice(i, 1)[0];
                    }
                    if (nodes[i].children) {
                        const found = removeNode(nodes[i].children, id);
                        if (found) return found;
                    }
                }
                return null;
            }

            // Find a node by id
            function findNode(nodes, id) {
                for (const n of nodes) {
                    if (String(n.id) === String(id)) return n;
                    if (n.children) {
                        const found = findNode(n.children, id);
                        if (found) return found;
                    }
                }
                return null;
            }

            // Prevent dropping a folder into itself or into its own descendants
            function isDescendant(node, searchId) {
                if (!node || !node.children) return false;
                for (const child of node.children) {
                    if (String(child.id) === String(searchId) || isDescendant(child, searchId)) return true;
                }
                return false;
            }

            const checkNode = findNode(feedTree, draggedSettingsNodeId);
            if (!checkNode) return false;
            if (isDescendant(checkNode, targetNodeId)) {
                console.warn("[PureTidings Desktop] Cannot drop a folder into its own child.");
                return false;
            }

            const draggedNode = removeNode(feedTree, draggedSettingsNodeId);
            if (!draggedNode) return false;

            let success = false;
            if (isCenter) {
                const folder = findNode(feedTree, targetNodeId);
                if (folder && folder.type === 'folder') {
                    if (!folder.children) folder.children = [];
                    folder.children.push(draggedNode);
                    success = true;
                }
            } else {
                function findAndInsert(nodes, targetId, nodeToInsert, before) {
                    for (let i = 0; i < nodes.length; i++) {
                        if (String(nodes[i].id) === String(targetId)) {
                            const index = before ? i : i + 1;
                            nodes.splice(index, 0, nodeToInsert);
                            return true;
                        }
                        if (nodes[i].children) {
                            if (findAndInsert(nodes[i].children, targetId, nodeToInsert, before)) return true;
                        }
                    }
                    return false;
                }
                success = findAndInsert(feedTree, targetNodeId, draggedNode, isTop);
            }

            if (success) {
                await syncEmailAccountsOrderFromFeedTree(feedTree);
                const now = Date.now();
                await chrome.storage.local.set({ feedTree, feedTreeUpdatedAt: now, feedTreeLastEditedLocally: now });
                renderSettingsFeeds();
            } else {
                feedTree.push(draggedNode);
                await syncEmailAccountsOrderFromFeedTree(feedTree);
                const now = Date.now();
                await chrome.storage.local.set({ feedTree, feedTreeUpdatedAt: now, feedTreeLastEditedLocally: now });
                renderSettingsFeeds();
            }
            return false;
        }

        renderList(feedTree, list, 0, '');

        // Wire Move buttons
        list.querySelectorAll('.move-up-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                if (moveNodeInSiblings(feedTree, id, 'up')) {
                    await syncEmailAccountsOrderFromFeedTree(feedTree);
                    const now = Date.now();
                    await chrome.storage.local.set({ feedTree, feedTreeUpdatedAt: now, feedTreeLastEditedLocally: now });
                    renderSettingsFeeds();
                }
            });
        });

        list.querySelectorAll('.move-down-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                if (moveNodeInSiblings(feedTree, id, 'down')) {
                    await syncEmailAccountsOrderFromFeedTree(feedTree);
                    const now = Date.now();
                    await chrome.storage.local.set({ feedTree, feedTreeUpdatedAt: now, feedTreeLastEditedLocally: now });
                    renderSettingsFeeds();
                }
            });
        });

        // Wire Edit buttons
        list.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                editingNodeId = e.currentTarget.dataset.id;
                renderSettingsFeeds();
            });
        });

        // Wire Cancel edit
        list.querySelectorAll('.btn-cancel-node-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                editingNodeId = null;
                renderSettingsFeeds();
            });
        });

        // Wire Save edit
        list.querySelectorAll('.btn-save-node-edit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                const nameInput = document.getElementById(`edit-node-name-${id}`);
                const urlInput = document.getElementById(`edit-node-url-${id}`);
                const folderSelect = document.getElementById(`edit-node-folder-${id}`);

                const newName = nameInput ? nameInput.value.trim() : '';
                if (!newName) {
                    alert("Name cannot be empty.");
                    return;
                }

                function findNodeAndParent(nodes, targetId, currentParent = '') {
                    for (const n of nodes) {
                        if (String(n.id) === String(targetId)) return { node: n, parentId: currentParent };
                        if (n.children) {
                            const found = findNodeAndParent(n.children, targetId, String(n.id));
                            if (found) return found;
                        }
                    }
                    return null;
                }

                const result = findNodeAndParent(feedTree, id);
                if (!result) return;

                result.node.name = newName;
                if (urlInput) {
                    const newUrl = urlInput.value.trim();
                    if (!newUrl) {
                        alert("URL cannot be empty.");
                        return;
                    }
                    result.node.url = newUrl;
                }

                const targetFolderId = folderSelect ? folderSelect.value : result.parentId;
                if (folderSelect && targetFolderId !== result.parentId) {
                    // Prevent circular parenting when moving a folder
                    if (result.node.type === 'folder' && (String(targetFolderId) === String(id) || isDescendant(result.node, targetFolderId))) {
                        alert("Cannot move a folder into itself or a subfolder.");
                        return;
                    }

                    function extractNode(nodes, targetId) {
                        for (let i = 0; i < nodes.length; i++) {
                            if (String(nodes[i].id) === String(targetId)) {
                                return nodes.splice(i, 1)[0];
                            }
                            if (nodes[i].children) {
                                const ext = extractNode(nodes[i].children, targetId);
                                if (ext) return ext;
                            }
                        }
                        return null;
                    }

                    const extracted = extractNode(feedTree, id);
                    if (extracted) {
                        if (!targetFolderId) {
                            feedTree.push(extracted);
                        } else {
                            function insertIntoFolder(nodes, fId, item) {
                                for (const n of nodes) {
                                    if (String(n.id) === String(fId) && n.type === 'folder') {
                                        if (!n.children) n.children = [];
                                        n.children.push(item);
                                        return true;
                                    }
                                    if (n.children && insertIntoFolder(n.children, fId, item)) return true;
                                }
                                return false;
                            }
                            const inserted = insertIntoFolder(feedTree, targetFolderId, extracted);
                            if (!inserted) {
                                feedTree.push(extracted);
                            }
                        }
                    }
                }

                await syncEmailAccountsOrderFromFeedTree(feedTree);
                const now = Date.now();
                await chrome.storage.local.set({ feedTree, feedTreeUpdatedAt: now, feedTreeLastEditedLocally: now });
                editingNodeId = null;
                renderSettingsFeeds();
                if (result.node.type === 'feed') {
                    refreshSingleFeedNative(id);
                }
            });
        });

        // Wire Delete buttons
        list.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                if (!confirm("Are you sure you want to remove this item?")) return;

                const { deletedFeedUrls = {}, deletedFolderIds = {} } = await chrome.storage.local.get(['deletedFeedUrls', 'deletedFolderIds']);
                const now = Date.now();

                function removeNode(nodes) {
                    return nodes.filter(n => {
                        if (String(n.id) === String(id)) {
                            if (n.type === 'feed' && n.url) {
                                deletedFeedUrls[(n.url || '').trim().toLowerCase().replace(/\/+$/, '')] = now;
                            } else if (n.type === 'folder') {
                                deletedFolderIds[String(n.id)] = now;
                                function markChildren(children) {
                                    for (const c of children || []) {
                                        if (c.type === 'feed' && c.url) {
                                            deletedFeedUrls[(c.url || '').trim().toLowerCase().replace(/\/+$/, '')] = now;
                                        } else if (c.type === 'folder' && c.children) {
                                            deletedFolderIds[String(c.id)] = now;
                                            markChildren(c.children);
                                        }
                                    }
                                }
                                markChildren(n.children);
                            }
                            return false;
                        }
                        if (n.children) n.children = removeNode(n.children);
                        return true;
                    });
                }

                const updated = removeNode(feedTree);
                await syncEmailAccountsOrderFromFeedTree(updated);
                await chrome.storage.local.set({
                    feedTree: updated,
                    feedTreeUpdatedAt: now,
                    feedTreeLastEditedLocally: now,
                    deletedFeedUrls,
                    deletedFolderIds
                });
                renderSettingsFeeds();
            });
        });
    }

    // ==========================================
    // Reader Mode Controller & Toolbar Helpers
    // ==========================================
    let currentReaderArticle = null;
    let currentReaderVideoId = null;
    let currentReaderAiMarkdown = '';

    async function downloadTextFile(filename, content, mimeType = 'text/plain') {
        const isAndroid = document.documentElement.classList.contains('is-android') || /Android/i.test(navigator.userAgent);

        let savedPath = null;
        // 1. Primary: Save directly to filesystem via Tauri IPC (Android & Desktop)
        try {
            savedPath = await tauriInvoke('save_download_file', { filename, contents: content });
            console.log(`[PureTidings] File saved directly to disk: ${savedPath}`);
        } catch (ipcErr) {
            console.warn("[PureTidings] save_download_file IPC error, falling back:", ipcErr);
        }

        if (savedPath) {
            let displayPath = savedPath;
            if (displayPath.includes('/Download')) {
                displayPath = 'Download/' + displayPath.split('/Download/').pop();
            } else if (displayPath.includes('\\Downloads\\')) {
                displayPath = 'Downloads\\' + displayPath.split('\\Downloads\\').pop();
            }
            const isDe = (window.i18n?.currentLang === 'de');
            const title = isDe ? "Datei gespeichert ✓" : "File Saved ✓";
            const msg = isDe ? `Gespeichert in: ${displayPath}` : `Saved to: ${displayPath}`;
            showInAppToast(title, msg, false, 5000);
            return savedPath;
        }

        // 2. Secondary fallback on Android if direct disk write failed: offer Share sheet
        if (isAndroid) {
            let shared = false;
            if (navigator.share) {
                try {
                    let shareData = { title: filename, text: content };
                    try {
                        const file = new File([content], filename, { type: mimeType });
                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                            shareData = { title: filename, files: [file] };
                        }
                    } catch (_) {}
                    await navigator.share(shareData);
                    shared = true;
                } catch (e) {
                    if (e.name === 'AbortError') return;
                }
            }

            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(content);
                }
            } catch (_) {}

            if (shared) {
                showInAppToast("AI Summary Shared", `Shared ${filename} & copied to clipboard!`);
            } else {
                showInAppToast("AI Summary Copied", `Copied to clipboard (ready to paste in Keep/Notes)`);
            }
            return;
        }

        // 3. Fallback on Desktop if IPC not available: standard <a> blob download
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.dataset.downloadAnchor = 'true';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            if (a.parentNode) document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1500);
    }

    function htmlToMarkdownSimple(html) {
        if (!html) return '';
        let cleanHtml = html;

        try {
            if (typeof DOMParser !== 'undefined') {
                const parser = new DOMParser();
                const doc = parser.parseFromString(cleanHtml, 'text/html');
                const removeEls = doc.querySelectorAll('style, script, noscript, template, link, meta, xml, svg');
                removeEls.forEach(el => el.remove());
                cleanHtml = doc.body ? doc.body.innerHTML : doc.documentElement.innerHTML;
            }
        } catch (_) {}

        let md = cleanHtml;
        md = md.replace(/<!--[\s\S]*?-->/g, '');
        md = md.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
        md = md.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
        md = md.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');
        md = md.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '');
        md = md.replace(/<xml\b[^>]*>[\s\S]*?<\/xml>/gi, '');
        md = md.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '');

        md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n');
        md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n');
        md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n');
        md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n\n');
        md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '##### $1\n\n');
        md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '###### $1\n\n');
        md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
        md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
        md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
        md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
        md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (match, p1) => {
            return p1.trim().split('\n').map(line => `> ${line.trim()}`).join('\n') + '\n\n';
        });
        md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (match, url, text) => {
            const cleanText = text.replace(/<[^>]+>/g, '').trim();
            return cleanText ? `[${cleanText}](${url})` : url;
        });
        md = md.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/gi, '![$1]($2)');
        md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, '![$2]($1)');
        md = md.replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, '![]($1)');
        md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
        md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');
        md = md.replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1\n');
        md = md.replace(/<hr\s*[\/]?>/gi, '\n---\n\n');
        md = md.replace(/<br\s*[\/]?>/gi, '\n');

        // Tables (convert rows to line breaks and cells to spaces)
        md = md.replace(/<\/tr>/gi, '\n');
        md = md.replace(/<\/(td|th)>/gi, '  ');

        // Strip remaining HTML tags
        md = md.replace(/<[^>]+>/g, '');

        // Decode common and numeric HTML entities
        md = md.replace(/&nbsp;/gi, ' ')
               .replace(/&amp;/gi, '&')
               .replace(/&lt;/gi, '<')
               .replace(/&gt;/gi, '>')
               .replace(/&quot;/gi, '"')
               .replace(/&#39;/gi, "'")
               .replace(/&ndash;/gi, '–')
               .replace(/&mdash;/gi, '—')
               .replace(/&hellip;/gi, '…')
               .replace(/&#(\d+);/g, (m, dec) => {
                   try { return String.fromCharCode(parseInt(dec, 10)); } catch(_) { return m; }
               })
               .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => {
                   try { return String.fromCharCode(parseInt(hex, 16)); } catch(_) { return m; }
               });

        // Normalize whitespace and blank lines
        const lines = md.split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim());
        md = lines.join('\n');
        md = md.replace(/\n{3,}/g, '\n\n');
        return md.trim();
    }
    window.htmlToMarkdownSimple = htmlToMarkdownSimple;

    function formatMarkdownToHtml(markdown) {
        if (!markdown) return '';
        const lines = markdown.replace(/\r\n/g, '\n').split('\n');
        let html = '';
        let listStack = [];

        function closeListsToLevel(targetLevel) {
            let out = '';
            while (listStack.length > targetLevel) {
                listStack.pop();
                out += '</li></ul>';
            }
            return out;
        }

        function formatInline(text) {
            if (!text) return '';
            let s = text;
            s = s.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>');
            s = s.replace(/__([^\n]+?)__/g, '<strong>$1</strong>');
            s = s.replace(/(?<=^|\s)\*([^\n*]+?)\*(?=\s|$|[.,!?])/g, '<em>$1</em>');
            s = s.replace(/(?<=^|\s)_([^\n_]+?)_(?=\s|$|[.,!?])/g, '<em>$1</em>');
            s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
            s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
            return s;
        }

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            const listMatch = line.match(/^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/);
            if (listMatch) {
                const indentSpaces = listMatch[1].length;
                const content = listMatch[2];
                const level = Math.floor(indentSpaces / 2) + 1;

                if (level > listStack.length) {
                    while (listStack.length < level) {
                        const isSub = listStack.length > 0;
                        listStack.push(listStack.length + 1);
                        html += `<ul class="markdown-list${isSub ? ' markdown-sublist' : ''}"><li>`;
                    }
                } else if (level < listStack.length) {
                    html += closeListsToLevel(level);
                    html += '</li><li>';
                } else {
                    html += '</li><li>';
                }

                html += formatInline(content);
                continue;
            }

            if (listStack.length > 0) {
                html += closeListsToLevel(0);
            }

            const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
            if (hMatch) {
                const hNum = hMatch[1].length;
                const headingTag = hNum === 1 ? 'h2' : (hNum === 2 ? 'h3' : 'h4');
                html += `<${headingTag} class="summary-heading">${formatInline(hMatch[2])}</${headingTag}>`;
                continue;
            }

            const bqMatch = line.match(/^>\s*(.*)$/);
            if (bqMatch) {
                html += `<blockquote>${formatInline(bqMatch[1])}</blockquote>`;
                continue;
            }

            if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
                html += '<hr>';
                continue;
            }

            if (!line.trim()) {
                continue;
            }

            html += `<p>${formatInline(line)}</p>`;
        }

        if (listStack.length > 0) {
            html += closeListsToLevel(0);
        }

        return html;
    }
    window.formatMarkdownToHtml = formatMarkdownToHtml;

    function cleanMarkdownToPlainText(markdown) {
        if (!markdown) return '';
        return markdown
            .replace(/^#+\s+/gim, '')
            .replace(/\*\*([^\n]+?)\*\*/g, '$1')
            .replace(/(?<=^|\s)\*([^\n*]+?)\*(?=\s|$|[.,!?])/g, '$1')
            .replace(/__([^\n_]+?)__/g, '$1')
            .replace(/(?<=^|\s)_([^\n_]+?)_(?=\s|$|[.,!?])/g, '$1')
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                return text === url ? url : `${text} (${url})`;
            })
            .replace(/`([^`]+)`/g, '$1')
            .replace(/^>\s*/gm, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }
    window.cleanMarkdownToPlainText = cleanMarkdownToPlainText;

    function extractYoutubeVideoId(url = '', html = '', doc = null) {
        // 1. Direct URL check
        if (url) {
            const urlMatch = url.match(/(?:v=|shorts\/|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
            if (urlMatch) return urlMatch[1];
        }

        // 2. DOM inspection if doc is provided
        if (doc) {
            // OpenGraph video meta tags
            const ogVideo = doc.querySelector('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"]');
            if (ogVideo && ogVideo.content) {
                const ogMatch = ogVideo.content.match(/(?:v=|embed\/|v\/|watch\?v=)([a-zA-Z0-9_-]{11})/);
                if (ogMatch) return ogMatch[1];
            }

            // WP YouTube Lyte divs (e.g. <div id="lyte_z8P7AU14Bp8">)
            const lyteDiv = doc.querySelector('div[id^="lyte_"]');
            if (lyteDiv && lyteDiv.id) {
                const lyteMatch = lyteDiv.id.match(/lyte_([a-zA-Z0-9_-]{11})/);
                if (lyteMatch) return lyteMatch[1];
            }

            // Embedded iframes
            const iframes = doc.querySelectorAll('iframe[src*="youtube.com"], iframe[src*="youtu.be"], iframe[data-src*="youtube.com"], iframe[data-src*="youtu.be"]');
            for (const iframe of iframes) {
                const src = iframe.getAttribute('src') || iframe.getAttribute('data-src') || '';
                const m = src.match(/(?:embed\/|v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                if (m) return m[1];
            }
        }

        // 3. Fallback regex on raw HTML string
        if (html) {
            const lyteHtmlMatch = html.match(/id="lyte_([a-zA-Z0-9_-]{11})/);
            if (lyteHtmlMatch) return lyteHtmlMatch[1];

            const ogHtmlMatch = html.match(/property="og:video"(?:[^>]+content="([^"]+)")?/i);
            if (ogHtmlMatch && ogHtmlMatch[1]) {
                const m = ogHtmlMatch[1].match(/(?:v=|embed\/|v\/|watch\?v=)([a-zA-Z0-9_-]{11})/);
                if (m) return m[1];
            }

            const embedHtmlMatch = html.match(/(?:youtube\.com\/(?:embed\/|v\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (embedHtmlMatch) return embedHtmlMatch[1];
        }

        return null;
    }

    function extractTranscriptText(data) {
        if (!data) return '';
        if (typeof data !== 'string') {
            try {
                data = JSON.stringify(data);
            } catch (_) {
                return '';
            }
        }

        // 1. JSON format (events / segs)
        try {
            const json = JSON.parse(data);
            if (json.events && Array.isArray(json.events)) {
                const segTexts = [];
                for (const ev of json.events) {
                    if (ev.segs && Array.isArray(ev.segs)) {
                        for (const s of ev.segs) {
                            if (s.utf8) segTexts.push(s.utf8);
                        }
                    }
                }
                if (segTexts.length > 0) {
                    return segTexts.join(' ')
                        .replace(/&#39;/g, "'")
                        .replace(/&quot;/g, '"')
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/\s+/g, ' ')
                        .trim()
                        .substring(0, 50000);
                }
            }
        } catch (_) {
            // Not JSON, continue to XML
        }

        // 2. XML DOM parsing
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(data, "text/xml");
            let nodes = Array.from(xmlDoc.getElementsByTagName('p'));
            if (nodes.length === 0) {
                nodes = Array.from(xmlDoc.getElementsByTagName('text'));
            }

            if (nodes.length > 0) {
                const texts = nodes.map(node => {
                    const txt = node.textContent || '';
                    return txt.replace(/<[^>]+>/g, '');
                });
                const joined = texts.join(' ')
                    .replace(/&#39;/g, "'")
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/\s+/g, ' ')
                    .trim();
                if (joined.length > 0) {
                    return joined.substring(0, 50000);
                }
            }
        } catch (xmlErr) {
            console.warn("[PureTidings Desktop] Error parsing transcript XML via DOMParser:", xmlErr);
        }

        // 3. Regex fallback
        try {
            const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
            const matches = [];
            let match;
            while ((match = pRegex.exec(data)) !== null) {
                matches.push(match[1]);
            }
            if (matches.length === 0) {
                const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/gi;
                while ((match = textRegex.exec(data)) !== null) {
                    matches.push(match[1]);
                }
            }
            if (matches.length > 0) {
                const joined = matches.join(' ')
                    .replace(/<[^>]+>/g, '')
                    .replace(/&#39;/g, "'")
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/\s+/g, ' ')
                    .trim();
                if (joined.length > 0) {
                    return joined.substring(0, 50000);
                }
            }
        } catch (rxErr) {
            console.warn("[PureTidings Desktop] Error parsing transcript via regex:", rxErr);
        }

        return '';
    }

    function renderReaderVideoPlayer(videoId) {
        const videoEl = document.getElementById('reader-video-info');
        if (!videoEl) return;
        if (videoId) {
            videoEl.classList.remove('hidden');
            videoEl.innerHTML = `
                <div class="reader-video-wrapper">
                    <iframe src="https://www.youtube-nocookie.com/embed/${videoId}" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
                </div>
            `;
        } else {
            videoEl.classList.add('hidden');
            videoEl.innerHTML = '';
        }
    }

    function formatContentIfPlain(content) {
        if (!content) return '';
        // If it already contains HTML block tags, keep it
        if (/<(?:p|div|article|section|table|ul|ol|h[1-6]|br)\b/i.test(content)) {
            return content;
        }
        if (content.includes('🤖') && typeof formatMarkdownToHtml === 'function') {
            return formatMarkdownToHtml(content);
        }
        if (typeof formatDescription === 'function') {
            return formatDescription(content);
        }
        return content.trim().split(/\n{2,}/).map(p => `<p>${p.trim().replace(/\n/g, '<br>')}</p>`).join('');
    }

    // Reader Mode Controller
    async function openReaderModal(data) {
        closeAllModals();
        const modal = document.getElementById('reader-modal');
        if (!modal) return;
        modal.style.display = 'block';

        // Setup and restore custom modal dimensions & coordinates
        const modalCard = document.getElementById('reader-modal-card');
        if (modalCard) {
            const { w: viewW, h: viewH, zoom } = getViewportDimensions();
            const isAndroid = document.documentElement.classList.contains('is-android') || /Android/i.test(navigator.userAgent);
            let savedGeo = null;
            try {
                savedGeo = JSON.parse(localStorage.getItem('puretidings_reader_geometry') || localStorage.getItem('puretidings_reader_size') || 'null');
            } catch (_) {}

            let w = (savedGeo && savedGeo.width) ? Math.max(380, savedGeo.width) : Math.min(960, Math.max(380, viewW - 60));
            let h = (savedGeo && savedGeo.height) ? Math.max(250, savedGeo.height) : Math.min(840, Math.max(250, viewH - 60));
            let left = (savedGeo && savedGeo.left !== undefined) ? savedGeo.left : Math.round(Math.max(10, (viewW - w) / 2));
            let top = (savedGeo && savedGeo.top !== undefined) ? savedGeo.top : Math.round(Math.max(10, (viewH - h) / 2));

            if (isAndroid) {
                w = Math.max(280, Math.min(w, viewW - 12));
                h = Math.max(160, Math.min(h, viewH - 12));
                left = Math.max(6, Math.min(left, viewW - w - 6));
                top = Math.max(6, Math.min(top, viewH - h - 6));
            } else {
                left = Math.max(-w + 80, Math.min(left, viewW - 80));
                top = Math.max(0, Math.min(top, viewH - 40));
            }

            modalCard.style.width = w + 'px';
            modalCard.style.height = h + 'px';
            modalCard.style.left = left + 'px';
            modalCard.style.top = top + 'px';

            function saveReaderGeometry() {
                if (!modalCard) return;
                const geo = {
                    left: Math.round(parseFloat(modalCard.style.left) || modalCard.offsetLeft || 0),
                    top: Math.round(parseFloat(modalCard.style.top) || modalCard.offsetTop || 0),
                    width: Math.round(parseFloat(modalCard.style.width) || modalCard.offsetWidth || 960),
                    height: Math.round(parseFloat(modalCard.style.height) || modalCard.offsetHeight || 750)
                };
                try {
                    localStorage.setItem('puretidings_reader_geometry', JSON.stringify(geo));
                    localStorage.setItem('puretidings_reader_size', JSON.stringify({ width: geo.width, height: geo.height }));
                } catch (_) {}
            }

            // Draggable by header / toolbar (supports mouse and touch)
            const header = modalCard.querySelector('#reader-modal-header') || modalCard.querySelector('.reader-modal-header');
            if (header && !header._dragAttached) {
                header._dragAttached = true;
                header.style.cursor = 'move';
                header.style.userSelect = 'none';

                function startReaderDrag(e) {
                    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a') || e.target.closest('select')) return;
                    const isTouch = !!e.touches;
                    const point = isTouch ? e.touches[0] : e;
                    if (!point) return;
                    if (!isTouch) e.preventDefault();

                    const startX = point.clientX;
                    const startY = point.clientY;
                    const initialLeft = parseFloat(modalCard.style.left) || modalCard.offsetLeft || 0;
                    const initialTop = parseFloat(modalCard.style.top) || modalCard.offsetTop || 0;

                    function onDrag(ev) {
                        const curPoint = isTouch ? (ev.touches && ev.touches[0]) : ev;
                        if (!curPoint) return;
                        if (ev.cancelable) ev.preventDefault();
                        const { w: curViewW, h: curViewH, zoom: activeZoom } = getViewportDimensions();
                        const dx = (curPoint.clientX - startX) / activeZoom;
                        const dy = (curPoint.clientY - startY) / activeZoom;
                        let nLeft = initialLeft + dx;
                        let nTop = initialTop + dy;

                        const isAndroidMobile = document.documentElement.classList.contains('is-android') || /Android/i.test(navigator.userAgent);
                        if (isAndroidMobile) {
                            const cardW = modalCard.offsetWidth;
                            const cardH = modalCard.offsetHeight;
                            nLeft = Math.max(6, Math.min(nLeft, curViewW - cardW - 6));
                            nTop = Math.max(6, Math.min(nTop, curViewH - cardH - 6));
                        } else {
                            nLeft = Math.max(-modalCard.offsetWidth + 80, Math.min(nLeft, curViewW - 80));
                            nTop = Math.max(0, Math.min(nTop, curViewH - 40));
                        }

                        modalCard.style.left = nLeft + 'px';
                        modalCard.style.top = nTop + 'px';
                    }

                    function stopDrag() {
                        if (isTouch) {
                            window.removeEventListener('touchmove', onDrag);
                            window.removeEventListener('touchend', stopDrag);
                            window.removeEventListener('touchcancel', stopDrag);
                        } else {
                            window.removeEventListener('mousemove', onDrag);
                            window.removeEventListener('mouseup', stopDrag);
                        }
                        saveReaderGeometry();
                    }

                    if (isTouch) {
                        window.addEventListener('touchmove', onDrag, { passive: false });
                        window.addEventListener('touchend', stopDrag);
                        window.addEventListener('touchcancel', stopDrag);
                    } else {
                        window.addEventListener('mousemove', onDrag);
                        window.addEventListener('mouseup', stopDrag);
                    }
                }

                header.addEventListener('mousedown', startReaderDrag);
                header.addEventListener('touchstart', startReaderDrag, { passive: true });
            }

            // Custom corner resize grip handle (supports mouse and touch)
            const resizeHandle = modalCard.querySelector('#reader-resize-handle') || modalCard.querySelector('.modal-resize-handle');
            if (resizeHandle && !resizeHandle._resizeAttached) {
                resizeHandle._resizeAttached = true;

                function startReaderResize(e) {
                    const isTouch = !!e.touches;
                    const point = isTouch ? e.touches[0] : e;
                    if (!point) return;
                    e.stopPropagation();
                    if (e.cancelable) e.preventDefault();

                    const startX = point.clientX;
                    const startY = point.clientY;
                    const startW = parseFloat(modalCard.style.width) || modalCard.offsetWidth;
                    const startH = parseFloat(modalCard.style.height) || modalCard.offsetHeight;

                    function onGripResize(ev) {
                        const curPoint = isTouch ? (ev.touches && ev.touches[0]) : ev;
                        if (!curPoint) return;
                        if (ev.cancelable) ev.preventDefault();
                        const { zoom: activeZoom, w: curViewW, h: curViewH } = getViewportDimensions();
                        const dx = (curPoint.clientX - startX) / activeZoom;
                        const dy = (curPoint.clientY - startY) / activeZoom;

                        let nW = Math.max(300, startW + dx);
                        let nH = Math.max(200, startH + dy);

                        const isAndroidMobile = document.documentElement.classList.contains('is-android') || /Android/i.test(navigator.userAgent);
                        if (isAndroidMobile) {
                            const curLeft = parseFloat(modalCard.style.left) || modalCard.offsetLeft || 6;
                            const curTop = parseFloat(modalCard.style.top) || modalCard.offsetTop || 6;
                            const maxAllowedW = curViewW - curLeft - 6;
                            const maxAllowedH = curViewH - curTop - 6;
                            nW = Math.min(maxAllowedW, nW);
                            nH = Math.min(maxAllowedH, nH);
                        }

                        modalCard.style.width = nW + 'px';
                        modalCard.style.height = nH + 'px';
                    }

                    function stopGripResize() {
                        if (isTouch) {
                            window.removeEventListener('touchmove', onGripResize);
                            window.removeEventListener('touchend', stopGripResize);
                            window.removeEventListener('touchcancel', stopGripResize);
                        } else {
                            window.removeEventListener('mousemove', onGripResize);
                            window.removeEventListener('mouseup', stopGripResize);
                        }
                        saveReaderGeometry();
                    }

                    if (isTouch) {
                        window.addEventListener('touchmove', onGripResize, { passive: false });
                        window.addEventListener('touchend', stopGripResize);
                        window.addEventListener('touchcancel', stopGripResize);
                    } else {
                        window.addEventListener('mousemove', onGripResize);
                        window.addEventListener('mouseup', stopGripResize);
                    }
                }

                resizeHandle.addEventListener('mousedown', startReaderResize);
                resizeHandle.addEventListener('touchstart', startReaderResize, { passive: false });
            }

            // Right-edge width resize handle
            const edgeRight = modalCard.querySelector('#reader-resize-edge-right');
            if (edgeRight && !edgeRight._edgeAttached) {
                edgeRight._edgeAttached = true;
                function startEdgeResize(e) {
                    const isTouch = !!e.touches;
                    const point = isTouch ? e.touches[0] : e;
                    if (!point) return;
                    e.stopPropagation();
                    if (e.cancelable) e.preventDefault();
                    const startX = point.clientX;
                    const startW = parseFloat(modalCard.style.width) || modalCard.offsetWidth;

                    function onEdgeDrag(ev) {
                        const curPoint = isTouch ? (ev.touches && ev.touches[0]) : ev;
                        if (!curPoint) return;
                        if (ev.cancelable) ev.preventDefault();
                        const { zoom: activeZoom, w: curViewW } = getViewportDimensions();
                        const dx = (curPoint.clientX - startX) / activeZoom;

                        let nW = Math.max(300, startW + dx);
                        const isAndroidMobile = document.documentElement.classList.contains('is-android') || /Android/i.test(navigator.userAgent);
                        if (isAndroidMobile) {
                            const curLeft = parseFloat(modalCard.style.left) || modalCard.offsetLeft || 6;
                            const maxAllowedW = curViewW - curLeft - 6;
                            nW = Math.min(maxAllowedW, nW);
                        }

                        modalCard.style.width = nW + 'px';
                    }

                    function stopEdgeDrag() {
                        if (isTouch) {
                            window.removeEventListener('touchmove', onEdgeDrag);
                            window.removeEventListener('touchend', stopEdgeDrag);
                            window.removeEventListener('touchcancel', stopEdgeDrag);
                        } else {
                            window.removeEventListener('mousemove', onEdgeDrag);
                            window.removeEventListener('mouseup', stopEdgeDrag);
                        }
                        saveReaderGeometry();
                    }

                    if (isTouch) {
                        window.addEventListener('touchmove', onEdgeDrag, { passive: false });
                        window.addEventListener('touchend', stopEdgeDrag);
                        window.addEventListener('touchcancel', stopEdgeDrag);
                    } else {
                        window.addEventListener('mousemove', onEdgeDrag);
                        window.addEventListener('mouseup', stopEdgeDrag);
                    }
                }
                edgeRight.addEventListener('mousedown', startEdgeResize);
                edgeRight.addEventListener('touchstart', startEdgeResize, { passive: false });
            }

            // Fit / Maximize Toggle Button
            const fitBtn = modalCard.querySelector('#reader-modal-fit');
            if (fitBtn && !fitBtn._fitAttached) {
                fitBtn._fitAttached = true;
                fitBtn.addEventListener('click', () => {
                    const { w: curViewW, h: curViewH } = getViewportDimensions();
                    const curW = parseFloat(modalCard.style.width) || modalCard.offsetWidth;
                    const curH = parseFloat(modalCard.style.height) || modalCard.offsetHeight;
                    const isMax = curW >= curViewW - 20 && curH >= curViewH - 20;

                    if (isMax) {
                        // Restore to comfortable floating size
                        const nW = Math.max(380, Math.min(960, curViewW - 40));
                        const nH = Math.max(250, Math.min(840, curViewH - 40));
                        const nLeft = Math.round(Math.max(10, (curViewW - nW) / 2));
                        const nTop = Math.round(Math.max(10, (curViewH - nH) / 2));
                        modalCard.style.width = nW + 'px';
                        modalCard.style.height = nH + 'px';
                        modalCard.style.left = nLeft + 'px';
                        modalCard.style.top = nTop + 'px';
                    } else {
                        // Maximize to full viewport
                        modalCard.style.width = (curViewW - 12) + 'px';
                        modalCard.style.height = (curViewH - 12) + 'px';
                        modalCard.style.left = '6px';
                        modalCard.style.top = '6px';
                    }
                    saveReaderGeometry();
                });
            }

            // Attach ResizeObserver to remember resized size across app restarts
            if (window.ResizeObserver && !modalCard._resizeObserverAttached) {
                modalCard._resizeObserverAttached = true;
                let resizeTimer;
                const ro = new ResizeObserver(entries => {
                    for (let entry of entries) {
                        if (entry.contentRect && entry.contentRect.width > 200 && entry.contentRect.height > 100) {
                            clearTimeout(resizeTimer);
                            resizeTimer = setTimeout(() => {
                                saveReaderGeometry();
                            }, 250);
                        }
                    }
                });
                ro.observe(modalCard);
            }
        }

        currentReaderArticle = data;
        currentReaderAiMarkdown = '';
        currentReaderVideoId = extractYoutubeVideoId(data.url || '', '', null);

        const titleEl = document.getElementById('reader-title');
        const bylineEl = document.getElementById('reader-byline');
        const bodyEl = document.getElementById('reader-article-body');
        const thumbEl = document.getElementById('reader-thumbnail');
        const loadingEl = document.getElementById('reader-loading');
        const contentEl = document.getElementById('reader-content');

        // Hide AI Container on initial open
        const aiContainer = document.getElementById('reader-ai-container');
        if (aiContainer) {
            aiContainer.style.display = 'none';
            const aiContent = document.getElementById('reader-ai-content');
            if (aiContent) aiContent.innerHTML = '';
        }

        if (titleEl) titleEl.textContent = data.title || 'Untitled';

        if (bylineEl) {
            const metaParts = [];
            if (data.source) metaParts.push(escapeHtml(data.source));
            if (data.author) metaParts.push(escapeHtml(data.author));
            if (data.date) metaParts.push(escapeHtml(new Date(data.date).toLocaleString()));
            const prefix = metaParts.length ? metaParts.join(' &middot; ') + ' &middot; ' : '';
            const isEmail = data.isEmail || (data.url && data.url.startsWith('imap:'));
            if (data.url && !isEmail) {
                bylineEl.innerHTML = `${prefix}Link: <a href="#" id="reader-original-link" style="color:var(--accent-color, #1a73e8); text-decoration:underline; cursor:pointer;" title="${window.i18n ? window.i18n.t('tooltip_open_browser') : 'Open original article in browser'}" data-i18n-title="tooltip_open_browser">${escapeHtml(data.url)}</a>`;
                const origLink = document.getElementById('reader-original-link');
                if (origLink) {
                    origLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        tauriOpenBrowser(data.url);
                    });
                }
            } else {
                bylineEl.innerHTML = metaParts.join(' &middot; ');
            }
        }

        if (thumbEl) {
            if (data.featuredImage) {
                thumbEl.src = data.featuredImage;
                thumbEl.classList.remove('hidden');
            } else {
                thumbEl.src = '';
                thumbEl.classList.add('hidden');
            }
        }

        // Render embedded video if present
        renderReaderVideoPlayer(currentReaderVideoId);

        // Sync Favorites & Summary Cart buttons in reader toolbar
        const starBtn = document.getElementById('reader-star-btn');
        const summaryBtn = document.getElementById('reader-summary-btn');
        if (starBtn && data.url) {
            chrome.storage.local.get('favoritedLinks').then(({ favoritedLinks = [] }) => {
                const isFav = favoritedLinks.includes(data.url);
                starBtn.classList.toggle('favorited', isFav);
                starBtn.innerHTML = isFav ? '&#9733;' : '&#9734;';
                starBtn.title = window.i18n ? window.i18n.t(isFav ? 'tooltip_remove_favorites' : 'tooltip_add_favorites') : (isFav ? 'Remove from favorites' : 'Add to favorites');
                starBtn.setAttribute('data-i18n-title', isFav ? 'tooltip_remove_favorites' : 'tooltip_add_favorites');
            });
        }
        if (summaryBtn && data.url) {
            chrome.storage.local.get('summaryLinks').then(({ summaryLinks = [] }) => {
                const isSum = summaryLinks.includes(data.url);
                summaryBtn.classList.toggle('active', isSum);
                summaryBtn.classList.toggle('in-cart', isSum);
                summaryBtn.title = window.i18n ? window.i18n.t(isSum ? 'tooltip_remove_summary' : 'tooltip_add_summary') : (isSum ? 'Remove from summary cart' : 'Add to summary cart');
                summaryBtn.setAttribute('data-i18n-title', isSum ? 'tooltip_remove_summary' : 'tooltip_add_summary');
            });
        }

        // Configure AI buttons initial visibility
        const isPureYt = (data.url || '').match(/(?:youtube\.com|youtu\.be)/);
        const aiBtn = document.getElementById('reader-generate-ai-btn');
        const ytAiBtn = document.getElementById('reader-generate-yt-ai-btn');
        if (aiBtn) aiBtn.style.display = isPureYt ? 'none' : 'inline-block';
        if (ytAiBtn) ytAiBtn.style.display = currentReaderVideoId ? 'inline-block' : 'none';

        // Intercept link clicks inside article body
        if (bodyEl && !bodyEl.dataset.linkDelegated) {
            bodyEl.dataset.linkDelegated = 'true';
            bodyEl.addEventListener('click', (e) => {
                const anchor = e.target.closest('a');
                if (anchor && anchor.href && !anchor.href.startsWith('javascript:')) {
                    e.preventDefault();
                    tauriOpenBrowser(anchor.href);
                }
            });
        }

        if (bodyEl) {
            const isEmail = data.isEmail || (data.url && data.url.startsWith('imap:'));
            if (isEmail) {
                renderEmailInReader(data, bodyEl);
                if (loadingEl) loadingEl.classList.add('hidden');
                if (contentEl) contentEl.classList.remove('hidden');

                // Sync read status to IMAP server in background
                let emailUid = data.emailUid;
                let accountId = data.accountId;
                if (!emailUid && data.url && data.url.startsWith('imap://')) {
                    const parts = data.url.substring('imap://'.length).split('/');
                    if (parts.length >= 2) {
                        accountId = parts[0];
                        emailUid = parts[1];
                    }
                }
                if (emailUid && accountId && typeof markEmailReadNative === 'function') {
                    markEmailReadNative(accountId, emailUid, true);
                }
            } else {
                const themeBtn = document.getElementById('reader-email-theme-btn');
                if (themeBtn) themeBtn.style.display = 'none';
                bodyEl.classList.remove('email-mode');

                if (data.fullContentHtmlText) {
                    bodyEl.innerHTML = data.fullContentHtmlText;
                    if (loadingEl) loadingEl.classList.add('hidden');
                    if (contentEl) contentEl.classList.remove('hidden');
                } else if (data.description && (data.description.includes('🤖') || data.description.includes('<h3>'))) {
                    bodyEl.innerHTML = formatContentIfPlain(data.description);
                    if (loadingEl) loadingEl.classList.add('hidden');
                    if (contentEl) contentEl.classList.remove('hidden');
                } else if (data.url && !data.url.includes('youtube.com') && !data.url.startsWith('imap:')) {
                    if (loadingEl) loadingEl.classList.remove('hidden');
                    if (contentEl) contentEl.classList.add('hidden');
                    try {
                        const html = await tauriInvoke('fetch_url', { url: data.url });
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, "text/html");

                        // Check for embedded YouTube video (e.g. finanzmarktwelt.de wp-youtube-lyte)
                        const embeddedVideoId = extractYoutubeVideoId(data.url, html, doc);
                        if (embeddedVideoId) {
                            currentReaderVideoId = embeddedVideoId;
                            renderReaderVideoPlayer(embeddedVideoId);
                            if (ytAiBtn) ytAiBtn.style.display = 'inline-block';
                        }

                        if (typeof preprocessDOM === 'function') {
                            preprocessDOM(doc, data.url);
                        }
                        const reader = new Readability(doc);
                        const article = reader.parse();
                        bodyEl.innerHTML = article ? article.content : (formatContentIfPlain(data.description) || '<p>Could not extract full text.</p>');
                    } catch (e) {
                        bodyEl.innerHTML = formatContentIfPlain(data.description) || '<p>Failed to load full article content.</p>';
                    } finally {
                        if (loadingEl) loadingEl.classList.add('hidden');
                        if (contentEl) contentEl.classList.remove('hidden');
                    }
                } else {
                    bodyEl.innerHTML = formatContentIfPlain(data.description) || '';
                    if (loadingEl) loadingEl.classList.add('hidden');
                    if (contentEl) contentEl.classList.remove('hidden');
                }
            }

            // If video ID wasn't found from URL or fetch, inspect rendered body and payload
            if (!currentReaderVideoId) {
                const potentialVideoId = extractYoutubeVideoId(
                    data.url || '',
                    (data.fullContentHtmlText || '') + ' ' + (data.description || '') + ' ' + (bodyEl ? bodyEl.innerHTML : ''),
                    bodyEl
                );
                if (potentialVideoId) {
                    currentReaderVideoId = potentialVideoId;
                    renderReaderVideoPlayer(potentialVideoId);
                    const ytAiBtn = document.getElementById('reader-generate-yt-ai-btn');
                    if (ytAiBtn) ytAiBtn.style.display = 'inline-block';
                }
            }
        }
    }

    function renderEmailInReader(data, bodyEl) {
        bodyEl.classList.add('email-mode');
        bodyEl.innerHTML = '';

        const themeBtn = document.getElementById('reader-email-theme-btn');
        if (themeBtn) {
            themeBtn.style.display = 'inline-flex';
            const tLight = (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('reader_email_theme_light') : '☀️ Light';
            themeBtn.innerHTML = tLight;
            themeBtn.title = (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('tooltip_email_theme') : 'Toggle Light/Dark Email View';
        }

        const iframe = document.createElement('iframe');
        iframe.id = 'reader-email-frame';
        iframe.setAttribute('sandbox', 'allow-same-origin allow-popups');
        iframe.style.width = '100%';
        iframe.style.border = '1px solid var(--border-color, #444)';
        iframe.style.borderRadius = '8px';
        iframe.style.minHeight = '480px';
        iframe.style.background = '#ffffff';
        iframe.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.25)';
        iframe.style.display = 'block';

        bodyEl.appendChild(iframe);

        const emailContent = data.fullContentHtmlText || data.content || (data.description ? formatContentIfPlain(data.description) : '<p style="color:#666; font-style:italic;">(No content in this email)</p>');

        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
            doc.open();
            doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
  <base target="_blank">
  <style>
    html, body {
      margin: 0;
      padding: 20px 24px;
      background-color: #ffffff;
      color: #222222;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.55;
      box-sizing: border-box;
      word-wrap: break-word;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    table {
      border-collapse: collapse;
    }
    a {
      color: #0066cc;
    }
    body.dark-email-theme {
      background-color: #1a1a1a !important;
      color: #e0e0e0 !important;
      filter: invert(0.9) hue-rotate(180deg);
    }
    body.dark-email-theme img,
    body.dark-email-theme video,
    body.dark-email-theme iframe {
      filter: invert(1) hue-rotate(180deg);
    }
  </style>
</head>
<body>
  ${emailContent}
</body>
</html>`);
            doc.close();

            // Intercept clicks on links inside the email iframe to open in default browser
            doc.addEventListener('click', (e) => {
                const anchor = e.target.closest('a');
                if (anchor && anchor.href && !anchor.href.startsWith('javascript:')) {
                    e.preventDefault();
                    tauriOpenBrowser(anchor.href);
                }
            });

            // Adjust iframe height dynamically to fit content
            const updateHeight = () => {
                try {
                    const h = doc.body?.scrollHeight || doc.documentElement?.scrollHeight;
                    if (h && h > 150) {
                        iframe.style.height = (h + 40) + 'px';
                    }
                } catch (_) {}
            };
            setTimeout(updateHeight, 80);
            setTimeout(updateHeight, 400);
            setTimeout(updateHeight, 1200);

            // Re-adjust height when images finish loading
            const imgs = doc.querySelectorAll('img');
            imgs.forEach(img => {
                img.setAttribute('referrerpolicy', 'no-referrer');
                img.addEventListener('load', updateHeight);
            });
        }
    }

    function closeReaderModal() {
        const modal = document.getElementById('reader-modal');
        if (modal) modal.style.display = 'none';
        const videoEl = document.getElementById('reader-video-info');
        if (videoEl) videoEl.innerHTML = '';
        const aiContainer = document.getElementById('reader-ai-container');
        if (aiContainer) aiContainer.style.display = 'none';
        const themeBtn = document.getElementById('reader-email-theme-btn');
        if (themeBtn) themeBtn.style.display = 'none';
        const bodyEl = document.getElementById('reader-article-body');
        if (bodyEl) {
            bodyEl.classList.remove('email-mode');
            bodyEl.innerHTML = '';
        }
        currentReaderArticle = null;
        currentReaderVideoId = null;
        currentReaderAiMarkdown = '';
    }

    window.openReaderModal = openReaderModal;
    window.closeReaderModal = closeReaderModal;

    // Helper: Trigger unified animated feedback (pop + glow + text change) on any button
    function triggerAnimatedButtonFeedback(btn, feedbackText, statusElId) {
        if (!btn) return;
        if (btn._feedbackTimer) clearTimeout(btn._feedbackTimer);
        if (!btn._origText) btn._origText = btn.textContent;

        btn.textContent = feedbackText;
        btn.classList.add('btn-feedback-active');

        if (statusElId) {
            const stEl = document.getElementById(statusElId);
            if (stEl) {
                stEl.textContent = feedbackText;
                stEl.style.color = '#28a745';
            }
        }

        btn._feedbackTimer = setTimeout(() => {
            btn.textContent = btn._origText;
            btn.classList.remove('btn-feedback-active');
            btn._origText = null;
            btn._feedbackTimer = null;
            if (statusElId) {
                const stEl = document.getElementById(statusElId);
                if (stEl) stEl.textContent = '';
            }
        }, 2000);
    }
    window.triggerAnimatedButtonFeedback = triggerAnimatedButtonFeedback;

    function formatArticleHtml(title, byline, bodyElOrHtml, md) {
        let bodyHtml = '';
        if (typeof bodyElOrHtml === 'string') {
            let str = bodyElOrHtml.trim();
            if (/<html\b/i.test(str) || /<!doctype\b/i.test(str)) {
                try {
                    const p = new DOMParser();
                    const d = p.parseFromString(str, 'text/html');
                    const headStyles = Array.from(d.head.querySelectorAll('style')).map(s => s.outerHTML).join('\n');
                    const bodyContent = d.body ? d.body.innerHTML : '';
                    bodyHtml = (headStyles ? headStyles + '\n' : '') + bodyContent;
                } catch (_) {
                    bodyHtml = str;
                }
            } else {
                bodyHtml = str;
            }
        } else if (bodyElOrHtml && bodyElOrHtml.nodeType) {
            const iframe = bodyElOrHtml.querySelector('#reader-email-frame') || (bodyElOrHtml.id === 'reader-email-frame' ? bodyElOrHtml : null);
            if (iframe) {
                try {
                    bodyHtml = iframe.contentDocument?.body?.innerHTML || '';
                } catch (_) {}
            }
            if (!bodyHtml) {
                bodyHtml = bodyElOrHtml.innerHTML || '';
            }
        }

        const hasHtmlTags = /<[a-z][\s\S]*>/i.test(bodyHtml);
        if (!bodyHtml || !hasHtmlTags) {
            bodyHtml = typeof formatMarkdownToHtml === 'function' ? formatMarkdownToHtml(md || '') : (bodyHtml || '');
        }

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="referrer" content="no-referrer">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title || 'Article')}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      max-width: 860px;
      margin: 40px auto;
      line-height: 1.6;
      padding: 0 20px;
      color: #24292e;
      background-color: #ffffff;
    }
    h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      line-height: 1.25;
      color: #1a1a1a;
    }
    .byline {
      color: #6a737d;
      font-size: 0.95rem;
      margin-bottom: 1.5rem;
      font-style: italic;
    }
    hr {
      border: 0;
      border-top: 1px solid #e1e4e8;
      margin: 1.5rem 0;
    }
    a {
      color: #0366d6;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 6px;
    }
    table {
      border-collapse: collapse;
    }
    p {
      margin-top: 0;
      margin-bottom: 1rem;
    }
    blockquote {
      border-left: 4px solid #dfe2e5;
      color: #6a737d;
      padding: 0 1rem;
      margin: 0 0 1rem 0;
    }
    pre, code {
      font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
      background-color: #f6f8fa;
      border-radius: 3px;
    }
    pre {
      padding: 16px;
      overflow: auto;
    }
    .timeline-block {
      line-height: 1.5;
      background-color: #f8f9fa;
      padding: 12px 16px;
      border-radius: 6px;
      margin: 1rem 0;
      font-family: SFMono-Regular, Consolas, monospace;
      font-size: 0.95rem;
    }
    .article-body {
      word-wrap: break-word;
      word-break: break-word;
    }
    @media (prefers-color-scheme: dark) {
      body {
        background-color: #1a1b1e;
        color: #e6edf3;
      }
      h1 {
        color: #ffffff;
      }
      .byline {
        color: #8b949e;
      }
      hr {
        border-top-color: #30363d;
      }
      a {
        color: #58a6ff;
      }
      pre, code {
        background-color: #21262d;
        color: #e6edf3;
      }
      blockquote {
        border-left-color: #30363d;
        color: #8b949e;
      }
      .timeline-block {
        background-color: #21262d;
        color: #e6edf3;
      }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title || 'Untitled')}</h1>
  ${byline ? `<div class="byline">${escapeHtml(byline)}</div>` : ''}
  <hr>
  <div class="article-body">
    ${bodyHtml}
  </div>
</body>
</html>`;
    }
    window.formatArticleHtml = formatArticleHtml;

    // Setup Reader Toolbar Events
    function setupReaderToolbar() {
        // Copy Article
        const copyBtn = document.getElementById('reader-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                if (!currentReaderArticle) return;
                const format = document.getElementById('reader-export-format')?.value || 'markdown';
                const title = currentReaderArticle.title || 'Untitled';
                const byline = document.getElementById('reader-byline')?.innerText || '';
                const bodyEl = document.getElementById('reader-article-body');
                let textToCopy = '';

                const emailFrame = document.getElementById('reader-email-frame');
                let emailHtml = '';
                if (emailFrame) {
                    try { emailHtml = emailFrame.contentDocument?.body?.innerHTML || ''; } catch (_) {}
                }
                if (!emailHtml && currentReaderArticle && (currentReaderArticle.isEmail || (currentReaderArticle.url && currentReaderArticle.url.startsWith('imap:')))) {
                    emailHtml = currentReaderArticle.fullContentHtmlText || currentReaderArticle.fullContentHtml || currentReaderArticle.content || '';
                }
                const activeHtml = emailHtml || bodyEl?.innerHTML || '';
                const md = `# ${title}\n\n${byline ? `*${byline}*\n\n` : ''}${htmlToMarkdownSimple(activeHtml)}`;

                if (format === 'markdown') {
                    textToCopy = md;
                } else if (format === 'html') {
                    textToCopy = formatArticleHtml(title, byline, activeHtml || bodyEl, md);
                } else {
                    textToCopy = cleanMarkdownToPlainText(md);
                }

                try {
                    await navigator.clipboard.writeText(textToCopy);
                    const feedback = (window.i18n && typeof window.i18n.t === 'function')
                        ? window.i18n.t('feedback_copied')
                        : 'Copied! ✓';
                    triggerAnimatedButtonFeedback(copyBtn, feedback, 'reader-copy-status');
                } catch (e) {
                    console.error('Failed to copy reader text:', e);
                }
            });
        }

        // Save Article
        const saveBtn = document.getElementById('reader-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                if (!currentReaderArticle) return;
                const format = document.getElementById('reader-export-format')?.value || 'markdown';
                const title = (currentReaderArticle.title || 'article').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
                const byline = document.getElementById('reader-byline')?.innerText || '';
                const bodyEl = document.getElementById('reader-article-body');

                const emailFrame = document.getElementById('reader-email-frame');
                let emailHtml = '';
                if (emailFrame) {
                    try { emailHtml = emailFrame.contentDocument?.body?.innerHTML || ''; } catch (_) {}
                }
                if (!emailHtml && currentReaderArticle && (currentReaderArticle.isEmail || (currentReaderArticle.url && currentReaderArticle.url.startsWith('imap:')))) {
                    emailHtml = currentReaderArticle.fullContentHtmlText || currentReaderArticle.fullContentHtml || currentReaderArticle.content || '';
                }
                const activeHtml = emailHtml || bodyEl?.innerHTML || '';
                const md = `# ${currentReaderArticle.title || 'Untitled'}\n\n${byline ? `*${byline}*\n\n` : ''}${htmlToMarkdownSimple(activeHtml)}`;

                let filename = '';
                if (format === 'markdown') {
                    filename = `${title}.md`;
                    downloadTextFile(filename, md, 'text/markdown');
                } else if (format === 'html') {
                    filename = `${title}.html`;
                    const html = formatArticleHtml(currentReaderArticle.title || 'Untitled', byline, activeHtml || bodyEl, md);
                    downloadTextFile(filename, html, 'text/html');
                } else {
                    filename = `${title}.txt`;
                    const txt = cleanMarkdownToPlainText(md);
                    downloadTextFile(filename, txt, 'text/plain');
                }

                const feedback = (window.i18n && typeof window.i18n.t === 'function')
                    ? window.i18n.t('feedback_saved')
                    : 'Saved! ✓';
                triggerAnimatedButtonFeedback(saveBtn, feedback, 'reader-copy-status');
                showInAppToast("Article Saved", `Saved as ${filename}`);
            });
        }

        // Email Theme Toggle Button
        const emailThemeBtn = document.getElementById('reader-email-theme-btn');
        if (emailThemeBtn && !emailThemeBtn._attached) {
            emailThemeBtn._attached = true;
            emailThemeBtn.addEventListener('click', () => {
                const iframe = document.getElementById('reader-email-frame');
                if (!iframe) return;
                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!doc || !doc.body) return;

                const isDark = doc.body.classList.toggle('dark-email-theme');
                const tLight = (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('reader_email_theme_light') : '☀️ Light';
                const tDark = (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('reader_email_theme_dark') : '🌙 Dark';

                if (isDark) {
                    emailThemeBtn.innerHTML = tDark;
                    iframe.style.background = '#1a1a1a';
                } else {
                    emailThemeBtn.innerHTML = tLight;
                    iframe.style.background = '#ffffff';
                }
            });
        }

        // Star / Favorite
        const starBtn = document.getElementById('reader-star-btn');
        if (starBtn) {
            starBtn.addEventListener('click', async () => {
                if (!currentReaderArticle || !currentReaderArticle.url) return;
                const url = currentReaderArticle.url;
                const { favoritedLinks = [] } = await chrome.storage.local.get('favoritedLinks');
                const isFav = favoritedLinks.includes(url);
                const newFavs = isFav ? favoritedLinks.filter(u => u !== url) : [...favoritedLinks, url];
                await chrome.storage.local.set({ favoritedLinks: newFavs });

                const nowFav = newFavs.includes(url);
                starBtn.classList.toggle('favorited', nowFav);
                starBtn.innerHTML = nowFav ? '&#9733;' : '&#9734;';
                starBtn.title = window.i18n ? window.i18n.t(nowFav ? 'tooltip_remove_favorites' : 'tooltip_add_favorites') : (nowFav ? 'Remove from favorites' : 'Add to favorites');
                starBtn.setAttribute('data-i18n-title', nowFav ? 'tooltip_remove_favorites' : 'tooltip_add_favorites');
                showInAppToast('Favorites', nowFav ? 'Article added to favorites' : 'Article removed from favorites');

                try {
                    const card = document.querySelector(`.post-item[data-link="${CSS.escape(url)}"]`);
                    if (card) {
                        const cardStar = card.querySelector('.favorite-btn');
                        if (cardStar) {
                            cardStar.classList.toggle('favorited', nowFav);
                            cardStar.innerHTML = nowFav ? '&#9733;' : '&#9734;';
                            cardStar.title = window.i18n ? window.i18n.t(nowFav ? 'tooltip_remove_favorites' : 'tooltip_add_favorites') : (nowFav ? 'Remove from favorites' : 'Add to favorites');
                            cardStar.setAttribute('data-i18n-title', nowFav ? 'tooltip_remove_favorites' : 'tooltip_add_favorites');
                        }
                    }
                } catch (_) {}

                if (typeof updateFavoritesView === 'function') updateFavoritesView();
            });
        }

        // Summary Cart
        const summaryBtn = document.getElementById('reader-summary-btn');
        if (summaryBtn) {
            summaryBtn.addEventListener('click', async () => {
                if (!currentReaderArticle || !currentReaderArticle.url) return;
                const url = currentReaderArticle.url;
                const { summaryLinks = [] } = await chrome.storage.local.get('summaryLinks');
                const isSum = summaryLinks.includes(url);
                const newSums = isSum ? summaryLinks.filter(u => u !== url) : [...summaryLinks, url];
                await chrome.storage.local.set({ summaryLinks: newSums });

                const nowSum = newSums.includes(url);
                summaryBtn.classList.toggle('active', nowSum);
                summaryBtn.classList.toggle('in-cart', nowSum);
                summaryBtn.title = window.i18n ? window.i18n.t(nowSum ? 'tooltip_remove_summary' : 'tooltip_add_summary') : (nowSum ? 'Remove from summary cart' : 'Add to summary cart');
                summaryBtn.setAttribute('data-i18n-title', nowSum ? 'tooltip_remove_summary' : 'tooltip_add_summary');
                showInAppToast('Summary Cart', nowSum ? 'Article added to summary cart' : 'Article removed from summary cart');

                try {
                    const card = document.querySelector(`.post-item[data-link="${CSS.escape(url)}"]`);
                    if (card) {
                        const cardSum = card.querySelector('.summary-btn');
                        if (cardSum) {
                            cardSum.classList.toggle('active', nowSum);
                            cardSum.title = window.i18n ? window.i18n.t(nowSum ? 'tooltip_remove_summary' : 'tooltip_add_summary') : (nowSum ? 'Remove from summary cart' : 'Add to summary cart');
                            cardSum.setAttribute('data-i18n-title', nowSum ? 'tooltip_remove_summary' : 'tooltip_add_summary');
                        }
                    }
                } catch (_) {}

                if (typeof updateSummaryView === 'function') updateSummaryView();
            });
        }

        // AI Summary Button
        const aiBtn = document.getElementById('reader-generate-ai-btn');
        if (aiBtn) {
            aiBtn.addEventListener('click', async () => {
                const container = document.getElementById('reader-ai-container');
                if (!container) return;
                container.style.display = 'block';
                const headerTitle = document.getElementById('reader-ai-header-title');
                if (headerTitle) headerTitle.textContent = window.i18n ? window.i18n.t('reader_ai_summary') : '🤖 AI Article Summary';

                const { aiReportPrompt } = await chrome.storage.sync.get('aiReportPrompt');
                const currentLang = (window.i18n && window.i18n.currentLanguage) || 'en';
                const promptInput = document.getElementById('reader-ai-prompt-input');
                if (promptInput) {
                    promptInput.value = (aiReportPrompt && !isLegacyGenericPrompt(aiReportPrompt))
                        ? aiReportPrompt.trim()
                        : getDefaultAiPrompt('article', currentLang);
                }

                const genBtn = document.getElementById('reader-ai-generate-btn');
                if (genBtn) genBtn.dataset.type = 'article';

                const contentEl = document.getElementById('reader-ai-content');
                if (contentEl) contentEl.innerHTML = '<p style="color: var(--text-color); font-style: italic; margin: 0;">Customize the prompt above if needed and click "Generate 🤖" to start the summary analysis.</p>';

                container.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }

        // AI Video Summary Button
        const ytAiBtn = document.getElementById('reader-generate-yt-ai-btn');
        if (ytAiBtn) {
            ytAiBtn.addEventListener('click', async () => {
                const container = document.getElementById('reader-ai-container');
                if (!container) return;
                container.style.display = 'block';
                const headerTitle = document.getElementById('reader-ai-header-title');
                if (headerTitle) headerTitle.textContent = window.i18n ? window.i18n.t('reader_ai_yt_summary') : '🎥 AI Video Summary';

                const { youtubeAiPrompt } = await chrome.storage.sync.get('youtubeAiPrompt');
                const currentLang = (window.i18n && window.i18n.currentLanguage) || 'en';
                const promptInput = document.getElementById('reader-ai-prompt-input');
                if (promptInput) {
                    promptInput.value = (youtubeAiPrompt && !isLegacyGenericPrompt(youtubeAiPrompt))
                        ? youtubeAiPrompt.trim()
                        : getDefaultAiPrompt('youtube', currentLang);
                }

                const genBtn = document.getElementById('reader-ai-generate-btn');
                if (genBtn) genBtn.dataset.type = 'youtube';

                const contentEl = document.getElementById('reader-ai-content');
                if (contentEl) contentEl.innerHTML = '<p style="color: var(--text-color); font-style: italic; margin: 0;">Customize the prompt above if needed and click "Generate 🤖" to start the video summary analysis.</p>';

                container.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }

        // Generate AI Button
        const genBtn = document.getElementById('reader-ai-generate-btn');
        if (genBtn) {
            genBtn.addEventListener('click', async () => {
                const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');
                if (!geminiApiKey || !geminiApiKey.trim()) {
                    alert("Please set your Google Gemini API Key in Settings > AI Features first to generate AI summaries.");
                    return;
                }

                const contentEl = document.getElementById('reader-ai-content');
                if (contentEl) {
                    contentEl.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 12px; padding: 15px 0;">
                            <div class="spinner" style="width: 22px; height: 22px; border: 3px solid rgba(255,255,255,0.2); border-top-color: var(--accent-color, #1a73e8); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                            <span style="font-weight: 500;">Analyzing and generating AI summary with Gemini...</span>
                        </div>
                    `;
                }

                genBtn.disabled = true;
                const origText = genBtn.textContent;
                genBtn.textContent = 'Generating...';

                let prompt = (document.getElementById('reader-ai-prompt-input')?.value || '').trim();
                const type = genBtn.dataset.type || 'article';
                const currentLang = (window.i18n && window.i18n.currentLanguage) || 'en';
                if (!prompt || isLegacyGenericPrompt(prompt)) {
                    prompt = getDefaultAiPrompt(type, currentLang);
                }

                try {
                    let aiResult = '';
                    if (type === 'youtube') {
                        // Ensure video ID is available
                        const videoId = currentReaderVideoId || extractYoutubeVideoId(
                            currentReaderArticle?.url || '',
                            (currentReaderArticle?.fullContentHtmlText || '') + ' ' + (currentReaderArticle?.description || ''),
                            document.getElementById('reader-article-body')
                        );
                        if (videoId && !currentReaderVideoId) {
                            currentReaderVideoId = videoId;
                        }

                        // Fetch transcript
                        let transcriptText = '';
                        let transcriptFound = false;
                        let failReason = '';

                        if (videoId) {
                            try {
                                console.log('[PureTidings Desktop] Fetching YouTube transcript for video ID:', videoId);
                                const res = await chrome.runtime.sendMessage({ action: 'fetchYoutubeTranscript', videoId });
                                if (res && res.status === 'ok' && res.xml) {
                                    transcriptText = extractTranscriptText(res.xml);
                                    if (transcriptText && transcriptText.length > 0) {
                                        transcriptFound = true;
                                        console.log(`[PureTidings Desktop] Successfully extracted transcript (${transcriptText.length} characters)`);
                                    } else {
                                        failReason = 'Script exists on YouTube but could not be parsed.';
                                    }
                                } else if (res && res.status === 'error') {
                                    failReason = res.message || 'Subtitles/transcript not available on YouTube.';
                                } else {
                                    failReason = 'Could not load script from YouTube.';
                                }
                            } catch (te) {
                                console.warn('[PureTidings Desktop] Could not load transcript:', te);
                                failReason = te.message || 'Error communicating with YouTube.';
                            }
                        } else {
                            failReason = 'Could not determine YouTube video ID.';
                        }

                        const bodyEl = document.getElementById('reader-article-body');
                        const descText = (bodyEl?.innerText || currentReaderArticle?.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().substring(0, 10000);
                        
                        let contentPayload = `Video Title: ${currentReaderArticle?.title || ''}\n\nVideo Description:\n${descText || 'No description provided.'}\n\n`;
                        if (transcriptFound && transcriptText) {
                            contentPayload += `Video Script / Transcript:\n${transcriptText}`;
                        } else {
                            contentPayload += `Video Script / Transcript:\nNo video script (transcript) available. (${failReason})`;
                        }

                        aiResult = await callGeminiApi(geminiApiKey, prompt, contentPayload);
                    } else {
                        // Regular article or Email
                        const bodyEl = document.getElementById('reader-article-body');
                        const emailFrame = document.getElementById('reader-email-frame');
                        let emailText = '';
                        if (emailFrame) {
                            try { emailText = emailFrame.contentDocument?.body?.innerText || ''; } catch (_) {}
                        }
                        const bodyText = (emailText || currentReaderArticle?.content_text || bodyEl?.innerText || currentReaderArticle?.description || '').trim();
                        let contentPayload = `URL: ${currentReaderArticle?.url || ''}\n`;
                        if (currentReaderArticle?.source) contentPayload += `Source: ${currentReaderArticle.source}\n`;
                        contentPayload += `Title: ${currentReaderArticle?.title || ''}\n\nContent:\n${bodyText.substring(0, 30000)}`;
                        aiResult = await callGeminiApi(geminiApiKey, prompt, contentPayload);
                    }

                    currentReaderAiMarkdown = aiResult;
                    if (contentEl) {
                        contentEl.innerHTML = typeof formatMarkdownToHtml === 'function' ? formatMarkdownToHtml(aiResult) : escapeHtml(aiResult).replace(/\n/g, '<br>');
                    }
                } catch (err) {
                    if (contentEl) {
                        contentEl.innerHTML = `<p style="color: #ff5252; font-weight: bold;">Error generating AI summary: ${escapeHtml(err.message)}</p>`;
                    }
                } finally {
                    genBtn.disabled = false;
                    genBtn.textContent = origText;
                }
            });
        }

        // Copy AI Result
        const copyAiBtn = document.getElementById('reader-copy-ai-btn');
        if (copyAiBtn) {
            copyAiBtn.addEventListener('click', async () => {
                if (!currentReaderAiMarkdown) return;
                const format = document.getElementById('reader-export-ai-format')?.value || 'markdown';
                let textToCopy = '';

                if (format === 'markdown') {
                    textToCopy = currentReaderAiMarkdown;
                } else if (format === 'html') {
                    textToCopy = typeof formatMarkdownToHtml === 'function' ? formatMarkdownToHtml(currentReaderAiMarkdown) : currentReaderAiMarkdown;
                } else {
                    textToCopy = cleanMarkdownToPlainText(currentReaderAiMarkdown);
                }

                try {
                    await navigator.clipboard.writeText(textToCopy);
                    const feedback = (window.i18n && typeof window.i18n.t === 'function')
                        ? window.i18n.t('feedback_copied')
                        : 'Copied! ✓';
                    triggerAnimatedButtonFeedback(copyAiBtn, feedback);
                } catch (e) {
                    console.error('Failed to copy AI summary:', e);
                }
            });
        }

        // Save AI Result
        const saveAiBtn = document.getElementById('reader-save-ai-btn');
        if (saveAiBtn) {
            saveAiBtn.addEventListener('click', () => {
                let markdown = (currentReaderAiMarkdown || '').trim();
                if (!markdown) {
                    const aiContentEl = document.getElementById('reader-ai-content');
                    if (aiContentEl && aiContentEl.innerText && !aiContentEl.innerText.includes('Customize the prompt above')) {
                        markdown = aiContentEl.innerText.trim();
                    }
                }
                if (!markdown && currentReaderArticle?.description && currentReaderArticle.description.includes('🤖')) {
                    markdown = currentReaderArticle.description.replace(/<[^>]+>/g, '').trim();
                }

                if (!markdown) {
                    showInAppToast("No Summary to Save", "Please generate an AI summary first before saving.", false, 4000);
                    return;
                }

                const format = document.getElementById('reader-export-ai-format')?.value || 'markdown';
                const cleanTitle = (currentReaderArticle?.title || 'article')
                    .replace(/[^a-zA-Z0-9_-]/g, '_')
                    .replace(/_+/g, '_')
                    .replace(/^_+|_+$/g, '')
                    .substring(0, 45) || 'article';
                const baseTitle = `${cleanTitle}_KI_Summary`;

                let filename = '';
                if (format === 'markdown') {
                    filename = `${baseTitle}.md`;
                    downloadTextFile(filename, markdown, 'text/markdown');
                } else if (format === 'html') {
                    filename = `${baseTitle}.html`;
                    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>AI Summary</title><style>body{font-family:sans-serif;max-width:800px;margin:40px auto;line-height:1.6;padding:0 20px;}hr{border:0;border-top:1px solid #ddd;margin:20px 0;}</style></head><body><h1>AI Summary</h1><hr>${typeof formatMarkdownToHtml === 'function' ? formatMarkdownToHtml(markdown) : markdown}</body></html>`;
                    downloadTextFile(filename, html, 'text/html');
                } else {
                    filename = `${baseTitle}.txt`;
                    const txt = cleanMarkdownToPlainText(markdown);
                    downloadTextFile(filename, txt, 'text/plain');
                }

                showInAppToast("AI Summary Saved", `Saved as ${filename}`);
                const feedback = (window.i18n && typeof window.i18n.t === 'function')
                    ? window.i18n.t('feedback_saved')
                    : 'Saved! ✓';
                triggerAnimatedButtonFeedback(saveAiBtn, feedback);
            });
        }

        // Close AI Result
        const closeAiBtn = document.getElementById('reader-close-ai-btn');
        if (closeAiBtn) {
            closeAiBtn.addEventListener('click', () => {
                const container = document.getElementById('reader-ai-container');
                if (container) container.style.display = 'none';
            });
        }
    }

    // ==========================================
    // Clipboard & Desktop Context Menu Handling
    // ==========================================
    function setupClipboardAndContextMenu() {
        // 1. Dedicated Paste Buttons
        const pasteMappings = [
            { btnId: 'quick-feed-paste-btn', inputId: 'quick-feed-url-input' },
            { btnId: 'quick-feed-name-paste-btn', inputId: 'quick-feed-name-input' },
            { btnId: 'quick-summarize-paste-btn', inputId: 'quick-summarize-url-input' },
            { btnId: 'settings-gemini-key-paste-btn', inputId: 'settings-gemini-key' },
            { btnId: 'new-rule-paste-btn', inputId: 'new-rule-value' },
            { btnId: 'new-feed-paste-btn', inputId: 'new-feed-url' },
            { btnId: 'email-account-name-paste-btn', inputId: 'email-account-name' },
            { btnId: 'email-imap-server-paste-btn', inputId: 'email-imap-server' },
            { btnId: 'email-username-paste-btn', inputId: 'email-username' },
            { btnId: 'email-password-paste-btn', inputId: 'email-password' }
        ];

        pasteMappings.forEach(({ btnId, inputId }) => {
            const btn = document.getElementById(btnId);
            const input = document.getElementById(inputId);
            if (btn && input) {
                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    try {
                        const text = await navigator.clipboard.readText();
                        if (text) {
                            input.value = text.trim();
                            input.focus();
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                            showInAppToast('Clipboard', 'Pasted from clipboard');
                        }
                    } catch (err) {
                        console.warn('Clipboard read error:', err);
                        const manual = prompt('Paste content here:');
                        if (manual !== null) {
                            input.value = manual.trim();
                            input.focus();
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                });
            }
        });

        // 2. Desktop Context Menu for Input / Textarea
        const menu = document.getElementById('desktop-context-menu');
        let activeTarget = null;

        document.addEventListener('contextmenu', (e) => {
            const target = e.target;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
                e.preventDefault();
                activeTarget = target;
                if (!menu) return;

                menu.style.display = 'block';
                const menuWidth = menu.offsetWidth || 150;
                const menuHeight = menu.offsetHeight || 140;
                let left = e.clientX;
                let top = e.clientY;

                if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 10;
                if (top + menuHeight > window.innerHeight) top = window.innerHeight - menuHeight - 10;

                menu.style.left = left + 'px';
                menu.style.top = top + 'px';
            } else {
                if (menu) menu.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (menu && !menu.contains(e.target)) {
                menu.style.display = 'none';
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && menu && menu.style.display !== 'none') {
                menu.style.display = 'none';
            }
        });

        // Context Menu Actions
        const ctxPaste = document.getElementById('ctx-paste');
        if (ctxPaste) {
            ctxPaste.addEventListener('click', async () => {
                if (!activeTarget) return;
                menu.style.display = 'none';
                try {
                    const text = await navigator.clipboard.readText();
                    if (text !== undefined) {
                        const start = activeTarget.selectionStart ?? activeTarget.value.length;
                        const end = activeTarget.selectionEnd ?? activeTarget.value.length;
                        const val = activeTarget.value;
                        activeTarget.value = val.substring(0, start) + text + val.substring(end);
                        activeTarget.selectionStart = activeTarget.selectionEnd = start + text.length;
                        activeTarget.focus();
                        activeTarget.dispatchEvent(new Event('input', { bubbles: true }));
                        activeTarget.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                } catch (err) {
                    console.warn('Context menu paste failed:', err);
                    const manual = prompt('Paste content here:');
                    if (manual !== null) {
                        const start = activeTarget.selectionStart ?? activeTarget.value.length;
                        const end = activeTarget.selectionEnd ?? activeTarget.value.length;
                        const val = activeTarget.value;
                        activeTarget.value = val.substring(0, start) + manual + val.substring(end);
                        activeTarget.selectionStart = activeTarget.selectionEnd = start + manual.length;
                        activeTarget.focus();
                        activeTarget.dispatchEvent(new Event('input', { bubbles: true }));
                        activeTarget.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            });
        }

        const ctxCopy = document.getElementById('ctx-copy');
        if (ctxCopy) {
            ctxCopy.addEventListener('click', async () => {
                if (!activeTarget) return;
                menu.style.display = 'none';
                const start = activeTarget.selectionStart;
                const end = activeTarget.selectionEnd;
                const text = (start !== undefined && end !== undefined && start !== end)
                    ? activeTarget.value.substring(start, end)
                    : activeTarget.value;
                if (text) {
                    try {
                        await navigator.clipboard.writeText(text);
                    } catch (_) {}
                }
            });
        }

        const ctxCut = document.getElementById('ctx-cut');
        if (ctxCut) {
            ctxCut.addEventListener('click', async () => {
                if (!activeTarget) return;
                menu.style.display = 'none';
                const start = activeTarget.selectionStart;
                const end = activeTarget.selectionEnd;
                if (start !== undefined && end !== undefined && start !== end) {
                    const text = activeTarget.value.substring(start, end);
                    await navigator.clipboard.writeText(text);
                    activeTarget.value = activeTarget.value.substring(0, start) + activeTarget.value.substring(end);
                    activeTarget.selectionStart = activeTarget.selectionEnd = start;
                    activeTarget.focus();
                    activeTarget.dispatchEvent(new Event('input', { bubbles: true }));
                    activeTarget.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }

        const ctxSelectAll = document.getElementById('ctx-select-all');
        if (ctxSelectAll) {
            ctxSelectAll.addEventListener('click', () => {
                if (!activeTarget) return;
                menu.style.display = 'none';
                activeTarget.focus();
                activeTarget.select();
            });
        }
    }

    // ==========================================
    // Mobile Responsive Off-Canvas Drawer Handling
    // ==========================================
    function setupMobileResponsiveDrawer() {
        const sidebar = document.getElementById('app-sidebar') || document.querySelector('.sidebar');
        const drawerOverlay = document.getElementById('drawer-overlay');
        const menuBtn = document.getElementById('mobile-menu-btn');
        const closeBtn = document.getElementById('sidebar-close-btn');
        const mobileRefresh = document.getElementById('mobile-refresh-btn');
        const mobileTheme = document.getElementById('mobile-theme-btn');
        const mobileSettings = document.getElementById('mobile-settings-btn');
        const mobileTitle = document.getElementById('mobile-page-title');
        const pageTitle = document.getElementById('page-title');

        if (!sidebar) return;

        function openDrawer() {
            sidebar.classList.add('drawer-open');
            if (drawerOverlay) drawerOverlay.classList.add('active');
        }

        function closeDrawer() {
            sidebar.classList.remove('drawer-open');
            if (drawerOverlay) drawerOverlay.classList.remove('active');
        }

        if (menuBtn) {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (sidebar.classList.contains('drawer-open')) {
                    closeDrawer();
                } else {
                    openDrawer();
                }
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeDrawer();
            });
        }

        if (drawerOverlay) {
            drawerOverlay.addEventListener('click', closeDrawer);
        }

        // Auto-close drawer on mobile when clicking any navigation link or feed item
        sidebar.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                const target = e.target;
                if (target.closest('a') || target.closest('.sidebar-action-btn') || target.closest('.feed-item') || target.closest('.tree-item')) {
                    setTimeout(closeDrawer, 120);
                }
            }
        });

        // Delegate mobile header buttons to existing handlers
        if (mobileRefresh) {
            mobileRefresh.addEventListener('click', () => {
                const desktopRefresh = document.getElementById('sidebar-refresh-btn');
                if (desktopRefresh) desktopRefresh.click();
            });
        }

        if (mobileTheme) {
            mobileTheme.addEventListener('click', () => {
                const desktopTheme = document.getElementById('theme-toggle-btn');
                if (desktopTheme) desktopTheme.click();
                setTimeout(() => {
                    if (desktopTheme) mobileTheme.textContent = desktopTheme.textContent;
                }, 50);
            });
        }

        if (mobileSettings) {
            mobileSettings.addEventListener('click', () => {
                const desktopSettings = document.getElementById('sidebar-settings-btn');
                if (desktopSettings) desktopSettings.click();
            });
        }

        // Sync mobile header title with main page title
        if (pageTitle && mobileTitle) {
            const syncTitle = () => {
                const txt = pageTitle.textContent.trim();
                if (txt) mobileTitle.textContent = txt;
            };
            syncTitle();
            const observer = new MutationObserver(syncTitle);
            observer.observe(pageTitle, { childList: true, characterData: true, subtree: true });
        }
    }

    // ==========================================
    // 10. DOM Initialization & Event Wiring
    // ==========================================
    document.addEventListener('DOMContentLoaded', () => {
        applyDesktopZoom(currentZoom);
        
        // Initialize Theme from sync
        const isDark = getSyncItem('darkMode', true);
        applyDesktopTheme(isDark);

        // Synchronize any configured email accounts to the feed tree
        syncEmailAccountsToFeedTree();

        // Clean up any duplicate feeds from feedTree on startup
        (async () => {
            try {
                const { feedTree = [], feedTreeUpdatedAt = 0, feedTreeLastEditedLocally = 0 } = await chrome.storage.local.get(['feedTree', 'feedTreeUpdatedAt', 'feedTreeLastEditedLocally']);
                const seenUrls = new Set();
                const seenEmailKeys = new Set();
                let hadDupes = false;
                function dedupeTree(nodes) {
                    return nodes.filter(node => {
                        if (node.type === 'feed') {
                            const isEmailNode = node.isEmail || (node.id && String(node.id).startsWith('email_')) || (node.url && node.url.startsWith('imap:'));
                            if (isEmailNode) {
                                const emailKey = String(node.emailAccountId || node.id || node.url);
                                if (seenEmailKeys.has(emailKey)) {
                                    hadDupes = true;
                                    return false;
                                }
                                seenEmailKeys.add(emailKey);
                                return true;
                            }
                            if (node.url) {
                                const u = node.url.trim().toLowerCase().replace(/\/+$/, '');
                                if (seenUrls.has(u)) {
                                    hadDupes = true;
                                    return false;
                                }
                                seenUrls.add(u);
                                return true;
                            }
                        }
                        if (node.type === 'folder' && Array.isArray(node.children)) {
                            node.children = dedupeTree(node.children);
                        }
                        return true;
                    });
                }
                const cleaned = dedupeTree(feedTree);
                if (hadDupes) {
                    console.log('[PureTidings Desktop] Deduplicated feedTree on startup.');
                    await chrome.storage.local.set({ 
                        feedTree: cleaned, 
                        feedTreeUpdatedAt, 
                        feedTreeLastEditedLocally 
                    });
                }
            } catch (e) {
                console.warn('[PureTidings Desktop] Startup deduplication error:', e);
            }
        })();

        // Auto-recover any email inboxes that have unread counts but missing articles due to previous storage quota errors
        setTimeout(async () => {
            try {
                const { allPosts = {}, unreadCounts = {} } = await chrome.storage.local.get(['allPosts', 'unreadCounts']);
                const { emailAccounts = [] } = await chrome.storage.sync.get('emailAccounts');
                const activeEmailAccounts = emailAccounts.filter(a => a && a.enabled !== false);
                for (const account of activeEmailAccounts) {
                    const feedId = 'email_' + account.id;
                    const posts = allPosts[feedId];
                    const count = unreadCounts[feedId] || 0;
                    if (count > 0 && (!posts || posts.length === 0)) {
                        console.log(`[PureTidings Desktop] Auto-recovering missing articles for email account: ${account.name || account.username} (${feedId})`);
                        refreshSingleFeedNative(feedId);
                    }
                }
            } catch (recoveryErr) {
                console.warn('[PureTidings Desktop] Auto-recovery check error:', recoveryErr);
            }
        }, 1500);

        // Sidebar actions
        const themeBtn = document.getElementById('theme-toggle-btn');
        if (themeBtn) {
            themeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const isCurrentlyDark = document.documentElement.classList.contains('dark-mode') || document.body.classList.contains('dark-mode');
                applyDesktopTheme(!isCurrentlyDark);
            });
        }

        const settingsBtn = document.getElementById('sidebar-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openSettingsModal();
            });
        }

        const refreshBtn = document.getElementById('sidebar-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                refreshAllFeedsNative();
            });
        }

        // F5 Keyboard Shortcut for Feed Refresh
        window.addEventListener('keydown', (e) => {
            if (e.key === 'F5') {
                e.preventDefault();
                console.log("[PureTidings Desktop] F5 pressed -> Refreshing all feeds...");
                refreshAllFeedsNative();
            }
        });

        // Global external link click delegation - opens ONLY true external web links in system default browser
        document.addEventListener('click', (e) => {
            const anchor = e.target.closest('a');
            if (!anchor) return;

            const rawHref = anchor.getAttribute('href') || '';
            // Ignore in-page hash links (e.g. href="#"), javascript:, or empty href
            if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) return;

            const href = anchor.href;
            if (!href) return;

            // Never intercept download anchors or blob/data URLs
            if (anchor.hasAttribute('download') || anchor.dataset.downloadAnchor || href.startsWith('blob:') || href.startsWith('data:')) return;

            // Ignore internal Tauri/localhost origins
            try {
                const u = new URL(href);
                if (u.hostname === 'tauri.localhost' || u.hostname === 'localhost' || u.protocol === 'tauri:' || u.protocol === 'asset:') {
                    return;
                }
            } catch (_) {
                return;
            }

            // Only handle real external web links (http / https)
            if (!href.startsWith('http://') && !href.startsWith('https://')) return;

            // Allow post-title in feedpage.js and reader-original-link to handle their own behaviors
            if (anchor.classList.contains('post-title') || anchor.id === 'reader-original-link') return;

            e.preventDefault();
            tauriOpenBrowser(href);
        });

        const aiStudioLink = document.getElementById('link-google-ai-studio');
        if (aiStudioLink) {
            aiStudioLink.addEventListener('click', (e) => {
                e.preventDefault();
                tauriOpenBrowser('https://aistudio.google.com/app/apikey');
            });
        }

        // Quick Add Feed button & modal
        const quickAddBtn = document.getElementById('btn-quick-add-feed');
        const quickAddModal = document.getElementById('quick-add-modal');
        const quickAddClose = document.getElementById('quick-add-modal-close');
        const quickAddSubmit = document.getElementById('quick-feed-submit-btn');
        const quickAddInput = document.getElementById('quick-feed-url-input');
        const quickAddNameInput = document.getElementById('quick-feed-name-input');
        const quickAddStatus = document.getElementById('quick-feed-status');

        if (quickAddBtn && quickAddModal) {
            quickAddBtn.addEventListener('click', (e) => {
                e.preventDefault();
                closeAllModals();
                quickAddModal.style.display = 'flex';
                renderSettingsFeeds();
                if (quickAddInput) { quickAddInput.value = ''; quickAddInput.focus(); }
                if (quickAddNameInput) { quickAddNameInput.value = ''; }
                if (quickAddStatus) quickAddStatus.textContent = '';
            });
        }

        if (quickAddClose) {
            quickAddClose.addEventListener('click', () => {
                if (quickAddModal) quickAddModal.style.display = 'none';
            });
        }

        if (quickAddInput) {
            quickAddInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (quickAddSubmit && !quickAddSubmit.disabled) quickAddSubmit.click();
                }
            });
        }

        if (quickAddNameInput) {
            quickAddNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (quickAddSubmit && !quickAddSubmit.disabled) quickAddSubmit.click();
                }
            });
        }

        if (quickAddSubmit) {
            quickAddSubmit.addEventListener('click', async () => {
                const val = quickAddInput?.value?.trim() || '';
                if (!val) return;
                const customName = quickAddNameInput?.value?.trim() || '';
                const folderId = document.getElementById('quick-feed-folder-select')?.value || '';
                const statusMsg = (window.i18n && typeof window.i18n.t === 'function')
                    ? window.i18n.t('subscribing_status')
                    : "Discovering feed and subscribing...";
                if (quickAddStatus) quickAddStatus.textContent = statusMsg;
                quickAddSubmit.disabled = true;
                try {
                    const res = await discoverAndSubscribeFeed(val, folderId, customName);
                    if (res) {
                        const successMsg = (window.i18n && typeof window.i18n.t === 'function')
                            ? window.i18n.t('subscribed_status', { name: res.name })
                            : `Subscribed to "${res.name}"!`;
                        if (quickAddStatus) quickAddStatus.textContent = successMsg;
                        setTimeout(() => {
                            if (quickAddModal) quickAddModal.style.display = 'none';
                            quickAddSubmit.disabled = false;
                        }, 1200);
                    } else {
                        const cancelMsg = (window.i18n && typeof window.i18n.t === 'function')
                            ? window.i18n.t('feed_subscription_cancelled')
                            : "Subscription cancelled.";
                        if (quickAddStatus) quickAddStatus.textContent = cancelMsg;
                        quickAddSubmit.disabled = false;
                    }
                } catch (err) {
                    if (quickAddStatus) quickAddStatus.textContent = "Error: " + err.message;
                    quickAddSubmit.disabled = false;
                }
            });
        }

        // Quick AI Summarize button & modal
        const quickSumBtn = document.getElementById('btn-quick-summarize');
        const quickSumModal = document.getElementById('quick-summarize-modal');
        const quickSumClose = document.getElementById('quick-summarize-modal-close');
        const quickSumSubmit = document.getElementById('quick-summarize-submit-btn');
        const quickSumInput = document.getElementById('quick-summarize-url-input');

        if (quickSumBtn && quickSumModal) {
            quickSumBtn.addEventListener('click', (e) => {
                e.preventDefault();
                closeAllModals();
                quickSumModal.style.display = 'flex';
                if (quickSumInput) { quickSumInput.value = ''; quickSumInput.focus(); }
            });
        }

        if (quickSumClose) {
            quickSumClose.addEventListener('click', () => {
                if (quickSumModal) quickSumModal.style.display = 'none';
            });
        }

        if (quickSumSubmit) {
            quickSumSubmit.addEventListener('click', async () => {
                const val = quickSumInput?.value?.trim() || '';
                if (!val) return;
                quickSumModal.style.display = 'none';
                summarizeAnyUrl(val);
            });
        }

        // Close modal buttons
        const settingsCloseBtn = document.getElementById('settings-modal-close');
        if (settingsCloseBtn) settingsCloseBtn.addEventListener('click', closeSettingsModal);

        const readerCloseBtn = document.getElementById('reader-modal-close');
        if (readerCloseBtn) readerCloseBtn.addEventListener('click', closeReaderModal);

        // Initialize Reader Toolbar, Context Menu & Mobile Responsive Drawer
        setupReaderToolbar();
        setupClipboardAndContextMenu();
        setupMobileResponsiveDrawer();

        // Settings Tabs
        document.querySelectorAll('.settings-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.add('hidden'));
                e.target.classList.add('active');
                const targetId = e.target.dataset.tab;
                const pane = document.getElementById(targetId);
                if (pane) pane.classList.remove('hidden');
            });
        });

        // Language Selector
        const langSelect = document.getElementById('settings-language-select');
        if (langSelect) {
            if (window.i18n) {
                langSelect.value = window.i18n.currentLanguage;
            }
            langSelect.addEventListener('change', async (e) => {
                const newLang = e.target.value;
                if (window.i18n) {
                    await window.i18n.setLanguage(newLang);
                }
                const aiInput = document.getElementById('settings-ai-prompt');
                if (aiInput && isDefaultPrompt(aiInput.value, 'article')) {
                    aiInput.value = getDefaultAiPrompt('article', newLang);
                }
                const ytInput = document.getElementById('settings-yt-prompt');
                if (ytInput && isDefaultPrompt(ytInput.value, 'youtube')) {
                    ytInput.value = getDefaultAiPrompt('youtube', newLang);
                }
            });
        }

        // Settings Save
        const saveSettingsBtn = document.getElementById('settings-save-btn');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', async () => {
                try {
                    const key = document.getElementById('settings-gemini-key')?.value || '';
                    const aiPrompt = document.getElementById('settings-ai-prompt')?.value || '';
                    const ytPrompt = document.getElementById('settings-yt-prompt')?.value || '';

                    const checkInterval = parseInt(document.getElementById('settings-check-interval')?.value, 10) || 0;
                    const randomizeFetch = document.getElementById('settings-randomize-fetch')?.checked || false;
                    const showNotification = document.getElementById('settings-show-notifications')?.checked ?? true;
                    const showSummaryNotification = document.getElementById('settings-show-summary-notifications')?.checked || false;
                    const summaryInterval = parseInt(document.getElementById('settings-summary-interval')?.value, 10) || 60;
                    const autoBackupEnabled = document.getElementById('settings-auto-backup-enabled')?.checked || false;
                    const autoBackupTime = document.getElementById('settings-auto-backup-time')?.value || '20:00';
                    const backupFolderPath = sanitizeFolderPath(document.getElementById('settings-backup-folder-path')?.value || '');
                    const fetchSchedule = collectScheduleFromTable();
                    const appLanguage = document.getElementById('settings-language-select')?.value || window.i18n?.currentLanguage || 'en';
                    const keepScreenAwake = document.getElementById('settings-keep-screen-awake-checkbox')?.checked || false;
                    const isAndroid = document.documentElement.classList.contains('is-android') || /Android/i.test(navigator.userAgent);
                    const autostart = (!isAndroid && document.getElementById('settings-autostart-checkbox')?.checked) || false;

                    const syncWebdavEnabled = document.getElementById('setting-sync-webdav-enabled')?.checked || false;
                    const syncWebdavUrl = (document.getElementById('setting-sync-webdav-url')?.value || '').trim();
                    const syncWebdavUser = (document.getElementById('setting-sync-webdav-user')?.value || '').trim();
                    const syncWebdavPass = document.getElementById('setting-sync-webdav-pass')?.value || '';
                    const syncWebdavPath = (document.getElementById('setting-sync-webdav-path')?.value || '/puretidings_sync.json').trim();
                    const syncWebdavAuto = document.getElementById('setting-sync-webdav-auto')?.checked ?? true;

                    await chrome.storage.sync.set({
                        geminiApiKey: key.trim(),
                        aiReportPrompt: aiPrompt.trim(),
                        youtubeAiPrompt: ytPrompt.trim(),
                        checkInterval,
                        randomizeFetch,
                        showNotification,
                        showSummaryNotification,
                        summaryInterval,
                        fetchSchedule,
                        autoBackupEnabled,
                        autoBackupTime,
                        backupFolderPath,
                        appLanguage,
                        keepScreenAwake,
                        autostart,
                        syncWebdavEnabled,
                        syncWebdavUrl,
                        syncWebdavUser,
                        syncWebdavPass,
                        syncWebdavPath,
                        syncWebdavAuto
                    });

                    // Apply Wake Lock state immediately
                    await applyWakeLock(keepScreenAwake);

                    // Apply Autostart state immediately (desktop platforms only)
                    if (!isAndroid) {
                        try {
                            await tauriInvoke('set_autostart', { enable: autostart });
                        } catch (autoErr) {
                            console.warn("[PureTidings Desktop] set_autostart failed:", autoErr);
                        }
                    }

                    if (window.i18n && window.i18n.currentLanguage !== appLanguage) {
                        await window.i18n.setLanguage(appLanguage);
                    }

                    updateBackupTabFolderDisplay(backupFolderPath);

                    // Re-arm background schedulers immediately with new config
                    scheduleNextBackgroundFetch();
                    scheduleNextSummaryNotification(true);
                    scheduleNextAutoBackup();

                    if (syncWebdavEnabled && syncWebdavUrl && syncWebdavUser) {
                        executeWebdavSync({ manual: false });
                    }

                    closeSettingsModal();
                    showInAppToast(window.i18n ? window.i18n.t('toast_saved') : "Settings Saved", "Your automation schedules and preferences have been updated successfully!");
                } catch (err) {
                    console.error("[PureTidings Desktop] Error saving settings:", err);
                    showInAppToast("Settings Error", `Failed to save settings: ${err.message || err}`);
                }
            });
        }

        // Email Account Settings Event Listeners
        const emailPresetSelect = document.getElementById('email-preset-select');
        if (emailPresetSelect) {
            emailPresetSelect.addEventListener('change', (e) => {
                const preset = IMAP_PRESETS[e.target.value];
                if (preset) {
                    if (preset.server) {
                        document.getElementById('email-imap-server').value = preset.server;
                    }
                    if (preset.port) {
                        document.getElementById('email-imap-port').value = preset.port;
                    }
                }
            });
        }

        const emailLoadFoldersBtn = document.getElementById('email-load-folders-btn');
        if (emailLoadFoldersBtn) {
            emailLoadFoldersBtn.addEventListener('click', async () => {
                const server = document.getElementById('email-imap-server')?.value?.trim();
                const port = parseInt(document.getElementById('email-imap-port')?.value, 10) || 993;
                const username = document.getElementById('email-username')?.value?.trim();
                const password = document.getElementById('email-password')?.value;
                const statusEl = document.getElementById('email-form-status');

                if (!server || !username || !password) {
                    if (statusEl) {
                        statusEl.style.color = '#d93025';
                        statusEl.textContent = 'Please provide server, username, and password.';
                    }
                    return;
                }

                emailLoadFoldersBtn.disabled = true;
                const origText = emailLoadFoldersBtn.textContent;
                emailLoadFoldersBtn.textContent = 'Connecting...';
                if (statusEl) {
                    statusEl.style.color = 'var(--link-color)';
                    statusEl.textContent = window.i18n ? window.i18n.t('email_testing_connection') : 'Testing connection to server...';
                }

                try {
                    const folders = await tauriInvoke('list_imap_folders', { server, port, username, password });
                    console.log('[PureTidings Desktop] IMAP folders loaded:', folders);

                    const folderSelect = document.getElementById('email-folder-select');
                    if (folderSelect && folders && folders.length > 0) {
                        const curVal = folderSelect.value;
                        folderSelect.innerHTML = '';
                        folders.forEach(f => {
                            const opt = document.createElement('option');
                            opt.value = f;
                            opt.textContent = f;
                            if (f === curVal || (curVal === 'INBOX' && f.toUpperCase() === 'INBOX')) {
                                opt.selected = true;
                            }
                            folderSelect.appendChild(opt);
                        });
                    }

                    if (statusEl) {
                        statusEl.style.color = '#28a745';
                        const tpl = window.i18n ? window.i18n.t('email_test_success') : '✓ Connected successfully! Found {count} folder(s).';
                        statusEl.textContent = tpl.replace('{count}', folders ? folders.length : 1);
                    }
                } catch (err) {
                    console.error('[PureTidings Desktop] IMAP test error:', err);
                    if (statusEl) {
                        statusEl.style.color = '#d93025';
                        const tpl = window.i18n ? window.i18n.t('email_test_failed') : '✗ Connection failed: {error}';
                        statusEl.textContent = tpl.replace('{error}', err.message || err);
                    }
                } finally {
                    emailLoadFoldersBtn.disabled = false;
                    emailLoadFoldersBtn.textContent = origText;
                }
            });
        }

        const emailSaveBtn = document.getElementById('email-save-account-btn');
        if (emailSaveBtn) {
            emailSaveBtn.addEventListener('click', async () => {
                const editId = document.getElementById('email-account-id')?.value?.trim();
                const preset = document.getElementById('email-preset-select')?.value || 'custom';
                const name = document.getElementById('email-account-name')?.value?.trim();
                const server = document.getElementById('email-imap-server')?.value?.trim();
                const port = parseInt(document.getElementById('email-imap-port')?.value, 10) || 993;
                const username = document.getElementById('email-username')?.value?.trim();
                const password = document.getElementById('email-password')?.value;
                const folder = document.getElementById('email-folder-select')?.value?.trim() || 'INBOX';
                const limit = parseInt(document.getElementById('email-fetch-limit')?.value, 10) || 30;
                const statusEl = document.getElementById('email-form-status');

                if (!server || !username || !password) {
                    if (statusEl) {
                        statusEl.style.color = '#d93025';
                        statusEl.textContent = 'Server, email/username, and password are required.';
                    }
                    return;
                }

                emailSaveBtn.disabled = true;
                if (statusEl) {
                    statusEl.style.color = 'var(--link-color)';
                    statusEl.textContent = 'Saving email account...';
                }

                try {
                    const rawAccounts = await chrome.storage.sync.get('emailAccounts');
                    const emailAccounts = Array.isArray(rawAccounts?.emailAccounts) ? rawAccounts.emailAccounts : [];
                    const accountName = name || username;

                    let savedAccount;
                    if (editId) {
                        const idx = emailAccounts.findIndex(a => a && a.id === editId);
                        if (idx !== -1) {
                            emailAccounts[idx] = {
                                ...emailAccounts[idx],
                                preset,
                                name: accountName,
                                server,
                                port,
                                username,
                                password,
                                folder,
                                limit,
                                enabled: emailAccounts[idx].enabled !== false
                            };
                            savedAccount = emailAccounts[idx];
                        }
                    } else {
                        savedAccount = {
                            id: 'acc_' + Date.now(),
                            preset,
                            name: accountName,
                            server,
                            port,
                            username,
                            password,
                            folder,
                            limit,
                            enabled: true
                        };
                        emailAccounts.push(savedAccount);
                    }

                    await chrome.storage.sync.set({ emailAccounts });
                    await syncEmailAccountsToFeedTree();
                    renderSettingsEmailAccounts();
                    resetEmailAccountForm();

                    if (statusEl) {
                        statusEl.style.color = '#28a745';
                        const tpl = window.i18n ? window.i18n.t('email_account_saved') : '✓ Account "{name}" saved!';
                        statusEl.textContent = tpl.replace('{name}', accountName);
                    }

                    // Trigger immediate fetch in background for new/updated account
                    if (savedAccount) {
                        refreshSingleFeedNative('email_' + savedAccount.id);
                    }
                } catch (err) {
                    console.error('[PureTidings Desktop] Error saving email account:', err);
                    if (statusEl) {
                        statusEl.style.color = '#d93025';
                        statusEl.textContent = 'Error: ' + (err.message || err);
                    }
                } finally {
                    emailSaveBtn.disabled = false;
                }
            });
        }

        const emailCancelEditBtn = document.getElementById('email-cancel-edit-btn');
        if (emailCancelEditBtn) {
            emailCancelEditBtn.addEventListener('click', resetEmailAccountForm);
        }

        // Add Rule
        const addRuleBtn = document.getElementById('new-rule-add-btn');
        if (addRuleBtn) {
            addRuleBtn.addEventListener('click', async () => {
                const field = document.getElementById('new-rule-field')?.value || 'title';
                const condition = document.getElementById('new-rule-condition')?.value || 'contains';
                const val = document.getElementById('new-rule-value')?.value || '';
                const action = document.getElementById('new-rule-action')?.value || 'notify';

                if (!val.trim()) return;
                const { rules = [] } = await chrome.storage.sync.get('rules');
                rules.push({ id: 'rule-' + Date.now(), field, condition, value: val.trim(), action });
                await chrome.storage.sync.set({ rules });
                document.getElementById('new-rule-value').value = '';
                renderSettingsRules(rules);
            });
        }

        // Bulk Actions
        const markAllReadBtn = document.getElementById('mark-all-read-button');
        const markAllUnreadBtn = document.getElementById('mark-all-unread-button');
        const markAllStatus = document.getElementById('mark-all-read-status');

        if (markAllReadBtn) {
            markAllReadBtn.addEventListener('click', async () => {
                if (markAllStatus) {
                    markAllStatus.textContent = "Marking all articles as read...";
                    markAllStatus.style.color = "var(--primary-color, #8ab4f8)";
                }
                try {
                    await markAllAsReadNative();
                    if (markAllStatus) {
                        markAllStatus.textContent = "All articles marked as read!";
                        markAllStatus.style.color = "#28a745";
                        setTimeout(() => { if (markAllStatus) markAllStatus.textContent = ''; }, 3500);
                    }
                    showInAppToast('Bulk Action', 'All articles marked as read.');
                } catch (err) {
                    if (markAllStatus) {
                        markAllStatus.textContent = "Error: " + (err.message || err);
                        markAllStatus.style.color = "#dc3545";
                    }
                }
            });
        }

        if (markAllUnreadBtn) {
            markAllUnreadBtn.addEventListener('click', async () => {
                if (markAllStatus) {
                    markAllStatus.textContent = "Marking all articles as unread...";
                    markAllStatus.style.color = "var(--primary-color, #8ab4f8)";
                }
                try {
                    await markAllAsUnreadNative();
                    if (markAllStatus) {
                        markAllStatus.textContent = "All articles marked as unread!";
                        markAllStatus.style.color = "#28a745";
                        setTimeout(() => { if (markAllStatus) markAllStatus.textContent = ''; }, 3500);
                    }
                    showInAppToast('Bulk Action', 'All articles marked as unread.');
                } catch (err) {
                    if (markAllStatus) {
                        markAllStatus.textContent = "Error: " + (err.message || err);
                        markAllStatus.style.color = "#dc3545";
                    }
                }
            });
        }

        // Add Feed Form in Settings
        const addFeedBtn = document.getElementById('btn-add-feed');
        if (addFeedBtn) {
            addFeedBtn.addEventListener('click', async () => {
                const name = document.getElementById('new-feed-name')?.value || '';
                const url = document.getElementById('new-feed-url')?.value || '';
                const folderId = document.getElementById('new-feed-folder')?.value || '';

                if (!name.trim() || !url.trim()) {
                    const alertMsg = (window.i18n && typeof window.i18n.t === 'function')
                        ? window.i18n.t('alert_feed_name_and_url_required')
                        : "Please provide both feed name and URL.";
                    alert(alertMsg);
                    return;
                }

                const { feedTree = [] } = await chrome.storage.local.get('feedTree');

                const existingFeed = findFeedByUrlInTree(feedTree, url.trim());
                if (existingFeed) {
                    const promptMsg = (window.i18n && typeof window.i18n.t === 'function')
                        ? window.i18n.t('feed_already_exists_confirm', { name: existingFeed.name || existingFeed.url })
                        : `This feed URL is already subscribed as "${existingFeed.name || existingFeed.url}". Do you really want to add it a second time?`;
                    const confirmed = window.confirm(promptMsg);
                    if (!confirmed) {
                        return;
                    }
                }
                const newFeed = {
                    id: 'feed-' + Date.now(),
                    name: name.trim(),
                    url: url.trim(),
                    type: 'feed',
                    fetchOgImage: true
                };

                if (folderId) {
                    function addToFolder(nodes) {
                        for (const n of nodes) {
                            if (n.id === folderId && n.type === 'folder') {
                                if (!n.children) n.children = [];
                                n.children.push(newFeed);
                                return true;
                            }
                            if (n.children && addToFolder(n.children)) return true;
                        }
                        return false;
                    }
                    addToFolder(feedTree);
                } else {
                    feedTree.push(newFeed);
                }

                const { deletedFeedUrls = {} } = await chrome.storage.local.get('deletedFeedUrls');
                const normUrl = url.trim().toLowerCase().replace(/\/+$/, '');
                if (deletedFeedUrls[normUrl]) {
                    delete deletedFeedUrls[normUrl];
                }

                const now = Date.now();
                await chrome.storage.local.set({ feedTree, feedTreeUpdatedAt: now, feedTreeLastEditedLocally: now, deletedFeedUrls });
                document.getElementById('new-feed-name').value = '';
                document.getElementById('new-feed-url').value = '';
                renderSettingsFeeds();
                refreshSingleFeedNative(newFeed.id);
            });
        }

        // Add Folder Form
        const addFolderBtn = document.getElementById('btn-add-folder');
        if (addFolderBtn) {
            addFolderBtn.addEventListener('click', async () => {
                const name = document.getElementById('new-folder-name')?.value || '';
                if (!name.trim()) return;

                const { feedTree = [], deletedFolderIds = {} } = await chrome.storage.local.get(['feedTree', 'deletedFolderIds']);
                const newFolderId = 'folder-' + Date.now();
                if (deletedFolderIds[newFolderId]) {
                    delete deletedFolderIds[newFolderId];
                }
                feedTree.push({
                    id: newFolderId,
                    name: name.trim(),
                    type: 'folder',
                    children: []
                });
                const now = Date.now();
                await chrome.storage.local.set({ feedTree, feedTreeUpdatedAt: now, feedTreeLastEditedLocally: now, deletedFolderIds });
                document.getElementById('new-folder-name').value = '';
                renderSettingsFeeds();
            });
        }

        // ==========================================
        // 10. Automation Controls, Backup, Restore & OPML Engine
        // ==========================================
        // Test Notification Button
        const testNotifBtn = document.getElementById('settings-test-notification-btn');
        const testNotifStatus = document.getElementById('settings-test-notification-status');
        if (testNotifBtn) {
            testNotifBtn.addEventListener('click', async () => {
                if (testNotifStatus) {
                    testNotifStatus.textContent = "Sending test notification...";
                    testNotifStatus.style.color = "var(--primary-color, #8ab4f8)";
                }
                await showDesktopNotification("PureTidings - Test Notification", "Desktop notifications are configured and working properly!");
                showInAppToast("🔔 Notification Sent", "Desktop notification triggered successfully.");
                if (testNotifStatus) {
                    testNotifStatus.textContent = "Sent! Check your desktop / action center.";
                    testNotifStatus.style.color = "#28a745";
                    setTimeout(() => { if (testNotifStatus) testNotifStatus.textContent = ''; }, 4000);
                }
            });
        }

        // Test Unread Reminder Button
        const testUnreadReminderBtn = document.getElementById('settings-test-unread-reminder-btn');
        if (testUnreadReminderBtn) {
            testUnreadReminderBtn.addEventListener('click', async () => {
                showInAppToast("🔔 Checking Feeds", "Checking unread articles for reminder...");
                await runSummaryNotificationCycle(true);
            });
        }

        // Backup Target Folder Controls
        const backupFolderInput = document.getElementById('settings-backup-folder-path');
        if (backupFolderInput) {
            backupFolderInput.addEventListener('input', (e) => {
                const clean = sanitizeFolderPath(e.target.value);
                updateBackupTabFolderDisplay(clean);
            });
            backupFolderInput.addEventListener('change', async (e) => {
                const clean = sanitizeFolderPath(e.target.value);
                e.target.value = clean;
                updateBackupTabFolderDisplay(clean);
                await chrome.storage.sync.set({ backupFolderPath: clean });
            });
        }

        const backupBrowseBtn = document.getElementById('settings-backup-browse-btn');
        if (backupBrowseBtn && backupFolderInput) {
            backupBrowseBtn.addEventListener('click', async () => {
                try {
                    const currentVal = sanitizeFolderPath(backupFolderInput.value);
                    const selected = await tauriInvoke('pick_folder', {
                        defaultPath: currentVal || null,
                        default_path: currentVal || null
                    });
                    if (selected && typeof selected === 'string' && selected.trim()) {
                        const clean = sanitizeFolderPath(selected.trim());
                        backupFolderInput.value = clean;
                        updateBackupTabFolderDisplay(clean);
                        await chrome.storage.sync.set({ backupFolderPath: clean });
                        showInAppToast("Folder Selected", `Backup path set to: ${clean}`);
                    }
                } catch (err) {
                    console.error("[PureTidings Desktop] Error picking folder:", err);
                    showInAppToast("Folder Picker Error", err.message || String(err));
                }
            });
        }

        const backupOpenFolderBtn = document.getElementById('settings-backup-open-folder-btn');
        if (backupOpenFolderBtn && backupFolderInput) {
            backupOpenFolderBtn.addEventListener('click', async () => {
                const folder = backupFolderInput.value.trim();
                if (!folder) {
                    showInAppToast("Directory Empty", "Please select or enter a folder path first.");
                    return;
                }
                try {
                    await tauriOpenBrowser(folder);
                } catch (err) {
                    console.warn("[PureTidings Desktop] Failed to open folder:", err);
                    showInAppToast("Explorer Error", `Could not open folder: ${err.message || err}`);
                }
            });
        }

        const runBackupNowBtn = document.getElementById('settings-run-backup-now-btn');
        const runBackupStatus = document.getElementById('settings-backup-action-status');
        if (runBackupNowBtn) {
            runBackupNowBtn.addEventListener('click', async () => {
                if (runBackupStatus) {
                    runBackupStatus.textContent = "Creating OPML & JSON backups...";
                    runBackupStatus.style.color = "var(--primary-color, #8ab4f8)";
                }
                try {
                    const { backupFolderPath = '' } = await chrome.storage.sync.get('backupFolderPath');
                    const domPath = document.getElementById('settings-backup-folder-path')?.value || '';
                    const folderPath = sanitizeFolderPath(backupFolderPath || domPath);
                    if (folderPath && !backupFolderPath) {
                        await chrome.storage.sync.set({ backupFolderPath: folderPath });
                    }
                    const timestamp = getBackupTimestamp();

                    const { opml, feedCount: opmlCount } = await generateOpmlData();
                    const opmlFilename = `puretidings-feeds-${timestamp}.opml`;
                    const opmlRes = await saveBackupFile(opmlFilename, opml, 'text/xml', folderPath);

                    const { json, feedCount: jsonCount } = await generateBackupJsonData();
                    const jsonFilename = `puretidings-backup-${timestamp}.json`;
                    const jsonRes = await saveBackupFile(jsonFilename, json, 'application/json', folderPath);

                    const destMsg = (opmlRes.directWrite && opmlRes.path)
                        ? `Saved to: ${folderPath}`
                        : "Files downloaded";

                    if (runBackupStatus) {
                        runBackupStatus.textContent = `✓ Created successfully (${opmlCount} feeds)! ${destMsg}`;
                        runBackupStatus.style.color = "#28a745";
                        setTimeout(() => { if (runBackupStatus) runBackupStatus.textContent = ''; }, 6000);
                    }
                    showInAppToast("Backup Created", `OPML & JSON backups created (${opmlCount} feeds). ${destMsg}`);
                } catch (err) {
                    console.error("[PureTidings Desktop] Manual backup creation error:", err);
                    if (runBackupStatus) {
                        runBackupStatus.textContent = `✗ Error: ${err.message || err}`;
                        runBackupStatus.style.color = "#dc3545";
                    }
                }
            });
        }

        // Jump to Automation tab from Backup tab
        const gotoAutoBackupBtn = document.getElementById('btn-goto-automation-backup');
        if (gotoAutoBackupBtn) {
            gotoAutoBackupBtn.addEventListener('click', () => {
                const autoTabBtn = document.querySelector('.settings-tab-btn[data-tab="tab-automation"]');
                if (autoTabBtn) autoTabBtn.click();
                const folderInput = document.getElementById('settings-backup-folder-path');
                if (folderInput) {
                    folderInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    folderInput.focus();
                }
            });
        }

        // --- OPML Export ---
        const exportOpmlBtn = document.getElementById('btn-export-opml');
        if (exportOpmlBtn) {
            exportOpmlBtn.addEventListener('click', async () => {
                showStatusBadge('opml-status-box', 'loading', '⏳ Generating OPML file...', 0);
                try {
                    const { backupFolderPath = '' } = await chrome.storage.sync.get('backupFolderPath');
                    const domPath = document.getElementById('settings-backup-folder-path')?.value || '';
                    const folderPath = sanitizeFolderPath(backupFolderPath || domPath);
                    if (folderPath && !backupFolderPath) {
                        await chrome.storage.sync.set({ backupFolderPath: folderPath });
                    }
                    const { opml, feedCount } = await generateOpmlData();
                    const filename = `puretidings-feeds-${getBackupTimestamp()}.opml`;

                    const res = await saveBackupFile(filename, opml, 'text/xml', folderPath);
                    if (res.directWrite && res.path) {
                        showStatusBadge('opml-status-box', 'success', `✓ Exported ${feedCount} feed(s) directly to:\n${res.path}`);
                        showInAppToast('OPML Export', `Saved ${feedCount} feed(s) to ${res.path}`);
                    } else {
                        showStatusBadge('opml-status-box', 'success', `✓ Exported ${feedCount} feed(s) successfully!`);
                        showInAppToast('OPML Export', `Exported ${feedCount} feed(s) to OPML file.`);
                    }
                } catch (err) {
                    showStatusBadge('opml-status-box', 'error', `✗ Export failed: ${err.message || err}`);
                }
            });
        }

        // --- Dynamic File Picker Helpers (Uses native Windows/Linux/macOS file dialog with fallback to HTML file input) ---
        async function openOpmlFilePicker() {
            const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            if (!isMobile) {
                try {
                    const { backupFolderPath = '' } = await chrome.storage.sync.get('backupFolderPath');
                    const domPath = document.getElementById('settings-backup-folder-path')?.value || '';
                    const initialDir = sanitizeFolderPath(backupFolderPath || domPath);
                    const selectedPath = await tauriInvoke('pick_file', {
                        defaultPath: initialDir || null,
                        default_path: initialDir || null,
                        filterName: 'OPML & XML Feeds',
                        filter_name: 'OPML & XML Feeds',
                        filterExt: '*.opml;*.xml',
                        filter_ext: '*.opml;*.xml'
                    });
                    if (selectedPath && typeof selectedPath === 'string' && selectedPath.trim()) {
                        await processOpmlFile(selectedPath.trim());
                        return;
                    } else if (selectedPath === null || selectedPath === '') {
                        // User explicitly cancelled the native desktop file picker dialog
                        return;
                    }
                } catch (err) {
                    console.warn("[PureTidings Desktop] Native file picker failed, falling back to HTML input:", err);
                }
            }

            // Fallback to HTML input if native pick_file is unavailable or on mobile
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.opml,.xml,text/xml,application/xml';
            input.style.position = 'fixed';
            input.style.top = '-9999px';
            input.style.left = '-9999px';
            input.style.opacity = '0';
            input.onchange = (e) => {
                if (e.target.files && e.target.files[0]) {
                    processOpmlFile(e.target.files[0]);
                }
                input.remove();
            };
            document.body.appendChild(input);
            input.click();

            // On mobile devices, offer immediate direct text paste fallback in case WebView file chooser is suppressed
            if (isMobile) {
                setTimeout(() => {
                    const statusBox = document.getElementById('opml-status-box');
                    if (statusBox && statusBox.style.display === 'none') {
                        showStatusBadge('opml-status-box', 'loading', 'Tip: You can also tap "📋 Paste OPML" to import feeds directly from clipboard.', 5000);
                    }
                }, 1000);
            }
        }

        async function openJsonFilePicker() {
            const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            if (!isMobile) {
                try {
                    const { backupFolderPath = '' } = await chrome.storage.sync.get('backupFolderPath');
                    const domPath = document.getElementById('settings-backup-folder-path')?.value || '';
                    const initialDir = sanitizeFolderPath(backupFolderPath || domPath);
                    const selectedPath = await tauriInvoke('pick_file', {
                        defaultPath: initialDir || null,
                        default_path: initialDir || null,
                        filterName: 'JSON Backup Files',
                        filter_name: 'JSON Backup Files',
                        filterExt: '*.json',
                        filter_ext: '*.json'
                    });
                    if (selectedPath && typeof selectedPath === 'string' && selectedPath.trim()) {
                        await processJsonFile(selectedPath.trim());
                        return;
                    } else if (selectedPath === null || selectedPath === '') {
                        // User explicitly cancelled the native desktop file picker dialog
                        return;
                    }
                } catch (err) {
                    console.warn("[PureTidings Desktop] Native file picker failed, falling back to HTML input:", err);
                }
            }

            // Fallback to HTML input if native pick_file is unavailable or on mobile
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json,text/json';
            input.style.position = 'fixed';
            input.style.top = '-9999px';
            input.style.left = '-9999px';
            input.style.opacity = '0';
            input.onchange = (e) => {
                if (e.target.files && e.target.files[0]) {
                    processJsonFile(e.target.files[0]);
                }
                input.remove();
            };
            document.body.appendChild(input);
            input.click();

            // On mobile devices, offer immediate direct text paste fallback in case WebView file chooser is suppressed
            if (isMobile) {
                setTimeout(() => {
                    const statusBox = document.getElementById('backup-json-status-box');
                    if (statusBox && statusBox.style.display === 'none') {
                        showStatusBadge('backup-json-status-box', 'loading', 'Tip: You can also tap "📋 Paste Backup" to restore directly from clipboard.', 5000);
                    }
                }, 1000);
            }
        }

        // --- Text / Clipboard Direct Restore Modal ---
        function openTextRestoreModal(type = 'json') {
            const modal = document.getElementById('text-restore-modal');
            const titleEl = document.getElementById('text-restore-modal-title');
            const descEl = document.getElementById('text-restore-modal-desc');
            const inputEl = document.getElementById('text-restore-input');
            const statusEl = document.getElementById('text-restore-status');
            if (!modal) return;

            modal.dataset.restoreType = type;
            if (statusEl) {
                statusEl.textContent = '';
                statusEl.style.color = '';
            }
            if (inputEl) {
                inputEl.value = '';
            }

            if (type === 'opml') {
                if (titleEl) titleEl.textContent = (typeof i18n !== 'undefined' ? i18n.t('btn_paste_opml') : '📋 Paste OPML');
                if (descEl) descEl.textContent = 'Paste your OPML or XML feed outline content below:';
                if (inputEl) inputEl.placeholder = '<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>Feeds</title></head>\n  <body>\n    <outline xmlUrl="https://example.com/feed.xml" text="Example" />\n  </body>\n</opml>';
            } else {
                if (titleEl) titleEl.textContent = (typeof i18n !== 'undefined' ? i18n.t('btn_paste_json') : '📋 Paste Backup (JSON)');
                if (descEl) descEl.textContent = (typeof i18n !== 'undefined' ? i18n.t('text_restore_desc') : 'Paste your JSON backup data below:');
                if (inputEl) inputEl.placeholder = '{\n  "local": { "feedTree": [...] },\n  "sync": { "emailAccounts": [...] }\n}';
            }

            // Attempt to pre-fill from clipboard if available
            if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard.readText().then(clipText => {
                    if (clipText && clipText.trim()) {
                        const trimmed = clipText.trim();
                        if (type === 'json' && (trimmed.startsWith('{') || trimmed.includes('"feedTree"'))) {
                            if (inputEl) inputEl.value = trimmed;
                            if (statusEl) {
                                statusEl.textContent = '✓ Detected JSON backup in clipboard!';
                                statusEl.style.color = '#28a745';
                            }
                        } else if (type === 'opml' && (trimmed.includes('<opml') || trimmed.includes('<outline'))) {
                            if (inputEl) inputEl.value = trimmed;
                            if (statusEl) {
                                statusEl.textContent = '✓ Detected OPML data in clipboard!';
                                statusEl.style.color = '#28a745';
                            }
                        }
                    }
                }).catch(() => {});
            }

            modal.style.display = 'flex';
        }

        function closeTextRestoreModal() {
            const modal = document.getElementById('text-restore-modal');
            if (modal) modal.style.display = 'none';
        }

        // --- Content Parsers & Handlers ---
        async function importOpmlContent(text, fileName = 'Imported OPML') {
            showStatusBadge('opml-status-box', 'loading', `⏳ Reading and importing "${fileName}"...`, 0);
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, "text/xml");
                const outlines = doc.querySelectorAll('outline[xmlUrl]');
                if (!outlines || outlines.length === 0) {
                    showStatusBadge('opml-status-box', 'error', `✗ No RSS feeds found in "${fileName}".`);
                    return;
                }

                const { feedTree = [] } = await chrome.storage.local.get('feedTree');
                let addedCount = 0;
                outlines.forEach(o => {
                    const url = o.getAttribute('xmlUrl');
                    const name = o.getAttribute('title') || o.getAttribute('text') || url;
                    if (url) {
                        feedTree.push({
                            id: 'feed-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
                            name: name.trim(),
                            url: url.trim(),
                            type: 'feed',
                            fetchOgImage: true
                        });
                        addedCount++;
                    }
                });

                const now = Date.now();
                await chrome.storage.local.set({ feedTree, feedTreeUpdatedAt: now, feedTreeLastEditedLocally: now });
                showStatusBadge('opml-status-box', 'success', `✓ Successfully imported ${addedCount} feed(s) from "${fileName}"!`);
                showInAppToast('OPML Import', `Imported ${addedCount} feed(s) successfully!`);
                renderSettingsFeeds();
                refreshAllFeedsNative();
            } catch (err) {
                showStatusBadge('opml-status-box', 'error', `✗ Failed to import OPML: ${err.message || err}`);
            }
        }

        async function restoreJsonContent(text, fileName = 'Backup JSON') {
            showStatusBadge('backup-json-status-box', 'loading', `⏳ Reading and restoring "${fileName}"...`, 0);
            try {
                const data = JSON.parse(text);
                if (!data.local && !data.sync && !data.feeds && !data.feedTree) {
                    showStatusBadge('backup-json-status-box', 'error', `✗ Invalid backup file format.`);
                    return;
                }

                if (data.local) {
                    const now = Date.now();
                    if (data.local.feedTree && !data.local.feedTreeUpdatedAt) {
                        data.local.feedTreeUpdatedAt = now;
                    }
                    data.local.feedTreeLastEditedLocally = now;
                    await chrome.storage.local.set(data.local);
                }
                if (data.sync) await chrome.storage.sync.set(data.sync);

                // Chrome Extension backup format compatibility
                if (data.feedTree && !data.local) {
                    const now = Date.now();
                    await chrome.storage.local.set({ feedTree: data.feedTree, feedTreeUpdatedAt: now, feedTreeLastEditedLocally: now });
                }
                if (data.rules && !data.sync) {
                    await chrome.storage.sync.set({ rules: data.rules });
                }
                if (data.emailAccounts && (!data.sync || !data.sync.emailAccounts)) {
                    await chrome.storage.sync.set({ emailAccounts: data.emailAccounts });
                }

                const feedCount = (data.local?.feedTree || data.feedTree || []).length;
                showStatusBadge('backup-json-status-box', 'success', `✓ Backup restored successfully (${feedCount} items)!`);
                showInAppToast('Restore Complete', 'Backup restored successfully!');

                loadSettingsValues();
                renderSettingsFeeds();
                await syncEmailAccountsToFeedTree();
                renderSettingsEmailAccounts();
                refreshAllFeedsNative();
                scheduleNextBackgroundFetch();
                scheduleNextSummaryNotification();
                scheduleNextAutoBackup();
            } catch (err) {
                showStatusBadge('backup-json-status-box', 'error', `✗ Failed to restore backup: ${err.message || err}`);
            }
        }

        async function processOpmlFile(fileOrPath) {
            if (!fileOrPath) return;
            if (typeof fileOrPath === 'string') {
                try {
                    const fileName = fileOrPath.split(/[/\\]/).pop() || 'file.opml';
                    const text = await tauriInvoke('read_file_text', { path: fileOrPath });
                    await importOpmlContent(text, fileName);
                } catch (err) {
                    showStatusBadge('opml-status-box', 'error', `✗ Failed to read file: ${err}`);
                }
            } else if (fileOrPath.text) {
                try {
                    const text = await fileOrPath.text();
                    await importOpmlContent(text, fileOrPath.name);
                } catch (err) {
                    showStatusBadge('opml-status-box', 'error', `✗ Failed to read file: ${err.message || err}`);
                }
            }
        }

        async function processJsonFile(fileOrPath) {
            if (!fileOrPath) return;
            if (typeof fileOrPath === 'string') {
                try {
                    const fileName = fileOrPath.split(/[/\\]/).pop() || 'backup.json';
                    const text = await tauriInvoke('read_file_text', { path: fileOrPath });
                    await restoreJsonContent(text, fileName);
                } catch (err) {
                    showStatusBadge('backup-json-status-box', 'error', `✗ Failed to read file: ${err}`);
                }
            } else if (fileOrPath.text) {
                try {
                    const text = await fileOrPath.text();
                    await restoreJsonContent(text, fileOrPath.name);
                } catch (err) {
                    showStatusBadge('backup-json-status-box', 'error', `✗ Failed to read file: ${err.message || err}`);
                }
            }
        }

        // --- Drag & Drop Wiring ---
        function setupFileDropZone(el, onFile) {
            if (!el) return;
            ['dragenter', 'dragover'].forEach(name => {
                el.addEventListener(name, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer) {
                        e.dataTransfer.dropEffect = 'copy';
                    }
                    el.classList.add('dragover');
                });
            });

            ['dragleave', 'dragend'].forEach(name => {
                el.addEventListener(name, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    el.classList.remove('dragover');
                });
            });

            el.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                el.classList.remove('dragover');
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    onFile(e.dataTransfer.files[0]);
                }
            });
        }

        // Global dragover & drop prevention prevents WebView2 from discarding or navigating away on file drops
        window.addEventListener('dragover', (e) => {
            e.preventDefault();
        }, false);
        window.addEventListener('drop', (e) => {
            e.preventDefault();
        }, false);

        // --- OPML Import Triggers ---
        const importOpmlBtn = document.getElementById('btn-import-opml');
        const dropzoneOpml = document.getElementById('dropzone-opml');
        if (importOpmlBtn) {
            importOpmlBtn.addEventListener('click', openOpmlFilePicker);
        }
        if (dropzoneOpml) {
            dropzoneOpml.addEventListener('click', openOpmlFilePicker);
            setupFileDropZone(dropzoneOpml, processOpmlFile);
        }

        // --- JSON Full Backup Export ---
        const backupJsonBtn = document.getElementById('btn-backup-json');
        if (backupJsonBtn) {
            backupJsonBtn.addEventListener('click', async () => {
                showStatusBadge('backup-json-status-box', 'loading', '⏳ Generating full application backup...', 0);
                try {
                    const { backupFolderPath = '' } = await chrome.storage.sync.get('backupFolderPath');
                    const domPath = document.getElementById('settings-backup-folder-path')?.value || '';
                    const folderPath = sanitizeFolderPath(backupFolderPath || domPath);
                    if (folderPath && !backupFolderPath) {
                        await chrome.storage.sync.set({ backupFolderPath: folderPath });
                    }
                    const { json, feedCount } = await generateBackupJsonData();
                    const filename = `puretidings-backup-${getBackupTimestamp()}.json`;

                    const res = await saveBackupFile(filename, json, 'application/json', folderPath);
                    if (res.directWrite && res.path) {
                        showStatusBadge('backup-json-status-box', 'success', `✓ Full backup saved directly to:\n${res.path}`);
                        showInAppToast('Full Backup', `JSON backup saved to ${res.path}`);
                    } else {
                        showStatusBadge('backup-json-status-box', 'success', `✓ Full backup downloaded successfully (${feedCount} items)!`);
                        showInAppToast('Full Backup', `JSON backup created successfully.`);
                    }
                } catch (err) {
                    showStatusBadge('backup-json-status-box', 'error', `✗ Backup failed: ${err.message || err}`);
                }
            });
        }

        // --- JSON Restore Triggers ---
        const restoreJsonBtn = document.getElementById('btn-restore-json');
        const dropzoneJson = document.getElementById('dropzone-json');
        if (restoreJsonBtn) {
            restoreJsonBtn.addEventListener('click', openJsonFilePicker);
        }
        if (dropzoneJson) {
            dropzoneJson.addEventListener('click', openJsonFilePicker);
            setupFileDropZone(dropzoneJson, processJsonFile);
        }

        // --- Paste Buttons Triggers (Direct Clipboard / Text Ingestion) ---
        const pasteOpmlBtn = document.getElementById('btn-paste-opml');
        if (pasteOpmlBtn) {
            pasteOpmlBtn.addEventListener('click', () => openTextRestoreModal('opml'));
        }

        const pasteJsonBtn = document.getElementById('btn-paste-json');
        if (pasteJsonBtn) {
            pasteJsonBtn.addEventListener('click', () => openTextRestoreModal('json'));
        }

        // --- Text Restore Modal Wiring ---
        const textRestoreCloseBtn = document.getElementById('text-restore-modal-close');
        const textRestoreCancelBtn = document.getElementById('text-restore-cancel-btn');
        const textRestoreClearBtn = document.getElementById('text-restore-clear-btn');
        const textRestoreClipBtn = document.getElementById('text-restore-paste-clip-btn');
        const textRestoreSubmitBtn = document.getElementById('text-restore-submit-btn');
        const textRestoreModal = document.getElementById('text-restore-modal');

        if (textRestoreCloseBtn) textRestoreCloseBtn.addEventListener('click', closeTextRestoreModal);
        if (textRestoreCancelBtn) textRestoreCancelBtn.addEventListener('click', closeTextRestoreModal);
        if (textRestoreClearBtn) {
            textRestoreClearBtn.addEventListener('click', () => {
                const inputEl = document.getElementById('text-restore-input');
                const statusEl = document.getElementById('text-restore-status');
                if (inputEl) inputEl.value = '';
                if (statusEl) {
                    statusEl.textContent = '';
                    statusEl.style.color = '';
                }
            });
        }
        if (textRestoreClipBtn) {
            textRestoreClipBtn.addEventListener('click', async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    const inputEl = document.getElementById('text-restore-input');
                    const statusEl = document.getElementById('text-restore-status');
                    if (inputEl && text) {
                        inputEl.value = text;
                        if (statusEl) {
                            statusEl.textContent = '✓ Pasted text from clipboard!';
                            statusEl.style.color = '#28a745';
                        }
                    }
                } catch (e) {
                    const statusEl = document.getElementById('text-restore-status');
                    if (statusEl) {
                        statusEl.textContent = 'Notice: Could not access clipboard automatically. Please paste directly into the box.';
                        statusEl.style.color = '#f39c12';
                    }
                }
            });
        }
        if (textRestoreSubmitBtn) {
            textRestoreSubmitBtn.addEventListener('click', async () => {
                const inputEl = document.getElementById('text-restore-input');
                const statusEl = document.getElementById('text-restore-status');
                const val = (inputEl?.value || '').trim();
                if (!val) {
                    if (statusEl) {
                        statusEl.textContent = '✗ Please enter or paste data before restoring.';
                        statusEl.style.color = '#d93025';
                    }
                    return;
                }
                const modal = document.getElementById('text-restore-modal');
                const type = modal?.dataset?.restoreType || 'json';

                if (type === 'opml' || val.includes('<opml') || val.includes('<outline')) {
                    if (statusEl) {
                        statusEl.textContent = '⏳ Importing OPML...';
                        statusEl.style.color = '#2196f3';
                    }
                    await importOpmlContent(val, 'Pasted OPML');
                    closeTextRestoreModal();
                } else {
                    if (statusEl) {
                        statusEl.textContent = '⏳ Restoring JSON backup...';
                        statusEl.style.color = '#2196f3';
                    }
                    await restoreJsonContent(val, 'Pasted JSON');
                    closeTextRestoreModal();
                }
            });
        }
        if (textRestoreModal) {
            textRestoreModal.addEventListener('click', (e) => {
                if (e.target === textRestoreModal) closeTextRestoreModal();
            });
        }

        // Generous Backup Tab dropzone handler (if dropped outside the specific dashed box)
        const tabBackup = document.getElementById('tab-backup');
        if (tabBackup) {
            ['dragenter', 'dragover'].forEach(name => {
                tabBackup.addEventListener(name, (e) => {
                    e.preventDefault();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                });
            });
            tabBackup.addEventListener('drop', (e) => {
                if (e.target.closest('#dropzone-opml') || e.target.closest('#dropzone-json')) return;
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    const file = e.dataTransfer.files[0];
                    const lower = (file.name || '').toLowerCase();
                    if (lower.endsWith('.opml') || lower.endsWith('.xml')) {
                        processOpmlFile(file);
                    } else if (lower.endsWith('.json')) {
                        processJsonFile(file);
                    }
                }
            });
        }

        // --- WebDAV / Nextcloud Cloud Sync Engine ---
        function getOrCreateDeviceId() {
            let id = localStorage.getItem('puretidings_device_id');
            if (!id) {
                const isAndroid = document.documentElement.classList.contains('is-android') || /Android/i.test(navigator.userAgent);
                id = 'pt_' + (isAndroid ? 'android_' : 'desktop_') + Math.random().toString(36).substring(2, 10);
                localStorage.setItem('puretidings_device_id', id);
            }
            return id;
        }

        function isDefaultFeedTree(tree) {
            if (!Array.isArray(tree) || tree.length === 0) return true;
            const defaultUrls = [
                'https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml',
                'https://feeds.bbci.co.uk/news/rss.xml',
                'https://www.theverge.com/rss/index.xml',
                'https://feeds.arstechnica.com/arstechnica/index',
                'https://www.youtube.com/feeds/videos.xml?channel_id=UCBJycsmduvYEL83R_U4JriQ'
            ];
            const defaultFolderIds = new Set(['folder-news', 'folder-tech', 'folder_email_inboxes']);

            function checkNodes(nodes) {
                for (const n of nodes) {
                    if (n.type === 'folder') {
                        const lower = (n.name || '').trim().toLowerCase();
                        if (!defaultFolderIds.has(n.id) && !['news', 'technology'].includes(lower)) {
                            return false;
                        }
                        if (n.children && !checkNodes(n.children)) return false;
                    } else if (n.type === 'feed') {
                        if (n.isEmail || (n.url && n.url.startsWith('imap:'))) continue;
                        const norm = (n.url || '').trim().toLowerCase().replace(/\/+$/, '');
                        const isDef = defaultUrls.some(u => u.toLowerCase().replace(/\/+$/, '') === norm);
                        if (!isDef) return false;
                    }
                }
                return true;
            }
            return checkNodes(tree);
        }

        function mergeFeedTrees(baseTree, incomingTree, deletedUrls = {}, deletedFolderIds = {}) {
            const norm = (url) => (url || '').trim().toLowerCase().replace(/\/+$/, '');

            if (!Array.isArray(incomingTree) || incomingTree.length === 0) {
                return { mergedTree: JSON.parse(JSON.stringify(baseTree || [])), hasChanges: false, newlyAddedFeeds: [] };
            }
            if (!Array.isArray(baseTree) || baseTree.length === 0) {
                return { mergedTree: JSON.parse(JSON.stringify(incomingTree)), hasChanges: true, newlyAddedFeeds: incomingTree };
            }

            // Base tree is authoritative for structure, folder hierarchy, and feed ordering!
            const mergedTree = JSON.parse(JSON.stringify(baseTree));

            // 1. Collect all feed URLs and folder IDs already in base
            const existingUrls = new Set();
            const existingEmailKeys = new Set();
            const existingFolderIds = new Set();
            function scanBase(nodes) {
                for (const n of nodes) {
                    if (n.type === 'feed') {
                        const isEmail = n.isEmail || (n.id && String(n.id).startsWith('email_')) || (n.url && n.url.startsWith('imap:'));
                        if (isEmail) {
                            const emailKey = String(n.emailAccountId || n.id || n.url);
                            existingEmailKeys.add(emailKey);
                        } else if (n.url) {
                            existingUrls.add(norm(n.url));
                        }
                    } else if (n.type === 'folder') {
                        if (n.id) existingFolderIds.add(String(n.id));
                        if (Array.isArray(n.children)) scanBase(n.children);
                    }
                }
            }
            scanBase(mergedTree);

            // 2. Add any brand new folders created in incomingTree that don't exist in base and were not deleted
            function findNewFolders(nodes) {
                for (const n of nodes) {
                    if (n.type === 'folder' && n.id && !existingFolderIds.has(String(n.id)) && !deletedFolderIds[String(n.id)]) {
                        mergedTree.push({
                            id: n.id,
                            name: n.name,
                            type: 'folder',
                            children: []
                        });
                        existingFolderIds.add(String(n.id));
                    }
                    if (n.type === 'folder' && Array.isArray(n.children)) {
                        findNewFolders(n.children);
                    }
                }
            }
            findNewFolders(incomingTree);

            // 3. Find any brand new feeds added in incomingTree that do NOT exist in base and were not deleted
            const newlyAddedFeeds = [];
            function findNewFeeds(nodes, parentFolderId = null) {
                for (const n of nodes) {
                    if (n.type === 'feed') {
                        const isEmail = n.isEmail || (n.id && String(n.id).startsWith('email_')) || (n.url && n.url.startsWith('imap:'));
                        if (isEmail) {
                            const emailKey = String(n.emailAccountId || n.id || n.url);
                            if (!existingEmailKeys.has(emailKey) && !deletedUrls[emailKey]) {
                                newlyAddedFeeds.push({ feed: { ...n }, parentFolderId });
                                existingEmailKeys.add(emailKey);
                            }
                        } else if (n.url) {
                            const u = norm(n.url);
                            if (!existingUrls.has(u) && !deletedUrls[u]) {
                                newlyAddedFeeds.push({ feed: { ...n }, parentFolderId });
                                existingUrls.add(u);
                            }
                        }
                    } else if (n.type === 'folder' && Array.isArray(n.children)) {
                        findNewFeeds(n.children, n.id);
                    }
                }
            }
            findNewFeeds(incomingTree, null);

            // 4. Place new feeds into mergedTree
            let hasChanges = newlyAddedFeeds.length > 0;
            for (const item of newlyAddedFeeds) {
                if (item.parentFolderId) {
                    let placed = false;
                    function placeInFolder(nodes) {
                        for (const n of nodes) {
                            if (n.type === 'folder' && String(n.id) === String(item.parentFolderId)) {
                                if (!Array.isArray(n.children)) n.children = [];
                                n.children.push(item.feed);
                                return true;
                            }
                            if (n.type === 'folder' && Array.isArray(n.children)) {
                                if (placeInFolder(n.children)) return true;
                            }
                        }
                        return false;
                    }
                    placed = placeInFolder(mergedTree);
                    if (!placed) mergedTree.push(item.feed);
                } else {
                    mergedTree.push(item.feed);
                }
            }

            return {
                mergedTree,
                hasChanges,
                newlyAddedFeeds: newlyAddedFeeds.map(i => i.feed)
            };
        }

        function mergeSyncData(remote, localState) {
            if (!remote || typeof remote !== 'object') {
                return { mergedLocal: localState.local, mergedSync: localState.sync, hasChanges: false, newlyAddedFeeds: [] };
            }

            let hasChanges = false;
            const mergedLocal = { ...(localState.local || {}) };
            const mergedSync = { ...(localState.sync || {}) };

            // 1. Deleted items tombstone merge (max timestamp)
            const localDeletedFeeds = { ...(mergedLocal.deletedFeedUrls || {}) };
            const remoteDeletedFeeds = remote.deletedFeedUrls || {};
            for (const u in remoteDeletedFeeds) {
                localDeletedFeeds[u] = Math.max(localDeletedFeeds[u] || 0, remoteDeletedFeeds[u]);
            }
            mergedLocal.deletedFeedUrls = localDeletedFeeds;

            const localDeletedFolders = { ...(mergedLocal.deletedFolderIds || {}) };
            const remoteDeletedFolders = remote.deletedFolderIds || {};
            for (const id in remoteDeletedFolders) {
                localDeletedFolders[id] = Math.max(localDeletedFolders[id] || 0, remoteDeletedFolders[id]);
            }
            mergedLocal.deletedFolderIds = localDeletedFolders;

            // 2. Set-Union for readLinks, favoritedLinks, summaryLinks
            const localRead = new Set(Array.isArray(mergedLocal.readLinks) ? mergedLocal.readLinks : []);
            const remoteRead = Array.isArray(remote.readLinks) ? remote.readLinks : [];
            let readChanged = false;
            remoteRead.forEach(link => {
                if (link && !localRead.has(link)) {
                    localRead.add(link);
                    readChanged = true;
                }
            });
            if (readChanged) {
                mergedLocal.readLinks = Array.from(localRead);
                hasChanges = true;
            }

            const localFav = new Set(Array.isArray(mergedLocal.favoritedLinks) ? mergedLocal.favoritedLinks : []);
            const remoteFav = Array.isArray(remote.favoritedLinks) ? remote.favoritedLinks : [];
            let favChanged = false;
            remoteFav.forEach(link => {
                if (link && !localFav.has(link)) {
                    localFav.add(link);
                    favChanged = true;
                }
            });
            if (favChanged) {
                mergedLocal.favoritedLinks = Array.from(localFav);
                hasChanges = true;
            }

            const localSum = new Set(Array.isArray(mergedLocal.summaryLinks) ? mergedLocal.summaryLinks : []);
            const remoteSum = Array.isArray(remote.summaryLinks) ? remote.summaryLinks : [];
            let sumChanged = false;
            remoteSum.forEach(link => {
                if (link && !localSum.has(link)) {
                    localSum.add(link);
                    sumChanged = true;
                }
            });
            if (sumChanged) {
                mergedLocal.summaryLinks = Array.from(localSum);
                hasChanges = true;
            }

            // 3. Intelligent Bidirectional FeedTree & Folder merge
            const localTree = Array.isArray(mergedLocal.feedTree) ? mergedLocal.feedTree : [];
            const remoteTree = Array.isArray(remote.feedTree) ? remote.feedTree : [];
            const localTreeUpdated = mergedLocal.feedTreeUpdatedAt || 0;
            const remoteTreeUpdated = remote.feedTreeUpdatedAt || remote.updatedAt || 0;
            const baseTree = (localTreeUpdated >= remoteTreeUpdated) ? localTree : remoteTree;
            const incomingTree = (localTreeUpdated >= remoteTreeUpdated) ? remoteTree : localTree;

            const treeMergeResult = mergeFeedTrees(baseTree, incomingTree, localDeletedFeeds, localDeletedFolders);
            if (treeMergeResult.hasChanges || baseTree === remoteTree) {
                mergedLocal.feedTree = treeMergeResult.mergedTree;
                mergedLocal.feedTreeUpdatedAt = Math.max(localTreeUpdated, remoteTreeUpdated);
                hasChanges = true;
            }
            const newlyAddedFeeds = treeMergeResult.newlyAddedFeeds || [];

            // 4. Rules merge
            if (Array.isArray(remote.rules) && remote.rules.length > 0) {
                const localRules = Array.isArray(mergedSync.rules) ? [...mergedSync.rules] : [];
                const ruleKeys = new Set(localRules.map(r => `${r.field}|${r.condition}|${r.value}|${r.action}`));
                let rulesUpdated = false;
                remote.rules.forEach(rr => {
                    const key = `${rr.field}|${rr.condition}|${rr.value}|${rr.action}`;
                    if (!ruleKeys.has(key)) {
                        localRules.push(rr);
                        ruleKeys.add(key);
                        rulesUpdated = true;
                    }
                });
                if (rulesUpdated) {
                    mergedSync.rules = localRules;
                    hasChanges = true;
                }
            }

            // 5. Email accounts merge
            if (Array.isArray(remote.emailAccounts) && remote.emailAccounts.length > 0) {
                const localAccounts = Array.isArray(mergedSync.emailAccounts) ? [...mergedSync.emailAccounts] : [];
                const accKeys = new Set(localAccounts.map(a => `${a.server}|${a.username}`));
                let accUpdated = false;
                remote.emailAccounts.forEach(ra => {
                    const key = `${ra.server}|${ra.username}`;
                    if (!accKeys.has(key)) {
                        localAccounts.push(ra);
                        accKeys.add(key);
                        accUpdated = true;
                    }
                });
                if (accUpdated) {
                    mergedSync.emailAccounts = localAccounts;
                    hasChanges = true;
                }
            }

            // 6. Settings merge (Gemini API Key, Prompts, Preferences)
            if (remote.geminiApiKey && !mergedSync.geminiApiKey) {
                mergedSync.geminiApiKey = remote.geminiApiKey;
                hasChanges = true;
            }
            if (remote.aiReportPrompt && (!mergedSync.aiReportPrompt || isLegacyGenericPrompt(mergedSync.aiReportPrompt))) {
                mergedSync.aiReportPrompt = remote.aiReportPrompt;
                hasChanges = true;
            }
            if (remote.youtubeAiPrompt && (!mergedSync.youtubeAiPrompt || isLegacyGenericPrompt(mergedSync.youtubeAiPrompt))) {
                mergedSync.youtubeAiPrompt = remote.youtubeAiPrompt;
                hasChanges = true;
            }
            if (remote.fetchSchedule && !mergedSync.fetchSchedule) {
                mergedSync.fetchSchedule = remote.fetchSchedule;
                hasChanges = true;
            }
            if (remote.checkInterval !== undefined && mergedSync.checkInterval === undefined) {
                mergedSync.checkInterval = remote.checkInterval;
                hasChanges = true;
            }
            if (remote.randomizeFetch !== undefined && mergedSync.randomizeFetch === undefined) {
                mergedSync.randomizeFetch = remote.randomizeFetch;
                hasChanges = true;
            }
            if (remote.showNotification !== undefined && mergedSync.showNotification === undefined) {
                mergedSync.showNotification = remote.showNotification;
                hasChanges = true;
            }
            if (remote.showSummaryNotification !== undefined && mergedSync.showSummaryNotification === undefined) {
                mergedSync.showSummaryNotification = remote.showSummaryNotification;
                hasChanges = true;
            }
            if (remote.summaryInterval !== undefined && mergedSync.summaryInterval === undefined) {
                mergedSync.summaryInterval = remote.summaryInterval;
                hasChanges = true;
            }
            if (remote.darkMode !== undefined && mergedSync.darkMode === undefined) {
                mergedSync.darkMode = remote.darkMode;
                applyDesktopTheme(remote.darkMode);
                hasChanges = true;
            }
            if (remote.appLanguage && remote.appLanguage !== mergedSync.appLanguage && !mergedSync.appLanguage) {
                mergedSync.appLanguage = remote.appLanguage;
                if (window.i18n) window.i18n.setLanguage(remote.appLanguage);
                hasChanges = true;
            }

            return { mergedLocal, mergedSync, hasChanges, newlyAddedFeeds };
        }

        async function testWebdavConnection() {
            const urlInput = document.getElementById('setting-sync-webdav-url');
            const userInput = document.getElementById('setting-sync-webdav-user');
            const passInput = document.getElementById('setting-sync-webdav-pass');
            const statusBox = document.getElementById('webdav-sync-status-box');

            const url = (urlInput?.value || '').trim();
            const username = (userInput?.value || '').trim();
            const password = passInput?.value || '';

            if (!url || !username) {
                if (statusBox) {
                    statusBox.style.display = 'block';
                    statusBox.style.background = 'rgba(220, 53, 69, 0.15)';
                    statusBox.style.color = '#dc3545';
                    statusBox.textContent = 'Please enter both Server URL and Username.';
                }
                return false;
            }

            if (statusBox) {
                statusBox.style.display = 'block';
                statusBox.style.background = 'rgba(0, 123, 255, 0.15)';
                statusBox.style.color = '#007bff';
                statusBox.textContent = typeof i18n !== 'undefined' ? i18n.t('settings_webdav_sync_in_progress') : 'Connecting to Nextcloud / WebDAV server...';
            }

            try {
                const workingEndpoint = await tauriInvoke('webdav_test_connection', { url, username, password });
                if (statusBox) {
                    statusBox.style.background = 'rgba(40, 167, 69, 0.15)';
                    statusBox.style.color = '#28a745';
                    statusBox.textContent = typeof i18n !== 'undefined' ? i18n.t('settings_webdav_connected') : '✓ Connection successful!';
                }
                // Automatically persist verified credentials and auto-check enabled
                const enabledEl = document.getElementById('setting-sync-webdav-enabled');
                if (enabledEl) enabledEl.checked = true;
                const pathEl = document.getElementById('setting-sync-webdav-path');
                const autoEl = document.getElementById('setting-sync-webdav-auto');
                await chrome.storage.sync.set({
                    syncWebdavEnabled: true,
                    syncWebdavUrl: url,
                    syncWebdavResolvedUrl: workingEndpoint,
                    syncWebdavUser: username,
                    syncWebdavPass: password,
                    syncWebdavPath: (pathEl?.value || '/puretidings_sync.json').trim(),
                    syncWebdavAuto: autoEl ? autoEl.checked : true
                });
                return true;
            } catch (err) {
                if (statusBox) {
                    statusBox.style.background = 'rgba(220, 53, 69, 0.15)';
                    statusBox.style.color = '#dc3545';
                    const prefix = typeof i18n !== 'undefined' ? i18n.t('settings_webdav_failed') : '✗ Connection failed: ';
                    statusBox.textContent = prefix + (err.message || err);
                }
                return false;
            }
        }

        let lastWebdavSyncTime = 0;
        try {
            lastWebdavSyncTime = parseInt(localStorage.getItem('pt_last_webdav_sync_time') || '0', 10) || 0;
        } catch (_) {}

        async function executeWebdavSync(options = { manual: false, isStartup: false, forcePull: false }) {
            if (isWebdavSyncing || window.isWebdavSyncing) return false;
            isWebdavSyncing = true;
            window.isWebdavSyncing = true;
            const statusBox = document.getElementById('webdav-sync-status-box');

            try {
                const domEnabledEl = document.getElementById('setting-sync-webdav-enabled');
                const domUrlEl = document.getElementById('setting-sync-webdav-url');
                const domUserEl = document.getElementById('setting-sync-webdav-user');
                const domPassEl = document.getElementById('setting-sync-webdav-pass');
                const domPathEl = document.getElementById('setting-sync-webdav-path');
                const domAutoEl = document.getElementById('setting-sync-webdav-auto');

                let enabled = false;
                let url = '';
                let username = '';
                let password = '';
                let remotePath = '/puretidings_sync.json';

                if (options.manual && domUrlEl && domUserEl) {
                    enabled = domEnabledEl ? domEnabledEl.checked : true;
                    url = (domUrlEl.value || '').trim();
                    username = (domUserEl.value || '').trim();
                    password = domPassEl ? domPassEl.value : '';
                    remotePath = (domPathEl?.value || '/puretidings_sync.json').trim() || '/puretidings_sync.json';
                    const auto = domAutoEl ? domAutoEl.checked : true;

                    if (url && username) {
                        if (domEnabledEl && !domEnabledEl.checked) {
                            domEnabledEl.checked = true;
                            enabled = true;
                        }
                        await chrome.storage.sync.set({
                            syncWebdavEnabled: enabled,
                            syncWebdavUrl: url,
                            syncWebdavUser: username,
                            syncWebdavPass: password,
                            syncWebdavPath: remotePath,
                            syncWebdavAuto: auto
                        });
                    }
                } else {
                    const syncSettings = await chrome.storage.sync.get([
                        'syncWebdavEnabled', 'syncWebdavUrl', 'syncWebdavUser',
                        'syncWebdavPass', 'syncWebdavPath', 'syncWebdavAuto', 'syncWebdavResolvedUrl'
                    ]);
                    enabled = !!syncSettings.syncWebdavEnabled;
                    let resolved = (syncSettings.syncWebdavResolvedUrl || '').trim();
                    if (!resolved.startsWith('http://') && !resolved.startsWith('https://')) {
                        resolved = '';
                    }
                    url = (resolved || syncSettings.syncWebdavUrl || '').trim();
                    username = (syncSettings.syncWebdavUser || '').trim();
                    password = syncSettings.syncWebdavPass || '';
                    remotePath = (syncSettings.syncWebdavPath || '/puretidings_sync.json').trim();
                }

                // Sanitize URL: if it contains /apps/ or /index.php, strip it
                if (url.includes('/apps/')) {
                    url = url.substring(0, url.indexOf('/apps/')).replace(/\/+$/, '');
                } else if (url.includes('/index.php')) {
                    url = url.substring(0, url.indexOf('/index.php')).replace(/\/+$/, '');
                }

                if (!url || !username) {
                    if (options.manual && statusBox) {
                        statusBox.style.display = 'block';
                        statusBox.style.background = 'rgba(220, 53, 69, 0.15)';
                        statusBox.style.color = '#dc3545';
                        statusBox.textContent = 'Please enter both WebDAV Server URL and Username.';
                    }
                    return false;
                }

                if (!enabled) {
                    if (options.manual && statusBox) {
                        statusBox.style.display = 'block';
                        statusBox.style.background = 'rgba(220, 53, 69, 0.15)';
                        statusBox.style.color = '#dc3545';
                        statusBox.textContent = 'Please check "Enable Nextcloud / WebDAV Cross-Device Sync".';
                    }
                    return false;
                }

                isWebdavSyncing = true;
                if (statusBox && (options.manual || statusBox.style.display === 'block')) {
                    statusBox.style.display = 'block';
                    statusBox.style.background = 'rgba(0, 123, 255, 0.15)';
                    statusBox.style.color = '#007bff';
                    statusBox.textContent = typeof i18n !== 'undefined' ? i18n.t('settings_webdav_sync_in_progress') : 'Syncing with WebDAV...';
                }

                // 1. Download remote file
                const remoteContent = await tauriInvoke('webdav_get_sync_file', {
                    url, username, password, remotePath
                });

                // 2. Read local state
                const localData = await chrome.storage.local.get([
                    'feedTree', 'feedTreeUpdatedAt', 'feedTreeLastEditedLocally',
                    'lastWebdavSyncTime', 'deletedFeedUrls', 'deletedFolderIds',
                    'readLinks', 'favoritedLinks', 'summaryLinks'
                ]);
                if (localData.lastWebdavSyncTime) {
                    lastWebdavSyncTime = Math.max(lastWebdavSyncTime, localData.lastWebdavSyncTime);
                }
                const syncData = await chrome.storage.sync.get([
                    'rules', 'emailAccounts', 'appLanguage', 'geminiApiKey', 'aiReportPrompt',
                    'youtubeAiPrompt', 'checkInterval', 'randomizeFetch', 'fetchSchedule',
                    'showNotification', 'showSummaryNotification', 'summaryInterval',
                    'darkMode', 'keepScreenAwake'
                ]);

                let remoteObj = null;
                if (remoteContent) {
                    try {
                        remoteObj = JSON.parse(remoteContent);
                    } catch (pe) {
                        console.warn('[PureTidings Desktop] Failed to parse remote sync JSON:', pe);
                    }
                }

                const deviceId = getOrCreateDeviceId();
                const now = Date.now();
                let newlyAddedFeeds = [];

                let finalTree = Array.isArray(localData.feedTree) ? localData.feedTree : [];
                let finalTreeUpdatedAt = localData.feedTreeUpdatedAt || 0;
                let localLastEdited = localData.feedTreeLastEditedLocally || 0;

                let localNeedsSave = false;
                let remoteNeedsUpload = false;

                let localDeletedFeeds = { ...(localData.deletedFeedUrls || {}) };
                let localDeletedFolders = { ...(localData.deletedFolderIds || {}) };
                let finalReadLinks = Array.isArray(localData.readLinks) ? [...localData.readLinks] : [];
                let finalFavLinks = Array.isArray(localData.favoritedLinks) ? [...localData.favoritedLinks] : [];
                let finalSumLinks = Array.isArray(localData.summaryLinks) ? [...localData.summaryLinks] : [];
                let finalRules = Array.isArray(syncData.rules) ? [...syncData.rules] : [];
                const finalSync = { ...syncData };

                if (!remoteObj) {
                    // Initial sync: remote file does not exist yet on server
                    remoteNeedsUpload = true;
                } else {
                    const remoteTree = Array.isArray(remoteObj.feedTree) ? remoteObj.feedTree : [];
                    const remoteTreeUpdatedAt = remoteObj.feedTreeUpdatedAt || remoteObj.updatedAt || 0;
                    const isLocalDefault = isDefaultFeedTree(finalTree);
                    const isRemoteDefault = isDefaultFeedTree(remoteTree);
                    const isFromAnotherDevice = !remoteObj.deviceId || remoteObj.deviceId !== deviceId;

                    // Merge tombstones (deleted items)
                    const remoteDeletedFeeds = remoteObj.deletedFeedUrls || {};
                    for (const u in remoteDeletedFeeds) {
                        if (!localDeletedFeeds[u] || remoteDeletedFeeds[u] > localDeletedFeeds[u]) {
                            localDeletedFeeds[u] = remoteDeletedFeeds[u];
                            localNeedsSave = true;
                        }
                    }
                    const remoteDeletedFolders = remoteObj.deletedFolderIds || {};
                    for (const id in remoteDeletedFolders) {
                        if (!localDeletedFolders[id] || remoteDeletedFolders[id] > localDeletedFolders[id]) {
                            localDeletedFolders[id] = remoteDeletedFolders[id];
                            localNeedsSave = true;
                        }
                    }

                    // --- FEED TREE SYNCHRONIZATION ---
                    const normUrl = (u) => (u || '').trim().toLowerCase().replace(/\/+$/, '');
                    const localHasUnsyncedEdits = (localLastEdited > 0 && localLastEdited > lastWebdavSyncTime) ||
                                                  (localLastEdited > remoteTreeUpdatedAt) ||
                                                  (finalTreeUpdatedAt > remoteTreeUpdatedAt);

                    if (options.forcePull) {
                        console.log('[PureTidings WebDAV] Force Pull: Overwriting local tree with cloud tree.');
                        finalTree = remoteTree;
                        finalTreeUpdatedAt = remoteTreeUpdatedAt;
                        localNeedsSave = true;
                        remoteNeedsUpload = false;
                        newlyAddedFeeds = remoteTree;
                    }
                    // Case 1: Fresh install: Local is default, Remote has user's cloud feeds
                    else if (!localHasUnsyncedEdits && isLocalDefault && !isRemoteDefault && remoteTree.length > 0) {
                        console.log('[PureTidings WebDAV] Fresh install detected: Adopting cloud tree.');
                        finalTree = remoteTree;
                        finalTreeUpdatedAt = remoteTreeUpdatedAt;
                        localNeedsSave = true;
                        remoteNeedsUpload = false;
                        newlyAddedFeeds = remoteTree;
                    }
                    // Case 2: Remote is default or empty, Local has custom feeds
                    else if ((!remoteObj || isRemoteDefault) && !isLocalDefault && finalTree.length > 0) {
                        console.log('[PureTidings WebDAV] Remote is default or empty: Uploading local tree.');
                        finalTreeUpdatedAt = Math.max(finalTreeUpdatedAt, localLastEdited, now);
                        remoteNeedsUpload = true;
                        localNeedsSave = true;
                    }
                    // Case 3: Local has un-synced user edits (newer than cloud) -> LOCAL IS AUTHORITATIVE BASE!
                    // This protects the user's reordered feeds, folder changes, edits, and deletions!
                    else if (localHasUnsyncedEdits) {
                        console.log('[PureTidings WebDAV] Local tree has newer un-synced user edits -> Preserving local tree & ordering.');
                        if (isFromAnotherDevice && remoteTree.length > 0 && JSON.stringify(finalTree) !== JSON.stringify(remoteTree)) {
                            console.log('[PureTidings WebDAV] Merging missing feeds from remote into local base...');
                            const mergeRes = mergeFeedTrees(finalTree, remoteTree, localDeletedFeeds, localDeletedFolders);
                            finalTree = mergeRes.mergedTree;
                            newlyAddedFeeds = mergeRes.newlyAddedFeeds;
                        }
                        finalTreeUpdatedAt = Math.max(finalTreeUpdatedAt, localLastEdited, now);
                        remoteNeedsUpload = true;
                        localNeedsSave = true;
                    }
                    // Case 4: Cloud tree was updated by ANOTHER device and is strictly NEWER than local edits
                    else if (isFromAnotherDevice && remoteTreeUpdatedAt > finalTreeUpdatedAt && remoteTree.length > 0) {
                        console.log('[PureTidings WebDAV] Cloud tree was updated by another device -> Adopting cloud tree.');
                        const mergeRes = mergeFeedTrees(remoteTree, finalTree, localDeletedFeeds, localDeletedFolders);
                        finalTree = mergeRes.mergedTree;
                        finalTreeUpdatedAt = remoteTreeUpdatedAt;
                        localNeedsSave = true;
                        remoteNeedsUpload = mergeRes.hasChanges;
                        newlyAddedFeeds = mergeRes.newlyAddedFeeds;
                    }
                    // Case 5: Remote tree was uploaded by THIS SAME DEVICE and no local edits occurred
                    else if (!isFromAnotherDevice && !localHasUnsyncedEdits) {
                        console.log('[PureTidings WebDAV] Local tree is up to date (last uploaded by this device).');
                    }
                    // Case 6: Local has no un-synced edits and remote has data -> Adopt remote
                    else if (!localHasUnsyncedEdits && remoteTree.length > 0 && (remoteTreeUpdatedAt >= finalTreeUpdatedAt || finalTree.length === 0)) {
                        console.log('[PureTidings WebDAV] Local has no un-synced edits -> Adopting cloud tree.');
                        finalTree = remoteTree;
                        finalTreeUpdatedAt = remoteTreeUpdatedAt;
                        localNeedsSave = true;
                        remoteNeedsUpload = false;
                    }

                    // --- ARTICLE STATUSES (Set-Union) ---
                    // Read Links
                    const localReadSet = new Set(finalReadLinks);
                    const remoteRead = Array.isArray(remoteObj.readLinks) ? remoteObj.readLinks : [];
                    let readLocalAdded = false;
                    remoteRead.forEach(l => {
                        if (l && !localReadSet.has(l)) {
                            localReadSet.add(l);
                            readLocalAdded = true;
                        }
                    });
                    if (readLocalAdded) localNeedsSave = true;
                    const remoteReadSet = new Set(remoteRead);
                    for (const l of localReadSet) {
                        if (!remoteReadSet.has(l)) {
                            remoteNeedsUpload = true;
                            break;
                        }
                    }
                    finalReadLinks = Array.from(localReadSet);

                    // Favorited Links
                    const localFavSet = new Set(finalFavLinks);
                    const remoteFav = Array.isArray(remoteObj.favoritedLinks) ? remoteObj.favoritedLinks : [];
                    let favLocalAdded = false;
                    remoteFav.forEach(l => {
                        if (l && !localFavSet.has(l)) {
                            localFavSet.add(l);
                            favLocalAdded = true;
                        }
                    });
                    if (favLocalAdded) localNeedsSave = true;
                    const remoteFavSet = new Set(remoteFav);
                    for (const l of localFavSet) {
                        if (!remoteFavSet.has(l)) {
                            remoteNeedsUpload = true;
                            break;
                        }
                    }
                    finalFavLinks = Array.from(localFavSet);

                    // Summary Links
                    const localSumSet = new Set(finalSumLinks);
                    const remoteSum = Array.isArray(remoteObj.summaryLinks) ? remoteObj.summaryLinks : [];
                    let sumLocalAdded = false;
                    remoteSum.forEach(l => {
                        if (l && !localSumSet.has(l)) {
                            localSumSet.add(l);
                            sumLocalAdded = true;
                        }
                    });
                    if (sumLocalAdded) localNeedsSave = true;
                    const remoteSumSet = new Set(remoteSum);
                    for (const l of localSumSet) {
                        if (!remoteSumSet.has(l)) {
                            remoteNeedsUpload = true;
                            break;
                        }
                    }
                    finalSumLinks = Array.from(localSumSet);

                    // --- RULES UNION ---
                    const localRules = [...finalRules];
                    const remoteRules = Array.isArray(remoteObj.rules) ? remoteObj.rules : [];
                    const localRuleKeys = new Set(localRules.map(r => `${r.field}|${r.condition}|${r.value}|${r.action}`));
                    let rulesLocalAdded = false;
                    remoteRules.forEach(rr => {
                        const key = `${rr.field}|${rr.condition}|${rr.value}|${rr.action}`;
                        if (!localRuleKeys.has(key)) {
                            localRules.push(rr);
                            localRuleKeys.add(key);
                            rulesLocalAdded = true;
                        }
                    });
                    if (rulesLocalAdded) localNeedsSave = true;
                    const remoteRuleKeys = new Set(remoteRules.map(r => `${r.field}|${r.condition}|${r.value}|${r.action}`));
                    for (const lr of localRules) {
                        const key = `${lr.field}|${lr.condition}|${lr.value}|${lr.action}`;
                        if (!remoteRuleKeys.has(key)) {
                            remoteNeedsUpload = true;
                            break;
                        }
                    }
                    finalRules = localRules;

                    // --- EMAIL ACCOUNTS UNION ---
                    if (Array.isArray(remoteObj.emailAccounts) && remoteObj.emailAccounts.length > 0) {
                        const localAccs = Array.isArray(finalSync.emailAccounts) ? [...finalSync.emailAccounts] : [];
                        const accKeys = new Set(localAccs.map(a => `${a.server}|${a.username}`));
                        let accAdded = false;
                        remoteObj.emailAccounts.forEach(ra => {
                            const key = `${ra.server}|${ra.username}`;
                            if (!accKeys.has(key)) {
                                localAccs.push(ra);
                                accKeys.add(key);
                                accAdded = true;
                            }
                        });
                        if (accAdded) {
                            finalSync.emailAccounts = localAccs;
                            localNeedsSave = true;
                        }
                    }

                    // --- SETTINGS (API Key, Prompts, Preferences) ---
                    if (remoteObj.geminiApiKey && !finalSync.geminiApiKey) {
                        finalSync.geminiApiKey = remoteObj.geminiApiKey;
                        localNeedsSave = true;
                    } else if (finalSync.geminiApiKey && !remoteObj.geminiApiKey) {
                        remoteNeedsUpload = true;
                    }

                    if (remoteObj.aiReportPrompt && (!finalSync.aiReportPrompt || isLegacyGenericPrompt(finalSync.aiReportPrompt))) {
                        finalSync.aiReportPrompt = remoteObj.aiReportPrompt;
                        localNeedsSave = true;
                    } else if (finalSync.aiReportPrompt && !remoteObj.aiReportPrompt) {
                        remoteNeedsUpload = true;
                    }

                    if (remoteObj.youtubeAiPrompt && (!finalSync.youtubeAiPrompt || isLegacyGenericPrompt(finalSync.youtubeAiPrompt))) {
                        finalSync.youtubeAiPrompt = remoteObj.youtubeAiPrompt;
                        localNeedsSave = true;
                    } else if (finalSync.youtubeAiPrompt && !remoteObj.youtubeAiPrompt) {
                        remoteNeedsUpload = true;
                    }

                    if (remoteObj.fetchSchedule && !finalSync.fetchSchedule) {
                        finalSync.fetchSchedule = remoteObj.fetchSchedule;
                        localNeedsSave = true;
                    }

                    if (remoteObj.appLanguage && !finalSync.appLanguage) {
                        finalSync.appLanguage = remoteObj.appLanguage;
                        if (window.i18n) window.i18n.setLanguage(remoteObj.appLanguage);
                        localNeedsSave = true;
                    }
                }

                // --- SAVE LOCAL UPDATES IF ANY REMOTE CHANGES WERE ADOPTED ---
                if (localNeedsSave) {
                    await chrome.storage.local.set({
                        feedTree: finalTree,
                        feedTreeUpdatedAt: finalTreeUpdatedAt,
                        feedTreeLastEditedLocally: remoteNeedsUpload ? localLastEdited : 0,
                        deletedFeedUrls: localDeletedFeeds,
                        deletedFolderIds: localDeletedFolders,
                        readLinks: finalReadLinks,
                        favoritedLinks: finalFavLinks,
                        summaryLinks: finalSumLinks
                    });
                    await chrome.storage.sync.set({
                        rules: finalRules,
                        emailAccounts: finalSync.emailAccounts || [],
                        geminiApiKey: finalSync.geminiApiKey || '',
                        aiReportPrompt: finalSync.aiReportPrompt || '',
                        youtubeAiPrompt: finalSync.youtubeAiPrompt || '',
                        fetchSchedule: finalSync.fetchSchedule || null,
                        appLanguage: finalSync.appLanguage || 'en'
                    });

                    if (typeof renderSettingsFeeds === 'function') renderSettingsFeeds();
                    if (typeof updateUnreadCounters === 'function') updateUnreadCounters();
                    if (typeof syncEmailAccountsToFeedTree === 'function') await syncEmailAccountsToFeedTree();
                    if (typeof switchView === 'function') switchView(currentViewMode, true);

                    // Auto-fetch newly added feeds
                    if (newlyAddedFeeds.length > 0) {
                        console.log(`[PureTidings WebDAV] Automatically fetching ${newlyAddedFeeds.length} new feeds from cloud sync...`);
                        newlyAddedFeeds.forEach(feed => {
                            if (feed.id && !feed.isEmail && typeof refreshSingleFeedNative === 'function') {
                                refreshSingleFeedNative(feed.id).catch(() => {});
                            }
                        });
                    }
                }

                // --- ONLY UPLOAD IF LOCAL HAD NEW CHANGES (AND NOT forcePull) ---
                if (remoteNeedsUpload && !options.forcePull) {
                    if (typeof syncEmailAccountsToFeedTree === 'function') {
                        await syncEmailAccountsToFeedTree();
                    }
                    const freshLocalTree = (await chrome.storage.local.get('feedTree'))?.feedTree;
                    if (Array.isArray(freshLocalTree) && freshLocalTree.length > 0) {
                        finalTree = freshLocalTree;
                    }
                    finalTreeUpdatedAt = Math.max(finalTreeUpdatedAt, localLastEdited, now);
                    const payloadObj = {
                        version: 2,
                        updatedAt: now,
                        deviceId,
                        feedTree: finalTree,
                        feedTreeUpdatedAt: finalTreeUpdatedAt,
                        deletedFeedUrls: localDeletedFeeds,
                        deletedFolderIds: localDeletedFolders,
                        readLinks: finalReadLinks,
                        favoritedLinks: finalFavLinks,
                        summaryLinks: finalSumLinks,
                        rules: finalRules,
                        emailAccounts: finalSync.emailAccounts || [],
                        appLanguage: finalSync.appLanguage || 'en',
                        geminiApiKey: finalSync.geminiApiKey || '',
                        aiReportPrompt: finalSync.aiReportPrompt || '',
                        youtubeAiPrompt: finalSync.youtubeAiPrompt || '',
                        checkInterval: finalSync.checkInterval !== undefined ? finalSync.checkInterval : 30,
                        randomizeFetch: !!finalSync.randomizeFetch,
                        fetchSchedule: finalSync.fetchSchedule || null,
                        showNotification: finalSync.showNotification !== undefined ? finalSync.showNotification : true,
                        showSummaryNotification: !!finalSync.showSummaryNotification,
                        summaryInterval: finalSync.summaryInterval || 60,
                        darkMode: finalSync.darkMode !== undefined ? finalSync.darkMode : true,
                        keepScreenAwake: !!finalSync.keepScreenAwake
                    };

                    await tauriInvoke('webdav_put_sync_file', {
                        url, username, password, remotePath,
                        content: JSON.stringify(payloadObj, null, 2)
                    });
                    console.log('[PureTidings WebDAV] Uploaded updated sync payload to WebDAV.');
                } else {
                    console.log('[PureTidings WebDAV] Sync complete. Cloud file untouched (no local upload needed).');
                }

                lastWebdavSyncTime = now;
                try { localStorage.setItem('pt_last_webdav_sync_time', String(now)); } catch (_) {}
                await chrome.storage.local.set({
                    lastWebdavSyncTime: now,
                    feedTreeUpdatedAt: finalTreeUpdatedAt,
                    feedTreeLastEditedLocally: 0
                });

                const feedCount = (finalTree || []).reduce((acc, n) => acc + (n.type === 'feed' ? 1 : (n.children ? n.children.filter(c => c.type === 'feed').length : 0)), 0);
                const folderCount = (finalTree || []).filter(n => n.type === 'folder').length;
                const timeStr = new Date().toLocaleTimeString();

                if (statusBox) {
                    statusBox.style.display = 'block';
                    statusBox.style.background = 'rgba(40, 167, 69, 0.15)';
                    statusBox.style.color = '#28a745';
                    const newFeedsNotice = newlyAddedFeeds.length > 0 ? `<br>• Received: ${newlyAddedFeeds.length} new feed(s)` : '';
                    const actionLabel = options.forcePull
                        ? ((typeof i18n !== 'undefined' && i18n.t('settings_webdav_pull_btn')) || 'Restored from Cloud')
                        : ((typeof i18n !== 'undefined' && i18n.t('settings_webdav_sync_success')) || 'Synchronized successfully');
                    statusBox.innerHTML = `<strong>${actionLabel} (${timeStr})</strong><br><span style="font-size: 11px; opacity: 0.9;">• File: ${remotePath}<br>• Current: ${feedCount} Feeds, ${folderCount} Folders${newFeedsNotice}</span>`;
                    setTimeout(() => {
                        if (statusBox && statusBox.innerHTML.includes('✓')) statusBox.style.display = 'none';
                    }, 8000);
                }
                if (options.manual) {
                    const extraMsg = newlyAddedFeeds.length > 0 ? ` (${newlyAddedFeeds.length} new feeds)` : '';
                    const title = options.forcePull ? 'Cloud Restore Complete' : 'Cloud Sync Complete';
                    showInAppToast(title, `Synced ${remotePath} (${feedCount} feeds, ${folderCount} folders)${extraMsg}!`);
                }
                return true;
            } catch (err) {
                console.error('[PureTidings Desktop] WebDAV sync failed:', err);
                if (statusBox) {
                    statusBox.style.display = 'block';
                    statusBox.style.background = 'rgba(220, 53, 69, 0.15)';
                    statusBox.style.color = '#dc3545';
                    const prefix = typeof i18n !== 'undefined' ? i18n.t('settings_webdav_failed') : '✗ Sync failed: ';
                    statusBox.innerHTML = `<strong>${prefix}</strong><br><span style="font-size: 11px;">${err.message || err}</span>`;
                }
                if (options.manual) {
                    showInAppToast('Sync Error', `Failed to sync with Nextcloud: ${err.message || err}`);
                }
                return false;
            } finally {
                isWebdavSyncing = false;
                window.isWebdavSyncing = false;
            }
        }

        window.testWebdavConnection = testWebdavConnection;
        window.executeWebdavSync = executeWebdavSync;

        // Periodic background WebDAV sync polling (every 10 minutes)
        setInterval(async () => {
            try {
                const { syncWebdavEnabled, syncWebdavAuto } = await chrome.storage.sync.get(['syncWebdavEnabled', 'syncWebdavAuto']);
                if (syncWebdavEnabled && syncWebdavAuto !== false) {
                    executeWebdavSync({ manual: false });
                }
            } catch (_) {}
        }, 10 * 60 * 1000);

        // Window focus check: pull updates if more than 5 minutes since last sync
        window.addEventListener('focus', () => {
            const now = Date.now();
            if (now - lastWebdavSyncTime > 5 * 60 * 1000) {
                chrome.storage.sync.get(['syncWebdavEnabled', 'syncWebdavAuto']).then(({ syncWebdavEnabled, syncWebdavAuto }) => {
                    if (syncWebdavEnabled && syncWebdavAuto !== false) {
                        executeWebdavSync({ manual: false });
                    }
                }).catch(() => {});
            }
        });

        // Flush pending sync immediately on app minimize, navigation or close
        window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && webdavDebounceTimer) {
                clearTimeout(webdavDebounceTimer);
                webdavDebounceTimer = null;
                executeWebdavSync({ manual: false });
            }
        });
        window.addEventListener('pagehide', () => {
            if (webdavDebounceTimer) {
                clearTimeout(webdavDebounceTimer);
                webdavDebounceTimer = null;
                executeWebdavSync({ manual: false });
            }
        });
        window.addEventListener('beforeunload', () => {
            if (webdavDebounceTimer) {
                clearTimeout(webdavDebounceTimer);
                webdavDebounceTimer = null;
                executeWebdavSync({ manual: false });
            }
        });

        // --- WebDAV UI Listeners ---
        const testWebdavBtn = document.getElementById('btn-test-webdav-sync');
        if (testWebdavBtn) {
            testWebdavBtn.addEventListener('click', testWebdavConnection);
        }

        const triggerWebdavBtn = document.getElementById('btn-trigger-webdav-sync');
        if (triggerWebdavBtn) {
            triggerWebdavBtn.addEventListener('click', () => executeWebdavSync({ manual: true }));
        }

        const forcePullWebdavBtn = document.getElementById('btn-force-pull-webdav');
        if (forcePullWebdavBtn) {
            forcePullWebdavBtn.addEventListener('click', async () => {
                const confirmMsg = (typeof i18n !== 'undefined' && i18n.t('settings_webdav_pull_confirm')) || 
                    "Download and adopt all feeds and data from the cloud? This will overwrite local feeds with the cloud state.";
                if (confirm(confirmMsg)) {
                    await executeWebdavSync({ manual: true, forcePull: true });
                }
            });
        }

        // Fallback: Listen for Tauri native drag-drop events if dispatched by the window
        if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
            try {
                window.__TAURI__.event.listen('tauri://drag-drop', (event) => {
                    const paths = event.payload?.paths || event.payload;
                    if (Array.isArray(paths) && paths.length > 0) {
                        const firstPath = paths[0];
                        const lower = firstPath.toLowerCase();
                        if (lower.endsWith('.opml') || lower.endsWith('.xml')) {
                            processOpmlFile(firstPath);
                        } else if (lower.endsWith('.json')) {
                            processJsonFile(firstPath);
                        }
                    }
                });
            } catch (e) {
                console.warn('tauri://drag-drop registration:', e);
            }
        }

        // Initialize backup destination label on startup
        chrome.storage.sync.get('backupFolderPath').then(({ backupFolderPath }) => {
            if (backupFolderPath) updateBackupTabFolderDisplay(backupFolderPath);
        }).catch(() => {});

        // Initialize Screen Wake Lock on startup if configured
        chrome.storage.sync.get(['keepScreenAwake']).then(({ keepScreenAwake }) => {
            if (keepScreenAwake) applyWakeLock(true);
        }).catch(() => {});

        // Initialize Android notification channel & permissions
        const isAndroidInit = document.documentElement.classList.contains('is-android') || /Android/i.test(navigator.userAgent);
        if (isAndroidInit && window.__TAURI__?.core?.invoke) {
            try {
                tauriInvoke('plugin:notification|create_channel', {
                    id: 'puretidings_articles',
                    name: 'PureTidings Articles',
                    description: 'Notifications for new articles and unread reminders',
                    importance: 4, // High
                    visibility: 1, // Public
                    lights: true,
                    vibration: true
                }).catch(() => {});
            } catch (_) {}
        }

        // Start background automation engine (schedules next check based on configured interval & schedule)
        startBackgroundScheduler();

        // Initialize WebDAV Cloud Sync on startup if configured (fast 1.5s pull)
        chrome.storage.sync.get(['syncWebdavEnabled', 'syncWebdavAuto']).then(({ syncWebdavEnabled, syncWebdavAuto }) => {
            if (syncWebdavEnabled && syncWebdavAuto !== false) {
                setTimeout(() => {
                    executeWebdavSync({ manual: false, isStartup: true });
                }, 1500);
            }
        }).catch(() => {});

        // Listen for runtime language switches to update theme & reader tooltips
        window.addEventListener('i18n:languageChanged', () => {
            const isDark = document.documentElement.classList.contains('dark-mode');
            const themeBtn = document.getElementById('theme-toggle-btn');
            if (themeBtn && window.i18n) {
                themeBtn.title = window.i18n.t(isDark ? 'tooltip_theme_light' : 'tooltip_theme_dark');
            }
            const mobileThemeBtn = document.getElementById('mobile-theme-btn');
            if (mobileThemeBtn && window.i18n) {
                mobileThemeBtn.title = window.i18n.t(isDark ? 'tooltip_theme_light' : 'tooltip_theme_dark');
            }
            const origLink = document.getElementById('reader-original-link');
            if (origLink && window.i18n) {
                origLink.title = window.i18n.t('tooltip_open_browser');
            }
            const starBtn = document.getElementById('reader-star-btn');
            if (starBtn && window.i18n) {
                const isFav = starBtn.classList.contains('favorited');
                starBtn.title = window.i18n.t(isFav ? 'tooltip_remove_favorites' : 'tooltip_add_favorites');
            }
            const summaryBtn = document.getElementById('reader-summary-btn');
            if (summaryBtn && window.i18n) {
                const isSum = summaryBtn.classList.contains('active');
                summaryBtn.title = window.i18n.t(isSum ? 'tooltip_remove_summary' : 'tooltip_add_summary');
            }
        });

        // ==========================================
        // 17. Browser Satellite Bridge & Event Sync
        // ==========================================
        function calculateTotalUnreadCount() {
            const counts = memLocal.unreadCounts || {};
            let total = 0;
            for (const k in counts) {
                total += (parseInt(counts[k], 10) || 0);
            }
            return total;
        }

        function syncSatelliteStateToRust() {
            if (typeof tauriInvoke !== 'function') return;
            try {
                const totalUnread = calculateTotalUnreadCount();
                const snapshot = {
                    feedTree: memLocal.feedTree || [],
                    allPosts: sanitizePostsForSatellite(memLocal.allPosts || {}),
                    readLinks: memLocal.readLinks || [],
                    favoritedLinks: memLocal.favoritedLinks || [],
                    summaryLinks: memLocal.summaryLinks || [],
                    unreadCounts: memLocal.unreadCounts || {},
                    rules: memSync.rules || [],
                    geminiApiKey: memSync.geminiApiKey || '',
                    customAiPrompt: memSync.customAiPrompt || '',
                    youtubeAiPrompt: memSync.youtubeAiPrompt || '',
                    darkMode: memSync.darkMode !== false,
                    totalUnread: totalUnread
                };

                tauriInvoke('update_satellite_state', {
                    stateJson: JSON.stringify(snapshot),
                    totalUnread: totalUnread
                }).catch(() => {});
            } catch (err) {
                console.warn('[PureTidings Desktop] Satellite sync error:', err);
            }
        }
        window.syncSatelliteStateToRust = syncSatelliteStateToRust;

        let satelliteDebounceTimer = null;
        function scheduleSatelliteStateSync() {
            if (satelliteDebounceTimer) clearTimeout(satelliteDebounceTimer);
            satelliteDebounceTimer = setTimeout(syncSatelliteStateToRust, 350);
        }
        window.scheduleSatelliteStateSync = scheduleSatelliteStateSync;

        // Perform initial state sync to Rust
        setTimeout(syncSatelliteStateToRust, 1200);

        // Listen for Satellite Events dispatched from Tauri Rust
        if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
            try {
                // 1. Mark Read
                window.__TAURI__.event.listen('satellite_mark_read', (event) => {
                    try {
                        const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
                        const { link, isRead } = payload || {};
                        if (!link) return;

                        let readLinks = memLocal.readLinks || [];
                        const readSet = new Set(readLinks);
                        if (isRead) {
                            readSet.add(link);
                        } else {
                            readSet.delete(link);
                        }
                        const newReadLinks = Array.from(readSet);
                        setLocalItem('readLinks', newReadLinks);

                        // Update in-memory unread counts
                        const allPosts = memLocal.allPosts || {};
                        const unreadCounts = memLocal.unreadCounts || {};
                        for (const feedId in allPosts) {
                            const posts = allPosts[feedId] || [];
                            let unread = 0;
                            for (let i = 0; i < posts.length; i++) {
                                if (!readSet.has(posts[i].link)) {
                                    unread++;
                                }
                            }
                            unreadCounts[feedId] = unread;
                        }
                        setLocalItem('unreadCounts', unreadCounts);

                        // Refresh feedpage UI if available
                        if (typeof window.recalculateCounters === 'function') {
                            window.recalculateCounters();
                        } else if (typeof window.filterSidebarFeeds === 'function') {
                            window.filterSidebarFeeds();
                        }
                    } catch (e) {
                        console.error('[PureTidings Desktop] Error handling satellite_mark_read:', e);
                    }
                });

                // 2. Open Article
                window.__TAURI__.event.listen('satellite_open_article', (event) => {
                    try {
                        const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
                        const { link, title } = payload || {};
                        if (!link) return;

                        let foundPost = null;
                        const allPosts = memLocal.allPosts || {};
                        for (const fId in allPosts) {
                            const posts = allPosts[fId] || [];
                            foundPost = posts.find(p => p.link === link);
                            if (foundPost) break;
                        }

                        if (foundPost && typeof window.openReaderModal === 'function') {
                            window.openReaderModal(foundPost);
                        } else if (typeof window.openReaderModal === 'function') {
                            window.openReaderModal({ link, title: title || link, content: '' });
                        }
                    } catch (e) {
                        console.error('[PureTidings Desktop] Error handling satellite_open_article:', e);
                    }
                });

                // 3. Open Feed
                window.__TAURI__.event.listen('satellite_open_feed', (event) => {
                    try {
                        const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
                        const { feedId } = payload || {};
                        if (feedId) {
                            const row = document.querySelector(`.feed-item-row[data-id="${feedId}"]`);
                            if (row) {
                                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                const toggle = row.querySelector('.tree-toggle');
                                if (toggle && toggle.textContent.includes('+')) {
                                    toggle.click();
                                }
                            }
                        }
                    } catch (e) {
                        console.error('[PureTidings Desktop] Error handling satellite_open_feed:', e);
                    }
                });

                // 4. Refresh Feeds
                window.__TAURI__.event.listen('satellite_refresh', (event) => {
                    try {
                        const payload = event.payload ? (typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload) : {};
                        const { feedId } = payload || {};
                        if (feedId) {
                            if (typeof window.refreshSingleFeedNative === 'function') {
                                window.refreshSingleFeedNative(feedId);
                            } else {
                                const singleBtn = document.querySelector(`.feed-single-refresh-btn[data-id="${feedId}"]`);
                                if (singleBtn) singleBtn.click();
                            }
                        } else {
                            if (typeof window.refreshAllFeedsNative === 'function') {
                                window.refreshAllFeedsNative();
                            } else {
                                const refreshBtn = document.getElementById('refresh-button') || document.getElementById('refresh-all-btn');
                                if (refreshBtn) refreshBtn.click();
                            }
                        }
                    } catch (e) {
                        console.error('[PureTidings Desktop] Error handling satellite_refresh:', e);
                    }
                });

                // 5. Add Feed
                window.__TAURI__.event.listen('satellite_add_feed', (event) => {
                    try {
                        const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
                        const { url, title, folderId } = payload || {};
                        if (url && typeof window.addNewFeedToTree === 'function') {
                            window.addNewFeedToTree(url, title, folderId);
                        }
                    } catch (e) {
                        console.error('[PureTidings Desktop] Error handling satellite_add_feed:', e);
                    }
                });

                // 6. Open Settings
                window.__TAURI__.event.listen('satellite_open_settings', () => {
                    try {
                        if (typeof window.openSettingsModal === 'function') {
                            window.openSettingsModal();
                            return;
                        }
                        const settingsBtn = document.getElementById('sidebar-settings-btn') || 
                                            document.getElementById('mobile-settings-btn') || 
                                            document.getElementById('settings-btn') || 
                                            document.getElementById('options-btn');
                        if (settingsBtn) {
                            settingsBtn.click();
                        } else {
                            const modal = document.getElementById('settings-modal');
                            if (modal) modal.style.display = 'block';
                        }
                    } catch (e) {
                        console.error('[PureTidings Desktop] Error handling satellite_open_settings:', e);
                    }
                });
            } catch (err) {
                console.warn('[PureTidings Desktop] Could not register satellite event listeners:', err);
            }
        }

        // Setup Settings Satellite UI handlers
        function initSatelliteSettingsUI() {
            const installBtn = document.getElementById('btn-install-satellite');
            const testBtn = document.getElementById('btn-test-satellite');
            const statusBadge = document.getElementById('satellite-status-badge');
            const guide = document.getElementById('satellite-install-guide');

            async function checkSatelliteStatus() {
                if (!statusBadge) return;
                try {
                    const res = await fetch('http://127.0.0.1:41789/api/status', { method: 'GET', cache: 'no-store' });
                    if (res.ok) {
                        const data = await res.json();
                        statusBadge.textContent = window.i18n ? window.i18n.t('settings_satellite_connected') : '🟢 Connected';
                        statusBadge.style.background = 'rgba(34, 197, 94, 0.2)';
                        statusBadge.style.color = '#22c55e';
                        return true;
                    }
                } catch (_) {}
                statusBadge.textContent = window.i18n ? window.i18n.t('settings_satellite_disconnected') : '⚪ Disconnected';
                statusBadge.style.background = 'rgba(148, 163, 184, 0.2)';
                statusBadge.style.color = 'var(--secondary-text-color)';
                return false;
            }

            if (testBtn) {
                testBtn.addEventListener('click', async () => {
                    testBtn.disabled = true;
                    testBtn.textContent = '⏳ Testing...';
                    await checkSatelliteStatus();
                    testBtn.disabled = false;
                    testBtn.innerHTML = `🔌 <span>${window.i18n ? window.i18n.t('settings_satellite_test_btn') : 'Test Connection'}</span>`;
                });
            }

            if (installBtn) {
                installBtn.addEventListener('click', async () => {
                    try {
                        // 1. Register deep link protocol
                        await tauriInvoke('register_deep_link_protocol').catch(() => {});

                        // 2. Prepare satellite extension in safe local folder and open Explorer
                        let satelliteFolder = '';
                        try {
                            satelliteFolder = await tauriInvoke('prepare_satellite_extension');
                        } catch (err) {
                            console.warn('[PureTidings Desktop] prepare_satellite_extension failed:', err);
                        }
                        if (!satelliteFolder) {
                            satelliteFolder = 'satellite-extension';
                        }

                        // 3. Copy to clipboard
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            await navigator.clipboard.writeText(satelliteFolder);
                        }

                        // 4. Silently launch browser extensions page without triggering Windows Store prompt
                        await tauriInvoke('open_browser_extensions_page').catch(() => {});

                        // 5. Show guidance box and update path display
                        if (guide) {
                            guide.style.display = 'block';
                            const pathDisplay = guide.querySelector('.satellite-path-display') || guide.querySelector('code');
                            if (pathDisplay) {
                                pathDisplay.textContent = satelliteFolder;
                            }
                        }

                        // Poll status
                        setTimeout(checkSatelliteStatus, 2000);
                        setTimeout(checkSatelliteStatus, 5000);
                    } catch (e) {
                        console.error('[PureTidings Desktop] Error preparing satellite installation:', e);
                    }
                });
            }

            // Check status when Settings opens
            const settingsBtn = document.getElementById('settings-btn') || document.getElementById('options-btn');
            if (settingsBtn) {
                settingsBtn.addEventListener('click', () => {
                    setTimeout(checkSatelliteStatus, 200);
                });
            }
            setTimeout(checkSatelliteStatus, 1500);
        }
        initSatelliteSettingsUI();

        // Note: Automatic feed fetch on startup is disabled per user preference.
        // Feeds are fetched only according to the user's background schedule or upon manual refresh (F5 / 🔄).
    });
})();
