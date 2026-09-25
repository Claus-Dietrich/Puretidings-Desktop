// DOM Elements
const feedList = document.getElementById('feed-list');
const addFeedForm = document.getElementById('add-feed-form');
const nameInput = document.getElementById('feed-name');
const urlInput = document.getElementById('feed-url');
const folderSelect = document.getElementById('feed-folder');
const statusMessage = document.getElementById('status-message');
const intervalInput = document.getElementById('interval-minutes');
const intervalStatus = document.getElementById('interval-status');
const randomizeFetchToggle = document.getElementById('randomize-fetch-toggle');
const scheduleTableBody = document.querySelector('#schedule-table tbody');
const scheduleStatus = document.getElementById('schedule-status');
const formTitle = document.getElementById('add-feed-title');
const saveButton = document.getElementById('save-button');
const cancelButton = document.getElementById('cancel-edit-button');
const notificationToggle = document.getElementById('notification-toggle');
const resetButton = document.getElementById('reset-button');
const backupStatus = document.getElementById('backup-status');
const backupButton = document.getElementById('backup-json-button');
const importButton = document.getElementById('import-json-button');
const importFileInput = document.getElementById('import-json-input');
const exportOpmlButton = document.getElementById('export-opml-button');
const importOpmlButton = document.getElementById('import-opml-button');
const importOpmlInput = document.getElementById('import-opml-input');
const markAllReadButton = document.getElementById('mark-all-read-button');
const markAllUnreadButton = document.getElementById('mark-all-unread-button');
const markAllReadStatus = document.getElementById('mark-all-read-status');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const summaryNotificationToggle = document.getElementById('summary-notification-toggle');
const summaryIntervalInput = document.getElementById('summary-interval-minutes');
const summaryIntervalStatus = document.getElementById('summary-interval-status');
const fetchOgImageInput = document.getElementById('fetch-og-image');

const geminiApiKeyInput = document.getElementById('gemini-api-key');
const aiReportPromptInput = document.getElementById('ai-report-prompt');
const youtubeAiPromptInput = document.getElementById('youtube-ai-prompt');
const apiKeyStatus = document.getElementById('api-key-status');
const aiPromptStatus = document.getElementById('ai-prompt-status');
const youtubeAiPromptStatus = document.getElementById('youtube-ai-prompt-status');

const autoBackupInterval = document.getElementById('auto-backup-interval');
const autoBackupTimeGroup = document.getElementById('auto-backup-time-group');
const autoBackupTime = document.getElementById('auto-backup-time');
const autoBackupDayGroup = document.getElementById('auto-backup-day-group');
const autoBackupDay = document.getElementById('auto-backup-day');
const autoBackupMonthlyDayGroup = document.getElementById('auto-backup-monthly-day-group');
const autoBackupMonthlyDay = document.getElementById('auto-backup-monthly-day');
const autoBackupFormat = document.getElementById('auto-backup-format');
const autoBackupStatus = document.getElementById('auto-backup-status');

// Gmail Integration DOM Elements
const authorizeGmailButton = document.getElementById('authorize-gmail-button');
const revokeGmailButton = document.getElementById('revoke-gmail-button');
const gmailAuthStatus = document.getElementById('gmail-auth-status');

// Rules Engine DOM Elements
const rulesList = document.getElementById('rules-list');
const addRuleForm = document.getElementById('add-rule-form');
const ruleField = document.getElementById('rule-field');
const ruleCondition = document.getElementById('rule-condition');
const ruleValue = document.getElementById('rule-value');
const ruleAction = document.getElementById('rule-action');
const cancelRuleEditButton = document.getElementById('cancel-rule-edit-button');
const addRuleTitle = document.getElementById('add-rule-title');
const saveRuleButton = document.getElementById('save-rule-button');

// Folder Management DOM Elements
const folderList = document.getElementById('folder-list');
const addFolderForm = document.getElementById('add-folder-form');
const newFolderNameInput = document.getElementById('new-folder-name');
const parentFolderSelect = document.getElementById('parent-folder-select');
const saveFolderButton = document.getElementById('save-folder-button');
const cancelFolderEditButton = document.getElementById('cancel-folder-edit-button');
const folderStatusMessage = document.getElementById('folder-status-message');
const addFolderTitle = document.getElementById('add-folder-title');

// Popup Size UI Elements
const popupWidthInput = document.getElementById('popup-width');
const popupHeightInput = document.getElementById('popup-height');
const popupSizeStatus = document.getElementById('popup-size-status');


let currentFeedTree = []; // Stores the hierarchical feed and folder data
let currentRules = [];
let editingFeedId = null;
let editingRuleId = null;
let editingFolderId = null; // To track folder being edited

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize tabs
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tabContents.forEach(content => {
                content.classList.toggle('hidden', content.id !== target);
            });
        });
    });

    // Add storage listener for real-time updates from other pages/devices
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            const keys = ['feedTree', 'favoritedLinks', 'summaryLinks'];
            if (keys.some(k => changes[k])) {
                console.log("Storage changed externally, refreshing options UI...");
                if (changes.feedTree) {
                    currentFeedTree = changes.feedTree.newValue || [];
                    renderFeedList();
                    populateFolderSelects();
                }
                updateSyncStatus();
            }
        }
    });

    await loadSettingsAndFeeds();
});

addFeedForm.addEventListener('submit', handleAddOrUpdateFeed);

// Ensure Enter key triggers submit in the form inputs
[nameInput, urlInput].forEach(input => {
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddOrUpdateFeed(e);
        }
    });
});

intervalInput.addEventListener('change', handleSaveInterval);
randomizeFetchToggle.addEventListener('change', handleSaveRandomizeFetchSetting);
cancelButton.addEventListener('click', resetFeedForm);
notificationToggle.addEventListener('change', handleSaveNotificationSetting);
summaryNotificationToggle.addEventListener('change', handleSaveSummarySettings);
summaryIntervalInput.addEventListener('change', handleSaveSummarySettings);
resetButton.addEventListener('click', handleReset);
backupButton.addEventListener('click', handleBackupJSON);
importButton.addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', handleImportJSON);
exportOpmlButton.addEventListener('click', handleExportOPML);
importOpmlButton.addEventListener('click', () => importOpmlInput.click());
importOpmlInput.addEventListener('change', handleImportOPML);
addRuleForm.addEventListener('submit', handleAddOrUpdateRule);
markAllReadButton.addEventListener('click', handleMarkAllAsRead);
markAllUnreadButton.addEventListener('click', handleMarkAllAsUnread);
cancelRuleEditButton.addEventListener('click', cancelRuleEdit);
darkModeToggle.addEventListener('change', handleSaveDarkModeSetting);
addFolderForm.addEventListener('submit', handleAddOrUpdateFolder);
cancelFolderEditButton.addEventListener('click', resetFolderForm);
geminiApiKeyInput.addEventListener('change', handleSaveApiKey);
aiReportPromptInput.addEventListener('change', handleSaveAiPrompt);
youtubeAiPromptInput.addEventListener('change', handleSaveYoutubeAiPrompt);

popupWidthInput.addEventListener('change', handleSavePopupSize);
popupHeightInput.addEventListener('change', handleSavePopupSize);

autoBackupInterval.addEventListener('change', () => {
    toggleAutoBackupTimeVisibility();
    handleSaveAutoBackupSettings();
});
autoBackupTime.addEventListener('change', handleSaveAutoBackupSettings);
autoBackupDay.addEventListener('change', handleSaveAutoBackupSettings);
autoBackupMonthlyDay.addEventListener('change', handleSaveAutoBackupSettings);
autoBackupFormat.addEventListener('change', handleSaveAutoBackupSettings);
authorizeGmailButton.addEventListener('click', handleAuthorizeGmail);
revokeGmailButton.addEventListener('click', handleRevokeGmail);

// Sync UI when storage changes (e.g., from another tab or device via Service Worker)
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
        let shouldRefresh = false;

        if (changes.feedTree) {
            currentFeedTree = changes.feedTree.newValue || [];
            shouldRefresh = true;
        }

        if (changes.favoritedLinks || changes.summaryLinks) {
            shouldRefresh = true;
        }

        if (shouldRefresh) {
            renderFeedList();
            updateSyncStatus();
        }
    }
});

function toggleAutoBackupTimeVisibility() {
    const val = autoBackupInterval.value;
    if (val === '0') {
        autoBackupTimeGroup.style.display = 'none';
        autoBackupDayGroup.style.display = 'none';
        autoBackupMonthlyDayGroup.style.display = 'none';
    } else {
        autoBackupTimeGroup.style.display = 'flex';
        autoBackupDayGroup.style.display = (val === '7') ? 'flex' : 'none';
        autoBackupMonthlyDayGroup.style.display = (val === '30') ? 'flex' : 'none';
    }
}

// LOADS feeds AND settings
async function loadSettingsAndFeeds() {
  try {
    checkGmailAuthStatus();
    const data = await chrome.storage.sync.get(['feeds', 'checkInterval', 'showNotification', 'keywords', 'rules', 'darkMode', 'showSummaryNotification', 'summaryInterval', 'randomizeFetch', 'fetchSchedule', 'geminiApiKey', 'aiReportPrompt', 'youtubeAiPrompt', 'autoBackupInterval', 'autoBackupFormat', 'autoBackupTime', 'autoBackupDay', 'autoBackupMonthlyDay', 'popupWidth', 'popupHeight']);
    
    // Load feedTree and syncEmail from local storage
    const localData = await chrome.storage.local.get(['feedTree', 'syncEmail']);
    let feedTree = localData.feedTree;
    if (localData.syncEmail && syncEmailInput) {
        syncEmailInput.value = localData.syncEmail;
    }

    let needsSave = false;
    
    popupWidthInput.value = data.popupWidth || 450;
    popupHeightInput.value = data.popupHeight || 550;

    if (feedTree && feedTree.length > 0) {
      currentFeedTree = feedTree;
    } else {
        // DEFENSIVE: Fallback to sync for migration/backup
        const syncDataMigration = await chrome.storage.sync.get('feedTree');
        if (syncDataMigration.feedTree && syncDataMigration.feedTree.length > 0) {
            currentFeedTree = syncDataMigration.feedTree;
            needsSave = true;
        } else if (data.feeds && data.feeds.length > 0) {
            console.log("Migrating old flat feeds to new tree structure...");
            currentFeedTree = convertToTree(data.feeds);
            needsSave = true;
        } else {
            currentFeedTree = [];
        }
    }
    
    function ensureFetchOgImageProperty(nodes) {
      nodes.forEach(node => {
        if (node.type === 'feed' && typeof node.fetchOgImage === 'undefined') {
          node.fetchOgImage = true;
          needsSave = true;
        }
        if (node.type === 'folder' && node.children) {
          ensureFetchOgImageProperty(node.children);
        }
      });
    }
    ensureFetchOgImageProperty(currentFeedTree);

    if (needsSave) {
      await chrome.runtime.sendMessage({ action: "safeStorageSet", key: "feedTree", data: currentFeedTree });
    }

    if (data.keywords && data.keywords.length > 0 && !data.rules) {
      await migrateKeywordsToRules(data.keywords);
      const migratedData = await chrome.storage.sync.get(['rules']);
      data.rules = migratedData.rules;
    }

    currentRules = data.rules || [];
    
    renderFeedList();
    renderRulesList();
    renderFolderList();
    populateFolderSelects();
    
    intervalInput.value = data.checkInterval === undefined ? 30 : data.checkInterval;
    randomizeFetchToggle.checked = data.randomizeFetch || false;
    renderScheduleTable(data.fetchSchedule);
    notificationToggle.checked = data.showNotification === undefined ? true : data.showNotification;
    summaryNotificationToggle.checked = data.showSummaryNotification || false;
    summaryIntervalInput.value = data.summaryInterval || 60;
    darkModeToggle.checked = data.darkMode !== undefined ? data.darkMode : true;
    
    geminiApiKeyInput.value = data.geminiApiKey || '';
    aiReportPromptInput.value = data.aiReportPrompt || '';
    youtubeAiPromptInput.value = data.youtubeAiPrompt || '';

    autoBackupInterval.value = data.autoBackupInterval || '0';
    autoBackupFormat.value = data.autoBackupFormat || 'json';
    autoBackupTime.value = data.autoBackupTime || '12:00';
    autoBackupDay.value = data.autoBackupDay !== undefined ? data.autoBackupDay : '1';
    autoBackupMonthlyDay.value = data.autoBackupMonthlyDay || '1';
    toggleAutoBackupTimeVisibility();
    updateAutoBackupStatus();
    updateSyncStatus();

  } catch (error) {
    console.error("Error loading settings:", error);
  }
}

async function handleSaveApiKey() {
    await chrome.storage.sync.set({ geminiApiKey: geminiApiKeyInput.value.trim() });
    showStatus(apiKeyStatus, "Saved!");
}

async function handleSaveAiPrompt() {
    await chrome.storage.sync.set({ aiReportPrompt: aiReportPromptInput.value });
    showStatus(aiPromptStatus, "Saved!");
}

async function handleSaveYoutubeAiPrompt() {
    await chrome.storage.sync.set({ youtubeAiPrompt: youtubeAiPromptInput.value });
    showStatus(youtubeAiPromptStatus, "Saved!");
}

async function handleSavePopupSize() {
  const width = Math.min(800, Math.max(350, parseInt(popupWidthInput.value, 10) || 430));
  const height = Math.min(600, Math.max(400, parseInt(popupHeightInput.value, 10) || 530));
  await chrome.storage.sync.set({ popupWidth: width, popupHeight: height });
  popupWidthInput.value = width;
  popupHeightInput.value = height;
  showStatus(popupSizeStatus, "Saved!");
}

function showStatus(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.style.color = "green";
    setTimeout(() => { el.textContent = ""; }, 3000);
}

async function handleSaveInterval() {
    const interval = parseInt(intervalInput.value, 10);
    await chrome.storage.sync.set({ checkInterval: interval });
    await chrome.runtime.sendMessage({ action: "updateAlarm" });
    showStatus(intervalStatus, "Saved!");
}

async function handleSaveRandomizeFetchSetting() {
    await chrome.storage.sync.set({ randomizeFetch: randomizeFetchToggle.checked });
}

async function handleSaveNotificationSetting() {
    await chrome.storage.sync.set({ showNotification: notificationToggle.checked });
}

async function handleSaveSummarySettings() {
    const interval = parseInt(summaryIntervalInput.value, 10);
    await chrome.storage.sync.set({ 
        showSummaryNotification: summaryNotificationToggle.checked,
        summaryInterval: interval 
    });
    await chrome.runtime.sendMessage({ action: "updateAlarm" });
    showStatus(summaryIntervalStatus, "Saved!");
}

async function handleSaveDarkModeSetting() {
    const isDark = darkModeToggle.checked;
    await chrome.storage.sync.set({ darkMode: isDark });
    
    // Toggle on both html and body for maximum compatibility
    document.documentElement.classList.toggle('dark-mode', isDark);
    if (document.body) {
        document.body.classList.toggle('dark-mode', isDark);
    }
}

// Hierarchical Tree Logic
function updateFeedInTree(nodes, id, newProps) {
  for (const node of nodes) {
    if (node.id === id) { Object.assign(node, newProps); return true; }
    if (node.type === 'folder' && node.children && updateFeedInTree(node.children, id, newProps)) return true;
  }
  return false;
}

function updateFolderInTree(nodes, id, newProps) {
  for (const node of nodes) {
    if (node.id === id) { Object.assign(node, newProps); return true; }
    if (node.type === 'folder' && node.children && updateFolderInTree(node.children, id, newProps)) return true;
  }
  return false;
}

function removeNodeFromTree(nodes, id) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return nodes.splice(i, 1)[0];
    if (nodes[i].type === 'folder' && nodes[i].children) {
      const found = removeNodeFromTree(nodes[i].children, id);
      if (found) return found;
    }
  }
  return null;
}

function findParentFolderId(nodes, id, parentId = "") {
  for (const node of nodes) {
    if (node.id === id) return parentId;
    if (node.type === 'folder' && node.children) {
      const found = findParentFolderId(node.children, id, node.id);
      if (found !== null) return found;
    }
  }
  return null;
}

// Rendering UI
function renderFeedList() {
    feedList.innerHTML = '';
    
    function renderNodes(nodes, level = 0) {
        nodes.forEach(node => {
            const li = document.createElement('li');
            li.dataset.id = node.id;
            li.draggable = true; // Make draggable
            
            if (node.type === 'folder') {
                li.className = 'folder-header';
                li.style.paddingLeft = `${level * 20 + 12}px`;
                li.innerHTML = `
                    <div class="drag-handle"></div>
                    <span class="folder-name">📁 ${escapeHTML(decodeHTML(node.name))}</span>
                    <div class="folder-actions">
                        <button class="edit-btn" data-id="${node.id}">Edit</button>
                        <button class="delete-btn" data-id="${node.id}">Delete</button>
                    </div>
                `;
                li.querySelector('.edit-btn').onclick = (e) => { e.stopPropagation(); editFolder(node.id); };
                li.querySelector('.delete-btn').onclick = (e) => { e.stopPropagation(); deleteFolder(node.id); };
            } else {
                li.className = 'feed-item-row';
                li.style.paddingLeft = `${level * 20 + 12}px`;
                const faviconUrl = getFaviconUrl(node.url);
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
                        <button class="edit-btn" data-id="${node.id}">Edit</button>
                        <button class="delete-btn" data-id="${node.id}">Delete</button>
                    </div>
                `;
                li.querySelector('.edit-btn').onclick = () => editFeed(node.id);
                li.querySelector('.delete-btn').onclick = () => deleteFeed(node.id);
            }

            // Drag and Drop Event Listeners
            li.addEventListener('dragstart', handleDragStart);
            li.addEventListener('dragover', handleDragOver);
            li.addEventListener('dragleave', handleDragLeave);
            li.addEventListener('drop', handleDrop);
            li.addEventListener('dragend', handleDragEnd);

            feedList.appendChild(li);
            if (node.children) renderNodes(node.children, level + 1);
        });
    }
    renderNodes(currentFeedTree);
}

// Drag and Drop Handlers
let draggedNodeId = null;

function handleDragStart(e) {
    draggedNodeId = this.dataset.id;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedNodeId);
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    
    const rect = this.getBoundingClientRect();
    const height = rect.height;
    const y = e.clientY - rect.top;
    const isFolder = this.classList.contains('folder-header');
    
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

function handleDragLeave() {
    this.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');
}

function handleDragEnd() {
    this.classList.remove('dragging');
    const items = feedList.querySelectorAll('li');
    items.forEach(item => item.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center'));
}

async function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    
    const isCenter = this.classList.contains('drag-over-center');
    const isTop = this.classList.contains('drag-over-top');
    this.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');

    const targetNodeId = this.dataset.id;
    if (draggedNodeId === targetNodeId) return;

    // Find the dragged node and its original parent
    const draggedNode = removeNodeFromTree(currentFeedTree, draggedNodeId);
    if (!draggedNode) return;

    let success = false;

    if (isCenter) {
        // Move INTO folder
        const folder = findNodeById(currentFeedTree, targetNodeId);
        if (folder && folder.type === 'folder') {
            if (!folder.children) folder.children = [];
            folder.children.push(draggedNode);
            success = true;
        }
    } else {
        // Reorder (BEFORE or AFTER)
        function findAndInsert(nodes, targetId, nodeToInsert, before) {
            for (let i = 0; i < nodes.length; i++) {
                if (nodes[i].id === targetId) {
                    const index = before ? i : i + 1;
                    nodes.splice(index, 0, nodeToInsert);
                    return true;
                }
                if (nodes[i].type === 'folder' && nodes[i].children) {
                    if (findAndInsert(nodes[i].children, targetId, nodeToInsert, before)) return true;
                }
            }
            return false;
        }
        success = findAndInsert(currentFeedTree, targetNodeId, draggedNode, isTop);
    }

    if (success) {
        // UI already reflected in currentFeedTree, just persist and refresh UI components
        await chrome.runtime.sendMessage({ action: "safeStorageSet", key: "feedTree", data: currentFeedTree });
        renderFeedList();
        populateFolderSelects();
        updateSyncStatus();
    }
 else {
        // Fallback: put it back (shouldn't happen)
        currentFeedTree.push(draggedNode);
        renderFeedList();
    }

    return false;
}

async function handleAddOrUpdateFeed(e) {
    e.preventDefault();
    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    const folderId = folderSelect.value;
    const fetchOgImage = fetchOgImageInput.checked;

    if (editingFeedId) {
        updateFeedInTree(currentFeedTree, editingFeedId, { name, url, fetchOgImage });
        const currentFolderId = findParentFolderId(currentFeedTree, editingFeedId);
        if (currentFolderId !== folderId) {
            const feed = removeNodeFromTree(currentFeedTree, editingFeedId);
            if (feed) {
                if (folderId === "") currentFeedTree.push(feed);
                else {
                    const folder = findNodeById(currentFeedTree, folderId);
                    if (folder) { if (!folder.children) folder.children = []; folder.children.push(feed); }
                }
            }
        }
        await chrome.runtime.sendMessage({ action: "safeStorageSet", key: "feedTree", data: currentFeedTree });
        // Optimize: Only fetch the edited feed, not all feeds
        await chrome.runtime.sendMessage({ action: "forceFetchSingle", feedId: editingFeedId });
    } else {
        const newFeed = { id: Date.now().toString(), name, url, type: 'feed', fetchOgImage };
        if (folderId === "") {
            currentFeedTree.push(newFeed);
        } else {
            const folder = findNodeById(currentFeedTree, folderId);
            if (folder) { if (!folder.children) folder.children = []; folder.children.push(newFeed); }
        }
        await chrome.runtime.sendMessage({ action: "safeStorageSet", key: "feedTree", data: currentFeedTree });
        // Fetch only the newly added feed
        await chrome.runtime.sendMessage({ action: "forceFetchSingle", feedId: newFeed.id });
    }
    
    resetFeedForm(); 
    renderFeedList(); 
    populateFolderSelects();
    updateSyncStatus();
}

function resetFeedForm() {
    editingFeedId = null; addFeedForm.reset();
    formTitle.textContent = "Add New Feed"; saveButton.textContent = "Add Feed";
    cancelButton.classList.add('hidden');
}

function editFeed(id) {
    const feed = findNodeById(currentFeedTree, id);
    if (!feed) return;
    editingFeedId = id;
    nameInput.value = decodeHTML(feed.name);
    urlInput.value = feed.url;
    fetchOgImageInput.checked = feed.fetchOgImage || false;
    folderSelect.value = findParentFolderId(currentFeedTree, id) || "";
    formTitle.textContent = "Edit Feed"; saveButton.textContent = "Update Feed";
    cancelButton.classList.remove('hidden');
    addFeedForm.scrollIntoView({ behavior: 'smooth' });
}

async function deleteFeed(id) {
    if (confirm("Delete this feed?")) {
        removeNodeFromTree(currentFeedTree, id);
        await chrome.runtime.sendMessage({ action: "safeStorageSet", key: "feedTree", data: currentFeedTree });
        renderFeedList();
        updateSyncStatus();
    }
}

function renderRulesList() {
    rulesList.innerHTML = '';
    currentRules.forEach(rule => {
        const li = document.createElement('li');
        li.className = 'rule-item';
        li.innerHTML = `
            <div class="rule-description">
                <input type="checkbox" class="rule-enable-toggle" ${rule.enabled !== false ? 'checked' : ''}>
                <span>IF <strong>${rule.field}</strong> ${rule.condition.replace('-', ' ')} <code>${escapeHTML(rule.value)}</code> THEN <strong>${rule.action}</strong></span>
            </div>
            <div class="rule-actions">
                <button class="edit-btn">Edit</button>
                <button class="delete-btn">Delete</button>
            </div>
        `;
        li.querySelector('.rule-enable-toggle').onchange = (e) => toggleRuleEnabled(rule.id, e.target.checked);
        li.querySelector('.edit-btn').onclick = () => editRule(rule.id);
        li.querySelector('.delete-btn').onclick = () => deleteRule(rule.id);
        rulesList.appendChild(li);
    });
}

async function handleAddOrUpdateRule(e) {
    e.preventDefault();
    const rule = { id: editingRuleId || Date.now().toString(), field: ruleField.value, condition: ruleCondition.value, value: ruleValue.value.trim(), action: ruleAction.value, enabled: true };
    if (editingRuleId) {
        const idx = currentRules.findIndex(r => r.id === editingRuleId);
        if (idx > -1) currentRules[idx] = rule;
    } else currentRules.push(rule);
    await chrome.storage.sync.set({ rules: currentRules });
    cancelRuleEdit(); renderRulesList();
}

function cancelRuleEdit() {
    editingRuleId = null; addRuleForm.reset();
    addRuleTitle.textContent = "Add New Rule"; saveRuleButton.textContent = "Add Rule";
    cancelRuleEditButton.classList.add('hidden');
}

function editRule(id) {
    const rule = currentRules.find(r => r.id === id);
    if (!rule) return;
    editingRuleId = id;
    ruleField.value = rule.field; ruleCondition.value = rule.condition;
    ruleValue.value = rule.value; ruleAction.value = rule.action;
    addRuleTitle.textContent = "Edit Rule"; saveRuleButton.textContent = "Update Rule";
    cancelRuleEditButton.classList.remove('hidden');
    addRuleForm.scrollIntoView({ behavior: 'smooth' });
}

async function deleteRule(id) {
    if (confirm("Delete rule?")) {
        currentRules = currentRules.filter(r => r.id !== id);
        await chrome.storage.sync.set({ rules: currentRules });
        renderRulesList();
    }
}

async function toggleRuleEnabled(id, enabled) {
    const rule = currentRules.find(r => r.id === id);
    if (rule) { rule.enabled = enabled; await chrome.storage.sync.set({ rules: currentRules }); }
}

function renderFolderList() {
    folderList.innerHTML = '';
    const folders = [];
    function collect(nodes) {
        nodes.forEach(n => { if (n.type === 'folder') { folders.push(n); if (n.children) collect(n.children); } });
    }
    collect(currentFeedTree);
    folders.forEach(f => {
        const li = document.createElement('li');
        li.className = 'folder-management-item';
        li.innerHTML = `
            <span class="folder-name-container">📁 ${escapeHTML(decodeHTML(f.name))}</span>
            <div class="folder-actions">
                <button class="edit-btn">Edit</button>
                <button class="delete-btn">Delete</button>
            </div>`;
        li.querySelector('.edit-btn').onclick = () => editFolder(f.id);
        li.querySelector('.delete-btn').onclick = () => deleteFolder(f.id);
        folderList.appendChild(li);
    });
}

async function handleAddOrUpdateFolder(e) {
    e.preventDefault();
    const name = newFolderNameInput.value.trim();
    const parentId = parentFolderSelect.value;
    if (editingFolderId) updateFolderInTree(currentFeedTree, editingFolderId, { name });
    else {
        const newFolder = { id: 'folder_' + Date.now(), name, type: 'folder', children: [] };
        if (parentId === "") currentFeedTree.push(newFolder);
        else {
            const parent = findNodeById(currentFeedTree, parentId);
            if (parent) { if (!parent.children) parent.children = []; parent.children.push(newFolder); }
        }
    }
    await chrome.runtime.sendMessage({ action: "safeStorageSet", key: "feedTree", data: currentFeedTree });
    resetFolderForm(); renderFolderList(); renderFeedList(); populateFolderSelects();
    updateSyncStatus();
}

function resetFolderForm() {
    editingFolderId = null; addFolderForm.reset();
    addFolderTitle.textContent = "Add New Folder"; saveFolderButton.textContent = "Add Folder";
    cancelFolderEditButton.classList.add('hidden');
}

function editFolder(id) {
    const folder = findNodeById(currentFeedTree, id);
    if (!folder) return;
    editingFolderId = id;
    newFolderNameInput.value = decodeHTML(folder.name);
    parentFolderSelect.value = findParentFolderId(currentFeedTree, id) || "";
    addFolderTitle.textContent = "Edit Folder"; saveFolderButton.textContent = "Update Folder";
    cancelFolderEditButton.classList.remove('hidden');
}

async function deleteFolder(id) {
    if (confirm("Delete folder? (Items inside move to root)")) {
        const f = findNodeById(currentFeedTree, id);
        if (f && f.children) f.children.forEach(c => currentFeedTree.push(c));
        removeNodeFromTree(currentFeedTree, id);
        await chrome.runtime.sendMessage({ action: "safeStorageSet", key: "feedTree", data: currentFeedTree });
        renderFolderList(); renderFeedList(); populateFolderSelects();
        updateSyncStatus();
    }
}

function populateFolderSelects() {
    [folderSelect, parentFolderSelect].forEach(sel => {
        sel.innerHTML = '<option value="">Root</option>';
        function fill(nodes, level = 0) {
            nodes.forEach(n => {
                if (n.type === 'folder') {
                    const opt = document.createElement('option');
                    opt.value = n.id; opt.textContent = '  '.repeat(level) + decodeHTML(n.name);
                    sel.appendChild(opt);
                    if (n.children) fill(n.children, level + 1);
                }
            });
        }
        fill(currentFeedTree);
    });
}

async function handleBackupJSON() {
    const data = await chrome.storage.sync.get(null);
    const local = await chrome.storage.local.get(['feedTree', 'feedTreeUpdatedAt', 'syncEmail', 'readLinks', 'favoritedLinks', 'summaryLinks']);
    const blob = new Blob([JSON.stringify({ version: 2, sync: data, local }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `puretidings-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; a.click();
}

async function handleImportJSON(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const d = JSON.parse(ev.target.result);
            if (d.sync) await chrome.storage.sync.set(d.sync);
            if (d.local) await chrome.storage.local.set(d.local);
            window.location.reload();
        } catch (err) { alert("Failed to import backup: " + err.message); }
    };
    reader.readAsText(file);
}

async function handleExportOPML() {
    const { feedTree = [] } = await chrome.storage.local.get('feedTree');
    let opml = '<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>PureTidings Export</title></head><body>';
    function walk(nodes) {
        nodes.forEach(n => {
            if (n.type === 'folder') { opml += `<outline text="${escapeHTML(n.name)}">`; walk(n.children || []); opml += '</outline>'; }
            else opml += `<outline type="rss" text="${escapeHTML(n.name)}" xmlUrl="${escapeHTML(n.url)}"/>`;
        });
    }
    walk(feedTree);
    opml += '</body></opml>';
    const blob = new Blob([opml], { type: 'text/xml' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `puretidings-feeds-${new Date().toISOString().replace(/[:.]/g, '-')}.opml`; a.click();
}

async function handleImportOPML(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const parser = new DOMParser();
        const xml = parser.parseFromString(ev.target.result, "text/xml");
        const outlines = xml.querySelectorAll('body > outline');
        const newFeeds = [];
        outlines.forEach(o => {
            if (o.getAttribute('xmlUrl')) newFeeds.push({ id: Date.now() + Math.random(), name: o.getAttribute('text'), url: o.getAttribute('xmlUrl'), type: 'feed' });
        });
        currentFeedTree.push(...newFeeds);
        await chrome.runtime.sendMessage({ action: "safeStorageSet", key: "feedTree", data: currentFeedTree });
        window.location.reload();
    };
    reader.readAsText(file);
}

async function handleReset() {
    if (confirm("Reset everything?")) {
        // Try to revoke Gmail token if connected
        if (chrome.identity?.getAuthToken) {
            try {
                const token = await new Promise(resolve => {
                    chrome.identity.getAuthToken({ interactive: false }, t => {
                        if (chrome.runtime.lastError) { resolve(null); return; }
                        resolve(t);
                    });
                });
                if (token) {
                    await new Promise(resolve => chrome.identity.removeCachedAuthToken({ token }, () => {
                        if (chrome.runtime.lastError) { /* ignore */ }
                        resolve();
                    }));
                    await fetch('https://accounts.google.com/o/oauth2/revoke?token=' + token);
                }
            } catch (e) { console.warn("Gmail revocation failed during reset", e); }
        }
        await chrome.storage.local.clear(); 
        await chrome.storage.sync.clear();

        // Restore Defaults after Reset
        const defaultId = crypto.randomUUID();
        const defaultFeedTree = [{ id: defaultId, name: 'Pure Tidings', url: 'https://puretidings.com/feed/', type: 'feed' }];
        
        await chrome.storage.sync.set({
          isInitialized: true,
          activeFeedId: defaultId,
          checkInterval: 30,
          randomizeFetch: false,
          showNotification: true,
          rules: [],
          darkMode: true,
          showSummaryNotification: false,
          summaryInterval: 60
        });

        await chrome.runtime.sendMessage({ action: "safeStorageSet", key: "feedTree", data: defaultFeedTree });
        await chrome.runtime.sendMessage({ action: "safeStorageSet", key: "favoritedLinks", data: [] });
        await chrome.runtime.sendMessage({ action: "safeStorageSet", key: "summaryLinks", data: [] });

        window.location.reload();
    }
}

function renderScheduleTable(schedule = {}) {
    scheduleTableBody.innerHTML = '';
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    days.forEach((day, idx) => {
        const dIdx = (idx + 1) % 7;
        const conf = schedule[dIdx] || { active: true, from: '00:00', to: '23:59' };
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${day}</td><td><input type="checkbox" class="schedule-active" ${conf.active ? 'checked' : ''}></td>
            <td><input type="time" class="schedule-from" value="${conf.from}"></td><td><input type="time" class="schedule-to" value="${conf.to}"></td>`;
        tr.querySelectorAll('input').forEach(i => i.onchange = handleSaveSchedule);
        scheduleTableBody.appendChild(tr);
    });
}

async function handleSaveSchedule() {
    const sch = {};
    const rows = scheduleTableBody.querySelectorAll('tr');
    rows.forEach((r, i) => {
        const dIdx = (i + 1) % 7;
        sch[dIdx] = { active: r.querySelector('.schedule-active').checked, from: r.querySelector('.schedule-from').value, to: r.querySelector('.schedule-to').value };
    });
    await chrome.storage.sync.set({ fetchSchedule: sch });
}

function checkGmailAuthStatus() {
    if (chrome.identity?.getAuthToken) {
        chrome.identity.getAuthToken({ interactive: false }, (t) => {
            if (chrome.runtime.lastError || !t) {
                authorizeGmailButton.classList.remove('hidden');
                revokeGmailButton.classList.add('hidden');
                gmailAuthStatus.textContent = "Status: Not Connected";
            } else {
                authorizeGmailButton.classList.add('hidden');
                revokeGmailButton.classList.remove('hidden');
                gmailAuthStatus.textContent = "Status: Connected (Fetching identity...)";
                fetchGmailIdentity(t);
            }
        });
    }
}

async function fetchGmailIdentity(token) {
    try {
        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (response.ok) {
            const data = await response.json();
            if (data.emailAddress) {
                gmailAuthStatus.textContent = `Status: Connected as ${data.emailAddress}`;
            } else {
                gmailAuthStatus.textContent = "Status: Connected";
            }
        } else {
            gmailAuthStatus.textContent = "Status: Connected";
        }
    } catch (error) {
        console.error("Error fetching Gmail identity:", error);
        gmailAuthStatus.textContent = "Status: Connected";
    }
}

function handleAuthorizeGmail() { chrome.identity.getAuthToken({ interactive: true }, checkGmailAuthStatus); }
function handleRevokeGmail() {
    chrome.identity.getAuthToken({ interactive: false }, (t) => {
        if (t) {
            chrome.identity.removeCachedAuthToken({ token: t }, () => {
                fetch('https://accounts.google.com/o/oauth2/revoke?token=' + t).then(checkGmailAuthStatus);
            });
        }
    });
}

function updateAutoBackupStatus() {
    autoBackupStatus.textContent = autoBackupInterval.value === '0' ? "Backups disabled." : "Backups active.";
}

async function handleSaveAutoBackupSettings() {
    await chrome.storage.sync.set({
        autoBackupInterval: autoBackupInterval.value,
        autoBackupFormat: autoBackupFormat.value,
        autoBackupTime: autoBackupTime.value,
        autoBackupDay: parseInt(autoBackupDay.value, 10),
        autoBackupMonthlyDay: parseInt(autoBackupMonthlyDay.value, 10)
    });
    updateAutoBackupStatus();
}

async function handleMarkAllAsRead() {
    markAllReadStatus.textContent = "Working...";
    markAllReadStatus.style.color = "var(--primary-color)";
    try {
        const response = await chrome.runtime.sendMessage({ action: "doMarkAllAsRead" });
        if (response.status === 'ok') {
            showStatus(markAllReadStatus, "All marked as read!");
        } else {
            showStatus(markAllReadStatus, "Error: " + response.message);
        }
    } catch (err) {
        showStatus(markAllReadStatus, "Error connecting to background script.");
    }
}

async function handleMarkAllAsUnread() {
    markAllReadStatus.textContent = "Working...";
    markAllReadStatus.style.color = "var(--primary-color)";
    try {
        const response = await chrome.runtime.sendMessage({ action: "doMarkAllAsUnread" });
        if (response.status === 'ok') {
            showStatus(markAllReadStatus, "All marked as unread!");
        } else {
            showStatus(markAllReadStatus, "Error: " + response.message);
        }
    } catch (err) {
        showStatus(markAllReadStatus, "Error connecting to background script.");
    }
}
// --- Cloud Sync / Web App Export ---
const syncEmailInput = document.getElementById('sync-email-input');
const saveSyncEmailBtn = document.getElementById('save-sync-email-btn');
const forceUploadWebBtn = document.getElementById('force-upload-web-btn');
const forceDownloadWebBtn = document.getElementById('force-download-web-btn');
const exportWebStatus = document.getElementById('export-web-status');

async function handleSaveSyncEmail() {
    const email = syncEmailInput.value.trim();
    if (!email) {
        showStatus(exportWebStatus, "Please enter a valid email address.");
        exportWebStatus.style.color = "red";
        return;
    }
    
    exportWebStatus.textContent = "Saving email...";
    exportWebStatus.style.color = "var(--primary-color)";
    
    await chrome.storage.local.set({ syncEmail: email });
    
    // Trigger sync check in the background
    try {
        await chrome.runtime.sendMessage({ action: "triggerCloudSync" });
        showStatus(exportWebStatus, "Email saved! Sync triggered.");
    } catch (err) {
        showStatus(exportWebStatus, "Email saved locally.");
    }
}

async function handleForceUpload() {
    const email = syncEmailInput.value.trim();
    if (!email) {
        showStatus(exportWebStatus, "Sync Email required for cloud operations.");
        exportWebStatus.style.color = "red";
        return;
    }

    if (!currentFeedTree || currentFeedTree.length === 0) {
        alert("No feeds found to upload!");
        return;
    }

    exportWebStatus.textContent = "Uploading feed tree and rules to cloud...";
    exportWebStatus.style.color = "var(--primary-color)";

    try {
        const SUPABASE_URL = 'https://lujvogyndoryofuffntr.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1anZvZ3luZG9yeW9mdWZmbnRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MzI3ODYsImV4cCI6MjA5NzAwODc4Nn0.UEEN01ZKzcdkbP5ktOm35UgWwYQbbwTkM4K0u9_b09w';
        
        const syncData = await chrome.storage.sync.get('rules');
        const rules = syncData.rules || [];

        const nowStr = new Date().toISOString();
        const response = await fetch(`${SUPABASE_URL}/rest/v1/user_settings?email=eq.${encodeURIComponent(email)}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                feed_tree: currentFeedTree,
                rules: rules,
                updated_at: nowStr
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.length > 0) {
                await chrome.storage.local.set({ feedTreeUpdatedAt: nowStr });
                showStatus(exportWebStatus, "SUCCESS! Feeds & Rules uploaded to cloud.");
            } else {
                // If user is not found, try to insert the row
                const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_settings`, {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                        email: email,
                        feed_tree: currentFeedTree,
                        rules: rules,
                        updated_at: nowStr
                    })
                });
                if (insertResponse.ok) {
                    await chrome.storage.local.set({ feedTreeUpdatedAt: nowStr });
                    showStatus(exportWebStatus, "SUCCESS! Cloud settings initialized & uploaded.");
                } else {
                    showStatus(exportWebStatus, "Error: User not found in DB.");
                    exportWebStatus.style.color = "red";
                }
            }
        } else {
            const err = await response.json();
            showStatus(exportWebStatus, "Error: " + (err.message || "Unknown"));
            exportWebStatus.style.color = "red";
        }
    } catch (err) {
        console.error(err);
        showStatus(exportWebStatus, "Upload failed.");
        exportWebStatus.style.color = "red";
    }
}

async function handleForceDownload() {
    const email = syncEmailInput.value.trim();
    if (!email) {
        showStatus(exportWebStatus, "Sync Email required for cloud operations.");
        exportWebStatus.style.color = "red";
        return;
    }

    if (!confirm("Are you sure you want to download from the cloud? This will overwrite your local feed tree & rules!")) {
        return;
    }

    exportWebStatus.textContent = "Downloading settings from cloud...";
    exportWebStatus.style.color = "var(--primary-color)";

    try {
        const SUPABASE_URL = 'https://lujvogyndoryofuffntr.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1anZvZ3luZG9yeW9mdWZmbnRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MzI3ODYsImV4cCI6MjA5NzAwODc4Nn0.UEEN01ZKzcdkbP5ktOm35UgWwYQbbwTkM4K0u9_b09w';
        
        const response = await fetch(`${SUPABASE_URL}/rest/v1/user_settings?email=eq.${encodeURIComponent(email)}`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.length > 0) {
                const cloudSettings = data[0];
                if (cloudSettings.feed_tree) {
                    currentFeedTree = cloudSettings.feed_tree;
                    await chrome.storage.local.set({ 
                        feedTree: currentFeedTree,
                        feedTreeUpdatedAt: cloudSettings.updated_at || new Date().toISOString()
                    });
                    
                    // Sync rules if found in cloud
                    if (cloudSettings.rules !== undefined && cloudSettings.rules !== null) {
                        await chrome.storage.sync.set({ rules: cloudSettings.rules });
                        currentRules = cloudSettings.rules;
                        renderRulesList();
                    }
                    
                    renderFeedList();
                    renderFolderList();
                    populateFolderSelects();
                    showStatus(exportWebStatus, "SUCCESS! Feeds & Rules downloaded from cloud.");
                } else {
                    showStatus(exportWebStatus, "No feed tree found in cloud.");
                    exportWebStatus.style.color = "red";
                }
            } else {
                showStatus(exportWebStatus, "User not found in cloud database.");
                exportWebStatus.style.color = "red";
            }
        } else {
            const err = await response.json();
            showStatus(exportWebStatus, "Error: " + (err.message || "Unknown"));
            exportWebStatus.style.color = "red";
        }
    } catch (err) {
        console.error(err);
        showStatus(exportWebStatus, "Download failed.");
        exportWebStatus.style.color = "red";
    }
}

saveSyncEmailBtn.addEventListener('click', handleSaveSyncEmail);
forceUploadWebBtn.addEventListener('click', handleForceUpload);
forceDownloadWebBtn.addEventListener('click', handleForceDownload);

async function migrateKeywordsToRules(keywords) {
  const rules = keywords.map(kw => ({
    id: 'rule_' + Math.random().toString(36).substr(2, 9),
    field: 'title', condition: 'contains', value: kw, action: 'notify', enabled: true
  }));
  await chrome.storage.sync.set({ rules });
  await chrome.storage.sync.remove('keywords');
}

/**
 * Calculates and updates the UI for sync storage health.
 */
async function updateSyncStatus() {
    try {
        const localData = await chrome.storage.local.get(['favoritedLinks', 'summaryLinks']);
        
        // For feedTree, use the current memory state to reflect unsynced changes
        const strippedTree = stripMetadataForSync('feedTree', currentFeedTree);
        const treeQuota = validateSyncQuota('feedTree', strippedTree);

        const strippedFavs = stripMetadataForSync('favoritedLinks', localData.favoritedLinks || []);
        const favsQuota = validateSyncQuota('favoritedLinks', strippedFavs);

        const strippedSum = stripMetadataForSync('summaryLinks', localData.summaryLinks || []);
        const sumQuota = validateSyncQuota('summaryLinks', strippedSum);

        const updateUI = (idPrefix, quota) => {
            const bar = document.getElementById(`health-bar-${idPrefix}`);
            const text = document.getElementById(`health-text-${idPrefix}`);
            if (bar && text) {
                if (idPrefix === 'tree') {
                    bar.style.width = '100%';
                    bar.style.backgroundColor = '#28a745';
                    text.textContent = 'Unlimited (Supabase)';
                    text.title = 'Stored in Chrome Local Storage and synchronized via Supabase.';
                    return;
                }
                const percent = Math.min(100, quota.percent).toFixed(1);
                bar.style.width = `${percent}%`;
                
                // Color coding
                if (quota.level === 'red') bar.style.backgroundColor = '#dc3545';
                else if (quota.level === 'yellow') bar.style.backgroundColor = '#ffc107';
                else bar.style.backgroundColor = '#28a745';

                text.textContent = `${percent}%`;
                text.title = `${quota.size} / 8192 bytes`;
            }
        };

        updateUI('tree', treeQuota);
        updateUI('favorites', favsQuota);
        updateUI('summary', sumQuota);

    } catch (err) {
        console.error("Error updating sync status:", err);
    }
}
