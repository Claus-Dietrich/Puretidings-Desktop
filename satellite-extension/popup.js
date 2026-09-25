// DOM Elements
const container = document.getElementById('posts-container');
const postsList = document.getElementById('posts-list');
const loadingSpinner = document.getElementById('loading-spinner');
const emptyMessage = document.getElementById('empty-message');
const refreshButton = document.getElementById('refresh-button');
const selectiveRefreshButton = document.getElementById('selective-refresh-button');
const markAllReadButton = document.getElementById('mark-all-read');
const markAllUnreadButton = document.getElementById('mark-all-unread');
const settingsButton = document.getElementById('settings-button');
const openFullPageButton = document.getElementById('open-full-page');
const openFavoritesPageButton = document.getElementById('open-favorites-page');
const openKeywordsPageButton = document.getElementById('open-keywords-page');

// Custom dropdown elements
const selectTrigger = document.getElementById('custom-select-trigger');
const selectOptions = document.getElementById('custom-select-options');
const selectTriggerText = selectTrigger.querySelector('.select-trigger-text'); 
const selectTriggerIcon = selectTrigger.querySelector('img');

const searchBox = document.getElementById('search-box');
const scanResultsContainer = document.getElementById('scan-results-container');
const scanPageButton = document.getElementById('scan-page-button'); 
const aiAnalyzePageButton = document.getElementById('ai-analyze-page-button');
const aiReportContainer = document.getElementById('ai-report-container');
const aiReportContent = document.getElementById('ai-report-content');
const closeAiReportBtn = document.getElementById('close-ai-report-btn');
const copyAiReportBtn = document.getElementById('copy-ai-report-btn');
const downloadAiReportBtn = document.getElementById('download-ai-report-btn');
const exportAiFormat = document.getElementById('export-ai-format');
const footerStatus = document.getElementById('footer-status');

let currentAiRawMarkdown = '';
let isScanning = false; // Lock variable for the scanning process
const BADGE_COLOR_DEFAULT = '#0066CC'; // Blue

let currentFeedTree = []; // New: Store the hierarchical feed and folder data

function getFirstFeedNodeId(nodes) {
  for (const n of (nodes || [])) {
    if (n && n.type === 'feed' && n.id) return n.id;
    if (n && n.type === 'folder' && Array.isArray(n.children)) {
      const found = getFirstFeedNodeId(n.children);
      if (found) return found;
    }
  }
  return null;
}

// On popup open
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const sizeData = await chrome.storage.sync.get(['popupWidth', 'popupHeight']);
    document.body.style.width = (sizeData.popupWidth || 430) + 'px';
    document.body.style.height = (sizeData.popupHeight || 530) + 'px';

    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR_DEFAULT });

    // Satellite Integration: Check if PureTidings Desktop is running
    const status = await SatelliteBridge.checkStatus(600);
    const offlineContainer = document.getElementById('offline-container');
    const mainContainer = document.getElementById('posts-container');
    const searchBar = document.getElementById('search-bar-container');
    const btnLaunchDesktop = document.getElementById('btn-launch-desktop');
    const offlineStatus = document.getElementById('offline-retry-status');

    if (!status.connected) {
      const localData = await chrome.storage.local.get(['feedTree', 'posts']);
      if (!localData.feedTree || localData.feedTree.length === 0) {
        if (offlineContainer) offlineContainer.classList.remove('hidden');
        if (mainContainer) mainContainer.classList.add('hidden');
        if (searchBar) searchBar.classList.add('hidden');
      } else {
        currentFeedTree = localData.feedTree;
        showFooterStatus("Desktop offline - showing cached data");
      }
    } else {
      if (offlineContainer) offlineContainer.classList.add('hidden');
      if (mainContainer) mainContainer.classList.remove('hidden');
      if (searchBar) searchBar.classList.remove('hidden');

      // Fetch live snapshot from Desktop
      const desktopData = await SatelliteBridge.fetchData();
      if (desktopData) {
        currentFeedTree = desktopData.feedTree || [];
        await chrome.storage.local.set({
          feedTree: desktopData.feedTree || [],
          allPosts: desktopData.allPosts || {},
          readLinks: desktopData.readLinks || [],
          favoritedLinks: desktopData.favoritedLinks || [],
          summaryLinks: desktopData.summaryLinks || [],
          unreadCounts: desktopData.unreadCounts || {}
        });
        if (desktopData.rules) {
          await chrome.storage.sync.set({ rules: desktopData.rules });
        }
        if (desktopData.geminiApiKey) {
          await chrome.storage.sync.set({ geminiApiKey: desktopData.geminiApiKey });
        }
        if (desktopData.customAiPrompt) {
          await chrome.storage.sync.set({ customAiPrompt: desktopData.customAiPrompt });
        }
        if (desktopData.youtubeAiPrompt) {
          await chrome.storage.sync.set({ youtubeAiPrompt: desktopData.youtubeAiPrompt });
        }
      }
    }

    if (btnLaunchDesktop) {
      btnLaunchDesktop.addEventListener('click', async (e) => {
        e.preventDefault();
        if (offlineStatus) offlineStatus.style.display = 'block';
        SatelliteBridge.launchDesktop();

        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 800));
          const st = await SatelliteBridge.checkStatus(400);
          if (st.connected) {
            if (offlineContainer) offlineContainer.classList.add('hidden');
            if (mainContainer) mainContainer.classList.remove('hidden');
            if (searchBar) searchBar.classList.remove('hidden');
            const freshData = await SatelliteBridge.fetchData();
            if (freshData) {
              currentFeedTree = freshData.feedTree || [];
              await chrome.storage.local.set({
                feedTree: freshData.feedTree || [],
                allPosts: freshData.allPosts || {},
                readLinks: freshData.readLinks || [],
                unreadCounts: freshData.unreadCounts || {}
              });
            }
            await populateFeedSelector();
            const { activeFeedId } = await chrome.storage.sync.get('activeFeedId');
            await switchActiveFeed(activeFeedId || (currentFeedTree[0]?.id));
            break;
          }
        }
      });
    }

    if (currentFeedTree.length === 0) {
      const localData = await chrome.storage.local.get('feedTree');
      currentFeedTree = localData.feedTree || [];
    }

    let { activeFeedId } = await chrome.storage.sync.get('activeFeedId');
    if (!activeFeedId || !findNodeById(currentFeedTree, activeFeedId)) {
      activeFeedId = getFirstFeedNodeId(currentFeedTree);
      if (activeFeedId) {
        await chrome.storage.sync.set({ activeFeedId });
      }
    }

    if (activeFeedId) {
      await syncActiveFeedPosts(activeFeedId);
    }

    await populateFeedSelector();
    await loadPostsFromStorage();
    await checkSyncWarnings();

    // Live synchronization with Desktop while popup remains open
    async function refreshFromDesktopLive() {
      try {
        const st = await SatelliteBridge.checkStatus(300);
        if (!st.connected) return;
        const fresh = await SatelliteBridge.fetchData();
        if (!fresh) return;

        const oldTreeStr = JSON.stringify(currentFeedTree);
        const newTreeStr = JSON.stringify(fresh.feedTree || []);
        const treeChanged = oldTreeStr !== newTreeStr;

        currentFeedTree = fresh.feedTree || [];
        await chrome.storage.local.set({
          feedTree: fresh.feedTree || [],
          allPosts: fresh.allPosts || {},
          readLinks: fresh.readLinks || [],
          favoritedLinks: fresh.favoritedLinks || [],
          summaryLinks: fresh.summaryLinks || [],
          unreadCounts: fresh.unreadCounts || {}
        });

        if (treeChanged) {
          await populateFeedSelector();
        }

        const { activeFeedId: curFeedId } = await chrome.storage.sync.get('activeFeedId');
        if (curFeedId) {
          const { posts: oldPosts = [] } = await chrome.storage.local.get('posts');
          const syncedPosts = await syncActiveFeedPosts(curFeedId);
          if (treeChanged || JSON.stringify(syncedPosts.map(p => p.link || p.id)) !== JSON.stringify(oldPosts.map(p => p.link || p.id))) {
            await loadPostsFromStorage();
          }
        }
      } catch (_) {}
    }

    window.addEventListener('focus', () => {
      refreshFromDesktopLive().catch(() => {});
    });

    const liveSyncInterval = setInterval(refreshFromDesktopLive, 2500);
    window.addEventListener('unload', () => clearInterval(liveSyncInterval));
    
    searchBox.addEventListener('input', handleSearch);
    scanPageButton.addEventListener('click', handleScanPage);
    
    openKeywordsPageButton.addEventListener('click', (e) => { 
      e.preventDefault();
      chrome.tabs.create({ url: 'feedpage.html?view=keywords' }); 
      window.close();
    });
    
    openFavoritesPageButton.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'feedpage.html?view=favorites' }); 
      window.close();
    });
    
    openFullPageButton.addEventListener('click', async (e) => {
      e.preventDefault();
      const st = await SatelliteBridge.checkStatus(400);
      if (st.connected) {
        const { activeFeedId } = await chrome.storage.sync.get('activeFeedId');
        await SatelliteBridge.openFeed(activeFeedId || '');
        window.close();
        return;
      }
      chrome.tabs.create({ url: 'feedpage.html' });
      window.close();
    });
    
    settingsButton.addEventListener('click', async (e) => {
      e.preventDefault();
      let st = await SatelliteBridge.checkStatus(500);
      if (!st.connected) {
        SatelliteBridge.launchDesktop();
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 400));
          st = await SatelliteBridge.checkStatus(300);
          if (st.connected) break;
        }
      }
      if (st.connected) {
        await SatelliteBridge.openSettings();
        window.close();
        return;
      }
      const optionsUrl = chrome.runtime.getURL('options.html');
      chrome.windows.create({
        url: optionsUrl,
        type: 'popup',
        width: 550,
        height: 750
      });
    });
    
    refreshButton.addEventListener('click', async (e) => {
      e.preventDefault();
      await triggerRefresh(false); 
    });

    selectiveRefreshButton.addEventListener('click', async (e) => {
      e.preventDefault();
      await triggerRefresh(true);
    });
    
    markAllReadButton.addEventListener('click', async (e) => {
      e.preventDefault();
      const { activeFeedId } = await chrome.storage.sync.get('activeFeedId');
      showFooterStatus("Marking feed as read...");
      try {
        const response = await chrome.runtime.sendMessage({ 
          action: "doMarkAllAsRead",
          feedId: activeFeedId
        });
        if (response.status === 'ok') {
          // The storage listener will trigger the UI update
          showFooterStatus("Feed marked as read!");
          setTimeout(hideFooterStatus, 2000);
        }
      } catch (err) {
        showFooterStatus("Error: " + err.message, true);
      }
    });
    
    markAllUnreadButton.addEventListener('click', async (e) => {
      e.preventDefault();
      const { activeFeedId } = await chrome.storage.sync.get('activeFeedId');
      showFooterStatus("Marking feed as unread...");
      try {
        const response = await chrome.runtime.sendMessage({ 
          action: "doMarkAllAsUnread",
          feedId: activeFeedId
        });
        if (response.status === 'ok') {
          // The storage listener will trigger the UI update
          showFooterStatus("Feed marked as unread!");
          setTimeout(hideFooterStatus, 2000);
        }
      } catch (err) {
        showFooterStatus("Error: " + err.message, true);
      }
    });

    // Add storage listener for real-time updates
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.unreadCounts || changes.readLinks || changes.feedTree || changes.favoritedLinks || 
            changes.summaryLinks || changes.posts || changes.allPosts) {
          console.log("Storage changed, refreshing popup UI...");
          if (changes.feedTree) {
            currentFeedTree = changes.feedTree.newValue || [];
          }
          populateFeedSelector();
          loadPostsFromStorage();
        }
        
        // Check if any quota warning keys changed
        const quotaKeys = ['quotaWarning_feedTree', 'quotaWarning_favoritedLinks', 'quotaWarning_summaryLinks'];
        if (quotaKeys.some(key => changes[key])) {
           checkSyncWarnings();
        }
      }
    });

    // Check for AI Key to show the button
    const aiData = await chrome.storage.sync.get('geminiApiKey');
    if (aiData.geminiApiKey && aiData.geminiApiKey.trim() !== '') {
        aiAnalyzePageButton.classList.remove('hidden');
    }

    aiAnalyzePageButton.addEventListener('click', handleAiAnalyzePage);
    closeAiReportBtn.addEventListener('click', () => {
        aiReportContainer.classList.add('hidden');
        aiReportContent.innerHTML = '';
        container.classList.remove('hidden');
    });

    copyAiReportBtn.addEventListener('click', async () => {
        if (!currentAiRawMarkdown) return;
        const format = exportAiFormat.value;
        let textToCopy = "";
        
        if (format === 'markdown') {
            textToCopy = currentAiRawMarkdown;
        } else if (format === 'html') {
            textToCopy = `<html><body style="font-family:sans-serif;line-height:1.6;padding:20px;">${formatMarkdownToHtml(currentAiRawMarkdown)}</body></html>`;
        } else if (format === 'txt') {
            textToCopy = currentAiRawMarkdown.replace(/[#*]/g, '').replace(/<br>/g, '\n');
        }
        
        await navigator.clipboard.writeText(textToCopy);
        const oldText = copyAiReportBtn.textContent;
        copyAiReportBtn.textContent = 'Copied!';
        setTimeout(() => copyAiReportBtn.textContent = oldText, 2000);
    });

    downloadAiReportBtn.addEventListener('click', () => {
        if (!currentAiRawMarkdown) return;
        const format = exportAiFormat.value;
        let content = "";
        let ext = "md";
        
        if (format === 'markdown') {
            content = currentAiRawMarkdown;
            ext = "md";
        } else if (format === 'html') {
            content = `<html><body style="font-family:sans-serif;line-height:1.6;padding:20px;">${formatMarkdownToHtml(currentAiRawMarkdown)}</body></html>`;
            ext = "html";
        } else if (format === 'txt') {
            content = currentAiRawMarkdown.replace(/[#*]/g, '').replace(/<br>/g, '\n');
            ext = "txt";
        }
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-analysis.${ext}`;
        a.click();
    });

  } catch (error) {
    console.error("Error on initial popup load:", error);
    loadingSpinner.classList.add('hidden');
    emptyMessage.innerText = "Error loading. Please refresh.";
    emptyMessage.classList.remove('hidden');
  }
});

// Listener to open/close the dropdown
selectTrigger.addEventListener('click', (e) => {
  e.stopPropagation(); 
  selectOptions.classList.toggle('hidden');
});

// Listener to close the dropdown
document.addEventListener('click', () => {
  selectOptions.classList.add('hidden');
});

// Fills the NEW dropdown menu (with folder logic)
async function populateFeedSelector() {
  try {
    const { activeFeedId } = await chrome.storage.sync.get('activeFeedId');
    const { unreadCounts = {} } = await chrome.storage.local.get('unreadCounts');
    
    selectOptions.innerHTML = ""; 
    
    if (currentFeedTree.length === 0) {
      selectTriggerText.textContent = "No feeds";
      selectTriggerIcon.src = "128.png"; 
      emptyMessage.innerText = "Please add feeds in the settings.";
      emptyMessage.classList.remove('hidden');
      loadingSpinner.classList.add('hidden');
      return;
    }
    
    let activeFeedName = "Select Feed";
    let activeFeedIcon = "128.png";
    let activeFeedIsSet = false;
    const renderedFolderNames = new Set(); // <-- FIX: Track rendered folder names

    function renderOptions(nodes, level = 0) {
      nodes.forEach(node => {
        if (!node || !node.id) { 
          return;
        }

        if (node.type === 'folder') {
          // Check if this folder has already been rendered at this level to prevent duplicates
          // (Though duplicates shouldn't exist in a clean tree)
          
          const header = document.createElement('li');
          header.className = 'folder-option-header';
          header.style.paddingLeft = `${level * 12 + 10}px`;
          header.innerHTML = `<span>📁 ${decodeHTML(node.name)}</span>`;
          selectOptions.appendChild(header);
          
          if (node.children && node.children.length > 0) {
            renderOptions(node.children, level + 1);
          }
        } else if (node.type === 'feed') {
          const li = document.createElement('li');
          li.dataset.id = node.id; 
          li.classList.add('feed-option');
          if (level > 0) li.classList.add('in-folder');
          li.style.paddingLeft = `${level * 12 + 10}px`;
        
          const count = unreadCounts[node.id] || 0;
          const faviconUrl = getFaviconUrl(node.url); 

          li.innerHTML = `
            <img src="${faviconUrl}" class="feed-favicon" alt="" onerror="this.src='128.png'">
            <span class="feed-option-name">${escapeHTML(decodeHTML(node.name))}</span>
            ${count > 0 ? `<span class="option-count">(${count})</span>` : ''}
          `;
          
          li.addEventListener('click', async (e) => {
            e.stopPropagation(); 
            const newFeedId = li.dataset.id;
            
            const currentCount = unreadCounts[node.id] || 0;
            const countText = (currentCount > 0) ? ` (${currentCount})` : '';
            selectTriggerText.textContent = decodeHTML(node.name) + countText; 
            
            selectTriggerIcon.src = faviconUrl;
            selectTriggerIcon.onerror = () => { selectTriggerIcon.src = '128.png'; };
            selectOptions.classList.add('hidden');
            
            await switchActiveFeed(newFeedId);
          });
          
          selectOptions.appendChild(li);
          
          if (String(node.id) === String(activeFeedId)) {
            activeFeedName = (count > 0) ? `${decodeHTML(node.name)} (${count})` : decodeHTML(node.name);
            activeFeedIcon = faviconUrl;
            activeFeedIsSet = true;
          }
        }
      });
    }

    renderOptions(currentFeedTree);
    
    if (activeFeedIsSet) {
      selectTriggerText.textContent = activeFeedName;
      selectTriggerIcon.src = activeFeedIcon;
      selectiveRefreshButton.classList.remove('hidden'); // Show selective refresh
    } else {
      // If we have an activeFeedId but it wasn't found in the current tree (yet),
      // we don't want to show "Select Feed" if we can help it.
      // But for now, we reset to default.
      selectTriggerText.textContent = "Select Feed";
      selectTriggerIcon.src = "128.png";
      selectiveRefreshButton.classList.add('hidden'); // Hide selective refresh
    }
    
  } catch (error) {
    console.error("Error filling feed selector:", error);
  }
}

// Ensures posts for the active feed are retrieved (from allPosts or directly refreshed from Desktop)
async function syncActiveFeedPosts(feedId) {
  if (!feedId) return [];
  const strFeedId = String(feedId);
  const { allPosts = {} } = await chrome.storage.local.get('allPosts');
  let posts = allPosts[strFeedId] || allPosts[feedId] || [];

  // If not found by direct ID, check all keys with string conversion or by node URL or email account matching
  if (!posts || posts.length === 0) {
    for (const k in allPosts) {
      if (String(k) === strFeedId) {
        posts = allPosts[k];
        break;
      }
    }
  }

  if (!posts || posts.length === 0) {
    const node = findNodeById(currentFeedTree, feedId);
    if (node && node.url) {
      if (allPosts[node.url]) {
        posts = allPosts[node.url];
      } else {
        const normUrl = node.url.trim().replace(/\/+$/, '');
        for (const k in allPosts) {
          if (k.trim().replace(/\/+$/, '') === normUrl) {
            posts = allPosts[k];
            break;
          }
        }
      }
    }
    if ((!posts || posts.length === 0) && node) {
      for (const k in allPosts) {
        const pList = allPosts[k];
        if (Array.isArray(pList) && pList.length > 0) {
          if (String(pList[0].feedId) === strFeedId || (node.isEmail && String(pList[0].accountId) === String(node.emailAccountId || strFeedId.replace('email_', '')))) {
            posts = pList;
            break;
          }
        }
      }
    }
  }

  // If still empty and Desktop is reachable, trigger on-demand refresh and poll
  if (!posts || posts.length === 0) {
    const st = await SatelliteBridge.checkStatus(300);
    if (st.connected) {
      SatelliteBridge.refresh(feedId).catch(() => {});
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 450));
        const fresh = await SatelliteBridge.fetchData();
        if (fresh && fresh.allPosts) {
          const freshPosts = fresh.allPosts[strFeedId] || fresh.allPosts[feedId];
          if (freshPosts && freshPosts.length > 0) {
            posts = freshPosts;
            await chrome.storage.local.set({
              allPosts: fresh.allPosts,
              unreadCounts: fresh.unreadCounts || {},
              posts: posts
            });
            return posts;
          }
        }
      }
    }
  }

  await chrome.storage.local.set({ posts: posts || [] });
  return posts || [];
}

// Logic for switching the active feed
async function switchActiveFeed(newFeedId) {
  const pList = document.getElementById('posts-list') || container;
  pList.innerHTML = ''; 
  loadingSpinner.classList.remove('hidden');
  emptyMessage.classList.add('hidden');
  searchBox.value = ""; 
  scanResultsContainer.classList.add('hidden'); 
  scanResultsContainer.innerHTML = '';

  try {
    await chrome.storage.sync.set({ activeFeedId: newFeedId });
    await syncActiveFeedPosts(newFeedId);
    await loadPostsFromStorage();
    await populateFeedSelector(); // Ensure counts and buttons are in sync
    
    // Background refetch of missing images for the selected feed
    if (newFeedId) {
      chrome.runtime.sendMessage({ action: "refetchOgImages", feedId: newFeedId }).catch(() => {});
    }
  } catch (error) {
    console.error("Error changing feed:", error);
    emptyMessage.innerText = "Error loading posts.";
    emptyMessage.classList.remove('hidden');
  } finally {
    loadingSpinner.classList.add('hidden');
  }
}

// Logic for triggering a refresh
async function triggerRefresh(isSelective = false) {
  const targetButton = isSelective ? selectiveRefreshButton : refreshButton;
  if (targetButton.disabled) return;

  targetButton.classList.add('is-loading');
  targetButton.disabled = true;
  
  const pList = document.getElementById('posts-list') || container;
  pList.innerHTML = '';
  loadingSpinner.classList.remove('hidden');
  emptyMessage.classList.add('hidden');
  searchBox.value = ""; 
  scanResultsContainer.classList.add('hidden'); 
  scanResultsContainer.innerHTML = '';
  
  try {
    const { activeFeedId } = await chrome.storage.sync.get('activeFeedId');
    const st = await SatelliteBridge.checkStatus(400);
    if (st.connected) {
      await SatelliteBridge.refresh(isSelective ? activeFeedId : null);
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 500));
        const fresh = await SatelliteBridge.fetchData();
        if (fresh) {
          currentFeedTree = fresh.feedTree || [];
          await chrome.storage.local.set({
            feedTree: fresh.feedTree || [],
            allPosts: fresh.allPosts || {},
            readLinks: fresh.readLinks || [],
            unreadCounts: fresh.unreadCounts || {}
          });
          const currentFeedPosts = await syncActiveFeedPosts(activeFeedId);
          if (currentFeedPosts && currentFeedPosts.length > 0) {
            break;
          }
        }
      }
    } else {
      const action = isSelective ? "forceFetchSingle" : "forceFetch";
      const payload = isSelective ? { action, feedId: activeFeedId } : { action };
      await chrome.runtime.sendMessage(payload);
    }
    await populateFeedSelector();
    await loadPostsFromStorage();
  } catch (error) {
    console.error("Refresh failed:", error);
    emptyMessage.innerText = "Error loading.";
    emptyMessage.classList.remove('hidden');
  } finally {
    loadingSpinner.classList.add('hidden');
    targetButton.classList.remove('is-loading');
    targetButton.disabled = false;
  }
}

// Loads posts from chrome.storage
async function loadPostsFromStorage() {
  const container = document.getElementById('posts-container');
  const pList = document.getElementById('posts-list') || container;
  const scrollPos = container ? container.scrollTop : 0;

  const { posts = [], readLinks = [], favoritedLinks = [] } = await chrome.storage.local.get(['posts', 'readLinks', 'favoritedLinks']);
  const { rules = [] } = await chrome.storage.sync.get(['rules']);

  const readLinksSet = new Set(readLinks);
  const favoritedLinksSet = new Set(favoritedLinks);

  pList.innerHTML = '';

  // NEW: Re-apply rules to ensure matches are up-to-date
  if (rules.length > 0) {
      posts.forEach(post => {
          applyRulesToPost(post, rules, readLinksSet);
      });
  }

  // Filter posts that should be hidden
  const visiblePosts = posts.filter(post => !post.isHidden);

  if (visiblePosts.length === 0) {
    loadingSpinner.classList.add('hidden');
    if (selectTriggerText.textContent !== "No feeds") {
      emptyMessage.innerText = "No posts found.";
      emptyMessage.classList.remove('hidden');
    }
    return;
  }

  loadingSpinner.classList.add('hidden');
  emptyMessage.classList.add('hidden');

  visiblePosts.forEach(post => {
    const isRead = readLinksSet.has(post.link);
    const isFavorited = favoritedLinksSet.has(post.link);
    // Check if the new matchedRules array has entries
    const isKeywordMatch = post.matchedRules && post.matchedRules.length > 0; 
    
    const postElement = createPostElement(post, isRead, isFavorited, isKeywordMatch); 
    
    addTitleClickListener(postElement, post); 
    addFavoriteMarkerListener(postElement, post);
    addReaderModeListener(postElement, post);
    addMarkAsUnreadListener(postElement, post);
    addSummaryBtnListener(postElement, post);
    
    pList.appendChild(postElement);
  });
  
  handleSearch();

  // Restore scroll position
  if (container) {
    container.scrollTop = scrollPos;
  }
}

/**
 * NEW: Adds the click listener for the Summary button (Clipboard)
 */
function addSummaryBtnListener(element, post) {
   const summaryBtn = element.querySelector('.summary-btn');
   if (!summaryBtn) return;

   // Check initial state
   chrome.storage.local.get('summaryLinks', (data) => {
     const summaryLinks = data.summaryLinks || [];
     if (summaryLinks.includes(post.link)) {
       summaryBtn.classList.add('active');
       summaryBtn.title = 'Remove from summary list';
     }
   });

   summaryBtn.addEventListener('click', async (e) => {
     e.stopPropagation();
     e.preventDefault();

     const { summaryLinks = [] } = await chrome.storage.local.get('summaryLinks');
    const index = summaryLinks.indexOf(post.link);

    if (index > -1) {
      summaryLinks.splice(index, 1);
      summaryBtn.classList.remove('active');
      summaryBtn.title = 'Add to summary list';
    } else {
      summaryLinks.push(post.link);
      summaryBtn.classList.add('active');
      summaryBtn.title = 'Remove from summary list';
    }

    await chrome.runtime.sendMessage({ action: "safeStorageSet", key: "summaryLinks", data: summaryLinks });
  });
}

/**
 * NEW: Adds the click listener for "Mark as unread"
 */
function addMarkAsUnreadListener(element, post) {
  const unreadBtn = element.querySelector('.mark-unread-btn');
  
  unreadBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    
    element.classList.remove('read'); // Visually mark as unread immediately

    try {
      const { readLinks = [] } = await chrome.storage.local.get('readLinks');
      const updatedReadLinks = readLinks.filter(link => link !== post.link);
      await chrome.storage.local.set({ readLinks: updatedReadLinks });
      
      // Sync to PureTidings Desktop
      SatelliteBridge.markRead(post.link, false).catch(() => {});

      // Manually increase the counter
      await updateCountsAfterLocalChange(1);
    } catch (error) {
      console.error("Error marking post as unread:", error);
    }
  });
}

/**
 * NEW: Adjusts the counters after a local change
 */
async function updateCountsAfterLocalChange(countChange) {
  try {
    let { unreadCounts = {} } = await chrome.storage.local.get('unreadCounts');
    const { activeFeedId } = await chrome.storage.sync.get('activeFeedId');

    // Update the counter for the current feed
    const fid = String(activeFeedId);
    if (unreadCounts[fid] !== undefined) {
      unreadCounts[fid] = Math.max(0, unreadCounts[fid] + countChange);
    } else if (unreadCounts[activeFeedId] !== undefined) {
      unreadCounts[activeFeedId] = Math.max(0, unreadCounts[activeFeedId] + countChange);
    } else if (countChange > 0) {
      unreadCounts[fid] = countChange;
    }
    
    await chrome.storage.local.set({ unreadCounts });

    // Update the global badge counter
    const badgeText = await chrome.action.getBadgeText({});
    const currentBadgeCount = parseInt(badgeText, 10) || 0;
    const newBadgeCount = Math.max(0, currentBadgeCount + countChange);
    
    await chrome.action.setBadgeText({ text: newBadgeCount > 0 ? newBadgeCount.toString() : '' });

    // Reload the dropdown to show the updated counter
    await populateFeedSelector();
  } catch (error) {
    console.error("Error updating counts locally:", error);
  }
}

/**
 * NEW: Central function for marking as read
 */
async function markPostAsRead(element, postLink) {
  const wasAlreadyRead = element.classList.contains('read');
  element.classList.add('read'); // Mark visually immediately

  if (wasAlreadyRead) return; // Do nothing further

  try {
    let { readLinks = [], unreadCounts = {} } = await chrome.storage.local.get(['readLinks', 'unreadCounts']);
    const { activeFeedId } = await chrome.storage.sync.get('activeFeedId'); 

    if (!readLinks.includes(postLink)) {
      readLinks.push(postLink);

      // Reduce badge counter
      const badgeText = await chrome.action.getBadgeText({});
      const currentBadgeCount = parseInt(badgeText, 10);
      if (!isNaN(currentBadgeCount) && currentBadgeCount > 0) {
        await chrome.action.setBadgeText({ text: (currentBadgeCount > 1) ? (currentBadgeCount - 1).toString() : '' });
      } else {
        await chrome.action.setBadgeText({ text: '' });
      }

      // Reduce dropdown counter
      const fid = String(activeFeedId);
      if (unreadCounts[fid] && unreadCounts[fid] > 0) {
        unreadCounts[fid]--;
      } else if (unreadCounts[activeFeedId] && unreadCounts[activeFeedId] > 0) {
        unreadCounts[activeFeedId]--;
      }

      // Save both changes
      await chrome.storage.local.set({ readLinks: readLinks, unreadCounts: unreadCounts });
      
      // Sync to PureTidings Desktop
      SatelliteBridge.markRead(postLink, true).catch(() => {});

      // Reload dropdown to show counter
      await populateFeedSelector(); 
    }
  } catch (error) {
    console.error("Error marking post as read:", error);
  }
}

/**
 * Adds the click listener for "Read" ONLY to the title link
 */
async function addTitleClickListener(element, post) {
  const titleLink = element.querySelector('.post-title');
  if (!titleLink) return;
  
  titleLink.addEventListener('click', async (event) => {
    event.preventDefault();
    await markPostAsRead(element, post.link);

    // If it's an IMAP email, always open in Desktop Reader Mode
    if (post.isEmail || (post.link && post.link.startsWith('imap:'))) {
      const st = await SatelliteBridge.checkStatus(400);
      if (st.connected) {
        await SatelliteBridge.openArticle(post.link, post.title, post.feedId);
      }
      return;
    }

    chrome.tabs.create({ url: post.link, active: false });
  });
}

/**
 * Adds the click listener for "Favorite"
 */
function addFavoriteMarkerListener(element, post) {
  const starBtn = element.querySelector('.favorite-btn');
  
  starBtn.addEventListener('click', async (e) => {
    e.stopPropagation(); 
    e.preventDefault();
    
    const isFavorited = starBtn.classList.contains('favorited');
    const { favoritedLinks = [] } = await chrome.storage.local.get('favoritedLinks');
    
    if (isFavorited) {
      const newLinks = favoritedLinks.filter(link => link !== post.link);
      await chrome.runtime.sendMessage({ action: "safeStorageSet", key: "favoritedLinks", data: newLinks });
      starBtn.classList.remove('favorited');
      starBtn.innerHTML = '&#9734;'; 
      starBtn.title = 'Add to favorites';
    } else {
      favoritedLinks.push(post.link);
      await chrome.runtime.sendMessage({ action: "safeStorageSet", key: "favoritedLinks", data: favoritedLinks });
      starBtn.classList.add('favorited');
      starBtn.innerHTML = '&#9733;'; 
      starBtn.title = 'Remove from favorites';
    }
  });
}

/**
 * Adds the click listener for "Reader Mode" (CHANGED)
 */
function addReaderModeListener(element, post) {
  const readBtn = element.querySelector('.read-mode-btn');
  if (!readBtn) return;
  
  readBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    
    try {
      await markPostAsRead(element, post.link);
      
      const st = await SatelliteBridge.checkStatus(400);
      if (st.connected) {
        await SatelliteBridge.openArticle(post.link, post.title, post.feedId);
        return;
      }
      
      // Fallback if desktop offline and not email
      if (!post.isEmail && !(post.link && post.link.startsWith('imap:'))) {
        const readerUrl = `reader.html?url=${encodeURIComponent(post.link)}&description=${encodeURIComponent(post.description || '')}&title=${encodeURIComponent(post.title || '')}&videoLength=${encodeURIComponent(post.videoLength || '')}&featuredImage=${encodeURIComponent(post.featuredImage || '')}&source=${encodeURIComponent(post.feedName || '')}&feedId=${encodeURIComponent(post.feedId)}&fullContentHtmlText=${encodeURIComponent(post.fullContentHtml || '')}`;
        chrome.tabs.create({ url: readerUrl });
      }
      
    } catch (error) {
      console.error("Error in reader button listener:", error);
    }
  });
}

/**
 * Filters the displayed posts based on the search input
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function handleSearch() {
  const searchInput = searchBox.value.trim();
  const searchTerms = searchInput.split(',').map(t => t.trim()).filter(t => t.length > 0);

  const searchConditionGroups = searchTerms.map(term => {
    const conditions = [];
    let currentMustNot = false;
    const components = term.split(/(?:^|\s)(\+|\-)/);
    
    components.forEach(comp => {
        const trimmed = comp.trim();
        if (trimmed === '+') {
            currentMustNot = false;
        } else if (trimmed === '-') {
            currentMustNot = true;
        } else if (trimmed !== '') {
            const escapedTerm = escapeRegExp(trimmed).replace(/\\\*/g, '.*');
            conditions.push({
                regex: new RegExp(escapedTerm, 'i'),
                mustNot: currentMustNot
            });
        }
    });
    return conditions;
  }).filter(group => group.length > 0);

  const posts = container.querySelectorAll('.post-item');
  let visibleCount = 0;

  posts.forEach(post => {
    // Only consider posts that are not hidden by rules
    if (post.dataset.isHidden === 'true') {
      post.style.display = 'none';
      return;
    }

    let isVisible = false;
    if (searchConditionGroups.length === 0) {
        isVisible = true;
    } else {
        const postData = post.postData || {};
        const textToSearch = `${postData.title || ''} ${postData.description || ''} ${postData.link || ''}`;

        isVisible = searchConditionGroups.some(group => {
            return group.every(cond => {
                const isMatch = cond.regex.test(textToSearch);
                return cond.mustNot ? !isMatch : isMatch;
            });
        });
    }

    post.style.display = isVisible ? 'flex' : 'none';
    if (isVisible) visibleCount++;
  });

  const originalMessage = "No posts found.";
  if (posts.length > 0 && visibleCount === 0) {
    emptyMessage.textContent = "No posts match your search.";
    emptyMessage.classList.remove('hidden');
  } else if (posts.length > 0 && visibleCount > 0) {
    emptyMessage.classList.add('hidden');
  } else if (posts.length === 0 && !loadingSpinner.classList.contains('hidden')) {
     emptyMessage.classList.add('hidden');
  } else if (posts.length === 0 && searchBox.value.length > 0) {
     emptyMessage.textContent = originalMessage; 
     emptyMessage.classList.remove('hidden');
  }
}

/**
 * Sends a message to the service worker to scan the page
 */
async function handleScanPage(e) {
  e.preventDefault();
  
  if (isScanning) return; // Prevent re-execution if a scan is already running
  isScanning = true;
  
  scanPageButton.disabled = true;
  scanPageButton.style.opacity = '0.5'; 
  showFooterStatus('Scanning page for feeds...');

  try {
    const response = await chrome.runtime.sendMessage({ action: "scanCurrentPage" });
    if (response.status === 'ok') {
      hideFooterStatus();
      displayScanResults(response.data);
    } else {
      throw new Error(response.message);
    }
  } catch (error) {
    showFooterStatus(`Error: ${error.message}`, true);
    scanResultsContainer.classList.add('hidden');
    scanResultsContainer.innerHTML = '';
  } finally {
    scanPageButton.disabled = false; 
    scanPageButton.style.opacity = '1'; 
    isScanning = false; // Release the lock
  }
}

/**
 * Displays a status message in the footer
 */
function showFooterStatus(message, isError = false) {
  footerStatus.textContent = message;
  footerStatus.className = isError ? 'error' : '';
  footerStatus.classList.remove('hidden');
}

/**
 * Hides the status message in the footer
 */
function hideFooterStatus() {
  footerStatus.classList.add('hidden');
}

/**
 * Displays the scan results in the popup
 */
async function displayScanResults(foundFeeds, errorMsg = null) {
  scanResultsContainer.innerHTML = ''; 
  scanResultsContainer.classList.remove('hidden');

  // Flatten currentFeedTree to get existing URLs
  const allExistingFeeds = [];
  function collectFeeds(nodes) {
    nodes.forEach(node => {
      if (!node) return;
      if (node.type === 'feed') allExistingFeeds.push(node);
      if (node.type === 'folder' && node.children) collectFeeds(node.children);
    });
  }
  collectFeeds(currentFeedTree);
  const existingUrls = new Set(allExistingFeeds.map(f => f.url));

  if (errorMsg) {
    scanResultsContainer.innerHTML = `<p>${errorMsg}</p>`;
    return;
  }

  if (!foundFeeds || foundFeeds.length === 0) {
    scanResultsContainer.innerHTML = `<p>No feeds found on this page.</p>`;
    return;
  }

  const realFeeds = foundFeeds.filter(f => !f.isCurrentPage);
  const currentPageFallback = foundFeeds.find(f => f.isCurrentPage);

  if (realFeeds.length === 0 && currentPageFallback) {
    const hint = document.createElement('p');
    hint.style.fontSize = '12px';
    hint.style.marginBottom = '8px';
    hint.style.color = '#666';
    hint.textContent = "No feed links found in page head. Add current URL?";
    scanResultsContainer.appendChild(hint);
  }

  foundFeeds.forEach(feed => {
    const item = document.createElement('div');
    item.className = 'found-feed-item';

    let title = feed.title || feed.url;
    if (title.length > 40) title = title.substring(0, 37) + '...';

    const isAlreadyAdded = existingUrls.has(feed.url);

    item.innerHTML = `
      <span title="${feed.url}">${feed.isCurrentPage ? 'Current URL: ' : ''}${title}</span>
      <button data-url="${feed.url}" data-title="${feed.title || feed.url}" ${isAlreadyAdded ? 'disabled' : ''}>
        ${isAlreadyAdded ? 'Added' : 'Add'}
      </button>
    `;

    item.querySelector('button').addEventListener('click', async (e) => {
      const btn = e.target;
      const url = btn.dataset.url;
      let title = btn.dataset.title;

      if (!title || title === url || title === "Current Page URL") {
        try { title = new URL(url).hostname; } catch (e) { title = "New Feed"; }
      }

      btn.textContent = 'Adding...';
      btn.disabled = true;

      const response = await chrome.runtime.sendMessage({
        action: "addFeed",
        feed: { name: title, url: url, type: 'feed' } 
      });

      if (response && response.status === 'ok') {
        btn.textContent = 'Added';
        // Re-fetch feedTree after adding a new feed
        const localData = await chrome.storage.local.get('feedTree');
        currentFeedTree = localData.feedTree || [];
        await populateFeedSelector();
      } else {
        btn.textContent = 'Error';
        btn.style.backgroundColor = '#d93025';
        showFooterStatus(response.message || "Could not add feed.", true);
        setTimeout(() => {
          btn.textContent = 'Add';
          btn.style.backgroundColor = '';
          btn.disabled = false;
        }, 3000);
      }
    });

    scanResultsContainer.appendChild(item);
  });
}

async function handleAiAnalyzePage(e) {
  e.preventDefault();
  showFooterStatus('Analyzing page content...');
  aiAnalyzePageButton.disabled = true;
  aiAnalyzePageButton.style.opacity = '0.5';

  try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) throw new Error("No active tab found.");

      const isYoutube = tab.url.includes('youtube.com/watch') || tab.url.includes('youtube.com/shorts/') || tab.url.includes('youtu.be/');
      let contentToAnalyze = "";
      let promptToUse = "";
      let pageTitle = tab.title || "Unknown Title";

      if (isYoutube) {
          let videoId = "";
          if (tab.url.includes('v=')) {
              videoId = new URL(tab.url).searchParams.get('v');
          } else if (tab.url.includes('shorts/')) {
              videoId = tab.url.split('shorts/')[1].split('?')[0].split('/')[0];
          } else if (tab.url.includes('youtu.be/')) {
              videoId = tab.url.split('youtu.be/')[1].split('?')[0];
          }

          if (!videoId) throw new Error("Could not extract YouTube Video ID.");

          const transcriptResponse = await chrome.runtime.sendMessage({ action: "fetchYoutubeTranscript", videoId });
          if (transcriptResponse.status === 'ok') {
              contentToAnalyze = extractTextFromTranscript(transcriptResponse.xml);
          }

          if (!contentToAnalyze || contentToAnalyze.length < 50) {
              const [{ result }] = await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: () => {
                      const title = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent || document.title;
                      const desc = document.querySelector('#description-inline-expander')?.textContent || "";
                      return `${title}\n\n${desc}`;
                  }
              });
              contentToAnalyze = result;
          }

          const { youtubeAiPrompt } = await chrome.storage.sync.get('youtubeAiPrompt');
          promptToUse = youtubeAiPrompt || "Summarize this video briefly and concisely.";
      } else {
          // Web page: Extract clean text using Readability in the popup context
          const [{ result }] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => document.documentElement.outerHTML
          });
          const doc = new DOMParser().parseFromString(result, 'text/html');
          const reader = new Readability(doc);
          const article = reader.parse();
          if (article && article.textContent) {
              contentToAnalyze = article.textContent;
              pageTitle = article.title || pageTitle;
          } else {
              // Fallback to simple innerText if Readability fails
              const [{ innerText }] = await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: () => document.body.innerText
              });
              contentToAnalyze = innerText;
          }
          
          const { customAiPrompt } = await chrome.storage.sync.get('customAiPrompt');
          promptToUse = customAiPrompt || "Summarize this article briefly and concisely.";
      }

      if (!contentToAnalyze || contentToAnalyze.trim().length < 20) {
          throw new Error("Could not extract enough content to analyze this page.");
      }

      const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');
      const models = await getAvailableGeminiModels(geminiApiKey);
      
      aiReportContent.innerHTML = '<div id="loading-spinner"></div><p style="text-align:center">AI is thinking...</p>';
      aiReportContainer.classList.remove('hidden');
      container.classList.add('hidden');
      scanResultsContainer.classList.add('hidden');

      let success = false;
      // Reinforce structure and language in the prompt
      const finalPrompt = `INSTRUCTION: ${promptToUse}\n\nFORMATTING RULE: Always use Markdown (Headers with #, Bold with **, Lists with *). Provide a well-structured summary.\n\nLANGUAGE: Respond ONLY in the language requested in the instruction (German if specified).\n\nTITLE: ${pageTitle}\n\nCONTENT:\n${contentToAnalyze.substring(0, 35000)}\n\nREMINDER: ${promptToUse} - Use Markdown formatting.`;

      for (const model of models) {
          try {
              const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      contents: [{ parts: [{ text: finalPrompt }] }]
                  })
              });
              if (!response.ok) continue;
              const data = await response.json();
              const rawMarkdown = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (rawMarkdown) {
                  currentAiRawMarkdown = rawMarkdown;
                  aiReportContent.innerHTML = formatMarkdownToHtml(rawMarkdown);
                  success = true;
                  break;
              }
          } catch (err) { console.error(`Error with model ${model}:`, err); }
      }
      if (!success) throw new Error("AI analysis failed. Please check your API key and connection.");
      hideFooterStatus();
  } catch (error) {
      showFooterStatus(`Error: ${error.message}`, true);
      aiReportContainer.classList.add('hidden');
      container.classList.remove('hidden');
  } finally {
      aiAnalyzePageButton.disabled = false;
      aiAnalyzePageButton.style.opacity = '1';
  }
}

function extractTextFromTranscript(data) {
    if (!data) return "";
    try {
        const json = JSON.parse(data);
        if (json.events) {
            return json.events
                .filter(e => e.segs)
                .map(e => e.segs.map(s => s.utf8).join(""))
                .join(" ");
        }
    } catch (e) {}

    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(data, "text/xml");
        let nodes = Array.from(xmlDoc.getElementsByTagName("p"));
        if (nodes.length === 0) {
            nodes = Array.from(xmlDoc.getElementsByTagName("text"));
        }

        if (nodes.length > 0) {
            let fullText = "";
            for (let i = 0; i < nodes.length; i++) {
                fullText += decodeHTML(nodes[i].textContent) + " ";
            }
            return fullText.trim();
        }
    } catch (e) {
        console.error("XML Parse error", e);
    }
    return "";
}

function formatMarkdownToHtml(md) {
  if (!md) return "";
  let html = md
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^\s*[\*\-]\s+(.*$)/gim, '<li>$1</li>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank">$1</a>');

  // Group <li> tags into <ul>
  html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\n?<ul>/gim, '');
  
  // Add newlines as breaks last
  html = html.replace(/\n/gim, '<br>');
  return html;
}

/**
 * NEW: Checks for sync storage quota warnings and displays a banner
 */
async function checkSyncWarnings() {
    const keys = ['feedTree', 'favoritedLinks', 'summaryLinks'];
    const banner = document.getElementById('sync-warning-banner');
    if (!banner) return;

    const warnings = await chrome.storage.local.get(keys.map(k => `quotaWarning_${k}`));
    
    let highestLevel = null;
    let message = '';
    
    for (const key of keys) {
        const quota = warnings[`quotaWarning_${key}`];
        if (quota && quota.level !== 'green') {
            const label = key === 'feedTree' ? 'Feeds' : (key === 'favoritedLinks' ? 'Favorites' : 'Summary');
            if (quota.level === 'red') {
                highestLevel = 'red';
                message = `Sync FULL for ${label}! Please cleanup.`;
                break;
            } else if (!highestLevel) {
                highestLevel = 'yellow';
                message = `Sync for ${label} is 80% full.`;
            }
        }
    }
    
    if (highestLevel) {
        banner.textContent = message;
        banner.className = highestLevel;
        banner.classList.remove('hidden');

        // Add click listener to open settings
        banner.onclick = () => {
            const optionsUrl = chrome.runtime.getURL('options.html');
            chrome.windows.create({
                url: optionsUrl,
                type: 'popup',
                width: 550,
                height: 750
            });
        };
    } else {
        banner.classList.add('hidden');
    }
}

