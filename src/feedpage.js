// Global DOM Elements
const container = document.getElementById('all-feeds-container');
const loadingSpinner = document.getElementById('loading-spinner');
const emptyMessage = document.getElementById('empty-message');
const pageTitleH2 = document.getElementById('page-title');
const searchBox = document.getElementById('search-box');

// New Navigation Elements
const navAll = document.getElementById('nav-all');
const navUnread = document.getElementById('nav-unread');
const navFavorites = document.getElementById('nav-favorites');
const navKeywords = document.getElementById('nav-keywords');
const navSummary = document.getElementById('nav-summary');
const sidebarSettingsBtn = document.getElementById('sidebar-settings-btn');
const navLinks = [navAll, navUnread, navFavorites, navKeywords, navSummary];

// Summary Toolbar Elements
const summaryToolbar = document.getElementById('summary-toolbar');
const summaryDateFilter = document.getElementById('summary-date-filter');
const customRangeContainer = document.getElementById('custom-range-container');
const filterDateFrom = document.getElementById('filter-date-from');
const filterTimeFrom = document.getElementById('filter-time-from');
const filterDateTo = document.getElementById('filter-date-to');
const filterTimeTo = document.getElementById('filter-time-to');
const exportFormat = document.getElementById('export-format');
const copySummaryBtn = document.getElementById('copy-summary-btn');
const downloadSummaryBtn = document.getElementById('download-summary-btn');
const fullViewSummaryBtn = document.getElementById('full-view-summary-btn');
const clearSummaryBtn = document.getElementById('clear-summary-btn');
const copyStatus = document.getElementById('copy-status');

// AI Report DOM Elements
const generateAiReportBtn = document.getElementById('generate-ai-report-btn');
const aiReportContainer = document.getElementById('ai-report-container');
const aiReportContent = document.getElementById('ai-report-content');
const copyAiReportBtn = document.getElementById('copy-ai-report-btn');
const closeAiReportBtn = document.getElementById('close-ai-report-btn');
const downloadAiReportBtn = document.getElementById('download-ai-report-btn');
const exportAiFormat = document.getElementById('export-ai-format');
const aiCustomPromptInput = document.getElementById('ai-custom-prompt-val');
const aiGenerateWithPromptBtn = document.getElementById('ai-generate-with-prompt-btn');

let currentAiRawMarkdown = '';

const BADGE_COLOR_DEFAULT = '#0066CC';

// Global Data Stores
let allPostsData = {};
let currentFeedTree = [];
let readLinksSet = new Set();
let favoritedLinksSet = new Set();
let summaryLinksSet = new Set();
let unreadCounts = {};
let currentViewMode = 'all';
let summarySubMode = 'list'; // 'list' or 'report'
let reportObserver = null;
const fetchQueue = [];
let isFetching = false;

// UI State preservation (persisted so manually opened/collapsed state is kept)
let expandedFeeds = new Set();
let collapsedFolders = new Set();
try {
  expandedFeeds = new Set(JSON.parse(localStorage.getItem('puretidings_expanded_feeds') || '[]'));
  collapsedFolders = new Set(JSON.parse(localStorage.getItem('puretidings_collapsed_folders') || '[]'));
} catch (_) {}

/**
 * Initializes the page on load
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    initReportObserver();
    const scrollToTopBtn = document.getElementById('scroll-to-top');
    const [storageData, syncData] = await Promise.all([
      chrome.storage.local.get(['allPosts', 'readLinks', 'unreadCounts', 'feedTree', 'favoritedLinks', 'summaryLinks']),
      chrome.storage.sync.get(['geminiApiKey', 'rules'])
    ]);

    allPostsData = storageData.allPosts || {};
    currentFeedTree = storageData.feedTree || [];
    readLinksSet = new Set(storageData.readLinks || []);
    favoritedLinksSet = new Set(storageData.favoritedLinks || []);
    summaryLinksSet = new Set(storageData.summaryLinks || []);
    unreadCounts = storageData.unreadCounts || {};

    // NEW: Re-apply rules to existing posts so new rules work immediately
    const rules = syncData.rules || [];
    if (rules.length > 0) {
        for (const feedId in allPostsData) {
            allPostsData[feedId].forEach(post => {
                applyRulesToPost(post, rules, readLinksSet);
            });
        }
    }

    // Show AI Report button only if API Key is set
    if (syncData.geminiApiKey && syncData.geminiApiKey.trim() !== '') {
        generateAiReportBtn.classList.remove('hidden');
    }

    // Set up event listeners
    searchBox.addEventListener('input', handlePageSearch);
    sidebarSettingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    container.addEventListener('click', handleTreeToggle);
    setupNavEventListeners();
    setupSummaryEventListeners();
    setupScrollToTop(scrollToTopBtn);

    // Add storage listener for real-time updates
    chrome.storage.onChanged.addListener(async (changes, area) => {
      const relevantKeys = ['allPosts', 'readLinks', 'unreadCounts', 'feedTree', 'favoritedLinks', 'summaryLinks'];
      const isRelevantLocal = area === 'local' && relevantKeys.some(key => changes[key]);
      const isRelevantSync = area === 'sync' && (changes.rules || changes.geminiApiKey);

      if (isRelevantLocal || isRelevantSync) {
        const [storageData, syncData] = await Promise.all([
          chrome.storage.local.get(relevantKeys),
          chrome.storage.sync.get(['rules', 'geminiApiKey'])
        ]);

        allPostsData = storageData.allPosts || {};
        currentFeedTree = storageData.feedTree || [];
        readLinksSet = new Set(storageData.readLinks || []);
        favoritedLinksSet = new Set(storageData.favoritedLinks || []);
        summaryLinksSet = new Set(storageData.summaryLinks || []);
        unreadCounts = storageData.unreadCounts || {};

        if (syncData.geminiApiKey && syncData.geminiApiKey.trim() !== '') {
            generateAiReportBtn.classList.remove('hidden');
        } else {
            generateAiReportBtn.classList.add('hidden');
        }

        const rules = syncData.rules || [];
        if (rules.length > 0) {
            for (const feedId in allPostsData) {
                allPostsData[feedId].forEach(post => {
                    applyRulesToPost(post, rules, readLinksSet);
                });
            }
        }

        // Refresh the current view with scroll preservation
        switchView(currentViewMode, true);
      }
    });

    // Check for view mode from URL param, otherwise default to 'all'
    const params = new URLSearchParams(window.location.search);
    const viewMode = params.get('view') || 'all';
    switchView(viewMode);

  } catch (error) {
    console.error("Error loading data for feed page:", error);
    showError("Error loading data.");
  }
});

/**
 * Sets up the navigation link event listeners.
 */
function setupNavEventListeners() {
  navAll.addEventListener('click', (e) => { e.preventDefault(); switchView('all'); });
  navUnread.addEventListener('click', (e) => { e.preventDefault(); switchView('unread'); });
  navFavorites.addEventListener('click', (e) => { e.preventDefault(); switchView('favorites'); });
  navKeywords.addEventListener('click', (e) => { e.preventDefault(); switchView('keywords'); });
  navSummary.addEventListener('click', (e) => { e.preventDefault(); switchView('summary'); });
}

function setupSummaryEventListeners() {
  summaryDateFilter.addEventListener('change', () => {
    customRangeContainer.classList.toggle('hidden', summaryDateFilter.value !== 'custom');
    switchView(currentViewMode, true);
  });
  
  [filterDateFrom, filterTimeFrom, filterDateTo, filterTimeTo].forEach(el => {
    el.addEventListener('change', () => {
        switchView(currentViewMode, true);
    });
  });

  copySummaryBtn.addEventListener('click', handleCopySummary);
  downloadSummaryBtn.addEventListener('click', handleDownloadSummary);
  clearSummaryBtn.addEventListener('click', handleClearSummary);
  
  generateAiReportBtn.addEventListener('click', async () => {
      aiReportContainer.classList.remove('hidden');
      aiReportContent.innerHTML = '<p style="color: var(--text-color); font-style: italic;">Customize the prompt above if needed and click "Generate 🤖" to start the summary report analysis.</p>';

      const { aiReportPrompt } = await chrome.storage.sync.get('aiReportPrompt');
      aiCustomPromptInput.value = aiReportPrompt && aiReportPrompt.trim() !== ''
          ? aiReportPrompt.trim()
          : "Create a coherent, well-structured summary report in Markdown format based on the following articles. Group related topics if applicable, and highlight the most important takeaways.";
  });
  aiGenerateWithPromptBtn.addEventListener('click', handleGenerateAiReport);
  closeAiReportBtn.addEventListener('click', () => {
      aiReportContainer.classList.add('hidden');
      aiReportContent.innerHTML = '';
  });
  copyAiReportBtn.addEventListener('click', async () => {
      if (!currentAiRawMarkdown && !aiReportContent.textContent) return;
      
      const format = exportAiFormat.value;
      let textToCopy = "";
      
      if (format === 'markdown') {
          textToCopy = currentAiRawMarkdown || aiReportContent.textContent;
      } else if (format === 'html') {
          if (currentAiRawMarkdown) {
              textToCopy = formatMarkdownToHtml(currentAiRawMarkdown);
          } else {
              textToCopy = aiReportContent.innerHTML;
          }
      } else { // txt
          if (currentAiRawMarkdown) {
              textToCopy = currentAiRawMarkdown
                  .replace(/^#+\s+/gim, '')
                  .replace(/\*\*([^\n]+?)\*\*/g, '$1')
                  .replace(/(?<=^|\s)\*([^\n*]+?)\*(?=\s|$|[.,!?])/g, '$1')
                  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                  .replace(/<[^>]+>/g, "");
          } else {
              textToCopy = aiReportContent.textContent;
          }
      }

      try {
          await navigator.clipboard.writeText(textToCopy);
          const originalText = copyAiReportBtn.textContent;
          copyAiReportBtn.textContent = 'Copied!';
          setTimeout(() => { copyAiReportBtn.textContent = originalText; }, 2000);
      } catch (err) {
          console.error('Failed to copy AI report:', err);
      }
  });

  fullViewSummaryBtn.addEventListener('click', () => {
    summarySubMode = (summarySubMode === 'list') ? 'report' : 'list';
    fullViewSummaryBtn.textContent = (summarySubMode === 'list') ? 'Full Report View' : 'Back to List';
    
    document.querySelectorAll('.report-inline-description').forEach(el => {
        el.style.display = (summarySubMode === 'report') ? 'block' : 'none';
    });
  });
}

function getFilteredPostsMap() {
    const { start, end } = getSummaryFilters();
    const filteredMap = {};
    
    for (const feedId in allPostsData) {
        const posts = allPostsData[feedId].filter(post => {
            if (post.isHidden) return false;
            
            // View specific filtering
            if (currentViewMode === 'summary' && !summaryLinksSet.has(post.link)) return false;
            if (currentViewMode === 'unread' && readLinksSet.has(post.link)) return false;
            if (currentViewMode === 'favorites' && !favoritedLinksSet.has(post.link)) return false;
            if (currentViewMode === 'keywords' && !(post.matchedRules && post.matchedRules.length > 0)) return false;

            // Date filtering
            const postDate = new Date(post.date);
            if (start && postDate < start) return false;
            if (end && postDate > end) return false;
            
            return true;
        });
        
        if (posts.length > 0) {
            filteredMap[feedId] = posts;
        }
    }
    return filteredMap;
}

function getCurrentFilteredPosts() {
    const filteredMap = getFilteredPostsMap();
    let posts = Object.values(filteredMap).flat().sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Apply search filter to ensure export matches exactly what's on the page
    const searchInput = searchBox.value.trim();
    if (searchInput) {
        const searchTerms = searchInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
        if (searchTerms.length > 0) {
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
            
            posts = posts.filter(post => {
                 const feed = findFeedById(post.feedId);
                 const feedName = feed ? feed.name : '';
                 const textToSearch = `${post.title} ${feedName} ${post.description || ''} ${post.link || ''}`;
                 return searchConditionGroups.some(group => 
                    group.every(cond => cond.mustNot ? !cond.regex.test(textToSearch) : cond.regex.test(textToSearch))
                 );
            });
        }
    }
    
    return posts;
}

function getSummaryFilters() {
    const preset = summaryDateFilter.value;
    const now = new Date();
    let start = null;
    let end = null;

    if (preset === 'today') {
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
    } else if (preset === '7days') {
        start = new Date(now);
        start.setDate(now.getDate() - 7);
        start.setHours(0, 0, 0, 0);
    } else if (preset === '30days') {
        start = new Date(now);
        start.setDate(now.getDate() - 30);
        start.setHours(0, 0, 0, 0);
    } else if (preset === 'custom') {
        if (filterDateFrom.value) {
            start = new Date(filterDateFrom.value + (filterTimeFrom.value ? 'T' + filterTimeFrom.value : 'T00:00'));
        }
        if (filterDateTo.value) {
            end = new Date(filterDateTo.value + (filterTimeTo.value ? 'T' + filterTimeTo.value : 'T23:59:59'));
        }
    }
    return { start, end };
}

/**
 * Central controller for changing the main view.
 * @param {string} view - The view to switch to ('all', 'unread', 'favorites', 'keywords', 'summary').
 * @param {boolean} isRefresh - If true, preserves scroll position and search box content.
 */
async function switchView(view, isRefresh = false) {
  currentViewMode = view;

  if (!isRefresh) {
    container.innerHTML = '';
    emptyMessage.classList.add('hidden');
    loadingSpinner.classList.remove('hidden');

    // Update active class on nav links
    navLinks.forEach(link => link.classList.remove('active'));
    const activeLink = document.getElementById(`nav-${view}`);
    if (activeLink) activeLink.classList.add('active');

    // Reset search on view switch
    searchBox.value = '';
  }

  // Toggle toolbars
  summaryToolbar.classList.remove('hidden');
  clearSummaryBtn.style.display = (view === 'summary' || view === 'favorites') ? 'inline-block' : 'none';

  switch (view) {
    case 'all':
      pageTitleH2.textContent = "All Posts";
      break;
    case 'unread':
      pageTitleH2.textContent = "Unread Posts";
      break;
    case 'favorites':
      pageTitleH2.textContent = "Favorite Posts";
      break;
    case 'keywords':
      pageTitleH2.textContent = "Keyword Matches";
      break;
    case 'summary':
      pageTitleH2.textContent = "Summary Cart";
      break;
  }

  switch (view) {
    case 'all': renderAllPostsView(); break;
    case 'unread': renderUnreadView(); break;
    case 'favorites': renderFavoritesView(); break;
    case 'keywords': await renderKeywordsView(); break;
    case 'summary': renderSummaryView(); break;
  }
  
  if (!isRefresh) {
    loadingSpinner.classList.add('hidden');
    handlePageSearch();
  } else {
    // If it's a refresh, re-apply the current search to the new elements if needed
    if (searchBox.value.trim() !== '') {
        handlePageSearch();
    }
  }
}

/**
 * Renders the "All Posts" view.
 */
function renderAllPostsView() {
  const filteredMap = getFilteredPostsMap();
  renderTreeView(filteredMap);
}

/**
 * Renders the new "Unread Posts" view.
 */
function renderUnreadView() {
  const filteredMap = getFilteredPostsMap();
  renderTreeView(filteredMap);
}

/**
 * Generic function to render a tree view based on a provided posts map.
 * @param {object} postsByFeed - An object where keys are feed IDs and values are arrays of post objects.
 */
function renderTreeView(postsByFeed) {
  // Preserve scroll position
  const scrollEl = document.getElementById('main-area') || document.querySelector('.main-content');
  const scrollPos = scrollEl ? scrollEl.scrollTop : 0;

  container.innerHTML = ''; 

  const hasAnyPosts = Object.keys(postsByFeed).length > 0;
  if (!currentFeedTree || currentFeedTree.length === 0) {
    emptyMessage.textContent = "No feeds configured yet. Click [+ Add Feed] to get started.";
    emptyMessage.classList.remove('hidden');
    return;
  }

  const isDateFiltered = summaryDateFilter && summaryDateFilter.value !== 'all';

  if (currentViewMode === 'unread' && !hasAnyPosts) {
    emptyMessage.textContent = "No unread posts.";
    emptyMessage.classList.remove('hidden');
    return;
  }

  if (currentViewMode === 'all' && isDateFiltered && !hasAnyPosts) {
    emptyMessage.textContent = "No posts found matching the selected date filter.";
    emptyMessage.classList.remove('hidden');
    return;
  }

  emptyMessage.classList.add('hidden');

  const treeContainer = document.createElement('ul');
  treeContainer.className = 'tree-container';

  function hasVisibleChildren(folderNode) {
    if (currentViewMode === 'all' && !isDateFiltered) {
      return folderNode.children && folderNode.children.length > 0;
    }
    return folderNode.children.some(child => {
      if (child.type === 'feed') {
        return postsByFeed[child.id] && postsByFeed[child.id].length > 0;
      }
      if (child.type === 'folder') {
        return hasVisibleChildren(child);
      }
      return false;
    });
  }

  function renderNodes(nodes, parentUl, level = 0) {
    nodes.forEach(node => {
      if (node.type === 'folder' && hasVisibleChildren(node)) {
        let folderCount = 0;
        function calculateFolderCount(folderNode) {
          let count = 0;
          folderNode.children.forEach(child => {
            if (child.type === 'feed') {
              if (isDateFiltered && currentViewMode === 'all') {
                count += (postsByFeed[child.id] || []).length;
              } else {
                count += unreadCounts[child.id] || 0;
              }
            } else if (child.type === 'folder') {
              count += calculateFolderCount(child);
            }
          });
          return count;
        }
        folderCount = calculateFolderCount(node);

        const li = document.createElement('li');
        li.style.paddingLeft = `${level * 20}px`;
        li.dataset.id = node.id;
        const folderCountSpan = folderCount > 0 ? `<span class="unread-count">${folderCount}</span>` : '';
        li.className = 'folder-item';
        
        const isCollapsed = collapsedFolders.has(node.id);
        const toggleText = isCollapsed ? '[+]' : '[-]';

        li.innerHTML = `<div class="tree-node-content"><span class="tree-toggle">${toggleText}</span><span class="tree-node-title">${escapeHTML(decodeHTML(node.name))}${folderCountSpan}</span><button type="button" class="folder-refresh-btn feed-single-refresh-btn" data-id="${node.id}" title="Refresh all feeds in this folder">🔄</button></div>`;
        
        const ul = document.createElement('ul');
        ul.className = 'folder-children' + (isCollapsed ? ' hidden' : '');
        li.appendChild(ul);
        parentUl.appendChild(li);
        renderNodes(node.children, ul, level + 1);
      
      } else if (node.type === 'feed') {
        const posts = postsByFeed[node.id] || [];
        if ((currentViewMode === 'unread' || isDateFiltered) && posts.length === 0) {
          return; // Skip empty feeds in unread mode or when date filter is active
        }

        let feedDisplayCount = unreadCounts[node.id] || 0;
        if (isDateFiltered && currentViewMode === 'all') {
          feedDisplayCount = posts.length;
        }
        const feedCountSpan = feedDisplayCount > 0 ? `<span class="unread-count">${feedDisplayCount}</span>` : '';
        const faviconUrl = getFaviconUrl(node.url);

        const li = document.createElement('li');
        li.style.paddingLeft = `${level * 20}px`;
        li.dataset.id = node.id;
        li.className = 'feed-item-row';

        const isExpanded = expandedFeeds.has(node.id);
        const toggleText = isExpanded ? '[-]' : '[+]';

        li.innerHTML = `<div class="tree-node-content"><span class="tree-toggle">${toggleText}</span><img src="${faviconUrl}" class="feed-favicon" alt="icon" onerror="this.src='128.png'"><span class="tree-node-title">${escapeHTML(decodeHTML(node.name))}${feedCountSpan}</span><button type="button" class="feed-single-refresh-btn" data-id="${node.id}" title="Refresh this feed">🔄</button></div>`;

        const postUl = document.createElement('ul');
        if (!isExpanded) postUl.classList.add('hidden');

        if (posts.length > 0) {
          posts.filter(p => !p.isHidden).forEach(post => {
            const postLi = createPostListItem(post);
            postUl.appendChild(postLi);
          });
        } else if (isExpanded) {
          const emptyLi = document.createElement('li');
          emptyLi.style.padding = '8px 15px';
          emptyLi.style.fontStyle = 'italic';
          emptyLi.style.color = 'var(--secondary-text-color)';
          emptyLi.textContent = 'No articles found or fetching...';
          postUl.appendChild(emptyLi);
        }
        
        li.appendChild(postUl);
        parentUl.appendChild(li);
      }
    });
  }

  renderNodes(currentFeedTree, treeContainer);
  container.appendChild(treeContainer);

  // Restore scroll position
  if (scrollEl) {
    scrollEl.scrollTop = scrollPos;
  }
}

/**
 * Renders the "Favorites" view
 */
function renderFavoritesView() {
  // Preserve scroll position
  const scrollEl = document.getElementById('main-area') || document.querySelector('.main-content');
  const scrollPos = scrollEl ? scrollEl.scrollTop : 0;

  container.innerHTML = '';
  if (favoritedLinksSet.size === 0) {
    emptyMessage.textContent = "You haven't favorited any posts yet.";
    emptyMessage.classList.remove('hidden');
    return;
  }
  
  const favoritedPosts = getCurrentFilteredPosts();
  if (favoritedPosts.length === 0) {
    emptyMessage.textContent = "No posts found matching the selected filters.";
    emptyMessage.classList.remove('hidden');
    return;
  }

  const section = document.createElement('section');
  section.className = 'feed-section';
  favoritedPosts.forEach(post => {
    const postItem = createPostListItem(post);
    section.appendChild(postItem);
  });
  container.appendChild(section);

  if (scrollEl) {
    scrollEl.scrollTop = scrollPos;
  }
}

/**
 * Renders the "Keyword" view
 */
async function renderKeywordsView() {
  // Preserve scroll position
  const scrollEl = document.getElementById('main-area') || document.querySelector('.main-content');
  const scrollPos = scrollEl ? scrollEl.scrollTop : 0;

  container.innerHTML = '';
  const { rules = [] } = await chrome.storage.sync.get('rules');
  const rulesMap = new Map(rules.map(rule => [rule.id, rule]));

  const keywordPosts = getCurrentFilteredPosts();
  if (keywordPosts.length === 0) {
    emptyMessage.textContent = "No posts found matching your 'notify' rules or filters.";
    emptyMessage.classList.remove('hidden');
    return;
  }

  const postsByRule = {};
  keywordPosts.forEach(post => {
    post.matchedRules.forEach(match => {
      if (!postsByRule[match.id]) postsByRule[match.id] = [];
      postsByRule[match.id].push(post);
    });
  });

  const processedRuleIds = new Set();

  const renderRuleSection = (ruleId, rule) => {
    const posts = postsByRule[ruleId];
    if (!posts || posts.length === 0) return;

    posts.sort((a, b) => new Date(b.date) - new Date(a.date));

    const ruleSection = document.createElement('section');
    ruleSection.className = 'feed-section';
    const ruleTitle = document.createElement('h3');
    ruleTitle.className = 'feed-title';
    ruleTitle.innerHTML = rule ? `Rule: IF <strong>${rule.field}</strong> ${rule.condition.replace('-', ' ')} <code>${rule.value}</code>` : `Matches for a deleted rule`;
    ruleSection.appendChild(ruleTitle);

    posts.forEach(post => {
      const postItem = createPostListItem(post);
      ruleSection.appendChild(postItem);
    });
    container.appendChild(ruleSection);
    processedRuleIds.add(ruleId);
  };

  // Sort and render sections according to the order of stored rules
  rules.forEach(rule => {
    renderRuleSection(rule.id, rule);
  });

  // Then render sections for any deleted rules
  for (const ruleId in postsByRule) {
    if (!processedRuleIds.has(ruleId)) {
      renderRuleSection(ruleId, null);
    }
  }

  if (scrollEl) {
    scrollEl.scrollTop = scrollPos;
  }
}

/**
 * Renders the "Summary Cart" view
 */
function renderSummaryView() {
  // Preserve scroll position
  const scrollEl = document.getElementById('main-area') || document.querySelector('.main-content');
  const scrollPos = scrollEl ? scrollEl.scrollTop : 0;

  container.innerHTML = '';
  if (summaryLinksSet.size === 0) {
    emptyMessage.textContent = "Your summary cart is empty. Add posts using the clipboard icon.";
    emptyMessage.classList.remove('hidden');
    return;
  }
  
  const summaryPosts = getCurrentFilteredPosts();

  if (summaryPosts.length === 0) {
    emptyMessage.textContent = "No posts in the cart match the selected filter.";
    emptyMessage.classList.remove('hidden');
    return;
  }

  const section = document.createElement('section');
  section.className = 'feed-section';
  summaryPosts.forEach(post => {
    const postItem = createPostListItem(post);
    section.appendChild(postItem);
  });
  container.appendChild(section);

  if (scrollEl) {
    scrollEl.scrollTop = scrollPos;
  }
}



/**
 * Formats the summary list and copies it to the clipboard.
 */
async function handleCopySummary() {
  const posts = getCurrentFilteredPosts();
  if (posts.length === 0) return;

  const format = exportFormat.value;
  const content = generateSummaryContent(posts, format, summarySubMode);

  try {
    await navigator.clipboard.writeText(content);
    showCopyStatus(`Copied as ${format.toUpperCase()}!`, 'success');
  } catch (err) {
    console.error('Failed to copy: ', err);
    showCopyStatus("Failed to copy.", 'error');
  }
}

/**
 * Downloads the summary as a file.
 */
function handleDownloadSummary() {
  const posts = getCurrentFilteredPosts();
  if (posts.length === 0) return;
  
  const format = exportFormat.value;
  const content = generateSummaryContent(posts, format, summarySubMode);
  const mimeType = format === 'html' ? 'text/html' : (format === 'markdown' ? 'text/markdown' : 'text/plain');
  const extension = format === 'html' ? 'html' : (format === 'markdown' ? 'md' : 'txt');

  const now = new Date();
  const datePart = now.toISOString().split('T')[0];
  const timePart = now.getHours().toString().padStart(2, '0') + '-' + now.getMinutes().toString().padStart(2, '0');
  const defaultName = `puretidings-summary-${datePart}_${timePart}.${extension}`;
  let fileName = prompt("Enter a name for the report:", defaultName);
  
  // If user cancels or gives empty input, return
  if (fileName === null) return;
  if (fileName.trim() === "") fileName = defaultName;
  
  // Ensure we don't double the extension if user included it
  const finalName = fileName.toLowerCase().endsWith(`.${extension}`) ? fileName : `${fileName}.${extension}`;
  
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = finalName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Generates content for export in different formats.
 */
function generateSummaryContent(posts, format, subMode) {
    let content = "";
    const nowStr = new Date().toLocaleString();
    const isReport = subMode === 'report';
    
    let pageName = "Content Summary";
    switch (currentViewMode) {
      case 'all': pageName = "All Posts"; break;
      case 'unread': pageName = "Unread Posts"; break;
      case 'favorites': pageName = "Favorite Posts"; break;
      case 'keywords': pageName = "Keyword Matches"; break;
      case 'summary': pageName = "Summary Cart"; break;
    }
    
    if (format === 'txt') {
        content = `PURETIDINGS - ${pageName.toUpperCase()} (${isReport ? "FULL REPORT" : "LIST"})\n`;
        content += "Generated on: " + nowStr + "\n";
        content += "======================================\n\n";
        posts.forEach((post, index) => {
            const feed = findFeedById(post.feedId);
            content += `${index + 1}. ${post.title}${feed ? ` [Source: ${feed.name}]` : ""}\n`;
            content += `   Date: ${new Date(post.date).toLocaleString()}\n`;
            content += `   Link: ${post.link}\n`;
            
            if (isReport) {
                const sourceText = post.fullContentText || post.description || '';
                if (sourceText) {
                    const cleanDesc = sourceText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    content += `   Content: ${cleanDesc.substring(0, 2000)}${cleanDesc.length > 2000 ? '...' : ''}\n`;
                }
            }
            content += `\n--------------------------------------\n\n`;
        });
    } else if (format === 'markdown') {
        content = `# PureTidings - ${pageName} (${isReport ? "Full Report" : "List"})\n\n`;
        content += `*Generated on: ${nowStr}*\n\n---\n\n`;
        posts.forEach((post, index) => {
            const feed = findFeedById(post.feedId);
            content += `## ${index + 1}. [${post.title}](${post.link})\n`;
            content += `**Source:** ${feed ? feed.name : "Unknown"} | **Date:** ${new Date(post.date).toLocaleString()}  \n\n`;
            
            if (isReport) {
                const sourceText = post.fullContentText || post.description || '';
                if (sourceText) {
                    const cleanDesc = sourceText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    content += `${cleanDesc}\n\n`;
                }
            }
            content += `---\n\n`;
        });
    } else if (format === 'html') {
        content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PureTidings Summary</title><style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; background-color: #f9f9f9; color: #333; }
            .reader-container { max-width: 700px; margin: 20px auto; padding: 20px 40px; background-color: #fff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { font-size: 2.2em; font-weight: 700; line-height: 1.2; margin: 0 0 10px 0; }
            h2 { font-size: 1.8em; font-weight: 700; line-height: 1.2; margin: 0 0 5px 0; }
            h2 a { color: #333; }
            h2 a:hover { color: #0066cc; }
            .report-header { text-align: center; margin-bottom: 40px; }
            .report-header p { color: #888; font-size: 0.9em; margin: 5px 0; }
            article { margin-bottom: 60px; }
            .meta { font-size: 0.9em; color: #888; margin-top: 10px; margin-bottom: 20px; }
            a { color: #0066cc; text-decoration: none; }
            a:hover { text-decoration: underline; }
            hr { border: 0; border-top: 1px solid #ddd; margin: 20px 0; }
            .desc { font-size: 1.1em; line-height: 1.7; word-wrap: break-word; word-break: break-word; }
            .desc img, .desc figure { max-width: 100% !important; height: auto !important; margin: 20px 0; border-radius: 4px; }
            .featured-img { max-width: 100%; height: auto; border-radius: 4px; margin-bottom: 15px; display: block; }
            .timeline-block { line-height: 1.3; }
        </style></head><body><div class="reader-container">`;
        content += `<div class="report-header"><h1>PureTidings - ${pageName} (${isReport ? "Full Report" : "List"})</h1>`;
        content += `<p>Generated on: ${nowStr}</p></div>`;
        posts.forEach((post, index) => {
            const feed = findFeedById(post.feedId);
            const feedName = feed ? feed.name : "Unknown";
            content += `<article>`;
            content += `<h2>${index + 1}. <a href="${post.link}" target="_blank">${escapeHTML(decodeHTML(post.title))}</a></h2>`;
            content += `<div class="meta"><strong>Source:</strong> ${escapeHTML(decodeHTML(feedName))} &nbsp;|&nbsp; <strong>Date:</strong> ${new Date(post.date).toLocaleString()} &nbsp;|&nbsp; <a href="${post.link}" target="_blank">Original Link</a></div>`;
            
            if (isReport) {
                content += `<hr>`;
                if (post.featuredImage) {
                    content += `<img src="${post.featuredImage}" class="featured-img" alt="Featured Image">`;
                }
                
                if (post.link && (post.link.includes('youtube.com/watch') || post.link.includes('youtube.com/shorts/'))) {
                    let videoInfoHtml = `<p><strong>YouTube Video:</strong> <a href="${post.link}" target="_blank">${escapeHTML(decodeHTML(post.title || post.link))}</a>`;
                    if (post.videoLength) {
                        videoInfoHtml += ` (${formatDuration(post.videoLength)})`;
                    }
                    videoInfoHtml += `</p>`;
                    content += videoInfoHtml;
                    
                    if (post.description) {
                        const tempTextArea = document.createElement('textarea');
                        tempTextArea.innerHTML = post.description;
                        content += `<div class="desc">${formatDescription(tempTextArea.textContent)}</div>`;
                    }
                } else if (post.fullContentHtml) {
                    content += `<div class="desc">${post.fullContentHtml}</div>`;
                } else if (post.description) {
                    const tempTextArea = document.createElement('textarea');
                    tempTextArea.innerHTML = post.description;
                    content += `<div class="desc">${tempTextArea.textContent}</div>`;
                }
            }
            content += `</article>`;
        });
        content += `</div></body></html>`;
    }
    return content;
}

/**
 * Finds a feed in the tree by its ID.
 */
function findFeedById(id) {
    function search(nodes) {
        for (const node of nodes) {
            if (node.id === id) return node;
            if (node.children) {
                const found = search(node.children);
                if (found) return found;
            }
        }
        return null;
    }
    return search(currentFeedTree);
}

function showCopyStatus(message, type) {
    copyStatus.textContent = message;
    copyStatus.style.color = type === 'error' ? 'red' : 'green';
    setTimeout(() => { copyStatus.textContent = ""; }, 3000);
}

async function handleClearSummary() {
  if (currentViewMode === 'favorites') {
    if (!confirm("Are you sure you want to clear all your favorites?")) return;
    favoritedLinksSet.clear();
    await chrome.runtime.sendMessage({ 
      action: "safeStorageSet", 
      key: "favoritedLinks", 
      data: [] 
    });
  } else if (currentViewMode === 'summary') {
    if (!confirm("Are you sure you want to clear your entire summary cart?")) return;
    summaryLinksSet.clear();
    await chrome.runtime.sendMessage({ 
      action: "safeStorageSet", 
      key: "summaryLinks", 
      data: [] 
    });
  }
  switchView(currentViewMode, true);
}

/**
 * Creates a single post list item with all its listeners.
 * @param {object} post - The post object.
 * @returns {HTMLElement} The fully functional <li> element for a post.
 */
function createPostListItem(post) {
    const isRead = readLinksSet.has(post.link);
    const isFavorited = favoritedLinksSet.has(post.link);
    const isKeywordMatch = post.matchedRules && post.matchedRules.length > 0;

    const postElement = createPostElement(post, isRead, isFavorited, isKeywordMatch);
    postElement.dataset.feedId = post.feedId; // Store for source lookups
    
    addTitleClickListener(postElement, post);
    addFavoriteMarkerListener(postElement, post);
    addReaderModeListener(postElement, post);
    addMarkAsUnreadListener(postElement, post);
    addSummaryBtnListener(postElement, post);

    // Always create report snippet container (even if description is empty, so full article can load)
    const descSnippetReport = document.createElement('div');
    descSnippetReport.className = 'report-inline-description';
    // Apply reader-style formatting for inline full report view
    descSnippetReport.style.marginTop = '15px';
    descSnippetReport.style.fontSize = '1.1em';
    descSnippetReport.style.lineHeight = '1.6';
    descSnippetReport.style.display = summarySubMode === 'report' ? 'block' : 'none';
    
    descSnippetReport.dataset.link = post.link;
    descSnippetReport.dataset.feedId = post.feedId;
    descSnippetReport.dataset.isGmail = !!post.isGmail;

    // Use cached full content if available to avoid refetching
    if (post.fullContentHtml) {
        descSnippetReport.innerHTML = `<hr style="border:0;border-top:1px solid var(--border-color);margin-bottom:15px;">${sanitizeHtmlForInlining(post.fullContentHtml)}`;
        descSnippetReport.dataset.loaded = 'true';
    } else {
        let descHtml = "";
        if (post.description) {
            if (post.link && (post.link.includes('youtube.com/watch') || post.link.includes('youtube.com/shorts/'))) {
                descHtml = formatDescription(decodeHTML(post.description));
            } else {
                descHtml = post.description;
            }
        }
        descSnippetReport.innerHTML = `<hr style="border:0;border-top:1px solid var(--border-color);margin-bottom:15px;">${sanitizeHtmlForInlining(descHtml)}`;
        
        if (reportObserver) {
            reportObserver.observe(descSnippetReport);
        }
    }
    
    // Ensure images in the description are responsive
    descSnippetReport.querySelectorAll('img, figure').forEach(img => {
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.borderRadius = '4px';
    });

    const mainContent = postElement.querySelector('.main-content');
    if (mainContent) {
        mainContent.appendChild(descSnippetReport);
    }

    if(currentViewMode === 'all' || currentViewMode === 'unread') {
        const postLi = document.createElement('li');
        const postNodeContent = document.createElement('div');
        postNodeContent.className = 'tree-node-content';
        postNodeContent.appendChild(postElement);
        postLi.appendChild(postNodeContent);
        return postLi;
    }
    return postElement;
}

function addSummaryBtnListener(element, post) {
    const summaryBtn = element.querySelector('.summary-btn');
    if (!summaryBtn) return;

    if (summaryLinksSet.has(post.link)) {
        summaryBtn.classList.add('active');
        summaryBtn.title = 'Remove from summary list';
    }

    summaryBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); e.preventDefault();
        if (summaryLinksSet.has(post.link)) {
            summaryLinksSet.delete(post.link);
            summaryBtn.classList.remove('active');
            summaryBtn.title = 'Add to summary list';
            if (currentViewMode === 'summary') element.style.display = 'none';
        } else {
            summaryLinksSet.add(post.link);
            summaryBtn.classList.add('active');
            summaryBtn.title = 'Remove from summary list';
        }
        await chrome.runtime.sendMessage({ action: "safeStorageSet", key: "summaryLinks", data: Array.from(summaryLinksSet) });
    });
}


// --- EVENT HANDLER HELPERS ---

function handleTreeToggle(event) {
  const refreshBtn = event.target.closest('.feed-single-refresh-btn');
  if (refreshBtn) {
    event.stopPropagation();
    event.preventDefault();
    const nodeId = refreshBtn.dataset.id;
    if (!nodeId) return;

    refreshBtn.classList.add('spinning');
    (async () => {
      try {
        if (refreshBtn.classList.contains('folder-refresh-btn')) {
          const feedIds = [];
          function findFolderFeeds(nodes) {
            for (const n of nodes) {
              if (n.id === nodeId && n.type === 'folder') {
                function collect(item) {
                  if (item.type === 'feed') feedIds.push(item.id);
                  else if (item.children) item.children.forEach(collect);
                }
                collect(n);
                return;
              }
              if (n.children) findFolderFeeds(n.children);
            }
          }
          findFolderFeeds(currentFeedTree);
          if (window.refreshSingleFeedNative) {
            await Promise.all(feedIds.map(fId => window.refreshSingleFeedNative(fId)));
          }
        } else {
          if (window.refreshSingleFeedNative) {
            await window.refreshSingleFeedNative(nodeId);
          }
        }
      } finally {
        refreshBtn.classList.remove('spinning');
      }
    })();
    return;
  }

  const toggle = event.target.closest('.tree-toggle');
  if (!toggle) return;
  const parentLi = toggle.closest('li');
  const childUl = parentLi.querySelector('ul');
  const nodeId = parentLi.dataset.id;

  if (childUl && nodeId) {
    const isNowHidden = childUl.classList.toggle('hidden');
    toggle.textContent = isNowHidden ? '[+]' : '[-]';
    
    if (parentLi.classList.contains('folder-item')) {
        if (isNowHidden) collapsedFolders.add(nodeId);
        else collapsedFolders.delete(nodeId);
        try { localStorage.setItem('puretidings_collapsed_folders', JSON.stringify(Array.from(collapsedFolders))); } catch (_) {}
    } else {
        if (isNowHidden) expandedFeeds.delete(nodeId);
        else {
            expandedFeeds.add(nodeId);
            // Trigger background refetch of missing OG images when feed is expanded
            chrome.runtime.sendMessage({ action: "refetchOgImages", feedId: nodeId }).catch(() => {});
        }
        try { localStorage.setItem('puretidings_expanded_feeds', JSON.stringify(Array.from(expandedFeeds))); } catch (_) {}
    }
  }
}

function addMarkAsUnreadListener(element, post) {
  const unreadBtn = element.querySelector('.mark-unread-btn');
  if (!unreadBtn) return;
  unreadBtn.addEventListener('click', async (e) => {
    e.stopPropagation(); e.preventDefault();
    element.classList.remove('read');
    readLinksSet.delete(post.link);
    await chrome.storage.local.set({ readLinks: Array.from(readLinksSet) });
    await updateCountsAfterLocalChange(1, post.feedId);
    if(currentViewMode === 'unread') {
        // Refresh view to show item correctly
        switchView('unread', true);
    }
  });
}

async function updateCountsAfterLocalChange(countChange, feedId) {
  if (feedId && unreadCounts[feedId] !== undefined) {
    unreadCounts[feedId] = Math.max(0, unreadCounts[feedId] + countChange);
  } else if (feedId) {
    unreadCounts[feedId] = Math.max(0, countChange);
  }
  await chrome.storage.local.set({ unreadCounts });
  const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
  await chrome.action.setBadgeText({ text: totalUnread > 0 ? totalUnread.toString() : '' });
}

async function markPostAsRead(element, post) {
  if (element.classList.contains('read')) return;
  element.classList.add('read');
  readLinksSet.add(post.link);
  await chrome.storage.local.set({ readLinks: Array.from(readLinksSet) });
  await updateCountsAfterLocalChange(-1, post.feedId);
  if(currentViewMode === 'unread') {
      element.style.display = 'none';
  }
}

function addTitleClickListener(element, post) {
  const titleLink = element.querySelector('.post-title');
  titleLink.addEventListener('click', async (event) => {
    event.preventDefault();
    markPostAsRead(element, post);
    element.classList.add('flipping-out');
    setTimeout(() => {
      chrome.tabs.create({ url: post.link, active: false });
      setTimeout(() => element.classList.remove('flipping-out'), 1000);
    }, 500);
  });
}

function addFavoriteMarkerListener(element, post) {
  const starBtn = element.querySelector('.favorite-btn');
  if(!starBtn) return;
  starBtn.addEventListener('click', async (e) => {
  e.stopPropagation(); e.preventDefault();
  const isFavorited = favoritedLinksSet.has(post.link);
  if (isFavorited) {
    favoritedLinksSet.delete(post.link);
    starBtn.classList.remove('favorited');
    starBtn.innerHTML = '&#9734;';
    if (currentViewMode === 'favorites') element.style.display = 'none';
  } else {
    favoritedLinksSet.add(post.link);
    starBtn.classList.add('favorited');
    starBtn.innerHTML = '&#9733;';
  }
  await chrome.runtime.sendMessage({ action: "safeStorageSet", key: "favoritedLinks", data: Array.from(favoritedLinksSet) });
  });
  }
function addReaderModeListener(element, post) {
  const readBtn = element.querySelector('.read-mode-btn');
  if(!readBtn) return;
  readBtn.addEventListener('click', (e) => {
    e.stopPropagation(); e.preventDefault();
    markPostAsRead(element, post);
    element.classList.add('flipping-out');
    setTimeout(() => {
      const feedName = findFeedById(post.feedId)?.name || '';
      const readerUrl = `reader.html?url=${encodeURIComponent(post.link)}&description=${encodeURIComponent(post.description || '')}&title=${encodeURIComponent(post.title || '')}&videoLength=${encodeURIComponent(post.videoLength || '')}&featuredImage=${encodeURIComponent(post.featuredImage || '')}&source=${encodeURIComponent(feedName)}&feedId=${encodeURIComponent(post.feedId)}&fullContentHtmlText=${encodeURIComponent(post.fullContentHtml || '')}`;
      chrome.tabs.create({ url: readerUrl });
      setTimeout(() => element.classList.remove('flipping-out'), 1000);
    }, 500);
  });
}

/**
 * Escapes special characters in a string for use in a regular expression.
 * @param {string} string The string to escape.
 * @returns {string} The escaped string.
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function handlePageSearch() {
  const searchInput = searchBox.value.trim();
  const searchTerms = searchInput.split(',').map(t => t.trim()).filter(t => t.length > 0);

  // Create an array of condition groups from the search terms
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

  if (currentViewMode === 'all' || currentViewMode === 'unread') {
    // If there's no search term, reset the view to its state-aware rendering
    if (searchConditionGroups.length === 0) {
        const filteredMap = getFilteredPostsMap();
        renderTreeView(filteredMap);
        return;
    }

    const treeContainer = container.querySelector('.tree-container');
    if (!treeContainer) return;

    // Expand all tree nodes and hide all list items to prepare for filtering
    treeContainer.querySelectorAll('ul').forEach(ul => ul.classList.remove('hidden'));
    treeContainer.querySelectorAll('.tree-toggle').forEach(toggle => toggle.textContent = '[-]');
    treeContainer.querySelectorAll('li').forEach(li => li.classList.add('hidden'));

    // Show posts that match the search criteria and their parent folders/feeds
    treeContainer.querySelectorAll('.post-item').forEach(postItem => {
      const postLink = postItem.querySelector('.post-title') ? postItem.querySelector('.post-title').href : '';
      const postText = postItem.textContent + ' ' + postLink;
      const postLi = postItem.closest('li');

      // Check if the post text matches ALL of the regexes in ANY group
      if (searchConditionGroups.some(group => 
        group.every(cond => cond.mustNot ? !cond.regex.test(postText) : cond.regex.test(postText))
      )) {
        let currentElement = postLi;
        while (currentElement && currentElement !== treeContainer) {
          currentElement.classList.remove('hidden');
          // Also show the direct parent ul of the li
          if(currentElement.parentElement) {
            currentElement.parentElement.classList.remove('hidden');
          }
          currentElement = currentElement.parentElement.closest('li');
        }
      }
    });

  } else { // Handle flat views like Favorites and Keywords
      container.querySelectorAll('.post-item').forEach(item => {
        const postLink = item.querySelector('.post-title') ? item.querySelector('.post-title').href : '';
        const postText = item.textContent + ' ' + postLink;
        // Check if the post text matches ALL of the regexes in ANY group
        const matches = searchConditionGroups.length === 0 || searchConditionGroups.some(group => 
            group.every(cond => cond.mustNot ? !cond.regex.test(postText) : cond.regex.test(postText))
        );
        item.style.display = matches ? 'flex' : 'none';
      });
  }
}

function setupScrollToTop(scrollToTopBtn) {
  if (!scrollToTopBtn) return;
  const mainContent = document.querySelector('.main-content');
  scrollToTopBtn.addEventListener('click', () => {
    mainContent.scrollTo({ top: 0, behavior: 'smooth' });
  });

  mainContent.addEventListener('scroll', () => {
    if (mainContent.scrollTop > window.innerHeight) {
      scrollToTopBtn.classList.remove('hidden');
    } else {
      scrollToTopBtn.classList.add('hidden');
    }
  });
}

function showError(message) {
  loadingSpinner.classList.add('hidden');
  container.innerHTML = '';
  emptyMessage.textContent = message;
  emptyMessage.classList.remove('hidden');
}

function initReportObserver() {
    if (reportObserver) return;
    
    reportObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && summarySubMode === 'report') {
                const el = entry.target;
                const postLink = el.dataset.link;
                const feedId = el.dataset.feedId;
                const isYoutube = postLink && (postLink.includes('youtube.com/watch') || postLink.includes('youtube.com/shorts/'));
                const isGmail = el.dataset.isGmail === 'true' || (postLink && postLink.includes('mail.google.com'));
                
                if (!el.dataset.loaded && !isYoutube && !isGmail) {
                    el.dataset.loaded = 'loading';
                    el.innerHTML = `<hr style="border:0;border-top:1px solid var(--border-color);margin-bottom:15px;"><span style="color: var(--text-color); opacity: 0.6;">Loading full article...</span>`;
                    
                    fetchFullArticleForReport(el, postLink, feedId);
                }
            }
        });
    }, { rootMargin: "200px" });
}

function fetchFullArticleForReport(el, url, feedId) {
    fetchQueue.push({ el, url, feedId });
    processFetchQueue();
}

async function processFetchQueue() {
    if (isFetching || fetchQueue.length === 0) return;
    isFetching = true;
    
    const task = fetchQueue.shift();
    try {
        await fetchFullArticleForReportLogic(task.el, task.url, task.feedId);
    } catch (e) {
        console.error("Error in queue:", e);
    }
    
    // Add a randomized delay (2000ms to 4000ms) between requests to prevent hitting anti-bot walls
    const delay = Math.floor(Math.random() * 2000) + 2000;
    setTimeout(() => {
        isFetching = false;
        processFetchQueue();
    }, delay);
}

async function fetchFullArticleForReportLogic(el, url, feedId) {
    try {
        const response = await chrome.runtime.sendMessage({
            action: "fetchArticle",
            url: url
        });

        if (response.status === 'ok') {
            const parser = new DOMParser();
            const doc = parser.parseFromString(response.html, 'text/html');
            const base = doc.createElement('base');
            base.href = url;
            doc.head.appendChild(base);

            // Preprocessing: Clean/restructure specific domains (e.g. chefkoch.de recipes, investing.com)
            preprocessDOM(doc, url);

            const article = new Readability(doc).parse();            
            if (article && article.content) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = article.content;
                try {
                    tempDiv.querySelectorAll('img').forEach(img => {
                        try {
                            if (img.src && img.getAttribute('src')) {
                                img.src = new URL(img.getAttribute('src'), url).href;
                            }
                        } catch (e) { console.error("Error parsing img url", e); }
                        img.style.maxWidth = '100%';
                        img.style.height = 'auto';
                        img.style.borderRadius = '4px';
                    });
                    tempDiv.querySelectorAll('a').forEach(a => {
                        try {
                            if (a.href && a.getAttribute('href')) {
                                a.href = new URL(a.getAttribute('href'), url).href;
                            }
                        } catch (e) { console.error("Error parsing link url", e); }
                    });
                    
                    // Fix embedded YouTube videos that use video.js (like on investing.com) or wp-youtube-lyte (finanzmarktwelt.de)
                    tempDiv.querySelectorAll('iframe[src*="youtube.com"], iframe[src*="youtu.be"], video, div[class*="video"], div[class*="player"], div[id^="lyte_"], div[class*="lyte"]').forEach(video => {
                        let youtubeUrl = null;
                        
                        if (video.tagName.toLowerCase() === 'iframe') {
                            youtubeUrl = video.src;
                        } else {
                            const source = video.querySelector('source[type="video/youtube"]');
                            youtubeUrl = source ? source.src : null;
                            
                            if (!youtubeUrl) {
                                const ytLink = video.querySelector('a[href*="youtube.com/watch"], a[href*="youtu.be/"]');
                                if (ytLink) youtubeUrl = ytLink.href;
                            }
                            
                            // If still no URL, look for embed strings in the innerHTML (Finanzmarktwelt style)
                            if (!youtubeUrl) {
                                const embedMatch = video.innerHTML.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
                                if (embedMatch) {
                                    youtubeUrl = `https://www.youtube.com/watch?v=${embedMatch[1]}`;
                                }
                            }
                        }
                        
                        // Handle wp-youtube-lyte specifically
                        let videoId = '';
                        if (video.id && video.id.startsWith('lyte_')) {
                            videoId = video.id.replace('lyte_', '');
                        }

                        if (youtubeUrl || videoId) {
                            try {
                                if (!videoId && youtubeUrl) {
                                    if (youtubeUrl.includes('youtu.be/')) {
                                        videoId = youtubeUrl.split('youtu.be/')[1].split('?')[0];
                                    } else if (youtubeUrl.includes('youtube.com/watch')) {
                                        videoId = new URL(youtubeUrl).searchParams.get('v');
                                    } else if (youtubeUrl.includes('youtube.com/embed/')) {
                                        videoId = youtubeUrl.split('youtube.com/embed/')[1].split('?')[0];
                                    }
                                }
                            } catch (e) { console.error("Error parsing youtube url", e); }

                            if (videoId) {
                                videoId = videoId.split('&')[0].replace(/[^a-zA-Z0-9_-]/g, '');
                                const container = createYouTubePlaceholder(videoId);
                                
                                // If it's a lyte-wrapper, replace the whole wrapper
                                if (video.parentElement && video.parentElement.classList.contains('lyte-wrapper')) {
                                    video.parentElement.replaceWith(container);
                                } else {
                                    video.replaceWith(container);
                                }
                            } else if (video.tagName.toLowerCase() === 'iframe') {
                                const container = document.createElement('div');
                                container.className = 'video-container';
                                // Apply container styles inline since we don't have them in CSS yet (but some are already here)
                                container.style.position = 'relative';
                                container.style.paddingBottom = '56.25%';
                                container.style.height = '0';
                                container.style.overflow = 'hidden';
                                container.style.maxWidth = '100%';
                                container.style.margin = '20px 0';
                                container.style.borderRadius = '8px';
                                container.style.background = '#000';
                                
                                video.removeAttribute('width');
                                video.removeAttribute('height');
                                video.style.position = 'absolute';
                                video.style.top = '0';
                                video.style.left = '0';
                                video.style.width = '100%';
                                video.style.height = '100%';
                                video.style.border = '0';
                                
                                container.appendChild(video.cloneNode(true));
                                video.replaceWith(container);
                            }
                        }
                    });

                    // Also catch standalone YouTube links that might be intended as embeds
                    tempDiv.querySelectorAll('a[href*="youtube.com/watch"], a[href*="youtu.be/"]').forEach(link => {
                        const parent = link.parentElement;
                        const text = link.textContent.toLowerCase();
                        const isPlaceholder = text.includes('watch video on youtube') || 
                                            text.includes('view on youtube') || 
                                            text.includes('youtube.com/watch') ||
                                            text.includes('hier klicken') ||
                                            (parent && parent.textContent.trim() === link.textContent.trim() && parent.tagName === 'P');

                        if (isPlaceholder) {
                             let videoId = '';
                             try {
                                if (link.href.includes('youtu.be/')) {
                                    videoId = link.href.split('youtu.be/')[1].split('?')[0];
                                } else {
                                    videoId = new URL(link.href).searchParams.get('v');
                                }
                             } catch(e) {}
                             
                             if (videoId) {
                                videoId = videoId.split('&')[0].replace(/[^a-zA-Z0-9_-]/g, '');
                                const container = createYouTubePlaceholder(videoId);

                                if (parent && (parent.className.includes('video') || parent.className.includes('player') || parent.textContent.trim().length < 100)) {
                                    parent.replaceWith(container);
                                } else {
                                    link.replaceWith(container);
                                }
                             }
                        }
                    });
                } catch (e) {
                    console.error("Error sanitizing content:", e);
                }
                
                el.innerHTML = `<hr style="border:0;border-top:1px solid var(--border-color);margin-bottom:15px;">${tempDiv.innerHTML}`;
                updatePostFullContent(feedId, url, tempDiv.innerHTML);
                el.dataset.loaded = 'true';
            } else {
                restoreOriginalDescription(el, feedId, url);
            }
        } else {
            restoreOriginalDescription(el, feedId, url);
        }
    } catch (error) {
        console.error("Error lazy-loading full article:", error);
        restoreOriginalDescription(el, feedId, url);
    }
}

function updatePostFullContent(feedId, url, contentHtml) {
    if (allPostsData[feedId]) {
        const post = allPostsData[feedId].find(p => p.link === url);
        if (post) {
            post.fullContentHtml = contentHtml;
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = contentHtml;
            post.fullContentText = tempDiv.textContent;
        }
    }
}

function restoreOriginalDescription(el, feedId, url) {
    if (allPostsData[feedId]) {
        const post = allPostsData[feedId].find(p => p.link === url);
        if (post) {
            const formattedDesc = post.description ? formatDescription(decodeHTML(post.description)) : '';
            el.innerHTML = `<hr style="border:0;border-top:1px solid var(--border-color);margin-bottom:15px;">${formattedDesc}`;
            el.dataset.loaded = 'failed';
        }
    }
}

async function handleGenerateAiReport() {
    const posts = getCurrentFilteredPosts();
    if (posts.length === 0) {
        alert("Your summary cart is empty or no posts match your filters.");
        return;
    }

    try {
        const { geminiApiKey, aiReportPrompt } = await chrome.storage.sync.get(['geminiApiKey', 'aiReportPrompt']);
        
        if (!geminiApiKey || geminiApiKey.trim() === '') {
            alert("Please enter your Google Gemini API Key in the Extension Settings to use this feature.");
            chrome.runtime.openOptionsPage();
            return;
        }

        generateAiReportBtn.textContent = 'Generating...';
        generateAiReportBtn.disabled = true;
        
        let promptText = aiCustomPromptInput.value && aiCustomPromptInput.value.trim() !== '' 
            ? aiCustomPromptInput.value.trim() + "\n\n"
            : (aiReportPrompt && aiReportPrompt.trim() !== '' ? aiReportPrompt.trim() + "\n\n" : "Create a coherent, well-structured summary report in Markdown format based on the following articles. Group related topics if applicable, and highlight the most important takeaways.\n\n");
        
        posts.forEach((post, index) => {
            const feed = findFeedById(post.feedId);
            const source = feed ? feed.name : "Unknown";
            promptText += `### Article ${index + 1}: ${post.title}\n`;
            promptText += `Source: ${source}\n`;
            
            const content = post.fullContentText || post.description || "";
            const cleanContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 3000);
            promptText += `Content: ${cleanContent}\n\n`;
        });

        const modelsToTry = await getAvailableGeminiModels(geminiApiKey);
        if (!modelsToTry || modelsToTry.length === 0) {
            throw new Error("Could not fetch any available AI models.");
        }
        console.log("Attempting to generate report with models:", modelsToTry);

        let response = null;
        let lastErrorData = null;

        for (const model of modelsToTry) {
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: promptText
                        }]
                    }]
                })
            });

            if (response.ok) {
                console.log(`Successfully used model: ${model}`);
                break;
            } else {
                lastErrorData = await response.json();
                console.log(`Model ${model} failed:`, JSON.stringify(lastErrorData));
                }
                }

                if (!response || !response.ok) {
                throw new Error(lastErrorData && lastErrorData.error ? `${lastErrorData.error.message} (Code: ${lastErrorData.error.code})` : 'API Request failed for all attempted models');
                }
        const data = await response.json();
        const aiResponse = data.candidates[0].content.parts[0].text;
        
        currentAiRawMarkdown = aiResponse;

        aiReportContent.innerHTML = formatMarkdownToHtml(aiResponse);
        aiReportContainer.classList.remove('hidden');
        aiReportContainer.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error("Error generating AI report:", error);
        alert(`Failed to generate AI report: ${error.message}`);
    } finally {
        generateAiReportBtn.textContent = 'AI Report';
        generateAiReportBtn.disabled = false;
    }
}

downloadAiReportBtn.addEventListener('click', () => {
    if (!currentAiRawMarkdown) return;
    
    const format = exportAiFormat.value;
    let content = "";
    let mimeType = "text/plain";
    let extension = "txt";
    
    if (format === 'markdown') {
        content = currentAiRawMarkdown;
        mimeType = "text/markdown";
        extension = "md";
    } else if (format === 'html') {
        content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>AI Report</title><style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #333; overflow-wrap: break-word; }
            h1, h2, h3, h4 { color: #222; }
            hr { border: 0; border-top: 1px solid #ddd; margin: 20px 0; }
            a { color: #0066cc; text-decoration: none; }
            img, figure, video, iframe { max-width: 100% !important; height: auto !important; border-radius: 4px; margin: 15px 0; }
            pre { background: #f4f4f4; padding: 15px; border-radius: 4px; overflow-x: auto; }
            @media (prefers-color-scheme: dark) {
                body { background: #222 !important; color: #eee !important; }
                h1, h2, h3, h4 { color: #fff !important; }
                a { color: #58a6ff !important; }
                pre { background: #333 !important; }
            }
        </style></head><body>`;
        content += `<h1>AI Generated Report</h1><hr>`;
        content += formatMarkdownToHtml(currentAiRawMarkdown);
        content += `</body></html>`;
        mimeType = "text/html";
        extension = "html";
    } else { // txt
        content = currentAiRawMarkdown
            .replace(/^#+\s+/gim, '')
            .replace(/\*\*([^\n]+?)\*\*/g, '$1')
            .replace(/(?<=^|\s)\*([^\n*]+?)\*(?=\s|$|[.,!?])/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/<[^>]+>/g, "");
        mimeType = "text/plain";
        extension = "txt";
    }
    
    const now = new Date();
    const datePart = now.toISOString().split('T')[0];
    const defaultName = `puretidings-ai-report-${datePart}.${extension}`;
    let fileName = prompt("Enter a name for the AI report:", defaultName);
    
    if (fileName === null) return;
    if (fileName.trim() === "") fileName = defaultName;
    const finalName = fileName.toLowerCase().endsWith(`.${extension}`) ? fileName : `${fileName}.${extension}`;
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalName;
    a.click();
    URL.revokeObjectURL(url);
});

function formatMarkdownToHtml(markdown) {
    let html = markdown;
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2>$1</h2>');
    
    // Bold
    html = html.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/(?<=^|\s)\*([^\n*]+?)\*(?=\s|$|[.,!?])/g, '<em>$1</em>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    
    // Lists
    html = html.replace(/^\s*[-*]\s+(.*)/gim, '<ul><li>$1</li></ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    
    // Line breaks
    html = html.replace(/\n\n/g, '<br><br>');
    
    return html;
}

function preprocessDOM(doc, url) {
    if (!url) return;

    // Preprocessing: Fix specific sites where Readability fails (like investing.com risk disclaimer)
    if (url.includes('investing.com')) {
        const investingArticle = doc.querySelector('div[class*="article_WYSIWYG"], .articlePage');
        if (investingArticle) {
            investingArticle.querySelectorAll('[data-test="ad-slot-visible"], .ad_ad__II8vw').forEach(ad => ad.remove());
            doc.body.innerHTML = '';
            doc.body.appendChild(investingArticle);
        }
    }

    // Preprocessing: Ensure Readability doesn't strip out specific YouTube containers (like wp-youtube-lyte)
    doc.querySelectorAll('div[id^="lyte_"]').forEach(lyteDiv => {
        const videoId = lyteDiv.id.replace('lyte_', '');
        if (videoId) {
            const iframe = doc.createElement('iframe');
            iframe.src = `https://www.youtube.com/embed/${videoId}?origin=${encodeURIComponent(window.location.origin)}`;
            iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen');
            const wrapper = lyteDiv.closest('.lyte-wrapper') || lyteDiv;
            wrapper.replaceWith(iframe);
        }
    });

    // Preprocessing: Fix Chefkoch.de recipes
    if (url.includes('chefkoch.de')) {
        // 1. Remove slide navigation and carousel elements
        doc.querySelectorAll('nav').forEach(nav => {
            if (nav.textContent.includes('Slide 1')) {
                nav.remove();
            }
        });
        doc.querySelectorAll('.recipe-images__slides, .ds-carousel-item, [class*="slider__control"], .ds-carousel').forEach(el => el.remove());
        
        // Remove empty recipe author headers, breadcrumbs, ads, and widgets
        doc.querySelectorAll('section, div, h2').forEach(el => {
            if (el.textContent.trim() === 'Rezeptautor:in' || el.textContent.trim() === 'Klassische Rezepte der Woche') {
                el.remove();
            }
        });
        doc.querySelectorAll('[data-testid="rds-breadcrumb"], nav[aria-label="Breadcrumb"], spark-ad, spark-config').forEach(el => el.remove());

        // 2. Restructure nutrition grid into a clean horizontal table
        const nutritionCells = doc.querySelectorAll('.ds-nutrition__cell, [class*="nutrition__cell"]');
        if (nutritionCells.length > 0) {
            const data = [];
            nutritionCells.forEach(cell => {
                const valueEl = cell.querySelector('.ds-nutrition__value, [class*="nutrition__value"]');
                const labelEl = cell.querySelector('.ds-nutrition__title, [class*="nutrition__title"]');
                if (valueEl && labelEl) {
                    data.push({
                        label: labelEl.textContent.trim(),
                        value: valueEl.textContent.trim()
                    });
                } else {
                    const paragraphs = cell.querySelectorAll('p');
                    if (paragraphs.length >= 2) {
                        let val = '';
                        let lbl = '';
                        paragraphs.forEach(p => {
                            const txt = p.textContent.trim();
                            if (txt.includes('kcal') || txt.includes(' g') || txt === '--') {
                                val = txt;
                            } else if (txt && !p.querySelector('i') && !txt.match(/^[]$/)) {
                                lbl = txt;
                            }
                        });
                        if (val && lbl) {
                            data.push({ label: lbl, value: val });
                        }
                    }
                }
            });

            if (data.length > 0) {
                const table = doc.createElement('table');
                table.className = 'reader-nutrition-table';
                table.style.width = '100%';
                table.style.borderCollapse = 'collapse';
                table.style.marginTop = '15px';
                table.style.marginBottom = '15px';
                table.style.border = '1px solid var(--border-color, #ddd)';
                
                const trHead = doc.createElement('tr');
                const trBody = doc.createElement('tr');
                
                data.forEach(item => {
                    const th = doc.createElement('th');
                    th.textContent = item.label;
                    th.style.border = '1px solid var(--border-color, #ddd)';
                    th.style.padding = '8px';
                    th.style.backgroundColor = 'var(--bg-color-secondary, #f0f0f0)';
                    th.style.color = 'var(--text-color, #333)';
                    th.style.textAlign = 'center';
                    th.style.fontWeight = 'bold';
                    trHead.appendChild(th);
                    
                    const td = doc.createElement('td');
                    td.textContent = item.value;
                    td.style.border = '1px solid var(--border-color, #ddd)';
                    td.style.padding = '8px';
                    td.style.textAlign = 'center';
                    td.style.color = 'var(--text-color, #333)';
                    trBody.appendChild(td);
                });
                
                table.appendChild(trHead);
                table.appendChild(trBody);

                const container = doc.querySelector('.recipe-nutrition, [class*="nutrition-card"]');
                if (container) {
                    container.replaceWith(table);
                } else {
                    const cellParent = nutritionCells[0].parentElement;
                    if (cellParent) {
                        cellParent.replaceWith(table);
                    }
                }
            }
        }
    }
}
