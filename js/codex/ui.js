/**
 * @file js/codex/ui.js
 * @description Corrects Firestore paths for community features.
 * @version 7.8.0
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
const RARITY_ORDER = { 'Epic': 1, 'Legendary': 2, 'Mythic': 3, 'Limited Mythic': 4 };
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
};

// --- START: Helper & Utility Functions ---

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
                    <button class="card-action-btn" data-action="comic">Comic View</button>
                    <button class="card-action-btn" data-action="download">Download Card</button>
                    <div class="roster-button-placeholder" data-champion-id="${champion.id}" data-champion-name="${encodeURIComponent(champion.name)}"></div>
                </div>
            </div>
        </div>
    `;

    card.querySelector('[data-action="dossier"]').addEventListener('click', (e) => {
        e.stopPropagation();
        showDossierModal(champion.id);
    });

    card.querySelector('[data-action="comic"]').addEventListener('click', (e) => {
        e.stopPropagation();
        showComicModal(champion.id);
    });

    card.querySelector('[data-action="download"]').addEventListener('click', (e) => {
        e.stopPropagation();
        const button = e.currentTarget;
        button.textContent = 'Generating...';
        button.disabled = true;
        
        generateAndUploadCardImage(champion.id).finally(() => {
            button.textContent = 'Download Card';
            button.disabled = false;
        });
    });

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

    const skillsHtml = `
        <div class="skill-item">
            <div class="dossier-placeholder-text">
                Detailed skill information, including damage multipliers and upgrade paths, is being compiled and will be added soon.
            </div>
        </div>
    `;

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
        <div>
            <h3 class="dossier-section-title">Skills</h3>
            ${skillsHtml}
        </div>
    `;
}

async function populateCommunityTab(champion) {
    const pane = document.getElementById('dossier-tab-community');
    pane.innerHTML = `<div class="loading-spinner mx-auto"></div>`;

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
            <form id="add-tip-form" class="mt-6">
                <textarea name="tip" placeholder="Share a tip, build, or strategy... (Requires login)" rows="3" ${!currentUserId ? 'disabled' : ''}></textarea>
                <button type="submit" ${!currentUserId ? 'disabled' : ''}>Submit Tip</button>
            </form>
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
    pane.querySelector('#add-tip-form').addEventListener('submit', (e) => handleTipSubmit(e, champion.id));

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
        <div>
            <h3 class="dossier-section-title">Biography</h3>
            ${biographyHtml}
        </div>
    `;
}

// --- END: Modal Logic ---

// --- START: Community Hub Data Functions ---

async function renderCommunityRatings(championId) {
    if (!db) return;
    const ratingsRef = collection(db, `artifacts/dc-dark-legion-builder/public/data/champions/${championId}/communityRatings`);
    const ratingsSnap = await getDocs(ratingsRef);

    const ratingsData = {};
    ratingsSnap.forEach(doc => {
        const data = doc.data();
        if (!ratingsData[data.category]) {
            ratingsData[data.category] = { total: 0, count: 0 };
        }
        ratingsData[data.category].total += data.rating;
        ratingsData[data.category].count++;
    });

    for (const category in ratingsData) {
        const avgRating = ratingsData[category].total / ratingsData[category].count;
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
        tipsHtml += `
            <div class="tip-card">
                <p class="tip-meta">Shared on ${date}</p>
                <p class="tip-text">${tip.text}</p>
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
    if (!currentUserId) {
        dispatchNotification('Please log in to submit a tip.', 'info');
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
        await addDoc(collection(db, `artifacts/dc-dark-legion-builder/public/data/champions/${championId}/playerTips`), {
            userId: currentUserId,
            text: tipText,
            createdAt: serverTimestamp(),
            upvotes: 0
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

async function generateAndUploadCardImage(championId) {
    dispatchNotification('Preparing card...', 'info', 4000);

    const champion = ALL_CHAMPIONS.find(c => c.id === championId);
    const cleanName = sanitizeName(champion.name);

    // First, check if a URL already exists and just download that.
    if (champion && champion.cardImageUrl) {
        dispatchNotification('Starting download...', 'success', 2000);
        await downloadImage(champion.cardImageUrl, `${cleanName}-card.png`);
        return;
    }

    const originalCardElement = document.querySelector(`.champion-card[data-champion-id="${championId}"]`);
    if (!originalCardElement) {
        dispatchNotification('Error finding champion card on page.', 'error', 4000);
        return;
    }

    // --- Start of Corrected Cloning Logic ---

    // Create a clone of the card to manipulate for the screenshot
    const clone = originalCardElement.cloneNode(true);
    const rect = originalCardElement.getBoundingClientRect();

    // Style the clone to be rendered off-screen with correct dimensions.
    // This is the most reliable method for html2canvas.
    clone.style.position = 'absolute';
    clone.style.top = `${window.scrollY}px`; // Position relative to the viewport top
    clone.style.left = '-9999px'; // Move it far off the left side of the screen
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    // No need for z-index or visibility:hidden, as it's already off-screen.

    document.body.appendChild(clone);

    // Find elements within the clone to manipulate
    const cardInner = clone.querySelector('.card-inner');
    const communityAverageEl = clone.querySelector('.community-average');
    const cardBack = clone.querySelector('.card-back');

    // Prepare the clone for a perfect screenshot
    if (communityAverageEl) {
        communityAverageEl.style.display = 'none'; // Hide ratings
    }
    if (cardInner) {
        cardInner.style.transform = 'rotateY(0deg)'; // Ensure front is showing
    }
    if (cardBack) {
        cardBack.style.display = 'none'; // Hide the back to prevent any bleed-through
    }
    
    // --- End of Corrected Cloning Logic ---

    try {
        // Take the screenshot of the prepared clone
        const canvas = await html2canvas(clone, { 
            useCORS: true, 
            backgroundColor: null,
            width: rect.width, // Explicitly set width and height for html2canvas
            height: rect.height,
        });
        const imageDataUrl = canvas.toDataURL('image/png');

        // Call the Firebase function to save the image
        const saveImage = httpsCallable(functions, 'saveChampionCardImage');
        const result = await saveImage({
            championId: champion.id,
            championName: champion.name,
            imageDataUrl: imageDataUrl
        });

        // Update the local champion data with the new URL
        if (champion && result.data.url) {
            champion.cardImageUrl = result.data.url;
        }

        logAnalyticsEvent('generate_card_image', { champion_id: championId });
        dispatchNotification('Card image created! Starting download...', 'success', 2000);
        
        // Download the newly created image
        await downloadImage(result.data.imageDataUrl, `${cleanName}-card.png`);

    } catch (error) {
        if (error.code === 'functions/unauthenticated') {
            console.warn('Guest user tried to generate an image.');
            dispatchNotification('Please log in to generate new card images.', 'info', 5000);
        } else {
            console.error("Failed to call saveChampionCardImage function:", error);
            dispatchNotification('Could not generate or save card image.', 'error');
        }
    } finally {
        // Always remove the clone from the DOM when done
        document.body.removeChild(clone);
    }
}

// --- END: Image Generation & Download ---

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

function resetAllFilters() {
    activeFilters = { search: '', sort: 'name_asc', class: new Set(), rarity: new Set(), synergy: [], isHealer: false };
    updateFilterControlsFromState();
    applyFiltersAndSort();
    logAnalyticsEvent('reset_filters');
}

function populateFilters() {
    const classes = [...new Set(ALL_CHAMPIONS.map(c => c.class).filter(Boolean))].sort();
    const rarities = ['Epic', 'Legendary', 'Mythic', 'Limited Mythic'];

    DOM.classFiltersContainer.innerHTML = classes.map(c => 
        `<button class="class-filter-btn" data-group="class" data-value="${c}" title="${c}">${getClassIcon(c)}</button>`
    ).join('');

    DOM.rarityFiltersContainer.innerHTML = rarities.map(r => 
        `<button class="filter-btn" data-group="rarity" data-value="${r}">${r}</button>`
    ).join('');
}

// --- END: Filter & Sort Logic ---

// --- START: Data Fetching and Initialization ---

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
    } catch (error) {
        console.error("Failed to load champion data:", error);
        if (DOM.grid) {
            DOM.grid.innerHTML = `<p class="text-center text-red-400 col-span-full">Failed to load champion data. Please try again later.</p>`;
        }
        showLoading(false);
    }
}

// --- END: Data Fetching and Initialization ---

// --- START: Roster Association ---

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

// --- END: Roster Association ---

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
    updateAllRosterButtons();
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
        
        onAuthStateChanged(auth, (user) => {
            currentUserId = user ? user.uid : null;
            if (user && !user.isAnonymous) {
                fetchUserRoster(user.uid);
            } else {
                USER_ROSTER_IDS.clear();
                updateAllRosterButtons();
            }
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

// Attach listeners for Dossier tabs directly
DOM.dossierRightColumn.querySelectorAll('.dossier-tab-btn').forEach(btn => {
    btn.addEventListener('click', handleTabClick);
});

// Filter & View Listeners
DOM.filterControls.addEventListener('click', handleFilterClick);
DOM.searchInput.addEventListener('input', () => applyFiltersAndSort());
DOM.viewGridBtn.addEventListener('click', handleViewChange);
DOM.viewListBtn.addEventListener('click', handleViewChange);

// --- END: Event Listeners ---
