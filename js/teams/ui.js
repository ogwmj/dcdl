/**
 * @file js/teams/ui.js
 * @description Handles all UI interactions, event listeners, and data flow for the Team Builder.
 * This script manages the user interface for building a champion roster, calculating optimal teams based on synergies and scores, and managing saved teams.
 * @version 2.0.0
 */

import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, deleteDoc, query, orderBy, addDoc, updateDoc, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { TeamCalculator, GAME_CONSTANTS, ensureIndividualScores } from './core.js';

/**
 * @description A centralized object containing references to all necessary DOM elements.
 * @const {object}
 */
const DOM = {
    loadingIndicator: document.getElementById('loading-indicator'),
    errorIndicator: document.getElementById('error-indicator'),
    errorMessageDetails: document.getElementById('error-message-details'),
    saveRosterIndicator: document.getElementById('save-roster-indicator'),
    mainAppContent: document.getElementById('main-app-content'),
    stepper: document.getElementById('stepper'),
    step1Btn: document.getElementById('step-btn-1'),
    step2Btn: document.getElementById('step-btn-2'),
    step1Content: document.getElementById('step-1-content'),
    step2Content: document.getElementById('step-2-content'),
    rosterFormContainer: document.getElementById('roster-form-container'),
    formModeTitle: document.getElementById('form-mode-title'),
    champSelectDb: document.getElementById('champ-select-db'),
    champStarColor: document.getElementById('champ-star-color'),
    champForceLevel: document.getElementById('champ-force-level'),
    gear: {
        head: document.getElementById('gear-head'),
        arms: document.getElementById('gear-arms'),
        legs: document.getElementById('gear-legs'),
        chest: document.getElementById('gear-chest'),
        waist: document.getElementById('gear-waist'),
    },
    legacyPieceSelect: document.getElementById('legacy-piece-select'),
    legacyPieceStarColor: document.getElementById('legacy-piece-star-color'),
    addUpdateChampionBtn: document.getElementById('add-update-champion-btn'),
    cancelEditBtn: document.getElementById('cancel-edit-btn'),
    customChampDropdown: document.getElementById('custom-champ-dropdown'),
    customChampDropdownTrigger: document.getElementById('custom-champ-dropdown-trigger'),
    customChampDropdownOptions: document.getElementById('custom-champ-dropdown-options'),
    selectedChampImg: document.getElementById('selected-champ-img'),
    selectedChampName: document.getElementById('selected-champ-name'),
    rosterTableContainer: document.getElementById('roster-table-container'),
    rosterEmptyMessage: document.getElementById('roster-empty-message'),
    prefillRosterBtn: document.getElementById('prefill-roster-btn'),
    exportRosterBtn: document.getElementById('export-roster-btn'),
    importRosterBtn: document.getElementById('import-roster-btn'),
    importRosterFile: document.getElementById('import-roster-file'),
    requireHealerCheckbox: document.getElementById('require-healer-checkbox'),
    excludeSavedTeamCheckbox: document.getElementById('exclude-saved-team-checkbox'),
    selectExclusionTeamDropdown: document.getElementById('select-exclusion-team-dropdown'),
    selectSynergyFilterDropdown: document.getElementById('select-synergy-filter-dropdown'),
    calculateBtn: document.getElementById('calculate-btn'),
    resultsOutput: document.getElementById('results-output'),
    savedTeamsList: document.getElementById('saved-teams-list'),
    teamNameModal: document.getElementById('team-name-modal'),
    processingModal: document.getElementById('processing-modal'),
    confirmModal: document.getElementById('confirm-modal'),
    shareTeamModal: document.getElementById('share-team-modal'),
    swapChampionModal: document.getElementById('swap-champion-modal'),
    toastContainer: document.getElementById('toast-container'),
    customTooltip: document.getElementById('custom-tooltip'),
    customLPDropdown: document.getElementById('custom-lp-dropdown'),
    customLPDropdownTrigger: document.getElementById('custom-lp-dropdown-trigger'),
    customLPDropdownOptions: document.getElementById('custom-lp-dropdown-options'),
    selectedLPName: document.getElementById('selected-lp-name'),
    rosterSearchInput: document.getElementById('roster-search-input'),
    rosterFiltersWrapper: document.getElementById('roster-filters-wrapper'),
};

/**
 * @description Global state variables for the application.
 */
let db, auth, analytics, userId;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'dc-dark-legion-builder';
let dbChampions = [], dbSynergies = [], dbLegacyPieces = [];
let playerRoster = [];
let savedTeams = [];
let characterComicsData = new Map();
let editingChampionId = null;
let teamModalCallback = null;
let originalBestTeam = null, currentDisplayedTeam = null;
let champStarSelectorControl = null;
let legacyStarSelectorControl = null;
let currentGearState = {};
let gearGridControl = null;
let forceLevelControl = null;
let synergyMultiSelect = null;
let teamExclusionMultiSelect = null;
let activeFactionFilter = null; 
let activeClassFilter = null;
let activeHealerFilter = false; 
let activeSearchTerm = '';
let shouldScrollToRoster = false;
let urlParamsHandled = false;

// =================================================================================================
// #region INITIALIZATION
// =================================================================================================

document.addEventListener('DOMContentLoaded', initializePage);

/**
 * @description Main entry point for the page. Initializes Firebase, fetches all necessary data,
 * sets up the UI, and handles the initial user session. This new sequence ensures that all
 * static game data is loaded BEFORE any user-specific data is loaded, preventing race conditions.
 * @async
 */
async function initializePage() {
    showLoading(true, "Initializing...");
    try {
        await initializeFirebase();
        logEvent(analytics, 'page_view', { page_title: document.title, page_path: '/teams.html' });
        
        showLoading(true, "Loading Game Data...");

        await Promise.all([
            fetchData('champions', (data) => dbChampions = data),
            fetchData('synergies', (data) => dbSynergies = data.sort((a,b) => a.name.localeCompare(b.name))),
            fetchData('legacyPieces', (data) => dbLegacyPieces = data.sort((a,b) => a.name.localeCompare(b.name))),
            fetchCharacterComics()
        ]);
        
        populateStaticDropdowns();
        synergyMultiSelect = createSynergyMultiSelect(); 
        gearGridControl = createInteractiveGearGrid('interactive-gear-grid');
        champStarSelectorControl = createStarSelector('champ-star-selector-container', 'champ-star-color');
        legacyStarSelectorControl = createStarSelector('legacy-piece-selector-container', 'legacy-piece-star-color');
        forceLevelControl = createForceLevelSelector('force-level-selector', 'champ-force-level');
        attachEventListeners();

        teamExclusionMultiSelect = createTeamExclusionMultiSelect([]);

        onAuthStateChanged(auth, handleUserSession);
    } catch (error) {
        showError("Initialization failed. Please refresh.", error.message);
        logEvent(analytics, 'exception', { description: `init_error: ${error.message}`, fatal: true });
    } finally {
        showLoading(false);
    }
}

/**
 * @description Initializes Firebase services (Auth, Firestore, Analytics).
 * The auth state listener is now attached in initializePage AFTER data is loaded.
 * @returns {Promise<void>} A promise that resolves when Firebase services are ready.
 * @async
 */
async function initializeFirebase() {
    return new Promise((resolve) => {
        document.addEventListener('firebase-ready', () => {
            const app = getApp();
            auth = getAuth(app);
            db = getFirestore(app);
            analytics = getAnalytics(app);
            resolve();
        }, { once: true });
    });
}

/**
 * @description Handles changes in user authentication state (login/logout).
 * Loads user data if logged in, or clears it if logged out.
 * @async
 */
async function handleUserSession() {
    const user = auth.currentUser;
    if (user) {
        if (userId !== user.uid) {
            userId = user.uid;
            showLoading(true, "Loading your data...");
            await loadUserData();
            loadComicEnhancements();
        }
    } else {
        userId = null;
        playerRoster = [];
        savedTeams = [];
        renderRosterGrid();
        renderSavedTeams(new Map());
        populateChampionSelect();
    }

    if (!urlParamsHandled) {
        handleUrlParameters(); //
        urlParamsHandled = true;
    }
}

/**
 * @description A generic function to fetch a collection from Firestore.
 * @param {string} collectionName - The name of the collection to fetch.
 * @param {Function} stateUpdater - A callback function to update the global state with the fetched data.
 * @async
 */
async function fetchData(collectionName, stateUpdater) {
    if (!db) throw new Error("Firestore not initialized");
    try {
        const q = query(collection(db, `artifacts/${appId}/public/data/${collectionName}`));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        stateUpdater(data);
    } catch (error) {
        console.error(`Error fetching ${collectionName}:`, error);
        throw new Error(`Could not load ${collectionName}.`);
    }
}

/**
 * @description Fetches character comic data used for card backgrounds.
 * @async
 */
async function fetchCharacterComics() {
    if (!db) return;
    try {
        const q = query(collection(db, `artifacts/${appId}/public/data/characterComics`));
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => {
            characterComicsData.set(doc.id, doc.data());
        });
    } catch (error) {
        console.warn("Could not load character comics data:", error.message);
    }
}

/**
 * @description Loads all data associated with the current user from Firestore.
 * @async
 */
async function loadUserData() {
    if (!userId) return;
    await Promise.all([
        loadRosterFromFirestore(),
        loadSavedTeamsFromFirestore()
    ]);
    populateChampionSelect();
    showLoading(false);
}

/**
 * @description Asynchronously loads comic data and applies it to already-rendered cards.
 * @async
 */
async function loadComicEnhancements() {
    await fetchCharacterComics();
    applyChampionCardBackgrounds();
}

/**
 * @description Creates and manages the interactive gear grid component with custom tooltips.
 * @param {string} containerId - The ID of the element to host the grid.
 * @returns {object} A controller object with an `update` method.
 */
function createInteractiveGearGrid(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const rarities = GAME_CONSTANTS.STANDARD_GEAR_RARITIES;
    const slots = ['Head', 'Arms', 'Chest', 'Legs', 'Waist'];
    const rarityColors = { "None": "#94a3b8", "Uncommon": "#22c55e", "Rare": "#3b82f6", "Epic": "#a855f7", "Legendary": "#eab308", "Mythic": "#e84848", "Mythic Enhanced": "#b50202" };

    const render = () => {
        const masterPipsHtml = rarities.map(r =>
            `<div class="gear-pip" data-rarity="${r}" style="background-color: ${rarityColors[r]}">${r.charAt(0)}</div>`
        ).join('');

        const slotsHtml = slots.map(slot => {
            const individualPipsHtml = rarities.map(r =>
                `<div class="gear-pip" data-rarity="${r}" title="${r}" style="background-color: ${rarityColors[r]}">&nbsp;</div>`
            ).join('');
            
            return `
                <div class="gear-grid-row" data-slot="${slot.toLowerCase()}">
                    <div class="gear-grid-label">${slot}</div>
                    <div class="gear-grid-pips">${individualPipsHtml}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="gear-grid-row gear-grid-master" data-slot="master">
                <div class="gear-grid-label">Set All</div>
                <div class="gear-grid-pips">${masterPipsHtml}</div>
            </div>
            <hr class="my-2 border-slate-200">
            ${slotsHtml}
        `;

        updateVisuals();
    };

    const updateVisuals = () => {
        slots.forEach(slotKey => {
            const lowerSlot = slotKey.toLowerCase();
            const gearState = currentGearState[lowerSlot] || { rarity: 'None', hasSynergy: false };
            
            container.querySelectorAll(`[data-slot="${lowerSlot}"] .gear-pip`).forEach(pip => {
                const isSelected = pip.dataset.rarity === gearState.rarity;
                pip.classList.toggle('selected', isSelected);
                
                pip.classList.toggle('has-synergy', isSelected && gearState.hasSynergy);
            });
        });
    };

    container.addEventListener('click', (e) => {
        if (!e.target.matches('.gear-pip')) return;
        const target = e.target;
        const row = target.closest('.gear-grid-row');
        const slot = row.dataset.slot;
        const rarity = target.dataset.rarity;

        if (slot === 'master') {
            slots.forEach(s => {
                currentGearState[s.toLowerCase()] = { rarity: rarity, hasSynergy: false };
            });
        } else {
            const currentSlotState = currentGearState[slot];
            
            if (currentSlotState && currentSlotState.rarity === rarity) {
                currentSlotState.hasSynergy = !currentSlotState.hasSynergy;
            } else {
                currentGearState[slot] = { rarity: rarity, hasSynergy: false };
            }
        }
        updateVisuals();
    });

    container.addEventListener('mouseover', (e) => {
        if (!e.target.matches('.gear-grid-master .gear-pip')) return;
        const pip = e.target;
        DOM.customTooltip.textContent = pip.dataset.rarity;
        DOM.customTooltip.classList.remove('hidden');

        const pipRect = pip.getBoundingClientRect();
        const top = pipRect.top + window.scrollY - DOM.customTooltip.offsetHeight - 8;
        const left = pipRect.left + window.scrollX + (pipRect.width / 2) - (DOM.customTooltip.offsetWidth / 2);
        
        DOM.customTooltip.style.top = `${top}px`;
        DOM.customTooltip.style.left = `${left}px`;
        DOM.customTooltip.classList.add('visible');
    });

    container.addEventListener('mouseout', (e) => {
        if (!e.target.matches('.gear-grid-master .gear-pip')) return;
        DOM.customTooltip.classList.remove('visible');
    });

    const update = (newState) => {
        if (!newState) {
             currentGearState = {
                 head: { rarity: 'None', hasSynergy: false },
                 arms: { rarity: 'None', hasSynergy: false },
                 chest: { rarity: 'None', hasSynergy: false },
                 legs: { rarity: 'None', hasSynergy: false },
                 waist: { rarity: 'None', hasSynergy: false }
             };
        } else {
             currentGearState = {
                 head: { rarity: newState.head?.rarity || 'None', hasSynergy: newState.head?.hasSynergy || false },
                 arms: { rarity: newState.arms?.rarity || 'None', hasSynergy: newState.arms?.hasSynergy || false },
                 chest: { rarity: newState.chest?.rarity || 'None', hasSynergy: newState.chest?.hasSynergy || false },
                 legs: { rarity: newState.legs?.rarity || 'None', hasSynergy: newState.legs?.hasSynergy || false },
                 waist: { rarity: newState.waist?.rarity || 'None', hasSynergy: newState.waist?.hasSynergy || false },
             };
        }
        updateVisuals();
    };

    render();
    update(null);
    return { update };
}

/**
 * @description Populates all static dropdown menus with options from GAME_CONSTANTS.
 */
function populateStaticDropdowns() {
    populateLegacyPieceSelect();
}

/**
 * @description Creates a custom, interactive multi-select pillbox for team exclusions.
 * @param {Array<object>} initialTeams - The initial array of teams to populate with.
 */
function createTeamExclusionMultiSelect(initialTeams) {
    const container = document.getElementById('team-exclusion-multiselect-container');
    container.innerHTML = `<div class="pills-input-wrapper" tabindex="0">
                                <input type="text" id="team-exclusion-search-input" placeholder="Select teams to exclude...">
                           </div>
                           <div class="custom-options-panel hidden"></div>`;
    
    const inputWrapper = container.querySelector('.pills-input-wrapper');
    const searchInput = container.querySelector('#team-exclusion-search-input');
    const optionsPanel = container.querySelector('.custom-options-panel');

    let state = {
        available: initialTeams.map(t => ({ id: t.id, name: t.name })),
        selected: []
    };

    const render = () => {
        inputWrapper.querySelectorAll('.pill').forEach(p => p.remove());
        state.selected.forEach(item => {
            const pill = document.createElement('div');
            pill.className = 'pill';
            pill.innerHTML = `<span>${item.name}</span>`;
            const removeBtn = document.createElement('button');
            removeBtn.className = 'pill-remove';
            removeBtn.innerHTML = '&times;';
            removeBtn.onclick = (e) => { e.stopPropagation(); deselect(item); };
            pill.appendChild(removeBtn);
            inputWrapper.insertBefore(pill, searchInput);
        });

        optionsPanel.innerHTML = '';
        const filteredOptions = state.available
            .filter(opt => opt.name.toLowerCase().includes(searchInput.value.toLowerCase()));
        
        filteredOptions.forEach(item => {
            const optionEl = document.createElement('div');
            optionEl.className = 'custom-option';
            optionEl.textContent = item.name;
            optionEl.onclick = () => select(item);
            optionsPanel.appendChild(optionEl);
        });
    };

    const select = (item) => {
        state.selected.push(item);
        state.available = state.available.filter(i => i.id !== item.id);
        searchInput.value = '';
        render();
        searchInput.focus();
    };

    const deselect = (item) => {
        state.selected = state.selected.filter(i => i.id !== item.id);
        state.available.push(item);
        state.available.sort((a,b) => a.name.localeCompare(b.name));
        render();
    };

    const setDisabled = (isDisabled) => {
        inputWrapper.classList.toggle('disabled', isDisabled);
        searchInput.readOnly = isDisabled;
        if (isDisabled) optionsPanel.classList.add('hidden');
    };
    
    const updateOptions = (newTeams) => {
        state.available = newTeams.map(t => ({ id: t.id, name: t.name }));
        state.selected = [];
        render();
    };

    const handleClick = () => {
        if (!inputWrapper.classList.contains('disabled')) {
            optionsPanel.classList.remove('hidden');
            searchInput.focus();
        }
    };

    const handleDocumentClick = (e) => {
        if (!container.contains(e.target)) {
            optionsPanel.classList.add('hidden');
        }
    };

    inputWrapper.addEventListener('click', handleClick);
    searchInput.addEventListener('input', render);
    document.addEventListener('click', handleDocumentClick);

    render();
    setDisabled(!DOM.excludeSavedTeamCheckbox.checked);

    const destroy = () => {
        inputWrapper.removeEventListener('click', handleClick);
        searchInput.removeEventListener('input', render);
        document.removeEventListener('click', handleDocumentClick);
        container.innerHTML = '';
    };

    return {
        getSelectedValues: () => state.selected.map(s => s.id),
        setDisabled,
        updateOptions,
        destroy,
    };
}

/**
 * @description Creates a custom, interactive multi-select pillbox for synergies.
 */
function createSynergyMultiSelect() {
    const container = document.getElementById('synergy-multiselect-container');
    const inputWrapper = container.querySelector('.pills-input-wrapper');
    const searchInput = document.getElementById('synergy-search-input');
    const optionsPanel = document.getElementById('synergy-options-panel');

    let state = {
        available: [...dbSynergies.map(s => s.name)],
        selected: []
    };

    const render = () => {
        inputWrapper.querySelectorAll('.pill').forEach(p => p.remove());
        state.selected.forEach(value => {
            const pill = document.createElement('div');
            pill.className = 'pill';
            
            const iconHtml = getSynergyIcon(value);
            pill.innerHTML = `${iconHtml}<span>${value}</span>`;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'pill-remove';
            removeBtn.innerHTML = '&times;';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                deselect(value);
            };
            pill.appendChild(removeBtn);
            inputWrapper.insertBefore(pill, searchInput);
        });

        optionsPanel.innerHTML = '';
        const filteredOptions = state.available
            .filter(opt => opt.toLowerCase().includes(searchInput.value.toLowerCase()));
        
        filteredOptions.forEach(value => {
            const optionEl = document.createElement('div');
            optionEl.className = 'custom-option';

            const iconHtml = getSynergyIcon(value);
            optionEl.innerHTML = `${iconHtml}<span>${value}</span>`;

            optionEl.onclick = () => select(value);
            optionsPanel.appendChild(optionEl);
        });
    };

    const select = (value) => {
        state.selected.push(value);
        state.available = state.available.filter(v => v !== value);
        searchInput.value = '';
        render();
        searchInput.focus();
    };

    const deselect = (value) => {
        state.selected = state.selected.filter(v => v !== value);
        state.available.push(value);
        state.available.sort();
        render();
    };
    
    inputWrapper.addEventListener('click', () => {
        optionsPanel.classList.remove('hidden');
        searchInput.focus();
    });

    searchInput.addEventListener('input', render);
    
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && searchInput.value === '' && state.selected.length > 0) {
            deselect(state.selected[state.selected.length - 1]);
        }
    });

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            optionsPanel.classList.add('hidden');
        }
    });

    render();

    return {
        getSelectedValues: () => state.selected
    };
}

/**
 * @description Generic helper to populate a <select> element.
 * @param {HTMLSelectElement} selectElement - The dropdown element to populate.
 * @param {Array<string|object>} options - An array of options. Can be strings or objects with 'value' and 'text' properties.
 * @param {string} [defaultValue] - The value to select by default.
 */
function populateDropdown(selectElement, options, defaultValue) {
    if (!selectElement) return;
    selectElement.innerHTML = '';
    options.forEach(opt => {
        const optionEl = document.createElement('option');
        if (typeof opt === 'object') {
            optionEl.value = opt.value;
            optionEl.textContent = opt.text;
        } else {
            optionEl.value = opt;
            optionEl.textContent = opt;
        }
        selectElement.appendChild(optionEl);
    });
    if (defaultValue) selectElement.value = defaultValue;
}

/**
 * @description Creates an interactive Force Level selector component.
 * @param {string} containerId - The ID of the element to host the pips.
 * @param {string} hiddenInputId - The ID of the hidden input that stores the value.
 * @returns {object} A controller object with a `setValue` method.
 */
function createForceLevelSelector(containerId, hiddenInputId) {
    const container = document.getElementById(containerId);
    const hiddenInput = document.getElementById(hiddenInputId);

    if (!container) {
        console.warn(`Force Level Selector init failed: Container element with ID '${containerId}' not found.`);
        return null;
    }
    if (!hiddenInput) {
        console.warn(`Force Level Selector init failed: Hidden input with ID '${hiddenInputId}' not found.`);
        return null;
    }

    const levels = [0, 1, 2, 3, 4, 5];

    const render = () => {
        container.innerHTML = levels.map(level =>
            `<div class="force-level-pip" data-level="${level}" title="Force Level ${level}">${level}</div>`
        ).join('');
    };

    const updateVisuals = (currentLevel) => {
        container.querySelectorAll('.force-level-pip').forEach(pip => {
            const pipLevel = parseInt(pip.dataset.level, 10);
            pip.classList.toggle('active', pipLevel > 0 && pipLevel <= currentLevel);
        });
    };

    container.addEventListener('click', (e) => {
        if (e.target.matches('.force-level-pip')) {
            const level = e.target.dataset.level;
            hiddenInput.value = level;
            updateVisuals(level);
        }
    });

    const setValue = (level) => {
        const newLevel = level !== undefined && level !== null ? level : 0;
        hiddenInput.value = newLevel;
        updateVisuals(newLevel);
    };
    
    render();

    setValue(0);

    return { setValue };
}

// =================================================================================================
// #endregion INITIALIZATION
// =================================================================================================


// =================================================================================================
// #region Event Listeners
// =================================================================================================

/**
 * @description Attaches all primary event listeners for the page.
 */
function attachEventListeners() {
    DOM.step1Btn.addEventListener('click', () => navigateToStep(1));
    DOM.step2Btn.addEventListener('click', () => navigateToStep(2));
    DOM.addUpdateChampionBtn.addEventListener('click', handleAddUpdateChampion);
    DOM.cancelEditBtn.addEventListener('click', cancelEditMode);
    DOM.prefillRosterBtn.addEventListener('click', handlePrefillRoster);
    DOM.exportRosterBtn.addEventListener('click', handleExportRoster);
    DOM.importRosterBtn.addEventListener('click', () => DOM.importRosterFile.click());
    DOM.importRosterFile.addEventListener('change', handleImportRoster);
    DOM.customChampDropdownTrigger.addEventListener('click', toggleChampionDropdown);
    DOM.champSelectDb.addEventListener('change', (e) => updateChampionFormDisplay(e.target.value));
    DOM.calculateBtn.addEventListener('click', handleCalculate);
    DOM.excludeSavedTeamCheckbox.addEventListener('change', (e) => {
        if (teamExclusionMultiSelect) {
            teamExclusionMultiSelect.setDisabled(!e.target.checked);
        }
    });

    document.addEventListener('click', (event) => {
        if (DOM.customChampDropdown && !DOM.customChampDropdown.contains(event.target)) {
            DOM.customChampDropdownOptions.classList.add('hidden');
            DOM.customChampDropdownTrigger.setAttribute('aria-expanded', 'false');
        }
    });

    DOM.resultsOutput.addEventListener('click', (e) => {
        const target = e.target;
        if (target.id === 'save-team-btn') saveCurrentBestTeam();
        else if (target.id === 'reset-team-btn') handleResetTeam();
        else if (target.id === 'find-upgrades-btn') handleFindUpgradeSuggestions();
        else if (target.dataset.action === 'swap') openSwapModal(parseInt(target.dataset.index, 10));
    });

    DOM.savedTeamsList.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;
        const action = button.dataset.action;
        const id = button.dataset.id;
        switch (action) {
            case 'share': shareTeam(id); break;
            case 'unshare': unshareTeam(id, button.dataset.publicId); break;
            case 'rename': renameSavedTeam(id, button.dataset.name); break;
            case 'delete': deleteSavedTeam(id); break;
        }
    });

    DOM.customLPDropdownTrigger.addEventListener('click', toggleLPDropdown);

    document.addEventListener('click', (event) => {
        if (DOM.customChampDropdown && !DOM.customChampDropdown.contains(event.target)) {
            DOM.customChampDropdownOptions.classList.add('hidden');
            DOM.customChampDropdownTrigger.setAttribute('aria-expanded', 'false');
        }
        if (DOM.customLPDropdown && !DOM.customLPDropdown.contains(event.target)) {
            DOM.customLPDropdownOptions.classList.add('hidden');
            DOM.customLPDropdownTrigger.setAttribute('aria-expanded', 'false');
        }
    });
    DOM.rosterSearchInput.addEventListener('input', handleRosterSearch);

    if (DOM.rosterFiltersWrapper) {
        DOM.rosterFiltersWrapper.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            const { action, faction, class: className, filter } = button.dataset;

            if (action === 'clear-faction') {
                activeFactionFilter = null;
            } else if (action === 'clear-class') {
                activeClassFilter = null;
            } else if (faction) {
                activeFactionFilter = activeFactionFilter === faction ? null : faction;
            } else if (className) {
                activeClassFilter = activeClassFilter === className ? null : className;
            } else if (filter === 'healer') {
                activeHealerFilter = !activeHealerFilter;
            }

            renderRosterGrid();
        });
    }

    const tooltipTrigger = document.getElementById('gear-synergy-tooltip-trigger');
    if (tooltipTrigger) {
        const tooltipText = 'Click a selected gear pip again to toggle its Synergy status. Synergy gear provides a 20% score bonus.';

        tooltipTrigger.addEventListener('mouseover', (e) => {
            const triggerRect = e.target.getBoundingClientRect();
            DOM.customTooltip.textContent = tooltipText;
            DOM.customTooltip.classList.remove('hidden');
            DOM.customTooltip.classList.add('visible');

            const top = triggerRect.top + window.scrollY - DOM.customTooltip.offsetHeight - 5;
            const left = triggerRect.left + window.scrollX + (triggerRect.width / 2) - (DOM.customTooltip.offsetWidth / 2);
            
            DOM.customTooltip.style.top = `${top}px`;
            DOM.customTooltip.style.left = `${left}px`;
        });

        tooltipTrigger.addEventListener('mouseout', () => {
            DOM.customTooltip.classList.remove('visible');
        });
    }
}

/**
 * @description Navigates between the two steps of the wizard UI.
 * @param {number} stepNum - The step number to navigate to (1 or 2).
 */
function navigateToStep(stepNum) {
    const isStep1 = stepNum === 1;
    DOM.stepper.classList.toggle('step-2', !isStep1);
    DOM.step1Btn.classList.toggle('active', isStep1);
    DOM.step2Btn.classList.toggle('active', !isStep1);
    DOM.step1Content.classList.toggle('hidden-step', !isStep1);
    DOM.step2Content.classList.toggle('hidden-step', isStep1);
    logEvent(analytics, 'navigate_step', { step: stepNum });
}

// =================================================================================================
// #endregion Event Listeners
// =================================================================================================


// =================================================================================================
// #region Roster Management
// =================================================================================================

/**
 * @description Handles adding a new champion or updating an existing one in the player's roster.
 * @async
 */
async function handleAddUpdateChampion() {
    const selectedDbChampionId = DOM.champSelectDb.value;
    const selectedLegacyPieceId = DOM.legacyPieceSelect.value;
    const selectedLegacyPieceStarTier = DOM.legacyPieceStarColor.value;
    const selectedForceLevel = parseInt(DOM.champForceLevel.value, 10) || 0;

    let legacyPieceData = { id: null, name: "None", rarity: "None", starColorTier: "Unlocked", description: "" };
    if (selectedLegacyPieceId) {
        const dbLp = dbLegacyPieces.find(lp => lp.id === selectedLegacyPieceId);
        if (dbLp) {
            legacyPieceData = { id: dbLp.id, name: dbLp.name, rarity: dbLp.baseRarity, starColorTier: selectedLegacyPieceStarTier, description: dbLp.description || "" };
        }
    }

    if (editingChampionId) {
        const championIndex = playerRoster.findIndex(c => c.id === editingChampionId);
        if (championIndex === -1) { cancelEditMode(); return; }
        const baseChampionDataForUpdate = dbChampions.find(dbChamp => dbChamp.id === playerRoster[championIndex].dbChampionId);
        playerRoster[championIndex] = {
            ...playerRoster[championIndex],
            isHealer: baseChampionDataForUpdate?.isHealer === true,
            starColorTier: DOM.champStarColor.value,
            forceLevel: selectedForceLevel,
            gear: {
                head: { rarity: currentGearState.head.rarity, hasSynergy: currentGearState.head.hasSynergy },
                arms: { rarity: currentGearState.arms.rarity, hasSynergy: currentGearState.arms.hasSynergy },
                legs: { rarity: currentGearState.legs.rarity, hasSynergy: currentGearState.legs.hasSynergy },
                chest: { rarity: currentGearState.chest.rarity, hasSynergy: currentGearState.chest.hasSynergy },
                waist: { rarity: currentGearState.waist.rarity, hasSynergy: currentGearState.waist.hasSynergy },
            },
            legacyPiece: legacyPieceData,
        };
        const updatedChampion = playerRoster[championIndex];
        await recalculateAndUpdateSavedTeams(updatedChampion);
        showToast(`${updatedChampion.name} updated!`, "success");
        logEvent(analytics, 'update_champion', { champion_name: updatedChampion.name });
    } else {
        if (!selectedDbChampionId) { showToast('Please select a champion.', 'warning'); return; }
        if (playerRoster.some(rc => rc.dbChampionId === selectedDbChampionId)) { showToast('Champion already in roster.', 'warning'); return; }
        const baseChampionData = dbChampions.find(c => c.id === selectedDbChampionId);
        if (!baseChampionData) { showToast('Base champion data not found.', 'error'); return; }
        const newChampion = {
            id: Date.now() + Math.random(),
            dbChampionId: baseChampionData.id,
            name: baseChampionData.name,
            baseRarity: baseChampionData.baseRarity,
            class: baseChampionData.class || "N/A",
            isHealer: baseChampionData.isHealer === true,
            inherentSynergies: baseChampionData.inherentSynergies || [],
            canUpgrade: baseChampionData.canUpgrade,
            upgradeSynergy: baseChampionData.upgradeSynergy,
            starColorTier: DOM.champStarColor.value,
            forceLevel: selectedForceLevel,
            gear: {
                head: { rarity: currentGearState.head.rarity, hasSynergy: currentGearState.head.hasSynergy },
                arms: { rarity: currentGearState.arms.rarity, hasSynergy: currentGearState.arms.hasSynergy },
                legs: { rarity: currentGearState.legs.rarity, hasSynergy: currentGearState.legs.hasSynergy },
                chest: { rarity: currentGearState.chest.rarity, hasSynergy: currentGearState.chest.hasSynergy },
                waist: { rarity: currentGearState.waist.rarity, hasSynergy: currentGearState.waist.hasSynergy },
            },
            legacyPiece: legacyPieceData
        };
        playerRoster.push(newChampion);
        showToast(`${newChampion.name} added!`, "success");
        logEvent(analytics, 'add_champion', { champion_name: newChampion.name, roster_size: playerRoster.length });
    }
    await saveRosterToFirestore();
    renderRosterGrid();
    populateChampionSelect();
    cancelEditMode();
}

function handleRosterSearch(e) {
    activeSearchTerm = e.target.value.toLowerCase();
    renderRosterGrid();
}

/**
 * @description Creates the HTML for a single, enhanced champion card in the user's roster with a top-down layout.
 * @param {object} champion - The champion object from playerRoster.
 * @returns {HTMLElement} The fully-formed card element with event listeners.
 */
function createRosterCard(champion) {
    const card = document.createElement('div');
    const score = Math.round(TeamCalculator.calculateIndividualChampionScore(champion, GAME_CONSTANTS));
    const cleanName = champion.name.replace(/[^a-zA-Z0-9-_]/g, "");
    const idKey = champion.name.toLowerCase().replace(/\s+/g, '_');

    card.className = 'champion-card-enhanced is-roster-card';
    card.dataset.championName = cleanName;
    card.dataset.championIdKey = idKey;

    const healerIcon = champion.isHealer ? getHealerPlaceholder() : '';
    const starRating = getStarRatingHTML(champion.starColorTier);
    const forceLevel = `<p class="force-level">Force Lvl: ${champion.forceLevel}</p>`;
    const synergies = (champion.inherentSynergies || []).map(getSynergyIcon).join('');
    const upgradeButton = (champion.baseRarity === 'Legendary' && champion.canUpgrade) 
        ? `<button class="card-action-btn upgrade" data-action="upgrade" data-id="${champion.id}" title="Upgrade to Mythic"><i class="fas fa-arrow-up"></i></button>` : '';

    card.innerHTML = `
        <div class="card-background-image"></div>
        <div class="card-top-info">
            <div class="flex items-center gap-2">
                ${getClassPlaceholder(champion.class)}
                ${healerIcon}
            </div>
            <span class="card-score">${score}</span>
        </div>
        
        <div class="card-image-container">
            <img src="img/champions/full/${cleanName}.webp" alt="${champion.name}" class="card-avatar-top" onerror="this.src='img/champions/avatars/${cleanName}.webp'">
        </div>

        <div class="card-content-bottom">
            <h4 class="champion-name clickable-champion" data-id="${champion.dbChampionId}">${champion.name}</h4>
            <div class="champion-details">
                <p>${champion.baseRarity}</p>
                ${starRating}
                ${forceLevel}
            </div>
            <div class="synergy-icons">${synergies}</div>
        </div>

        <div class="card-actions">
            ${upgradeButton}
            <button class="card-action-btn edit" data-action="edit" data-id="${champion.id}" title="Edit"><i class="fas fa-pencil-alt"></i></button>
            <button class="card-action-btn remove" data-action="remove" data-id="${champion.id}" title="Remove"><i class="fas fa-trash"></i></button>
        </div>
    `;
    
    card.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => { e.stopPropagation(); handleEditChampion(parseFloat(e.currentTarget.dataset.id)); });
    card.querySelector('[data-action="remove"]')?.addEventListener('click', (e) => { e.stopPropagation(); handleRemoveChampion(parseFloat(e.currentTarget.dataset.id)); });
    card.querySelector('[data-action="upgrade"]')?.addEventListener('click', (e) => { e.stopPropagation(); handleUpgradeChampion(parseFloat(e.currentTarget.dataset.id)); });

    return card;
}

// --- js/teams/ui.js ---

/**
 * @description Renders the player's champion roster as a grid of cards, including filtering.
 */
function renderRosterGrid() {
    const gridEl = document.getElementById('roster-grid'); 
    const filtersContainer = document.getElementById('dynamic-filter-groups');

    if (!playerRoster || playerRoster.length === 0) {
        if (gridEl) gridEl.innerHTML = '';
        if (filtersContainer) filtersContainer.innerHTML = ''; // Clear the main wrapper
        
        DOM.rosterEmptyMessage.classList.remove('hidden');
        if (gridEl) gridEl.classList.add('hidden');
        if (DOM.prefillRosterBtn) DOM.prefillRosterBtn.classList.remove('hidden');
        return;
    }

    DOM.rosterEmptyMessage.classList.add('hidden');
    if (gridEl) gridEl.classList.remove('hidden');
    
    // Clear previous filters before re-rendering
    if(filtersContainer) filtersContainer.innerHTML = '';

    const allFactions = new Set(playerRoster.flatMap(c => c.inherentSynergies || []));
    const allClasses = new Set(playerRoster.map(c => c.class).filter(Boolean));

    // --- Dynamically create and populate filter groups ---
    
    // Faction Group
    const factionGroup = document.createElement('div');
    factionGroup.className = 'filter-group';
    filtersContainer.appendChild(factionGroup);

    // Class Group
    const classGroup = document.createElement('div');
    classGroup.className = 'filter-group';
    filtersContainer.appendChild(classGroup);

    // Utility Group
    const utilityGroup = document.createElement('div');
    utilityGroup.className = 'filter-group';
    filtersContainer.appendChild(utilityGroup);

    const renderFilters = (container, items, type, currentFilter, iconFn) => {
        container.innerHTML = `<span class="filter-label">${type === 'faction' ? 'Faction' : 'Class'}:</span>`;
        const sortedItems = [...items].sort();
        sortedItems.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.dataset[type] = item;
            btn.innerHTML = iconFn(item);
            btn.title = item;
            btn.classList.toggle('active', item === currentFilter);
            container.appendChild(btn);
        });
        const clearBtn = document.createElement('button');
        clearBtn.className = 'filter-btn clear';
        clearBtn.innerHTML = '<i class="fas fa-times"></i>';
        clearBtn.title = 'Clear Filter';
        clearBtn.dataset.action = `clear-${type}`;
        container.appendChild(clearBtn);
    };
    
    renderFilters(factionGroup, allFactions, 'faction', activeFactionFilter, getSynergyIcon);
    renderFilters(classGroup, allClasses, 'class', activeClassFilter, getClassPlaceholder);
    
    utilityGroup.innerHTML = `<span class="filter-label">Utility:</span>`;
    const healerBtn = document.createElement('button');
    healerBtn.className = 'filter-btn';
    healerBtn.dataset.filter = 'healer';
    healerBtn.innerHTML = getHealerPlaceholder();
    healerBtn.title = 'Show Only Healers';
    healerBtn.classList.toggle('active', activeHealerFilter);
    utilityGroup.appendChild(healerBtn);
    
    const filteredRoster = playerRoster.filter(champ => {
        const factionMatch = !activeFactionFilter || (champ.inherentSynergies || []).includes(activeFactionFilter);
        const classMatch = !activeClassFilter || champ.class === activeClassFilter;
        const searchMatch = !activeSearchTerm || champ.name.toLowerCase().includes(activeSearchTerm);
        const healerMatch = !activeHealerFilter || champ.isHealer === true;
        return factionMatch && classMatch && searchMatch && healerMatch;
    });

    if (gridEl) {
        gridEl.innerHTML = '';
        if (filteredRoster.length > 0) {
             filteredRoster
                .sort((a,b) => TeamCalculator.calculateIndividualChampionScore(b, GAME_CONSTANTS) - TeamCalculator.calculateIndividualChampionScore(a, GAME_CONSTANTS))
                .forEach(champ => {
                    const card = createRosterCard(champ);
                    gridEl.appendChild(card);
                });
        } else {
             gridEl.innerHTML = '<p class="text-center text-slate-400 col-span-full py-8">No champions match the current filters.</p>';
        }
    }

    applyChampionCardBackgrounds();

    if (shouldScrollToRoster) {
        if (gridEl) gridEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        shouldScrollToRoster = false;
    }
}

/**
 * @description Exits champion editing mode and resets the form.
 */
function cancelEditMode() {
    editingChampionId = null;
    DOM.formModeTitle.textContent = "Add Champion to Roster";
    const btnText = DOM.addUpdateChampionBtn.firstChild;
    if (btnText) btnText.nodeValue = "Add Champion ";
    DOM.cancelEditBtn.classList.add('hidden');
    DOM.customChampDropdownTrigger.disabled = false;

    DOM.champSelectDb.value = '';
    if (forceLevelControl) forceLevelControl.setValue(0);
    DOM.legacyPieceSelect.value = '';
    
    if (champStarSelectorControl) {
        champStarSelectorControl.setValue('Unlocked');
    }
    if (legacyStarSelectorControl) {
        legacyStarSelectorControl.setValue('Unlocked');
    }
    if (gearGridControl) {
        gearGridControl.update(null);
    }

    populateChampionSelect();
    updateChampionFormDisplay(null);
}

/**
 * @description Populates the form with a champion's data to begin editing.
 * @param {number} id - The unique ID of the champion in the playerRoster.
 */
function handleEditChampion(id) {
    const champ = playerRoster.find(c => c.id === id);
    if (!champ) return;
    editingChampionId = id;
    DOM.formModeTitle.textContent = "Edit Champion";
    const btnText = DOM.addUpdateChampionBtn.firstChild;
    if (btnText) btnText.nodeValue = "Update Champion ";
    DOM.cancelEditBtn.classList.remove('hidden');
    DOM.champSelectDb.value = champ.dbChampionId;
    
    if (champStarSelectorControl) {
        champStarSelectorControl.setValue(champ.starColorTier);
    }

    if (forceLevelControl) forceLevelControl.setValue(champ.forceLevel);
    if (gearGridControl) {
        gearGridControl.update(champ.gear);
    }
    populateLegacyPieceSelect(champ.class);
    DOM.legacyPieceSelect.value = champ.legacyPiece?.id || '';
    
    if (legacyStarSelectorControl) {
        legacyStarSelectorControl.setValue(champ.legacyPiece?.starColorTier || 'Unlocked');
    }
    updateChampionFormDisplay(champ.dbChampionId, true);
    DOM.customChampDropdownTrigger.disabled = true;
    if (DOM.rosterFormContainer) {
        window.scrollTo({ top: DOM.rosterFormContainer.getBoundingClientRect().top + window.scrollY - 125, behavior: 'smooth' });
    }
}

/**
 * @description Opens a confirmation modal to remove a champion from the roster.
 * @param {number} id - The unique ID of the champion in the playerRoster.
 */
function handleRemoveChampion(id) {
    const champ = playerRoster.find(c => c.id === id);
    if (!champ) return;
    openConfirmModal('Confirm Deletion', `Are you sure you want to remove ${champ.name} from your roster?`, async () => {
        playerRoster = playerRoster.filter(c => c.id !== id);
        await saveRosterToFirestore();
        renderRosterGrid();
        populateChampionSelect();
        showToast(`${champ.name} removed from roster.`, 'info');
        logEvent(analytics, 'remove_champion', { champion_name: champ.name });
    });
}

/**
 * @description Opens a confirmation modal to upgrade a Legendary champion to Mythic.
 * @param {number} id - The unique ID of the champion in the playerRoster.
 * @async
 */
async function handleUpgradeChampion(id) {
    const champIndex = playerRoster.findIndex(c => c.id === id);
    if (champIndex === -1) { showToast("Champion not found for upgrade.", "error"); return; }
    const champ = playerRoster[champIndex];
    const message = `Upgrade ${champ.name} from Legendary to Mythic? This is permanent and also upgrades their star tier to Purple 5-Star.`;
    openConfirmModal('Confirm Upgrade', message, async () => {
        const upgradedChamp = { ...champ };
        if (upgradedChamp.upgradeSynergy && !upgradedChamp.inherentSynergies.includes(upgradedChamp.upgradeSynergy)) {
            upgradedChamp.inherentSynergies.push(upgradedChamp.upgradeSynergy);
        }
        upgradedChamp.baseRarity = "Mythic";
        upgradedChamp.canUpgrade = false;
        upgradedChamp.starColorTier = "Purple 5-Star";
        upgradedChamp.individualScore = TeamCalculator.calculateIndividualChampionScore(upgradedChamp, GAME_CONSTANTS);
        playerRoster[champIndex] = upgradedChamp;
        await recalculateAndUpdateSavedTeams(upgradedChamp);
        await saveRosterToFirestore();
        renderRosterGrid();
        showToast(`${upgradedChamp.name} upgraded to Mythic!`, 'success');
        logEvent(analytics, 'upgrade_champion', { champion_name: upgradedChamp.name });
    });
}

/**
 * @description Finds any saved teams containing the upgraded champion and recalculates their scores.
 * @param {object} upgradedChampion - The champion object after being upgraded.
 * @async
 */
async function recalculateAndUpdateSavedTeams(upgradedChampion) {
    if (!savedTeams || savedTeams.length === 0 || !upgradedChampion) return;
    const teamsToUpdate = savedTeams.filter(team => team.members.some(member => member.dbChampionId === upgradedChampion.dbChampionId));
    if (teamsToUpdate.length === 0) return;
    showToast(`Found ${teamsToUpdate.length} saved team(s) to update...`, 'info');
    const calculator = new TeamCalculator(dbSynergies, GAME_CONSTANTS);
    for (const team of teamsToUpdate) {
        let updatedMembers = team.members.map(member => member.dbChampionId === upgradedChampion.dbChampionId ? { ...upgradedChampion } : member);
        updatedMembers = ensureIndividualScores(updatedMembers, dbChampions);
        const reEvaluatedTeam = calculator.evaluateTeam(updatedMembers);
        const dataToUpdate = {
            members: reEvaluatedTeam.members.map(m => ({
                dbChampionId: m.dbChampionId,
                name: m.name,
                baseRarity: m.baseRarity,
                class: m.class,
                isHealer: m.isHealer === true,
                starColorTier: m.starColorTier,
                forceLevel: m.forceLevel || 0,
                gear: m.gear,
                legacyPiece: m.legacyPiece,
                inherentSynergies: m.inherentSynergies || [],
                individualScore: m.individualScore
            })),
            totalScore: reEvaluatedTeam.totalScore,
            activeSynergies: reEvaluatedTeam.activeSynergies,
            scoreBreakdown: reEvaluatedTeam.scoreBreakdown,
            uniqueClassesCount: reEvaluatedTeam.uniqueClassesCount,
            classDiversityBonusApplied: reEvaluatedTeam.classDiversityBonusApplied
        };
        const privateTeamDocRef = doc(db, `artifacts/${appId}/users/${userId}/savedTeams`, team.id);
        await updateDoc(privateTeamDocRef, dataToUpdate);
        if (team.publicShareId) {
            const publicTeamDocRef = doc(db, `artifacts/${appId}/public/data/sharedTeams`, team.publicShareId);
            await updateDoc(publicTeamDocRef, dataToUpdate);
        }
        const localTeamIndex = savedTeams.findIndex(t => t.id === team.id);
        if (localTeamIndex !== -1) {
            savedTeams[localTeamIndex] = { ...savedTeams[localTeamIndex], ...dataToUpdate, members: reEvaluatedTeam.members };
        }
    }
    renderSavedTeams(characterComicsData);
    showToast(`${teamsToUpdate.length} saved team(s) updated successfully!`, 'success');
    logEvent(analytics, 'recalculate_saved_teams', { updated_count: teamsToUpdate.length });
}

/**
 * @description Handles the pre-fill roster action, with confirmation if the roster is not empty.
 */
function handlePrefillRoster() {
    const prefillAction = async () => {
        if (dbChampions.length === 0) { showToast("Champion data not loaded yet.", "error"); return; }
        playerRoster = dbChampions.map(baseChamp => {
            const defaultGear = {};
            Object.keys(DOM.gear).forEach(slot => { defaultGear[slot] = { rarity: 'None' }; });
            return {
                id: Date.now() + Math.random(), dbChampionId: baseChamp.id, name: baseChamp.name, baseRarity: baseChamp.baseRarity,
                class: baseChamp.class || "N/A", isHealer: baseChamp.isHealer === true, inherentSynergies: baseChamp.inherentSynergies || [],
                starColorTier: "Unlocked", forceLevel: 0, gear: defaultGear, legacyPiece: { id: null, name: "None", rarity: "None", starColorTier: "Unlocked", description: "" }
            };
        });
        await saveRosterToFirestore();
        renderRosterGrid();
        populateChampionSelect();
        showToast("Roster pre-filled with all champions!", "success");
        logEvent(analytics, 'prefill_roster', { roster_size: playerRoster.length });
    };
    if (playerRoster.length > 0) {
        openConfirmModal('Overwrite Roster?', 'This will replace your current roster. Are you sure?', prefillAction);
    } else {
        prefillAction();
    }
}

/**
 * @description Exports the current player roster to a JSON file.
 */
function handleExportRoster() {
    if (playerRoster.length === 0) { showToast("Roster is empty, nothing to export.", "warning"); return; }
    const exportableRoster = playerRoster.map(c => ({
        dbChampionId: c.dbChampionId, starColorTier: c.starColorTier, forceLevel: c.forceLevel || 0,
        gear: {
            head: { rarity: c.gear.head.rarity, hasSynergy: c.gear.head.hasSynergy || false },
            arms: { rarity: c.gear.arms.rarity, hasSynergy: c.gear.arms.hasSynergy || false },
            legs: { rarity: c.gear.legs.rarity, hasSynergy: c.gear.legs.hasSynergy || false },
            chest: { rarity: c.gear.chest.rarity, hasSynergy: c.gear.chest.hasSynergy || false },
            waist: { rarity: c.gear.waist.rarity, hasSynergy: c.gear.waist.hasSynergy || false },
        },
        legacyPiece: { id: c.legacyPiece.id, starColorTier: c.legacyPiece.starColorTier || "Unlocked" }
    }));
    const jsonData = JSON.stringify(exportableRoster, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dc_dark_legion_roster.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Roster exported successfully!", "success");
    logEvent(analytics, 'export_roster', { roster_size: playerRoster.length });
}

/**
 * @description Handles the file input change event for importing a roster.
 * @param {Event} event - The file input change event.
 */
function handleImportRoster(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== "application/json") { showToast("Invalid file type. Please select a JSON file.", "error"); DOM.importRosterFile.value = ''; return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        const processImport = async () => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (!Array.isArray(importedData)) { showToast("Invalid roster format.", "error"); return; }
                const newRoster = [];
                let importErrors = 0;
                for (const importedChamp of importedData) {
                    const baseChampionData = dbChampions.find(c => c.id === importedChamp.dbChampionId);
                    if (!baseChampionData) { importErrors++; continue; }
                    let legacyPieceData = { id: null, name: "None", rarity: "None", starColorTier: "Unlocked", description: "" };
                    if (importedChamp.legacyPiece && importedChamp.legacyPiece.id) {
                        const dbLp = dbLegacyPieces.find(lp => lp.id === importedChamp.legacyPiece.id);
                        if (dbLp) {
                            legacyPieceData = { id: dbLp.id, name: dbLp.name, rarity: dbLp.baseRarity, starColorTier: importedChamp.legacyPiece.starColorTier || "Unlocked", description: dbLp.description || "" };
                        }
                    }
                    newRoster.push({
                        id: Date.now() + Math.random(), dbChampionId: baseChampionData.id, name: baseChampionData.name, baseRarity: baseChampionData.baseRarity,
                        class: baseChampionData.class || "N/A", isHealer: baseChampionData.isHealer === true, inherentSynergies: baseChampionData.inherentSynergies || [],
                        starColorTier: importedChamp.starColorTier || "Unlocked", forceLevel: importedChamp.forceLevel || 0,
                        gear: {
                            head: { rarity: importedChamp.gear?.head?.rarity || "None", hasSynergy: importedChamp.gear?.head?.hasSynergy || false },
                            arms: { rarity: importedChamp.gear?.arms?.rarity || "None", hasSynergy: importedChamp.gear?.arms?.hasSynergy || false },
                            legs: { rarity: importedChamp.gear?.legs?.rarity || "None", hasSynergy: importedChamp.gear?.legs?.hasSynergy || false },
                            chest: { rarity: importedChamp.gear?.chest?.rarity || "None", hasSynergy: importedChamp.gear?.chest?.hasSynergy || false },
                            waist: { rarity: importedChamp.gear?.waist?.rarity || "None", hasSynergy: importedChamp.gear?.waist?.hasSynergy || false },
                        },
                        legacyPiece: legacyPieceData
                    });
                }
                playerRoster = newRoster;
                await saveRosterToFirestore();
                renderRosterGrid();
                populateChampionSelect();
                if (importErrors > 0) { showToast(`Roster imported with ${importErrors} champion(s) skipped.`, "warning"); }
                else { showToast("Roster imported successfully!", "success"); }
                logEvent(analytics, 'import_roster', { imported_count: newRoster.length, error_count: importErrors });
            } catch (err) {
                console.error("Error processing imported roster:", err);
                showToast("Failed to read or process the roster file.", "error");
            } finally {
                DOM.importRosterFile.value = '';
            }
        };
        openConfirmModal('Confirm Import', 'This will overwrite your current roster. Are you sure?', processImport, () => { DOM.importRosterFile.value = ''; showToast("Import cancelled.", "info"); });
    };
    reader.readAsText(file);
}

/**
 * @description Saves the current player roster to Firestore.
 * @async
 */
async function saveRosterToFirestore() {
    if (!userId) return;
    DOM.saveRosterIndicator.classList.remove('hidden');
    try {
        const rosterToSave = playerRoster.map(champ => {
            const { individualScore, canUpgrade, upgradeSynergy, ...rest } = champ;
            return rest;
        });
        await setDoc(doc(db, `artifacts/${appId}/users/${userId}/roster/myRoster`), { champions: rosterToSave });
    } catch(e) {
        showToast("Failed to save roster.", "error");
        logEvent(analytics, 'exception', { description: 'save_roster_failed' });
    } finally {
        DOM.saveRosterIndicator.classList.add('hidden');
    }
}

/**
 * @description Loads the player's roster from Firestore and merges it with the latest base champion data.
 * @async
 */
async function loadRosterFromFirestore() {
    if (!userId) return;
    const docRef = doc(db, `artifacts/${appId}/users/${userId}/roster/myRoster`);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data().champions || [];
        playerRoster = data.map(savedChamp => {
            const base = dbChampions.find(c => c.id === savedChamp.dbChampionId) || {};
            return { ...base, ...savedChamp };
        });
    } else {
        playerRoster = [];
    }
    renderRosterGrid();
}

// =================================================================================================
// #endregion Roster Management
// =================================================================================================


// =================================================================================================
// #region Team Calculation & Display
// =================================================================================================

/**
 * @description Generates the HTML for the collapsible score breakdown section.
 * @param {object} team - The evaluated team object from TeamCalculator.
 * @returns {string} The HTML string for the score breakdown.
 */
function getScoreBreakdownHtml(team) {
    if (!team || !team.scoreBreakdown) return '';
    const { base, synergyDepthBonus, subtotalAfterSynergies, classDiversityBonus } = team.scoreBreakdown;
    let breakdownHtml = `<details class="score-breakdown-details"><summary>View Score Calculation</summary><div class="breakdown-content"><div class="breakdown-row"><span>Base Individual Scores Sum</span><strong>${Math.round(base)}</strong></div>`;
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
    breakdownHtml += `<div class="breakdown-row is-total"><span>Final Team Score</span><strong>${Math.round(team.totalScore)}</strong></div>`;
    breakdownHtml += `</div></details>`;
    return breakdownHtml;
}

/**
 * @description Opens the modal for swapping a champion in the calculated team.
 * @param {number} indexToReplace - The index of the champion to swap in the currentDisplayedTeam.
 */
function openSwapModal(indexToReplace) {
    const championToReplace = currentDisplayedTeam.members[indexToReplace];
    const modalBody = DOM.swapChampionModal.querySelector('.modal-content');
    if (!modalBody) {
        DOM.swapChampionModal.innerHTML = `<div class="modal-content"><h3 id="swap-modal-title">Swap Out ${championToReplace.name}</h3><div id="swap-modal-body" class="max-h-96 overflow-y-auto"></div><div class="modal-buttons"><button class="btn btn-secondary" data-action="close-swap">Cancel</button></div></div>`;
        DOM.swapChampionModal.querySelector('[data-action="close-swap"]').addEventListener('click', () => closeModal('swapChampionModal'));
    } else {
         modalBody.querySelector('h3').textContent = `Swap Out ${championToReplace.name}`;
    }
    const swapBody = DOM.swapChampionModal.querySelector('#swap-modal-body');
    const currentTeamIds = new Set(currentDisplayedTeam.members.map(m => m.id));
    const availableChamps = playerRoster.filter(p => !currentTeamIds.has(p.id)).sort((a,b) => TeamCalculator.calculateIndividualChampionScore(b, GAME_CONSTANTS) - TeamCalculator.calculateIndividualChampionScore(a, GAME_CONSTANTS));
    if (availableChamps.length === 0) {
        swapBody.innerHTML = '<p class="text-slate-400 text-center">No other champions are available to swap in.</p>';
    } else {
        const list = availableChamps.map(champ => {
            const starRatingHtml = getStarRatingHTML(champ.starColorTier);
            const synergyIconsHtml = (champ.inherentSynergies || []).map(getSynergyIcon).join('');
            return `<li class="flex items-center justify-between p-2 hover:bg-slate-700 rounded-md cursor-pointer" data-action="swap-select" data-id="${champ.id}"><div class="flex items-center gap-x-3"><span class="font-semibold text-white">${champ.name}</span><div class="flex gap-x-1">${synergyIconsHtml}</div></div><div class="text-sm">${starRatingHtml}</div></li>`;
        }).join('');
        swapBody.innerHTML = `<ul class="space-y-1">${list}</ul>`;
    }
    swapBody.onclick = (e) => {
        const target = e.target.closest('li[data-action="swap-select"]');
        if (target) handleSwap(parseFloat(target.dataset.id), indexToReplace);
    };
    openModal('swapChampionModal');
    logEvent(analytics, 'open_swap_modal', { champion_name: championToReplace.name });
}

/**
 * @description Handles the logic of swapping a champion and re-evaluating the team.
 * @param {number} newChampionId - The ID of the champion from the roster to swap in.
 * @param {number} indexToReplace - The index in the current team to replace.
 */
function handleSwap(newChampionId, indexToReplace) {
    const newChampion = playerRoster.find(rc => rc.id === newChampionId);
    if (!newChampion) { showToast("Error: Selected champion not found.", "error"); return; }
    const oldChampionName = currentDisplayedTeam.members[indexToReplace].name;
    const newTeamMembers = [...currentDisplayedTeam.members];
    newTeamMembers[indexToReplace] = newChampion;
    const calculator = new TeamCalculator(dbSynergies, GAME_CONSTANTS);
    const reEvaluatedTeam = calculator.evaluateTeam(ensureIndividualScores(newTeamMembers, dbChampions));
    currentDisplayedTeam = reEvaluatedTeam;
    displayTeamResults(currentDisplayedTeam, characterComicsData);
    closeModal('swapChampionModal');
    showToast(`${newChampion.name} swapped in.`, 'info');
    logEvent(analytics, 'execute_swap', { swapped_in: newChampion.name, swapped_out: oldChampionName });
}

/**
 * @description Resets the displayed team back to the originally calculated optimal team.
 */
function handleResetTeam() {
    if (originalBestTeam) {
        currentDisplayedTeam = JSON.parse(JSON.stringify(originalBestTeam));
        displayTeamResults(currentDisplayedTeam, characterComicsData);
        showToast("Team has been reset to the original.", "info");
        logEvent(analytics, 'reset_team');
    }
}

/**
 * @description Handles the click event to find and display upgrade suggestions.
 */
async function handleFindUpgradeSuggestions() {
    if (!currentDisplayedTeam || playerRoster.length === 0) {
        showToast("Please calculate a team first.", "warning");
        return;
    }

    const outputContainer = document.getElementById('upgrade-suggestions-output');
    outputContainer.innerHTML = `<div class="text-center p-8"><div class="loading-spinner mx-auto"></div><p class="text-blue-200 mt-4 text-lg">Analyzing upgrade paths...</p></div>`;

    setTimeout(() => {
        try {
            const calculator = new TeamCalculator(dbSynergies, GAME_CONSTANTS);

            const requireHealer = DOM.requireHealerCheckbox.checked;
            const excludeTeams = DOM.excludeSavedTeamCheckbox.checked;
            const requiredSynergies = synergyMultiSelect.getSelectedValues();
            let excludedChampionDbIds = [];

            if (excludeTeams && teamExclusionMultiSelect) {
                const exclusionTeamIds = teamExclusionMultiSelect.getSelectedValues();
                if (exclusionTeamIds.length > 0) {
                    const championsToExcludeSet = new Set();
                    exclusionTeamIds.forEach(teamId => {
                        const teamToExclude = savedTeams.find(st => st.id === teamId);
                        if (teamToExclude?.members) {
                            teamToExclude.members.forEach(member => championsToExcludeSet.add(member.dbChampionId));
                        }
                    });
                    excludedChampionDbIds = Array.from(championsToExcludeSet);
                }
            }
            
            const suggestions = calculator.findUpgradeSuggestions(
                currentDisplayedTeam, 
                playerRoster, 
                GAME_CONSTANTS, 
                requireHealer, 
                excludedChampionDbIds,
                requiredSynergies
            );
            
            let html = `<div class="p-6 bg-slate-900/70 backdrop-blur-sm rounded-lg border border-blue-500/20">
                           <h3 class="text-2xl font-bold text-blue-300 mb-4">Upgrade Suggestions</h3>`;

            if (suggestions.length === 0) {
                html += `<p class="text-slate-400">No single-step upgrade was found to improve your current best team.</p>`;
            } else {
                html += `<p class="text-slate-400 mb-4">These are the top-ranked upgrades that would improve your team score by replacing a current member.</p>
                         <div class="space-y-3">`;
                suggestions.slice(0, 5).forEach(sugg => {
                    let upgradeText = '';
                    switch (sugg.upgradeType) {
                        case 'Force Level':
                            upgradeText = `<strong>Force Level</strong> from ${sugg.fromValue} to ${sugg.toValue}`;
                            break;
                        case 'Gear':
                            upgradeText = `<strong>${sugg.itemName} Gear</strong> from ${sugg.fromValue} to ${sugg.toValue}`;
                            break;
                        case 'Legacy Piece':
                            upgradeText = `<strong>${sugg.itemName}</strong> from ${sugg.fromValue} to ${sugg.toValue}`;
                            break;
                        default:
                            upgradeText = `${sugg.upgradeType} from ${sugg.fromValue} to ${sugg.toValue}`;
                    }

                    html += `<div class="p-3 bg-slate-800 rounded-md border border-slate-700 hover:border-blue-700 transition">
                                <p class="font-semibold text-blue-300">
                                    Upgrade <strong class="text-green-400">${sugg.championToUpgrade.name}</strong>'s ${upgradeText}.
                                </p>
                                <p class="text-sm text-slate-400">
                                    This would replace <strong class="text-red-400">${sugg.displacedChampion.name}</strong> on the team,
                                    increasing the total score by <strong class="text-green-400">+${Math.round(sugg.scoreIncrease)}</strong> 
                                    to a new total of <strong>${Math.round(sugg.newTeamScore)}</strong>.
                                </p>
                             </div>`;
                });
                html += `</div>`;
            }
            html += `</div>`;
            outputContainer.innerHTML = html;

        } catch (error) {
            outputContainer.innerHTML = `<p class="text-red-400 p-4 bg-red-900/50 rounded-lg">Could not analyze upgrades. Error: ${error.message}</p>`;
            logEvent(analytics, 'exception', { description: `upgrade_suggestion_failed: ${error.message}` });
        }
    }, 50);
}

/**
 * @description Initiates the team calculation process.
 * @async
 */
async function handleCalculate() {
    if (playerRoster.length < 5) { showToast("You need at least 5 champions in your roster.", "warning"); return; }
    openModal('processingModal', `<div class="modal-content"><h3>Calculating...</h3><div class="loading-spinner mx-auto"></div><p id="processing-status" class="text-slate-300 mt-4 text-center">Initializing...</p></div>`);
    
    const requireHealer = DOM.requireHealerCheckbox.checked;
    const excludeTeams = DOM.excludeSavedTeamCheckbox.checked;
    const requiredSynergies = synergyMultiSelect.getSelectedValues();
    
    try {
        let rosterForCalc = playerRoster.map(champ => ({ ...champ, individualScore: TeamCalculator.calculateIndividualChampionScore(champ, GAME_CONSTANTS) }));
        let excludedCount = 0;
        let synergyFilteredCount = 0;

        if (requiredSynergies.length > 0) {
            const originalSize = rosterForCalc.length;
            rosterForCalc = rosterForCalc.filter(champ => 
                Array.isArray(champ.inherentSynergies) && champ.inherentSynergies.some(s => requiredSynergies.includes(s))
            );
            synergyFilteredCount = originalSize - rosterForCalc.length;
            if (rosterForCalc.length < 5) {
                throw new Error("Not enough champions match the selected synergy filter to form a team.");
            }
        }

        if (excludeTeams && teamExclusionMultiSelect) {
            const exclusionTeamIds = teamExclusionMultiSelect.getSelectedValues();
            if (exclusionTeamIds.length > 0) {
                const championsToExcludeIds = new Set();
                exclusionTeamIds.forEach(teamId => {
                    const teamToExclude = savedTeams.find(st => st.id === teamId);
                    if (teamToExclude?.members) teamToExclude.members.forEach(member => championsToExcludeIds.add(member.dbChampionId));
                });
                const originalSize = rosterForCalc.length;
                rosterForCalc = rosterForCalc.filter(champ => !championsToExcludeIds.has(champ.dbChampionId));
                excludedCount = originalSize - rosterForCalc.length;
            }
        }
        if (rosterForCalc.length < 5) { throw new Error("Not enough champions remaining after exclusion to form a team."); }
        
        const calculator = new TeamCalculator(dbSynergies, GAME_CONSTANTS);
        const bestTeam = await calculator.findOptimalTeam(rosterForCalc, {
            requireHealer,
            updateProgress: (status) => { 
                const statusP = document.getElementById('processing-status');
                if (statusP) statusP.textContent = status;
            }
        });

        originalBestTeam = JSON.parse(JSON.stringify(bestTeam));
        currentDisplayedTeam = JSON.parse(JSON.stringify(bestTeam));
        displayTeamResults(currentDisplayedTeam);
        
        logEvent(analytics, 'calculate_team_success', {
            roster_size: playerRoster.length,
            require_healer: requireHealer,
            excluded_teams: excludeTeams,
            excluded_champions: excludedCount,
            best_team_score: Math.round(bestTeam.totalScore)
        });

    } catch (e) {
        showToast(e.message, "error");
        logEvent(analytics, 'calculate_team_failed', { error_message: e.message });
    } finally {
        closeModal('processingModal');
    }
}

/**
 * @description Renders the calculated team results to the page using the enhanced card style.
 * @param {object} team - The final team object from the calculator.
 */
function displayTeamResults(team) {
    if (!team) {
        DOM.resultsOutput.innerHTML = '<p class="text-center text-slate-400">Could not determine an optimal team.</p>';
        return;
    } 
    const isModified = originalBestTeam && JSON.stringify(team.members.map(m => m.id)) !== JSON.stringify(originalBestTeam.members.map(m => m.id));
    const scoreBreakdownHtml = getScoreBreakdownHtml(team);

    let html = `
        <div class="p-6 bg-slate-900/70 backdrop-blur-sm rounded-lg border border-blue-500/20">
            <div class="text-center mb-6">
                <h3 class="text-3xl font-bold text-blue-300">${isModified ? 'Modified Team' : 'Optimal Team Found!'}</h3>
                <p class="text-xl text-slate-300">Total Score: <strong class="text-white font-bold">${Math.round(team.totalScore)}</strong></p>
            </div>
            ${scoreBreakdownHtml}
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-8">`;

    team.members.forEach((member, index) => {
        const cleanName = (member.name || 'Unknown').replace(/[^a-zA-Z0-9-_]/g, "");
        const idKey = (member.name || '').toLowerCase().replace(/\s+/g, '_');
        const starRating = getStarRatingHTML(member.starColorTier);
        const forceLevel = `<p class="force-level">Force Lvl: ${member.forceLevel}</p>`;
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
                <div class="card-actions">
                     <button class="card-action-btn swap" data-action="swap" data-index="${index}" title="Swap Champion"><i class="fas fa-random"></i></button>
                </div>
            </div>`;
    });

    html += `</div>
        <div class="mt-8 text-center flex justify-center items-center flex-wrap gap-4">
            <button id="save-team-btn" class="btn btn-primary">Save This Team</button>
            <button id="find-upgrades-btn" class="btn btn-secondary">Find Upgrade Suggestions</button>`;
    if (isModified) {
        html += `<button id="reset-team-btn" class="btn btn-secondary">Reset to Original</button>`;
    }
    html += `</div>
        </div>
        <div id="upgrade-suggestions-output" class="mt-8"></div>`;

    DOM.resultsOutput.innerHTML = html;
    applyChampionCardBackgrounds();

    DOM.resultsOutput.querySelectorAll('[data-action="swap"]').forEach(button => {
        button.addEventListener('click', e => {
            e.stopPropagation();
            const index = parseInt(e.currentTarget.dataset.index, 10);
            openSwapModal(index);
        });
    });
}

/**
 * @description Renders the list of saved teams and updates the exclusion pillbox.
 */
function renderSavedTeams() {
    const listEl = DOM.savedTeamsList;
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!savedTeams || savedTeams.length === 0) {
        listEl.innerHTML = '<p class="text-center text-slate-400 text-xl">No teams saved yet.</p>';
        if (teamExclusionMultiSelect) {
            teamExclusionMultiSelect.destroy();
            teamExclusionMultiSelect = null;
        }
        return;
    }

    if (teamExclusionMultiSelect) {
        teamExclusionMultiSelect.updateOptions(savedTeams);
    } else {
        teamExclusionMultiSelect = createTeamExclusionMultiSelect(savedTeams);
    }

    const calculator = new TeamCalculator(dbSynergies, GAME_CONSTANTS);
    savedTeams.forEach(team => {
        const membersWithScores = ensureIndividualScores(team.members, dbChampions);
        const reEvaluatedTeam = calculator.evaluateTeam(membersWithScores);
        const teamCard = document.createElement('div');
        teamCard.className = 'saved-team-card p-6 bg-slate-900/70 backdrop-blur-sm rounded-lg border border-blue-500/20';

        const shareButtonHtml = team.publicShareId ? `<button class="btn btn-secondary btn-sm" data-action="unshare" data-id="${team.id}" data-public-id="${team.publicShareId}">Unshare</button>` : `<button class="btn btn-primary btn-sm" data-action="share" data-id="${team.id}">Share</button>`;
        const shareUrl = `${window.location.origin}${window.location.pathname.replace('teams.html', 'share.html')}?sharedTeamId=${team.publicShareId}`;
        const teamNameHtml = team.publicShareId ? `<h4 class="font-bold text-xl text-blue-300 flex items-center gap-2">${team.name}<a href="${shareUrl}" target="_blank" class="text-blue-400 hover:underline" title="View Shared Page"><i class="fas fa-external-link-alt"></i></a></h4>` : `<h4 class="font-bold text-xl text-blue-300">${team.name}</h4>`;

        const headerHtml = `<div class="flex justify-between items-start mb-4 pb-4 border-b border-blue-500/20"><div>${teamNameHtml}<p class="text-sm text-slate-400">Total Score: <strong>${Math.round(reEvaluatedTeam.totalScore)}</strong></p></div><div class="flex items-center gap-2">${shareButtonHtml}<button class="btn btn-secondary btn-sm" data-action="rename" data-id="${team.id}" data-name="${team.name.replace(/'/g, "\\'")}"><i class="fas fa-pencil-alt"></i></button><button class="btn btn-secondary btn-sm" data-action="delete" data-id="${team.id}"><i class="fas fa-trash"></i></button></div></div>`;

        const membersHtml = `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">${reEvaluatedTeam.members.map(member => {
            const cleanName = (member.name || 'Unknown').replace(/[^a-zA-Z0-9-_]/g, "");
            const idKey = (member.name || '').toLowerCase().replace(/\s+/g, '_');
            const starRating = getStarRatingHTML(member.starColorTier);
            const forceLevel = `<p class="force-level !text-xs">Force Lvl: ${member.forceLevel}</p>`;
            const synergies = (member.inherentSynergies || []).map(getSynergyIcon).join('');

            return `<div class="champion-card-enhanced is-small" data-champion-name="${cleanName}" data-champion-id-key="${idKey}">
                        <div class="card-background-image"></div>
                        <div class="card-top-info">${getClassPlaceholder(member.class)}</div>
                        <div class="card-image-container"><img src="img/champions/full/${cleanName}.webp" class="card-avatar-top" onerror="this.src='img/champions/avatars/${cleanName}.webp'"></div>
                        <div class="card-content-bottom">
                            <h4 class="champion-name">${member.name}</h4>
                            <div class="champion-details !text-xs">
                                <p>${member.baseRarity}</p>${starRating}${forceLevel}
                            </div>
                            <div class="synergy-icons is-small">${synergies}</div>
                        </div>
                    </div>`;
        }).join('')}</div>`;

        teamCard.innerHTML = headerHtml + membersHtml;
        listEl.appendChild(teamCard);
    });
    applyChampionCardBackgrounds();
}

/**
 * @description Saves the currently displayed best team to Firestore.
 * @async
 */
async function saveCurrentBestTeam() {
    if (!currentDisplayedTeam) { showToast("No team to save.", "warning"); return; }
    const defaultName = `Team (Score: ${Math.round(currentDisplayedTeam.totalScore)})`;
    openTeamNameModal(defaultName, 'Save Team', async (teamName) => {
        if (!userId) { showToast("You must be logged in to save teams.", "error"); return; }
        const teamData = {
            name: teamName,
            members: currentDisplayedTeam.members.map(m => ({ dbChampionId: m.dbChampionId, name: m.name, baseRarity: m.baseRarity, class: m.class, isHealer: m.isHealer === true, starColorTier: m.starColorTier, forceLevel: m.forceLevel || 0, gear: m.gear, legacyPiece: m.legacyPiece, inherentSynergies: m.inherentSynergies || [], individualScore: m.individualScore })),
            totalScore: currentDisplayedTeam.totalScore, activeSynergies: currentDisplayedTeam.activeSynergies, scoreBreakdown: currentDisplayedTeam.scoreBreakdown,
            baseScoreSum: currentDisplayedTeam.baseScoreSum, uniqueClassesCount: currentDisplayedTeam.uniqueClassesCount, classDiversityBonusApplied: currentDisplayedTeam.classDiversityBonusApplied,
            createdAt: serverTimestamp()
        };
        try {
            const docRef = await addDoc(collection(db, `artifacts/${appId}/users/${userId}/savedTeams`), teamData);
            showToast("Team saved successfully!", "success");
            logEvent(analytics, 'save_team', { team_id: docRef.id, team_score: teamData.totalScore });
            await loadSavedTeamsFromFirestore();
        } catch (error) {
            console.error("Error saving team:", error);
            showToast("Failed to save team.", "error");
        }
    });
}

/**
 * @description Loads all of the user's saved teams from Firestore.
 * @async
 */
async function loadSavedTeamsFromFirestore() { 
    if (!userId || !db) return;
    try {
        const q = query(collection(db, `artifacts/${appId}/users/${userId}/savedTeams`), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        savedTeams = querySnapshot.docs.map(doc => {
            const data = doc.data();
            const members = (data.members || []).map(member => {
                 const base = dbChampions.find(c => c.id === member.dbChampionId) || {};
                 return {...base, ...member};
            });
            return { id: doc.id, ...data, members };
        });
        renderSavedTeams();
    } catch (error) {
        console.error("Error loading saved teams:", error);
        if (DOM.savedTeamsList) {
            DOM.savedTeamsList.innerHTML = `<p class="text-red-500">Error loading saved teams.</p>`;
        }
    }
}

// =================================================================================================
// #endregion Team Calculation & Display
// =================================================================================================

// =================================================================================================
// #region UI Helpers & Modals
// =================================================================================================

/**
 * @description Checks for and handles specific URL parameters on page load.
 * Handles 'addChampion' to pre-fill the form and 'search' to filter the roster.
 */
function handleUrlParameters() {
    const params = new URLSearchParams(window.location.search);
    const championIdToAdd = params.get('addChampion');
    const championNameToSearch = params.get('search');
    const authToken = params.get('auth_token');

    if (championIdToAdd) {
        const isChampionInRoster = playerRoster.some(c => c.dbChampionId === championIdToAdd);
        
        if (isChampionInRoster) {
            const champion = dbChampions.find(c => c.id === championIdToAdd);
            if (champion) {
                DOM.rosterSearchInput.value = decodeURIComponent(championNameToSearch);
                shouldScrollToRoster = true; 
                DOM.rosterSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
                
                showToast(`${champion.name} is already in your roster.`, 'info');
            }
        } else {
            DOM.champSelectDb.value = championIdToAdd;
            DOM.champSelectDb.dispatchEvent(new Event('change'));
            showToast('Champion ready to be added!', 'success');
            if (DOM.step1Content) {
                DOM.step1Content.scrollIntoView({ behavior: 'smooth' });
            }
        }
    } else if (championNameToSearch) {
        DOM.rosterSearchInput.value = decodeURIComponent(championNameToSearch);
        shouldScrollToRoster = true; 
        DOM.rosterSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

/**
 * @description Creates an interactive star rating component.
 * @param {string} containerId - The ID of the container element for the component.
 * @param {string} hiddenInputId - The ID of the hidden input that stores the component's value.
 * @returns {object} An object with a `setValue` method to programmatically update the component.
 */
function createStarSelector(containerId, hiddenInputId) {
    const container = document.getElementById(containerId);
    const hiddenInput = document.getElementById(hiddenInputId);
    if (!container || !hiddenInput) return;

    const tiers = ["Unlocked", "White", "Blue", "Purple", "Gold", "Red"];
    let selectedTier = "Unlocked";
    let selectedStars = 0;

    container.innerHTML = `
        <div class="star-selector-tiers"></div>
        <div class="star-selector-stars"></div>
    `;

    const tiersContainer = container.querySelector('.star-selector-tiers');
    const starsContainer = container.querySelector('.star-selector-stars');

    tiers.forEach(tier => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'star-selector-tier-btn';
        btn.dataset.tier = tier;
        btn.textContent = tier;
        tiersContainer.appendChild(btn);
    });

    for (let i = 1; i <= 5; i++) {
        const star = document.createElement('span');
        star.className = 'star-selector-star';
        star.dataset.value = i;
        star.innerHTML = '&#9733;';
        starsContainer.appendChild(star);
    }

    const updateVisuals = () => {
        tiers.forEach(t => {
            starsContainer.classList.remove(`tier-${t.toLowerCase()}`);
        });
        starsContainer.classList.add(`tier-${selectedTier.toLowerCase()}`);
        
        tiersContainer.querySelectorAll('.star-selector-tier-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tier === selectedTier);
        });
        
        starsContainer.querySelectorAll('.star-selector-star').forEach(star => {
            star.classList.toggle('active', parseInt(star.dataset.value, 10) <= selectedStars);
        });
        
        starsContainer.style.display = selectedTier === 'Unlocked' ? 'none' : 'flex';
    };

    const updateValue = () => {
        if (selectedTier === 'Unlocked') {
            hiddenInput.value = 'Unlocked';
        } else {
            hiddenInput.value = `${selectedTier} ${selectedStars}-Star`;
        }
        updateVisuals();
    };

    tiersContainer.addEventListener('click', e => {
        if (e.target.matches('.star-selector-tier-btn')) {
            selectedTier = e.target.dataset.tier;
            if (selectedTier === 'Unlocked') {
                selectedStars = 0;
            } else if (selectedStars === 0) {
                selectedStars = 1;
            }
            updateValue();
        }
    });

    starsContainer.addEventListener('click', e => {
        if (e.target.matches('.star-selector-star')) {
            selectedStars = parseInt(e.target.dataset.value, 10);
            if (selectedTier === 'Unlocked') {
                selectedTier = 'White';
            }
            updateValue();
        }
    });

    const setValue = (valueString) => {
        if (!valueString || valueString === "Unlocked") {
            selectedTier = "Unlocked";
            selectedStars = 0;
        } else {
            const parts = valueString.split(' ');
            selectedTier = parts[0];
            selectedStars = parseInt(parts[1], 10) || 0;
        }
        updateValue();
    };

    setValue('Unlocked');

    return { setValue };
}

/**
 * @description Applies the correct background image (comic or avatar) to rendered champion cards.
 */
function applyChampionCardBackgrounds() {

    document.querySelectorAll('.champion-card-enhanced').forEach(card => {
        const bgElement = card.querySelector('.card-background-image');
        const championName = card.dataset.championName;
        const championId = card.dataset.championIdKey;

        if (!bgElement || !championId) return;

        const data = characterComicsData.get(championId);

        if (data && data.imageUrl) {
            bgElement.style.backgroundImage = `url('${data.imageUrl}')`;
            card.classList.remove('is-fallback-avatar');
        }
    });
}


/**
 * @description Generates an HTML string for a synergy icon.
 * @param {string} synergyName - The name of the synergy.
 * @returns {string} The HTML string for the icon.
 */
function getSynergyIcon(synergyName) {
    if (!synergyName) return '';
    const nameForIcon = synergyName.trim().replace(/\s+/g, '_');
    const fallbackSpan = `<span class="icon-placeholder text-xs" style="display:none;">[${synergyName}]</span>`;
    return `<span class="icon-wrapper" title="${synergyName}"><img src="img/factions/${nameForIcon}.png" alt="${synergyName}" class="synergy-icon" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';">${fallbackSpan}</span>`;
}

/**
 * @description Generates an HTML string for the healer icon.
 * @returns {string} The HTML string for the icon.
 */
function getHealerPlaceholder() {
    const fallbackSpan = `<span class="icon-placeholder" style="display:none;">[H]</span>`;
    return `<span class="icon-wrapper"><img src="img/classes/Healer.png" alt="Healer" title="Healer" class="icon-class-table" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';"/>${fallbackSpan}</span>`;
}

/**
 * @description Generates an HTML string for a champion class icon.
 * @param {string} className - The name of the class.
 * @returns {string} The HTML string for the icon.
 */
function getClassPlaceholder(className) {
    const cn = (className || "N/A").trim().replace(/\s+/g, '_');
    if (cn === "N/A" || cn === "") { return `<span class="icon-placeholder">[Class N/A]</span>`; }
    const fallbackSpan = `<span class="icon-placeholder" style="display:none;">[${cn.replace(/_/g, ' ')}]</span>`;
    const imgSrc = `img/classes/${cn}.png`;
    return `<span class="icon-wrapper"><img src="${imgSrc}" alt="${cn.replace(/_/g, ' ')}" title="${cn.replace(/_/g, ' ')}" class="icon-class-table" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';"/>${fallbackSpan}</span>`;
}

/**
 * @description Shows or hides the main loading indicator for the page.
 * @param {boolean} isLoading - Whether to show the loading indicator.
 * @param {string} [message='Loading...'] - The message to display.
 */
function showLoading(isLoading, message = 'Loading...') {
    if (isLoading) {
        DOM.loadingIndicator.querySelector('p').textContent = message;
        DOM.loadingIndicator.classList.remove('hidden');
        DOM.mainAppContent.classList.add('hidden');
    } else {
        DOM.loadingIndicator.classList.add('hidden');
        DOM.mainAppContent.classList.remove('hidden');
    }
}

/**
 * @description Displays a global error message, hiding the main content.
 * @param {string} message - The primary error message.
 * @param {string} [details=''] - Additional details for the error.
 */
function showError(message, details = '') {
    showLoading(false);
    DOM.errorIndicator.classList.remove('hidden');
    DOM.errorIndicator.querySelector('p').textContent = message;
    DOM.errorMessageDetails.textContent = details;
}

/**
 * @description Toggles the visibility of the custom champion selection dropdown.
 */
function toggleChampionDropdown() {
    const isExpanded = DOM.customChampDropdownTrigger.getAttribute('aria-expanded') === 'true';
    DOM.customChampDropdownOptions.classList.toggle('hidden', isExpanded);
    DOM.customChampDropdownTrigger.setAttribute('aria-expanded', String(!isExpanded));
}

/**
 * @description Populates the champion selection dropdown with available (un-rostered) champions.
 */
function populateChampionSelect() {
    const optionsEl = DOM.customChampDropdownOptions;
    optionsEl.innerHTML = '';
    DOM.selectedChampName.textContent = '-- Select Champion --';
    DOM.selectedChampImg.classList.add('hidden');
    DOM.champSelectDb.value = '';
    const rosteredIds = playerRoster.map(c => c.dbChampionId);
    const availableChamps = dbChampions.filter(c => !rosteredIds.includes(c.id) || (editingChampionId && c.id === playerRoster.find(r => r.id === editingChampionId)?.dbChampionId)).sort((a,b) => a.name.localeCompare(b.name));
    availableChamps.forEach(champ => {
        const li = document.createElement('li');
        li.dataset.value = champ.id;
        li.innerHTML = `<div class="flex items-center"><img src="img/champions/avatars/${champ.name.replace(/[^a-zA-Z0-9-_]/g, "")}.webp" alt="${champ.name}" class="champion-avatar"><span class="ml-3 font-normal block truncate">${champ.name}</span></div>`;
        li.addEventListener('click', () => {
            DOM.champSelectDb.value = champ.id;
            DOM.selectedChampName.textContent = champ.name;
            DOM.selectedChampImg.src = `img/champions/avatars/${champ.name.replace(/[^a-zA-Z0-9-_]/g, "")}.webp`;
            DOM.selectedChampImg.classList.remove('hidden');
            toggleChampionDropdown();
            DOM.champSelectDb.dispatchEvent(new Event('change'));
        });
        optionsEl.appendChild(li);
    });
    DOM.customChampDropdownTrigger.disabled = false;
}

/**
 * @description Updates the champion form display when a new champion is selected.
 * @param {string} championId - The ID of the selected champion from the database.
 * @param {boolean} [isEditing=false] - Flag to prevent resetting the form when populating for an edit.
 */
function updateChampionFormDisplay(championId, isEditing = false) {
    const champ = dbChampions.find(c => c.id === championId);
    if (!champ) {
        if (!isEditing) {
            DOM.selectedChampName.textContent = '-- Select Champion --';
            DOM.selectedChampImg.classList.add('hidden');
        }
        populateLegacyPieceSelect(null);
        return;
    }
    DOM.selectedChampName.textContent = champ.name;
    DOM.selectedChampImg.src = `img/champions/avatars/${champ.name.replace(/[^a-zA-Z0-9-_]/g, "")}.webp`;
    DOM.selectedChampImg.classList.remove('hidden');
    populateLegacyPieceSelect(champ.class);
}

/**
 * @description Toggles the visibility of the custom Legacy Piece selection dropdown.
 */
function toggleLPDropdown() {
    const isExpanded = DOM.customLPDropdownTrigger.getAttribute('aria-expanded') === 'true';
    DOM.customLPDropdownOptions.classList.toggle('hidden', isExpanded);
    DOM.customLPDropdownTrigger.setAttribute('aria-expanded', String(!isExpanded));
}

/**
 * @description Populates the legacy piece dropdown, filtering by the selected champion's class.
 * @param {string|null} championClass - The class of the currently selected champion.
 */
function populateLegacyPieceSelect(championClass) {
    const optionsEl = DOM.customLPDropdownOptions;
    const hiddenInput = DOM.legacyPieceSelect;
    const triggerName = DOM.selectedLPName;

    optionsEl.innerHTML = '';
    const currentVal = hiddenInput.value;

    const noneLi = document.createElement('li');
    noneLi.dataset.value = '';
    noneLi.innerHTML = `<span>-- None --</span>`;
    noneLi.addEventListener('click', () => {
        hiddenInput.value = '';
        triggerName.textContent = '-- None --';
        toggleLPDropdown();
    });
    optionsEl.appendChild(noneLi);

    let filtered = dbLegacyPieces;
    if (championClass) {
        filtered = dbLegacyPieces.filter(lp => !lp.description || lp.description.toLowerCase().includes(championClass.toLowerCase()));
    }

    filtered.forEach(lp => {
        const li = document.createElement('li');
        li.dataset.value = lp.id;
        li.innerHTML = `<span>${lp.name} (${lp.baseRarity})</span>`;
        li.addEventListener('click', () => {
            hiddenInput.value = lp.id;
            triggerName.textContent = `${lp.name} (${lp.baseRarity})`;
            toggleLPDropdown();
        });
        optionsEl.appendChild(li);
    });

    const selectedOption = filtered.find(lp => lp.id === currentVal);
    if (selectedOption) {
        triggerName.textContent = `${selectedOption.name} (${selectedOption.baseRarity})`;
    } else {
        hiddenInput.value = '';
        triggerName.textContent = '-- None --';
    }
}

/**
 * @description Generates HTML for a star rating display.
 * @param {string} tier - The star tier string (e.g., "Gold 5-Star").
 * @returns {string} The HTML string for the star rating.
 */
function getStarRatingHTML(tier) {
    if (!tier || tier === "Unlocked") return `<span class="text-slate-400">Unlocked</span>`;
    const tierParts = tier.split(' ');
    if (tierParts.length < 2) return `<span class="text-slate-400">${tier}</span>`;
    const color = tierParts[0], stars = tierParts[1], starCount = parseInt(stars, 10);
    if (isNaN(starCount)) return `<span class="text-slate-400">${tier}</span>`;
    let colorClass = 'text-slate-400';
    if (color === 'Red') colorClass = 'text-red-500';
    else if (color === 'Gold') colorClass = 'text-yellow-400';
    else if (color === 'Purple') colorClass = 'text-purple-500';
    else if (color === 'Blue') colorClass = 'text-blue-500';
    return `<div class="star-rating inline-block" title="${tier}"><span class="${colorClass}">${'★'.repeat(starCount)}</span><span class="text-slate-300">${'★'.repeat(5-starCount)}</span></div>`;
}

/**
 * @description Opens a modal dialog.
 * @param {string} modalId - The key for the modal in the DOM object (e.g., 'teamNameModal').
 * @param {string} [content] - Optional HTML content to inject into the modal.
 */
function openModal(modalId, content) {
    const modal = DOM[modalId];
    if(modal) {
        if(content) modal.innerHTML = content;
        modal.classList.remove('hidden');
        modal.classList.add('is-open');
    }
}

/**
 * @description Closes a modal dialog.
 * @param {string} modalId - The key for the modal in the DOM object.
 */
function closeModal(modalId) {
    const modal = DOM[modalId];
    if(modal) {
        modal.classList.remove('is-open');
        setTimeout(() => {
          modal.classList.add('hidden');
           if (modalId === 'confirmModal' || modalId === 'teamNameModal' || modalId === 'shareTeamModal') {
               modal.innerHTML = ''; 
          }
        }, 300);
    }
}

/**
 * @description Opens a modal for entering a team name.
 * @param {string} defaultName - The default name to show in the input.
 * @param {string} title - The title for the modal.
 * @param {Function} callback - The function to call with the new name when confirmed.
 */
function openTeamNameModal(defaultName, title, callback) {
    const content = `<div class="modal-content"><h3>${title}</h3><div class="input-group"><label for="team-name-input" style="color: #94a3b8; font-weight: 600; font-size: 0.875rem; margin-bottom: 0.5rem; display: block;">Team Name</label><input type="text" id="team-name-input" value="${defaultName}" style="width: 100%; background-color: #0d1226; border: 1px solid rgba(59, 130, 246, 0.3); color: #e2e8f0; padding: 0.75rem; border-radius: 8px; font-size: 1rem;"></div><div class="modal-buttons"><button id="modal-cancel-btn" class="btn btn-secondary">Cancel</button><button id="modal-confirm-btn" class="btn btn-primary">Save</button></div></div>`;
    openModal('teamNameModal', content);
    const confirmBtn = DOM.teamNameModal.querySelector('#modal-confirm-btn');
    const cancelBtn = DOM.teamNameModal.querySelector('#modal-cancel-btn');
    const inputEl = DOM.teamNameModal.querySelector('#team-name-input');
    teamModalCallback = callback;
    const confirmHandler = () => {
        const teamName = inputEl.value.trim();
        if (teamName && teamModalCallback) { teamModalCallback(teamName); }
        closeModal('teamNameModal');
    };
    const cancelHandler = () => closeModal('teamNameModal');
    confirmBtn.addEventListener('click', confirmHandler, { once: true });
    cancelBtn.addEventListener('click', cancelHandler, { once: true });
    DOM.teamNameModal.addEventListener('click', (e) => { if (e.target === DOM.teamNameModal) cancelHandler(); }, { once: true });
}

/**
 * @description Opens a generic confirmation modal.
 * @param {string} title - The title for the modal.
 * @param {string} message - The confirmation message to display.
 * @param {Function} onConfirm - The callback to execute if the user confirms.
 * @param {Function} [onCancel=null] - The callback to execute if the user cancels.
 */
function openConfirmModal(title, message, onConfirm, onCancel = null) {
    const content = `<div class="modal-content"><h3>${title}</h3><p class="text-slate-300 text-center">${message}</p><div class="modal-buttons"><button id="modal-cancel-btn" class="btn btn-secondary">Cancel</button><button id="modal-confirm-btn" class="btn btn-primary">Confirm</button></div></div>`;
    openModal('confirmModal', content);
    const confirmBtn = DOM.confirmModal.querySelector('#modal-confirm-btn');
    const cancelBtn = DOM.confirmModal.querySelector('#modal-cancel-btn');
    const confirmHandler = () => { if (onConfirm) onConfirm(); closeModal('confirmModal'); };
    const cancelHandler = () => { if (onCancel) onCancel(); closeModal('confirmModal'); };
    confirmBtn.addEventListener('click', confirmHandler, { once: true });
    cancelBtn.addEventListener('click', cancelHandler, { once: true });
    DOM.confirmModal.addEventListener('click', (e) => { if (e.target === DOM.confirmModal) cancelHandler(); }, { once: true });
}

/**
 * @description Displays a short-lived toast notification.
 * @param {string} message - The message to display.
 * @param {string} [type='info'] - The type of toast ('info', 'success', 'error', 'warning').
 * @param {number} [duration=3000] - The duration in milliseconds to show the toast.
 */
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    DOM.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }, 10);
}

// =================================================================================================
// #endregion UI Helpers & Modals
// =================================================================================================

/**
 * @description Shares a saved team by creating a public document and showing the share link.
 * @param {string} teamId - The ID of the saved team to share.
 * @async
 */
function shareTeam(teamId) {
    if (!userId || !db) return showToast("Not authenticated.", "error");
    const teamToShare = savedTeams.find(t => t.id === teamId);
    if (!teamToShare) return showToast("Team not found.", "error");
    openConfirmModal('Confirm Share', `Generate a public share link for "${teamToShare.name}"?`, async () => {
        try {
            const publicTeamData = {
                name: teamToShare.name, members: teamToShare.members, totalScore: teamToShare.totalScore, activeSynergies: teamToShare.activeSynergies,
                scoreBreakdown: teamToShare.scoreBreakdown, uniqueClassesCount: teamToShare.uniqueClassesCount, classDiversityBonusApplied: teamToShare.classDiversityBonusApplied,
                createdAt: serverTimestamp(), originalOwnerId: userId
            };
            const docRef = await addDoc(collection(db, `artifacts/${appId}/public/data/sharedTeams`), publicTeamData);
            await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/savedTeams`, teamId), { publicShareId: docRef.id });
            const shareLink = `${window.location.origin}${window.location.pathname.replace('teams.html', 'share.html')}?sharedTeamId=${docRef.id}`;
            openShareTeamModal(shareLink);
            showToast("Share link generated!", "success");
            logEvent(analytics, 'share', { content_type: 'team', item_id: teamId });
            await loadSavedTeamsFromFirestore();
        } catch (error) {
            console.error("Error sharing team:", error);
            showToast("Failed to share team.", "error");
        }
    });
};

/**
 * @description Makes a public team private again by deleting the shared document.
 * @param {string} teamId - The ID of the private saved team.
 * @param {string} publicShareId - The ID of the public shared document.
 * @async
 */
function unshareTeam(teamId, publicShareId) {
    if (!userId || !db) return showToast("Not authenticated.", "error");
    const teamToUnshare = savedTeams.find(t => t.id === teamId);
    if (!teamToUnshare) return showToast("Team not found.", "error");
    openConfirmModal('Confirm Unshare', `Remove the public link for "${teamToUnshare.name}"?`, async () => {
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/public/data/sharedTeams`, publicShareId));
            await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/savedTeams`, teamId), { publicShareId: deleteField() });
            showToast("Team is no longer shared.", "success");
            logEvent(analytics, 'unshare_team', { team_id: teamId });
            await loadSavedTeamsFromFirestore();
        } catch (error) {
            console.error("Error unsharing team:", error);
            showToast("Failed to unshare team.", "error");
        }
    });
};

/**
 * @description Opens a modal to rename a saved team.
 * @param {string} teamId - The ID of the team to rename.
 * @param {string} currentName - The current name of the team.
 */
function renameSavedTeam(teamId, currentName) {
    if (!userId || !db) return showToast("Not authenticated.", "error");
    openTeamNameModal(currentName, 'Rename Team', async (newName) => {
        if (newName && newName.trim() !== "" && newName.trim() !== currentName) {
            try {
                const teamDocRef = doc(db, `artifacts/${appId}/users/${userId}/savedTeams`, teamId);
                await updateDoc(teamDocRef, { name: newName.trim() });
                const team = savedTeams.find(t => t.id === teamId);
                if (team?.publicShareId) {
                    const publicTeamDocRef = doc(db, `artifacts/${appId}/public/data/sharedTeams`, team.publicShareId);
                    await updateDoc(publicTeamDocRef, { name: newName.trim() });
                }
                showToast("Team renamed successfully!", "success");
                logEvent(analytics, 'rename_team', { team_id: teamId });
                await loadSavedTeamsFromFirestore();
            } catch (error) {
                console.error("Error renaming team:", error);
                showToast("Failed to rename team.", "error");
            }
        }
    });
};

/**
 * @description Opens a confirmation modal to delete a saved team.
 * @param {string} teamId - The ID of the team to delete.
 */
function deleteSavedTeam(teamId) {
    if (!userId || !db) return showToast("Not authenticated.", "error");
    const teamToDelete = savedTeams.find(t => t.id === teamId);
    if (!teamToDelete) return showToast("Team not found.", "error");
    openConfirmModal('Confirm Deletion', `Are you sure you want to delete the team "${teamToDelete.name}"? This action cannot be undone.`, async () => {
        try {
            if (teamToDelete.publicShareId) {
                await deleteDoc(doc(db, `artifacts/${appId}/public/data/sharedTeams`, teamToDelete.publicShareId));
            }
            await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/savedTeams`, teamId));
            showToast(`Team "${teamToDelete.name}" deleted.`, "success");
            logEvent(analytics, 'delete_team', { team_id: teamId });
            await loadSavedTeamsFromFirestore();
        } catch (error) {
            console.error("Error deleting team:", error);
            showToast("Failed to delete team.", "error");
        }
    });
};

/**
 * @description Opens a modal to display and copy a shareable link.
 * @param {string} shareLink - The URL to display.
 */
function openShareTeamModal(shareLink) {
    const content = `<div class="modal-content"><h3>Share Team Link</h3><p class="text-slate-300 text-center mb-4">Anyone with this link can view this team.</p><div class="input-group"><input type="text" id="share-link-input" value="${shareLink}" readonly style="width: 100%; background-color: #0d1226; border: 1px solid rgba(59, 130, 246, 0.3); color: #e2e8f0; padding: 0.75rem; border-radius: 8px; font-size: 1rem;"></div><div class="modal-buttons mt-4"><button id="modal-close-btn" class="btn btn-secondary">Close</button><button id="modal-copy-btn" class="btn btn-primary">Copy Link</button></div></div>`;
    openModal('shareTeamModal', content);
    const copyBtn = DOM.shareTeamModal.querySelector('#modal-copy-btn');
    const closeBtn = DOM.shareTeamModal.querySelector('#modal-close-btn');
    const inputEl = DOM.shareTeamModal.querySelector('#share-link-input');
    copyBtn.addEventListener('click', () => {
        inputEl.select();
        document.execCommand('copy');
        showToast('Link copied to clipboard!', 'success');
        logEvent(analytics, 'copy_share_link');
    });
    closeBtn.addEventListener('click', () => closeModal('shareTeamModal'));
}