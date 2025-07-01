/**
 * @file js/codex/ui.js
 * @description Final version with card-based image generation.
 * @version 6.0.0
 */

// --- Firebase & Data ---
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// --- Global Variables ---
let db, analytics, functions;
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

// --- DOM ELEMENTS ---
const DOM = {
    loadingIndicator: document.getElementById('loading-indicator'),
    codexMainContent: document.getElementById('codex-main-content'),
    grid: document.getElementById('codex-grid'),
    modalBackdrop: document.getElementById('comic-modal-backdrop'),
    modalBody: document.getElementById('comic-modal-body'),
    modalClose: document.getElementById('comic-modal-close'),
    modalPrevBtn: document.getElementById('modal-prev-btn'),
    modalNextBtn: document.getElementById('modal-next-btn'),
    filterControls: document.getElementById('filter-controls'),
    searchInput: document.getElementById('search-input'),
    sortSelectContainer: document.getElementById('sort-select-container'),
    classFiltersContainer: document.getElementById('class-filters-container'),
    rarityFiltersContainer: document.getElementById('rarity-filters-container'),
    synergyContainer: document.getElementById('synergy-multiselect-container'),
    healerFilterBtn: document.getElementById('healer-filter-btn'),
    resetFiltersBtn: document.getElementById('reset-filters-btn'),
    grid: document.getElementById('codex-grid'),
    viewGridBtn: document.getElementById('view-grid-btn'),
    viewListBtn: document.getElementById('view-list-btn'),
};

// --- START: Helper & Utility Functions ---

function dispatchNotification(message, type = 'info', duration = 3000) {
    const event = new CustomEvent('show-notification', {
        detail: { message, type, duration },
        bubbles: true,
        composed: true
    });
    document.dispatchEvent(event);
}

/**
 * Shows or hides the skeleton loader for the page.
 * @param {boolean} isLoading - Whether to show the loading indicator.
 */
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
    const item = {
        timestamp: Date.now(),
        data: data
    };
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


// --- START: URL and Filter Logic ---

function updateURL() {
    const params = new URLSearchParams();
    if (activeFilters.search) params.set('search', activeFilters.search);
    if (activeFilters.sort !== 'name_asc') params.set('sort', activeFilters.sort);
    if (activeFilters.isHealer) params.set('healer', 'true');
    if (activeFilters.class.size > 0) params.set('class', [...activeFilters.class].join(','));
    if (activeFilters.rarity.size > 0) params.set('rarity', [...activeFilters.rarity].join(','));
    if (activeFilters.synergy.length > 0) params.set('synergy', activeFilters.synergy.join(','));

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    history.pushState({}, '', newUrl);
}

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
    activeFilters.search = DOM.searchInput.value.toLowerCase();
    activeFilters.sort = sortDropdown ? sortDropdown.getValue() : 'name_asc';
    activeFilters.synergy = synergyPillbox ? synergyPillbox.getSelectedValues() : [];

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
    updateURL();
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
    
    applyFiltersAndSort();
}

function resetAllFilters() {
    activeFilters = { search: '', sort: 'name_asc', class: new Set(), rarity: new Set(), synergy: [], isHealer: false };
    updateFilterControlsFromState();
    applyFiltersAndSort();
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
    sortDropdown = createSortDropdown();
}

// --- END: URL and Filter Logic ---

// --- START: Image Generation ---

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

/**
 * Checks if a resource exists at a given URL by making a lightweight HEAD request.
 * @param {string} url The URL to check.
 * @returns {Promise<boolean>} A promise that resolves to true if the URL exists, false otherwise.
 */
async function checkUrlExists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    console.log('File exists in repository: ', response.ok)
    return response.ok;
  } catch (error) {
    // This catches network errors, etc.
    console.warn(`Could not check URL ${url}:`, error.message);
    return false;
  }
}

async function generateAndUploadCardImage(championId) {
    dispatchNotification('Preparing card...', 'info', 4000);

    const champion = ALL_CHAMPIONS.find(c => c.id === championId);
    const cleanName = sanitizeName(champion.name);

    const championFileNameBase = champion.name.replace(/\s+/g, '');
    const cardImageFileName = `${championFileNameBase}-card.png`;
    const githubRepoUrl = `https://ogwmj.github.io/dcdl/img/champions/cards/${cardImageFileName}`;

    const imageExistsInRepo = await checkUrlExists(githubRepoUrl);

    if (imageExistsInRepo) {
        console.log('Fetching existing card from GitHub.');
        dispatchNotification('Starting download...', 'success', 2000);
        await downloadImage(githubRepoUrl, `${cleanName}-card.png`);
        return;
    }

    if (champion && champion.cardImageUrl) {
        dispatchNotification('Starting download...', 'success', 2000);
        await downloadImage(champion.cardImageUrl, `${cleanName}-card.png`);
        return;
    }

    const cardElement = document.querySelector(`.champion-card[data-champion-id="${championId}"]`);
    if (!cardElement) {
        dispatchNotification('Error finding champion card on page.', 'error', 4000);
        return;
    }

    const downloadButton = cardElement.querySelector('.card-download-btn');
    if (downloadButton) downloadButton.style.display = 'none';

    try {
        const canvas = await html2canvas(cardElement, { useCORS: true, backgroundColor: null });
        const imageDataUrl = canvas.toDataURL('image/png');

        const saveImage = httpsCallable(functions, 'saveChampionCardImage');
        const result = await saveImage({
            championId: champion.id,
            championName: champion.name,
            imageDataUrl: imageDataUrl
        });

        if (champion && result.data.url) {
            champion.cardImageUrl = result.data.url;
        }

        logAnalyticsEvent('generate_card_image', { champion_id: championId });
        dispatchNotification('Card image created! Starting download...', 'success', 2000);
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
        if (downloadButton) downloadButton.style.display = 'flex';
    }
}

// --- END: Image Generation ---

// --- START: Modal and Grid Rendering ---

function createChampionListItem(champion) {
    const cleanName = sanitizeName(champion.name); //
    const item = document.createElement('div');
    const rarityClass = champion.baseRarity.replace(' ', '-');
    item.className = `champion-list-item rarity-${rarityClass}`;
    item.dataset.championId = champion.id;

    let synergyIconsHtml = '';
    if (champion.inherentSynergies && champion.inherentSynergies.length > 0) { //
        synergyIconsHtml = champion.inherentSynergies.map(s => getSynergyIcon(s)).join(''); //
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

    item.addEventListener('click', () => showModal(champion.id)); //
    return item;
}

async function showModal(championId) {
    DOM.modalBackdrop.classList.add('is-visible');
    DOM.modalBody.innerHTML = `<div class="loading-spinner"></div>`;

    const champion = ALL_CHAMPIONS.find(c => c.id === championId);
    if (!champion) {
        DOM.modalBody.innerHTML = `<p class="text-center text-red-500">Champion not found.</p>`;
        return;
    }

    logAnalyticsEvent('view_champion_details', {
        champion_id: champion.id,
        champion_name: champion.name,
    });
    
    // --- Navigation Logic ---
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
        DOM.modalPrevBtn.addEventListener('click', () => showModal(currentChampionList[currentIndex - 1].id));
    }
    if (currentIndex < currentChampionList.length - 1) {
        DOM.modalNextBtn.addEventListener('click', () => showModal(currentChampionList[currentIndex + 1].id));
    }

    const comicId = champion.name.toLowerCase().replace(/\s+/g, '_').replace('two-face', 'two_face');
    const comic = COMICS_DATA[comicId];
    const cleanName = sanitizeName(champion.name);
    
    let mainImageHtml = '';
    let imagePanelCaption = '';

    // --- MODIFIED LOGIC FOR IMAGE LAYERING ---
    if (comic && comic.imageUrl) {
        const comicYear = comic.coverDate ? `(${new Date(comic.coverDate).getFullYear()})` : '';
        // Create two images: a blurred background comic and a crisp foreground portrait
        mainImageHtml = `
            <img src="${comic.imageUrl}" alt="Cover of ${comic.title}" class="comic-featured-image is-background-image" onerror="this.style.display='none'">
            <img src="img/champions/full/${cleanName}.webp" alt="${champion.name}" class="comic-featured-image is-foreground-image">
        `;
        imagePanelCaption = `First Appearance: ${comic.title} #${comic.issueNumber} ${comicYear}`;
    } else {
        // Fallback remains the same
        mainImageHtml = `<img src="img/champions/full/${cleanName}.webp" alt="Artwork of ${champion.name}" class="comic-featured-image" onerror="this.style.display='none'">`;
        imagePanelCaption = `Codex Image`;
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
     
    const relatedChampsContainerId = `panel-related-champs-${Date.now()}`;

    DOM.modalBody.innerHTML = `
        <div class="comic-header"><img src="img/logo_white.webp" alt="Logo" class="comic-header-logo"></div>
        <div class="comic-image-panel">
            ${mainImageHtml}
            <div class="panel-related-champions" id="${relatedChampsContainerId}"></div>
        </div>
        <div class="comic-featuring-title">${imagePanelCaption}</div>
        <h3 class="comic-main-title">${champion.name}</h3>
        <div class="champion-details" style="padding: 0 1.5rem 1rem; color: #1a202c; font-family: 'Inter', sans-serif;">
           <p><strong>Class:</strong> ${champion.class}</p>
           <p><strong>Base Rarity:</strong> ${champion.baseRarity}</p>
           ${synergiesHtml}
        </div>
    `;

    try {
        const relatedChampsRef = collection(db, `artifacts/dc-dark-legion-builder/public/data/champions/${championId}/relatedChampions`);
        const relatedSnap = await getDocs(relatedChampsRef);
        
        if (!relatedSnap.empty) {
            const relatedDocData = relatedSnap.docs[0].data();
            const relatedIds = relatedDocData.championIds;
            if (relatedIds && relatedIds.length > 0) {
                const relatedChampsData = relatedIds.map(id => ALL_CHAMPIONS.find(c => c.id === id)).filter(Boolean);
                if (relatedChampsData.length > 0) {
                    const relatedItemsHtml = relatedChampsData.map(rc => `
                        <div class="related-champion-card" data-id="${rc.id}">
                            <img src="img/champions/avatars/${sanitizeName(rc.name)}.webp" alt="${rc.name}">
                            <span>${rc.name}</span>
                        </div>
                    `).join('');
                    const relatedContainer = document.getElementById(relatedChampsContainerId);
                    if (relatedContainer) {
                        relatedContainer.innerHTML = relatedItemsHtml;
                    }
                }
            }
        }
    } catch (error) {
        console.error("Failed to fetch related champions:", error);
    }
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
    
    const classIconHtml = champion.class ? `<div class="card-class-icon" title="${champion.class}">${getClassIcon(champion.class)}</div>` : '';
    let synergyIconsHtml = '';
    if (champion.inherentSynergies && champion.inherentSynergies.length > 0) {
        synergyIconsHtml = `<div class="card-synergy-icons">${champion.inherentSynergies.map(s => getSynergyIcon(s)).join('')}</div>`;
    }
    
    const downloadBtnHtml = `
        <button class="card-download-btn" data-champion-id="${champion.id}" title="Generate or Download Card Image">
            <svg><use xlink:href="#icon-download"></use></svg>
        </button>
    `;
    
    card.innerHTML = `
        <div class="avatar-bg" style="background-image: url('img/champions/avatars/${cleanName}.webp')"></div>
        ${classIconHtml}
        ${synergyIconsHtml}
        ${downloadBtnHtml} 
        <div class="card-content">
            <div class="name">${champion.name}</div>
            <div class="class">${champion.class || 'N/A'}</div>
        </div>
    `;
    
    card.addEventListener('click', () => showModal(champion.id));
    return card;
}

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
    currentChampionList = championsToRender; //

    if (currentViewMode === 'list') {
        renderListView(championsToRender);
    } else {
        renderGridView(championsToRender);
    }

    // This logic for the download button needs to be re-attached after any render
    // NOTE: Download button is part of the grid card, so it won't appear in list view
    // unless you add it to createChampionListItem().
    document.querySelectorAll('.card-download-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const championId = e.currentTarget.dataset.championId;
            const icon = e.currentTarget;
            icon.classList.add('is-loading');
            generateAndUploadCardImage(championId).finally(() => { //
                icon.classList.remove('is-loading');
            });
        });
    });
}

function handleViewChange(e) {
    const selectedView = e.currentTarget.dataset.view;
    if (selectedView === currentViewMode) return; // Do nothing if already active

    currentViewMode = selectedView;

    // Update button styles
    DOM.viewGridBtn.classList.toggle('active', currentViewMode === 'grid');
    DOM.viewListBtn.classList.toggle('active', currentViewMode === 'list');

    // Re-render the champions with the new view
    renderChampions(currentChampionList); 
}


// --- END: Modal and Grid Rendering ---


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

// --- END: Data Fetching and Initialization ---


// --- START: Event Listeners ---

document.addEventListener('firebase-ready', () => {
    try {
        showLoading(true, "Initializing...");

        const app = getApp();
        db = getFirestore(app);
        analytics = getAnalytics(app);
        functions = getFunctions(app);

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
DOM.searchInput.addEventListener('input', () => applyFiltersAndSort());
DOM.modalBody.addEventListener('click', (e) => {
    const relatedCard = e.target.closest('.related-champion-card');
    if (relatedCard && relatedCard.dataset.id) {
        showModal(relatedCard.dataset.id);
    }
});
DOM.viewGridBtn.addEventListener('click', handleViewChange);
DOM.viewListBtn.addEventListener('click', handleViewChange);

// --- END: Event Listeners ---