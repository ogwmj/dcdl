/**
 * @file js/squads/ui.js
 * @description Handles all UI interactions, rendering, and analytics for the dynamic squads page.
 * @version 2.0.0 (With Filtering & Sorting)
 */

// --- MODULES & GLOBALS ---
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, runTransaction, getDoc, addDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- CONFIG & SETUP ---
const SQUADS_PER_PAGE = 6;
const CACHE_KEY = 'squads_data_cache';
const CACHE_KEY_HOURS = 24;
const CACHE_DURATION_MS = CACHE_KEY_HOURS * 60 * 60 * 1000;
let ALL_DATA = {};
let db, analytics, auth, currentUser, userRoles = [], currentUsername;
let isEditMode = false;
let currentEditingSquadId = null;

// --- NEW: FILTER STATE & DATA ---
let activeFilters = {
    search: '',
    sort: 'newest',
    creator: '',
    synergies: [],
    champions: [],
};
let currentSquadList = []; // This will hold the filtered & sorted list

const listContainer = document.getElementById('squad-list-container');
const detailContainer = document.getElementById('squad-detail-container');
const createSquadModal = document.getElementById('create-squad-modal');

// --- FILTER CONTROL DOM ELEMENTS ---
const filterControlsContainer = document.getElementById('filter-controls');
const searchInput = document.getElementById('search-input');
const sortSelectContainer = document.getElementById('sort-select-container');
const creatorSelectContainer = document.getElementById('creator-select-container');
const synergyContainer = document.getElementById('synergy-multiselect-container');
const championContainer = document.getElementById('champion-multiselect-container');
const resetFiltersBtn = document.getElementById('reset-filters-btn');
const createSquadBtnContainer = document.getElementById('create-squad-btn-container');

// --- DATA HANDLING ---

/**
 * Fetches a single collection from Firestore and returns its documents as an array of objects.
 * @param {string} collectionName - The name of the collection to fetch.
 * @returns {Promise<Array<Object>>} - A promise that resolves to an array of document data.
 */
async function fetchCollection(collectionName) {
    const collectionPath = `artifacts/dc-dark-legion-builder/public/data/${collectionName}`;
    const querySnapshot = await getDocs(collection(db, collectionPath));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Fetches all necessary data from Firestore, using a localStorage cache to avoid frequent reads.
 * Now includes fetching all user data for creator filters.
 */
async function loadAllDataFromFirestore() {
    const cachedItem = localStorage.getItem(CACHE_KEY);
    if (cachedItem) {
        try {
            const cachedData = JSON.parse(cachedItem);
            if ((Date.now() - (cachedData.timestamp || 0)) < CACHE_DURATION_MS && cachedData.data) {
                ALL_DATA = cachedData.data;
                return;
            }
        } catch (e) { console.error("Cache parse failed:", e); }
    }
    try {
        const [squads, champions, synergies, effects, legacyPieces] = await Promise.all([
            fetchCollection('squads'), fetchCollection('champions'), fetchCollection('synergies'),
            fetchCollection('effects'), fetchCollection('legacyPieces')
        ]);
        ALL_DATA = { squads, champions, synergies, effects, legacyPieces };
        localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: ALL_DATA }));
    } catch (error) { console.error("Failed to load data from Firestore:", error); }
}
// --- SEO HANDLING ---

/**
 * Updates the page's SEO meta tags for a specific squad.
 * @param {object} squad - The squad object containing details.
 */
function updateSeoTags(squad) {
    const title = `DC: Dark Legion - ${squad.name} Squad Guide`;
    const description = squad.shortDescription;
    const url = `https://dcdl-companion.com/squads.html?id=${squad.id}`;

    document.title = title;
    
    // Helper to update a meta tag's content
    const updateMeta = (selector, content) => {
        const el = document.querySelector(selector);
        if (el) el.setAttribute('content', content);
    };

    updateMeta('meta[name="description"]', description);
    updateMeta('meta[property="og:title"]', title);
    updateMeta('meta[property="og:description"]', description);
    updateMeta('meta[property="og:url"]', url);
    updateMeta('meta[name="twitter:title"]', title);
    updateMeta('meta[name="twitter:description"]', description);

    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) canonicalLink.setAttribute('href', url);
}

/**
 * Resets SEO meta tags to their default values for the list view.
 */
function resetSeoTags() {
    const title = 'DC: Dark Legion - Squads';
    const description = 'An in-depth guide to DC: Dark Legion team compositions. Explore top-tier squads, strategies, synergies, and skill breakdowns.';
    const url = 'https://dcdl-companion.com/squads.html';

    document.title = title;

    const updateMeta = (selector, content) => {
        const el = document.querySelector(selector);
        if (el) el.setAttribute('content', content);
    };

    updateMeta('meta[name="description"]', description);
    updateMeta('meta[property="og:title"]', title);
    updateMeta('meta[property="og:description"]', description);
    updateMeta('meta[property="og:url"]', url);
    updateMeta('meta[name="twitter:title"]', title);
    updateMeta('meta[name="twitter:description"]', description);

    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) canonicalLink.setAttribute('href', url);
}

// --- NEW: CUSTOM UI COMPONENT FACTORIES ---

/**
 * Creates a fully styled, custom select dropdown component.
 * @param {Object} config - Configuration object.
 */
function createCustomSelect({ container, options, selectedValue, onChange }) {
    const selectedOption = options.find(opt => opt.value === selectedValue) || options[0];
    container.innerHTML = `
        <button type="button" class="custom-select-trigger">${selectedOption.label}</button>
        <div class="custom-select-options" style="display: none;"></div>
    `;
    const trigger = container.querySelector('.custom-select-trigger');
    const optionsPanel = container.querySelector('.custom-select-options');

    const renderOptions = () => {
        optionsPanel.innerHTML = options.map(opt => 
            `<div class="custom-select-option ${opt.value === selectedValue ? 'selected' : ''}" data-value="${opt.value}">${opt.label}</div>`
        ).join('');
    };

    trigger.addEventListener('click', () => {
        const isVisible = optionsPanel.style.display === 'block';
        optionsPanel.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) renderOptions();
    });

    optionsPanel.addEventListener('click', e => {
        if (e.target.matches('.custom-select-option')) {
            const value = e.target.dataset.value;
            onChange(value); // Let the parent handle state change
            trigger.textContent = e.target.textContent; // Update UI
            optionsPanel.style.display = 'none'; // Close
        }
    });

    document.addEventListener('click', e => {
        if (!container.contains(e.target)) optionsPanel.style.display = 'none';
    });
}

// --- FILTERING AND SORTING LOGIC ---

/**
 * Creates an interactive pillbox multi-select component.
 * @param {Object} config - Configuration object.
 * @param {HTMLElement} config.container - The element to populate.
 * @param {Array<Object>} config.options - Array of { value, label } for the dropdown.
 * @param {Array<string>} config.selected - Array of selected values from activeFilters.
 * @param {string} config.placeholder - Placeholder text for the input.
 * @param {Function} config.onChange - Callback function when selections change.
 */
function createPillbox({ container, options, selected, placeholder, onChange }) {
    container.innerHTML = `
        <div class="pills-input-wrapper">
            <div class="pills-container" style="display: contents;"></div>
            <input type="text" placeholder="${placeholder}" class="pill-input">
        </div>
        <div class="custom-options-panel" style="display: none;"></div>
    `;
    const pillsContainer = container.querySelector('.pills-container');
    const input = container.querySelector('.pill-input');
    const optionsPanel = container.querySelector('.custom-options-panel');

    const renderPills = () => {
        pillsContainer.innerHTML = selected.map(value => {
            const option = options.find(opt => opt.value === value);
            // Fallback to the value itself if the label isn't found, to prevent errors
            const label = option ? option.label : value; 
            return `<div class="pill" data-value="${value}">${label}<button class="pill-remove">&times;</button></div>`;
        }).join('');
    };

    const renderOptions = (filter = '') => {
        optionsPanel.innerHTML = options
            .filter(opt => !selected.includes(opt.value) && opt.label.toLowerCase().includes(filter.toLowerCase()))
            .map(opt => `<div class="custom-option" data-value="${opt.value}">${opt.label}</div>`)
            .join('');
    };

    // --- CORRECTED EVENT LISTENERS ---

    // Listener for ADDING a pill
    optionsPanel.addEventListener('click', e => {
        if (e.target.matches('.custom-option')) {
            const value = e.target.dataset.value;
            selected.push(value); // 1. Update the local 'selected' array
            onChange(selected);   // 2. Notify the main app to filter the data

            // 3. Update the component's UI
            renderPills();
            input.value = '';
            optionsPanel.style.display = 'none'; // Close the dropdown
        }
    });

    // Listener for REMOVING a pill
    pillsContainer.addEventListener('click', e => {
        if (e.target.matches('.pill-remove')) {
            const valueToRemove = e.target.parentElement.dataset.value;
            // Create a new array without the removed item
            const newSelected = selected.filter(item => item !== valueToRemove);
            onChange(newSelected); // 1. Notify the main app
            
            // 2. To fix a stale closure issue, we now re-render based on the new array
            selected = newSelected;
            renderPills();
        }
    });

    // Other listeners
    input.addEventListener('focus', () => { renderOptions(); optionsPanel.style.display = 'block'; });
    input.addEventListener('input', () => renderOptions(input.value));
    document.addEventListener('click', e => {
        if (!container.contains(e.target)) {
            optionsPanel.style.display = 'none';
        }
    });

    // Initial render
    renderPills();
}

/**
 * Safely converts a Firestore Timestamp, a plain object, or a date string into a JS Date object.
 * @param {object|string} timestamp - The value to convert.
 * @returns {Date} A valid JavaScript Date object.
 */
function normalizeDate(timestamp) {
    if (!timestamp) return new Date(0); // Return a default epoch date if null/undefined

    // Case 1: It's a true Firestore Timestamp object.
    if (typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
    }
    // Case 2: It's a plain object from the cache with a 'seconds' property.
    if (timestamp.seconds) {
        return new Date(timestamp.seconds * 1000);
    }
    // Case 3: It's already a date string or another parsable format.
    return new Date(timestamp);
}

/**
 * Applies all active filters and sorting to the master squad list,
 * then triggers a re-render of the list view.
 */
function applyFiltersAndSort() {
    if (!ALL_DATA.squads) return;

    let filteredSquads = (ALL_DATA.squads || []).filter(squad => {
        if (!squad.isActive) return false;
        const creatorName = (squad.creatorUsername || '').toLowerCase();
        const searchVal = activeFilters.search.toLowerCase();
        const searchMatch = !searchVal || squad.name.toLowerCase().includes(searchVal) || creatorName.includes(searchVal);
        const creatorMatch = !activeFilters.creator || (squad.creatorUsername === activeFilters.creator);
        const synergyMatch = activeFilters.synergies.length === 0 || activeFilters.synergies.every(synName => squad.activeSynergies.some(sSyn => sSyn.name === synName));
        const championMatch = activeFilters.champions.length === 0 || activeFilters.champions.every(champId => squad.members.some(m => m.dbChampionId === champId));
        return searchMatch && creatorMatch && synergyMatch && championMatch;
    });

    filteredSquads.sort((a, b) => {
        switch (activeFilters.sort) {
            case 'name_asc':
                return a.name.localeCompare(b.name);
            case 'name_desc':
                return b.name.localeCompare(a.name);
            case 'popularity':
                const scoreA = (a.thumbsUp || 0) - (a.thumbsDown || 0);
                const scoreB = (b.thumbsUp || 0) - (b.thumbsDown || 0);
                return scoreB - scoreA;
            
            // Now using the robust normalizeDate helper function
            case 'oldest':
                return normalizeDate(a.createdAt) - normalizeDate(b.createdAt);
            
            case 'newest':
            default:
                return normalizeDate(b.createdAt) - normalizeDate(a.createdAt);
        }
    });

    currentSquadList = filteredSquads;
    updateURL();
    renderListView(1);
}

function populateAndAttachFilterHandlers() {
    // 1. Sort Dropdown
    const sortOptions = [
        { value: 'newest', label: 'Sort: Newest First' },
        { value: 'popularity', label: 'Sort: Most Popular' },
        { value: 'name_asc', label: 'Sort: Name (A-Z)' },
        { value: 'name_desc', label: 'Sort: Name (Z-A)' },
        { value: 'oldest', label: 'Sort: Oldest First' } // This option was missing
    ];
    createCustomSelect({
        container: sortSelectContainer,
        options: sortOptions,
        selectedValue: activeFilters.sort,
        onChange: newValue => { activeFilters.sort = newValue; applyFiltersAndSort(); }
    });

    // 2. Creator Dropdown (This section is updated)
    const creatorOptions = [...new Set(ALL_DATA.squads.map(s => s.creatorUsername).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .map(c => ({ value: c, label: c }));

    const finalCreatorOptions = [
        { value: '', label: 'All Creators' },
        ...creatorOptions,
        // Add a visual separator and the special option at the end
        { value: 'separator', label: '─────────────────', disabled: true },
        { value: 'apply-to-be-creator', label: '➡️ Become a Creator...' }
    ];

    createCustomSelect({
        container: creatorSelectContainer,
        options: finalCreatorOptions,
        selectedValue: activeFilters.creator,
        onChange: newValue => {
            // Check for the special value
            if (newValue === 'apply-to-be-creator') {
                // Dispatch a custom event for the feedback widget to hear
                document.dispatchEvent(new CustomEvent('open-creator-application'));
                // Reset the dropdown visually without triggering a filter
                creatorSelectContainer.querySelector('.custom-select-trigger').textContent = 'All Creators';
            } else {
                // Otherwise, perform the filter as usual
                activeFilters.creator = newValue;
                applyFiltersAndSort();
            }
        }
    });
    
    // 3. Synergy Pillbox
    const synergyOptions = ALL_DATA.synergies.map(s => ({ value: s.name, label: s.name })).sort((a,b) => a.label.localeCompare(b.label));
    createPillbox({
        container: synergyContainer, options: synergyOptions, selected: activeFilters.synergies,
        placeholder: "Search for a synergy...",
        onChange: newSelection => { activeFilters.synergies = newSelection; applyFiltersAndSort(); }
    });

    // 4. Champion Pillbox
    const championOptions = ALL_DATA.champions.map(c => ({ value: c.id, label: c.name })).sort((a,b) => a.label.localeCompare(b.label));
    createPillbox({
        container: championContainer, options: championOptions, selected: activeFilters.champions,
        placeholder: "Search for a champion...",
        onChange: newSelection => { activeFilters.champions = newSelection; applyFiltersAndSort(); }
    });

    // 5. Search Input & Reset Button
    searchInput.value = activeFilters.search;
    searchInput.addEventListener('input', () => { activeFilters.search = searchInput.value; applyFiltersAndSort(); });
    resetFiltersBtn.addEventListener('click', () => { window.history.pushState({}, '', window.location.pathname); location.reload(); });
}

/**
 * Updates the URL's query parameters based on the active filters.
 */
function updateURL() {
    const params = new URLSearchParams();
    if (activeFilters.search) params.set('search', activeFilters.search);
    if (activeFilters.sort !== 'newest') params.set('sort', activeFilters.sort);
    if (activeFilters.creator) params.set('creator', activeFilters.creator);
    if (activeFilters.synergies.length > 0) params.set('synergies', activeFilters.synergies.join(','));
    if (activeFilters.champions.length > 0) params.set('champions', activeFilters.champions.join(','));
    
    const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);
}

/**
 * Reads the filters from the current URL on page load.
 */
function readFiltersFromURL() {
    const params = new URLSearchParams(window.location.search);
    activeFilters.search = params.get('search') || '';
    activeFilters.sort = params.get('sort') || 'newest';
    activeFilters.creator = params.get('creator') || '';
    activeFilters.synergies = params.get('synergies')?.split(',') || [];
    activeFilters.champions = params.get('champions')?.split(',') || [];
}

// --- UI RENDERING ---

function generateCreatorProfileHtml(creatorData) {
    const profile = creatorData.creatorProfile || {};
    const socials = profile.socials || {};

    const socialLinks = [
        { key: 'discord', icon: 'fab fa-discord', url: socials.discord },
        { key: 'youtube', icon: 'fab fa-youtube', url: socials.youtube },
        { key: 'twitch', icon: 'fab fa-twitch', url: socials.twitch },
        { key: 'x', icon: 'fab fa-twitter', url: socials.x },
        { key: 'tiktok', icon: 'fab fa-tiktok', url: socials.tiktok },
        { key: 'instagram', icon: 'fab fa-instagram', url: socials.instagram }
    ];

    const socialsHtml = socialLinks
        .filter(link => link.url) // Only include socials that have a URL
        .map(link => `<a href="${link.url}" target="_blank" rel="noopener noreferrer" title="${link.key.charAt(0).toUpperCase() + link.key.slice(1)}"><i class="${link.icon}"></i></a>`)
        .join('');

    return `
        <section class="guide-section mt-8">
            <h2 class="guide-section-title">Squad Creator</h2>
            <div class="creator-card">
                <div class="creator-header">
                    <img src="${profile.logo || '/img/dcdl_logo.png'}" alt="Creator Logo" class="creator-logo" onerror="this.onerror=null;this.src='/img/dcdl_logo.png';">
                    <span class="creator-username">${creatorData.username || 'Anonymous'}</span>
                </div>
                ${profile.description ? `<p class="creator-description">"${profile.description}"</p>` : ''}
                ${socialsHtml ? `<div class="creator-socials">${socialsHtml}</div>` : ''}
            </div>
        </section>
    `;
}

/**
 * Renders the list of all squads with pagination.
 * @param {number} page - The current page number to display.
 */
function renderListView(page = 1) {
    if (!listContainer || !detailContainer) return;
    detailContainer.style.display = 'none';
    listContainer.style.display = 'block';
    resetSeoTags();

    createSquadBtnContainer.innerHTML = '';
    if (userRoles.includes('creator')) {
        const createBtn = document.createElement('button');
        createBtn.id = 'open-create-modal-btn';
        createBtn.className = 'btn-primary text-sm';
        createBtn.textContent = 'Create New Squad';
        createSquadBtnContainer.appendChild(createBtn);
        createBtn.addEventListener('click', openCreateModal);
    }

    if (currentSquadList.length === 0) {
        listContainer.innerHTML = `<div class="text-center py-16"><p class="text-xl text-slate-400">No squads match the current filters.</p></div>`;
        return;
    }

    const totalPages = Math.ceil(currentSquadList.length / SQUADS_PER_PAGE);
    const pagedSquads = currentSquadList.slice((page - 1) * SQUADS_PER_PAGE, page * SQUADS_PER_PAGE);

    const cardsHtml = pagedSquads.map(squad => {
        const memberPortraits = squad.members.map(member => {
            const champion = ALL_DATA.champions.find(c => c.id === member.dbChampionId);
            const imageUrl = champion?.cardImageUrl || '/img/champions/cards/default.png';
            return `<img src="${imageUrl}" alt="${member.name}" title="${member.name}" class="member-portrait" onerror="this.onerror=null;this.src='/img/champions/cards/default.png';">`;
        }).join('');

        const synergyBadges = squad.activeSynergies.map(synergy => {
            const imageName = synergy.name.replace(/\s+/g, '_') + '.png';
            const imageUrl = `/img/factions/${imageName}`;
            return `
                <div class="flex items-center gap-2 bg-slate-800 rounded-full pr-3 py-1">
                    <img src="${imageUrl}" alt="${synergy.name}" title="${synergy.name}" class="w-6 h-6 object-contain" onerror="this.onerror=null;this.src='/img/factions/default.png';">
                    <span class="text-xs font-semibold text-gray-300">${synergy.name}</span>
                </div>
            `;
        }).join('');

        const ratingsHtml = `
            <div class="squad-card-ratings">
                <span class="rating-display" title="${squad.thumbsUp || 0} up-votes">
                    <i class="fas fa-thumbs-up text-green-400"></i>
                    <span>${squad.thumbsUp || 0}</span>
                </span>
                <span class="rating-display" title="${squad.thumbsDown || 0} down-votes">
                    <i class="fas fa-thumbs-down text-red-400"></i>
                    <span>${squad.thumbsDown || 0}</span>
                </span>
            </div>
        `;

        return `
            <a href="?id=${squad.id}" class="squad-list-card">
                <div>
                    <div class="squad-card-header">
                        <h3>${squad.name}</h3>
                        <p>${squad.shortDescription}</p>
                    </div>
                    <div class="squad-card-members">${memberPortraits}</div>
                </div>
                <div class="squad-card-footer mt-auto pt-4">
                    <div class="squad-card-synergies">${synergyBadges}</div>
                    ${ratingsHtml}
                </div>
            </a>
        `;
    }).join('');

    const paginationHtml = `
        <div class="pagination-controls">
            <a href="?page=${page - 1}" id="prev-page" class="pagination-btn ${page === 1 ? 'disabled' : ''}">Previous</a>
            <span class="page-indicator">Page ${page} of ${totalPages}</span>
            <a href="?page=${page + 1}" id="next-page" class="pagination-btn ${page >= totalPages ? 'disabled' : ''}">Next</a>
        </div>`;

    listContainer.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">${cardsHtml}</div>
        ${paginationHtml}
    `;
    
    document.querySelectorAll('.pagination-btn, .squad-list-card').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (btn.classList.contains('disabled')) {
                e.preventDefault();
                return;
            }
            e.preventDefault();
            const url = new URL(e.currentTarget.href);
            history.pushState({}, '', url.search);
            main();
        });
    });
}

/**
 * Renders the detailed view for a single squad.
 * @param {string} squadId - The ID of the squad to display.
 */
async function renderDetailView(squadId) {
    if (!listContainer || !detailContainer) return;
    listContainer.style.display = 'none';
    detailContainer.style.display = 'block';

    const squad = ALL_DATA.squads.find(s => s.id === squadId);
    if (!squad) {
        detailContainer.innerHTML = `<div class="text-center py-20"><h2 class="text-3xl text-white">Squad Not Found</h2><a href="/squads.html" class="mt-4 inline-block pagination-btn">Back to List</a></div>`;
        return;
    }
    
    updateSeoTags(squad);

    let creatorData = null;
    if (squad.originalOwnerId) {
        try {
            const userDocRef = doc(db, `artifacts/dc-dark-legion-builder/users`, squad.originalOwnerId);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                creatorData = userDocSnap.data();
            }
        } catch (error) {
            console.error("Could not fetch creator profile:", error);
        }
    }

    let userVote = null;
    if (currentUser && !currentUser.isAnonymous) {
        const ratingDocRef = doc(db, `artifacts/dc-dark-legion-builder/public/data/squads/${squadId}/ratings`, currentUser.uid);
        const ratingDocSnap = await getDoc(ratingDocRef);
        if (ratingDocSnap.exists()) {
            userVote = ratingDocSnap.data().vote;
        }
    }
    
    const thumbsUp = squad.thumbsUp || 0;
    const thumbsDown = squad.thumbsDown || 0;
    const canVote = currentUser && !currentUser.isAnonymous;
    const ratingHtml = `
        <div id="squad-rating-widget" class="flex items-center gap-4" ${currentUser ? '' : 'title="You must be logged in to vote"'}>
            <button class="rating-btn ${userVote === 1 ? 'active' : ''}" data-vote="1" ${!currentUser ? 'disabled' : ''}>
                <i class="fas fa-thumbs-up"></i>
                <span id="thumbs-up-count">${thumbsUp}</span>
            </button>
            <button class="rating-btn ${userVote === -1 ? 'active' : ''}" data-vote="-1" ${!currentUser ? 'disabled' : ''}>
                <i class="fas fa-thumbs-down"></i>
                <span id="thumbs-down-count">${thumbsDown}</span>
            </button>
        </div>
    `;

    const lineupHtml = squad.members.map(member => {
        const champion = ALL_DATA.champions.find(c => c.id === member.dbChampionId);
        const imageUrl = champion?.cardImageUrl || '/img/champions/cards/default.png';
        const legacyPieceName = member.legacyPiece?.name;
        
        const legacyPieceHtml = (legacyPieceName && legacyPieceName !== 'None')
            ? `<p class="text-purple-400 text-xs font-semibold mt-2 flex items-center justify-center gap-2"><i class="fas fa-gem"></i>${legacyPieceName}</p>`
            : '';

        return `
            <div class="champion-card-enhanced is-small">
                <div class="card-image-container"><img src="${imageUrl}" class="card-avatar-top" onerror="this.onerror=null;this.src='/img/champions/cards/default.png';"></div>
                <div class="card-content-bottom">
                    <h4 class="champion-name">${member.name}</h4>
                    <p class="champion-class">${member.class}</p>
                    ${legacyPieceHtml}
                </div>
            </div>`;
    }).join('');

    const synergyTiersHtml = squad.activeSynergies.map(activeSynergy => {
        const synergyData = ALL_DATA.synergies.find(s => s.name === activeSynergy.name);
        if (!synergyData) return '';
        const tier = synergyData.tiers.find(t => t.countRequired === activeSynergy.appliedAtMemberCount);
        const imageName = activeSynergy.name.replace(/\s+/g, '_') + '.png';
        const imageUrl = `/img/factions/${imageName}`;
        
        return `
            <li class="flex items-start gap-3">
                <img src="${imageUrl}" alt="${activeSynergy.name}" class="w-8 h-8 object-contain flex-shrink-0" onerror="this.onerror=null;this.src='/img/factions/default.png';">
                <div>
                    <span class="font-bold text-white">${activeSynergy.name} (${activeSynergy.appliedAtMemberCount} members)</span>
                    <p class="text-gray-400 text-sm">${tier ? tier.tierDescription : 'Bonus details not found.'}</p>
                </div>
            </li>
        `;
    }).join('');
    
    const rolesHtml = squad.members.map(member => {
        const champion = ALL_DATA.champions.find(c => c.id === member.dbChampionId);
        if (!champion) return `<p>Details for ${member.name} not found.</p>`;
        
        const skillTabs = champion.skills.map((skill, index) => 
            `<button class="skill-tab-btn ${index === 0 ? 'active' : ''}" data-skill="${champion.id}-skill-${index}">${skill.name}</button>`
        ).join('');

        const skillContents = champion.skills.map((skill, index) => {
            const highlightedDesc = skill.description.replace(/\[(.*?)\]/g, (match, p1) => {
                const effect = ALL_DATA.effects.find(e => e.name.toLowerCase() === p1.toLowerCase());
                return effect ? `<strong class="text-amber-400" title="${effect.description}">${match}</strong>` : match;
            });
            return `<div class="skill-tab-content ${index === 0 ? 'active' : ''}" id="${champion.id}-skill-${index}">${highlightedDesc}</div>`
        }).join('');

        return `
            <div class="champion-role-card" data-champion-name="${champion.name}">
                <h3 class="champion-role-title"><span>${champion.class}:</span> ${champion.name}</h3>
                <div class="skill-tabs-container mt-4">
                    <div class="skill-tabs">${skillTabs}</div>
                    <div class="skill-content">${skillContents}</div>
                </div>
            </div>`;
    }).join('');

    const creatorHtml = creatorData ? generateCreatorProfileHtml(creatorData) : '';

    detailContainer.innerHTML = `
        <header class="py-8 md:py-12 text-center">
            <h1 class="text-5xl md:text-7xl font-extrabold mb-4 glowing-text text-white">${squad.name}</h1>
            <p class="text-xl md:text-2xl text-blue-200">${squad.shortDescription}</p>
            <div class="flex justify-center mt-4">${ratingHtml}</div>
        </header>
        <section class="mb-12">
            <h2 class="guide-section-title">The Lineup</h2>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">${lineupHtml}</div>
        </section>
        <section class="guide-section">
            <h2 class="guide-section-title">Strategy & Synergies</h2>
            <div class="guide-text">${squad.longDescription}</div>
            <div class="synergy-breakdown-card">
                <div class="synergy-content">
                    <ul class="synergy-list space-y-4">${synergyTiersHtml}</ul>
                </div>
            </div>
        </section>
        <section class="guide-section">
            <h2 class="guide-section-title mt-8">Role & Skill Analysis</h2>
            <div class="space-y-8">${rolesHtml}</div>
        </section>
        ${creatorHtml}
        <div class="text-center py-20"><a href="/squads.html" class="mt-4 inline-block pagination-btn">Back to List</a></div>
    `;

    let ownerControlsHtml = '';
    if (currentUser && squad.originalOwnerId === currentUser.uid) {
        const isChecked = squad.isActive === true ? 'checked' : '';
        const statusLabel = squad.isActive === true ? 'Active' : 'Inactive';
        const statusClass = squad.isActive === true ? 'active' : 'inactive';

        ownerControlsHtml = `
            <div class="owner-controls">
                <button id="edit-squad-btn" class="btn-primary">Edit Squad</button>
                <div class="status-toggle-container">
                    <span class="status-toggle-label">Squad Status:</span>
                    <label class="switch">
                        <input type="checkbox" id="is-active-toggle" ${isChecked}>
                        <span class="slider round"></span>
                    </label>
                    <span id="status-text" class="${statusClass}">${statusLabel}</span>
                </div>
            </div>
        `;
    }

    // Replace the previous edit button logic with the new ownerControlsHtml
    const headerElement = detailContainer.querySelector('header');
    if (headerElement) {
        const ratingWidgetContainer = headerElement.querySelector('.flex.justify-center.mt-4');
        if (ratingWidgetContainer) {
            // Detach the rating widget to re-insert it later
            ratingWidgetContainer.remove();
            // Add the owner controls, then add the rating widget back
            headerElement.innerHTML += ownerControlsHtml;
            headerElement.appendChild(ratingWidgetContainer);
        } else {
             headerElement.innerHTML += ownerControlsHtml;
        }
    }

    // --- Attach event listeners at the end of the function ---
    const editBtn = document.getElementById('edit-squad-btn');
    if (editBtn) {
        editBtn.addEventListener('click', () => openEditModal(squad));
    }

    const activeToggle = document.getElementById('is-active-toggle');
    if (activeToggle) {
        activeToggle.addEventListener('change', () => handleToggleActiveStatus(squad, activeToggle));
    }

    document.getElementById('squad-rating-widget').addEventListener('click', (e) => {
        const button = e.target.closest('.rating-btn');
        if (button && !button.disabled) {
            handleSquadRating(squadId, parseInt(button.dataset.vote));
        }
    });
    
    setupSkillTabs();
}

/**
 * Handles a user's rating action for a squad using a Firestore transaction.
 * @param {string} squadId The ID of the squad being rated.
 * @param {number} newVote The new vote value (1 for up, -1 for down).
 */
async function handleSquadRating(squadId, newVote) {
    if (!currentUser || currentUser.isAnonymous) {
        document.dispatchEvent(new CustomEvent('show-toast', {
            detail: { message: 'Please log in to rate squads.', type: 'error' }
        }));
        return;
    }

    const squadDocRef = doc(db, `artifacts/dc-dark-legion-builder/public/data/squads`, squadId);
    const ratingDocRef = doc(squadDocRef, 'ratings', currentUser.uid);

    try {
        const finalVoteValue = await runTransaction(db, async (transaction) => {
            const squadDoc = await transaction.get(squadDocRef);
            const ratingDoc = await transaction.get(ratingDocRef);

            if (!squadDoc.exists()) { throw "Squad document does not exist!"; }

            const currentVote = ratingDoc.exists() ? ratingDoc.data().vote : 0;
            let squadData = squadDoc.data();
            squadData.thumbsUp = squadData.thumbsUp || 0;
            squadData.thumbsDown = squadData.thumbsDown || 0;
            
            let voteChange = 0;

            // If user clicks the same vote button again, they are toggling it off.
            if (currentVote === newVote) {
                transaction.delete(ratingDocRef);
                voteChange = 0; // The new vote will be 0 (none)
            } else {
                transaction.set(ratingDocRef, { userId: currentUser.uid, vote: newVote });
                voteChange = newVote;
            }

            // Decrement the old vote count if it exists
            if (currentVote === 1) squadData.thumbsUp -= 1;
            if (currentVote === -1) squadData.thumbsDown -= 1;

            // Increment the new vote count if it's a new vote
            if (voteChange === 1) squadData.thumbsUp += 1;
            if (voteChange === -1) squadData.thumbsDown += 1;
            
            transaction.update(squadDocRef, {
                thumbsUp: squadData.thumbsUp,
                thumbsDown: squadData.thumbsDown
            });
            
            return voteChange;
        });

        // Optimistically update the UI after successful transaction
        const finalSquad = (await getDoc(squadDocRef)).data();
        
        document.getElementById('thumbs-up-count').textContent = finalSquad.thumbsUp || 0;
        document.getElementById('thumbs-down-count').textContent = finalSquad.thumbsDown || 0;
        
        document.querySelectorAll('.rating-btn').forEach(btn => btn.classList.remove('active'));
        if (finalVoteValue !== 0) {
            document.querySelector(`.rating-btn[data-vote="${finalVoteValue}"]`).classList.add('active');
        }

        if(analytics) logEvent(analytics, 'rate_squad', { squad_name: finalSquad.name, rating: finalVoteValue });

    } catch (e) {
        console.error("Rating transaction failed: ", e);
        document.dispatchEvent(new CustomEvent('show-toast', {
            detail: { message: 'Could not save your rating. Please try again.', type: 'error' }
        }));
    }
}

// --- MODAL AND FORM HANDLING ---

/**
 * Initializes the TinyMCE WYSIWYG editor on the textarea.
 */
function initWysiwygEditor(initialContent = '') {
    tinymce.remove('textarea#squad-long-desc');
    tinymce.init({
        selector: 'textarea#squad-long-desc',
        plugins: 'lists link image media table code help wordcount',
        toolbar: 'undo redo | blocks | bold italic | alignleft aligncenter alignright | bullist numlist outdent indent | link image media | code | help',
        skin: 'oxide-dark',
        content_css: 'dark',
        height: 300,
        extended_valid_elements: 'iframe[src|title|width|height|allowfullscreen|frameborder]',
        media_live_embeds: true,
        setup: function(editor) {
            editor.on('init', function() {
                this.setContent(initialContent);
            });
        }
    });
}

function openCreateModal() {
    if (!createSquadModal) return;
    isEditMode = false;
    populateCreateFormSelectors();
    initWysiwygEditor(); 
    createSquadModal.classList.remove('hidden');
    createSquadModal.classList.add('flex');
}

function openEditModal(squad) {
    if (!createSquadModal) return;
    isEditMode = true;
    currentEditingSquadId = squad.id;

    createSquadModal.querySelector('h2').textContent = 'Edit Squad';
    createSquadModal.querySelector('#submit-create-btn').textContent = 'Update Squad';
    
    populateCreateFormSelectors();
    
    const form = document.getElementById('create-squad-form');
    form.querySelector('#squad-name').value = squad.name;
    form.querySelector('#squad-short-desc').value = squad.shortDescription;
    
    for (let i = 0; i < 5; i++) {
        const member = squad.members[i];
        if (member) {
            form.querySelector(`select[name="champion${i+1}"]`).value = member.dbChampionId;
            if (member.legacyPiece) {
                form.querySelector(`select[name="legacyPiece${i+1}"]`).value = member.legacyPiece.id;
            }
        }
    }
    
    initWysiwygEditor(squad.longDescription || '');
    
    createSquadModal.classList.remove('hidden');
    createSquadModal.classList.add('flex');
}

function closeCreateModal() {
    if (!createSquadModal) return;
    tinymce.remove('textarea#squad-long-desc');
    createSquadModal.classList.add('hidden');
    createSquadModal.classList.remove('flex');
    document.getElementById('create-squad-form').reset();
    
    isEditMode = false;
    currentEditingSquadId = null;
    createSquadModal.querySelector('h2').textContent = 'Create New Squad';
    createSquadModal.querySelector('#submit-create-btn').textContent = 'Create Squad';
}

function populateCreateFormSelectors() {
    const { champions, legacyPieces } = ALL_DATA;

    if (!champions || !Array.isArray(champions) || !legacyPieces || !Array.isArray(legacyPieces)) {
        console.error("Champion or Legacy Piece data is not loaded correctly.", ALL_DATA);
        return;
    }

    const membersContainer = document.getElementById('squad-members-container');
    membersContainer.innerHTML = ''; // Clear previous

    for (let i = 1; i <= 5; i++) {
        const memberDiv = document.createElement('div');
        memberDiv.className = 'grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-slate-700 pb-4';
        
        // Champion Selector
        let championOptions = '<option value="">-- Select Champion --</option>';
        champions.sort((a, b) => a.name.localeCompare(b.name)).forEach(champ => {
            championOptions += `<option value="${champ.id}">${champ.name}</option>`;
        });

        // Legacy Piece Selector
        let legacyOptions = '<option value="">-- No Legacy Piece --</option>';
        legacyPieces.sort((a, b) => a.name.localeCompare(b.name)).forEach(piece => {
            legacyOptions += `<option value="${piece.id}">${piece.name}</option>`;
        });

        memberDiv.innerHTML = `
            <div>
                <label class="form-label">Member ${i}</label>
                <select name="champion${i}" class="form-select" required>${championOptions}</select>
            </div>
            <div>
                <label class="form-label">Legacy Piece</label>
                <select name="legacyPiece${i}" class="form-select">${legacyOptions}</select>
            </div>
        `;
        membersContainer.appendChild(memberDiv);
    }
}

async function handleCreateSquadSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    // 1. Validate Short Description for HTML
    const shortDescription = formData.get('shortDescription');
    const htmlTagRegex = /<[a-z][\s\S]*>/i;
    if (htmlTagRegex.test(shortDescription)) {
        showNotification('Short Description cannot contain HTML tags.', 'error');
        return;
    }

    // 2. Gather selections to check for duplicates
    const selectedChampionIds = [];
    const selectedLegacyPieceIds = [];

    for (let i = 1; i <= 5; i++) {
        const championId = formData.get(`champion${i}`);
        const legacyPieceId = formData.get(`legacyPiece${i}`);
        
        if (championId) {
            selectedChampionIds.push(championId);
        }
        // Only check for duplicate legacy pieces if one was actually selected
        if (legacyPieceId) {
            selectedLegacyPieceIds.push(legacyPieceId);
        }
    }

    // 3. Check for duplicate champions
    const uniqueChampions = new Set(selectedChampionIds);
    if (uniqueChampions.size !== selectedChampionIds.length) {
        showNotification('Each champion can only be used once per squad.', 'error');
        return;
    }

    // 4. Check for duplicate legacy pieces
    const uniqueLegacyPieces = new Set(selectedLegacyPieceIds);
    if (uniqueLegacyPieces.size !== selectedLegacyPieceIds.length) {
        showNotification('Each legacy piece can only be equipped by one champion.', 'error');
        return;
    }

    const rawHtmlContent = tinymce.get('squad-long-desc').getContent();

    if (!rawHtmlContent.trim()) {
        showNotification('The "Long Description" cannot be empty.', 'error');
        tinymce.get('squad-long-desc').focus();
        return; // Stop the function
    }

    // Sanitize the HTML content with DOMPurify to prevent XSS attacks
    const sanitizedHtmlContent = DOMPurify.sanitize(rawHtmlContent, {
        USE_PROFILES: { html: true }, // Allows common HTML tags
        ALLOWED_TAGS: ['p', 'b', 'i', 'u', 'strong', 'em', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'img', 'iframe', 'br'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'width', 'height', 'allowfullscreen', 'frameborder', 'style', 'class']
    });

    const members = [];
    for (let i = 1; i <= 5; i++) {
        const championId = formData.get(`champion${i}`);
        const legacyPieceId = formData.get(`legacyPiece${i}`);
        if (!championId) continue;

        const championData = ALL_DATA.champions.find(c => c.id === championId);
        const legacyPieceData = ALL_DATA.legacyPieces.find(lp => lp.id === legacyPieceId);

        members.push({
            dbChampionId: championId,
            name: championData.name,
            class: championData.class,
            legacyPiece: legacyPieceData ? { id: legacyPieceId, name: legacyPieceData.name } : null
        });
    }

    if (members.length !== 5) {
        showNotification("Please select all 5 squad members.", "error");
        return;
    }

    // --- Synergy Calculation (Simplified) ---
    const memberSynergies = members.flatMap(m => ALL_DATA.champions.find(c => c.id === m.dbChampionId)?.inherentSynergies || []);
    const synergyCounts = memberSynergies.reduce((acc, syn) => {
        acc[syn] = (acc[syn] || 0) + 1;
        return acc;
    }, {});
    
    const activeSynergies = Object.entries(synergyCounts).map(([name, count]) => {
        const synergyInfo = ALL_DATA.synergies.find(s => s.name === name);
        const applicableTier = synergyInfo?.tiers.filter(t => t.countRequired <= count).pop();
        return applicableTier ? { name, appliedAtMemberCount: applicableTier.countRequired } : null;
    }).filter(Boolean);

    const squadData = {
        name: form.querySelector('#squad-name').value,
        shortDescription: form.querySelector('#squad-short-desc').value,
        longDescription: sanitizedHtmlContent,
        members: members,
        activeSynergies: activeSynergies,
    };

    if (isEditMode) {
        const originalSquad = ALL_DATA.squads.find(s => s.id === currentEditingSquadId);
        if (!originalSquad) {
            showNotification("Error: Original squad data not found.", "error");
            return;
        }

        const updatePayload = {};
        const allowedKeys = ['name', 'shortDescription', 'longDescription', 'members', 'activeSynergies'];

        for (const key of allowedKeys) {
            if (JSON.stringify(originalSquad[key]) !== JSON.stringify(squadData[key])) {
                updatePayload[key] = squadData[key];
            }
        }

        if (Object.keys(updatePayload).length === 0) {
            showNotification("No changes were detected.", "info");
            closeCreateModal();
            return;
        }

        try {
            const squadDocRef = doc(db, 'artifacts/dc-dark-legion-builder/public/data/squads', currentEditingSquadId);
            await updateDoc(squadDocRef, updatePayload);
            showNotification('Squad updated successfully!', 'success');

            const squadIndex = ALL_DATA.squads.findIndex(s => s.id === currentEditingSquadId);
            if (squadIndex > -1) {
                ALL_DATA.squads[squadIndex] = { ...ALL_DATA.squads[squadIndex], ...updatePayload };
            }
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                data: ALL_DATA
            }));

            renderDetailView(currentEditingSquadId);
            closeCreateModal();
        } catch (error) {
            console.error("Error updating squad:", error);
            showNotification('Failed to update squad. Please check console.', 'error');
        }
    } else {
        const newSquad = {
            name: formData.get('name'),
            shortDescription: formData.get('shortDescription'),
            longDescription: sanitizedHtmlContent,
            members: members,
            activeSynergies: activeSynergies,
            isActive: true,
            originalOwnerId: currentUser.uid,
            creatorUsername: currentUsername,
            createdAt: serverTimestamp(),
            thumbsUp: 0,
            thumbsDown: 0,
        };

        try {
            const squadCollection = collection(db, 'artifacts/dc-dark-legion-builder/public/data/squads');
            await addDoc(squadCollection, newSquad);
            document.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Squad created successfully!', type: 'success' } }));
            closeCreateModal();
            localStorage.removeItem('squads_data_cache'); // Invalidate cache
            setTimeout(() => window.location.reload(), 1000); // Reload to show new squad
        } catch (error) {
            console.error("Error creating squad:", error);
            document.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Failed to create squad.', type: 'error' } }));
        }
    }
}

// --- HELPERS ---

async function handleToggleActiveStatus(squad, checkbox) {
    const newStatus = checkbox.checked;
    const statusText = document.getElementById('status-text');
    checkbox.disabled = true;

    try {
        const squadDocRef = doc(db, 'artifacts/dc-dark-legion-builder/public/data/squads', squad.id);
        await updateDoc(squadDocRef, { isActive: newStatus });

        // Update local data to avoid re-fetch
        const squadIndex = ALL_DATA.squads.findIndex(s => s.id === squad.id);
        if (squadIndex > -1) {
            ALL_DATA.squads[squadIndex].isActive = newStatus;
        }
        localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: ALL_DATA }));

        // Update UI
        statusText.textContent = newStatus ? 'Active' : 'Inactive';
        statusText.className = newStatus ? 'active' : 'inactive';
        showNotification(`Squad status updated to ${newStatus ? 'Active' : 'Inactive'}.`, 'success');

    } catch (error) {
        console.error("Error updating squad status:", error);
        showNotification('Failed to update status.', 'error');
        // Revert checkbox on failure
        checkbox.checked = !newStatus;
    } finally {
        checkbox.disabled = false;
    }
}

// --- UI INTERACTIONS ---


/**
 * @function showNotification
 * @description A helper to dispatch toast notifications.
 */
function showNotification(message, type) {
    const event = new CustomEvent('show-toast', { detail: { message, type } });
    document.dispatchEvent(event);
}

function setupSkillTabs() {
    const skillContainers = document.querySelectorAll('.champion-role-card');
    skillContainers.forEach(container => {
        const championName = container.dataset.championName;
        const tabs = container.querySelectorAll('.skill-tab-btn');
        const contents = container.querySelectorAll('.skill-tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const contentToShow = container.querySelector(`#${tab.dataset.skill}`);
                if (contentToShow) contentToShow.classList.add('active');

                if (analytics) {
                    logEvent(analytics, 'select_skill_tab', {
                        squad_name: document.querySelector('h1.glowing-text').innerText,
                        champion_name: championName,
                        skill_name: tab.innerText.trim()
                    });
                }
            });
        });
    });
}

// --- INITIALIZATION & ROUTING ---

// Replace your existing main function with this one
async function main() {
    if (!db) {
        console.error("Firestore DB not available. Aborting main execution.");
        return;
    }
    
    await loadAllDataFromFirestore();
    
    const urlParams = new URLSearchParams(window.location.search);
    const squadId = urlParams.get('id');
    const listViewHeader = document.getElementById('list-view-header');

    if (squadId) {
        // We are on the detail view: HIDE list header and filters
        filterControlsContainer.style.display = 'none';
        if (listViewHeader) listViewHeader.style.display = 'none';
        
        renderDetailView(squadId);
    } else {
        // We are on the list view: SHOW list header and filters
        filterControlsContainer.style.display = 'block';
        if (listViewHeader) listViewHeader.style.display = 'block';
        
        readFiltersFromURL();
        populateAndAttachFilterHandlers();
        applyFiltersAndSort();
    }
}

// Listen for browser back/forward navigation
window.addEventListener('popstate', main);

document.getElementById('create-squad-form').addEventListener('submit', handleCreateSquadSubmit);
document.getElementById('close-modal-btn').addEventListener('click', closeCreateModal);
document.getElementById('cancel-create-btn').addEventListener('click', closeCreateModal);

document.addEventListener('DOMContentLoaded', () => {
    // 1. First, listen for the 'firebase-ready' event from auth-ui.js
    document.addEventListener('firebase-ready', () => {
        
        // 2. Once Firebase is ready, get the shared services
        try {
            const app = getApp();
            db = getFirestore(app);
            analytics = getAnalytics(app);
            auth = getAuth(app);
        } catch (e) {
            console.error("Squads UI: Failed to get Firebase services.", e);
            return; // Stop if we can't connect
        }

        // 3. Now that 'auth' is defined, set up the auth state listener
        onAuthStateChanged(auth, async (user) => {
            currentUser = user;
            if (user && !user.isAnonymous) {
                const userDocRef = doc(db, "artifacts/dc-dark-legion-builder/users", user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    userRoles = userData.roles || [];
                    currentUsername = userData.username || '';
                } else {
                    userRoles = []; currentUsername = '';
                }
            } else {
                userRoles = []; currentUsername = '';
            }
            
            // 4. Finally, run the main logic for the page
            await main();
        });
    });
});