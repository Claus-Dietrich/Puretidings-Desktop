chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'parseXML') {
    const processAndRespond = async () => {
      try {
        let xmlString = request.data;
        if (!xmlString || xmlString.trim().length === 0) {
           sendResponse({ status: 'error', message: 'Empty response received from feed.' });
           return;
        }

        const parser = new DOMParser();
        let doc = parser.parseFromString(xmlString, "application/xml");

        let parseError = doc.getElementsByTagName("parsererror");
        if (parseError.length > 0) {
          const originalError = parseError[0].textContent;
          
          // Strategy 1: Fix attributes without values (e.g. <rss xmlns:itunes>)
          // Use a more inclusive regex for attribute names: letters, numbers, colons, hyphens, underscores, dots.
          const fixedXml = xmlString.replace(/<([a-zA-Z0-9:]+)([^>]+)>/g, (match, tagName, attrs) => {
            const fixedAttrs = attrs.replace(/(\s+)([a-zA-Z0-9:\._\-]+)(?!\s*=)(?=\s|>|$)/g, '$1$2=""');
            return `<${tagName}${fixedAttrs}>`;
          });
          
          if (fixedXml !== xmlString) {
            doc = parser.parseFromString(fixedXml, "application/xml");
            parseError = doc.getElementsByTagName("parsererror");
          }

          // Strategy 2: Final fallback to 'text/html'
          if (parseError.length > 0) {
            console.log("XML parsing failed after fix, trying text/html fallback for error: ", originalError.substring(0, 100));
            doc = parser.parseFromString(xmlString, "text/html");
            
            // Check for content in HTML mode
            const items = doc.querySelectorAll("item, entry");
            if (items.length === 0) {
              const snippet = xmlString.substring(0, 200).replace(/[\r\n\t]/g, ' ');
              const errorMessage = `XML Parse Error (no items found in fallback): ${originalError.substring(0, 50)}... Snippet: [${snippet}]`;
              console.log(errorMessage);
              sendResponse({ status: 'error', message: errorMessage });
              return;
            }
          }
        }

        // Extract feed-level title
        let feedTitle = doc.querySelector('channel > title')?.textContent || 
                        doc.querySelector('feed > title')?.textContent || 
                        doc.querySelector('title')?.textContent || 
                        doc.getElementsByTagName('title')[0]?.textContent ||
                        "";

        // Extract channel/feed image URL
        let channelImageUrl = doc.querySelector('channel image url')?.textContent || 
                              doc.querySelector('icon')?.textContent || 
                              doc.querySelector('logo')?.textContent || 
                              null;

        let items = doc.getElementsByTagName("item");
        if (items.length === 0) {
          items = doc.getElementsByTagName("entry");
        }

        const postsArray = await Promise.all(Array.from(items).map(async item => {
          const getText = (selector) => {
            const el = item.querySelector(selector);
            return el ? el.textContent : "";
          };

          // --- Atomic/RSS Date Detection ---
          let date = getText("pubDate") || 
                     getText("pubdate") || 
                     getText("modified") || 
                     getText("published") || 
                     getText("updated") || 
                     null;
          
          if (!date) {
            const dcNodes = item.getElementsByTagName('dc:date');
            if (dcNodes.length > 0) {
              date = dcNodes[0].textContent;
            }
          }

          // --- Description/Summary Detection ---
          let contentEncoded = "";
          const ceNodes = item.getElementsByTagName('content:encoded');
          if (ceNodes.length > 0) {
            contentEncoded = ceNodes[0].textContent;
          } else {
            const encNodes = item.getElementsByTagName('encoded');
            if (encNodes.length > 0) {
              contentEncoded = encNodes[0].textContent;
            } else {
              const contentNodes = item.getElementsByTagName('content');
              if (contentNodes.length > 0 && !contentNodes[0].getAttribute('url')) {
                contentEncoded = contentNodes[0].textContent;
              }
            }
          }

          let description = contentEncoded;
          if (!description) {
            description = getText("summary") || getText("description");
          }
          
          let postLink = '';
          const linkNodes = item.getElementsByTagName('link');
          if (linkNodes.length > 0) {
            postLink = linkNodes[0].getAttribute('href') || linkNodes[0].textContent || '';
          }
          if (!postLink || postLink === '#') {
            postLink = item.querySelector("link")?.getAttribute('href') || getText("link") || '';
          }
          const fetchOgImage = request.fetchOgImage !== false; // Default to true if not explicitly false

          let featuredImage = null; // Initialize variable

          // --- Robust Image Extraction ---
          try {
            // 1. Try <media:thumbnail>
            let mediaThumbnail = null;
            const mtNodes = item.getElementsByTagName('media:thumbnail');
            if (mtNodes.length > 0) {
              mediaThumbnail = mtNodes[0];
            } else {
              const thumbNodes = item.getElementsByTagName('thumbnail');
              if (thumbNodes.length > 0) {
                mediaThumbnail = thumbNodes[0];
              }
            }
            if (mediaThumbnail && mediaThumbnail.getAttribute('url')) {
              featuredImage = mediaThumbnail.getAttribute('url');
            }

            // 2. Fallback to <media:content>
            if (!featuredImage) {
              const mediaContentNodes = item.getElementsByTagName('media:content');
              for (const node of mediaContentNodes) {
                const medium = node.getAttribute('medium');
                const type = node.getAttribute('type');
                if (medium === 'image' || (type && type.startsWith('image'))) {
                  featuredImage = node.getAttribute('url');
                  if (featuredImage) break;
                }
              }
            }

            // 3. Fallback to <enclosure>
            if (!featuredImage) {
              const enclosureNodes = item.getElementsByTagName('enclosure');
              for (const node of enclosureNodes) {
                const type = node.getAttribute('type');
                if (type && type.startsWith('image')) {
                  featuredImage = node.getAttribute('url');
                  if (featuredImage) break;
                }
              }
            }

            // 4. Fallback to <img> in content
            if (!featuredImage) {
              const fullContent = description + contentEncoded;
              const imgMatches = fullContent.matchAll(/<img[^>]+src=["']([^"'>]+)["']/gi);
              for (const match of imgMatches) {
                const imgUrl = match[1];
                if (!imgUrl.includes('1x1') && !imgUrl.includes('tracking') && !imgUrl.endsWith('.gif') && imgUrl.startsWith('http')) {
                  featuredImage = imgUrl;
                  break;
                }
              }
            }
            
            // 5. Last resort (conditional): Fetch page for og:image
            if (!featuredImage && postLink && postLink !== '#' && fetchOgImage) {
              try {
                console.log(`[Offscreen] Try fetch page for og:image: ${postLink}`);
                const response = await fetch(postLink);
                if (response.ok) {
                  const html = await response.text();
                  console.log(`[Offscreen] Successfully loaded article HTML, length: ${html.length}`);
                  const docParser = new DOMParser();
                  const docHtml = docParser.parseFromString(html, "text/html");
                  const ogNode = docHtml.querySelector('meta[property="og:image"], meta[name="og:image"], meta[property="twitter:image"], meta[name="twitter:image"], link[rel="image_src"]');
                  if (ogNode) {
                    const url = ogNode.getAttribute('content') || ogNode.getAttribute('href');
                    if (url && url.startsWith('http')) {
                      featuredImage = url;
                      console.log(`[Offscreen] Found og:image: ${featuredImage}`);
                    }
                  }
                  
                  if (!featuredImage) {
                    const firstImg = docHtml.querySelector('article img, .post-content img, .entry-content img');
                    if (firstImg && firstImg.getAttribute('src')) {
                      const url = firstImg.getAttribute('src');
                      if (url && url.startsWith('http') && !url.includes('1x1') && !url.includes('tracking')) {
                        featuredImage = url;
                        console.log(`[Offscreen] Found first-image fallback: ${featuredImage}`);
                      }
                    }
                  }
                  
                  if (!featuredImage) {
                    console.log(`[Offscreen] No og:image or body image found on article page.`);
                  }
                } else {
                  console.warn(`[Offscreen] Fetch page failed with status: ${response.status}`);
                }
              } catch (fetchError) {
                console.error(`[Offscreen] Fetch page error at ${postLink}:`, fetchError);
              }
            }
            
            // 6. Absolute last resort: Use channel image
            if (!featuredImage && channelImageUrl) {
              featuredImage = channelImageUrl;
            }

          } catch (e) {
            console.warn(`Error during featured image extraction for ${postLink}:`, e);
          }
          // --- End of Image Extraction ---

          let videoLength = '';
          const mcNodes = item.getElementsByTagName('media:content');
          if (mcNodes.length > 0 && mcNodes[0].getAttribute('duration')) {
            videoLength = mcNodes[0].getAttribute('duration');
          }

          return {
            title: getText("title"),
            link: postLink,
            date: date,
            featuredImage: featuredImage,
            description: description,
            videoLength: videoLength
          };
        }));

        sendResponse({ status: 'ok', data: postsArray, feedTitle: feedTitle });

      } catch (e) {
        console.error("Fatal error in offscreen XML parsing:", e);
        sendResponse({ status: 'error', message: e.message });
      }
    };

    processAndRespond();
    return true; // Keep message channel open for async response
  }
  return true; // Keep channel open for other potential messages
});