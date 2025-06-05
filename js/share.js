// --- Hero Banner Module ---
// Encapsulated logic for creating a dynamic hero banner.

function _createOrUpdateMetaTag(attributeName, attributeValue, content) {
    // Helper function to manage meta tags
    let metaTag = document.querySelector(`meta[${attributeName}="${attributeValue}"]`);
    if (!metaTag) {
        metaTag = document.createElement('meta');
        metaTag.setAttribute(attributeName, attributeValue);
        document.head.appendChild(metaTag);
    }
    metaTag.setAttribute('content', content);
}

function _setSocialMediaMetaTags(imageUrl, imageWidth, imageHeight, pageTitle, pageDescription) {
    // Helper function to update social media meta tags
    if (!document.head) return; // Ensure head exists
    const pageUrl = window.location.href;

    // Update basic meta tags if provided
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
    console.log('Social media meta tags updated with generated image.');
}

// MODIFIED: Export the function
export async function createDynamicHeroBanner(dynamicConfig = {}) {
    // Main function to generate the hero banner based on configuration.

    // --- Configuration Defaults and Destructuring ---
    const defaultConfig = {
        sourceContainerId: 'heroSourceData',
        heroPanelSelector: '.hero-panel',
        heroImageSrcAttribute: 'src',
        outputImageId: 'staticHeroBannerImage',
        loadingMessageId: 'loadingMessage',
        backgroundImageUrl: 'img/bg/cityscape_1.jpg', // Default background
        bannerTitle: "Shared Team", // Default title
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
        pageDescription: "Check out this amazing hero team!" // Default description for meta tags
    };

    // Merge dynamicConfig with defaultConfig. dynamicConfig takes precedence.
    const currentConfig = {
        ...defaultConfig,
        ...dynamicConfig, // User-provided config from teams.js
        titleOptions: { ...defaultConfig.titleOptions, ...(dynamicConfig.titleOptions || {}) },
        panelLayout: { ...defaultConfig.panelLayout, ...(dynamicConfig.panelLayout || {}) },
    };
    
    // --- DOM Element Retrieval ---
    const heroSourceDataContainer = document.getElementById(currentConfig.sourceContainerId);
    const staticImageElement = document.getElementById(currentConfig.outputImageId);
    const loadingMessageElement = document.getElementById(currentConfig.loadingMessageId);

    if (!heroSourceDataContainer || !staticImageElement || !loadingMessageElement) {
        console.error('Hero Banner Module: Required DOM elements not found. Check your config IDs.');
        if(loadingMessageElement) loadingMessageElement.textContent = 'Error: Banner elements missing.';
        return;
    }
    
    const sourcePanels = heroSourceDataContainer.querySelectorAll(currentConfig.heroPanelSelector);
    if (!sourcePanels.length) {
        if (loadingMessageElement) loadingMessageElement.textContent = 'No hero images available for banner.';
        // Do not return immediately, allow background and title to draw if desired,
        // or if the user wants an empty banner with just a title.
        // Consider adding a config option if an empty banner is acceptable.
        console.warn('Hero Banner Module: No source image data found in specified container. Banner might be empty or just title/background.');
    } else {
        if (loadingMessageElement) loadingMessageElement.textContent = 'Generating hero banner...'; // Reset message
    }


    // --- Canvas Setup ---
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const { nominalWidth: panelNominalWidth, totalHeight: panelTotalHeight } = currentConfig.panelLayout;
    const { height: titleHeight } = currentConfig.titleOptions;
    const avatarDrawingHeight = panelTotalHeight - titleHeight;

    let totalCanvasWidth = 0;
    // Calculate width based on actual panels found, or a minimum if none (e.g., for title only)
    if (sourcePanels.length > 0) {
        sourcePanels.forEach(() => { 
            totalCanvasWidth += panelNominalWidth;
        });
    } else {
        // Fallback width if no panels, e.g., enough for a title
        // This could be made configurable. For now, let's assume a decent width.
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

    // --- 1. Draw Background Image ---
    if (currentConfig.backgroundImageUrl) {
        try {
            const bgImg = new Image();
            bgImg.crossOrigin = 'anonymous'; 
            const bgLoadPromise = new Promise((resolve, reject) => { // Added reject
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
                    console.error("Error loading background image:", currentConfig.backgroundImageUrl);
                    // Optionally draw a default background on error too
                    ctx.fillStyle = '#DDDDDD'; 
                    ctx.fillRect(0,0, canvas.width, canvas.height);
                    resolve(); // Resolve so rest of banner can draw
                };
                bgImg.src = currentConfig.backgroundImageUrl;
            });
            await bgLoadPromise; 
        } catch (bgError) {
            console.error("Exception during background image loading:", bgError);
             ctx.fillStyle = '#DDDDDD'; // Default background on error
             ctx.fillRect(0,0, canvas.width, canvas.height);
        }
    } else {
        ctx.fillStyle = '#DDDDDD'; // Light gray default background
        ctx.fillRect(0,0, canvas.width, canvas.height);
    }


    // --- 2. Draw the Title (if any) ---
    // Use the title from currentConfig, which might have been overridden by dynamicConfig
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

    // --- 3. Draw Hero Avatars ---
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
                            // Adjust sy to crop from the bottom (take the top part of the image)
                            // If the image is taller than what we need for the aspect ratio,
                            // we start sy from 0 to take the top.
                            // If it's shorter, this logic should still work as sHeight would be larger.
                            sy = 0; // Crop from top
                            // This was the previous logic, which might crop from bottom or middle:
                            // if (sHeightCalculated < heroImg.naturalHeight) { 
                            //     sy = heroImg.naturalHeight - sHeightCalculated; 
                            // } else { sy = 0; }
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
                        console.warn("Error loading hero image:", heroImgSrc);
                        // Optionally draw a placeholder directly on the canvas for this slot
                        ctx.fillStyle = '#A0AEC0'; // gray-500
                        ctx.fillRect(currentX, titleHeight, panelNominalWidth, destinationAvatarHeight);
                        ctx.fillStyle = '#FFFFFF';
                        ctx.textAlign = 'center';
                        ctx.fillText("N/A", currentX + panelNominalWidth/2, titleHeight + destinationAvatarHeight/2);
                        currentX += panelNominalWidth; 
                        resolve(); 
                    };
                    heroImg.src = heroImgSrc; 
                });
                heroImagePromises.push(promise);
            } else {
                 // If image source is missing or marked as error, draw placeholder
                ctx.fillStyle = '#A0AEC0'; // gray-500
                ctx.fillRect(currentX, titleHeight, panelNominalWidth, avatarDrawingHeight);
                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'center';
                ctx.fillText("Error", currentX + panelNominalWidth/2, titleHeight + avatarDrawingHeight/2);
                currentX += panelNominalWidth; 
                heroImagePromises.push(Promise.resolve()); // Still resolve for Promise.all
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

        if(currentConfig.enableSocialMediaTags) {
            _setSocialMediaMetaTags(dataURL, canvas.width, canvas.height, actualBannerTitle, currentConfig.pageDescription);
        }
    } catch (error) { 
        console.error('Error during final image processing:', error);
        if (loadingMessageElement) loadingMessageElement.textContent = 'Error generating final image. See console.';
        if (staticImageElement) staticImageElement.style.display = 'none';
    }
}
