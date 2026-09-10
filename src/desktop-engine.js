// PureTidings Desktop Engine - Native Tauri Adapter & Storage Shim
(function () {
    console.log("[PureTidings Desktop] Initializing Desktop Native Engine...");

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
        try {
            await tauriInvoke('open_browser', { url });
        } catch (e) {
            window.open(url, '_blank');
        }
    }
    window.tauriOpenBrowser = tauriOpenBrowser;

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
            themeBtn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
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

    function getLocalItem(key, fallback = null) {
        try {
            const val = localStorage.getItem('pt_local_' + key);
            return val !== null ? JSON.parse(val) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function setLocalItem(key, val) {
        try {
            localStorage.setItem('pt_local_' + key, JSON.stringify(val));
        } catch (e) {
            console.error("Storage error:", e);
        }
    }

    function getSyncItem(key, fallback = null) {
        try {
            const val = localStorage.getItem('pt_sync_' + key);
            return val !== null ? JSON.parse(val) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function setSyncItem(key, val) {
        try {
            localStorage.setItem('pt_sync_' + key, JSON.stringify(val));
        } catch (e) {
            console.error("Sync storage error:", e);
        }
    }

    // Seed defaults if fresh
    if (getLocalItem('feedTree') === null) {
        setLocalItem('feedTree', DEFAULT_FEED_TREE);
        setLocalItem('allPosts', {});
        setLocalItem('unreadCounts', {});
        setLocalItem('readLinks', []);
        setLocalItem('favoritedLinks', []);
        setLocalItem('summaryLinks', []);
        setSyncItem('darkMode', true);
        setSyncItem('rules', []);
        setSyncItem('checkInterval', 30);
        setSyncItem('randomizeFetch', false);
        setSyncItem('showNotification', true);
        setSyncItem('showSummaryNotification', false);
        setSyncItem('summaryInterval', 60);
        const defSchedule = {};
        for (let d = 0; d < 7; d++) defSchedule[d] = { active: true, from: '00:00', to: '23:59' };
        setSyncItem('fetchSchedule', defSchedule);
    }
    if (getSyncItem('checkInterval') === null) setSyncItem('checkInterval', 30);
    if (getSyncItem('showNotification') === null) setSyncItem('showNotification', true);
    if (getSyncItem('fetchSchedule') === null) {
        const defSchedule = {};
        for (let d = 0; d < 7; d++) defSchedule[d] = { active: true, from: '00:00', to: '23:59' };
        setSyncItem('fetchSchedule', defSchedule);
    }

    const storageListeners = [];

    window.chrome = {
        storage: {
            local: {
                get: function (keys) {
                    return new Promise((resolve) => {
                        const res = {};
                        const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
                        keyList.forEach(k => {
                            res[k] = getLocalItem(k);
                        });
                        resolve(res);
                    });
                },
                set: function (items) {
                    return new Promise((resolve) => {
                        const changes = {};
                        for (const k in items) {
                            const oldVal = getLocalItem(k);
                            setLocalItem(k, items[k]);
                            changes[k] = { oldValue: oldVal, newValue: items[k] };
                        }
                        storageListeners.forEach(fn => fn(changes, 'local'));
                        resolve();
                    });
                }
            },
            sync: {
                get: function (keys) {
                    return new Promise((resolve) => {
                        const res = {};
                        const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
                        keyList.forEach(k => {
                            res[k] = getSyncItem(k);
                        });
                        resolve(res);
                    });
                },
                set: function (items) {
                    return new Promise((resolve) => {
                        const changes = {};
                        for (const k in items) {
                            const oldVal = getSyncItem(k);
                            setSyncItem(k, items[k]);
                            changes[k] = { oldValue: oldVal, newValue: items[k] };
                            if (k === 'darkMode') {
                                applyDesktopTheme(items[k]);
                            }
                        }
                        storageListeners.forEach(fn => fn(changes, 'sync'));
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
                        const dataStr = await tauriInvoke('post_url', {
                            url: innerTubeUrl,
                            body,
                            userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)'
                        });
                        const data = JSON.parse(dataStr);
                        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                        if (tracks && tracks.length > 0) {
                            const track = tracks.find(t => t.languageCode === 'en' || t.languageCode === 'de') || tracks[0];
                            const transcriptXml = await tauriInvoke('fetch_url', { url: track.baseUrl });
                            return { status: 'ok', xml: transcriptXml };
                        }
                        return { status: 'error', message: 'No transcript tracks found.' };
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
                    openReaderModal({
                        url: params.get('url') || '',
                        title: params.get('title') || '',
                        description: params.get('description') || '',
                        videoLength: params.get('videoLength') || '',
                        featuredImage: params.get('featuredImage') || '',
                        source: params.get('source') || '',
                        feedId: params.get('feedId') || '',
                        fullContentHtmlText: params.get('fullContentHtmlText') || ''
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

    async function refreshAllFeedsNative() {
        const refreshBtn = document.getElementById('sidebar-refresh-btn');
        if (refreshBtn) refreshBtn.classList.add('spinning');

        const loading = document.getElementById('loading-spinner');
        if (loading) loading.classList.remove('hidden');

        try {
            const { feedTree = [], allPosts = {}, readLinks = [] } = await chrome.storage.local.get(['feedTree', 'allPosts', 'readLinks']);
            const { rules = [] } = await chrome.storage.sync.get(['rules']);
            const readLinksSet = new Set(readLinks || []);

            const feeds = [];
            let feedTreeUpdated = false;
            function gather(nodes) {
                for (const n of (nodes || [])) {
                    if (n.type === 'feed') {
                        if (n.url && n.url.includes('UCBJycsmduPZe6541G3gk22Q')) {
                            n.url = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCBJycsmduvYEL83R_U4JriQ';
                            feedTreeUpdated = true;
                        }
                        feeds.push(n);
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

            // Fetch feeds incrementally so posts appear immediately as each finishes
            await Promise.all(feeds.map(async (feed) => {
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
                            unreadCounts: { ...unreadCounts }
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
            }));

            // Final sync
            for (const feed of feeds) {
                if (unreadCounts[feed.id] === undefined) {
                    unreadCounts[feed.id] = 0;
                }
            }
            await chrome.storage.local.set({
                allPosts: newAllPosts,
                unreadCounts: unreadCounts
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
            const { feedTree = [], allPosts = {}, readLinks = [] } = await chrome.storage.local.get(['feedTree', 'allPosts', 'readLinks']);
            const { rules = [] } = await chrome.storage.sync.get(['rules']);
            const readLinksSet = new Set(readLinks || []);

            let targetFeed = null;
            function findFeed(nodes) {
                for (const n of (nodes || [])) {
                    if (n.type === 'feed' && n.id === targetFeedId) {
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
    async function callGeminiApi(apiKey, systemPrompt, userContent) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const body = JSON.stringify({
            contents: [
                {
                    parts: [
                        { text: `${systemPrompt}\n\nContent:\n${userContent.substring(0, 30000)}` }
                    ]
                }
            ]
        });
        const res = await tauriInvoke('post_url', { url, body, user_agent: null });
        const data = JSON.parse(res);
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No summary generated.";
    }

    // ==========================================
    // 7. Feed Discovery & Subscription (Question 4)
    // ==========================================
    async function discoverAndSubscribeFeed(inputUrl, targetFolderId = '') {
        let cleanUrl = inputUrl.trim();
        if (!cleanUrl) return null;
        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
            cleanUrl = 'https://' + cleanUrl;
        }

        let feedUrl = cleanUrl;
        let feedName = '';

        // Check if YouTube
        const ytChannelMatch = cleanUrl.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);
        const ytCustomMatch = cleanUrl.match(/youtube\.com\/@([a-zA-Z0-9_-]+)/);
        const ytVideoMatch = cleanUrl.match(/(?:v=|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);

        if (ytChannelMatch) {
            feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${ytChannelMatch[1]}`;
            feedName = `YouTube Channel`;
        } else if (ytCustomMatch || ytVideoMatch) {
            try {
                const pageHtml = await tauriInvoke('fetch_url', { url: cleanUrl });
                const rssMatch = pageHtml.match(/https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=([a-zA-Z0-9_-]+)/);
                if (rssMatch) {
                    feedUrl = rssMatch[0];
                }
                const titleMatch = pageHtml.match(/<title>([^<]+)<\/title>/i);
                if (titleMatch) feedName = titleMatch[1].replace(' - YouTube', '').trim();
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
                const titleEl = doc.querySelector('title');
                if (titleEl) feedName = titleEl.textContent.trim();
            } catch (e) {
                console.warn("HTML feed discovery error:", e);
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

        const { feedTree = [] } = await chrome.storage.local.get('feedTree');
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

        await chrome.storage.local.set({ feedTree });
        refreshAllFeedsNative();
        return { name: feedName, url: feedUrl };
    }
    window.discoverAndSubscribeFeed = discoverAndSubscribeFeed;

    // ==========================================
    // 8. AI URL Summarizer (Question 5)
    // ==========================================
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

        if (isYt && ytMatch) {
            const videoId = ytMatch[1];
            try {
                const res = await chrome.runtime.sendMessage({ action: 'fetchYoutubeTranscript', videoId });
                let transcriptText = "";
                if (res && res.xml) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(res.xml, "text/xml");
                    const texts = doc.getElementsByTagName("text");
                    for (let i = 0; i < texts.length; i++) {
                        transcriptText += texts[i].textContent + " ";
                    }
                }
                const { geminiApiKey, youtubeAiPrompt } = await chrome.storage.sync.get(['geminiApiKey', 'youtubeAiPrompt']);
                if (!geminiApiKey) {
                    alert("Please set your Google Gemini API Key in Settings first to generate AI summaries.");
                    return;
                }
                const prompt = youtubeAiPrompt || "Create a comprehensive and well-structured summary of this YouTube video with key takeaways and bullet points.";
                const aiResult = await callGeminiApi(geminiApiKey, prompt, transcriptText || "No transcript available for video " + cleanUrl);
                
                openReaderModal({
                    url: cleanUrl,
                    title: 'YouTube Video AI Summary',
                    description: `<div style="background:var(--hover-bg); padding:16px; border-radius:8px; margin-bottom:20px;"><h3 style="margin-top:0;">🤖 AI Video Summary</h3><div style="white-space:pre-wrap; line-height:1.6;">${escapeHTML(aiResult)}</div></div>`,
                    source: 'YouTube Video'
                });
            } catch (err) {
                alert("Failed to summarize video: " + err.message);
            }
        } else {
            // General Web Article
            try {
                const html = await tauriInvoke('fetch_url', { url: cleanUrl });
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, "text/html");
                const reader = new Readability(doc);
                const article = reader.parse();
                const contentText = article ? article.textContent : html.substring(0, 15000);
                const title = article ? article.title : cleanUrl;

                const { geminiApiKey, aiReportPrompt } = await chrome.storage.sync.get(['geminiApiKey', 'aiReportPrompt']);
                if (!geminiApiKey) {
                    alert("Please set your Google Gemini API Key in Settings first to generate AI summaries.");
                    return;
                }
                const prompt = aiReportPrompt || "Create a concise, insightful summary of this article highlighting the core facts and takeaways.";
                const aiResult = await callGeminiApi(geminiApiKey, prompt, contentText);

                openReaderModal({
                    url: cleanUrl,
                    title: title,
                    featuredImage: '',
                    description: `<div style="background:var(--hover-bg); padding:16px; border-radius:8px; margin-bottom:20px;"><h3 style="margin-top:0;">🤖 AI Article Summary</h3><div style="white-space:pre-wrap; line-height:1.6;">${escapeHTML(aiResult)}</div></div><hr><h3 style="margin-top:20px;">Full Article Content</h3>` + (article ? article.content : '<p>Original text extracted.</p>'),
                    source: new URL(cleanUrl).hostname
                });
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

    async function showDesktopNotification(title, message) {
        try {
            if ('Notification' in window) {
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

    async function scheduleNextSummaryNotification() {
        if (bgSummaryTimeout) clearTimeout(bgSummaryTimeout);

        const { showSummaryNotification = false, summaryInterval = 60 } = await chrome.storage.sync.get(['showSummaryNotification', 'summaryInterval']);
        if (!showSummaryNotification) return;

        const intervalMinutes = Math.max(1, parseInt(summaryInterval, 10) || 60);
        const ms = intervalMinutes * 60 * 1000;
        console.log(`[PureTidings Desktop] Next unread summary reminder in ${intervalMinutes} minute(s).`);

        bgSummaryTimeout = setTimeout(async () => {
            await runSummaryNotificationCycle();
            scheduleNextSummaryNotification();
        }, ms);
    }

    async function runSummaryNotificationCycle() {
        try {
            const { showSummaryNotification = false, fetchSchedule } = await chrome.storage.sync.get(['showSummaryNotification', 'fetchSchedule']);
            if (!showSummaryNotification) return;
            if (!isScheduleActiveNow(fetchSchedule)) return;

            const { allPosts = {}, readLinks = [] } = await chrome.storage.local.get(['allPosts', 'readLinks']);
            const readLinksSet = new Set(readLinks || []);
            const unread = Object.values(allPosts)
                .flat()
                .filter(p => p && p.link && !p.isHidden && !readLinksSet.has(p.link))
                .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

            if (unread.length === 0) return;

            const title = `Unread Summary: ${unread.length} article(s) waiting`;
            const topTitles = unread.slice(0, 3).map(p => `• ${p.title}`).join('\n');
            const body = unread.length > 3 ? `${topTitles}\n...and ${unread.length - 3} more.` : topTitles;

            showDesktopNotification(title, body);
            showInAppToast(title, body, true, 8000);
        } catch (err) {
            console.warn("[PureTidings Desktop] Error during summary notification cycle:", err);
        }
    }

    function startBackgroundScheduler() {
        scheduleNextBackgroundFetch();
        scheduleNextSummaryNotification();
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

    function openSettingsModal() {
        closeAllModals();
        const modal = document.getElementById('settings-modal');
        if (!modal) return;
        modal.style.display = 'block';

        // Restore custom modal dimensions & coordinates
        const modalCard = document.getElementById('settings-modal-card');
        if (modalCard) {
            let savedGeo = null;
            try {
                savedGeo = JSON.parse(localStorage.getItem('puretidings_settings_geometry') || localStorage.getItem('puretidings_settings_size') || 'null');
            } catch (_) {}

            const maxW = Math.max(320, window.innerWidth - 20);
            const maxH = Math.max(180, window.innerHeight - 20);
            let w = (savedGeo && savedGeo.width) ? Math.max(320, Math.min(savedGeo.width, maxW)) : Math.min(840, maxW);
            let h = (savedGeo && savedGeo.height) ? Math.max(180, Math.min(savedGeo.height, maxH)) : Math.min(680, maxH);
            let left = (savedGeo && savedGeo.left !== undefined) ? savedGeo.left : Math.round(Math.max(10, (window.innerWidth - w) / 2));
            let top = (savedGeo && savedGeo.top !== undefined) ? savedGeo.top : Math.round(Math.max(10, (window.innerHeight - h) / 2));

            // Keep inside screen bounds
            left = Math.max(0, Math.min(left, window.innerWidth - 80));
            top = Math.max(0, Math.min(top, window.innerHeight - 50));

            modalCard.style.width = w + 'px';
            modalCard.style.height = h + 'px';
            modalCard.style.left = left + 'px';
            modalCard.style.top = top + 'px';

            function saveSettingsGeometry() {
                if (!modalCard) return;
                const geo = {
                    left: Math.round(modalCard.offsetLeft),
                    top: Math.round(modalCard.offsetTop),
                    width: Math.round(modalCard.offsetWidth),
                    height: Math.round(modalCard.offsetHeight)
                };
                try {
                    localStorage.setItem('puretidings_settings_geometry', JSON.stringify(geo));
                    localStorage.setItem('puretidings_settings_size', JSON.stringify({ width: geo.width, height: geo.height }));
                } catch (_) {}
            }

            // Draggable by header
            const header = modalCard.querySelector('.settings-modal-header');
            if (header && !header._dragAttached) {
                header._dragAttached = true;
                header.style.cursor = 'move';
                header.style.userSelect = 'none';

                header.addEventListener('mousedown', (e) => {
                    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) return;
                    e.preventDefault();

                    const startX = e.clientX;
                    const startY = e.clientY;
                    const initialLeft = modalCard.offsetLeft;
                    const initialTop = modalCard.offsetTop;

                    function onDrag(ev) {
                        ev.preventDefault();
                        const dx = ev.clientX - startX;
                        const dy = ev.clientY - startY;
                        let nLeft = initialLeft + dx;
                        let nTop = initialTop + dy;

                        nLeft = Math.max(0, Math.min(nLeft, window.innerWidth - 80));
                        nTop = Math.max(0, Math.min(nTop, window.innerHeight - 50));

                        modalCard.style.left = nLeft + 'px';
                        modalCard.style.top = nTop + 'px';
                    }

                    function stopDrag() {
                        window.removeEventListener('mousemove', onDrag);
                        window.removeEventListener('mouseup', stopDrag);
                        saveSettingsGeometry();
                    }

                    window.addEventListener('mousemove', onDrag);
                    window.addEventListener('mouseup', stopDrag);
                });
            }

            // Custom resize grip handle
            const resizeHandle = modalCard.querySelector('.modal-resize-handle');
            if (resizeHandle && !resizeHandle._resizeAttached) {
                resizeHandle._resizeAttached = true;
                resizeHandle.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startW = modalCard.offsetWidth;
                    const startH = modalCard.offsetHeight;

                    function onGripResize(ev) {
                        ev.preventDefault();
                        const nW = Math.max(320, Math.min(startW + (ev.clientX - startX), window.innerWidth - modalCard.offsetLeft));
                        const nH = Math.max(180, Math.min(startH + (ev.clientY - startY), window.innerHeight - modalCard.offsetTop));
                        modalCard.style.width = nW + 'px';
                        modalCard.style.height = nH + 'px';
                    }

                    function stopGripResize() {
                        window.removeEventListener('mousemove', onGripResize);
                        window.removeEventListener('mouseup', stopGripResize);
                        saveSettingsGeometry();
                    }

                    window.addEventListener('mousemove', onGripResize);
                    window.addEventListener('mouseup', stopGripResize);
                });
            }

            // Attach ResizeObserver to remember resized size across app restarts
            if (window.ResizeObserver && !modalCard._resizeObserverAttached) {
                modalCard._resizeObserverAttached = true;
                let resizeTimer;
                const ro = new ResizeObserver(entries => {
                    for (let entry of entries) {
                        if (entry.contentRect && entry.contentRect.width > 240 && entry.contentRect.height > 140) {
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
    }

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
            summaryInterval = 60
        } = await chrome.storage.sync.get([
            'geminiApiKey', 'aiReportPrompt', 'youtubeAiPrompt', 'rules',
            'checkInterval', 'randomizeFetch', 'fetchSchedule',
            'showNotification', 'showSummaryNotification', 'summaryInterval'
        ]);

        const keyInput = document.getElementById('settings-gemini-key');
        if (keyInput) keyInput.value = geminiApiKey || '';
        const aiPromptInput = document.getElementById('settings-ai-prompt');
        if (aiPromptInput) aiPromptInput.value = aiReportPrompt || '';
        const ytPromptInput = document.getElementById('settings-yt-prompt');
        if (ytPromptInput) ytPromptInput.value = youtubeAiPrompt || '';

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

        renderDesktopScheduleTable(fetchSchedule);
        renderSettingsRules(rules);
        renderSettingsFeeds();
    }

    async function renderSettingsRules(rules) {
        const container = document.getElementById('settings-rules-list');
        if (!container) return;
        container.innerHTML = '';
        if (!rules || rules.length === 0) {
            container.innerHTML = '<p style="color: var(--text-color-darker); font-style: italic; margin: 5px 0;">No rules defined yet.</p>';
            return;
        }
        rules.forEach((rule, idx) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.padding = '6px 8px';
            row.style.marginBottom = '4px';
            row.style.background = 'var(--hover-bg)';
            row.style.borderRadius = '4px';
            row.innerHTML = `
                <span>IF <strong>${rule.field}</strong> ${rule.condition} <code>"${rule.value}"</code> &rarr; <em>${rule.action}</em></span>
                <button class="rule-del-btn" data-idx="${idx}" style="background:transparent; border:none; color:#d93025; cursor:pointer; font-weight:bold;">&times;</button>
            `;
            container.appendChild(row);
        });

        container.querySelectorAll('.rule-del-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const idx = parseInt(e.target.dataset.idx, 10);
                rules.splice(idx, 1);
                await chrome.storage.sync.set({ rules });
                renderSettingsRules(rules);
            });
        });
    }

    let editingNodeId = null;

    async function renderSettingsFeeds() {
        const list = document.getElementById('settings-feed-list');
        const folderSelect = document.getElementById('new-feed-folder');
        const quickFolderSelect = document.getElementById('quick-feed-folder-select');
        if (!list) return;

        const { feedTree = [] } = await chrome.storage.local.get('feedTree');
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

        function renderList(nodes, parentEl, level = 0, parentId = '') {
            nodes.forEach(node => {
                const li = document.createElement('li');
                li.className = 'feed-item-row';
                li.dataset.id = node.id;
                li.style.paddingLeft = `${level * 20 + 12}px`;

                const isFolder = node.type === 'folder';
                const isEditing = editingNodeId === node.id;

                if (isEditing) {
                    li.style.background = 'var(--hover-bg)';
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
                            <div>
                                <label style="font-size: 11px; font-weight: bold; color: var(--text-color-darker); display: block; margin-bottom: 2px;">Parent Folder:</label>
                                <select id="edit-node-folder-${node.id}" style="width: 100%; padding: 6px; box-sizing: border-box; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-color); color: var(--text-color);">
                                    <option value="">Root (No Folder)</option>
                                    ${folders.map(f => `<option value="${f.id}" ${parentId === f.id ? 'selected' : ''}>${escapeHTML(f.name)}</option>`).join('')}
                                </select>
                            </div>
                            ` : ''}
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
                            <button type="button" class="folder-refresh-btn feed-single-refresh-btn" data-id="${node.id}" title="Refresh all feeds in this folder">🔄</button>
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
                            <button type="button" class="feed-single-refresh-btn" data-id="${node.id}" title="Refresh this feed">🔄</button>
                            <button type="button" class="edit-btn" data-id="${node.id}">Edit</button>
                            <button type="button" class="delete-btn" data-id="${node.id}">Delete</button>
                        </div>
                    `;
                }
                parentEl.appendChild(li);

                if (node.children && node.children.length > 0) {
                    renderList(node.children, parentEl, level + 1, node.id);
                }
            });
        }

        renderList(feedTree, list, 0, '');

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
                        if (n.id === targetId) return { node: n, parentId: currentParent };
                        if (n.children) {
                            const found = findNodeAndParent(n.children, targetId, n.id);
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
                    function extractNode(nodes, targetId) {
                        for (let i = 0; i < nodes.length; i++) {
                            if (nodes[i].id === targetId) {
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
                                    if (n.id === fId && n.type === 'folder') {
                                        if (!n.children) n.children = [];
                                        n.children.push(item);
                                        return true;
                                    }
                                    if (n.children && insertIntoFolder(n.children, fId, item)) return true;
                                }
                                return false;
                            }
                            insertIntoFolder(feedTree, targetFolderId, extracted);
                        }
                    }
                }

                await chrome.storage.local.set({ feedTree });
                editingNodeId = null;
                renderSettingsFeeds();
                refreshSingleFeedNative(id);
            });
        });

        // Wire Delete buttons
        list.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                if (!confirm("Are you sure you want to remove this item?")) return;

                function removeNode(nodes) {
                    return nodes.filter(n => {
                        if (n.id === id) return false;
                        if (n.children) n.children = removeNode(n.children);
                        return true;
                    });
                }

                const updated = removeNode(feedTree);
                await chrome.storage.local.set({ feedTree: updated });
                renderSettingsFeeds();
            });
        });

        // Wire Single / Folder Refresh buttons in Settings
        list.querySelectorAll('.feed-single-refresh-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                btn.classList.add('spinning');
                try {
                    function findNode(nodes) {
                        for (const n of nodes) {
                            if (n.id === id) return n;
                            if (n.children) {
                                const f = findNode(n.children);
                                if (f) return f;
                            }
                        }
                        return null;
                    }
                    const node = findNode(feedTree);
                    if (node && node.type === 'folder') {
                        const feedIds = [];
                        function collect(n) {
                            if (n.type === 'feed') feedIds.push(n.id);
                            else if (n.children) n.children.forEach(collect);
                        }
                        collect(node);
                        await Promise.all(feedIds.map(fId => refreshSingleFeedNative(fId)));
                    } else {
                        await refreshSingleFeedNative(id);
                    }
                } finally {
                    btn.classList.remove('spinning');
                }
            });
        });
    }

    // Reader Mode Controller
    async function openReaderModal(data) {
        closeAllModals();
        const modal = document.getElementById('reader-modal');
        if (!modal) return;
        modal.style.display = 'flex';

        const titleEl = document.getElementById('reader-title');
        const bylineEl = document.getElementById('reader-byline');
        const bodyEl = document.getElementById('reader-article-body');
        const videoEl = document.getElementById('reader-video-info');
        const thumbEl = document.getElementById('reader-thumbnail');
        const loadingEl = document.getElementById('reader-loading');
        const contentEl = document.getElementById('reader-content');

        if (titleEl) titleEl.textContent = data.title || 'Untitled Article';
        if (bylineEl) {
            const metaParts = [];
            if (data.source) metaParts.push(escapeHTML(data.source));
            if (data.author) metaParts.push(escapeHTML(data.author));
            const prefix = metaParts.length > 0 ? metaParts.join(' | ') + ' | ' : '';
            if (data.url) {
                bylineEl.innerHTML = `${prefix}Link: <a href="#" id="reader-original-link" style="color:var(--accent-color, #1a73e8); text-decoration:underline; cursor:pointer;" title="Open original article in browser">${escapeHTML(data.url)}</a>`;
                const origLink = document.getElementById('reader-original-link');
                if (origLink) {
                    origLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        tauriOpenBrowser(data.url);
                    });
                }
            } else {
                bylineEl.textContent = prefix;
            }
        }
        
        if (thumbEl) {
            if (data.featuredImage) {
                thumbEl.src = data.featuredImage;
                thumbEl.classList.remove('hidden');
            } else {
                thumbEl.classList.add('hidden');
            }
        }

        // Check if YouTube
        if (videoEl) {
            const ytMatch = (data.url || '').match(/(?:v=|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (ytMatch) {
                videoEl.classList.remove('hidden');
                videoEl.innerHTML = `
                    <div style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:8px; margin:20px 0;">
                        <iframe src="https://www.youtube-nocookie.com/embed/${ytMatch[1]}" style="position:absolute; top:0; left:0; width:100%; height:100%; border:0;" allowfullscreen></iframe>
                    </div>
                `;
            } else {
                videoEl.classList.add('hidden');
                videoEl.innerHTML = '';
            }
        }

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
            if (data.fullContentHtmlText) {
                bodyEl.innerHTML = data.fullContentHtmlText;
                if (loadingEl) loadingEl.classList.add('hidden');
                if (contentEl) contentEl.classList.remove('hidden');
            } else if (data.description && (data.description.includes('🤖') || data.description.includes('<h3>'))) {
                bodyEl.innerHTML = data.description;
                if (loadingEl) loadingEl.classList.add('hidden');
                if (contentEl) contentEl.classList.remove('hidden');
            } else if (data.url && !data.url.includes('youtube.com')) {
                if (loadingEl) loadingEl.classList.remove('hidden');
                if (contentEl) contentEl.classList.add('hidden');
                try {
                    const html = await tauriInvoke('fetch_url', { url: data.url });
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, "text/html");
                    const reader = new Readability(doc);
                    const article = reader.parse();
                    bodyEl.innerHTML = article ? article.content : (data.description || '<p>Could not extract full text.</p>');
                } catch (e) {
                    bodyEl.innerHTML = data.description || '<p>Failed to load full article content.</p>';
                } finally {
                    if (loadingEl) loadingEl.classList.add('hidden');
                    if (contentEl) contentEl.classList.remove('hidden');
                }
            } else {
                bodyEl.innerHTML = data.description || '';
                if (loadingEl) loadingEl.classList.add('hidden');
                if (contentEl) contentEl.classList.remove('hidden');
            }
        }
    }

    function closeReaderModal() {
        const modal = document.getElementById('reader-modal');
        if (modal) modal.style.display = 'none';
        const videoEl = document.getElementById('reader-video-info');
        if (videoEl) videoEl.innerHTML = '';
    }

    window.openReaderModal = openReaderModal;
    window.closeReaderModal = closeReaderModal;

    // ==========================================
    // 10. DOM Initialization & Event Wiring
    // ==========================================
    document.addEventListener('DOMContentLoaded', () => {
        applyDesktopZoom(currentZoom);
        
        // Initialize Theme from sync
        const isDark = getSyncItem('darkMode', true);
        applyDesktopTheme(isDark);

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

        // Quick Add Feed button & modal
        const quickAddBtn = document.getElementById('btn-quick-add-feed');
        const quickAddModal = document.getElementById('quick-add-modal');
        const quickAddClose = document.getElementById('quick-add-modal-close');
        const quickAddSubmit = document.getElementById('quick-feed-submit-btn');
        const quickAddInput = document.getElementById('quick-feed-url-input');
        const quickAddStatus = document.getElementById('quick-feed-status');

        if (quickAddBtn && quickAddModal) {
            quickAddBtn.addEventListener('click', (e) => {
                e.preventDefault();
                closeAllModals();
                quickAddModal.style.display = 'flex';
                renderSettingsFeeds();
                if (quickAddInput) { quickAddInput.value = ''; quickAddInput.focus(); }
                if (quickAddStatus) quickAddStatus.textContent = '';
            });
        }

        if (quickAddClose) {
            quickAddClose.addEventListener('click', () => {
                if (quickAddModal) quickAddModal.style.display = 'none';
            });
        }

        if (quickAddSubmit) {
            quickAddSubmit.addEventListener('click', async () => {
                const val = quickAddInput?.value?.trim() || '';
                if (!val) return;
                const folderId = document.getElementById('quick-feed-folder-select')?.value || '';
                if (quickAddStatus) quickAddStatus.textContent = "Discovering feed and subscribing...";
                quickAddSubmit.disabled = true;
                try {
                    const res = await discoverAndSubscribeFeed(val, folderId);
                    if (res) {
                        if (quickAddStatus) quickAddStatus.textContent = `Subscribed to "${res.name}"!`;
                        setTimeout(() => {
                            if (quickAddModal) quickAddModal.style.display = 'none';
                            quickAddSubmit.disabled = false;
                        }, 1200);
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

        // Settings Save
        const saveSettingsBtn = document.getElementById('settings-save-btn');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', async () => {
                const key = document.getElementById('settings-gemini-key')?.value || '';
                const aiPrompt = document.getElementById('settings-ai-prompt')?.value || '';
                const ytPrompt = document.getElementById('settings-yt-prompt')?.value || '';

                const checkInterval = parseInt(document.getElementById('settings-check-interval')?.value, 10) || 0;
                const randomizeFetch = document.getElementById('settings-randomize-fetch')?.checked || false;
                const showNotification = document.getElementById('settings-show-notifications')?.checked ?? true;
                const showSummaryNotification = document.getElementById('settings-show-summary-notifications')?.checked || false;
                const summaryInterval = parseInt(document.getElementById('settings-summary-interval')?.value, 10) || 60;
                const fetchSchedule = collectScheduleFromTable();

                await chrome.storage.sync.set({
                    geminiApiKey: key.trim(),
                    aiReportPrompt: aiPrompt.trim(),
                    youtubeAiPrompt: ytPrompt.trim(),
                    checkInterval,
                    randomizeFetch,
                    showNotification,
                    showSummaryNotification,
                    summaryInterval,
                    fetchSchedule
                });

                // Re-arm background schedulers immediately with new config
                scheduleNextBackgroundFetch();
                scheduleNextSummaryNotification();

                closeSettingsModal();
                showInAppToast("Settings Saved", "Your automation schedules and preferences have been updated successfully!");
            });
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
                    alert("Please provide both feed name and URL.");
                    return;
                }

                const { feedTree = [] } = await chrome.storage.local.get('feedTree');
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

                await chrome.storage.local.set({ feedTree });
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

                const { feedTree = [] } = await chrome.storage.local.get('feedTree');
                feedTree.push({
                    id: 'folder-' + Date.now(),
                    name: name.trim(),
                    type: 'folder',
                    children: []
                });
                await chrome.storage.local.set({ feedTree });
                document.getElementById('new-folder-name').value = '';
                renderSettingsFeeds();
            });
        }

        // ==========================================
        // 10. Redesigned Backup, Restore & OPML Engine
        // ==========================================
        function escapeXml(str) {
            return (str || '').replace(/[<>&'"]/g, c => ({
                '<': '&lt;',
                '>': '&gt;',
                '&': '&amp;',
                "'": '&apos;',
                '"': '&quot;'
            })[c]);
        }

        // --- OPML Export ---
        const exportOpmlBtn = document.getElementById('btn-export-opml');
        if (exportOpmlBtn) {
            exportOpmlBtn.addEventListener('click', async () => {
                showStatusBadge('opml-status-box', 'loading', '⏳ Generating OPML file...', 0);
                try {
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

                    const blob = new Blob([opml], { type: 'text/xml' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `puretidings-feeds-${new Date().toISOString().split('T')[0]}.opml`;
                    a.click();
                    showStatusBadge('opml-status-box', 'success', `✓ Exported ${feedCount} feed(s) successfully!`);
                    showInAppToast('OPML Export', `Exported ${feedCount} feed(s) to OPML file.`);
                } catch (err) {
                    showStatusBadge('opml-status-box', 'error', `✗ Export failed: ${err.message}`);
                }
            });
        }

        // --- Dynamic File Picker Helpers (No HTML input elements needed) ---
        function openOpmlFilePicker() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.opml,.xml';
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
        }

        function openJsonFilePicker() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
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
        }

        // --- OPML Import & Dropzone ---
        const importOpmlBtn = document.getElementById('btn-import-opml');
        const dropzoneOpml = document.getElementById('dropzone-opml');

        if (importOpmlBtn) {
            importOpmlBtn.addEventListener('click', openOpmlFilePicker);
        }

        if (dropzoneOpml) {
            dropzoneOpml.addEventListener('click', openOpmlFilePicker);
            dropzoneOpml.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropzoneOpml.classList.add('dragover');
            });
            dropzoneOpml.addEventListener('dragleave', () => {
                dropzoneOpml.classList.remove('dragover');
            });
            dropzoneOpml.addEventListener('drop', (e) => {
                e.preventDefault();
                dropzoneOpml.classList.remove('dragover');
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    processOpmlFile(e.dataTransfer.files[0]);
                }
            });
        }

        async function processOpmlFile(file) {
            if (!file) return;
            showStatusBadge('opml-status-box', 'loading', `⏳ Reading and importing "${file.name}"...`, 0);
            try {
                const text = await file.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, "text/xml");
                const outlines = doc.querySelectorAll('outline[xmlUrl]');
                if (!outlines || outlines.length === 0) {
                    showStatusBadge('opml-status-box', 'error', `✗ No RSS feeds found in "${file.name}".`);
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

                await chrome.storage.local.set({ feedTree });
                showStatusBadge('opml-status-box', 'success', `✓ Successfully imported ${addedCount} feed(s) from "${file.name}"!`);
                showInAppToast('OPML Import', `Imported ${addedCount} feed(s) successfully!`);
                renderSettingsFeeds();
                refreshAllFeedsNative();
            } catch (err) {
                showStatusBadge('opml-status-box', 'error', `✗ Failed to import OPML: ${err.message}`);
            }
        }

        // --- JSON Full Backup Export ---
        const backupJsonBtn = document.getElementById('btn-backup-json');
        if (backupJsonBtn) {
            backupJsonBtn.addEventListener('click', async () => {
                showStatusBadge('backup-json-status-box', 'loading', '⏳ Generating full application backup...', 0);
                try {
                    const local = await chrome.storage.local.get(['feedTree', 'readLinks', 'favoritedLinks', 'summaryLinks']);
                    const sync = await chrome.storage.sync.get([
                        'rules', 'geminiApiKey', 'aiReportPrompt', 'youtubeAiPrompt',
                        'checkInterval', 'randomizeFetch', 'fetchSchedule',
                        'showNotification', 'showSummaryNotification', 'summaryInterval', 'darkMode'
                    ]);
                    const backup = {
                        version: "1.0",
                        app: "PureTidings Desktop",
                        date: new Date().toISOString(),
                        local,
                        sync
                    };
                    const feedCount = (local.feedTree || []).length;
                    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `puretidings-backup-${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                    showStatusBadge('backup-json-status-box', 'success', `✓ Full backup downloaded successfully (${feedCount} items)!`);
                    showInAppToast('Full Backup', `JSON backup created successfully.`);
                } catch (err) {
                    showStatusBadge('backup-json-status-box', 'error', `✗ Backup failed: ${err.message}`);
                }
            });
        }

        // --- JSON Restore & Dropzone ---
        const restoreJsonBtn = document.getElementById('btn-restore-json');
        const dropzoneJson = document.getElementById('dropzone-json');

        if (restoreJsonBtn) {
            restoreJsonBtn.addEventListener('click', openJsonFilePicker);
        }

        if (dropzoneJson) {
            dropzoneJson.addEventListener('click', openJsonFilePicker);
            dropzoneJson.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropzoneJson.classList.add('dragover');
            });
            dropzoneJson.addEventListener('dragleave', () => {
                dropzoneJson.classList.remove('dragover');
            });
            dropzoneJson.addEventListener('drop', (e) => {
                e.preventDefault();
                dropzoneJson.classList.remove('dragover');
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    processJsonFile(e.dataTransfer.files[0]);
                }
            });
        }

        async function processJsonFile(file) {
            if (!file) return;
            showStatusBadge('backup-json-status-box', 'loading', `⏳ Reading and restoring "${file.name}"...`, 0);
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (!data.local && !data.sync && !data.feeds && !data.feedTree) {
                    showStatusBadge('backup-json-status-box', 'error', `✗ Invalid backup file format.`);
                    return;
                }

                if (data.local) await chrome.storage.local.set(data.local);
                if (data.sync) await chrome.storage.sync.set(data.sync);

                // Chrome Extension backup format compatibility
                if (data.feedTree && !data.local) {
                    await chrome.storage.local.set({ feedTree: data.feedTree });
                }
                if (data.rules && !data.sync) {
                    await chrome.storage.sync.set({ rules: data.rules });
                }

                const feedCount = (data.local?.feedTree || data.feedTree || []).length;
                showStatusBadge('backup-json-status-box', 'success', `✓ Backup restored successfully (${feedCount} items)!`);
                showInAppToast('Restore Complete', 'Backup restored successfully!');

                loadSettingsValues();
                renderSettingsFeeds();
                refreshAllFeedsNative();
                scheduleNextBackgroundFetch();
                scheduleNextSummaryNotification();
            } catch (err) {
                showStatusBadge('backup-json-status-box', 'error', `✗ Failed to restore backup: ${err.message}`);
            }
        }

        // Start background automation engine
        startBackgroundScheduler();

        // Initial background fetch
        setTimeout(() => {
            refreshAllFeedsNative();
        }, 500);
    });
})();
