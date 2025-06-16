/**
 * @file js/share/ui.js
 * @description Handles fetching and displaying a shared team, and generating a dynamic share banner.
 */

// --- Firebase and Core Logic Imports ---
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { TeamCalculator, GAME_CONSTANTS, ensureIndividualScores } from '../teams/core.js';

// --- DOM ELEMENT REFERENCES ---
const DOM = {
    loadingIndicator: document.getElementById('loading-indicator'),
    errorIndicator: document.getElementById('error-indicator'),
    errorMessageDetails: document.getElementById('error-message-details'),
    sharedTeamContainer: document.getElementById('shared-team-container'),
    // Banner elements
    socialBannerContainer: document.getElementById('social-banner-container'),
    generatedBannerImg: document.getElementById('generated-banner-img'),
    canvas: document.getElementById('social-banner-canvas'),
    // Comics section
    comicsDisplaySection: document.getElementById('comics-display-section'),
    comicsDisplayGrid: document.getElementById('comics-display-grid'),
};

// --- GLOBAL STATE ---
let db;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'dc-dark-legion-builder';
let dbChampions = [], dbSynergies = [], dbLegacyPieces = [];
let characterComicsData = new Map();

// =================================================================================================
// #region INITIALIZATION & DATA FETCHING
// =================================================================================================
document.addEventListener('DOMContentLoaded', initializePage);

async function initializePage() {
    showLoading(true);
    try {
        await new Promise(resolve => {
            if (window.firebaseReady) return resolve();
            document.addEventListener('firebase-ready', resolve, { once: true });
        });
        
        const app = getApp();
        db = getFirestore(app);
        
        const params = new URLSearchParams(window.location.search);
        const sharedTeamId = params.get('sharedTeamId');

        if (!sharedTeamId) {
            showError("No team ID provided.", "The URL is missing the required 'sharedTeamId' parameter.");
            return;
        }

        await Promise.all([
            fetchData('champions', (data) => dbChampions = data),
            fetchData('synergies', (data) => dbSynergies = data.sort((a,b) => a.name.localeCompare(b.name))),
            fetchData('legacyPieces', (data) => dbLegacyPieces = data.sort((a,b) => a.name.localeCompare(b.name))),
            fetchCharacterComics()
        ]);
        
        await loadAndDisplaySharedTeam(sharedTeamId);

    } catch (error) {
        showError("Initialization failed.", error.message);
        console.error("Initialization Error:", error);
    } finally {
        showLoading(false);
    }
}

async function fetchData(collectionName, stateUpdater) {
    if (!db) throw new Error("Firestore not initialized");
    const q = query(collection(db, `artifacts/${appId}/public/data/${collectionName}`));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    stateUpdater(data);
}

async function fetchCharacterComics() {
    if (!db) return;
    try {
        const q = query(collection(db, `artifacts/${appId}/public/data/characterComics`));
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => { characterComicsData.set(doc.id, doc.data()); });
    } catch (error) { console.warn("Could not load character comics data:", error.message); }
}
// =================================================================================================
// #endregion INITIALIZATION & DATA FETCHING
// =================================================================================================


// =================================================================================================
// #region MAIN LOGIC
// =================================================================================================

async function loadAndDisplaySharedTeam(teamId) {
    const docRef = doc(db, `artifacts/${appId}/public/data/sharedTeams`, teamId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const teamData = docSnap.data();
        const membersWithFullDetails = (teamData.members || []).map(member => ({
            ...(dbChampions.find(c => c.id === member.dbChampionId) || {}),
            ...member
        }));
        
        const calculator = new TeamCalculator(dbSynergies, GAME_CONSTANTS);
        const evaluatedTeam = calculator.evaluateTeam(ensureIndividualScores(membersWithFullDetails, dbChampions));
        evaluatedTeam.name = teamData.name;
        
        displayTeamResults(evaluatedTeam);
        await generateShareBanner(evaluatedTeam);
        
        // After displaying the team, load the comics for the members
        const heroNames = evaluatedTeam.members.map(m => m.name);
        loadComicsForHeroes(heroNames);

    } else {
        showError("Team not found.", `No team exists with the ID: ${teamId}. It may have been deleted.`);
    }
}

// =================================================================================================
// #endregion MAIN LOGIC
// =================================================================================================


// =================================================================================================
// #region BANNER GENERATION
// =================================================================================================

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

function updateMetaTag(attribute, value, content) {
    let element = document.querySelector(`meta[${attribute}='${value}']`);
    if (element) {
        element.setAttribute('content', content);
    }
}
// =================================================================================================
// #endregion BANNER GENERATION
// =================================================================================================


// =================================================================================================
// #region DISPLAY LOGIC (Team & Comics)
// =================================================================================================

function displayTeamResults(team) {
    if (!team) {
        showError("Could not display team.", "The provided team data is invalid.");
        return;
    }

    const scoreBreakdownHtml = getScoreBreakdownHtml(team);

    let html = `
        <div class="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div class="text-center mb-6">
                <h3 class="text-2xl font-bold text-accent">${team.name || 'Shared Team'}</h3>
                <p class="text-lg">Total Score: <strong class="text-primary">${Math.round(team.totalScore)}</strong></p>
            </div>
            ${scoreBreakdownHtml}
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mt-6">
    `;

    team.members.forEach((member) => {
        const starRating = getStarRatingHTML(member.starColorTier);
        const forceLevel = member.forceLevel > 0 ? `<p class="force-level">Force: ${member.forceLevel} / 5</p>` : '';
        const synergies = (member.inherentSynergies || []).map(getSynergyIcon).join('');
        const championImageName = (member.name || 'Unknown').replace(/[^a-zA-Z0-9-_]/g, "");

        html += `
            <div class="champion-card-enhanced" data-champion-name="${championImageName}">
                <div class="card-background-image"></div>
                <img src="img/champions/avatars/${championImageName}.webp" alt="${member.name}" class="champion-avatar-center">
                <div class="card-content-overlay">
                    <div class="card-header">
                        ${getClassPlaceholder(member.class)}
                        <h4 class="champion-name">${member.name}</h4>
                    </div>
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

function getStarRatingHTML(tier) {
    if (!tier || tier === "Unlocked") return `<span class="text-slate-400">Unlocked</span>`;
    const tierParts = tier.split(' ');
    if (tierParts.length < 2) return `<span class="text-slate-400">${tier}</span>`;
    const color = tierParts[0];
    const starCount = parseInt(tierParts[1], 10);
    if (isNaN(starCount)) return `<span class="text-slate-400">${tier}</span>`;
    let colorClass = 'text-slate-400';
    if (color === 'Red') colorClass = 'text-red-500';
    else if (color === 'Gold') colorClass = 'text-yellow-400';
    else if (color === 'Purple') colorClass = 'text-purple-500';
    else if (color === 'Blue') colorClass = 'text-blue-500';
    return `<div class="star-rating inline-block" title="${tier}"><span class="${colorClass}">${'★'.repeat(starCount)}</span><span class="text-slate-300">${'★'.repeat(5-starCount)}</span></div>`;
}

function getSynergyIcon(synergyName) {
    if (!synergyName) return '';
    const nameForIcon = synergyName.trim().replace(/\s+/g, '_');
    const fallbackSpan = `<span class="icon-placeholder text-xs" style="display:none;">[${synergyName}]</span>`;
    return `<span class="icon-wrapper" title="${synergyName}"><img src="img/factions/${nameForIcon}.png" alt="${synergyName}" class="synergy-icon" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';">${fallbackSpan}</span>`;
}

function getClassPlaceholder(className) {
    const cn = (className || "N/A").trim().replace(/\s+/g, '_');
    if (cn === "N/A" || cn === "") return `<span class="icon-placeholder">[Class N/A]</span>`;
    const fallbackSpan = `<span class="icon-placeholder" style="display:none;">[${cn.replace(/_/g, ' ')}]</span>`;
    const imgSrc = `img/classes/${cn}.png`;
    return `<span class="icon-wrapper"><img src="${imgSrc}" alt="${cn.replace(/_/g, ' ')}" title="${cn.replace(/_/g, ' ')}" class="icon-class-table" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';"/>${fallbackSpan}</span>`;
}

function applyChampionCardBackgrounds() {
    document.querySelectorAll('.champion-card-enhanced').forEach(card => {
        const bgElement = card.querySelector('.card-background-image');
        const championName = card.dataset.championName;
        if (!bgElement || !championName) return;
        const championId = championName.replace(/([A-Z])/g, '_$1').toLowerCase().substring(1);
        const comicData = characterComicsData.get(championId);
        if (comicData && comicData.imageUrl) {
            bgElement.style.backgroundImage = `url('${comicData.imageUrl}')`;
            card.classList.remove('is-fallback-avatar');
        } else {
            bgElement.style.backgroundImage = `url('img/champions/avatars/${championName}.webp')`;
            card.classList.add('is-fallback-avatar');
        }
    });
}
// =================================================================================================
// #endregion DISPLAY LOGIC
// =================================================================================================

// =================================================================================================
// #region Comic Book Load and Display
// =================================================================================================

/**
 * Formats a date string into a more readable "Month Year" format.
 * @param {string} dateString - The date string to format (e.g., "1940-11-30").
 * @returns {string} The formatted date string.
 */
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    // Add timezone offset to prevent off-by-one day errors
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    const correctedDate = new Date(date.getTime() + userTimezoneOffset);
    return correctedDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
    });
}

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
 * Main function to display comics for heroes from the pre-loaded data.
 * @param {Array<string>} heroNames - An array of hero names.
 */
function loadComicsForHeroes(heroNames) {
    if (DOM.comicsDisplaySection) DOM.comicsDisplaySection.classList.remove('hidden');

    const uniqueHeroNames = [...new Set(heroNames)]; // Ensure we only process each hero once
    
    const comics = uniqueHeroNames.map(name => {
        const characterId = name.replace(/\s+/g, '_').toLowerCase();
        return characterComicsData.get(characterId);
    }).filter(comic => comic !== undefined); // Filter out any heroes that didn't have a comic

    _renderComics(comics);
}

// =================================================================================================
// #endregion Comic Book Load and Display
// =================================================================================================


// =================================================================================================
// #region UI State Management
// =================================================================================================
function showLoading(isLoading) {
    DOM.loadingIndicator.classList.toggle('hidden', !isLoading);
    DOM.sharedTeamContainer.classList.toggle('hidden', isLoading);
}

function showError(message, details = '') {
    showLoading(false);
    DOM.sharedTeamContainer.innerHTML = '';
    DOM.errorIndicator.classList.remove('hidden');
    DOM.errorIndicator.querySelector('h2').textContent = message;
    DOM.errorMessageDetails.textContent = details;
}
// =================================================================================================
// #endregion UI State Management
// =================================================================================================
