/**
 * @file js/codex/ui.js
 * @description Fetches and renders the champions
 * @version 1.0.1 - Fixes analytics variable declaration
 */

// --- Firebase & Data ---
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

// MODIFIED: Added 'analytics' to the declaration
let db, analytics;
let ALL_CHAMPIONS = [];
let ALL_SYNERGIES = {};
let COMICS_DATA = {};
let synergyPillbox = null;

const CACHE_KEY = 'codexData';
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

// --- Filter State ---
let activeFilters = {
    class: new Set(),
    rarity: new Set(),
    synergy: [],
    isHealer: false,
};

/**
 * Shows or hides the main loading indicator for the page.
 * @param {boolean} isLoading - Whether to show the loading indicator.
 * @param {string} [message='Loading...'] - The message to display.
 */
function showLoading(isLoading, message = 'Loading Codex...') {
    if (isLoading) {
        if (DOM.loadingIndicator) {
            DOM.loadingIndicator.querySelector('p').textContent = message;
            DOM.loadingIndicator.classList.remove('hidden');
        }
        if (DOM.codexMainContent) DOM.codexMainContent.classList.add('hidden');
    } else {
        if (DOM.loadingIndicator) DOM.loadingIndicator.classList.add('hidden');
        if (DOM.codexMainContent) DOM.codexMainContent.classList.remove('hidden');
    }
}

/**
 * Safely logs an event to Firebase Analytics if it's initialized.
 * @param {string} eventName - The name of the event to log.
 * @param {object} [params={}] - An object of parameters to associate with the event.
 */
function logAnalyticsEvent(eventName, params = {}) {
    if (analytics) {
        try {
            logEvent(analytics, eventName, params);
        } catch (e) {
            console.warn(`Analytics event "${eventName}" failed:`, e);
        }
    }
}

// --- UTILITY & CACHE FUNCTIONS ---
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
    const item = {
        timestamp: Date.now(),
        data: data
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(item));
}

// --- DOM ELEMENTS ---
const DOM = {
    loadingIndicator: document.getElementById('loading-indicator'),
    codexMainContent: document.getElementById('codex-main-content'),
    grid: document.getElementById('codex-grid'),
    modalBackdrop: document.getElementById('comic-modal-backdrop'),
    modalBody: document.getElementById('comic-modal-body'),
    modalClose: document.getElementById('comic-modal-close'),
    filterControls: document.getElementById('filter-controls'),
    classFiltersContainer: document.getElementById('class-filters-container'),
    rarityFiltersContainer: document.getElementById('rarity-filters-container'),
    synergyContainer: document.getElementById('synergy-multiselect-container'),
    healerFilterBtn: document.getElementById('healer-filter-btn'),
    resetFiltersBtn: document.getElementById('reset-filters-btn'),
};

// --- FILTERS

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

function applyFilters() {
    let filteredChampions = [...ALL_CHAMPIONS];
    activeFilters.synergy = synergyPillbox ? synergyPillbox.getSelectedValues() : [];

    if (activeFilters.class.size > 0) {
        filteredChampions = filteredChampions.filter(c => activeFilters.class.has(c.class));
    }
    if (activeFilters.rarity.size > 0) {
        filteredChampions = filteredChampions.filter(c => activeFilters.rarity.has(c.baseRarity));
    }
    if (activeFilters.synergy.length > 0) {
        filteredChampions = filteredChampions.filter(c =>
            c.inherentSynergies && activeFilters.synergy.every(s => c.inherentSynergies.includes(s))
        );
    }
    if (activeFilters.isHealer) {
        filteredChampions = filteredChampions.filter(c => c.isHealer === true);
    }
    renderGrid(filteredChampions);
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
        logAnalyticsEvent('filter_change', {
            filter_group: group,
            filter_value: value,
            is_active: activeFilters[group].has(value)
        });
    }
    applyFilters();
}

function resetAllFilters() {
    activeFilters = { class: new Set(), rarity: new Set(), synergy: [], isHealer: false };
    DOM.filterControls.querySelectorAll('.active').forEach(b => b.classList.remove('active'));
    if (synergyPillbox) synergyPillbox.reset();
    renderGrid(ALL_CHAMPIONS);
    logAnalyticsEvent('reset_filters');
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
        applyFilters();
        searchInput.focus();
    };

    const deselect = (value) => {
        state.selected = state.selected.filter(v => v !== value);
        state.available.push(value);
        state.available.sort();
        render();
        logAnalyticsEvent('filter_change', { filter_group: 'synergy', filter_value: value, is_active: false });
        applyFilters();
    };

    inputWrapper.addEventListener('click', () => optionsPanel.classList.remove('hidden'));
    searchInput.addEventListener('input', render);
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) optionsPanel.classList.add('hidden');
    });

    render();
    return {
        getSelectedValues: () => state.selected,
        reset: () => {
            state = { available: [...synergyNames], selected: [] };
            render();
        }
    };
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

    synergyPillbox = createSynergyPillbox();
}

function showModal(championId) {
    const champion = ALL_CHAMPIONS.find(c => c.id === championId);
    if (champion) {
        logAnalyticsEvent('view_champion_details', {
            champion_id: champion.id,
            champion_name: champion.name,
        });
    }

    DOM.modalBackdrop.classList.add('is-visible');
    DOM.modalBody.innerHTML = `<div class="loader-spinner" style="border-top-color: #3b82f6;"></div>`;
    
    if (!champion) {
        DOM.modalBody.innerHTML = `<p class="text-center text-red-500">Champion not found.</p>`;
        return;
    }
    
    const comicId = champion.name.toLowerCase().replace(/\s+/g, '_').replace('two-face', 'two_face');
    const comic = COMICS_DATA[comicId];
    const cleanName = sanitizeName(champion.name);
    
    let imagePanelHtml = '';

    if (comic && comic.imageUrl) {
        const comicYear = comic.coverDate ? `(${new Date(comic.coverDate).getFullYear()})` : '';
        imagePanelHtml = `
            <div class="comic-image-panel">
                <a href="${comic.siteUrl}" target="_blank" rel="noopener noreferrer">
                   <img src="${comic.imageUrl}" alt="Cover of ${comic.title}" class="comic-featured-image" onerror="this.closest('.comic-image-panel').style.display='none'">
                </a>
            </div>
            <div class="comic-featuring-title">First Appearance: ${comic.title} #${comic.issueNumber} ${comicYear}</div>
        `;
    } else {
        imagePanelHtml = `
            <div class="comic-image-panel">
               <img src="img/champions/full/${cleanName}.webp" alt="Artwork of ${champion.name}" class="comic-featured-image" onerror="this.closest('.comic-image-panel').style.display='none'">
            </div>
            <div class="comic-featuring-title">Codex Image</div>
        `;
    }

    let synergiesHtml = '';
    if (champion.inherentSynergies && champion.inherentSynergies.length > 0) {
        const synergyItems = champion.inherentSynergies.map(synName => {
            const synergyData = Object.values(ALL_SYNERGIES).find(s => s.name === synName);
            const description = synergyData ? synergyData.description : 'No description available.';
            return `<li class="mt-2"><strong>${synName}</strong>: ${description}</li>`;
        }).join('');
        synergiesHtml = `<div class="comic-featuring-title mt-6">Inherent Synergies</div><ul class="list-disc list-inside">${synergyItems}</ul>`;
    }
     
    DOM.modalBody.innerHTML = `
        <div class="comic-header"><img src="img/logo_white.webp" alt="Logo" class="comic-header-logo"></div>
        ${imagePanelHtml}
        <h3 class="comic-main-title">${champion.name}</h3>
        <div class="champion-details" style="padding: 0 1.5rem 1rem; color: #1a202c; font-family: 'Inter', sans-serif;">
           <p><strong>Class:</strong> ${champion.class}</p>
           <p><strong>Base Rarity:</strong> ${champion.baseRarity}</p>
           ${synergiesHtml}
        </div>
    `;
}

function hideModal() {
    DOM.modalBackdrop.classList.remove('is-visible');
    DOM.modalBody.innerHTML = '';
}

function createChampionCard(champion) {
    const cleanName = sanitizeName(champion.name);
    const card = document.createElement('div');
    
    const rarityBgClass = `rarity-bg-${champion.baseRarity.replace(' ', '-')}`;
    card.className = `champion-card ${rarityBgClass}`;
    
    card.dataset.championId = champion.id;

    // NEW: Generate the class icon HTML
    const classIconHtml = champion.class ? 
        `<div class="card-class-icon" title="${champion.class}">${getClassIcon(champion.class)}</div>` : '';

    // NEW: Generate the synergy icons HTML
    let synergyIconsHtml = '';
    if (champion.inherentSynergies && champion.inherentSynergies.length > 0) {
        synergyIconsHtml = `
            <div class="card-synergy-icons">
                ${champion.inherentSynergies.map(s => getSynergyIcon(s)).join('')}
            </div>
        `;
    }
    
    // MODIFIED: The inner HTML now includes the new icon containers
    card.innerHTML = `
        <div class="avatar-bg" style="background-image: url('img/champions/avatars/${cleanName}.webp')"></div>
        ${classIconHtml}
        ${synergyIconsHtml}
        <div class="card-content">
            <div class="name">${champion.name}</div>
            <div class="class">${champion.class || 'N/A'}</div>
        </div>
    `;
    
    card.addEventListener('click', () => showModal(champion.id));
    return card;
}

function renderGrid(championsToRender) {
    if (!DOM.grid) return;
    DOM.grid.innerHTML = '';

    championsToRender.sort((a, b) => a.name.localeCompare(b.name));

    championsToRender.forEach(champion => {
        const card = createChampionCard(champion);
        DOM.grid.appendChild(card);
    });
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
    renderGrid(ALL_CHAMPIONS);
}

async function init() {
    try {
        const cachedData = getCachedData();
        if (cachedData) {
            console.log("Loading data from cache.");
            loadData(cachedData);
            showLoading(false);
        } else {
            showLoading(true, "Fetching latest game data...");
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

// --- EVENT LISTENERS ---
document.addEventListener('firebase-ready', () => {
    try {
        showLoading(true, "Initializing...");

        const app = getApp();
        db = getFirestore(app);

        analytics = getAnalytics(app);
        logAnalyticsEvent('page_view', { page_title: document.title, page_path: '/codex.html' });
        
        init();
    } catch (e) {
        console.error("Codex Page: Firebase initialization failed.", e);
        if (DOM.grid) {
            DOM.grid.innerHTML = `<p class="text-center text-red-400 col-span-full">Could not connect to services.</p>`;
        }
        showLoading(false);
    }
}, { once: true });

DOM.modalClose.addEventListener('click', hideModal);
DOM.modalBackdrop.addEventListener('click', (e) => {
    if (e.target === DOM.modalBackdrop) {
        hideModal();
    }
});
DOM.filterControls.addEventListener('click', handleFilterClick);