// DOM-Elemente
const loadingView = document.getElementById('reader-loading');
const errorView = document.getElementById('reader-error');
const contentView = document.getElementById('reader-content');
const titleEl = document.getElementById('reader-title');
const thumbnailEl = document.getElementById('reader-thumbnail');
const bylineEl = document.getElementById('reader-byline');
const videoInfoEl = document.getElementById('reader-video-info'); // New: Video info element
const bodyEl = document.getElementById('reader-article-body');
const toolbarEl = document.getElementById('reader-toolbar');
const exportFormat = document.getElementById('export-format');
const copyBtn = document.getElementById('copy-btn');
const saveBtn = document.getElementById('save-btn');
const copyStatus = document.getElementById('copy-status');

// AI Report Elements
const generateAiReportBtn = document.getElementById('generate-ai-report-btn');
const generateYoutubeAiReportBtn = document.getElementById('generate-youtube-ai-report-btn');
const aiReportContainer = document.getElementById('ai-report-container');
const aiReportContent = document.getElementById('ai-report-content');
const exportAiFormat = document.getElementById('export-ai-format');
const copyAiReportBtn = document.getElementById('copy-ai-report-btn');
const downloadAiReportBtn = document.getElementById('download-ai-report-btn');
const closeAiReportBtn = document.getElementById('close-ai-report-btn');
const aiCustomPromptInput = document.getElementById('ai-custom-prompt-val');
const aiGenerateWithPromptBtn = document.getElementById('ai-generate-with-prompt-btn');

let currentUrl = '';
let currentAiRawMarkdown = '';

/**
 * Starts the loading process when the page opens
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Hole die URL aus den URL-Parametern
  const params = new URLSearchParams(window.location.search);
  const articleUrl = params.get('url');
  currentUrl = articleUrl;
  const descriptionText = params.get('description'); // Get description
  const titleText = params.get('title'); // Get title
  const videoLengthText = params.get('videoLength'); // Get video length
  const featuredImage = params.get('featuredImage');
  const sourceName = params.get('source'); // Get source name
  const fullContentHtmlText = params.get('fullContentHtmlText'); // NEW: Get full content
  const feedId = params.get('feedId'); // NEW: To look up in storage

  if (!articleUrl) {
    showError("No article URL provided.");
    return;
  }

  // Set up toolbar listeners
  copyBtn.addEventListener('click', handleCopy);
  saveBtn.addEventListener('click', handleSave);

  const starBtn = document.getElementById('star-btn');
  const summaryBtn = document.getElementById('summary-btn');

  const { favoritedLinks = [], summaryLinks = [] } = await chrome.storage.local.get(['favoritedLinks', 'summaryLinks']);

  if (favoritedLinks.includes(articleUrl)) {
    starBtn.classList.add('favorited');
    starBtn.innerHTML = '&#9733;';
    starBtn.title = 'Remove from favorites';
  }

  if (summaryLinks.includes(articleUrl)) {
    summaryBtn.classList.add('active');
    summaryBtn.title = 'Remove from summary cart';
  }

  starBtn.addEventListener('click', async () => {
    const { favoritedLinks = [] } = await chrome.storage.local.get('favoritedLinks');
    const isFavorited = starBtn.classList.contains('favorited');
    let newLinks = [];
    
    if (isFavorited) {
      newLinks = favoritedLinks.filter(link => link !== articleUrl);
      starBtn.classList.remove('favorited');
      starBtn.innerHTML = '&#9734;';
      starBtn.title = 'Add to favorites';
    } else {
      newLinks = [...favoritedLinks, articleUrl];
      starBtn.classList.add('favorited');
      starBtn.innerHTML = '&#9733;';
      starBtn.title = 'Remove from favorites';
    }
    
    await chrome.runtime.sendMessage({ 
      action: "safeStorageSet", 
      key: "favoritedLinks", 
      data: newLinks 
    });
  });

  summaryBtn.addEventListener('click', async () => {
    const { summaryLinks = [] } = await chrome.storage.local.get('summaryLinks');
    const index = summaryLinks.indexOf(articleUrl);
    let newLinks = [...summaryLinks];

    if (index > -1) {
      newLinks.splice(index, 1);
      summaryBtn.classList.remove('active');
      summaryBtn.title = 'Add to summary cart';
    } else {
      newLinks.push(articleUrl);
      summaryBtn.classList.add('active');
      summaryBtn.title = 'Remove from summary cart';
    }

    await chrome.runtime.sendMessage({ 
      action: "safeStorageSet", 
      key: "summaryLinks", 
      data: newLinks 
    });
  });

  // Set Source/Byline if available
  if (sourceName) {
    bylineEl.textContent = sourceName;
  }

  // --- NEW: Try to load from storage first (more robust for large content) ---
  let storedFullContent = null;
  let isGmailPost = false;
  if (feedId) {
    try {
        const { allPosts } = await chrome.storage.local.get('allPosts');
        if (allPosts && allPosts[feedId]) {
            const post = allPosts[feedId].find(p => p.link === articleUrl);
            if (post) {
                isGmailPost = !!post.isGmail;
                if (post.fullContentHtml) {
                    storedFullContent = post.fullContentHtml;
                    console.log("Loaded full content from storage.");
                }
            }
        }
    } catch (e) { console.warn("Could not load from storage", e); }
  }

  // Fallback: Check URL for Gmail if storage lookup failed
  if (!isGmailPost && articleUrl && articleUrl.includes('mail.google.com')) {
      isGmailPost = true;
  }

  // Check for AI Key
  // ... (rest of the code) ...

  try {
      const syncData = await chrome.storage.sync.get('geminiApiKey');
      if (syncData.geminiApiKey && syncData.geminiApiKey.trim() !== '') {
          if ((articleUrl.includes('youtube.com/watch') || articleUrl.includes('youtube.com/shorts/'))) {
              generateYoutubeAiReportBtn.classList.remove('hidden');
          } else {
              generateAiReportBtn.classList.remove('hidden');
          }
      }
  } catch(e) { console.error("Error loading API key:", e); }

  // Set up AI listeners
  generateAiReportBtn.addEventListener('click', async () => {
      aiReportContainer.classList.remove('hidden');
      aiReportContent.innerHTML = '<p style="color: var(--text-color); font-style: italic;">Customize the prompt above if needed and click "Generate 🤖" to start the summary analysis.</p>';
      
      const { aiReportPrompt } = await chrome.storage.sync.get('aiReportPrompt');
      aiCustomPromptInput.value = aiReportPrompt && aiReportPrompt.trim() !== ''
          ? aiReportPrompt.trim()
          : "Provide a concise summary and highlight the key takeaways of the following article in Markdown format.";
      aiGenerateWithPromptBtn.dataset.type = 'article';
  });
  generateYoutubeAiReportBtn.addEventListener('click', async () => {
      aiReportContainer.classList.remove('hidden');
      aiReportContent.innerHTML = '<p style="color: var(--text-color); font-style: italic;">Customize the prompt above if needed and click "Generate 🤖" to start the summary analysis.</p>';

      const { youtubeAiPrompt } = await chrome.storage.sync.get('youtubeAiPrompt');
      aiCustomPromptInput.value = youtubeAiPrompt && youtubeAiPrompt.trim() !== ''
          ? youtubeAiPrompt.trim()
          : "You are an assistant that summarizes YouTube videos. Generate a response in English that is clearly divided into two distinct sections using these exact Markdown headings:\n\n### 📝 Summary from Video Description\n[Provide a concise summary of the video's description text here]\n\n### 🎥 Summary from Video Script\n[Provide a concise summary and 3-5 key takeaways in bullet points based on the transcript (script) of the video here]\n\nIf both description and transcript are provided, you MUST show both sections. If the transcript could not be loaded, still display both headers but under the script header write: 'No video script (transcript) available. Summary is based only on the description.' Ignore advertisements or sponsor mentions in the text.\n\n";
      aiGenerateWithPromptBtn.dataset.type = 'youtube';
  });
  aiGenerateWithPromptBtn.addEventListener('click', () => {
      if (aiGenerateWithPromptBtn.dataset.type === 'youtube') {
          handleGenerateYoutubeAiReport();
      } else {
          handleGenerateAiReport();
      }
  });
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
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #333; }
              h1, h2, h3, h4 { color: #222; }
              hr { border: 0; border-top: 1px solid #ddd; margin: 20px 0; }
              a { color: #0066cc; text-decoration: none; }
          </style></head><body>`;
          content += `<h1>AI Generated Summary</h1><hr>`;
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

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanTitle = (titleEl.textContent.substring(0, 45).replace(/[^a-z0-9_-]/gi, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'article');
      a.download = `${cleanTitle}_KI_Summary.${extension}`;
      a.click();
      URL.revokeObjectURL(url);
  });

  // Display thumbnail if available
  if (featuredImage) {
      thumbnailEl.src = featuredImage;
      thumbnailEl.classList.remove('hidden');
  }

  // Display title if available
  if (titleText) {
    titleEl.textContent = titleText;
    document.title = titleText;
  }

  // Display video info if available - THIS IS FOR YOUTUBE LINKS
  if ((articleUrl.includes('youtube.com/watch') || articleUrl.includes('youtube.com/shorts/'))) {
    // 1. Extract Video ID
    let videoId = '';
    if (articleUrl.includes('youtu.be/')) {
        videoId = articleUrl.split('youtu.be/')[1].split('?')[0];
    } else if (articleUrl.includes('youtube.com/watch')) {
        videoId = new URL(articleUrl).searchParams.get('v');
    } else if (articleUrl.includes('youtube.com/shorts/')) {
        videoId = articleUrl.split('youtube.com/shorts/')[1].split('?')[0];
    }
    videoId = videoId ? videoId.split('&')[0] : '';

    // 2. Prepare Body Content (Thumbnail + Description)
    let bodyHtml = '';
    if (videoId) {
        const placeholder = createYouTubePlaceholder(videoId);
        bodyHtml += placeholder.outerHTML;
    }
    
    if (descriptionText) {
      bodyHtml += `<div class="desc-content">${formatDescription(descriptionText)}</div>`;
    }
    
    // Wrap it like Readability to ensure consistent site styling and export structure
    bodyEl.innerHTML = `<div id="readability-page-1" class="page"><article><div>${bodyHtml}</div></article></div>`;
    bodyEl.classList.remove('hidden');

    // Add source link and reading time
    addOriginalLinkAndReadingTime(articleUrl, bodyEl.textContent);

    // 3. Prepare UI video info (not for export, just for the reader view top box)
    let videoInfoHtml = `YouTube Video: <a href="${articleUrl}" target="_blank">${titleText || articleUrl}</a>`;
    if (videoLengthText) {
      const lengthInSeconds = parseInt(videoLengthText, 10);
      if (!isNaN(lengthInSeconds)) {
        videoInfoHtml += ` (${formatDuration(lengthInSeconds)})`;
      }
    }
    videoInfoEl.innerHTML = videoInfoHtml;
    videoInfoEl.classList.remove('hidden');

    // Then we stop, no need to fetch the article
    loadingView.classList.add('hidden');
    contentView.classList.remove('hidden');
    toolbarEl.classList.remove('hidden');
    chrome.runtime.sendMessage({ action: "markAsRead", link: articleUrl });

  } else if (isGmailPost && !storedFullContent) {
      // Safety: Gmail URLs cannot be fetched/scraped. Show specific error.
      showError("Gmail content is not available. Please go back to the feed list and click 'Refresh' to reload your emails via the API.");

  } else if (storedFullContent || (fullContentHtmlText && fullContentHtmlText !== 'undefined' && fullContentHtmlText !== '')) {
      // NEW: Directly render if full content is provided via Storage OR URL parameter
      console.log("Rendering full content from storage or URL parameters.");
      try {
          let decodedHtml = storedFullContent || fullContentHtmlText;

          bodyEl.innerHTML = `<div id="readability-page-1" class="page"><article><div id="reader-description">${sanitizeHtmlForInlining(decodedHtml)}</div></article></div>`;
          bodyEl.classList.remove('hidden');

          // Ensure images/tables are sanitized even in direct rendering mode
          sanitizeContent(bodyEl, articleUrl);

          // Add source link and reading time
          addOriginalLinkAndReadingTime(articleUrl, bodyEl.textContent);

          loadingView.classList.add('hidden');
          contentView.classList.remove('hidden');
          toolbarEl.classList.remove('hidden');
          chrome.runtime.sendMessage({ action: "markAsRead", link: articleUrl });
      } catch (e) {
          console.error("Failed to decode full content HTML", e);
          fetchArticle(articleUrl, descriptionText, titleText);
      }
  } else {
      // For all other articles, fetch and parse them using Readability
      fetchArticle(articleUrl, descriptionText, titleText);
  }
});

/**
 * Handles copying article content to clipboard.
 */
async function handleCopy() {
    const format = exportFormat.value;
    // For HTML copy, we only want the fragment to avoid breaking CMS styles
    const content = generateArticleContent(format, true); 
    try {
        await navigator.clipboard.writeText(content);
        showCopyStatus(`Copied as ${format.toUpperCase()}!`, 'success');
    } catch (err) {
        console.error('Failed to copy: ', err);
        showCopyStatus("Failed to copy.", 'error');
    }
}

/**
 * Handles saving article content to a file.
 */
function handleSave() {
    const format = exportFormat.value;
    // For saving, we want a full document if it's HTML
    const content = generateArticleContent(format, false);
    const mimeType = format === 'html' ? 'text/html' : (format === 'markdown' ? 'text/markdown' : 'text/plain');
    const extension = format === 'html' ? 'html' : (format === 'markdown' ? 'md' : 'txt');
    
    const fileName = (titleEl.textContent.substring(0, 50).replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'article') + '.' + extension;
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
}

function showCopyStatus(message, type) {
    copyStatus.textContent = message;
    copyStatus.style.color = type === 'error' ? 'red' : 'green';
    setTimeout(() => { copyStatus.textContent = ""; }, 3000);
}

/**
 * Generates the article content in the specified format.
 */
function generateArticleContent(format, isFragment = false) {
    const title = titleEl.textContent;
    const byline = bylineEl.textContent;
    const url = currentUrl;
    const readingTime = document.getElementById('reader-reading-time') ? document.getElementById('reader-reading-time').textContent : '';
    
    // For content, we use the main body element
    let contentHtml = bodyEl.innerHTML.trim();

    if (format === 'txt') {
        let text = `${title}\n`;
        if (byline) text += `Source: ${byline}\n`;
        text += `URL: ${url}\n`;
        if (readingTime) text += `Reading Time: ${readingTime.trim()}\n`;
        text += `\n--------------------------------------\n\n`;
        
        let htmlWithBreaks = contentHtml
            .replace(/<(p|div)[^>]*>/gi, '\n\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<li[^>]*>/gi, '\n- ')
            .replace(/<h[1-6][^>]*>/gi, '\n\n\n');
        let tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlWithBreaks;
        text += tempDiv.textContent.trim().replace(/\n{3,}/g, '\n\n');
        return text;
    } else if (format === 'markdown') {
        let md = `# ${title}\n\n`;
        if (byline) md += `**Source:** ${byline}  \n`;
        md += `**URL:** [${url}](${url})  \n`;
        if (readingTime) md += `**Reading Time:** ${readingTime.trim()}  \n`;
        md += `\n---\n\n`;
        // Basic HTML to Markdown conversion for a few tags
        let bodyMd = contentHtml
            .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n')
            .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n')
            .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n')
            .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n')
            .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n')
            .replace(/<div[^>]*>/gi, '\n\n')
            .replace(/<br\s*\/?>/gi, '  \n')
            .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
            .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
            .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
            .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')
            .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
            .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1');
            
        let tempDiv = document.createElement('div');
        tempDiv.innerHTML = bodyMd;
        md += tempDiv.textContent.trim().replace(/\n{3,}/g, '\n\n');
        return md;
    } else if (format === 'html') {
        const fragment = `<div class="puretidings-content" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: auto; overflow-wrap: break-word;">
            <style>
                .puretidings-content img, .puretidings-content figure { max-width: 100% !important; height: auto !important; margin: 15px 0; border-radius: 4px; }
                .puretidings-content video, .puretidings-content iframe { max-width: 100% !important; border-radius: 4px; }
                .puretidings-content .video-container { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 20px 0; background: #000; border-radius: 8px; }
                .puretidings-content .video-container iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
                .puretidings-content pre { background: #f4f4f4; padding: 15px; border-radius: 4px; overflow-x: auto; }
                @media (prefers-color-scheme: dark) {
                    .puretidings-content { color: #eee !important; background: #222 !important; }
                    .puretidings-content a { color: #58a6ff !important; }
                    .puretidings-content pre { background: #333 !important; }
                }
            </style>
            <h1 style="font-size: 2em; margin-bottom: 10px;">${title}</h1>
            <div class="meta" style="color: #666; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px; font-size: 0.9em;">
                ${byline ? `<strong>Source:</strong> ${byline}<br>` : ''}
                <strong>Original URL:</strong> <a href="${url}" style="color: #0066cc;">${url}</a>
                ${readingTime ? `<br><strong>Reading Time:</strong> ${readingTime.trim()}` : ''}
            </div>
            <div class="main-body">
                ${contentHtml}
            </div>
        </div>`;

        if (isFragment) return fragment;

        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head><body>${fragment}</body></html>`;
    }
    return '';
}

/**
 * Sends a message to the service worker to fetch the HTML content of a URL.
 * @param {string} url - The URL of the article to fetch.
 * @param {string} descriptionText - The description of the article (for fallback).
 * @param {string} titleText - The title of the article (for fallback).
 */
async function fetchArticle(url, descriptionText, titleText) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "fetchArticle",
      url: url
    });

    if (response.status === 'ok') {
      // 3. If successful, parse the article
      parseArticle(response.html, url, descriptionText, titleText);
    } else {
      throw new Error(response.message);
    }
  } catch (error) {
    console.error("Error fetching article:", error);
    showError(`Failed to fetch content. ${error.message}`);
  }
}

/**
 * Helper to add the "Read Original Article" link and reading time
 */
function addOriginalLinkAndReadingTime(url, textContent) {
    // Remove existing link if any (to prevent duplicates on re-renders)
    const existing = document.querySelector('.original-article-link');
    if (existing) existing.remove();

    const originalLinkP = document.createElement('p');
    originalLinkP.classList.add('original-article-link');
    
    const originalLinkA = document.createElement('a');
    originalLinkA.href = url;
    originalLinkA.textContent = url.includes('mail.google.com') ? 'View in Gmail' : 'Read Original Article';
    originalLinkA.target = '_blank';
    
    const readingTimeSpan = document.createElement('span');
    readingTimeSpan.id = 'reader-reading-time';
    
    originalLinkP.appendChild(originalLinkA);
    originalLinkP.appendChild(readingTimeSpan);
    
    const headerEl = document.getElementById('reader-header');
    headerEl.after(originalLinkP);

    if (textContent) {
        const readingTime = calculateReadingTime(textContent);
        readingTimeSpan.textContent = ` (${readingTime} min read)`;
    }
}

/**
 * Uses Readability.js to clean and display the HTML content.
 * @param {string} htmlString - The raw HTML source code of the page.
 * @param {string} url - The original URL (as a base URL for relative images).
 * @param {string} descriptionText - The description of the article (for fallback).
 * @param {string} titleText - The title of the article (for fallback).
 */
function parseArticle(htmlString, url, descriptionText, titleText) {
  try {
    // Create a temporary DOM to parse it
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    
    // Set the base URL so that relative image paths work
    const base = doc.createElement('base');
    base.href = url;
    doc.head.appendChild(base);

    // Preprocessing: Clean/restructure specific domains (e.g. chefkoch.de recipes, investing.com)
    preprocessDOM(doc, url);

    // 4. Run Readability
    const article = new Readability(doc).parse();

    if (article && article.content) {
      // 5. Display the cleaned content
      titleEl.textContent = article.title;
      bylineEl.textContent = article.byline || article.siteName || '';

      // Use helper for original link and reading time
      addOriginalLinkAndReadingTime(url, article.textContent);

      bodyEl.innerHTML = article.content;
      
      sanitizeContent(bodyEl, url);

      // Switch view
      loadingView.classList.add('hidden');
      contentView.classList.remove('hidden');
      toolbarEl.classList.remove('hidden');
      
      chrome.runtime.sendMessage({ action: "markAsRead", link: url });

    } else {
      // Fallback if Readability couldn't find an article
      // ** FIX: Display the description from the feed as a fallback **
      if (descriptionText) {
        bodyEl.innerHTML = `<div id="readability-page-1" class="page"><article><div>${formatDescription(descriptionText)}</div></article></div>`;
        bodyEl.classList.remove('hidden');
        
        // Ensure sanitization for fallback content too
        sanitizeContent(bodyEl, url);
      }

      // Add source link and reading time (for the fallback content)
      addOriginalLinkAndReadingTime(url, bodyEl.textContent);
      
      // Keep title if it was passed
      if (titleText) {
          titleEl.textContent = titleText;
      }
      
      loadingView.classList.add('hidden');
      contentView.classList.remove('hidden');
      toolbarEl.classList.remove('hidden');
      
      chrome.runtime.sendMessage({ action: "markAsRead", link: url });
    }
  } catch (error) {
    console.error("Error parsing with Readability:", error);
    showError("Failed to parse article content. The page might be too complex or not an article.");
  }
}

/**
 * Displays an error message.
 * @param {string} message - The error message to display.
 */
function showError(message) {
  contentView.classList.add('hidden');
  loadingView.classList.remove('hidden'); // Zeige den Lade-Spinner-Container
  document.getElementById('loading-spinner').classList.add('hidden'); // Verstecke den Spinner selbst
  errorView.textContent = message;
  errorView.classList.remove('hidden');
}

/**
 * Ensures that all images and links in the cleaned content have absolute paths.
 * Also transforms video placeholders/links into proper responsive embeds.
 */
function sanitizeContent(element, baseUrl) {
  try {
    // 1. More aggressive attribute cleaning (Target ALL elements with fixed dimensions)
    element.querySelectorAll('[width], [height]').forEach(el => {
        const tag = el.tagName.toLowerCase();
        // Keep some SVG attributes if necessary, but for HTML elements in emails, strip them
        if (tag !== 'svg' && tag !== 'path') {
            el.removeAttribute('width');
            el.removeAttribute('height');
        }
    });

    // 2. Normalize inline styles that cause overflow
    element.querySelectorAll('[style*="width"], [style*="min-width"], [style*="margin"]').forEach(el => {
        // Reset fixed widths to allow CSS max-width to take over
        if (el.style.width && el.style.width.includes('px')) {
            el.style.width = 'auto';
        }
        if (el.style.minWidth && el.style.minWidth.includes('px')) {
            el.style.minWidth = '0';
        }
        // Remove negative margins that might push content out of bounds
        if (el.style.marginLeft && el.style.marginLeft.includes('-')) {
            el.style.marginLeft = '0';
        }
        if (el.style.marginRight && el.style.marginRight.includes('-')) {
            el.style.marginRight = '0';
        }
    });

    // Korrigiere relative Bild-Pfade und entferne feste Dimensionen
    element.querySelectorAll('img').forEach(img => {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      if (img.src) {
        try {
            img.src = new URL(img.getAttribute('src'), baseUrl).href;
        } catch(e) {}
      }
    });
    
    // Tabellen responsiv machen
    element.querySelectorAll('table').forEach(table => {
        table.style.width = '100%';
        table.style.tableLayout = 'fixed';
        table.style.wordBreak = 'break-word';
    });

    // Korrigiere relative Link-Pfade
    element.querySelectorAll('a').forEach(a => {
      if (a.href) {
        a.href = new URL(a.getAttribute('href'), baseUrl).href;
      }
    });
    
    // 1. More aggressive YouTube detection in potential video containers
    element.querySelectorAll('iframe[src*="youtube.com"], iframe[src*="youtu.be"], video, div[class*="video"], div[class*="player"], div[id^="lyte_"], div[class*="lyte"]').forEach(video => {
        let youtubeUrl = null;
        
        if (video.tagName.toLowerCase() === 'iframe') {
            youtubeUrl = video.src;
        } else {
            const source = video.querySelector('source[type="video/youtube"]');
            youtubeUrl = source ? source.src : null;
            
            // If no <source>, check for "Watch on YouTube" links inside
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
                // Clean up videoId just in case it caught extra parameters
                videoId = videoId.split('&')[0].replace(/[^a-zA-Z0-9_-]/g, '');
                const container = createYouTubePlaceholder(videoId);
                
                // If it's a lyte-wrapper, replace the whole wrapper
                if (video.parentElement && video.parentElement.classList.contains('lyte-wrapper')) {
                    video.parentElement.replaceWith(container);
                } else {
                    video.replaceWith(container);
                }
            } else if (video.tagName.toLowerCase() === 'iframe') {
                // For playlists or other embeds without a direct videoId, keep the iframe but make it responsive
                const container = document.createElement('div');
                container.className = 'video-container';
                video.removeAttribute('width');
                video.removeAttribute('height');
                // The CSS for .video-container iframe will handle positioning and width/height 100%
                container.appendChild(video.cloneNode(true));
                video.replaceWith(container);
            }
        }
    });

    // 2. Transformer standalone YouTube links that might be intended as embeds
    element.querySelectorAll('a[href*="youtube.com/watch"], a[href*="youtu.be/"]').forEach(link => {
        // Only replace if it's the only thing in its parent paragraph/div, 
        // or if it looks like a placeholder (like in the user screenshot)
        const parent = link.parentElement;
        const text = link.textContent.toLowerCase();
        // More comprehensive list of placeholder texts
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
                
                // If the link is just a raw URL or placeholder, replace the whole parent container if it's small
                if (parent && (parent.className.includes('video') || parent.className.includes('player') || parent.textContent.trim().length < 100)) {
                    parent.replaceWith(container);
                } else {
                    link.replaceWith(container);
                }
             }
        }
    });
  } catch (error) {
    console.error("Error sanitizing content paths:", error);
  }
}

/**
 * Handles generating an AI report for the current article.
 */
async function handleGenerateAiReport() {
    try {
        const { geminiApiKey, aiReportPrompt } = await chrome.storage.sync.get(['geminiApiKey', 'aiReportPrompt']);

        if (!geminiApiKey || geminiApiKey.trim() === '') {
            alert("Please enter your Google Gemini API Key in the Extension Settings to use this feature.");
            return;
        }

        generateAiReportBtn.textContent = 'Generating...';
        generateAiReportBtn.disabled = true;
        aiReportContainer.classList.remove('hidden');
        aiReportContent.innerHTML = '<p><em>Analyzing article with Google Gemini AI... this may take a few seconds.</em></p>';

        let promptText = aiCustomPromptInput.value && aiCustomPromptInput.value.trim() !== ''
            ? aiCustomPromptInput.value.trim() + "\n\n"
            : (aiReportPrompt && aiReportPrompt.trim() !== '' ? aiReportPrompt.trim() + "\n\n" : "Provide a concise summary and highlight the key takeaways of the following article in Markdown format.\n\n");

        const title = titleEl.textContent;
        const byline = bylineEl.textContent;
        promptText += `### Article: ${title}\n`;
        if (byline) promptText += `Source: ${byline}\n`;

        let contentHtml = '';
        if (!bodyEl.classList.contains('hidden') && bodyEl.innerHTML) {
            contentHtml = bodyEl.innerHTML;
        }
        
        const cleanContent = contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 8000);
        promptText += `Content:\n${cleanContent}\n\n`;

        const modelsToTry = await getAvailableGeminiModels(geminiApiKey);
        if (!modelsToTry || modelsToTry.length === 0) {
            throw new Error("Could not fetch any available AI models.");
        }
        console.log("Attempting to generate summary with models:", modelsToTry);

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
        const aiResponseText = data.candidates[0].content.parts[0].text;
        
        currentAiRawMarkdown = aiResponseText;

        aiReportContent.innerHTML = formatMarkdownToHtml(aiResponseText);

    } catch (error) {
        console.error("Error generating AI report:", error);
        aiReportContent.innerHTML = `<p style="color: red;"><strong>Error:</strong> ${error.message}</p>`;
    } finally {
        generateAiReportBtn.textContent = 'AI Summary';
        generateAiReportBtn.disabled = false;
    }
}

async function handleGenerateYoutubeAiReport() {
    try {
        const { geminiApiKey, youtubeAiPrompt } = await chrome.storage.sync.get(['geminiApiKey', 'youtubeAiPrompt']);

        if (!geminiApiKey || geminiApiKey.trim() === '') {
            alert("Please enter your Google Gemini API Key in the Extension Settings to use this feature.");
            return;
        }

        generateYoutubeAiReportBtn.textContent = 'Generating...';
        generateYoutubeAiReportBtn.disabled = true;
        aiReportContainer.classList.remove('hidden');
        aiReportContent.innerHTML = '<p><em>Fetching transcript and analyzing video with Google Gemini AI... this may take a few seconds.</em></p>';

        let promptText = aiCustomPromptInput.value && aiCustomPromptInput.value.trim() !== ''
            ? aiCustomPromptInput.value.trim() + "\n\n"
            : (youtubeAiPrompt && youtubeAiPrompt.trim() !== '' ? youtubeAiPrompt.trim() + "\n\n" : "You are an assistant that summarizes YouTube videos. Generate a response in English that is clearly divided into two distinct sections using these exact Markdown headings:\n\n### 📝 Summary from Video Description\n[Provide a concise summary of the video's description text here]\n\n### 🎥 Summary from Video Script\n[Provide a concise summary and 3-5 key takeaways in bullet points based on the transcript (script) of the video here]\n\nIf both description and transcript are provided, you MUST show both sections. If the transcript could not be loaded, still display both headers but under the script header write: 'No video script (transcript) available. Summary is based only on the description.' Ignore advertisements or sponsor mentions in the text.\n\n");

        const title = titleEl.textContent;
        promptText += `### Video Title: ${title}\n`;
        
        let videoId = '';
        if (currentUrl.includes('youtu.be/')) {
            videoId = currentUrl.split('youtu.be/')[1].split('?')[0];
        } else if (currentUrl.includes('youtube.com/watch')) {
            videoId = new URL(currentUrl).searchParams.get('v');
        } else if (currentUrl.includes('youtube.com/shorts/')) {
            videoId = currentUrl.split('youtube.com/shorts/')[1].split('?')[0];
        }

        let transcriptText = '';
        let transcriptFound = false;
        let failReason = '';

        if (videoId) {
            try {
                // Fetch transcript via service worker to avoid CORS and cookie-blocking issues
                const msgResponse = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ action: "fetchYoutubeTranscript", videoId: videoId }, resolve);
                });
                
                if (msgResponse && msgResponse.status === 'ok' && msgResponse.xml) {
                    // Parse XML (InnerTube srv3 format uses <p>, old format uses <text>)
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(msgResponse.xml, "text/xml");
                    let textNodes = Array.from(xmlDoc.getElementsByTagName('p'));
                    if (textNodes.length === 0) {
                        textNodes = Array.from(xmlDoc.getElementsByTagName('text'));
                    }
                    
                    if (textNodes.length > 0) {
                        const texts = textNodes.map(t => t.textContent.replace(/<[^>]+>/g, ''));
                        transcriptText = texts.join(' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').substring(0, 50000);
                        transcriptFound = true;
                    } else {
                        failReason = 'Script exists on YouTube but the format could not be parsed.';
                    }
                } else if (msgResponse && msgResponse.status === 'error') {
                    console.warn("Service worker failed to fetch transcript:", msgResponse.message);
                    if (msgResponse.message.includes('No transcript tracks found')) {
                        failReason = 'No script exists for this video (no subtitles available on YouTube).';
                    } else {
                        failReason = 'Script exists on YouTube but could not be read (network or API error).';
                    }
                } else {
                    failReason = 'Script could not be loaded due to a system error.';
                }
            } catch (e) {
                console.warn("Failed to fetch transcript:", e);
                failReason = `Script could not be loaded: ${e.message}`;
            }
        } else {
            failReason = 'Could not extract video ID.';
        }

        const description = bodyEl.textContent.replace(/\s+/g, ' ').trim().substring(0, 10000);
        let contentText = `[Video Description]:\n${description}\n\n`;

        if (transcriptFound) {
            contentText += `[Video Script / Transkript]:\n${transcriptText}\n\n`;
        } else {
            contentText += `(Note: Video transcript is not available because: ${failReason}. Summarizing based on description only. Please write under the video script header the exact reason: "${failReason}")\n\n`;
        }

        promptText += `Content:\n${contentText}\n\n`;

        const modelsToTry = await getAvailableGeminiModels(geminiApiKey);
        if (!modelsToTry || modelsToTry.length === 0) {
            throw new Error("Could not fetch any available AI models.");
        }
        console.log("Attempting to generate summary with models:", modelsToTry);

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
        const aiResponseText = data.candidates[0].content.parts[0].text;
        
        currentAiRawMarkdown = aiResponseText;

        aiReportContent.innerHTML = formatMarkdownToHtml(aiResponseText);

    } catch (error) {
        console.error("Error generating AI report:", error);
        aiReportContent.innerHTML = `<p style="color: red;"><strong>Error:</strong> ${error.message}</p>`;
    } finally {
        generateYoutubeAiReportBtn.textContent = '🎥 AI Video Summary';
        generateYoutubeAiReportBtn.disabled = false;
    }
}

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
