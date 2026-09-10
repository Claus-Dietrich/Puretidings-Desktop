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
                const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
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

            // Fetch feeds incrementally so posts appear immediately as each finishes
            await Promise.all(feeds.map(async (feed) => {
                try {
                    const xml = await tauriInvoke('fetch_url', { url: feed.url });
                    const posts = parseFeedXml(xml, feed);
                    if (posts && posts.length > 0) {
                        posts.forEach(p => {
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
    // 9. Modal Management (Settings, Reader, Quick Add, Summarize)
    // ==========================================
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
        modal.style.display = 'flex';
        loadSettingsValues();
    }

    function closeSettingsModal() {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.style.display = 'none';
    }

    window.openSettingsModal = openSettingsModal;
    window.closeSettingsModal = closeSettingsModal;

    async function loadSettingsValues() {
        const { geminiApiKey, aiReportPrompt, youtubeAiPrompt, rules = [] } = await chrome.storage.sync.get(['geminiApiKey', 'aiReportPrompt', 'youtubeAiPrompt', 'rules']);
        const keyInput = document.getElementById('settings-gemini-key');
        if (keyInput) keyInput.value = geminiApiKey || '';
        const aiPromptInput = document.getElementById('settings-ai-prompt');
        if (aiPromptInput) aiPromptInput.value = aiReportPrompt || '';
        const ytPromptInput = document.getElementById('settings-yt-prompt');
        if (ytPromptInput) ytPromptInput.value = youtubeAiPrompt || '';

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

        function renderList(nodes, parentEl, level = 0) {
            nodes.forEach(node => {
                const li = document.createElement('li');
                li.style.display = 'flex';
                li.style.justifyContent = 'space-between';
                li.style.alignItems = 'center';
                li.style.padding = '6px 10px';
                li.style.borderBottom = '1px solid var(--border-color)';
                li.style.paddingLeft = `${level * 20 + 10}px`;

                const isFolder = node.type === 'folder';
                li.innerHTML = `
                    <span>${isFolder ? '📁 ' : '📄 '}<strong>${node.name}</strong> ${node.url ? `<small style="color:var(--text-color-darker); margin-left:8px;">(${node.url})</small>` : ''}</span>
                    <button class="node-del-btn" data-id="${node.id}" style="background:transparent; border:none; color:#d93025; cursor:pointer; font-weight:bold; font-size:18px;">&times;</button>
                `;
                parentEl.appendChild(li);

                if (node.children && node.children.length > 0) {
                    renderList(node.children, parentEl, level + 1);
                }
            });
        }

        renderList(feedTree, list);

        list.querySelectorAll('.node-del-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
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
        if (bylineEl) bylineEl.textContent = `${data.source ? data.source + ' | ' : ''}${data.author ? data.author + ' | ' : ''}Link: ${data.url}`;
        
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
                await chrome.storage.sync.set({
                    geminiApiKey: key.trim(),
                    aiReportPrompt: aiPrompt.trim(),
                    youtubeAiPrompt: ytPrompt.trim()
                });
                closeSettingsModal();
                alert("Settings saved successfully!");
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
                refreshAllFeedsNative();
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

        // Backup / Export
        const exportOpmlBtn = document.getElementById('btn-export-opml');
        if (exportOpmlBtn) {
            exportOpmlBtn.addEventListener('click', async () => {
                const { feedTree = [] } = await chrome.storage.local.get('feedTree');
                let opml = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n<head><title>PureTidings Feeds</title></head>\n<body>\n`;
                function writeNodes(nodes) {
                    nodes.forEach(n => {
                        if (n.type === 'folder') {
                            opml += `  <outline text="${n.name}">\n`;
                            if (n.children) writeNodes(n.children);
                            opml += `  </outline>\n`;
                        } else if (n.type === 'feed') {
                            opml += `  <outline type="rss" text="${n.name}" title="${n.name}" xmlUrl="${n.url}" htmlUrl="${n.url}"/>\n`;
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
            });
        }

        const backupJsonBtn = document.getElementById('btn-backup-json');
        if (backupJsonBtn) {
            backupJsonBtn.addEventListener('click', async () => {
                const local = await chrome.storage.local.get(['feedTree', 'readLinks', 'favoritedLinks', 'summaryLinks']);
                const sync = await chrome.storage.sync.get(['rules', 'geminiApiKey', 'aiReportPrompt', 'youtubeAiPrompt']);
                const backup = {
                    version: "1.0",
                    date: new Date().toISOString(),
                    local,
                    sync
                };
                const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `puretidings-backup-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
            });
        }

        // Import OPML / JSON
        const opmlFileInput = document.getElementById('input-opml-file');
        if (opmlFileInput) {
            opmlFileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const text = await file.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, "text/xml");
                const outlines = doc.querySelectorAll('outline[xmlUrl]');
                const { feedTree = [] } = await chrome.storage.local.get('feedTree');
                
                outlines.forEach(o => {
                    const url = o.getAttribute('xmlUrl');
                    const name = o.getAttribute('title') || o.getAttribute('text') || url;
                    if (url) {
                        feedTree.push({
                            id: 'feed-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
                            name,
                            url,
                            type: 'feed',
                            fetchOgImage: true
                        });
                    }
                });

                await chrome.storage.local.set({ feedTree });
                alert(`Imported ${outlines.length} feeds successfully!`);
                renderSettingsFeeds();
                refreshAllFeedsNative();
            });
        }

        const jsonFileInput = document.getElementById('input-json-file');
        if (jsonFileInput) {
            jsonFileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    if (data.local) await chrome.storage.local.set(data.local);
                    if (data.sync) await chrome.storage.sync.set(data.sync);
                    alert("Backup restored successfully!");
                    renderSettingsFeeds();
                    refreshAllFeedsNative();
                } catch (err) {
                    alert("Failed to restore backup: " + err.message);
                }
            });
        }

        // Initial background fetch
        setTimeout(() => {
            refreshAllFeedsNative();
        }, 500);
    });
})();
