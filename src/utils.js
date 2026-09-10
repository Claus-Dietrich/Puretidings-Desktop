function getFaviconUrl(feedUrl) {
  try {
    const url = new URL(feedUrl);
    const domain = url.hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
  } catch (error) {
    console.error("Invalid URL for favicon:", feedUrl, error);
    return "128.png"; // Fallback
  }
}

/**
 * Creates the HTML element for a single post.
 * (CHANGED: New HTML structure with .main-content and .post-meta)
 */
function createPostElement(post, isRead, isFavorited, isKeywordMatch) {
  // The main element is now a DIV, not an A-tag
  const item = document.createElement('div');
  item.className = 'post-item';
  item.postData = post; // Attach post data for search logic

  if (isRead) {    item.classList.add('read');
  }
  if (isKeywordMatch) {
    item.classList.add('keyword-match');
  }

  // Thumbnail (if available)
  if (post.featuredImage && post.featuredImage.length > 0) {
    console.log(`[Extension Rendering] Creating thumbnail for "${post.title}": ${post.featuredImage}`);
    const img = document.createElement('img');
    img.src = post.featuredImage;
    img.className = 'post-thumbnail';
    img.onerror = function() {
      console.warn(`[Extension Rendering] Image failed to load: ${this.src}`);
      if (!this.dataset.retried && this.src && !this.src.startsWith('data:')) {
        this.dataset.retried = 'true';
        try {
          const url = new URL(this.src);
          url.searchParams.set('cb', Date.now());
          this.src = url.toString();
        } catch (e) {
          this.style.display = 'none';
        }
      } else {
        this.style.display = 'none';
      }
    };
    item.appendChild(img);
  } else if (post.isGmail || (post.link && post.link.includes('mail.google.com'))) {
    console.log(`[Extension Rendering] Creating Gmail icon for "${post.title}"`);
    const img = document.createElement('img');
    img.src = 'gmail.png';
    img.className = 'post-thumbnail';
    item.appendChild(img);
  } else {
    console.log(`[Extension Rendering] No thumbnail available for "${post.title}"`);
  }

  // NEW: Wrapper for text and actions
  const mainContent = document.createElement('div');
  mainContent.className = 'main-content';

  // Title is now the link
  const title = document.createElement('a'); 
  title.href = post.link;
  title.target = '_blank';
  title.className = 'post-title';
  const decodedTitle = decodeHTML(post.title);
  title.textContent = decodedTitle;
  title.title = decodedTitle; 
  mainContent.appendChild(title); // Title to mainContent
  
  // NEW: .post-meta wrapper for date and actions
  const metaWrapper = document.createElement('div');
  metaWrapper.className = 'post-meta';

  const date = document.createElement('p');
  date.className = 'post-date';
  date.textContent = timeAgo(post.date); 
  metaWrapper.appendChild(date); // Date to metaWrapper

  // Add video length if available
  if (post.videoLength) {
    const durationSpan = document.createElement('span');
    durationSpan.className = 'post-duration';
    durationSpan.textContent = ` (${formatDuration(post.videoLength)})`;
    metaWrapper.appendChild(durationSpan);
  } else if (post.readingTime) { // Display reading time if not a video
    const readingTimeSpan = document.createElement('span');
    readingTimeSpan.className = 'post-duration'; // Reuse class
    readingTimeSpan.textContent = ` (${post.readingTime} min read)`;
    metaWrapper.appendChild(readingTimeSpan);
  }
  
  // Wrapper for ALL actions
  const actionsWrapper = document.createElement('div');
  actionsWrapper.className = 'post-actions';

  // Read mode button
  const readBtn = document.createElement('a');
  readBtn.href = '#';
  readBtn.className = 'read-mode-btn';
  readBtn.title = 'Open in Reader Mode';
  readBtn.innerHTML = '&#128083;'; // Glasses emoji
  actionsWrapper.appendChild(readBtn);

  // Favorite button
  const starBtn = document.createElement('a');
  starBtn.href = '#';
  starBtn.className = 'favorite-btn';
  starBtn.title = 'Add to favorites';
  starBtn.innerHTML = '&#9734;'; 
  if (isFavorited) {
    starBtn.classList.add('favorited');
    starBtn.innerHTML = '&#9733;'; 
    starBtn.title = 'Remove from favorites';
  }
  actionsWrapper.appendChild(starBtn);

  // NEW: Summary/Clipboard button (📋)
  const summaryBtn = document.createElement('a');
  summaryBtn.href = '#';
  summaryBtn.className = 'summary-btn';
  summaryBtn.title = 'Add to summary list';
  summaryBtn.innerHTML = '&#128203;'; // Clipboard emoji
  
  // The 'active' class and styling will be handled by the caller (popup.js or feedpage.js)
  actionsWrapper.appendChild(summaryBtn);

  // "Mark as unread" button
  const unreadBtn = document.createElement('a');
  unreadBtn.href = '#';
  unreadBtn.className = 'mark-unread-btn';
  unreadBtn.title = 'Mark as unread';
  unreadBtn.textContent = 'Mark as Unread';
  actionsWrapper.appendChild(unreadBtn);
  
  metaWrapper.appendChild(actionsWrapper); // Actions to metaWrapper
  mainContent.appendChild(metaWrapper); // metaWrapper to mainContent
  
  item.appendChild(mainContent); // mainContent to post-item
  
  return item;
}

/**
 * Converts an ISO date to a "time ago" string.
 */
function timeAgo(isoDate) {
  const date = new Date(isoDate);

  if (isNaN(date.getTime())) {
    return "Unknown date";
  }

  const seconds = Math.floor((new Date() - date) / 1000);
  
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " minutes ago";
  return "just now";
}

/**
 * Decodes HTML entities in a string.
 * @param {string} str The string to decode.
 * @returns {string} The decoded string.
 */
function decodeHTML(str) {
  if (!str) return '';
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} str The string to escape.
 * @returns {string} The escaped string.
 */
function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, function(match) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[match];
  });
}

/**
 * Formats a duration in seconds into HH:MM:SS.
 * @param {number} seconds - The duration in seconds.
 * @returns {string} The formatted duration.
 */
function formatDuration(seconds) {
  if (isNaN(seconds) || seconds < 0) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  const parts = [];
  if (hours > 0) parts.push(hours.toString().padStart(2, '0'));
  parts.push(minutes.toString().padStart(2, '0'));
  parts.push(remainingSeconds.toString().padStart(2, '0'));

  return parts.join(':');
}

/**
 * Parses an ISO 8601 duration string (e.g., "PT1M35S") into seconds.
 * @param {string} duration - The ISO 8601 duration string.
 * @returns {number|null} The total duration in seconds, or null if parsing fails.
 */
function parseISO8601Duration(duration) {
  if (!duration || typeof duration !== 'string') {
    return null;
  }
  
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

  if (!match) {
    return null;
  }

  const hours = parseInt(match[1] || 0, 10);
  const minutes = parseInt(match[2] || 0, 10);
  const seconds = parseInt(match[3] || 0, 10);

  return (hours * 3600) + (minutes * 60) + seconds;
}

/**
 * Calculates the estimated reading time for a given text.
 * @param {string} text - The text to calculate the reading time for.
 * @returns {number} - The estimated reading time in minutes.
 */
function calculateReadingTime(text) {
  if (!text) return 0;
  // Strip HTML tags to get a better word count
  const plainText = text.replace(/<[^>]+>/g, ' ');
  const wordsPerMinute = 225; // Average reading speed
  const words = plainText.trim().split(/\s+/).length;
  const time = Math.ceil(words / wordsPerMinute);
  return time;
}

/**
 * Extracts the YouTube channel ID from a feed URL or channel page URL.
 * @param {string} url The YouTube URL.
 * @returns {Promise<string|null>} The channel ID or null if not found.
 */
async function getYouTubeChannelIdFromUrl(url) {
  try {
    const urlObj = new URL(url);
    if (!urlObj.hostname.includes('youtube.com')) return null;

    // 1. Already a feed URL?
    if (urlObj.pathname === '/feeds/videos.xml') {
      return urlObj.searchParams.get('channel_id');
    }

    // 2. Is it a direct channel ID URL? /channel/UC...
    const channelMatch = urlObj.pathname.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
    if (channelMatch) return channelMatch[1];

    // 3. Otherwise, fetch the page to find the channel ID (via RSS link or metadata)
    const response = await fetch(url);
    if (!response.ok) return null;
    const html = await response.text();

    // Look for the RSS feed link
    const rssMatch = html.match(/youtube\.com\/feeds\/videos\.xml\?channel_id=(UC[a-zA-Z0-9_-]+)/);
    if (rssMatch) return rssMatch[1];
       
    // Look for externalId or channelId in JSON/scripts
    const idMatch = html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/) || html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/);
    if (idMatch) return idMatch[1];

  } catch (error) {
    console.error('Error resolving YouTube channel ID:', error);
  }
  return null;
}

/**
 * Fetches the channel name for a given YouTube channel ID.
 * @param {string} channelId The YouTube channel ID.
 * @returns {Promise<string>} The channel name.
 */
async function getYouTubeChannelName(channelId) {
  const channelUrl = `https://www.youtube.com/channel/${channelId}`;
  try {
    const response = await fetch(channelUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch channel page: ${response.statusText}`);
    }
    const html = await response.text();
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    if (titleMatch && titleMatch[1]) {
      // Clean up the title, e.g., "Channel Name - YouTube" -> "Channel Name"
      return titleMatch[1].replace(/ - YouTube$/, '').trim();
    }
    throw new Error('Could not find title tag in channel page.');
  } catch (error) {
    console.error(`Error fetching YouTube channel name for ${channelId}:`, error);
    // As a fallback, just return the channelId, so the user has something.
    return channelId;
  }
}

/**
 * Formats the description text, handling YouTube-style timelines.
 * @param {string} descriptionContent The raw description text.
 * @returns {string} The formatted HTML string.
 */
function formatDescription(descriptionContent) {
    if (!descriptionContent) return '';
    const timelineStartRegex = /^(?:\s*\d{1,2}:\d{2}(?::\d{2})?)/m;
    const match = descriptionContent.match(timelineStartRegex);

    let formattedDescription;

    if (match) {
        const timelineStartsAt = match.index;
        const beforeTimeline = descriptionContent.substring(0, timelineStartsAt);
        const timelineBlock = descriptionContent.substring(timelineStartsAt);

        const formattedBefore = beforeTimeline
            .trim()
            .split(/\n{2,}/)
            .map(p => `<p>${p.trim().replace(/\n/g, '<br>')}</p>`)
            .join('');

        const formattedTimeline = '<div class="timeline-block">' + timelineBlock
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => {
                const cleanedLine = line.replace(/&nbsp;|\s/g, '');
                return cleanedLine.length > 0;
            })
            .join('<br>') + '</div>';

        if (formattedBefore.trim() !== '') {
            formattedDescription = formattedBefore + formattedTimeline;
        } else {
            formattedDescription = formattedTimeline;
        }
    } else {
        formattedDescription = descriptionContent
            .trim()
            .split(/\n{2,}/)
            .map(p => `<p>${p.trim().replace(/\n/g, '<br>')}</p>`)
            .join('');
    }
    return formattedDescription;
}

/**
 * Checks if a URL contains common hints for a feed (e.g., rss, atom, feed, .xml).
 * Uses a regex to ensure the hint is a distinct part of the URL (e.g., /feed/, .rss).
 * @param {string} url - The URL to check.
 * @returns {boolean} - True if hints are found, false otherwise.
 */
function hasFeedHints(url) {
  if (!url || typeof url !== 'string') return false;
  
  // Explicitly allow YouTube channel patterns
  const isYouTubeChannel = /youtube\.com\/(channel\/|user\/|c\/|@)/i.test(url);
  if (isYouTubeChannel) return true;

  // This regex looks for rss, atom, feed(s), or xml preceded and followed by
  // common URL separators or the start/end of the string.
  const regex = /(^|[\/\.\?\=\&\-\_])(rss|atom|feed|xml)s?([\/\.\?\=\&\-\_]|$)/i;
  return regex.test(url);
}

/**
 * Creates a responsive thumbnail placeholder for a YouTube video that links to the video.
 * @param {string} videoId The YouTube video ID.
 * @returns {HTMLElement} The container element with the thumbnail and play button.
 */
function createYouTubePlaceholder(videoId) {
    const container = document.createElement('div');
    container.className = 'video-container';
    // Inline styles as fallback if CSS is missing
    container.style.position = 'relative';
    container.style.paddingBottom = '56.25%';
    container.style.height = '0';
    container.style.overflow = 'hidden';
    container.style.maxWidth = '100%';
    container.style.margin = '20px 0';
    container.style.borderRadius = '8px';
    container.style.background = '#000';

    const linkEl = document.createElement('a');
    linkEl.href = `https://www.youtube.com/watch?v=${videoId}`;
    linkEl.target = '_blank';
    linkEl.rel = 'noopener noreferrer';
    linkEl.style.position = 'absolute';
    linkEl.style.top = '0';
    linkEl.style.left = '0';
    linkEl.style.width = '100%';
    linkEl.style.height = '100%';
    linkEl.style.display = 'flex';
    linkEl.style.alignItems = 'center';
    linkEl.style.justifyContent = 'center';
    linkEl.style.textDecoration = 'none';
    
    const img = document.createElement('img');
    img.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    img.alt = 'YouTube Video Thumbnail';
    img.onerror = function() {
      if (!this.dataset.retried && this.src && !this.src.startsWith('data:')) {
        this.dataset.retried = 'true';
        try {
          const url = new URL(this.src);
          url.searchParams.set('cb', Date.now());
          this.src = url.toString();
        } catch (e) {
          // ignore
        }
      }
    };
    img.style.position = 'absolute';
    img.style.top = '0';
    img.style.left = '0';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.border = '0';
    img.style.margin = '0';

    const playIcon = document.createElement('div');
    // A nice clean YouTube-style play button SVG
    playIcon.innerHTML = '<svg height="68" viewBox="0 0 68 48" width="68"><path d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55 C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19 C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z" fill="#FF0000"></path><path d="M 45,24 27,14 27,34" fill="#fff"></path></svg>';
    playIcon.style.position = 'relative';
    playIcon.style.zIndex = '1';
    playIcon.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))';
    playIcon.style.transition = 'transform 0.2s ease';
    
    linkEl.addEventListener('mouseenter', () => playIcon.style.transform = 'scale(1.1)');
    linkEl.addEventListener('mouseleave', () => playIcon.style.transform = 'scale(1)');

    linkEl.appendChild(img);
    linkEl.appendChild(playIcon);
    container.appendChild(linkEl);
    
    return container;
}

/**
 * Fetches a list of available Gemini models from the API, with caching.
 * @param {string} apiKey - The user's Gemini API key.
 * @returns {Promise<string[]>} - A promise that resolves to an array of model names.
 */
async function getAvailableGeminiModels(apiKey) {
    const cacheKey = 'gemini_models_cache';
    const cacheDuration = 24 * 60 * 60 * 1000; // 24 hours

    try {
        const cachedData = await new Promise(resolve => chrome.storage.local.get(cacheKey, resolve));
        if (cachedData[cacheKey]) {
            const { models, timestamp } = cachedData[cacheKey];
            if (Date.now() - timestamp < cacheDuration) {
                console.log('Using cached Gemini models.');
                return models;
            }
        }
    } catch (e) {
        console.error('Error reading model cache:', e);
    }

    console.log('Fetching fresh list of Gemini models.');
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) {
            throw new Error(`API returned status ${response.status}`);
        }
        const data = await response.json();
        const supportedModels = data.models
            .filter(model =>
                model.supportedGenerationMethods.includes('generateContent') &&
                model.name.includes('gemini') // Only include gemini models
            )
            .map(model => model.name.replace('models/', ''));

        // Prioritize models: flash, then pro, then others
        supportedModels.sort((a, b) => {
            const aIsFlash = a.includes('flash');
            const bIsFlash = b.includes('flash');
            const aIsPro = a.includes('pro');
            const bIsPro = b.includes('pro');

            if (aIsFlash && !bIsFlash) return -1;
            if (!aIsFlash && bIsFlash) return 1;
            if (aIsPro && !bIsPro) return -1;
            if (!aIsPro && bIsPro) return 1;
            return b.localeCompare(a); // Reverse alphabetical for same type to prioritize newer versions
        });

        if (supportedModels.length > 0) {
            try {
                await new Promise(resolve => chrome.storage.local.set({
                    [cacheKey]: { models: supportedModels, timestamp: Date.now() }
                }, resolve));
            } catch (e) {
                console.error('Error saving model cache:', e);
            }
            return supportedModels;
        } else {
             // If the dynamic fetch fails or returns no models, use a safe default list.
            console.warn('Dynamic model fetch failed or returned no models. Using fallback list.');
            return ['gemini-1.5-flash-latest', 'gemini-pro-latest'];
        }

    } catch (error) {
        console.error('Failed to fetch available models, using fallback list:', error);
        // Fallback to a stable list if the API call fails
        return ['gemini-1.5-flash-latest', 'gemini-pro-latest'];
    }
}

// Utility to compress strings for URLs
function encodeForUrlSafe(str) {
    if (!str) return '';
    try {
        return btoa(unescape(encodeURIComponent(str)));
    } catch(e) {
        return '';
    }
}

function decodeFromUrlSafe(str) {
    if (!str) return '';
    try {
        return decodeURIComponent(escape(atob(str)));
    } catch(e) {
        return str; // fallback to raw string if not base64
    }
}

/**
 * Applies rules to a post and updates its state (matchedRules, isHidden, read status).
 * @param {object} post - The post object to process.
 * @param {array} rules - The list of active rules.
 * @param {Set} readLinksSet - The set of read links to update if needed.
 * @returns {object} The updated post.
 */
function localEscapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function localParseSearchQuery(query) {
    const searchInput = (query || '').trim();
    if (!searchInput) return [];

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
                const escapedTerm = localEscapeRegExp(trimmed).replace(/\\\*/g, '.*');
                conditions.push({
                    regex: new RegExp(escapedTerm, 'i'),
                    mustNot: currentMustNot
                });
            }
        });
        return conditions;
    }).filter(group => group.length > 0);

    return searchConditionGroups;
}

/**
 * Applies rules to a post and updates its state (matchedRules, isHidden, read status).
 * @param {object} post - The post object to process.
 * @param {array} rules - The list of active rules.
 * @param {Set} readLinksSet - The set of read links to update if needed.
 * @returns {object} The updated post.
 */
function applyRulesToPost(post, rules, readLinksSet) {
    if (!post) return post;
    
    // Ensure basic properties exist
    if (!post.matchedRules) post.matchedRules = [];
    post.isHidden = false;

    const enabledRules = rules.filter(rule => rule.enabled !== false);
    
    enabledRules.forEach(rule => {
        const postValue = String(post[rule.field] || '');
        const ruleValue = (rule.value || '').trim();
        if (!ruleValue) return;

        let match = false;
        let matchedKeyword = '';

        if (rule.condition === 'equals') {
            match = postValue.toLowerCase() === ruleValue.toLowerCase();
            if (match) matchedKeyword = ruleValue;
        } else {
            const searchConditionGroups = localParseSearchQuery(ruleValue);
            if (searchConditionGroups.length > 0) {
                const matchingGroup = searchConditionGroups.find(group => 
                    group.every(cond => cond.mustNot ? !cond.regex.test(postValue) : cond.regex.test(postValue))
                );
                
                const matchesSearch = !!matchingGroup;
                
                if (rule.condition === 'contains') {
                    match = matchesSearch;
                    if (match && matchingGroup) {
                        const positiveCond = matchingGroup.find(c => !c.mustNot);
                        matchedKeyword = positiveCond ? positiveCond.regex.source.replace(/\\\*/g, '*').replace(/\\/g, '') : ruleValue;
                    }
                } else if (rule.condition === 'not-contains') {
                    match = !matchesSearch;
                }
            }
        }

        if (match) {
          // Track the match for the "Keyword Matches" view
          if (!post.matchedRules.some(m => m.id === rule.id)) {
              post.matchedRules.push({ id: rule.id, value: matchedKeyword || rule.value });
          }
          
          switch (rule.action) {
            case 'markAsRead': 
                if (readLinksSet) readLinksSet.add(post.link); 
                break;
            case 'hide': 
                post.isHidden = true; 
                break;
            // 'notify' is handled by the generic push to matchedRules above
          }
        }
    });
    
    return post;
}

/**
 * Sanitizes HTML content by removing tags and attributes that trigger Chrome extension errors
 * when injected via innerHTML (like deprecated meta tags or head sections).
 */
function sanitizeHtmlForInlining(html) {
    if (!html || typeof html !== 'string') return html;
    
    let clean = html;
    
    // 1. Remove <head> section if present
    if (clean.includes('<head>')) {
        clean = clean.replace(/<head>[\s\S]*?<\/head>/gi, '');
    }
    
    // 2. Remove all <meta> tags
    clean = clean.replace(/<meta[\s\S]*?>/gi, '');
    
    // 3. Remove all <script> and <style> tags for safety and consistent layout
    clean = clean.replace(/<script[\s\S]*?<\/script>/gi, '');
    clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');

    // 4. Remove all <title> and <link> tags from body
    clean = clean.replace(/<title[\s\S]*?<\/title>/gi, '');
    clean = clean.replace(/<link[\s\S]*?>/gi, '');

    // 5. Clean problematic meta properties and deprecated iframe attributes
    clean = clean.replace(/([,;]\s*)?target-densitydpi=[^;\"\s>]+(\s*[,;])?/gi, '');
    clean = clean.replace(/gesture=\"media\"/gi, 'allow=\"autoplay\"'); // Fix deprecated YouTube attribute
    clean = clean.replace(/allowfullscreen=\"(true|1)?\"/gi, 'allow=\"fullscreen\"'); // Modernize fullscreen
    
    clean = clean.replace(/([,;]\s*)(?=["'>])/g, '');
    clean = clean.replace(/,\s*,/g, ',').replace(/;\s*;/g, ';');
    
    return clean;
}

/**
 * Strips non-essential metadata for storage.sync compatibility (8KB limit).
 */
function stripMetadataForSync(key, data) {
    if (!Array.isArray(data)) return data;
    if (key === 'feedTree') {
        return data.map(node => {
            const stripped = { id: node.id, name: node.name, url: node.url, type: node.type, fetchOgImage: node.fetchOgImage };
            if (node.children) stripped.children = stripMetadataForSync('feedTree', node.children);
            return stripped;
        });
    }
    if (key === 'favoritedLinks' || key === 'summaryLinks') {
        return data.map(link => {
            if (link && typeof link === 'object') {
                return {
                    url: link.url,
                    title: link.title,
                    date: link.date,
                    feedId: link.feedId
                };
            }
            return link;
        });
    }
    return data;
}

/**
 * Validates if the data fits within the 8KB sync quota.
 * Chrome QUOTA_BYTES_PER_ITEM is 8192 bytes and includes the key length.
 */
function validateSyncQuota(key, data) {
    const jsonString = JSON.stringify(data);
    const size = new TextEncoder().encode(jsonString).length + key.length;
    const limit = 8192; // 8KB
    return {
        size,
        percent: (size / limit) * 100,
        level: size >= 7800 ? 'red' : (size >= 6500 ? 'yellow' : 'green'),
        isFull: size >= 8100
    };
}

/**
 * Sanitizes an array of links to ensure it contains only valid non-empty strings.
 * If any legacy item is an object with a url key, it extracts that url.
 */
function sanitizeLinksArray(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
        .map(item => {
            if (typeof item === 'string') return item.trim();
            if (item && typeof item === 'object' && typeof item.url === 'string') {
                return item.url.trim();
            }
            return null;
        })
        .filter(item => typeof item === 'string' && item.length > 0);
}