import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

function _createOrUpdateMetaTag(attributeName, attributeValue, content) {
    let metaTag = document.querySelector(`meta[${attributeName}="${attributeValue}"]`);
    if (!metaTag) {
        metaTag = document.createElement('meta');
        metaTag.setAttribute(attributeName, attributeValue);
        document.head.appendChild(metaTag);
    }
    metaTag.setAttribute('content', content);
}

function _setSocialMediaMetaTags(imageUrl, imageWidth, imageHeight, pageTitle, pageDescription) {
    if (!document.head) return;
    const pageUrl = window.location.href;

    if (pageTitle) document.title = pageTitle;
    const descriptionTag = document.querySelector('meta[name="description"]');
    if (descriptionTag && pageDescription) {
        descriptionTag.setAttribute('content', pageDescription);
    } else if (pageDescription) {
        _createOrUpdateMetaTag('name', 'description', pageDescription);
    }


    _createOrUpdateMetaTag('property', 'og:title', pageTitle || document.title);
    _createOrUpdateMetaTag('property', 'og:description', pageDescription || 'Check out this shared team!');
    _createOrUpdateMetaTag('property', 'og:image', imageUrl);
    _createOrUpdateMetaTag('property', 'og:image:width', imageWidth.toString());
    _createOrUpdateMetaTag('property', 'og:image:height', imageHeight.toString());
    _createOrUpdateMetaTag('property', 'og:url', pageUrl);

    _createOrUpdateMetaTag('name', 'twitter:title', pageTitle || document.title);
    _createOrUpdateMetaTag('name', 'twitter:description', pageDescription || 'Check out this shared team!');
    _createOrUpdateMetaTag('name', 'twitter:image', imageUrl);
}

export async function createDynamicHeroBanner(dynamicConfig = {}) {
    const defaultConfig = {
        sourceContainerId: 'heroSourceData',
        heroPanelSelector: '.hero-panel',
        heroImageSrcAttribute: 'src',
        outputImageId: 'staticHeroBannerImage',
        loadingMessageId: 'loadingMessage',
        backgroundImageUrl: 'img/bg/cityscape_1.jpg',
        bannerTitle: "Shared Team",
        titleOptions: {
            height: 60,
            textXOffset: 15,
            font: "italic 900 36px Inter",
            fillColor1: "#00FFFF",
            fillColor2: "#00BFFF",
            strokeColor: "#000000",
            strokeLineWidth: 1,
            shadowColor: "#00FFFF",
            shadowBlur: 15,
            shadowOffsetX: 0,
            shadowOffsetY: 0,
        },
        panelLayout: {
            nominalWidth: 200,
            totalHeight: 300,
        },
        enableSocialMediaTags: true,
        pageDescription: "Check out this amazing hero team!"
    };
    const currentConfig = { ...defaultConfig, ...dynamicConfig, titleOptions: { ...defaultConfig.titleOptions, ...(dynamicConfig.titleOptions || {}) }, panelLayout: { ...defaultConfig.panelLayout, ...(dynamicConfig.panelLayout || {}) }, };
    const heroSourceDataContainer = document.getElementById(currentConfig.sourceContainerId);
    const staticImageElement = document.getElementById(currentConfig.outputImageId);
    const loadingMessageElement = document.getElementById(currentConfig.loadingMessageId);
    if (!heroSourceDataContainer || !staticImageElement || !loadingMessageElement) {
        console.error('Hero Banner Module: Required DOM elements not found. Check your config IDs.');
        if (loadingMessageElement) loadingMessageElement.textContent = 'Error: Banner elements missing.';
        return;
    }
    const sourcePanels = heroSourceDataContainer.querySelectorAll(currentConfig.heroPanelSelector);
    if (!sourcePanels.length) {
        if (loadingMessageElement) loadingMessageElement.textContent = 'No hero images available for banner.';
    } else {
        if (loadingMessageElement) loadingMessageElement.textContent = 'Generating hero banner...';
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const { nominalWidth: panelNominalWidth, totalHeight: panelTotalHeight } = currentConfig.panelLayout;
    const { height: titleHeight } = currentConfig.titleOptions;
    const avatarDrawingHeight = panelTotalHeight - titleHeight;
    let totalCanvasWidth = 0;
    if (sourcePanels.length > 0) {
        sourcePanels.forEach(() => { totalCanvasWidth += panelNominalWidth; });
    } else {
        totalCanvasWidth = currentConfig.bannerTitle ? Math.max(600, panelNominalWidth * 2) : panelNominalWidth;
        if (loadingMessageElement) loadingMessageElement.textContent = 'Generating banner (no heroes)...';
    }
    const totalCanvasHeight = panelTotalHeight;
    if (totalCanvasWidth === 0 || totalCanvasHeight === 0) {
        if (loadingMessageElement) loadingMessageElement.textContent = 'Error: Could not determine canvas dimensions.';
        return;
    }
    canvas.width = totalCanvasWidth;
    canvas.height = totalCanvasHeight;
    if (currentConfig.backgroundImageUrl) {
        try {
            const bgImg = new Image();
            bgImg.crossOrigin = 'anonymous';
            const bgLoadPromise = new Promise((resolve, reject) => {
                bgImg.onload = () => {
                    const canvasAspectRatio = canvas.width / canvas.height;
                    const bgImgAspectRatio = bgImg.naturalWidth / bgImg.naturalHeight;
                    let sx = 0, sy = 0, sWidth = bgImg.naturalWidth, sHeight = bgImg.naturalHeight;
                    if (bgImgAspectRatio > canvasAspectRatio) {
                        sWidth = bgImg.naturalHeight * canvasAspectRatio;
                        sx = (bgImg.naturalWidth - sWidth) / 2;
                    } else if (bgImgAspectRatio < canvasAspectRatio) {
                        sHeight = bgImg.naturalWidth / canvasAspectRatio;
                        sy = (bgImg.naturalHeight - sHeight) / 2;
                    }
                    ctx.drawImage(bgImg, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
                    resolve();
                };
                bgImg.onerror = () => {
                    ctx.fillStyle = '#DDDDDD';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    resolve();
                };
                bgImg.src = currentConfig.backgroundImageUrl;
            });
            await bgLoadPromise;
        } catch (bgError) {
            ctx.fillStyle = '#DDDDDD';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    } else {
        ctx.fillStyle = '#DDDDDD';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const actualBannerTitle = currentConfig.bannerTitle || "Shared Team";
    if (actualBannerTitle && currentConfig.titleOptions.height > 0) {
        const { font, textXOffset, fillColor1, fillColor2, strokeColor, strokeLineWidth, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY } = currentConfig.titleOptions;
        const titleTextYOffset = titleHeight / 2;
        ctx.font = font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const gradient = ctx.createLinearGradient(textXOffset, titleTextYOffset - 18, textXOffset, titleTextYOffset + 18);
        gradient.addColorStop(0, fillColor1);
        gradient.addColorStop(1, fillColor2);
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = shadowBlur;
        ctx.shadowOffsetX = shadowOffsetX;
        ctx.shadowOffsetY = shadowOffsetY;
        ctx.fillStyle = gradient;
        ctx.fillText(actualBannerTitle, textXOffset, titleTextYOffset);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeLineWidth;
        ctx.strokeText(actualBannerTitle, textXOffset, titleTextYOffset);
    }
    let currentX = 0;
    const heroImagePromises = [];
    if (sourcePanels.length > 0) {
        sourcePanels.forEach((panel) => {
            const imgElement = panel.querySelector('img');
            const heroImgSrc = imgElement ? imgElement.getAttribute(currentConfig.heroImageSrcAttribute) : null;
            if (heroImgSrc && !imgElement.dataset.error) {
                const promise = new Promise((resolve) => {
                    const heroImg = new Image();
                    heroImg.crossOrigin = 'anonymous';
                    heroImg.onload = () => {
                        const destinationAvatarHeight = avatarDrawingHeight;
                        const imgAspectRatio = heroImg.naturalWidth / heroImg.naturalHeight;
                        const avatarSlotAspectRatio = panelNominalWidth / destinationAvatarHeight;
                        let sx, sy, sWidth, sHeight;
                        if (imgAspectRatio > avatarSlotAspectRatio) {
                            sHeight = heroImg.naturalHeight;
                            sWidth = sHeight * avatarSlotAspectRatio;
                            sx = (heroImg.naturalWidth - sWidth) / 2;
                            sy = 0;
                        } else {
                            sWidth = heroImg.naturalWidth;
                            sHeight = sWidth / avatarSlotAspectRatio;
                            sx = 0;
                            sy = 0;
                        }
                        sx = Math.max(0, sx); sy = Math.max(0, sy);
                        sWidth = Math.min(heroImg.naturalWidth - sx, sWidth);
                        sHeight = Math.min(heroImg.naturalHeight - sy, sHeight);
                        if (sWidth > 0 && sHeight > 0) {
                            ctx.filter = 'drop-shadow(3px 3px 5px rgba(0,0,0,0.7))';
                            ctx.drawImage(heroImg, sx, sy, sWidth, sHeight, currentX, titleHeight, panelNominalWidth, destinationAvatarHeight);
                            ctx.filter = 'none';
                        }
                        currentX += panelNominalWidth;
                        resolve();
                    };
                    heroImg.onerror = () => {
                        ctx.fillStyle = '#A0AEC0';
                        ctx.fillRect(currentX, titleHeight, panelNominalWidth, destinationAvatarHeight);
                        ctx.fillStyle = '#FFFFFF';
                        ctx.textAlign = 'center';
                        ctx.fillText("N/A", currentX + panelNominalWidth / 2, titleHeight + destinationAvatarHeight / 2);
                        currentX += panelNominalWidth;
                        resolve();
                    };
                    heroImg.src = heroImgSrc;
                });
                heroImagePromises.push(promise);
            } else {
                ctx.fillStyle = '#A0AEC0';
                ctx.fillRect(currentX, titleHeight, panelNominalWidth, avatarDrawingHeight);
                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'center';
                ctx.fillText("Error", currentX + panelNominalWidth / 2, titleHeight + avatarDrawingHeight / 2);
                currentX += panelNominalWidth;
                heroImagePromises.push(Promise.resolve());
            }
        });
    }
    try {
        await Promise.all(heroImagePromises);
        const dataURL = canvas.toDataURL('image/png');
        if (staticImageElement) {
            staticImageElement.src = dataURL;
            staticImageElement.style.display = 'block';
        }
        if (loadingMessageElement) loadingMessageElement.style.display = 'none';
        if (currentConfig.enableSocialMediaTags) {
            _setSocialMediaMetaTags(dataURL, canvas.width, canvas.height, actualBannerTitle, currentConfig.pageDescription);
        }
    } catch (error) {
        console.error('Error during final image processing:', error);
        if (loadingMessageElement) loadingMessageElement.textContent = 'Error generating final image. See console.';
        if (staticImageElement) staticImageElement.style.display = 'none';
    }
}

const PROXY_BASE_URL = "https://us-central1-dc-dark-legion-tools.cloudfunctions.net/comicVineProxy";

/**
 * [HELPER] Checks Firestore for a cached comic for a specific character.
 * This is a READ-ONLY operation from the client.
 * @param {object} db - The Firestore database instance.
 * @param {string} characterName - The name of the character (e.g., "Batman").
 * @returns {Promise<object|null>} The comic data if found, otherwise null.
 */
async function _checkFirestoreForComic(db, characterName) {
    if (!db || !characterName) return null;
    const characterId = characterName.replace(/\s+/g, '_').toLowerCase();
    try {
        const docRef = doc(db, `artifacts/dc-dark-legion-builder/public/data/characterComics`, characterId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data();
        } else {
            return null;
        }
    } catch (error) {
        console.error(`Error checking Firestore for ${characterName}:`, error);
    }
    return null;
}

/**
 * [HELPER] Fetches the featured comic for a character from our proxy.
 * This function is called on a cache miss. The proxy handles fetching from the
 * external API and writing the result to the Firestore cache.
 * @param {string} characterName - The name of the character.
 * @returns {Promise<object|null>} The formatted comic data or null.
 */
async function _fetchComicFromProxy(characterName) {
    try {
        const proxyUrl = `${PROXY_BASE_URL}?character=${encodeURIComponent(characterName)}`;
        const response = await fetch(proxyUrl);

        if (!response.ok) {
            console.error(`Proxy error for ${characterName}: ${response.statusText}`);
            return null;
        }

        const data = await response.json();
        if (data && data.imageUrl) {
            return data;
        } else {
            console.warn(`No valid comic data returned from proxy for ${characterName}.`);
            return null;
        }
    } catch (error) {
        console.error(`Error fetching comic from proxy for ${characterName}:`, error);
        return null;
    }
}


/**
 * Renders the fetched comics into the display area, avoiding duplicates.
 * @param {Array<object>} comics - An array of comic data objects.
 */
function _renderComics(comics) {
    const outputEl = document.getElementById('comics-output');
    const loadingEl = document.getElementById('comics-loading-spinner');
    const sectionEl = document.getElementById('comics-display-section');

    if (!outputEl || !sectionEl) return;
    
    if (loadingEl) loadingEl.style.display = 'none';
    outputEl.innerHTML = '';
    
    // --- Centering & Grid setup ---
    if (outputEl.parentElement) {
        outputEl.parentElement.classList.add('text-center');
    }
    
    outputEl.classList.remove('grid', 'grid-cols-2', 'sm:grid-cols-3', 'md:grid-cols-4', 'lg:grid-cols-5');
    outputEl.classList.add('inline-grid');


    const uniqueComics = [];
    const seenImageUrls = new Set();
    comics.forEach(comic => {
        if (comic && comic.imageUrl && !seenImageUrls.has(comic.imageUrl)) {
            uniqueComics.push(comic);
            seenImageUrls.add(comic.imageUrl);
        }
    });

    if (uniqueComics.length === 0) {
        outputEl.classList.add('grid-cols-1');
        outputEl.innerHTML = '<p class="col-span-full text-center text-gray-500">Could not find any featured comics for this team.</p>';
        return;
    }
    
    // --- Dynamic Column Logic ---
    const count = uniqueComics.length;
    const baseCols = Math.min(count, 2);
    const smCols = Math.min(count, 3);
    const mdCols = Math.min(count, 4);
    const lgCols = Math.min(count, 5);

    outputEl.classList.add(`grid-cols-${baseCols}`);
    outputEl.classList.add(`sm:grid-cols-${smCols}`);
    outputEl.classList.add(`md:grid-cols-${mdCols}`);
    outputEl.classList.add(`lg:grid-cols-${lgCols}`);
    // --- End Dynamic Column Logic ---

    uniqueComics.forEach(comic => {
        const coverDate = comic.coverDate ? new Date(comic.coverDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : 'N/A';
        const title = comic.title || `${comic.character} #${comic.issueNumber}`;

        const cardInnerHtml = `
            <div class="absolute -inset-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg blur opacity-25 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
            <div class="relative w-full text-left">
                 <img src="${comic.imageUrl}" alt="Cover of ${title}" 
                     class="w-full rounded-lg shadow-lg object-cover aspect-[2/3]" 
                     onerror="this.src='https://placehold.co/200x300/1a202c/e2e8f0?text=Cover+N/A';">
                <div class="absolute bottom-0 left-0 right-0 p-2 bg-black bg-opacity-60 rounded-b-lg">
                     <h3 class="font-bold text-sm text-white truncate">${title}</h3>
                     <p class="text-xs text-slate-300">${coverDate}</p>
                </div>
            </div>
        `;

        let cardContainer;
        if (comic.siteUrl && comic.siteUrl.trim() !== '') {
            cardContainer = document.createElement('a');
            cardContainer.href = comic.siteUrl;
            cardContainer.target = '_blank';
            cardContainer.rel = 'noopener noreferrer';
            cardContainer.className = "comic-card group relative flex flex-col items-center text-center transform transition-transform duration-300 hover:scale-105 hover:z-10 no-underline";
        } else {
            cardContainer = document.createElement('div');
            cardContainer.className = "comic-card group relative flex flex-col items-center text-center transform transition-transform duration-300 hover:scale-105 hover:z-10";
        }

        cardContainer.innerHTML = cardInnerHtml;
        outputEl.appendChild(cardContainer);
    });
}

/**
 * Main function to orchestrate fetching and displaying comics for heroes.
 * Implements a "read-through cache" strategy on the client.
 * 1. Checks Firestore for a cached comic.
 * 2. If it's a miss, calls the proxy to fetch/cache the data.
 * @param {object} db - The Firestore instance (for reading the cache).
 * @param {Array<string>} heroNames - An array of hero names.
 */
export async function loadComicsForHeroes(db, heroNames) {
    const comicsDisplaySection = document.getElementById('comics-display-section');
    if (comicsDisplaySection) comicsDisplaySection.classList.remove('hidden');

    const comicPromises = heroNames.map(async (name) => {
        let comic = await _checkFirestoreForComic(db, name);
        if (comic) {
            return comic;
        }

        comic = await _fetchComicFromProxy(name);
        return comic;
    });

    const comics = (await Promise.all(comicPromises)).filter(c => c !== null);
    _renderComics(comics);
}
