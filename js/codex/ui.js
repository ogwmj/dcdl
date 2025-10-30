/**
 * @file js/codex/ui.js
 * @description Adds a dedicated Skills tab to the dossier.
 * @version 8.3.0
 */

// --- Firebase & Data ---
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, addDoc, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- Global Variables ---
let db, analytics, functions, auth;
let ALL_CHAMPIONS = [];
let ALL_SYNERGIES = {};
let COMICS_DATA = {};
let synergyPillbox = null;
let sortDropdown = null;
let currentChampionList = [];
const RARITY_ORDER = { 'Epic': 1, 'Legendary': 2, 'Mythic': 3, 'Limited Mythic': 4, 'Iconic': 5 };
const CACHE_KEY = 'codexData';
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000;

// --- Filter State ---
let activeFilters = {
    search: '',
    sort: 'name_asc',
    class: new Set(),
    rarity: new Set(),
    synergy: [],
    isHealer: false,
};
let currentViewMode = 'grid';
let USER_ROSTER_IDS = new Set();
let currentUserId = null;
let currentUserRoles = [];

// --- DOM ELEMENTS ---
const DOM = {
    loadingIndicator: document.getElementById('loading-indicator'),
    codexMainContent: document.getElementById('codex-main-content'),
    grid: document.getElementById('codex-grid'),
    // Comic Modal
    comicModalBackdrop: document.getElementById('comic-modal-backdrop'),
    comicModalBody: document.getElementById('comic-modal-body'),
    comicModalClose: document.getElementById('comic-modal-close'),
    modalPrevBtn: document.getElementById('modal-prev-btn'),
    modalNextBtn: document.getElementById('modal-next-btn'),
    // Dossier Modal
    dossierModalBackdrop: document.getElementById('dossier-modal-backdrop'),
    dossierModalBody: document.getElementById('dossier-modal-body'),
    dossierModalClose: document.getElementById('dossier-modal-close'),
    dossierLeftColumn: document.getElementById('dossier-left-column'),
    dossierRightColumn: document.getElementById('dossier-right-column'),
    // Filters
    filterControls: document.getElementById('filter-controls'),
    searchInput: document.getElementById('search-input'),
    sortSelectContainer: document.getElementById('sort-select-container'),
    classFiltersContainer: document.getElementById('class-filters-container'),
    rarityFiltersContainer: document.getElementById('rarity-filters-container'),
    synergyContainer: document.getElementById('synergy-multiselect-container'),
    healerFilterBtn: document.getElementById('healer-filter-btn'),
    resetFiltersBtn: document.getElementById('reset-filters-btn'),
    viewGridBtn: document.getElementById('view-grid-btn'),
    viewListBtn: document.getElementById('view-list-btn'),
    // Admin Panel
    adminPanel: document.getElementById('admin-panel'),
    bulkRegenAllBtn: document.getElementById('bulk-regenerate-all-btn'),
    bulkRegenOverwriteBtn: document.getElementById('bulk-regenerate-overwrite-btn'),
    bulkProgressContainer: document.getElementById('bulk-progress'),
    bulkProgressBar: document.getElementById('bulk-progress-bar'),
    bulkProgressText: document.getElementById('bulk-progress-text'),
};

// --- Confirmation Modal ---
const confirmationModal = {
    backdrop: document.getElementById('confirmation-modal-backdrop'),
    title: document.getElementById('confirmation-modal-title'),
    text: document.getElementById('confirmation-modal-text'),
    confirmBtn: document.getElementById('confirmation-modal-confirm-btn'),
    cancelBtn: document.getElementById('confirmation-modal-cancel-btn'),
    _resolve: null,

    show(text, title = 'Confirm Action') {
        if (!this.backdrop) return Promise.resolve(window.confirm(text)); // Fallback
        this.title.textContent = title;
        this.text.textContent = text;
        this.backdrop.classList.remove('hidden');
        return new Promise(resolve => {
            this._resolve = resolve;
        });
    },

    hide(result) {
        if (!this.backdrop) return;
        this.backdrop.classList.add('hidden');
        if (this._resolve) {
            this._resolve(result);
            this._resolve = null;
        }
    }
};

// --- START: Helper & Utility Functions ---

/**
 * Generates the HTML for social media icons based on a creator's profile data.
 * @param {object} socials - An object containing social media URLs.
 * @returns {string} The generated HTML string for the icons.
 */
function generateSocialIconsHtml(socials) {
    if (!socials || Object.keys(socials).length === 0) return '';

    const socialLinks = [
        { key: 'discord', icon: 'fab fa-discord' },
        { key: 'youtube', icon: 'fab fa-youtube' },
        { key: 'twitch', icon: 'fab fa-twitch' },
        { key: 'x', icon: 'fab fa-twitter' },
        { key: 'tiktok', icon: 'fab fa-tiktok' },
        { key: 'instagram', icon: 'fab fa-instagram' }
    ];

    return socialLinks
        .filter(link => socials[link.key])
        .map(link => `<a href="${socials[link.key]}" target="_blank" rel="noopener noreferrer" title="${link.key}"><i class="${link.icon}"></i></a>`)
        .join('');
}


function createStarDisplayHTML(levelString) {
    if (!levelString || levelString === 'N/A' || levelString === 'Unlocked') {
        return `<div class="star-display tier-unlocked" title="Community Average: Not Available">
            ${[...Array(5)].map(() => '<span>☆</span>').join('')}
        </div>`;
    }
    const parts = levelString.split(' ');
    const tier = parts[0].toLowerCase();
    const starCount = parseInt(parts[1], 10) || 0;
    let starsHTML = '';
    for (let i = 1; i <= 5; i++) {
        starsHTML += `<span>${i <= starCount ? '★' : '☆'}</span>`;
    }
    return `<div class="star-display tier-${tier}" title="Community Average: ${levelString}">${starsHTML}</div>`;
}

function dispatchNotification(message, type = 'info', duration = 3000) {
    const event = new CustomEvent('show-notification', {
        detail: { message, type, duration },
        bubbles: true,
        composed: true
    });
    document.dispatchEvent(event);
}

function showLoading(isLoading) {
    if (isLoading) {
        if (DOM.loadingIndicator) {
            DOM.loadingIndicator.innerHTML = '';
            for (let i = 0; i < 12; i++) {
                const skeletonCard = document.createElement('div');
                skeletonCard.className = 'skeleton-card';
                DOM.loadingIndicator.appendChild(skeletonCard);
            }
            DOM.loadingIndicator.classList.remove('hidden');
        }
        if (DOM.codexMainContent) DOM.codexMainContent.classList.add('hidden');
    } else {
        if (DOM.loadingIndicator) DOM.loadingIndicator.classList.add('hidden');
        if (DOM.codexMainContent) DOM.codexMainContent.classList.remove('hidden');
    }
}

function logAnalyticsEvent(eventName, params = {}) {
    if (analytics) {
        try {
            logEvent(analytics, eventName, params);
        } catch (e) {
            console.warn(`Analytics event "${eventName}" failed:`, e);
        }
    }
}

function sanitizeName(name) {
    if (!name) return '';
    return name.replace(/[^a-zA-Z0-9-]/g, "");
}

function getCachedData() {
    const cachedItem = localStorage.getItem(CACHE_KEY);
    if (!cachedItem) return null;
    const { timestamp, data } = JSON.parse(cachedItem);
    if (Date.now() - timestamp > CACHE_DURATION_MS) {
        localStorage.removeItem(CACHE_KEY);
        return null;
    }
    return data;
}

function setCachedData(data) {
    const item = { timestamp: Date.now(), data: data };
    localStorage.setItem(CACHE_KEY, JSON.stringify(item));
}

function getSynergyIcon(synergyName) {
    if (!synergyName) return '';
    const nameForIcon = synergyName.trim().replace(/\s+/g, '_');
    return `<img src="img/factions/${nameForIcon}.png" alt="${synergyName}" class="synergy-icon" onerror="this.style.display='none';">`;
}

function getClassIcon(className) {
    if (!className) return '';
    const nameForIcon = className.trim().replace(/\s+/g, '_');
    return `<img src="img/classes/${nameForIcon}.png" alt="${className}" title="${className}">`;
}

// --- END: Helper & Utility Functions ---

// --- START: Champion Card & List Item Creation ---

function createChampionCard(champion) {
    const card = document.createElement('div');
    const rarityBgClass = `rarity-bg-${champion.baseRarity.replace(' ', '-')}`;
    card.className = `champion-card ${rarityBgClass}`;
    card.dataset.championId = champion.id;

    const cleanName = sanitizeName(champion.name);
    const classIconHtml = champion.class ? `<div class="card-class-icon" title="${champion.class}">${getClassIcon(champion.class)}</div>` : '';
    let synergyIconsHtml = '';
    if (champion.inherentSynergies && champion.inherentSynergies.length > 0) {
        synergyIconsHtml = `<div class="card-synergy-icons">${champion.inherentSynergies.map(s => getSynergyIcon(s)).join('')}</div>`;
    }
    const communityLevel = champion.communityAverageLevel || 'N/A';
    const communityStarsHTML = createStarDisplayHTML(communityLevel);

    // Added 'hide-on-mobile' class to specific buttons
    // Added 'admin-actions-placeholder' for the admin button
    card.innerHTML = `
        <div class="card-inner">
            <div class="card-front">
                <div class="avatar-bg" style="background-image: url('img/champions/avatars/${cleanName}.webp')"></div>
                ${classIconHtml}
                ${synergyIconsHtml}
                <div class="card-content">
                    <div class="name">${champion.name}</div>
                    <div class="class">${champion.class || 'N/A'}</div>
                    <div class="community-average">
                        ${communityStarsHTML}
                    </div>
                </div>
            </div>
            <div class="card-back">
                <div class="card-actions-container">
                    <button class="card-action-btn" data-action="dossier">Full Dossier</button>
                    <button class="card-action-btn hide-on-mobile" data-action="comic">Comic View</button>
                    <button class="card-action-btn hide-on-mobile" data-action="download">Download Card</button>
                    <div class="admin-actions-placeholder" data-champion-id="${champion.id}"></div>
                    <div class="roster-button-placeholder" data-champion-id="${champion.id}" data-champion-name="${encodeURIComponent(champion.name)}"></div>
                </div>
            </div>
        </div>
    `;

    // Event listeners are now delegated to the grid container to handle dynamically added admin buttons
    return card;
}

function createChampionListItem(champion) {
    const cleanName = sanitizeName(champion.name);
    const item = document.createElement('div');
    const rarityClass = champion.baseRarity.replace(' ', '-');
    item.className = `champion-list-item rarity-${rarityClass}`;
    item.dataset.championId = champion.id;

    let synergyIconsHtml = '';
    if (champion.inherentSynergies && champion.inherentSynergies.length > 0) {
        synergyIconsHtml = champion.inherentSynergies.map(s => getSynergyIcon(s)).join('');
    }

    item.innerHTML = `
        <div class="list-item-avatar">
            <img src="img/champions/avatars/${cleanName}.webp" alt="${champion.name}">
        </div>
        <div class="list-item-name">${champion.name}</div>
        <div class="list-item-class">${getClassIcon(champion.class) || 'N/A'}</div>
        <div class="list-item-rarity">${champion.baseRarity || 'N/A'}</div>
        <div class="list-item-synergies">${synergyIconsHtml}</div>
    `;

    item.addEventListener('click', () => showDossierModal(champion.id));
    return item;
}

// --- END: Champion Card & List Item Creation ---

// --- START: Modal Logic (Comic and Dossier) ---

function showComicModal(championId) {
    DOM.comicModalBackdrop.classList.add('is-visible');
    DOM.comicModalBody.innerHTML = `<div class="loading-spinner"></div>`;

    const champion = ALL_CHAMPIONS.find(c => c.id === championId);
    if (!champion) {
        DOM.comicModalBody.innerHTML = `<p class="text-center text-red-500">Champion not found.</p>`;
        return;
    }
    
    const currentIndex = currentChampionList.findIndex(c => c.id === championId);
    DOM.modalPrevBtn.disabled = currentIndex <= 0;
    DOM.modalNextBtn.disabled = currentIndex >= currentChampionList.length - 1;
    
    const newPrev = DOM.modalPrevBtn.cloneNode(true);
    DOM.modalPrevBtn.parentNode.replaceChild(newPrev, DOM.modalPrevBtn);
    DOM.modalPrevBtn = newPrev;
    
    const newNext = DOM.modalNextBtn.cloneNode(true);
    DOM.modalNextBtn.parentNode.replaceChild(newNext, DOM.modalNextBtn);
    DOM.modalNextBtn = newNext;

    if (currentIndex > 0) {
        DOM.modalPrevBtn.addEventListener('click', () => showComicModal(currentChampionList[currentIndex - 1].id));
    }
    if (currentIndex < currentChampionList.length - 1) {
        DOM.modalNextBtn.addEventListener('click', () => showComicModal(currentChampionList[currentIndex + 1].id));
    }

    const comicId = champion.name.toLowerCase().replace(/\s+/g, '_').replace('two-face', 'two_face');
    const comic = COMICS_DATA[comicId];
    const cleanName = sanitizeName(champion.name);
    
    let mainImageHtml = `<img src="img/champions/full/${cleanName}.webp" alt="Artwork of ${champion.name}" class="comic-featured-image" onerror="this.style.display='none'">`;
    let imagePanelCaption = `Codex Image`;

    if (comic && comic.imageUrl) {
        const comicYear = comic.coverDate ? `(${new Date(comic.coverDate).getFullYear()})` : '';
        mainImageHtml = `
            <img src="${comic.imageUrl}" alt="Cover of ${comic.title}" class="comic-featured-image is-background-image" onerror="this.style.display='none'">
            <img src="img/champions/full/${cleanName}.webp" alt="${champion.name}" class="comic-featured-image is-foreground-image">
        `;
        imagePanelCaption = `First Appearance: ${comic.title} #${comic.issueNumber} ${comicYear}`;
    }
    
    DOM.comicModalBody.innerHTML = `
        <div class="comic-header"><img src="img/logo_white.webp" alt="Logo" class="comic-header-logo"></div>
        <div class="comic-image-panel">${mainImageHtml}</div>
        <div class="comic-featuring-title">${imagePanelCaption}</div>
        <h3 class="comic-main-title">${champion.name}</h3>
    `;
}

function hideComicModal() {
    DOM.comicModalBackdrop.classList.remove('is-visible');
    DOM.comicModalBody.innerHTML = '';
}

async function showDossierModal(championId) {
    DOM.dossierModalBackdrop.classList.add('is-visible');
    DOM.dossierModalBody.scrollTop = 0;

    const champion = ALL_CHAMPIONS.find(c => c.id === championId);
    if (!champion) {
        DOM.dossierLeftColumn.innerHTML = `<p class="text-red-500">Champion not found.</p>`;
        DOM.dossierRightColumn.innerHTML = '';
        return;
    }

    logAnalyticsEvent('view_dossier', { champion_id: champion.id, champion_name: champion.name });

    const cleanName = sanitizeName(champion.name);
    const dossierImageSrc = champion.cardImageUrl || `img/champions/full/${cleanName}.webp`;
    
    DOM.dossierLeftColumn.innerHTML = `
        <img src="${dossierImageSrc}" alt="${champion.name}" class="dossier-image" onerror="this.onerror=null;this.src='img/champions/full/${cleanName}.webp';">
        <h2 class="dossier-name">${champion.name}</h2>
        <p class="dossier-class">${champion.class || 'Class Unknown'}</p>
    `;

    handleTabClick(null, 'overview');

    populateOverviewTab(champion);
    populateSkillsTab(champion);
    populateCommunityTab(champion);
    populateLoreTab(champion);
}

function hideDossierModal() {
    DOM.dossierModalBackdrop.classList.remove('is-visible');
}

function handleTabClick(event, tabNameToActivate) {
    const tabName = tabNameToActivate || (event ? event.currentTarget.dataset.tab : null);
    
    if (!tabName) return;

    DOM.dossierRightColumn.querySelectorAll('.dossier-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    DOM.dossierRightColumn.querySelectorAll('.dossier-tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `dossier-tab-${tabName}`);
    });
}

function populateOverviewTab(champion) {
    const pane = document.getElementById('dossier-tab-overview');
    
    const synergiesHtml = champion.inherentSynergies?.length > 0
        ? champion.inherentSynergies.map(synName => {
            const synergyData = Object.values(ALL_SYNERGIES).find(s => s.name === synName);
            const description = synergyData ? synergyData.description : 'No description available.';
            return `<div class="stat-box">
                        <div class="label">${synName}</div>
                        <div class="value" style="font-size: 0.9rem; color: #d1d5db;">${description}</div>
                    </div>`;
        }).join('')
        : '<p>No inherent synergies.</p>';

    pane.innerHTML = `
        <div class="mb-6">
            <h3 class="dossier-section-title">Known Information</h3>
            <div class="overview-grid">
                <div class="stat-box">
                    <div class="label">Base Rarity</div>
                    <div class="value">${champion.baseRarity || 'N/A'}</div>
                </div>
                <div class="stat-box">
                    <div class="label">Class</div>
                    <div class="value">${champion.class || 'N/A'}</div>
                </div>
            </div>
        </div>
        <div class="mb-6">
            <h3 class="dossier-section-title">Inherent Synergies</h3>
            <div class="overview-grid">${synergiesHtml}</div>
        </div>
    `;
}

function populateSkillsTab(champion) {
    const pane = document.getElementById('dossier-tab-skills');
    if (!pane) return;

    if (!champion.skills || champion.skills.length === 0) {
        pane.innerHTML = `<div class="dossier-placeholder-text">Skill information for this champion is not yet available.</div>`;
        return;
    }

    const skillsHtml = champion.skills.map(skill => {
        const ultimateBadge = skill.isUltimate ? `<div class="skill-badge ultimate-badge">Ultimate</div>` : '';
        const typeBadge = skill.type ? `<div class="skill-badge type-badge">${skill.type}</div>` : '';
        const effectsHtml = skill.effects?.length > 0
            ? `<div class="skill-effects">${skill.effects.map(eff => `<span class="effect-tag">${eff}</span>`).join('')}</div>`
            : '';

        return `
            <div class="skill-card ${skill.isUltimate ? 'is-ultimate' : ''}">
                <div class="skill-header">
                    <h4 class="skill-title">${skill.name || 'Unnamed Skill'}</h4>
                    <div class="skill-badges">${typeBadge}${ultimateBadge}</div>
                </div>
                <p class="skill-description">${skill.description || 'No description available.'}</p>
                ${effectsHtml}
            </div>
        `;
    }).join('');

    pane.innerHTML = skillsHtml;
}

async function populateCommunityTab(champion) {
    const pane = document.getElementById('dossier-tab-community');
    pane.innerHTML = `<div class="loading-spinner mx-auto"></div>`;

    const isCreator = currentUserRoles.includes('creator');
    const ratingsCategories = ['Meta', 'Training Simulator', 'Combat Cycle', 'All Around'];
    let ratingsHtml = '<div class="community-ratings-grid">';
    for (const category of ratingsCategories) {
        ratingsHtml += `
            <div class="rating-category">
                <div class="rating-category-name">${category}</div>
                <div class="rating-stars" data-category="${category}" id="rating-${sanitizeName(category)}">
                    ${[...Array(5)].map((_, i) => `<span data-value="${i + 1}">☆</span>`).join('')}
                </div>
            </div>`;
    }
    ratingsHtml += '</div>';

    const tipsHtml = `
        <div>
            <h3 class="dossier-section-title">Player Tips & Strategies</h3>
            <div id="player-tips-list">
                <p class="text-gray-400">Loading tips...</p>
            </div>
            ${isCreator ? `
            <form id="add-tip-form" class="mt-6">
                <textarea name="tip" placeholder="Share a tip, build, or strategy..." rows="3"></textarea>
                <button type="submit">Submit Tip</button>
            </form>
            ` : `
            <div class="dossier-placeholder-text mt-6">
                Only users with the 'Creator' role can submit tips.
            </div>
            `}
        </div>
    `;

    pane.innerHTML = `
        <h3 class="dossier-section-title">Community Ratings</h3>
        ${ratingsHtml}
        ${tipsHtml}
    `;

    pane.querySelectorAll('.rating-stars span').forEach(star => {
        star.addEventListener('click', (e) => handleRatingSubmit(e, champion.id));
    });

    if (isCreator) {
        const tipForm = pane.querySelector('#add-tip-form');
        if (tipForm) {
            tipForm.addEventListener('submit', (e) => handleTipSubmit(e, champion.id));
        }
    }

    renderCommunityRatings(champion.id);
    renderPlayerTips(champion.id);
}

function populateLoreTab(champion) {
    const pane = document.getElementById('dossier-tab-lore');
    const comicId = champion.name.toLowerCase().replace(/\s+/g, '_').replace('two-face', 'two_face');
    const comic = COMICS_DATA[comicId];
    
    let firstAppearanceHtml = `
        <div class="dossier-placeholder-text">
            First appearance information is not yet available for this character.
        </div>`;

    if (comic && comic.imageUrl) {
        const comicYear = comic.coverDate ? `(${new Date(comic.coverDate).getFullYear()})` : '';
        firstAppearanceHtml = `
            <div class="lore-first-appearance">
                <img src="${comic.imageUrl}" alt="Cover of ${comic.title}" class="lore-cover-image">
                <div>
                    <h4 class="lore-comic-title">${comic.title} #${comic.issueNumber}</h4>
                    <p class="lore-comic-details">${comicYear}</p>
                </div>
            </div>
        `;
    }
    
    const biographyHtml = `<p class="lore-biography">${champion.bio || 'A detailed biography is not yet available.'}</p>`;

    pane.innerHTML = `
        <div class="mb-6">
            <h3 class="dossier-section-title">First Appearance</h3>
            ${firstAppearanceHtml}
        </div>
        <div class="mb-6">
            <h3 class="dossier-section-title">Biography</h3>
            ${biographyHtml}
        </div>
        <div id="related-champions-section">
            <h3 class="dossier-section-title">Boosted Odds</h3>
            <div id="related-champions-container" class="related-champions-grid">
                <div class="loading-spinner-small mx-auto"></div>
            </div>
        </div>
    `;
    renderRelatedChampions(champion.id);
}

async function renderRelatedChampions(championId) {
    const container = document.getElementById('related-champions-container');
    const section = document.getElementById('related-champions-section');
    if (!container || !section) return;

    section.style.display = 'none';
    container.innerHTML = `<div class="loading-spinner-small mx-auto"></div>`;

    try {
        const relatedChampsQuery = query(collection(db, `artifacts/dc-dark-legion-builder/public/data/champions/${championId}/relatedChampions`));
        const relatedSnap = await getDocs(relatedChampsQuery);

        if (relatedSnap.empty) { return; }

        const relatedDocData = relatedSnap.docs[0].data();
        const relatedIds = relatedDocData.championIds;

        if (!relatedIds || relatedIds.length === 0) { return; }

        const relatedChampsData = relatedIds.map(id => ALL_CHAMPIONS.find(c => c.id === id)).filter(Boolean);

        if (relatedChampsData.length > 0) {
            section.style.display = 'block';
            container.innerHTML = relatedChampsData.map(rc => `
                <div class="related-champion-item" data-id="${rc.id}" title="View ${rc.name}'s Dossier">
                    <img src="img/champions/avatars/${sanitizeName(rc.name)}.webp" alt="${rc.name}">
                    <span>${rc.name}</span>
                </div>
            `).join('');

            const newContainer = container.cloneNode(true);
            container.parentNode.replaceChild(newContainer, container);
            
            newContainer.addEventListener('click', (e) => {
                const relatedItem = e.target.closest('.related-champion-item');
                if (relatedItem && relatedItem.dataset.id) {
                    showDossierModal(relatedItem.dataset.id);
                }
            });
        }
    } catch (error) {
        console.error("Failed to fetch related champions:", error);
        section.style.display = 'block';
        container.innerHTML = '<p class="text-red-500 text-sm">Could not load related champions.</p>';
    }
}

// --- END: Modal Logic ---

// --- START: Community Hub Data Functions ---

async function renderCommunityRatings(championId) {
    if (!db) return;
    const ratingsRef = collection(db, `artifacts/dc-dark-legion-builder/public/data/champions/${championId}/communityRatings`);
    const ratingsSnap = await getDocs(ratingsRef);

    const ratingsData = {};
    const ratingsCategories = ['Meta', 'Training Simulator', 'Combat Cycle', 'All Around'];
    ratingsCategories.forEach(cat => ratingsData[cat] = { total: 0, count: 0 });

    ratingsSnap.forEach(doc => {
        const data = doc.data();
        if (ratingsData[data.category]) {
            ratingsData[data.category].total += data.rating;
            ratingsData[data.category].count++;
        }
    });

    for (const category in ratingsData) {
        const avgRating = ratingsData[category].count > 0 ? ratingsData[category].total / ratingsData[category].count : 0;
        const starsContainer = document.getElementById(`rating-${sanitizeName(category)}`);
        if (starsContainer) {
            starsContainer.querySelectorAll('span').forEach((star, i) => {
                star.innerHTML = (i < avgRating) ? '★' : '☆';
                star.classList.toggle('filled', i < avgRating);
            });
        }
    }

    if (currentUserId) {
        const userRatingsQuery = query(ratingsRef, where('userId', '==', currentUserId));
        const userRatingsSnap = await getDocs(userRatingsQuery);
        userRatingsSnap.forEach(doc => {
            const data = doc.data();
            const starsContainer = document.getElementById(`rating-${sanitizeName(data.category)}`);
            if (starsContainer) {
                starsContainer.querySelectorAll('span').forEach((star, i) => {
                    star.classList.toggle('user-rated', i < data.rating);
                });
            }
        });
    }
}

async function renderPlayerTips(championId) {
    if (!db) return;
    const tipsContainer = document.getElementById('player-tips-list');
    const tipsQuery = query(collection(db, `artifacts/dc-dark-legion-builder/public/data/champions/${championId}/playerTips`));
    const tipsSnap = await getDocs(tipsQuery);

    if (tipsSnap.empty) {
        tipsContainer.innerHTML = '<p class="text-gray-500">No tips yet. Be the first to share one!</p>';
        return;
    }

    let tipsHtml = '';
    tipsSnap.forEach(doc => {
        const tip = doc.data();
        const date = tip.createdAt?.toDate().toLocaleDateString() || 'A while ago';
        const socialsHtml = generateSocialIconsHtml(tip.creatorSocials);

        tipsHtml += `
            <div class="tip-card">
                <p class="tip-meta">Shared on ${date}</p>
                <p class="tip-text">${tip.text}</p>
                <div class="tip-author-info">
                    <span class="tip-author-name">${tip.creatorName || 'A Creator'}</span>
                    ${socialsHtml ? `<div class="tip-author-socials">${socialsHtml}</div>` : ''}
                </div>
            </div>
        `;
    });
    tipsContainer.innerHTML = tipsHtml;
}

async function handleRatingSubmit(event, championId) {
    if (!currentUserId) {
        dispatchNotification('Please log in to submit a rating.', 'info');
        return;
    }
    const star = event.currentTarget;
    const rating = parseInt(star.dataset.value, 10);
    const category = star.parentElement.dataset.category;

    const ratingDocRef = doc(db, `artifacts/dc-dark-legion-builder/public/data/champions/${championId}/communityRatings`, `${currentUserId}_${category}`);
    
    try {
        await setDoc(ratingDocRef, {
            userId: currentUserId,
            rating: rating,
            category: category,
            createdAt: serverTimestamp()
        });
        dispatchNotification('Rating saved!', 'success');
        renderCommunityRatings(championId);
    } catch (error) {
        console.error("Error saving rating:", error);
        dispatchNotification('Could not save rating.', 'error');
    }
}

async function handleTipSubmit(event, championId) {
    event.preventDefault();
    if (!currentUserRoles.includes('creator')) {
        dispatchNotification("Only Creators can submit tips.", "warning");
        return;
    }

    const form = event.currentTarget;
    const textarea = form.querySelector('textarea');
    const button = form.querySelector('button');
    const tipText = textarea.value.trim();

    if (!tipText) {
        dispatchNotification('Please enter a tip before submitting.', 'warning');
        return;
    }

    button.disabled = true;
    button.textContent = 'Submitting...';

    try {
        const userDocRef = doc(db, `artifacts/dc-dark-legion-builder/users/${currentUserId}`);
        const userDocSnap = await getDoc(userDocRef);

        let creatorName = 'A Creator';
        let creatorSocials = {};

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            creatorName = userData.username || creatorName;
            if (userData.creatorProfile && userData.creatorProfile.socials) {
                creatorSocials = userData.creatorProfile.socials;
            }
        }

        await addDoc(collection(db, `artifacts/dc-dark-legion-builder/public/data/champions/${championId}/playerTips`), {
            userId: currentUserId,
            text: tipText,
            createdAt: serverTimestamp(),
            upvotes: 0,
            creatorName: creatorName,
            creatorSocials: creatorSocials
        });
        dispatchNotification('Tip submitted successfully!', 'success');
        form.reset();
        renderPlayerTips(championId);
    } catch (error) {
        console.error("Error submitting tip:", error);
        dispatchNotification('Failed to submit tip.', 'error');
    } finally {
        button.disabled = false;
        button.textContent = 'Submit Tip';
    }
}

// --- END: Community Hub Data Functions ---

// --- START: Image Generation & Download ---

async function downloadImage(imageUrl, filename) {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error('Network response was not ok.');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    } catch (error) {
        console.error('Error downloading image:', error);
        dispatchNotification('Could not download image.', 'error');
    }
}

async function generateAndUploadCardImage(championId, force = false, isBulk = false) {
    const champion = ALL_CHAMPIONS.find(c => c.id === championId);
    if (!champion) {
        dispatchNotification('Error: Champion not found.', 'error');
        return;
    }
    
    const cleanName = sanitizeName(champion.name);

    if (champion.cardImageUrl && !force) {
        if (!isBulk) {
            dispatchNotification('Card exists. Starting download...', 'info');
            await downloadImage(champion.cardImageUrl, `${cleanName}-card.png`);
        }
        return;
    }
    
    if (!isBulk) {
        dispatchNotification('Preparing card...', 'info', 4000);
    }

    const originalCardElement = document.querySelector(`.champion-card[data-champion-id="${championId}"]`);
    if (!originalCardElement) {
        if (!isBulk) dispatchNotification('Error finding champion card on page.', 'error');
        console.error('Could not find card element for', champion.name, 'to generate image.');
        return;
    }

    const clone = originalCardElement.cloneNode(true);
    const rect = originalCardElement.getBoundingClientRect();

    clone.style.position = 'absolute';
    clone.style.top = `${window.scrollY}px`;
    clone.style.left = '-9999px';
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;

    document.body.appendChild(clone);

    const cardInner = clone.querySelector('.card-inner');
    const communityAverageEl = clone.querySelector('.community-average');
    const cardBack = clone.querySelector('.card-back');

    if (communityAverageEl) communityAverageEl.style.display = 'none';
    if (cardInner) cardInner.style.transform = 'rotateY(0deg)';
    if (cardBack) cardBack.style.display = 'none';

    try {
        const canvas = await html2canvas(clone, { 
            useCORS: true, 
            backgroundColor: null,
            width: rect.width,
            height: rect.height,
        });
        const imageDataUrl = canvas.toDataURL('image/png');
        const saveImage = httpsCallable(functions, 'saveChampionCardImage');
        const result = await saveImage({
            championId: champion.id,
            championName: cleanName,
            imageDataUrl: imageDataUrl,
            force: force
        });

        if (result.data.url) {
            const champIndex = ALL_CHAMPIONS.findIndex(c => c.id === championId);
            if (champIndex !== -1) {
                ALL_CHAMPIONS[champIndex].cardImageUrl = result.data.url;
            }
        }

        logAnalyticsEvent('generate_card_image', { champion_id: championId, forced: force });
        
        if (!isBulk) {
            dispatchNotification('Card image created! Starting download...', 'success');
            await downloadImage(result.data.imageDataUrl, `${cleanName}-card.png`);
        } else {
            dispatchNotification(`Generated: ${champion.name}`, 'success', 1500);
        }
    } catch (error) {
        console.error("Failed to call saveChampionCardImage function:", error);
        const errorMessage = error.details?.message || 'Could not generate or save card image.';
        dispatchNotification(errorMessage, 'error');
    } finally {
        document.body.removeChild(clone);
    }
}

// --- END: Image Generation & Download ---

// --- START: Admin Functionality ---

async function handleBulkRegenerate(overwrite) {
    const confirmationText = overwrite
        ? "This will regenerate and overwrite images for ALL champions. This can take a long time and is irreversible. Are you sure?"
        : "This will generate images for all champions that are currently missing one. Are you sure?";

    const confirmed = await confirmationModal.show(confirmationText, 'Bulk Image Generation');
    if (!confirmed) return;

    DOM.bulkProgressContainer.classList.remove('hidden');
    
    const championsToProcess = overwrite ? ALL_CHAMPIONS : ALL_CHAMPIONS.filter(c => !c.cardImageUrl);
    const total = championsToProcess.length;

    if (total === 0) {
        DOM.bulkProgressText.textContent = "No champions to process.";
        setTimeout(() => DOM.bulkProgressContainer.classList.add('hidden'), 3000);
        return;
    }

    let processedCount = 0;
    for (const champion of championsToProcess) {
        try {
            await generateAndUploadCardImage(champion.id, overwrite, true);
        } catch (error) {
            console.error(`Failed to process ${champion.name} in bulk:`, error);
            dispatchNotification(`Bulk failed on: ${champion.name}`, 'error');
        } finally {
            processedCount++;
            const percentage = (processedCount / total) * 100;
            DOM.bulkProgressBar.style.width = `${percentage}%`;
            DOM.bulkProgressText.textContent = `Processing ${processedCount} of ${total}: ${champion.name}`;
        }
    }

    DOM.bulkProgressText.textContent = `Bulk generation complete! Processed ${processedCount} champions.`;
    setTimeout(() => {
        DOM.bulkProgressContainer.classList.add('hidden');
        DOM.bulkProgressBar.style.width = '0%';
    }, 5000);
}


function updateAdminUI() {
    const isAdmin = currentUserRoles.includes('admin');
    if (DOM.adminPanel) {
        DOM.adminPanel.classList.toggle('hidden', !isAdmin);
    }
    
    document.querySelectorAll('.admin-actions-placeholder').forEach(placeholder => {
        const championId = placeholder.dataset.championId;
        const existingButton = placeholder.nextElementSibling;
        if (existingButton && existingButton.dataset.action === 'regenerate') {
            existingButton.remove();
        }

        if (isAdmin) {
            const regenerateBtn = document.createElement('button');
            regenerateBtn.className = 'card-action-btn';
            regenerateBtn.textContent = 'Regen Card';
            regenerateBtn.dataset.action = 'regenerate';
            regenerateBtn.dataset.championId = championId;
            placeholder.parentNode.insertBefore(regenerateBtn, placeholder.nextSibling);
        }
    });
}

// --- END: Admin Functionality ---

// --- START: Filter & Sort Logic ---

function readFiltersFromURL() {
    const params = new URLSearchParams(window.location.search);
    activeFilters.search = params.get('search') || '';
    activeFilters.sort = params.get('sort') || 'name_asc';
    activeFilters.isHealer = params.get('healer') === 'true';
    activeFilters.class = new Set(params.get('class')?.split(',').filter(Boolean) || []);
    activeFilters.rarity = new Set(params.get('rarity')?.split(',').filter(Boolean) || []);
    activeFilters.synergy = params.get('synergy')?.split(',').filter(Boolean) || [];
}

function updateFilterControlsFromState() {
    DOM.searchInput.value = activeFilters.search;
    DOM.healerFilterBtn.classList.toggle('active', activeFilters.isHealer);

    document.querySelectorAll('[data-group="class"]').forEach(btn => {
        btn.classList.toggle('active', activeFilters.class.has(btn.dataset.value));
    });
    document.querySelectorAll('[data-group="rarity"]').forEach(btn => {
        btn.classList.toggle('active', activeFilters.rarity.has(btn.dataset.value));
    });

    if (synergyPillbox) synergyPillbox.setSelected(activeFilters.synergy);
    if (sortDropdown) sortDropdown.setValue(activeFilters.sort);
}

function applyFiltersAndSort() {
    const params = new URLSearchParams();

    activeFilters.search = DOM.searchInput.value.toLowerCase();
    if (activeFilters.search) params.set('search', activeFilters.search);
    
    if (sortDropdown) {
        activeFilters.sort = sortDropdown.getValue();
        if(activeFilters.sort !== 'name_asc') params.set('sort', activeFilters.sort);
    }
    
    if (synergyPillbox) {
        activeFilters.synergy = synergyPillbox.getSelectedValues();
        if (activeFilters.synergy.length > 0) params.set('synergy', activeFilters.synergy.join(','));
    }

    if (activeFilters.isHealer) params.set('healer', 'true');
    if (activeFilters.class.size > 0) params.set('class', [...activeFilters.class].join(','));
    if (activeFilters.rarity.size > 0) params.set('rarity', [...activeFilters.rarity].join(','));

    history.pushState({}, '', `${window.location.pathname}?${params.toString()}`);

    let filteredChampions = ALL_CHAMPIONS.filter(c => {
        const searchMatch = !activeFilters.search || c.name.toLowerCase().includes(activeFilters.search);
        const classMatch = activeFilters.class.size === 0 || activeFilters.class.has(c.class);
        const rarityMatch = activeFilters.rarity.size === 0 || activeFilters.rarity.has(c.baseRarity);
        const synergyMatch = activeFilters.synergy.length === 0 || (c.inherentSynergies && activeFilters.synergy.every(s => c.inherentSynergies.includes(s)));
        const healerMatch = !activeFilters.isHealer || c.isHealer === true;
        return searchMatch && classMatch && rarityMatch && synergyMatch && healerMatch;
    });

    filteredChampions.sort((a, b) => {
        switch (activeFilters.sort) {
            case 'name_desc': return b.name.localeCompare(a.name);
            case 'rarity_desc': return (RARITY_ORDER[b.baseRarity] || 0) - (RARITY_ORDER[a.baseRarity] || 0);
            case 'rarity_asc': return (RARITY_ORDER[a.baseRarity] || 0) - (RARITY_ORDER[b.baseRarity] || 0);
            case 'name_asc':
            default: return a.name.localeCompare(b.name);
        }
    });
    
    renderChampions(filteredChampions);
}

function handleFilterClick(e) {
    const button = e.target.closest('.filter-btn, .class-filter-btn');
    if (!button) return;

    if (button.id === 'healer-filter-btn') {
        activeFilters.isHealer = !activeFilters.isHealer;
        button.classList.toggle('active', activeFilters.isHealer);
        logAnalyticsEvent('filter_change', { filter_group: 'isHealer', filter_value: activeFilters.isHealer });
    
    } else if (button.id === 'reset-filters-btn') {
        resetAllFilters();
        return;

    } else {
        const group = button.dataset.group;
        const value = button.dataset.value;
        if (!group || !value) return;

        if (activeFilters[group].has(value)) {
            activeFilters[group].delete(value);
            button.classList.remove('active');
        } else {
            activeFilters[group].add(value);
            button.classList.add('active');
        }
        logAnalyticsEvent('filter_change', { filter_group: group, filter_value: value, is_active: activeFilters[group].has(value) });
    }
    
    applyFiltersAndSort();
}

function createSynergyPillbox() {
    const container = DOM.synergyContainer;
    container.innerHTML = `<div class="pills-input-wrapper" tabindex="0">
                                <input type="text" id="synergy-search-input" placeholder="Select synergies...">
                           </div>
                           <div class="custom-options-panel hidden"></div>`;
    
    const inputWrapper = container.querySelector('.pills-input-wrapper');
    const searchInput = container.querySelector('#synergy-search-input');
    const optionsPanel = container.querySelector('.custom-options-panel');

    const synergyNames = Object.values(ALL_SYNERGIES).map(s => s.name).sort();
    let state = { available: [...synergyNames], selected: [] };

    const render = () => {
        inputWrapper.querySelectorAll('.pill').forEach(p => p.remove());
        state.selected.forEach(value => {
            const pill = document.createElement('div');
            pill.className = 'pill';
            pill.innerHTML = `${getSynergyIcon(value)}<span>${value}</span>`;
            const removeBtn = document.createElement('button');
            removeBtn.className = 'pill-remove';
            removeBtn.innerHTML = '&times;';
            removeBtn.onclick = (e) => { e.stopPropagation(); deselect(value); };
            pill.appendChild(removeBtn);
            inputWrapper.insertBefore(pill, searchInput);
        });

        optionsPanel.innerHTML = '';
        const filteredOptions = state.available.filter(opt => opt.toLowerCase().includes(searchInput.value.toLowerCase()));
        
        filteredOptions.forEach(value => {
            const optionEl = document.createElement('div');
            optionEl.className = 'custom-option';
            optionEl.innerHTML = `${getSynergyIcon(value)}<span>${value}</span>`;
            optionEl.onclick = () => select(value);
            optionsPanel.appendChild(optionEl);
        });
    };

    const select = (value) => {
        state.selected.push(value);
        state.available = state.available.filter(v => v !== value);
        searchInput.value = '';
        render();
        logAnalyticsEvent('filter_change', { filter_group: 'synergy', filter_value: value, is_active: true });
        applyFiltersAndSort();
        searchInput.focus();
    };

    const deselect = (value) => {
        state.selected = state.selected.filter(v => v !== value);
        state.available.push(value);
        state.available.sort();
        render();
        logAnalyticsEvent('filter_change', { filter_group: 'synergy', filter_value: value, is_active: false });
        applyFiltersAndSort();
    };

    inputWrapper.addEventListener('click', () => {
        optionsPanel.classList.remove('hidden');
        searchInput.focus();
    });
    searchInput.addEventListener('input', render);
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            optionsPanel.classList.add('hidden');
        }
    });

    render();

    return {
        getSelectedValues: () => state.selected,
        reset: () => {
            state = { available: [...synergyNames], selected: [] };
            render();
        },
        setSelected: (selectedValues) => {
            state.selected = selectedValues.filter(v => synergyNames.includes(v));
            state.available = synergyNames.filter(v => !state.selected.includes(v));
            render();
        }
    };
}

function createSortDropdown() {
    const container = DOM.sortSelectContainer;
    container.innerHTML = ''; 

    const options = [
        { value: 'name_asc', label: 'Name (A-Z)' },
        { value: 'name_desc', label: 'Name (Z-A)' },
        { value: 'rarity_desc', label: 'Rarity (Highest First)' },
        { value: 'rarity_asc', label: 'Rarity (Lowest First)' },
    ];
    let state = {
        isOpen: false,
        selectedValue: activeFilters.sort,
    };

    const trigger = document.createElement('button');
    trigger.className = 'custom-select-trigger';

    const optionsPanel = document.createElement('div');
    optionsPanel.className = 'custom-select-options hidden';

    const updateTriggerText = () => {
        const selectedOption = options.find(opt => opt.value === state.selectedValue);
        trigger.textContent = selectedOption ? selectedOption.label : 'Select...';
    };

    const updateSelectedOptionClass = () => {
        optionsPanel.querySelectorAll('.custom-select-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.value === state.selectedValue);
        });
    };
    
    const select = (value) => {
        state.selectedValue = value;
        state.isOpen = false;
        container.classList.remove('is-open');
        optionsPanel.classList.add('hidden');
        
        updateTriggerText();
        updateSelectedOptionClass();

        logAnalyticsEvent('sort_change', { sort_by: value });
        applyFiltersAndSort();
    };

    const toggle = () => {
        state.isOpen = !state.isOpen;
        container.classList.toggle('is-open', state.isOpen);
        optionsPanel.classList.toggle('hidden', !state.isOpen);
    };

    options.forEach(opt => {
        const optionEl = document.createElement('div');
        optionEl.className = 'custom-select-option';
        optionEl.dataset.value = opt.value;
        optionEl.textContent = opt.label;
        optionEl.addEventListener('click', () => select(opt.value));
        optionsPanel.appendChild(optionEl);
    });
    
    trigger.addEventListener('click', toggle);
    
    container.appendChild(trigger);
    container.appendChild(optionsPanel);

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target) && state.isOpen) {
            toggle();
        }
    });

    updateTriggerText();
    updateSelectedOptionClass();

    return {
        getValue: () => state.selectedValue,
        setValue: (value) => {
            state.selectedValue = options.some(o => o.value === value) ? value : 'name_asc';
            updateTriggerText();
            updateSelectedOptionClass();
        }
    };
}

function resetAllFilters() {
    activeFilters = { search: '', sort: 'name_asc', class: new Set(), rarity: new Set(), synergy: [], isHealer: false };
    updateFilterControlsFromState();
    applyFiltersAndSort();
    logAnalyticsEvent('reset_filters');
}

function populateFilters() {
    const classes = [...new Set(ALL_CHAMPIONS.map(c => c.class).filter(Boolean))].sort();
    const rarities = ['Epic', 'Legendary', 'Mythic', 'Limited Mythic', 'Iconic'];

    DOM.classFiltersContainer.innerHTML = classes.map(c => 
        `<button class="class-filter-btn" data-group="class" data-value="${c}" title="${c}">${getClassIcon(c)}</button>`
    ).join('');

    DOM.rarityFiltersContainer.innerHTML = rarities.map(r => 
        `<button class="filter-btn" data-group="rarity" data-value="${r}">${r}</button>`
    ).join('');

    synergyPillbox = createSynergyPillbox();
    sortDropdown = createSortDropdown();
}

// --- END: Filter & Sort Logic ---

// --- START: Data Fetching and Initialization ---

function handleDirectLink() {
    const params = new URLSearchParams(window.location.search);
    const championName = params.get('search');

    if (championName) {
        const champion = ALL_CHAMPIONS.find(c => c.name.toLowerCase() === championName.toLowerCase());
        
        if (champion) {
            setTimeout(() => {
                showDossierModal(champion.id);
            }, 100);
        } else {
            dispatchNotification(`Champion "${championName}" not found.`, 'warning');
        }
    }
}

async function fetchCollectionsFromFirestore() {
    console.log("Fetching fresh data from Firestore...");
    const basePath = 'artifacts/dc-dark-legion-builder/public/data';
    
    const championsRef = collection(db, `${basePath}/champions`);
    const comicsRef = collection(db, `${basePath}/characterComics`);
    const synergiesRef = collection(db, `${basePath}/synergies`);

    const [championsSnap, comicsSnap, synergiesSnap] = await Promise.all([
        getDocs(championsRef),
        getDocs(comicsRef),
        getDocs(synergiesRef)
    ]);

    const championsData = championsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const comicsData = {};
    comicsSnap.docs.forEach(doc => { comicsData[doc.id] = { id: doc.id, ...doc.data() }});
    const synergiesData = {};
    synergiesSnap.docs.forEach(doc => { synergiesData[doc.id] = { id: doc.id, ...doc.data() }});

    const allData = { championsData, comicsData, synergiesData };
    setCachedData(allData);
    return allData;
}

function loadData(data) {
    ALL_CHAMPIONS = data.championsData || [];
    COMICS_DATA = data.comicsData || {};
    ALL_SYNERGIES = data.synergiesData || {};
    populateFilters();
    updateFilterControlsFromState();
    applyFiltersAndSort();
}

async function init() {
    try {
        readFiltersFromURL();
        const cachedData = getCachedData();

        if (cachedData) {
            loadData(cachedData);
            showLoading(false);
        } else {
            showLoading(true);
            const firestoreData = await fetchCollectionsFromFirestore();
            loadData(firestoreData);
            showLoading(false);
        }
        handleDirectLink();
    } catch (error) {
        console.error("Failed to load champion data:", error);
        if (DOM.grid) {
            DOM.grid.innerHTML = `<p class="text-center text-red-400 col-span-full">Failed to load champion data. Please try again later.</p>`;
        }
        showLoading(false);
    }
}

// --- END: Data Fetching and Initialization ---

// --- START: Roster and Role Association ---

async function fetchUserRoles(uid) {
    if (!db || !uid) return;
    const userDocRef = doc(db, `artifacts/dc-dark-legion-builder/users/${uid}`);
    try {
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists() && docSnap.data().roles) {
            currentUserRoles = docSnap.data().roles;
        } else {
            currentUserRoles = [];
        }
    } catch (error) {
        console.error("Error fetching user roles:", error);
        currentUserRoles = [];
    }
}

async function fetchUserRoster(uid) {
    if (!db || !uid) return;
    const rosterRef = doc(db, `artifacts/dc-dark-legion-builder/users/${uid}/roster/myRoster`);
    try {
        const rosterSnap = await getDoc(rosterRef);
        if (rosterSnap.exists()) {
            const rosterData = rosterSnap.data();
            const championIds = rosterData.champions?.map(c => c.dbChampionId) || [];
            USER_ROSTER_IDS = new Set(championIds);
        } else {
            USER_ROSTER_IDS.clear();
        }
    } catch (error) {
        console.error("Error fetching user roster:", error);
        USER_ROSTER_IDS.clear();
    }
    updateAllRosterButtons();
}

function updateAllRosterButtons() {
    document.querySelectorAll('.roster-button-placeholder').forEach(placeholder => {
        const championId = placeholder.dataset.championId;
        const championName = placeholder.dataset.championName;
        const rosterButton = document.createElement('a');
        rosterButton.className = 'card-action-btn';
        if (USER_ROSTER_IDS.has(championId)) {
            rosterButton.href = `teams.html?search=${championName}`;
            rosterButton.textContent = 'View in Roster';
        } else {
            rosterButton.href = `teams.html?addChampion=${championId}`;
            rosterButton.textContent = 'Add to Roster';
        }
        placeholder.replaceWith(rosterButton);
    });
}

function updateUserSpecificUI() {
    updateAdminUI();
    updateAllRosterButtons();
}

// --- END: Roster and Role Association ---

// --- START: Grid/List View Rendering ---

function renderGridView(championsToRender) {
    if (!DOM.grid) return;
    DOM.grid.innerHTML = '';
    DOM.grid.classList.remove('is-list-view');
    if (championsToRender.length === 0) {
        DOM.grid.innerHTML = `<p class="text-center text-blue-200 col-span-full">No champions match the current filters.</p>`;
        return;
    }
    championsToRender.forEach(champion => {
        const card = createChampionCard(champion);
        DOM.grid.appendChild(card);
    });
    updateUserSpecificUI();
}

function renderListView(championsToRender) {
    if (!DOM.grid) return;
    DOM.grid.innerHTML = '';
    DOM.grid.classList.add('is-list-view');
    if (championsToRender.length === 0) {
        DOM.grid.innerHTML = `<p class="text-center text-blue-200 col-span-full">No champions match the current filters.</p>`;
        return;
    }
    championsToRender.forEach(champion => {
        const listItem = createChampionListItem(champion);
        DOM.grid.appendChild(listItem);
    });
}

function renderChampions(championsToRender) {
    currentChampionList = championsToRender; 
    if (currentViewMode === 'list') {
        renderListView(championsToRender);
    } else {
        renderGridView(championsToRender);
    }
}

function handleViewChange(e) {
    const selectedView = e.currentTarget.dataset.view;
    if (selectedView === currentViewMode) return;
    currentViewMode = selectedView;
    DOM.viewGridBtn.classList.toggle('active', currentViewMode === 'grid');
    DOM.viewListBtn.classList.toggle('active', currentViewMode === 'list');
    renderChampions(currentChampionList); 
}

// --- END: Grid/List View Rendering ---

// --- START: Event Listeners ---

document.addEventListener('firebase-ready', () => {
    try {
        showLoading(true);
        const app = getApp();
        db = getFirestore(app);
        analytics = getAnalytics(app);
        functions = getFunctions(app);
        auth = getAuth(app);
        
        onAuthStateChanged(auth, async (user) => {
            currentUserId = user ? user.uid : null;
            if (user && !user.isAnonymous) {
                await fetchUserRoles(user.uid);
                await fetchUserRoster(user.uid);
            } else {
                USER_ROSTER_IDS.clear();
                currentUserRoles = [];
            }
            updateUserSpecificUI();
        });

        logAnalyticsEvent('page_view', { page_title: document.title, page_path: '/codex.html' });
        init();
    } catch (e) {
        console.error("Codex Page: Firebase initialization failed.", e);
        showLoading(false);
    }
}, { once: true });

// Modal Close Listeners
DOM.comicModalClose.addEventListener('click', hideComicModal);
DOM.comicModalBackdrop.addEventListener('click', (e) => {
    if (e.target === DOM.comicModalBackdrop) hideComicModal();
});
DOM.dossierModalClose.addEventListener('click', hideDossierModal);
DOM.dossierModalBackdrop.addEventListener('click', (e) => {
    if (e.target === DOM.dossierModalBackdrop) hideDossierModal();
});

// Confirmation Modal Listeners
confirmationModal.confirmBtn.addEventListener('click', () => confirmationModal.hide(true));
confirmationModal.cancelBtn.addEventListener('click', () => confirmationModal.hide(false));
confirmationModal.backdrop.addEventListener('click', (e) => {
    if (e.target === confirmationModal.backdrop) confirmationModal.hide(false);
});

// Attach listeners for Dossier tabs directly
DOM.dossierRightColumn.querySelectorAll('.dossier-tab-btn').forEach(btn => {
    btn.addEventListener('click', handleTabClick);
});

// Delegated Event Listener for Card Actions
DOM.grid.addEventListener('click', (e) => {
    const button = e.target.closest('.card-action-btn');
    if (!button) return;
    e.stopPropagation();

    const action = button.dataset.action;
    const card = button.closest('.champion-card');
    const championId = card.dataset.championId;

    switch (action) {
        case 'dossier':
            showDossierModal(championId);
            break;
        case 'comic':
            showComicModal(championId);
            break;
        case 'download':
            button.textContent = 'Generating...';
            button.disabled = true;
            generateAndUploadCardImage(championId, false).finally(() => {
                button.textContent = 'Download Card';
                button.disabled = false;
            });
            break;
        case 'regenerate':
            button.textContent = 'Working...';
            button.disabled = true;
            generateAndUploadCardImage(championId, true).finally(() => {
                button.textContent = 'Regen Card';
                button.disabled = false;
            });
            break;
    }
});

// Filter & View Listeners
DOM.filterControls.addEventListener('click', handleFilterClick);
DOM.searchInput.addEventListener('input', () => applyFiltersAndSort());
DOM.viewGridBtn.addEventListener('click', handleViewChange);
DOM.viewListBtn.addEventListener('click', handleViewChange);

// Admin Listeners
if (DOM.bulkRegenAllBtn) {
    DOM.bulkRegenAllBtn.addEventListener('click', () => handleBulkRegenerate(false));
}
if (DOM.bulkRegenOverwriteBtn) {
    DOM.bulkRegenOverwriteBtn.addEventListener('click', () => handleBulkRegenerate(true));
}

// --- END: Event Listeners ---
