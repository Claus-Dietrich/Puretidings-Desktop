importScripts('satellite-bridge.js', 'feed-tree-utils.js', 'utils.js');

// --- Global Constants ---
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
const DEFAULT_CHECK_INTERVAL = 30;
const BADGE_COLOR_DEFAULT = '#0066CC'; // Blue
const BADGE_COLOR_NEW = '#D93025';     // Red
const FETCH_ALARM_NAME = 'fetchFeeds';
const SUMMARY_ALARM_NAME = 'unreadSummaryAlarm';
const AUTO_BACKUP_ALARM_NAME = 'autoBackupAlarm';
const SATELLITE_ALARM_NAME = 'satelliteSyncAlarm';

let lastKnownUnread = null;
async function syncBadgeFromDesktop() {
  try {
    const status = await SatelliteBridge.checkStatus(400);
    if (status.connected) {
      const count = status.totalUnread || 0;
      lastKnownUnread = count;
      const text = count > 0 ? String(count) : '';
      await chrome.action.setBadgeText({ text });
      await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
      await chrome.action.setTitle({ title: `PureTidings Desktop - Connected (${count} unread)` });
      await chrome.storage.local.set({ lastTotalUnreadCount: count });
      return true;
    } else {
      lastKnownUnread = null;
      await chrome.action.setTitle({ title: 'PureTidings Desktop - Offline (Click to open)' });
      return false;
    }
  } catch (_) {
    return false;
  }
}

async function updateSatelliteBadge() {
  return await syncBadgeFromDesktop();
}

let isSyncingFromCloud = false;

/**
 * Automatically synchronizes the feedTree with Supabase cloud.
 * Two-way sync based on timestamps (updated_at).
 */
async function checkAndSyncFromCloud(forceUpload = false) {
    try {
        const localData = await chrome.storage.local.get(['feedTree', 'feedTreeUpdatedAt', 'syncEmail', 'readLinks', 'favoritedLinks', 'summaryLinks']);
        if (!localData.syncEmail) {
            console.log("Sync: No sync email set. Skipping cloud sync check.");
            return;
        }

        const syncData = await chrome.storage.sync.get(['geminiApiKey', 'aiReportPrompt', 'youtubeAiPrompt', 'rules']);

        const SUPABASE_URL = 'https://lujvogyndoryofuffntr.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1anZvZ3luZG9yeW9mdWZmbnRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MzI3ODYsImV4cCI6MjA5NzAwODc4Nn0.UEEN01ZKzcdkbP5ktOm35UgWwYQbbwTkM4K0u9_b09w';
        
        console.log(`Sync: Checking cloud state for ${localData.syncEmail}...`);
        
        // Fetch current cloud state
        const response = await fetch(`${SUPABASE_URL}/rest/v1/user_settings?email=eq.${encodeURIComponent(localData.syncEmail)}`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        if (!response.ok) {
            console.error("Sync: Failed to fetch cloud settings:", await response.text());
            return;
        }

        const data = await response.json();
        if (!data || data.length === 0) {
            console.log("Sync: User not found in DB. Creating initial settings row...");
            const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_settings`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                    email: localData.syncEmail,
                    feed_tree: localData.feedTree || [],
                    read_links: localData.readLinks || [],
                    favorited_links: sanitizeLinksArray(localData.favoritedLinks),
                    summary_links: sanitizeLinksArray(localData.summaryLinks),
                    gemini_api_key: syncData.geminiApiKey || null,
                    gemini_ai_prompt: syncData.aiReportPrompt || null,
                    gemini_yt_prompt: syncData.youtubeAiPrompt || null,
                    rules: syncData.rules || [],
                    updated_at: new Date().toISOString()
                })
            });
            if (insertResponse.ok) {
                console.log("Sync: Successfully initialized cloud settings row.");
                await chrome.storage.local.set({ feedTreeUpdatedAt: new Date().toISOString() });
            } else {
                console.error("Sync: Failed to initialize cloud settings row:", await insertResponse.text());
            }
            return;
        }

        const cloudSettings = data[0];
        const cloudUpdatedAt = cloudSettings.updated_at ? new Date(cloudSettings.updated_at).getTime() : 0;
        const localUpdatedAt = localData.feedTreeUpdatedAt ? new Date(localData.feedTreeUpdatedAt).getTime() : 0;

        let rulesNeedsUpload = false;
        if ((cloudSettings.rules === null || cloudSettings.rules === undefined || cloudSettings.rules.length === 0) && (syncData.rules && syncData.rules.length > 0)) {
            rulesNeedsUpload = true;
            console.log("Sync: Cloud has no rules, but local extension has rules. Forcing upload...");
        }

        if (forceUpload || localUpdatedAt > cloudUpdatedAt || rulesNeedsUpload) {
            console.log("Sync: Local version is newer or rules need upload. Uploading to cloud...");
            const nowStr = new Date().toISOString();
            const patchResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_settings?email=eq.${encodeURIComponent(localData.syncEmail)}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    feed_tree: localData.feedTree || [],
                    read_links: localData.readLinks || [],
                    favorited_links: sanitizeLinksArray(localData.favoritedLinks),
                    summary_links: sanitizeLinksArray(localData.summaryLinks),
                    gemini_api_key: syncData.geminiApiKey || null,
                    gemini_ai_prompt: syncData.aiReportPrompt || null,
                    gemini_yt_prompt: syncData.youtubeAiPrompt || null,
                    rules: syncData.rules || [],
                    updated_at: nowStr
                })
            });
            if (patchResponse.ok) {
                console.log("Sync: Cloud updated successfully.");
                await chrome.storage.local.set({ feedTreeUpdatedAt: nowStr });
            } else {
                console.error("Sync: Cloud update failed:", await patchResponse.text());
            }
        } else if (cloudUpdatedAt > localUpdatedAt) {
            console.log("Sync: Cloud version is newer. Downloading to local...");
            isSyncingFromCloud = true;
            try {
                await chrome.storage.local.set({
                    feedTree: cloudSettings.feed_tree || [],
                    feedTreeUpdatedAt: cloudSettings.updated_at,
                    readLinks: cloudSettings.read_links || [],
                    favoritedLinks: sanitizeLinksArray(cloudSettings.favorited_links),
                    summaryLinks: sanitizeLinksArray(cloudSettings.summary_links)
                });
                
                // Sync to chrome.storage.sync to keep both sync engines in parity
                const syncTree = stripMetadataForSync('feedTree', cloudSettings.feed_tree || []);
                const syncUpdates = {
                    feedTree: syncTree,
                    favoritedLinks: sanitizeLinksArray(cloudSettings.favorited_links),
                    summaryLinks: sanitizeLinksArray(cloudSettings.summary_links)
                };
                
                if (cloudSettings.gemini_api_key !== undefined) syncUpdates.geminiApiKey = cloudSettings.gemini_api_key;
                if (cloudSettings.gemini_ai_prompt !== undefined) syncUpdates.aiReportPrompt = cloudSettings.gemini_ai_prompt;
                if (cloudSettings.gemini_yt_prompt !== undefined) syncUpdates.youtubeAiPrompt = cloudSettings.gemini_yt_prompt;
                if (cloudSettings.rules !== undefined) syncUpdates.rules = cloudSettings.rules || [];
                
                await chrome.storage.sync.set(syncUpdates);
                
                await recalculateUnreadCountsAndBadge(cloudSettings.read_links || []);
                console.log("Sync: Local storage and unread counters updated with cloud data.");
            } finally {
                setTimeout(() => { isSyncingFromCloud = false; }, 1000);
            }
        } else {
            console.log("Sync: Local and cloud versions are in sync.");
        }
    } catch (err) {
        console.error("Sync: Error in checkAndSyncFromCloud:", err);
    }
}

/**
 * Centralized saver that respects sync quotas and mirrors to local.
 * Efficiency: Only writes to sync if data has changed.
 */
async function safeSyncSet(key, data) {
    if (!data) return false;

    let finalData = data;
    if (key === 'favoritedLinks' || key === 'summaryLinks') {
        finalData = sanitizeLinksArray(data);
    }

    if (key === 'feedTree') {
        const nowStr = new Date().toISOString();
        await chrome.storage.local.set({ 
            feedTree: finalData,
            feedTreeUpdatedAt: nowStr
        });
        checkAndSyncFromCloud(true);
        return true;
    }

    const stripped = stripMetadataForSync(key, finalData);
    
    // Efficiency check: skip if identical to current sync data
    try {
        const currentSync = await chrome.storage.sync.get(key);
        if (JSON.stringify(currentSync[key]) === JSON.stringify(stripped)) {
            // Still mirror to local to ensure parity
            await chrome.storage.local.set({ [key]: finalData });
            return true;
        }
    } catch (e) {
        console.warn(`Error checking sync data for ${key}:`, e);
    }

    const quota = validateSyncQuota(key, stripped);
    
    // Store warning status for UI
    await chrome.storage.local.set({ [`quotaWarning_${key}`]: quota });
    
    if (quota.isFull) {
        console.warn(`Sync quota full for ${key}. Blocking write.`);
        return false;
    }
    
    await chrome.storage.sync.set({ [key]: stripped });
    // Mirror to local as fallback/cache (keep full data in local)
    await chrome.storage.local.set({ [key]: finalData });
    return true;
}

/**
 * Centralized initialization and migration logic.
 * Ensures we don't overwrite existing sync data on new installations.
 */
async function performInitialSyncMigration() {
    console.log('Safe-Sync: Checking for existing data...');
    
    // 1. Try to get current state from both areas
    let syncData = await chrome.storage.sync.get(['feedTree', 'isInitialized', 'favoritedLinks', 'summaryLinks', 'isMigratedToSyncV2']);
    let localData = await chrome.storage.local.get(['feedTree', 'favoritedLinks', 'summaryLinks']);

    // 2. DEFENSIVE: If it looks like a new install, wait and re-check to let Sync catch up
    if (!syncData.isInitialized && (!localData.feedTree || localData.feedTree.length === 0)) {
        console.log('Safe-Sync: Possible new install or slow sync. Waiting 5s...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        syncData = await chrome.storage.sync.get(['feedTree', 'isInitialized', 'favoritedLinks', 'summaryLinks', 'isMigratedToSyncV2']);
    }

    // --- SCENARIO A: Existing Sync data found (New device in existing group) ---
    if (syncData.isInitialized || (syncData.feedTree && syncData.feedTree.length > 0)) {
        console.log("Safe-Sync: Existing cloud data detected. Syncing to local...");
        
        // Only update local if it's actually empty or old
        if (!localData.feedTree || localData.feedTree.length === 0) {
            await chrome.storage.local.set({
                feedTree: syncData.feedTree || [],
                favoritedLinks: sanitizeLinksArray(syncData.favoritedLinks),
                summaryLinks: sanitizeLinksArray(syncData.summaryLinks)
            });
            console.log("Safe-Sync: Local cache populated from cloud.");
            // Initial fetch to populate full post data for the new device
            await fetchAllFeedsAndUpdate(true);
        }
    } 
    // --- SCENARIO B: No Sync data, but Local data exists (Upgrade from old version) ---
    else if (localData.feedTree && localData.feedTree.length > 0) {
        console.log("Safe-Sync: Local data found but cloud is empty. Migrating to cloud...");
        for (const key of ['feedTree', 'favoritedLinks', 'summaryLinks']) {
            if (localData[key]) {
                await safeSyncSet(key, localData[key]);
            }
        }
        await chrome.storage.sync.set({ isInitialized: true, isMigratedToSyncV2: true });
        console.log("Safe-Sync: Migration to cloud complete.");
    }
    // --- SCENARIO C: Truly fresh install (No data anywhere) ---
    else {
        console.log('Safe-Sync: Truly fresh install. Initializing defaults.');
        const defaultId = crypto.randomUUID();
        const defaultFeedTree = [{ id: defaultId, name: 'Pure Tidings', url: 'https://puretidings.com/feed/', type: 'feed' }];
        
        // Write settings to sync
        await chrome.storage.sync.set({
            isInitialized: true,
            isMigratedToSyncV2: true,
            activeFeedId: defaultId,
            checkInterval: DEFAULT_CHECK_INTERVAL,
            randomizeFetch: false,
            showNotification: true,
            rules: [],
            darkMode: true,
            showSummaryNotification: false,
            summaryInterval: 60
        });
        
        // Write data to both (via safeSyncSet)
        await safeSyncSet('feedTree', defaultFeedTree);
        await safeSyncSet('favoritedLinks', []);
        await safeSyncSet('summaryLinks', []);

        await chrome.storage.local.set({ 
            lastTotalUnreadCount: 0,
            lastNotificationMatchCount: 0, 
            allPosts: {}
        });
        
        await fetchAllFeedsAndUpdate(true);
        console.log("Safe-Sync: Defaults initialized.");
    }

    // Ensure V2 flag is set if we reached this point
    if (!syncData.isMigratedToSyncV2) {
        await chrome.storage.sync.set({ isMigratedToSyncV2: true });
    }
}

// Sync badge & status with Desktop periodically while worker is alive
setInterval(syncBadgeFromDesktop, 3500);

try {
  chrome.tabs.onActivated.addListener(() => { syncBadgeFromDesktop(); });
  chrome.windows.onFocusChanged.addListener(() => { syncBadgeFromDesktop(); });
} catch (_) {}

// --- Icon Animation ---
let animationInterval = null;
let animationFrames = [];
let isAnimating = false;
const ANIMATION_FRAME_RATE = 120; // ms
const ICON_SIZE = 128;

async function generateAnimationFrames() {
  // Prevent regeneration
  if (animationFrames.length > 0) return;
  
  console.log("Attempting to generate animation frames...");
  try {
    const response = await fetch('/128.png');
    if (!response.ok) {
      throw new Error(`Failed to fetch base icon: ${response.statusText}`);
    }
    const blob = await response.blob();
    const img = await createImageBitmap(blob);

    const angles = [45, 90, 135, 180, 225, 270, 315, 360];
    const frames = [];
    for (const angle of angles) {
      const canvas = new OffscreenCanvas(ICON_SIZE, ICON_SIZE);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
      ctx.translate(ICON_SIZE / 2, ICON_SIZE / 2);
      ctx.rotate(angle * Math.PI / 180);
      ctx.drawImage(img, -ICON_SIZE / 2, -ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
      frames.push(ctx.getImageData(0, 0, ICON_SIZE, ICON_SIZE));
    }
    
    animationFrames = frames; // Assign only on complete success
    console.log(`Successfully generated ${animationFrames.length} animation frames.`);
    
  } catch (error) {
    console.error("CRITICAL: Failed to generate animation frames.", error);
    animationFrames = []; // Ensure frames array is empty on failure
  }
}

async function startIconAnimation() {
  if (isAnimating) {
    console.log("Animation already in progress. Skipping start.");
    return;
  }
  if (animationFrames.length === 0) {
    console.log("Frames not generated yet, generating now before starting animation...");
    await generateAnimationFrames();
    if (animationFrames.length === 0) {
      console.warn("Cannot start animation: No frames have been generated.");
      return;
    }
  }

  console.log("Starting icon animation...");
  isAnimating = true;
  chrome.action.setTitle({ title: "Checking feeds..." }); // Set tooltip here
  let frame = 0;
  animationInterval = setInterval(() => {
    if (animationFrames.length === 0) {
      stopIconAnimation();
      return;
    }
    chrome.action.setIcon({ imageData: animationFrames[frame] });
    frame = (frame + 1) % animationFrames.length;
  }, ANIMATION_FRAME_RATE);
}
function stopIconAnimation() {
  if (!isAnimating) return;
  
  console.log("Stopping icon animation.");
  clearInterval(animationInterval);
  animationInterval = null;
  isAnimating = false;
  // Reset to the default static icon
  chrome.action.setIcon({ path: '/128.png' });
  updateTooltipCountdown(); // Update tooltip to show countdown again
}


// --- Service Worker Lifecycle ---

async function setupNetworkRules() {
  if (chrome.declarativeNetRequest) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1, 2], // Remove existing rules
      addRules: [
        {
          id: 1,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              { header: "Origin", operation: "remove" },
              { header: "Sec-Fetch-Site", operation: "remove" },
              { header: "Sec-Fetch-Mode", operation: "remove" },
              { header: "Sec-Fetch-Dest", operation: "remove" }
            ]
          },
          condition: {
            urlFilter: "youtubei/v1/player"
          }
        },
        {
          id: 2,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              { header: "Origin", operation: "remove" },
              { header: "Sec-Fetch-Site", operation: "remove" },
              { header: "Sec-Fetch-Mode", operation: "remove" },
              { header: "Sec-Fetch-Dest", operation: "remove" }
            ]
          },
          condition: {
            urlFilter: "api/timedtext"
          }
        }
      ]
    });
    console.log("Network rules updated to strip Origin and Sec-Fetch headers for YouTube API.");
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await setupNetworkRules();
  
  // One-time migration to set fetchOgImage to true for all existing feeds
  try {
    const data = await chrome.storage.local.get(['feedTree', 'feedTreeMigratedOgImage']);
    if (data.feedTree && !data.feedTreeMigratedOgImage) {
      console.log("Migration: Migrating feedTree to set fetchOgImage=true for all existing feeds...");
      const migrateNodes = (nodes) => {
        nodes.forEach(node => {
          if (node.type === 'feed') {
            node.fetchOgImage = true;
          } else if (node.type === 'folder' && node.children) {
            migrateNodes(node.children);
          }
        });
      };
      migrateNodes(data.feedTree);
      await chrome.storage.local.set({ 
        feedTree: data.feedTree,
        feedTreeMigratedOgImage: true 
      });
      await safeSyncSet('feedTree', data.feedTree);
    }
  } catch (migErr) {
    console.error("Migration feedTree failed:", migErr);
  }
  
  if (details.reason === 'install') {
    // NEW CENTRALIZED LOGIC: 
    // This function handles waiting for sync data and ONLY sets defaults 
    // if absolutely no existing data is found in cloud or local.
    await performInitialSyncMigration();
  }
  
async function cleanupLegacyAlarms() {
  try {
    await chrome.alarms.clear(FETCH_ALARM_NAME);
    await chrome.alarms.clear(SUMMARY_ALARM_NAME);
    await chrome.alarms.clear(AUTO_BACKUP_ALARM_NAME);
  } catch (_) {}
}

  await cleanupLegacyAlarms();
  await generateAnimationFrames();
  await syncBadgeFromDesktop();
  chrome.alarms.create(SATELLITE_ALARM_NAME, { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(async () => {
  await cleanupLegacyAlarms();
  await generateAnimationFrames();
  await syncBadgeFromDesktop();
  chrome.alarms.create(SATELLITE_ALARM_NAME, { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SATELLITE_ALARM_NAME) {
    await syncBadgeFromDesktop();
    try {
      const fresh = await SatelliteBridge.fetchData();
      if (fresh) {
        await chrome.storage.local.set({
          feedTree: fresh.feedTree || [],
          allPosts: fresh.allPosts || {},
          readLinks: fresh.readLinks || [],
          unreadCounts: fresh.unreadCounts || {}
        });
      }
    } catch (_) {}
    return;
  }
});

// --- Message Listener ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const actions = {
    "forceFetch": async () => {
      startIconAnimation();
      let desktop = await SatelliteBridge.checkStatus(400);
      if (!desktop.connected) {
        SatelliteBridge.launchDesktop();
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 450));
          desktop = await SatelliteBridge.checkStatus(300);
          if (desktop.connected) break;
        }
      }
      if (desktop.connected) {
        await SatelliteBridge.refresh(null);
        for (let i = 0; i < 8; i++) {
          await new Promise(r => setTimeout(r, 500));
          const fresh = await SatelliteBridge.fetchData();
          if (fresh) {
            await chrome.storage.local.set({
              feedTree: fresh.feedTree || [],
              allPosts: fresh.allPosts || {},
              readLinks: fresh.readLinks || [],
              unreadCounts: fresh.unreadCounts || {}
            });
            break;
          }
        }
      }
      await syncBadgeFromDesktop();
      stopIconAnimation();
      return { status: 'ok' };
    },
    "forceFetchSingle": async () => {
      startIconAnimation();
      let desktop = await SatelliteBridge.checkStatus(400);
      if (!desktop.connected) {
        SatelliteBridge.launchDesktop();
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 450));
          desktop = await SatelliteBridge.checkStatus(300);
          if (desktop.connected) break;
        }
      }
      if (desktop.connected) {
        await SatelliteBridge.refresh(request.feedId);
        for (let i = 0; i < 8; i++) {
          await new Promise(r => setTimeout(r, 450));
          const fresh = await SatelliteBridge.fetchData();
          if (fresh && fresh.allPosts && fresh.allPosts[request.feedId] && fresh.allPosts[request.feedId].length > 0) {
            await chrome.storage.local.set({
              feedTree: fresh.feedTree || [],
              allPosts: fresh.allPosts || {},
              readLinks: fresh.readLinks || [],
              unreadCounts: fresh.unreadCounts || {},
              posts: fresh.allPosts[request.feedId]
            });
            break;
          }
        }
      }
      await syncBadgeFromDesktop();
      stopIconAnimation();
      return { status: 'ok' };
    },
    "updateAlarm": async () => {
      return { status: 'ok' };
    },
    "updateSummaryAlarm": async () => {
      return { status: 'ok' };
    },
    "updateAutoBackupAlarm": async () => {
      return { status: 'ok' };
    },
    "safeStorageSet": async () => {
      const success = await safeSyncSet(request.key, request.data);
      return { status: 'ok', success };
    },
    "triggerCloudSync": async () => {
      return { status: 'ok' };
    },
    "scanCurrentPage": async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
          return { status: 'error', message: 'No active tab found to scan.' };
        }
        
        if (!tab.url || 
            tab.url.startsWith('chrome://') || 
            tab.url.startsWith('chrome-extension://') || 
            tab.url.startsWith('edge://') ||
            tab.url.startsWith('about:') ||
            tab.url.startsWith('view-source:') ||
            tab.url.includes('chrome.google.com/webstore')) {
          return { status: 'error', message: 'Cannot scan this type of page.' };
        }

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: scanPageForFeeds,
        });
        
        let foundFeeds = results[0].result || [];
        
        // --- NEW: Resolve and deduplicate in background ---
        const resolvedFeeds = [];
        const processedUrls = new Set();

        for (const feed of foundFeeds) {
          let finalUrl = feed.url;
          // Resolve YouTube handles to RSS URLs immediately to detect duplicates correctly
          const channelId = await getYouTubeChannelIdFromUrl(feed.url);
          if (channelId) {
            finalUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
          }

          if (!processedUrls.has(finalUrl)) {
            processedUrls.add(finalUrl);
            resolvedFeeds.push({
              ...feed,
              url: finalUrl, // Use the resolved RSS URL
              originalUrl: feed.url // Keep for reference if needed
            });
          }
        }

        return { status: 'ok', data: resolvedFeeds };
      } catch (error) {
        return { status: 'error', message: error.message };
      }
    },
    "addFeed": async () => {
      if (!hasFeedHints(request.feed.url)) {
        return { status: 'error', message: 'URL does not contain feed hints.' };
      }
      
      let finalUrl = request.feed.url;
      let feedName = request.feed.name;

      // Resolve YouTube URLs to RSS URLs
      const channelId = await getYouTubeChannelIdFromUrl(request.feed.url);
      if (channelId) {
        finalUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        try {
          feedName = await getYouTubeChannelName(channelId);
        } catch (e) {
          console.warn("Could not resolve YouTube channel name, using provided name.");
        }
      }

      const { feedTree = [] } = await chrome.storage.local.get('feedTree');
      
      const allFeeds = [];
      function collectFeeds(nodes) {
        nodes.forEach(node => {
          if (node.type === 'feed') {
            allFeeds.push(node);
          } else if (node.type === 'folder' && node.children) {
            collectFeeds(node.children);
          }
        });
      }
      collectFeeds(feedTree);
      const allUrls = new Set(allFeeds.map(f => f.url));

      if (allUrls.has(finalUrl)) {
        return { status: 'error', message: 'This feed is already in your list.' };
      }

      const newFeed = { 
        id: crypto.randomUUID(), 
        name: feedName, 
        url: finalUrl, 
        type: 'feed', 
        fetchOgImage: true 
      };

      feedTree.push(newFeed);
      await safeSyncSet('feedTree', feedTree);
      if (feedTree.length === 1) {
        await chrome.storage.sync.set({ activeFeedId: newFeed.id });
      }

      // Sync new feed to PureTidings Desktop App
      SatelliteBridge.addFeed(finalUrl, feedName).catch(() => {});

      await fetchAllFeedsAndUpdate(true, newFeed.id); // Force fetch for ONLY the newly added feed
      return { status: 'ok' };
    },
    "fetchYoutubeTranscript": async () => {
      const innerTubeUrl = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
      const body = {
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '20.10.38'
          }
        },
        videoId: request.videoId
      };
      try {
        const response = await fetch(innerTubeUrl, {
          method: 'POST',
          credentials: 'omit',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)'
          },
          body: JSON.stringify(body)
        });
        
        const data = await response.json();
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        
        if (tracks && tracks.length > 0) {
            let track = tracks.find(t => t.languageCode === 'en' || t.languageCode === 'de') || tracks[0];
            const tRes = await fetch(track.baseUrl, {
                credentials: 'omit',
                headers: { 'Accept-Language': track.languageCode }
            });
            const transcriptXml = await tRes.text();
            return { status: 'ok', xml: transcriptXml };
        } else {
            return { status: 'error', message: 'No transcript tracks found for this video.' };
        }
      } catch (err) {
        return { status: 'error', message: err.toString() };
      }
    },
    "fetchArticle": async () => {
      const response = await fetch(request.url, { cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Authentication required (Status: ${response.status}). This content might be private or require a login.`);
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      let htmlString;
      try {
        htmlString = new TextDecoder('UTF-8', { fatal: true }).decode(buffer);
      } catch (e) {
        htmlString = new TextDecoder('ISO-8859-1').decode(buffer);
      }
      return { status: 'ok', html: htmlString };
    },
    "doMarkAllAsRead": async () => {
      const { allPosts = {}, readLinks = [], unreadArticleUrls = {} } = await chrome.storage.local.get(['allPosts', 'readLinks', 'unreadArticleUrls']);
      let linksToMark = [];
      const updatedUnread = { ...unreadArticleUrls };

      if (request.feedId) {
        // Mark only posts from a specific feed as read
        const feedPosts = allPosts[request.feedId] || [];
        linksToMark = feedPosts.map(post => post.link).filter(Boolean);
        
        // Merge with existing read links
        const readSet = new Set(readLinks);
        linksToMark.forEach(link => {
          readSet.add(link);
          delete updatedUnread[link];
        });
        await chrome.storage.local.set({ 
          readLinks: Array.from(readSet),
          unreadArticleUrls: updatedUnread
        });
        SatelliteBridge.markFeedRead(request.feedId).catch(() => {});
      } else {
        // Global bulk action: Mark everything as read
        linksToMark = Object.values(allPosts).flat().map(post => post.link).filter(Boolean);
        await chrome.storage.local.set({ 
          readLinks: linksToMark,
          unreadArticleUrls: {}
        });
        SatelliteBridge.markAllRead().catch(() => {});
      }
      
      await recalculateUnreadCountsAndBadge();
      return { status: 'ok', message: request.feedId ? 'Feed marked as read.' : 'All posts marked as read.' };
    },
    "doMarkAllAsUnread": async () => {
      const now = Date.now();
      if (request.feedId) {
        // Unmark only posts from a specific feed
        const { allPosts = {}, readLinks = [], unreadArticleUrls = {} } = await chrome.storage.local.get(['allPosts', 'readLinks', 'unreadArticleUrls']);
        const feedPosts = allPosts[request.feedId] || [];
        const feedLinksSet = new Set(feedPosts.map(post => post.link).filter(Boolean));
        const updatedUnread = { ...unreadArticleUrls };
        feedLinksSet.forEach(link => { updatedUnread[link] = now; });
        
        const newReadLinks = readLinks.filter(link => !feedLinksSet.has(link));
        await chrome.storage.local.set({ 
          readLinks: newReadLinks,
          unreadArticleUrls: updatedUnread
        });
        SatelliteBridge.markFeedUnread(request.feedId).catch(() => {});
      } else {
        // Global bulk action: Clear all read links
        const { allPosts = {} } = await chrome.storage.local.get('allPosts');
        const allLinks = Object.values(allPosts).flat().map(post => post.link).filter(Boolean);
        const updatedUnread = {};
        allLinks.forEach(link => { updatedUnread[link] = now; });
        await chrome.storage.local.set({ 
          readLinks: [],
          unreadArticleUrls: updatedUnread
        });
        SatelliteBridge.markAllUnread().catch(() => {});
      }
      
      await recalculateUnreadCountsAndBadge();
      return { status: 'ok', message: request.feedId ? 'Feed marked as unread.' : 'All posts marked as unread.' };
    },
    "markAsRead": async () => {
      const { readLinks = [], unreadArticleUrls = {} } = await chrome.storage.local.get(['readLinks', 'unreadArticleUrls']);
      if (!readLinks.includes(request.link)) {
        readLinks.push(request.link);
        const updatedUnread = { ...unreadArticleUrls };
        delete updatedUnread[request.link];
        await chrome.storage.local.set({ 
          readLinks,
          unreadArticleUrls: updatedUnread
        });
        SatelliteBridge.markRead(request.link, true, request.feedId || null).catch(() => {});
        await recalculateUnreadCountsAndBadge();
      }
      return { status: 'ok' };
    },
    "refetchOgImages": async () => {
      console.log(`Starting OG image refetch for feed: ${request.feedId}`);
      const { allPosts = {} } = await chrome.storage.local.get('allPosts');
      const postsForFeed = allPosts[request.feedId];

      if (!postsForFeed || postsForFeed.length === 0) {
        console.log("No posts found for this feed to refetch images.");
        return { status: 'ok' };
      }

      let updated = false;
      const promises = postsForFeed.map(async (post) => {
        if (!post.featuredImage && post.link) {
          const imageUrl = await findOgImage(post.link);
          if (imageUrl) {
            post.featuredImage = imageUrl;
            updated = true;
          }
        }
        return post;
      });

      allPosts[request.feedId] = await Promise.all(promises);

      if (updated) {
        console.log("Found new OG images, updating storage.");
        const { activeFeedId } = await chrome.storage.sync.get('activeFeedId');
        const updates = { allPosts };
        if (request.feedId === activeFeedId) {
          updates.posts = allPosts[request.feedId];
        }
        await chrome.storage.local.set(updates);
        // Recalculate counts as images don't affect unread status but we want to ensure consistency
        await recalculateUnreadCountsAndBadge(); 
      } else {
        console.log("No new OG images found during refetch.");
      }

      return { status: 'ok', updated: updated };
    }
  };

  if (request.action in actions) {
    (async () => {
      try {
        const response = await actions[request.action]();
        sendResponse(response);
      } catch (error) {
        console.error(`Error in action "${request.action}":`, error);
        sendResponse({ status: 'error', message: error.message });
      }
    })();
    return true; // Indicates asynchronous response
  }
});

// --- Storage Change Listener (Sync to Local) ---

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local') {
    if (isSyncingFromCloud) return;

    const keysToSync = ['feedTree', 'readLinks', 'favoritedLinks', 'summaryLinks'];
    let localChanged = false;
    for (const key of keysToSync) {
      if (changes[key] && JSON.stringify(changes[key].oldValue) !== JSON.stringify(changes[key].newValue)) {
        localChanged = true;
      }
    }
    if (localChanged) {
      console.log("Sync: Local syncable data changed. Triggering upload sync...");
      const nowStr = new Date().toISOString();
      await chrome.storage.local.set({ feedTreeUpdatedAt: nowStr });
      checkAndSyncFromCloud(true);
    }
  }

  if (area === 'sync') {
    // Check if Gemini API key or prompts changed in sync storage
    const settingsKeys = ['geminiApiKey', 'aiReportPrompt', 'youtubeAiPrompt'];
    let settingsChanged = false;
    for (const key of settingsKeys) {
      if (changes[key] && changes[key].oldValue !== changes[key].newValue) {
        settingsChanged = true;
      }
    }
    if (settingsChanged) {
      console.log("Sync: Gemini settings changed. Triggering upload sync...");
      const nowStr = new Date().toISOString();
      chrome.storage.local.set({ feedTreeUpdatedAt: nowStr }).then(() => {
        checkAndSyncFromCloud(true);
      });
    }

    const syncKeys = ['feedTree', 'favoritedLinks', 'summaryLinks'];
    let needsLocalUpdate = false;
    const updates = {};

    for (const key of syncKeys) {
      if (changes[key]) {
        const newValue = changes[key].newValue;
        const currentLocal = (await chrome.storage.local.get(key))[key];
        
        // Check if sync change came from remote (i.e. local is different from sync)
        // We use stripMetadataForSync to compare fairly
        const localStripped = stripMetadataForSync(key, currentLocal);
        if (JSON.stringify(localStripped) !== JSON.stringify(newValue)) {
          console.log(`Remote sync change detected for ${key}. Updating local cache.`);
          updates[key] = newValue; // Note: This will be the stripped version, full data will be restored on next fetch
          needsLocalUpdate = true;
        }
      }
    }

    if (needsLocalUpdate) {
      await chrome.storage.local.set(updates);
      // Removed: fetchAllFeedsAndUpdate(false) 
      // Reasons: 
      // 1. UI actions (Add/Edit) already trigger targeted refreshes.
      // 2. Drag & Drop or Name changes don't require a re-fetch.
      // 3. Global refreshes cause rate limiting/bans.
    }
  }
});


// --- NEW: Lightweight State Update Helper ---
async function recalculateUnreadCountsAndBadge(explicitReadLinks = null) {
  const { allPosts = {} } = await chrome.storage.local.get('allPosts');
  const readLinks = explicitReadLinks || (await chrome.storage.local.get('readLinks')).readLinks || [];
  const { lastTotalUnreadCount: oldTotal } = await chrome.storage.local.get('lastTotalUnreadCount');
  const readLinksSet = new Set(readLinks);
  
  let newTotalUnreadCount = 0;
  let newNotificationMatchCount = 0;
  const individualUnreadCounts = {};

  for (const feedId in allPosts) {
    let feedUnreadCount = 0;
    const posts = allPosts[feedId];
    if (posts && Array.isArray(posts)) {
      posts.forEach(post => {
        if (!post.isHidden && !readLinksSet.has(post.link)) {
          feedUnreadCount++;
          if (post.matchedRules && post.matchedRules.length > 0) {
            newNotificationMatchCount++;
          }
        }
      });
    }
    individualUnreadCounts[feedId] = feedUnreadCount;
    newTotalUnreadCount += feedUnreadCount;
  }

  await chrome.storage.local.set({
    unreadCounts: individualUnreadCounts,
    lastTotalUnreadCount: newTotalUnreadCount,
    lastNotificationMatchCount: newNotificationMatchCount
  });

  await updateBadge(newTotalUnreadCount, oldTotal || 0);
}


// --- Injected function ---
function scanPageForFeeds() {
  const feeds = [];
  const selectors = [
    'link[rel="alternate"][type="application/rss+xml"]',
    'link[rel="alternate"][type="application/atom+xml"]'
  ];
  
  function hasFeedHints(url) {
    if (!url || typeof url !== 'string') return false;
    const isYouTubeChannel = /youtube\.com\/(channel\/|user\/|c\/|@)/i.test(url);
    if (isYouTubeChannel) return true;
    const regex = /(^|[\/\.\?\=\&\-\_])(rss|atom|feed|xml)s?([\/\.\?\=\&\-\_]|$)/i;
    return regex.test(url);
  }

  document.querySelectorAll(selectors.join(', ')).forEach(link => {
    if (link.href && hasFeedHints(link.href)) {
      let title = link.title || link.href;
      // Improve title for YouTube RSS links
      if (link.href.includes('youtube.com/feeds/videos.xml')) {
        title = "YouTube Video Feed";
      }
      feeds.push({ title: title, url: link.href });
    }
  });

  const currentUrl = window.location.href;
  const alreadyFound = feeds.some(f => f.url === currentUrl);
  
  // Only include fallback if it's not already found and not a redundant YouTube page
  if (!alreadyFound && hasFeedHints(currentUrl)) {
    const isYouTubePage = currentUrl.includes('youtube.com');
    const alreadyFoundYouTube = feeds.some(f => f.url.includes('youtube.com/feeds/videos.xml'));
    
    // On YouTube, only show fallback if no RSS link was found in the head
    if (!(isYouTubePage && alreadyFoundYouTube)) {
      feeds.push({ 
        title: document.title || "Current Page URL", 
        url: currentUrl,
        isCurrentPage: true
      });
    }
  }

  return feeds;
}

// --- Notification Click Handler ---
chrome.notifications.onClicked.addListener(async (notificationId) => {
  const targetView = (notificationId === SUMMARY_ALARM_NAME) ? 'unread' : 'all';
  try {
    let st = await SatelliteBridge.checkStatus(400);
    if (!st.connected) {
      SatelliteBridge.launchDesktop();
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 250));
        st = await SatelliteBridge.checkStatus(250);
        if (st.connected) break;
      }
    }
    await SatelliteBridge.openView(targetView);
  } catch (_) {}
  chrome.notifications.clear(notificationId);
});

// --- Core Logic & Helpers ---

async function fetchAllFeedsAndUpdate(isForce = false, targetFeedId = null) {
  if (isFetching) { console.log("Fetch already in progress. Skipping."); return; }
  isFetching = true;
  await startIconAnimation();
  
  try {
    await checkAndSyncFromCloud(false);
    const syncData = await chrome.storage.sync.get(['activeFeedId', 'rules', 'checkInterval', 'randomizeFetch', 'fetchSchedule']);
    const localData = await chrome.storage.local.get(['feedTree', 'readLinks', 'favoritedLinks', 'summaryLinks', 'lastTotalUnreadCount', 'lastNotificationMatchCount', 'allPosts', 'unreadCounts']);
    
    const { activeFeedId, rules = [], checkInterval = DEFAULT_CHECK_INTERVAL, randomizeFetch = false, fetchSchedule } = syncData;
    let { feedTree = [], readLinks = [], favoritedLinks = [], summaryLinks = [], lastTotalUnreadCount = 0, lastNotificationMatchCount = 0, allPosts: existingAllPosts = {}, unreadCounts: existingUnreadCounts = {} } = localData;

    // --- Schedule Check (Skip if selective or force) ---
    if (fetchSchedule && !isForce && !targetFeedId) {
      const now = new Date();
      const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      const currentTimeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
      const dayConfig = fetchSchedule[day];

      if (dayConfig) {
        if (!dayConfig.active || currentTimeStr < dayConfig.from || currentTimeStr > dayConfig.to) {
          console.log(`Current time ${currentTimeStr} (Day ${day}) is outside the active fetch schedule. Skipping fetch.`);
          
          // Still schedule the next alarm if auto-fetch is on
          const interval = Math.max(0, parseInt(checkInterval, 10));
          if (interval > 0) {
            // Random jitter to keep next check unpredictable even when paused
            const factor = randomizeFetch ? (0.8 + (Math.random() * 0.4)) : 1.0;
            const delay = Math.max(1, interval * factor);
            chrome.alarms.create(FETCH_ALARM_NAME, { delayInMinutes: delay });
            console.log(`Next fetch check scheduled in ${delay.toFixed(1)} minutes.`);
          }
          
          isFetching = false;
          stopIconAnimation();
          await updateTooltipCountdown();
          return;
        }
      }
    }
    
    let readLinksSet = new Set(readLinks);
    let favoritedLinksSet = new Set(favoritedLinks);
    let summaryLinksSet = new Set(summaryLinks);
    const enabledRules = rules.filter(rule => rule.enabled !== false);
    const allFeeds = [];
    function collectFeeds(nodes) {
      nodes.forEach(node => {
        if (node.type === 'feed') {
          allFeeds.push(node);
        } else if (node.type === 'folder') {
          collectFeeds(node.children);
        }
      });
    }
    collectFeeds(feedTree);

    // Filter feeds to fetch if selective refresh is requested
    const allFeedsToFetch = targetFeedId ? allFeeds.filter(f => f.id === targetFeedId) : allFeeds;

    // Helper to calculate the next interval
    const getNextInterval = (baseInterval, randomize) => {
        const base = Math.max(1, parseInt(baseInterval, 10));
        if (randomize) {
            // Randomize between 80% and 120% of the base interval
            const factor = 0.8 + (Math.random() * 0.4);
            return Math.max(1, base * factor);
        }
        return base;
    };

    if (allFeedsToFetch.length === 0 && !targetFeedId) {
      console.log("No feeds configured. Clearing all local post data.");
      await chrome.action.setBadgeText({ text: '' });
      // Clear all local data and then reset counters to ensure a clean state
      await chrome.storage.local.clear();
      await chrome.storage.local.set({ 
        lastTotalUnreadCount: 0, 
        lastNotificationMatchCount: 0 
      });
      
      // Still schedule the next check
      const nextInterval = getNextInterval(checkInterval, randomizeFetch);
      chrome.alarms.create(FETCH_ALARM_NAME, { delayInMinutes: nextInterval });
      return;
    }

    let newTotalUnreadCount = 0;
    let newNotificationMatchCount = 0;
    let individualUnreadCounts = targetFeedId ? { ...existingUnreadCounts } : {};
    let allPostsData = targetFeedId ? { ...existingAllPosts } : {};

    await ensureOffscreenDocument();

    for (const feed of allFeedsToFetch) {
      if (randomizeFetch && !targetFeedId) {
        // Random stagger delay between 1 and 5 seconds before each fetch
        const delayMs = Math.floor(Math.random() * 4000) + 1000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      let feedUnreadCount = 0;
      try {
        let parsedPosts = [];
        let feedTitle = null;

        const isGmailFeed = feed.url.includes('mail.google.com/mail/') && (feed.url.includes('/atom') || feed.url.includes('/feed'));
        let gmailToken = null;

        if (isGmailFeed) {
            try {
                gmailToken = await new Promise((resolve) => {
                    chrome.identity.getAuthToken({ interactive: false }, function(token) {
                        resolve(chrome.runtime.lastError ? null : token);
                    });
                });
            } catch (e) {
                console.warn("Failed to get Gmail auth token silently", e);
            }
        }

        if (isGmailFeed && gmailToken) {
            console.log("Fetching Gmail via REST API for feed:", feed.name);
            const result = await fetchGmailApi(gmailToken, feed.id);
            
            if (result.error) {
                // Virtual post to inform the user about the auth issue
                parsedPosts = [{
                    guid: 'gmail-auth-error-' + feed.id,
                    link: 'feedpage.html?view=settings', // Link to settings
                    title: '⚠️ Gmail Action Required',
                    author: 'PureTidings System',
                    date: new Date().toISOString(),
                    description: result.error,
                    isGmail: true,
                    isSystemMessage: true
                }];
            } else {
                parsedPosts = result.data;
            }
            
            feedTitle = result.feedTitle;
            parsedPosts.forEach(p => p.isGmail = true);
        } else if (isGmailFeed && !gmailToken) {
            console.warn("Gmail feed detected but no OAuth token available.");
            parsedPosts = [{
                guid: 'gmail-no-token-' + feed.id,
                link: 'feedpage.html?view=settings',
                title: '🔌 Gmail Not Connected',
                author: 'PureTidings System',
                date: new Date().toISOString(),
                description: 'Please go to Settings and click "Connect Gmail" to enable this feed.',
                isGmail: true,
                isSystemMessage: true
            }];
            feedTitle = feed.name;
        } else {
            // Standard feed logic
            const isYouTube = feed.url.includes('youtube.com');
            const response = await fetch(feed.url, { 
              cache: 'no-store',
              credentials: isYouTube ? 'omit' : 'include' 
            });
            if (!response.ok) { continue; }        
            const xmlString = await response.text();
            const result = await callOffscreenParser(xmlString, feed.fetchOgImage !== false);
            parsedPosts = result.data;
            feedTitle = result.feedTitle;
        }

        // Auto-rename generic feeds (like Gmail) if a more specific title is found in the XML
        if (feedTitle && feedTitle.trim().length > 0) {
          const isGeneric = (f) => {
            const n = f.name.toLowerCase();
            return n.includes('gmail') || 
                   n.includes('google atom feed') || 
                   n.includes('atom feed') ||
                   n.startsWith('http');
          };
          
          if (isGeneric(feed) && feedTitle !== feed.name) {
            console.log(`Auto-renaming generic feed "${feed.name}" to "${feedTitle}"`);
            
            function renameInTree(nodes) {
              for (const node of nodes) {
                if (node.id === feed.id) {
                  node.name = feedTitle;
                  return true;
                }
                if (node.children && renameInTree(node.children)) return true;
              }
              return false;
            }

            if (renameInTree(feedTree)) {
              await safeSyncSet('feedTree', feedTree);
            }          }
        }

        if (parsedPosts) {
          // Enhancements and rule processing
          const enhancementPromises = parsedPosts.map(async (post) => {
            post.feedId = feed.id;
            post.matchedRules = []; // Reset for this run
            post.isHidden = false;

            // Sync Gmail read status
            if (post.isGmail && post.isUnreadInGmail === false && !post.isSystemMessage) {
              readLinksSet.add(post.link);
            }
            
            if (post.link && post.link.includes('youtube.com/watch')) {
              await addYouTubeVideoDuration(post);
            } else if (post.description) {
              post.readingTime = calculateReadingTime(post.description);
            }

            // Apply rules using the central utility
            applyRulesToPost(post, rules, readLinksSet);
            
            return post;
          });
          parsedPosts = await Promise.all(enhancementPromises);
          parsedPosts.sort((a, b) => new Date(b.date) - new Date(a.date));

          allPostsData[feed.id] = parsedPosts;

          // Calculate unread counts
          for (const post of parsedPosts) {
            if (!post.isHidden && !readLinksSet.has(post.link)) {
              feedUnreadCount++;
            }
          }
        }
      } catch (error) {
        console.log(`Error processing feed ${feed.name}:`, error.message || error);
      } finally {
        individualUnreadCounts[feed.id] = feedUnreadCount;
        if (!allPostsData[feed.id]) allPostsData[feed.id] = [];
      }
    }
    
    if (await chrome.offscreen.hasDocument()) {
      await chrome.offscreen.closeDocument();
    }

    // Recalculate global counts
    if (targetFeedId) {
        // More efficient recalculation for a single feed update
        const oldUnreadForFeed = existingUnreadCounts[targetFeedId] || 0;
        const newUnreadForFeed = individualUnreadCounts[targetFeedId] || 0;
        newTotalUnreadCount = lastTotalUnreadCount - oldUnreadForFeed + newUnreadForFeed;
        
        let oldMatchesForFeed = 0;
        if(existingAllPosts[targetFeedId]) {
            existingAllPosts[targetFeedId].forEach(post => {
                if (!post.isHidden && !readLinksSet.has(post.link) && post.matchedRules && post.matchedRules.length > 0) {
                    oldMatchesForFeed++;
                }
            });
        }
        
        let newMatchesForFeed = 0;
        if(allPostsData[targetFeedId]) {
            allPostsData[targetFeedId].forEach(post => {
                if (!post.isHidden && !readLinksSet.has(post.link) && post.matchedRules && post.matchedRules.length > 0) {
                    newMatchesForFeed++;
                }
            });
        }
        newNotificationMatchCount = lastNotificationMatchCount - oldMatchesForFeed + newMatchesForFeed;

    } else {
        // Full fetch recalculation
        newTotalUnreadCount = Object.values(individualUnreadCounts).reduce((a, b) => a + b, 0);
        newNotificationMatchCount = 0;
        Object.values(allPostsData).flat().forEach(post => {
            if (!post.isHidden && !readLinksSet.has(post.link) && post.matchedRules && post.matchedRules.length > 0) {
                newNotificationMatchCount++;
            }
        });
    }

    await safeSyncSet('favoritedLinks', Array.from(favoritedLinksSet));
    await safeSyncSet('summaryLinks', Array.from(summaryLinksSet));

    await chrome.storage.local.set({
      posts: allPostsData[activeFeedId] || [],
      allPosts: allPostsData,
      readLinks: Array.from(readLinksSet),
      unreadCounts: individualUnreadCounts,
      lastTotalUnreadCount: newTotalUnreadCount,
      lastNotificationMatchCount: newNotificationMatchCount
    });

    await updateBadge(newTotalUnreadCount, lastTotalUnreadCount);
    
    // Only show notifications on full fetch or if target feed has new matches
    if (!targetFeedId || (newNotificationMatchCount > lastNotificationMatchCount)) {
        await handleNotifications(newTotalUnreadCount, lastTotalUnreadCount, newNotificationMatchCount, lastNotificationMatchCount, enabledRules.length > 0);
    }
    
    console.log(`Fetch successful (${targetFeedId ? 'Single: ' + targetFeedId : 'All'}): ${newTotalUnreadCount} total unread.`);
    
    // Re-schedule the next alarm after a successful FULL fetch
    if (!targetFeedId) {
        const interval = Math.max(0, parseInt(checkInterval, 10));
        if (interval > 0) {
            const nextInterval = getNextInterval(interval, randomizeFetch);
            chrome.alarms.create(FETCH_ALARM_NAME, { delayInMinutes: nextInterval });
            console.log(`Next full fetch scheduled to run in ${nextInterval.toFixed(1)} minute(s).`);
        } else {
            await chrome.alarms.clear(FETCH_ALARM_NAME);
            console.log("Auto-fetch is OFF. No alarm scheduled.");
        }
    }

  } catch (error) {
    console.error("Critical error during feed fetch:", error);
    await chrome.action.setBadgeText({ text: 'ERR' });

    if (!targetFeedId) {
        // Re-schedule the next alarm even after an error to keep the cycle going
        const { checkInterval = DEFAULT_CHECK_INTERVAL, randomizeFetch = false } = await chrome.storage.sync.get(['checkInterval', 'randomizeFetch']);
        
        let interval = Math.max(1, parseInt(checkInterval, 10));
        if (randomizeFetch) {
            interval = Math.max(1, interval * (0.8 + (Math.random() * 0.4)));
        }
        
        chrome.alarms.create(FETCH_ALARM_NAME, { delayInMinutes: interval });
        console.log(`Next fetch scheduled post-error in ${interval} minute(s).`);
    }
  } finally {
    stopIconAnimation();
    isFetching = false;
  }
}
let isFetching = false;

async function updateBadge(newCount, oldCount) {
  await chrome.action.setBadgeText({ text: newCount > 0 ? newCount.toString() : '' });
  if (newCount > oldCount) {
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR_NEW });
  } else {
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR_DEFAULT });
  }
}

async function handleNotifications(newTotal, oldTotal, newMatches, oldMatches, hasRules) {
  const { showNotification = true } = await chrome.storage.sync.get('showNotification');
  if (!showNotification) return;

  let newCount;
  let isKeywordMatch;

  if (hasRules) {
    if (newMatches > oldMatches) {
      newCount = newMatches - oldMatches;
      isKeywordMatch = true;
    }
  } else {
    if (newTotal > oldTotal) {
      newCount = newTotal - oldTotal;
      isKeywordMatch = false;
    }
  }

  if (newCount > 0) {
    await showSystemNotification('feedMasterNotification', 'PureTidings Update', newCount, isKeywordMatch);
  }
}

async function showSystemNotification(id, title, newPostCount, isKeywordMatch) {
  let message;
  if (isKeywordMatch) {
    message = (newPostCount === 1)
      ? "You have 1 new post matching your keywords."
      : `You have ${newPostCount} new posts matching your keywords.`;
  } else {
    message = (newPostCount === 1) ? "You have 1 new post." : `You have ${newPostCount} new posts.`;
  }

  await chrome.notifications.clear(id);
  await chrome.notifications.create(id, {
    type: 'basic', iconUrl: '128.png', title, message, priority: 2
  });
}

async function sendSummaryNotification() {
    const { allPosts = {}, readLinks = [] } = await chrome.storage.local.get(['allPosts', 'readLinks']);
    const readLinksSet = new Set(readLinks);

    const unreadPosts = Object.values(allPosts)
        .flat()
        .filter(post => post && post.link && !readLinksSet.has(post.link))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (unreadPosts.length === 0) {
        console.log("No unread posts to summarize.");
        return;
    }

    const title = `Unread Summary: ${unreadPosts.length} post(s)`;
    const itemsToShow = unreadPosts.slice(0, 5);
    const notificationItems = itemsToShow.map(post => ({
        title: post.title,
        message: post.feedName || new URL(post.link).hostname
    }));
    
    let message = `Here are your latest unread posts.`;
    if (unreadPosts.length > 5) {
        message = `Here are 5 of your ${unreadPosts.length} unread posts.`
    }

    await chrome.notifications.clear(SUMMARY_ALARM_NAME);
    await chrome.notifications.create(SUMMARY_ALARM_NAME, {
        type: 'list',
        iconUrl: '128.png',
        title: title,
        message: message,
        items: notificationItems,
        priority: 1
    });
}

// --- Alarm Helpers ---
async function createOrUpdateAlarm() {
  const { checkInterval = DEFAULT_CHECK_INTERVAL, randomizeFetch = false } = await chrome.storage.sync.get(['checkInterval', 'randomizeFetch']);
  
  let interval = Math.max(0, parseInt(checkInterval, 10)); 
  if (interval > 0) {
      if (randomizeFetch) {
          interval = Math.max(1, interval * (0.8 + (Math.random() * 0.4)));
      }
      // Make it a one-shot alarm. The next alarm will be scheduled by fetchAllFeedsAndUpdate.
      chrome.alarms.create(FETCH_ALARM_NAME, { delayInMinutes: interval });
      console.log(`Alarm '${FETCH_ALARM_NAME}' set to run in ${interval.toFixed(1)} minutes.`);
  } else {
      await chrome.alarms.clear(FETCH_ALARM_NAME);
      console.log(`Alarm '${FETCH_ALARM_NAME}' cleared (Auto-fetch OFF).`);
  }
}

async function createOrUpdateSummaryAlarm() {
  const { showSummaryNotification, summaryInterval } = await chrome.storage.sync.get(['showSummaryNotification', 'summaryInterval']);
  
  if (showSummaryNotification) {
    const interval = Math.max(1, parseInt(summaryInterval, 10) || 60);
    chrome.alarms.create(SUMMARY_ALARM_NAME, {
      delayInMinutes: interval,
      periodInMinutes: interval
    });
    console.log(`Alarm '${SUMMARY_ALARM_NAME}' set to ${interval} minutes.`);
  } else {
    await chrome.alarms.clear(SUMMARY_ALARM_NAME);
    console.log(`Alarm '${SUMMARY_ALARM_NAME}' cleared.`);
  }
}

async function createOrUpdateAutoBackupAlarm() {
  const { autoBackupInterval, autoBackupTime, autoBackupDay, autoBackupMonthlyDay } = await chrome.storage.sync.get(['autoBackupInterval', 'autoBackupTime', 'autoBackupDay', 'autoBackupMonthlyDay']);
  const days = parseInt(autoBackupInterval, 10) || 0;
  
  if (days > 0) {
    const timeStr = autoBackupTime || '12:00';
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(hours, minutes, 0, 0);

    if (days === 7) {
        // Weekly alignment
        const targetDay = parseInt(autoBackupDay, 10);
        const dayToAlign = isNaN(targetDay) ? 1 : targetDay;
        let currentDay = nextRun.getDay();
        let dayDiff = (dayToAlign - currentDay + 7) % 7;
        if (dayDiff === 0 && now >= nextRun) dayDiff = 7;
        nextRun.setDate(nextRun.getDate() + dayDiff);
    } else if (days === 30) {
        // Monthly alignment
        const targetMonthlyDay = Math.min(31, Math.max(1, parseInt(autoBackupMonthlyDay, 10) || 1));
        nextRun.setDate(targetMonthlyDay);
        if (now >= nextRun) {
            nextRun.setMonth(nextRun.getMonth() + 1);
        }
    } else {
        // Daily
        if (now >= nextRun) {
            nextRun.setDate(nextRun.getDate() + 1);
        }
    }

    const delayInMinutes = Math.max(1, (nextRun.getTime() - now.getTime()) / 60000);
    const periodInMinutes = days * 24 * 60;

    chrome.alarms.create(AUTO_BACKUP_ALARM_NAME, {
      delayInMinutes: delayInMinutes,
      periodInMinutes: periodInMinutes
    });
    console.log(`Alarm '${AUTO_BACKUP_ALARM_NAME}' set to first run at ${nextRun.toLocaleString()}, then every ${days} day(s).`);
  } else {
    await chrome.alarms.clear(AUTO_BACKUP_ALARM_NAME);
    console.log(`Alarm '${AUTO_BACKUP_ALARM_NAME}' cleared.`);
  }
}

function escapeXMLForBackup(str) {
    if (!str) return "";
    return str.replace(/[<>&"']/g, m => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;'
    }[m]));
}

function getTimestampForFilename() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

async function executeAutoBackup() {
  try {
    const syncData = await chrome.storage.sync.get(null);
    const format = syncData.autoBackupFormat || 'json';
    const timestamp = getTimestampForFilename();

    if (format === 'json' || format === 'both') {
      const localData = await chrome.storage.local.get(['readLinks']);
      const fullBackup = {
        version: 2,
        timestamp: new Date().toISOString(),
        sync: syncData,
        local: localData
      };
      const jsonString = JSON.stringify(fullBackup, null, 2);
      const fileName = `PureTidings-Backups/puretidings-full-backup_${timestamp}.json`;
      const base64Str = btoa(unescape(encodeURIComponent(jsonString)));
      await chrome.downloads.download({
        url: `data:application/json;base64,${base64Str}`,
        filename: fileName,
        saveAs: false
      });
    }

    if (format === 'opml' || format === 'both') {
      const { feedTree } = syncData;
      let opmlBody = '';
      function buildOpmlOutlines(nodes, level = 0) {
          let outlines = '';
          nodes.forEach(node => {
              const indent = '  '.repeat(level + 2);
              if (node.type === 'folder') {
                  outlines += `${indent}<outline text="${escapeXMLForBackup(node.name)}">\n`;
                  outlines += buildOpmlOutlines(node.children, level + 1);
                  outlines += `${indent}</outline>\n`;
              } else if (node.type === 'feed') {
                  outlines += `${indent}<outline type="rss" text="${escapeXMLForBackup(node.name)}" xmlUrl="${escapeXMLForBackup(node.url)}"/>\n`;
              }
          });
          return outlines;
      }
      
      if (feedTree) {
        opmlBody = buildOpmlOutlines(feedTree);
      }
      
      const opmlString = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>PureTidings Export</title>\n    <dateCreated>${new Date().toISOString()}</dateCreated>\n  </head>\n  <body>\n${opmlBody}  </body>\n</opml>`;
      const fileName = `PureTidings-Backups/puretidings-export_${timestamp}.opml`;
      const base64Str = btoa(unescape(encodeURIComponent(opmlString)));
      await chrome.downloads.download({
        url: `data:application/octet-stream;base64,${base64Str}`,
        filename: fileName,
        saveAs: false
      });
    }
    console.log(`Auto backup executed successfully (format: ${format}).`);
  } catch (error) {
    console.error("Error executing auto backup:", error);
  }
}

async function updateTooltipCountdown() {
  await syncBadgeFromDesktop();
}

// --- Offscreen Document Helpers ---
async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) { return; }
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['DOM_PARSER'],
    justification: 'Required for DOM parsing'
  });
}

async function callOffscreenParser(xmlString, fetchOgImage = true) {
  if (!await chrome.offscreen.hasDocument()) {
    throw new Error('Offscreen document is not available.');
  }
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Offscreen document timed out.')), 5000);
    try {
      const response = await chrome.runtime.sendMessage({ 
        action: 'parseXML', 
        data: xmlString,
        fetchOgImage: fetchOgImage // Pass the flag
      });
      clearTimeout(timeout);
      if (response && response.status === 'ok') resolve(response); // Resolve full response object
      else reject(new Error(response ? response.message : 'Unknown error during parsing.'));
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

async function addYouTubeVideoDuration(post) {
  try {
    const response = await fetch(post.link, { cache: 'default' });
    if (!response.ok) return post;
    const html = await response.text();
    const durationMatch = html.match(/<meta\s+itemprop="duration"\s+content="([^"]+)">/);
    if (durationMatch && durationMatch[1]) {
      const seconds = parseISO8601Duration(durationMatch[1]);
      if (seconds !== null) post.videoLength = seconds;
    }
  } catch (error) {
    console.error(`Error fetching YouTube duration for ${post.link}:`, error);
  }
  return post;
}

async function findOgImage(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (response.ok) {
      const html = await response.text();
      
      // Robuste Regex-Suche nach og:image / twitter:image
      const ogImageRegex = /<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i;
      const ogImageRegexAlt = /<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i;
      const nameImageRegex = /<meta\s+[^>]*name=["']og:image["'][^>]*content=["']([^"']+)["']/i;
      const nameImageRegexAlt = /<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']og:image["']/i;
      const twitterImageRegex = /<meta\s+[^>]*property=["']twitter:image["'][^>]*content=["']([^"']+)["']/i;
      const twitterImageRegexAlt = /<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']twitter:image["']/i;
      
      const match = html.match(ogImageRegex) || html.match(ogImageRegexAlt) || 
                    html.match(nameImageRegex) || html.match(nameImageRegexAlt) ||
                    html.match(twitterImageRegex) || html.match(twitterImageRegexAlt);
                    
      if (match && match[1]) {
        return match[1];
      }
    }
  } catch (fetchError) {
    console.warn(`Could not fetch article page for og:image at ${url}:`, fetchError);
  }
  return null;
}

  // --- Gmail API Integration ---

  async function fetchGmailApi(token, feedId) {
  try {
  const listResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:inbox&maxResults=50', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (!listResponse.ok) {
    const errorText = await listResponse.text();
    console.warn(`Gmail API Error (${listResponse.status}):`, errorText);
    
    if (listResponse.status === 401 || listResponse.status === 403) {
      // Token is likely invalid or revoked
      chrome.identity.removeCachedAuthToken({ token: token }, () => {
        if (chrome.runtime.lastError) { /* ignore */ }
        console.log("Invalid Gmail token removed from cache.");
      });
      return { 
        data: [], 
        feedTitle: "Gmail (Re-auth needed)", 
        error: "Your Gmail session has expired. Please go to Settings and reconnect your account." 
      };
    }
    
    throw new Error(`Failed to fetch Gmail list (Status: ${listResponse.status})`);
  }
  const listData = await listResponse.json();

  if (!listData.messages) {
    return { data: [], feedTitle: "Gmail Inbox" };
  }

  const posts = [];
  for (const msg of listData.messages) {
    const msgResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!msgResponse.ok) continue;
    const msgData = await msgResponse.json();

    let subject = "No Subject";
    let from = "Unknown";
    let date = new Date().toISOString();

    if (msgData.payload && msgData.payload.headers) {
      for (const header of msgData.payload.headers) {
        if (header.name.toLowerCase() === 'subject') subject = header.value;
        if (header.name.toLowerCase() === 'from') from = header.value;
        if (header.name.toLowerCase() === 'date') date = new Date(header.value).toISOString();
      }
    }

    let htmlBody = "";
    let plainBody = "";

    function extractBody(part) {
      if (!part) return;

      // Prefer HTML, but keep track of plain text as fallback
      if (part.mimeType === 'text/html' && part.body && part.body.data) {
        htmlBody = decodeBase64UrlSafe(part.body.data);
      } else if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        plainBody = decodeBase64UrlSafe(part.body.data);
      }

      if (part.parts) {
        part.parts.forEach(extractBody);
      }
    }

    if (msgData.payload) {
        extractBody(msgData.payload);
    }

    // Final content priority: HTML > Plain Text > Snippet
    let finalContentHtml = htmlBody || plainBody || msgData.snippet || "";

    // Cleanup: Remove <head> and <meta> tags which can cause extension errors when injected into innerHTML
    if (finalContentHtml.includes('<head>')) {
        finalContentHtml = finalContentHtml.replace(/<head>[\s\S]*?<\/head>/gi, '');
    }
    finalContentHtml = finalContentHtml.replace(/<meta[\s\S]*?>/gi, '');
    
    // Also clean any target-densitydpi or trailing separators just in case they are outside meta tags
    finalContentHtml = finalContentHtml.replace(/([,;]\s*)?target-densitydpi=[^;\"\s>]+(\s*[,;])?/gi, '');
    finalContentHtml = finalContentHtml.replace(/([,;]\s*)(?=["'>])/g, '');
    finalContentHtml = finalContentHtml.replace(/,\s*,/g, ',').replace(/;\s*;/g, ';');
    
    // We use fullContentHtml so that if opened in Reader Mode, it displays the full HTML email
    posts.push({
      guid: msg.id,
      link: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
      title: subject,
      author: from,
      date: date,
      description: msgData.snippet || "",
      fullContentHtml: finalContentHtml,
      feedId: feedId,
      isUnreadInGmail: msgData.labelIds && msgData.labelIds.includes('UNREAD')
    });  }

  return { data: posts, feedTitle: "Gmail Inbox" };
  } catch (error) {
  console.error("Gmail API Error:", error);
  return { data: [], feedTitle: "Gmail Inbox" };
  }
  }

  function decodeBase64UrlSafe(base64Str) {
  try {
  let base64 = base64Str.replace(/-/g, '+').replace(/_/g, '/');
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
  console.error("Base64 decode error", e);
  return "";
  }
  }

// Receive external messages from the WebApp (allows secure access to Extension APIs for transcripts)
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchYoutubeTranscript") {
    (async () => {
      try {
        const innerTubeUrl = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
        const body = {
          context: {
            client: {
              clientName: 'ANDROID',
              clientVersion: '20.10.38'
            }
          },
          videoId: request.videoId
        };
        const response = await fetch(innerTubeUrl, {
          method: 'POST',
          credentials: 'omit',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)'
          },
          body: JSON.stringify(body)
        });
        
        const data = await response.json();
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        
        if (tracks && tracks.length > 0) {
            let track = tracks.find(t => t.languageCode === 'en' || t.languageCode === 'de') || tracks[0];
            const tRes = await fetch(track.baseUrl, {
                credentials: 'omit',
                headers: { 'Accept-Language': track.languageCode }
            });
            const transcriptXml = await tRes.text();
            sendResponse({ status: 'ok', xml: transcriptXml });
        } else {
            sendResponse({ status: 'error', message: 'No transcript tracks found for this video.' });
        }
      } catch (err) {
        sendResponse({ status: 'error', message: err.toString() });
      }
    })();
    return true; // Keeps the channel open
  } else if (request.action === "syncSession") {
    (async () => {
      try {
        console.log("Sync: Received session from WebApp for email:", request.email);
        await chrome.storage.local.set({ syncEmail: request.email });
        await checkAndSyncFromCloud(false);
        sendResponse({ status: 'ok' });
      } catch (err) {
        sendResponse({ status: 'error', message: err.toString() });
      }
    })();
    return true;
  } else if (request.action === "proxyFetch") {
    (async () => {
      try {
        console.log("Extension Proxy: Fetching URL:", request.url);

        const isGmailFeed = request.url.includes('mail.google.com/mail/') && (request.url.includes('/atom') || request.url.includes('/feed'));
        if (isGmailFeed) {
          console.log("Extension Proxy: Intercepted Gmail feed fetch!");
          let gmailToken = await new Promise((resolve) => {
            chrome.identity.getAuthToken({ interactive: false }, function(token) {
              resolve(chrome.runtime.lastError ? null : token);
            });
          });

          if (gmailToken) {
            const result = await fetchGmailApi(gmailToken, 'proxy');
            if (result.error) {
              throw new Error(result.error);
            }
            
            const escapeXml = (unsafe) => {
              return unsafe.replace(/[<>&'"]/g, function (c) {
                switch (c) {
                  case '<': return '&lt;';
                  case '>': return '&gt;';
                  case '&': return '&amp;';
                  case '\'': return '&apos;';
                  case '"': return '&quot;';
                }
              });
            };

            const cleanCdata = (unsafe) => {
              if (typeof unsafe !== 'string') return '';
              return unsafe.replace(/\]\]>/g, ']]&gt;');
            };

            const convertGmailPostsToRssXml = (posts) => {
              let xml = `<?xml version="1.0" encoding="UTF-8" ?>\n`;
              xml += `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">\n`;
              xml += `<channel>\n`;
              xml += `  <title>Gmail Inbox</title>\n`;
              xml += `  <link>https://mail.google.com</link>\n`;
              xml += `  <description>Gmail newsletter feed</description>\n`;
              
              for (const post of posts) {
                xml += `  <item>\n`;
                xml += `    <title>${escapeXml(post.title || 'No Subject')}</title>\n`;
                xml += `    <link>${escapeXml(post.link || '')}</link>\n`;
                xml += `    <author>${escapeXml(post.author || 'Unknown')}</author>\n`;
                xml += `    <pubDate>${escapeXml(post.date || new Date().toISOString())}</pubDate>\n`;
                xml += `    <guid>${escapeXml(post.guid || '')}</guid>\n`;
                xml += `    <description><![CDATA[${cleanCdata(post.description || '')}]]></description>\n`;
                xml += `    <content:encoded><![CDATA[${cleanCdata(post.fullContentHtml || '')}]]></content:encoded>\n`;
                xml += `  </item>\n`;
              }
              
              xml += `</channel>\n`;
              xml += `</rss>`;
              return xml;
            };

            const xmlText = convertGmailPostsToRssXml(result.data);
            sendResponse({ status: 'ok', text: xmlText });
            return;
          } else {
            throw new Error("Google-Konto nicht verbunden. Bitte verbinde dein Gmail-Konto in den Extension-Einstellungen.");
          }
        }

        const fetchOptions = {
          method: request.method || 'GET',
          cache: 'no-store'
        };
        if (request.headers) {
          fetchOptions.headers = request.headers;
        }
        if (request.body) {
          fetchOptions.body = request.body;
        }
        const response = await fetch(request.url, fetchOptions);
        if (!response.ok) {
          throw new Error(`HTTP-Fehler ${response.status}: ${response.statusText}`);
        }
        const text = await response.text();
        sendResponse({ status: 'ok', text: text });
      } catch (err) {
        console.error("Extension Proxy: Error fetching URL:", request.url, err);
        sendResponse({ status: 'error', message: err.toString() });
      }
    })();
    return true;
  }
});

// Cache bust: force service worker recompilation to clear any corrupt caches.