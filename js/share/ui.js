/**
 * @file js/share/ui.js
 * @description Handles fetching and displaying a shared team, generating a dynamic share banner, and loading related comic data.
 * @version 2.1.0
 */

import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { TeamCalculator, GAME_CONSTANTS, ensureIndividualScores } from '../teams/core.js';

/**
 * @typedef {Object} DOM_ELEMENTS
 * @property {HTMLElement} pageLoader - The full page loading overlay.
 * @property {HTMLElement} loadingIndicator - The loading indicator element within the main content area.
 * @property {HTMLElement} errorIndicator - The error indicator element.
 * @property {HTMLElement} errorMessageDetails - The element to display error message details.
 * @property {HTMLElement} sharedTeamContainer - The container for the shared team display.
 * @property {HTMLElement} socialBannerContainer - The container for the social media banner.
 * @property {HTMLImageElement} generatedBannerImg - The image element for the generated banner.
 * @property {HTMLCanvasElement} canvas - The canvas used to generate the banner.
 * @property {HTMLElement} comicsDisplaySection - The section for displaying comics.
 * @property {HTMLElement} comicsDisplayGrid - The grid for displaying comics.
 */

/** @type {DOM_ELEMENTS} */
const DOM = {
    pageLoader: document.getElementById('page-loader'),
    loadingIndicator: document.getElementById('loading-indicator'),
    errorIndicator: document.getElementById('error-indicator'),
    errorMessageDetails: document.getElementById('error-message-details'),
    sharedTeamContainer: document.getElementById('shared-team-container'),
    socialBannerContainer: document.getElementById('social-banner-container'),
    generatedBannerImg: document.getElementById('generated-banner-img'),
    canvas: document.getElementById('social-banner-canvas'),
    comicsDisplaySection: document.getElementById('comics-display-section'),
    comicsDisplayGrid: document.getElementById('comics-display-grid'),
};

/** @type {import("firebase/firestore").Firestore} */
let db;
/** @type {import("firebase/analytics").Analytics} */
let analytics;

/** @type {string} */
const appId = typeof __app_id !== 'undefined' ? __app_id : 'dc-dark-legion-builder';

/** @type {string} */
const PROXY_BASE_URL = 'https://us-central1-dc-dark-legion-tools.cloudfunctions.net/comicVineProxy';

/** @type {Array<Object>} */
let dbChampions = [];
/** @type {Array<Object>} */
let dbSynergies = [];
/** @type {Array<Object>} */
let dbLegacyPieces = [];

/** @type {Map<string, Object>} */
let characterComicsData = new Map();

document.addEventListener('DOMContentLoaded', initializePage);

/**
 * @async
 * @function initializePage
 * @description Initializes the page, fetches necessary data, and displays the shared team.
 * @returns {Promise<void>}
 */
async function initializePage() {
    showLoading(true);
    try {
        await new Promise(resolve => {
            if (window.firebaseReady) return resolve();
            document.addEventListener('firebase-ready', resolve, { once: true });
        });
        
        const app = getApp();
        db = getFirestore(app);
        analytics = getAnalytics(app);

        const params = new URLSearchParams(window.location.search);
        const sharedTeamId = params.get('sharedTeamId');

        if (!sharedTeamId) {
            showError("No team ID provided.", "The URL is missing the required 'sharedTeamId' parameter.");
            logEvent(analytics, 'exception', { description: 'share_page_error_no_team_id', fatal: true });
            return;
        }

        logEvent(analytics, 'page_view', { page_title: document.title, page_path: '/share.html', team_id: sharedTeamId });

        await Promise.all([
            fetchData('champions', (data) => dbChampions = data),
            fetchData('synergies', (data) => dbSynergies = data.sort((a,b) => a.name.localeCompare(b.name))),
            fetchData('legacyPieces', (data) => dbLegacyPieces = data.sort((a,b) => a.name.localeCompare(b.name)))
        ]);
        
        await loadAndDisplaySharedTeam(sharedTeamId);

    } catch (error) {
        showError("Initialization failed.", error.message);
        console.error("Initialization Error:", error);
        if (analytics) logEvent(analytics, 'exception', { description: `share_page_init_error: ${error.message}`, fatal: true });
    } finally {
        if (DOM.pageLoader) {
            DOM.pageLoader.style.opacity = '0';
            setTimeout(() => {
                DOM.pageLoader.style.display = 'none';
            }, 500);
        }
        showLoading(false);
    }
}

/**
 * @async
 * @function fetchData
 * @description Fetches data from a specified Firestore collection.
 * @param {string} collectionName - The name of the collection to fetch.
 * @param {function(Array<Object>): void} stateUpdater - The function to update the state with the fetched data.
 * @returns {Promise<void>}
 * @throws {Error} If Firestore is not initialized.
 */
async function fetchData(collectionName, stateUpdater) {
    if (!db) throw new Error("Firestore not initialized");
    const q = query(collection(db, `artifacts/${appId}/public/data/${collectionName}`));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    stateUpdater(data);
}

/**
 * @async
 * @function fetchCharacterComics
 * @description Fetches character comics data from Firestore.
 * @returns {Promise<void>}
 */
async function fetchCharacterComics() {
    if (!db) return;
    try {
        const q = query(collection(db, `artifacts/${appId}/public/data/characterComics`));
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => { characterComicsData.set(doc.id, doc.data()); });
    } catch (error) { console.warn("Could not load character comics data:", error.message); }
}

/**
 * @async
 * @function loadAndDisplaySharedTeam
 * @description Loads and displays a shared team from Firestore.
 * @param {string} teamId - The ID of the team to load.
 * @returns {Promise<void>}
 */
async function loadAndDisplaySharedTeam(teamId) {
    const docRef = doc(db, `artifacts/${appId}/public/data/sharedTeams`, teamId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const teamData = docSnap.data();
        logEvent(analytics, 'view_shared_team', { team_id: teamId, team_name: teamData.name });

        const membersWithFullDetails = (teamData.members || []).map(member => ({
            ...(dbChampions.find(c => c.id === member.dbChampionId) || {}),
            ...member
        }));
        
        const calculator = new TeamCalculator(dbSynergies, GAME_CONSTANTS);
        const evaluatedTeam = calculator.evaluateTeam(ensureIndividualScores(membersWithFullDetails, dbChampions));
        evaluatedTeam.name = teamData.name;
        
        displayTeamResults(evaluatedTeam);
        loadAndDisplayEnhancements(evaluatedTeam);
    } else {
        showError("Team not found.", `No team exists with the ID: ${teamId}. It may have been deleted.`);
        logEvent(analytics, 'exception', { description: `share_page_team_not_found: ${teamId}`, fatal: false });
    }
}

/**
 * @async
 * @function loadAndDisplayEnhancements
 * @description Asynchronously loads and applies all non-essential visual data like banners and comics.
 * @param {Object} team - The evaluated team data.
 * @returns {Promise<void>}
 */
async function loadAndDisplayEnhancements(team) {
    await generateShareBanner(team);

    const heroNames = team.members.map(m => m.name);
    await fetchCharacterComics();
    applyChampionCardBackgrounds();
    await loadComicsForHeroes(db, heroNames);
}

/**
 * @async
 * @function generateShareBanner
 * @description Generates a shareable banner for the team.
 * @param {Object} team - The team data.
 * @returns {Promise<void>}
 */
async function generateShareBanner(team) {
    const ctx = DOM.canvas.getContext('2d');
    const w = DOM.canvas.width;
    const h = DOM.canvas.height;

    const loadImage = (src) => new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
    
    const avatarPromises = team.members.map(member => {
        const championImageName = (member.name || 'Unknown').replace(/[^a-zA-Z0-9-_]/g, "");
        return loadImage(`img/champions/avatars/${championImageName}.webp`);
    });
    
    const bgPromise = loadImage('img/bg/cityscape_1.jpg');
    
    const [bgImg, ...avatarImgs] = await Promise.all([bgPromise, ...avatarPromises]);

    if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, w, h);
    } else {
        const bgGradient = ctx.createLinearGradient(0, 0, w, h);
        bgGradient.addColorStop(0, '#111827');
        bgGradient.addColorStop(1, '#1e293b');
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, w, h);
    }
    
    const avatarSize = 175;
    const avatarY = h / 2;
    const step = avatarSize * 1.2;
    const totalAvatarWidth = (team.members.length - 1) * step + avatarSize;
    let startX = (w - totalAvatarWidth) / 2;
    
    const rarityColors = { 'Epic': '#8b5cf6', 'Legendary': '#facc15', 'Mythic': '#ef4444', 'Limited Mythic': '#ef4444' };

    function darkenColor(hex, percent) {
        hex = hex.replace(/^#/, '');
        const num = parseInt(hex, 16);
        let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
        r = Math.floor(r * (1 - percent / 100));
        g = Math.floor(g * (1 - percent / 100));
        b = Math.floor(b * (1 - percent / 100));
        return `#${(Math.max(0,r)).toString(16).padStart(2, '0')}${(Math.max(0,g)).toString(16).padStart(2, '0')}${(Math.max(0,b)).toString(16).padStart(2, '0')}`;
    }

    team.members.forEach((member, index) => {
        const img = avatarImgs[index];
        if (!img) return;

        const x = startX + index * step;
        const fillColor = rarityColors[member.baseRarity] || '#4b5563';
        const borderColor = darkenColor(fillColor, 30);
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + avatarSize / 2, avatarY, avatarSize / 2, 0, Math.PI * 2, true);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, x, avatarY - avatarSize / 2, avatarSize, avatarSize);
        ctx.restore();
        
        ctx.beginPath();
        ctx.arc(x + avatarSize / 2, avatarY, avatarSize / 2 + 2, 0, Math.PI * 2, true);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 6;
        ctx.shadowColor = borderColor;
        ctx.shadowBlur = 20;
        ctx.stroke();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
    });

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = 'bold 54px "Russo One", sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.shadowBlur = 5;
    ctx.fillText(team.name || "Shared Team", w / 2, avatarY - avatarSize / 2 - 25);
    ctx.restore();

    ctx.font = 'normal 36px "Russo One", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#93c5fd';
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.shadowBlur = 5;
    ctx.fillText(`TOTAL SCORE: ${Math.round(team.totalScore)}`, w / 2, avatarY + avatarSize / 2 + 30);
    ctx.restore();
    
    const dataUrl = DOM.canvas.toDataURL('image/png');
    DOM.generatedBannerImg.src = dataUrl;
    DOM.socialBannerContainer.classList.remove('hidden');
    
    updateMetaTag('property', 'og:image', dataUrl);
    updateMetaTag('name', 'twitter:image', dataUrl);
}

/**
 * @function updateMetaTag
 * @description Updates a meta tag in the document's head.
 * @param {string} attribute - The attribute to select the meta tag (e.g., 'name', 'property').
 * @param {string} value - The value of the attribute to select the meta tag.
 * @param {string} content - The new content for the meta tag.
 * @returns {void}
 */
function updateMetaTag(attribute, value, content) {
    let element = document.querySelector(`meta[${attribute}='${value}']`);
    if (element) {
        element.setAttribute('content', content);
    }
}

/**
 * @function displayTeamResults
 * @description Displays the results of the team evaluation using the new dark-theme card style.
 * @param {Object} team - The evaluated team data.
 * @returns {void}
 */
function displayTeamResults(team) {
    if (!team) {
        showError("Could not display team.", "The provided team data is invalid.");
        return;
    }

    const scoreBreakdownHtml = getScoreBreakdownHtml(team);

    let html = `
        <div class="p-6 bg-slate-900/70 backdrop-blur-sm rounded-lg border border-blue-500/20">
            <div class="text-center mb-6">
                <h3 class="text-3xl font-bold text-blue-300">${team.name || 'Shared Team'}</h3>
                <p class="text-xl text-slate-300">Total Score: <strong class="text-white font-bold">${Math.round(team.totalScore)}</strong></p>
            </div>
            ${scoreBreakdownHtml}
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mt-6">
    `;

    team.members.forEach((member) => {
        const cleanName = (member.name || 'Unknown').replace(/[^a-zA-Z0-9-_]/g, "");
        const idKey = (member.name || '').toLowerCase().replace(/\s+/g, '_');
        const starRating = getStarRatingHTML(member.starColorTier);
        const forceLevel = member.forceLevel > 0 ? `<p class="force-level">Force Lvl: ${member.forceLevel}</p>` : '';
        const synergies = (member.inherentSynergies || []).map(getSynergyIcon).join('');

        html += `
            <div class="champion-card-enhanced" data-champion-name="${cleanName}" data-champion-id-key="${idKey}">
                <div class="card-background-image"></div>
                <div class="card-top-info">
                    ${getClassPlaceholder(member.class)}
                </div>
                <div class="card-image-container">
                     <img src="img/champions/full/${cleanName}.webp" alt="${member.name}" class="card-avatar-top" onerror="this.src='img/champions/avatars/${cleanName}.webp'">
                </div>
                <div class="card-content-bottom">
                    <h4 class="champion-name">${member.name}</h4>
                    <div class="champion-details">
                        <p>${member.baseRarity}</p>
                        ${starRating}
                        ${forceLevel}
                    </div>
                    <div class="synergy-icons">${synergies}</div>
                </div>
            </div>
        `;
    });

    html += `</div></div>`;
    DOM.sharedTeamContainer.innerHTML = html;
    applyChampionCardBackgrounds();
}

/**
 * @function getScoreBreakdownHtml
 * @description Generates the HTML for the score breakdown.
 * @param {Object} team - The evaluated team data.
 * @returns {string} The HTML string for the score breakdown.
 */
function getScoreBreakdownHtml(team) {
    if (!team || !team.scoreBreakdown) return '';
    const { base, synergyDepthBonus, classDiversityBonus, subtotalAfterSynergies } = team.scoreBreakdown;
    let breakdownHtml = `
        <details class="score-breakdown-details">
            <summary>View Score Calculation</summary>
            <div class="breakdown-content">
                <div class="breakdown-row"><span>Base Individual Scores Sum</span><strong>${Math.round(base)}</strong></div>`;
    team.activeSynergies.forEach(synergy => {
        breakdownHtml += `<div class="breakdown-row is-bonus"><span>${synergy.name} (${synergy.appliedAtMemberCount} members)</span><strong>+${Math.round(synergy.calculatedBonus)}</strong></div>`;
    });
    if (synergyDepthBonus > 0) {
        breakdownHtml += `<div class="breakdown-row is-bonus"><span>Synergy Depth Bonus</span><strong>+${Math.round(synergyDepthBonus)}</strong></div>`;
    }
    breakdownHtml += `<div class="breakdown-row is-subtotal"><span>Subtotal after Synergies</span><strong>${Math.round(subtotalAfterSynergies)}</strong></div>`;
    if (team.classDiversityBonusApplied) {
        breakdownHtml += `<div class="breakdown-row is-bonus"><span>Class Diversity Bonus (x${GAME_CONSTANTS.CLASS_DIVERSITY_MULTIPLIER})</span><strong>+${Math.round(classDiversityBonus)}</strong></div>`;
    }
    breakdownHtml += `<div class="breakdown-row is-total"><span>Final Team Score</span><strong>${Math.round(team.totalScore)}</strong></div></div></details>`;
    return breakdownHtml;
}

/**
 * @function getStarRatingHTML
 * @description Generates the HTML for the star rating.
 * @param {string} tier - The star color tier (e.g., "Red 3").
 * @returns {string} The HTML string for the star rating.
 */
function getStarRatingHTML(tier) {
    if (!tier || tier === "Unlocked") return `<span class="text-slate-400">Unlocked</span>`;
    const tierParts = tier.split(' ');
    if (tierParts.length < 2) return `<span class="text-slate-400">${tier}</span>`;
    const color = tierParts[0].toLowerCase();
    const starCount = parseInt(tierParts[1], 10);
    if (isNaN(starCount)) return `<span class="text-slate-400">${tier}</span>`;
    
    const colorClasses = {
        'red': 'text-red-500',
        'gold': 'text-yellow-400',
        'purple': 'text-purple-500',
        'blue': 'text-blue-500',
        'white': 'text-slate-200'
    };
    const colorClass = colorClasses[color] || 'text-slate-400';

    return `<div class="star-rating inline-block" title="${tier}"><span class="${colorClass}">${'★'.repeat(starCount)}</span><span class="text-slate-500">${'★'.repeat(5 - starCount)}</span></div>`;
}

/**
 * @function getSynergyIcon
 * @description Generates the HTML for a synergy icon.
 * @param {string} synergyName - The name of the synergy.
 * @returns {string} The HTML string for the synergy icon.
 */
function getSynergyIcon(synergyName) {
    if (!synergyName) return '';
    const nameForIcon = synergyName.trim().replace(/\s+/g, '_');
    return `<span class="icon-wrapper" title="${synergyName}"><img src="img/factions/${nameForIcon}.png" alt="${synergyName}" class="synergy-icon"></span>`;
}

/**
 * @function getClassPlaceholder
 * @description Generates the HTML for a class icon.
 * @param {string} className - The name of the class.
 * @returns {string} The HTML string for the class icon.
 */
function getClassPlaceholder(className) {
    const cn = (className || "N/A").trim().replace(/\s+/g, '_');
    if (cn === "N/A" || cn === "") return ``;
    const imgSrc = `img/classes/${cn}.png`;
    return `<span class="icon-wrapper"><img src="${imgSrc}" alt="${cn.replace(/_/g, ' ')}" title="${cn.replace(/_/g, ' ')}" class="icon-class-table"></span>`;
}

/**
 * @function applyChampionCardBackgrounds
 * @description Applies background images to champion cards based on available comic data.
 * @returns {void}
 */
function applyChampionCardBackgrounds() {
    document.querySelectorAll('.champion-card-enhanced').forEach(card => {
        const bgElement = card.querySelector('.card-background-image');
        const championName = card.dataset.championName;
        if (!bgElement || !championName) return;

        const characterId = championName.replace(/([A-Z])/g, '_$1').toLowerCase().substring(1);
        const comicData = characterComicsData.get(characterId);
        
        if (comicData && comicData.imageUrl) {
            bgElement.style.backgroundImage = `url('${comicData.imageUrl}')`;
        } else {
            bgElement.style.backgroundColor = '#1e293b';
        }
    });
}

/**
 * @function formatDate
 * @description Formats a date string.
 * @param {string} dateString - The date string to format.
 * @returns {string} The formatted date string.
 */
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    const correctedDate = new Date(date.getTime() + userTimezoneOffset);
    return correctedDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
    });
}

/**
 * @function _renderComics
 * @description Renders the comics in the display grid.
 * @param {Array<Object>} comics - The list of comics to render.
 * @returns {void}
 * @private
 */
function _renderComics(comics) {
    if (!comics || comics.length === 0) {
        DOM.comicsDisplayGrid.innerHTML = '<p class="text-slate-500 col-span-full text-center">No featured comics found for these characters.</p>';
        return;
    }

    DOM.comicsDisplayGrid.innerHTML = comics.map(comic => {
        if (!comic || !comic.imageUrl) return '';
        
        const issue = comic.issueNumber ? `<span class="bg-indigo-200 text-indigo-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">#${comic.issueNumber}</span>` : '';
        const date = comic.coverDate ? `<p class="text-xs text-slate-400 mt-2">${formatDate(comic.coverDate)}</p>` : '';

        return `
            <a href="${comic.siteUrl}" target="_blank" rel="noopener noreferrer" class="comic-card group block bg-slate-800 border border-slate-700 rounded-lg shadow-lg hover:shadow-indigo-500/30 hover:-translate-y-1 transition-all duration-300 overflow-hidden h-full flex flex-col">
                <div class="comic-image-wrapper overflow-hidden h-64">
                    <img src="${comic.imageUrl}" alt="Cover of ${comic.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                </div>
                <div class="p-4 flex flex-col flex-grow">
                    <div class="flex justify-between items-start mb-2">
                         <h4 class="font-bold text-base text-slate-100 group-hover:text-indigo-400 pr-2 flex-1">${comic.title}</h4>
                         ${issue}
                    </div>
                    <div class="mt-auto">
                        <p class="text-sm text-slate-300 mb-1">First appearance of:</p>
                        <p class="font-semibold text-indigo-400">${comic.character}</p>
                        ${date}
                    </div>
                </div>
            </a>
        `;
    }).join('');
}

/**
 * @async
 * @function _checkFirestoreForComic
 * @description Checks Firestore for cached comic data for a character.
 * @param {import("firebase/firestore").Firestore} db - The Firestore instance.
 * @param {string} characterName - The name of the character.
 * @returns {Promise<Object|null>} The comic data or null if not found.
 * @private
 */
async function _checkFirestoreForComic(db, characterName) {
    if (!db || !characterName) return null;
    const characterId = characterName.replace(/\s+/g, '_').toLowerCase();
    try {
        const docRef = doc(db, `artifacts/${appId}/public/data/characterComics`, characterId);
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
 * @async
 * @function _fetchComicFromProxy
 * @description Fetches comic data from the proxy server.
 * @param {string} characterName - The name of the character.
 * @returns {Promise<Object|null>} The comic data or null if an error occurs.
 * @private
 */
async function _fetchComicFromProxy(characterName) {
    try {
        const proxyUrl = `${PROXY_BASE_URL}?character=${encodeURIComponent(characterName)}`;
        const response = await fetch(proxyUrl);

        if (!response.ok) {
            console.error(`Proxy error for ${characterName}: ${response.statusText}`);
            return null;
        }

        logEvent(analytics, 'comic_proxy', { description: 'requested_comic', character: characterName });

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
 * @async
 * @function loadComicsForHeroes
 * @description Loads comic data for a list of heroes.
 * @param {import("firebase/firestore").Firestore} db - The Firestore instance.
 * @param {Array<string>} heroNames - The names of the heroes.
 * @returns {Promise<void>}
 */
async function loadComicsForHeroes(db, heroNames) {
    if (DOM.comicsDisplaySection) DOM.comicsDisplaySection.classList.remove('hidden');

    const uniqueHeroNames = [...new Set(heroNames)]; 

    const comicPromises = uniqueHeroNames.map(async (name) => {
        let comic = await _checkFirestoreForComic(db, name);
        if (comic) {
            return comic; 
        }

        comic = await _fetchComicFromProxy(name);
        return comic;
    });

    const comics = (await Promise.all(comicPromises)).filter(c => c !== null && c !== undefined);
    _renderComics(comics);
}

/**
 * @function showLoading
 * @description Shows or hides the loading indicator within the main content area.
 * @param {boolean} isLoading - Whether to show the loading indicator.
 * @returns {void}
 */
function showLoading(isLoading) {
    if (isLoading) {
        DOM.loadingIndicator.classList.remove('hidden');
    } else {
        DOM.sharedTeamContainer.classList.remove('hidden');
        DOM.loadingIndicator.classList.add('hidden');
    }
}

/**
 * @function showError
 * @description Displays an error message.
 * @param {string} message - The main error message.
 * @param {string} [details=''] - Additional details about the error.
 * @returns {void}
 */
function showError(message, details = '') {
    showLoading(false);
    DOM.sharedTeamContainer.innerHTML = '';
    DOM.sharedTeamContainer.classList.remove('hidden');
    DOM.errorIndicator.classList.remove('hidden');
    DOM.errorIndicator.querySelector('h2').textContent = message;
    DOM.errorMessageDetails.textContent = details;
}
