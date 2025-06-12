/**
 * @file calculator.js
 * @fileoverview Interactive web application to calculate and simulate the "Anvil" cost for character upgrades in a gacha game.
 * It features two main functionalities:
 * 1.  **Expected Value (EV) Calculation**: Determines the average, best-case, and worst-case Anvil cost to upgrade a character between specified star levels.
 * 2.  **Probability Simulation**: Runs a Monte Carlo simulation to find the probability of successfully achieving an upgrade goal within a given Anvil budget.
 *
 * The application integrates with Firebase for user authentication, cloud storage of configurations, and analytics.
 * It also supports local import/export of settings and allows for UI customization.
 * A "Champion Guidance" feature pulls champion data and provides upgrade recommendations.
 *
 * @author Originally by the user, refactored and documented by Google's Gemini.
 * @version 3.1.0 - Replaced standard champion dropdown with a custom dropdown featuring images.
 */

// --- Firebase SDK Imports ---
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, query, orderBy, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent as fbLogEventInternal } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

/**
 * Creates a debounced function that delays invoking `func` until after `wait` milliseconds have elapsed
 * since the last time the debounced function was invoked.
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of milliseconds to delay.
 * @returns {Function} Returns the new debounced function.
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Creates a memoized version of a function. The cache is a simple object, so it's best for functions with primitive arguments.
 * @param {Function} func The function to memoize.
 * @returns {Function} The new memoized function.
 */
function memoize(func) {
    const cache = {};
    return function(...args) {
        const key = JSON.stringify(args);
        if (cache[key]) {
            return cache[key];
        }
        const result = func.apply(this, args);
        cache[key] = result;
        return result;
    };
}


// =================================================================================================
// #region: --- CONSTANTS & CONFIGURATION ---
// =================================================================================================

/**
 * @typedef {object} FirebaseConfig
 * @property {string} apiKey - The Firebase API key.
 * @property {string} authDomain - The Firebase authentication domain.
 * @property {string} projectId - The Firebase project ID.
 * @property {string} storageBucket - The Firebase storage bucket.
 * @property {string} messagingSenderId - The Firebase messaging sender ID.
 * @property {string} appId - The Firebase application ID.
 */

/**
 * Global constants and configuration settings for the application.
 * @namespace
 */
const CONSTANTS = {
    /** @type {string} */
    APP_ID: typeof __app_id !== 'undefined' ? __app_id : 'dc-dark-legion-builder',
    /** @type {FirebaseConfig} */
    FIREBASE_CONFIG: typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
        apiKey: "AIzaSyAzSQbS4LtAz20syWI2HREPR7UnYh6ldbI",
        authDomain: "dc-dark-legion-tools.firebaseapp.com",
        projectId: "dc-dark-legion-tools",
        storageBucket: "dc-dark-legion-tools.appspot.com",
        messagingSenderId: "786517074225",
        appId: "1:786517074225:web:9f14dc4dcae0705fcfd010",
        measurementId: "G-FTF00DHGV6"
    },
    /** The number of non-LM pulls before an LM pull is guaranteed. @type {number} */
    NM_GUARANTEE_THRESHOLD: 3,
    /** The number of simulation runs for the probability calculation. @type {number} */
    NUM_SIM_RUNS: 10000,
    /**
     * Shards required to reach each star level.
     * @type {Object.<string, number>}
     */
    SHARD_REQUIREMENTS: {
        "White 1-Star": 2, "White 2-Star": 5, "White 3-Star": 10, "White 4-Star": 20, "White 5-Star": 40,
        "Blue 1-Star": 60, "Blue 2-Star": 80, "Blue 3-Star": 100, "Blue 4-Star": 130, "Blue 5-Star": 160,
        "Purple 1-Star": 200, "Purple 2-Star": 240, "Purple 3-Star": 280, "Purple 4-Star": 320, "Purple 5-Star": 360,
        "Gold 1-Star": 400, "Gold 2-Star": 440, "Gold 3-Star": 480, "Gold 4-Star": 540, "Gold 5-Star": 600,
        "Red 1-Star": 680, "Red 2-Star": 760, "Red 3-Star": 840, "Red 4-Star": 920, "Red 5-Star": 1000
    },
    /** Chart.js styling options */
    CHART_STYLING: {
        GRID_COLOR: 'rgba(0, 0, 0, 0.1)',
        FONT_COLOR: '#6b7280',
        TITLE_COLOR: '#1e293b',
        TOOLTIP_BG_COLOR: '#f8fafc',
    },
     /** Debounce wait time in milliseconds for input calculations. @type {number} */
    DEBOUNCE_WAIT_MS: 300,
    /** Max steps in the guided mode wizard. @type {number} */
    WIZARD_MAX_STEPS: 2,
};

// =================================================================================================
// #region: --- APPLICATION STATE ---
// =================================================================================================

/**
 * Centralized state for the application.
 * @namespace
 */
const state = {
    /** @type {import("firebase/app").FirebaseApp|null} */
    fbApp: null,
    /** @type {import("firebase/auth").Auth|null} */
    fbAuth: null,
    /** @type {import("firebase/firestore").Firestore|null} */
    fbDb: null,
    /** @type {import("firebase/analytics").Analytics|null} */
    fbAnalytics: null,
    /** @type {string|null} */
    currentUserId: null,
    /** @type {import("firebase/firestore").CollectionReference|null} */
    championsColRef: null,
    /** @type {Function|null} */
    unsubscribeChampionsListener: null,
    /** The instance of the main anvil cost Chart.js chart. @type {Chart|null} */
    anvilCostChart: null,
    /** Whether the initial character unlock cost is included in calculations. @type {boolean} */
    isUnlockCostIncluded: false,
    /** NEW: Flag for guided mode. @type {boolean} */
    isGuidedMode: false,
    /** NEW: Current step in the wizard. @type {number} */
    wizardCurrentStep: 1,
};

// =================================================================================================
// #region: --- DOM ELEMENT REFERENCES ---
// =================================================================================================

/**
 * A collection of cached DOM element references.
 * @namespace
 */
const DOM = {
    // --- Main Containers ---
    calculatorSectionsContainer: document.getElementById('calculator-sections-container'),

    // --- View Switcher & Wizard ---
    switchToAdvancedBtn: document.getElementById('switchToAdvancedBtn'),
    switchToGuidedBtn: document.getElementById('switchToGuidedBtn'),
    wizardContainer: document.getElementById('wizard-container'),
    wizardStep1: document.getElementById('wizard-step-1'),
    wizardStep2: document.getElementById('wizard-step-2'),
    wizardStep3: document.getElementById('wizard-step-3'),
    wizardBudgetInputContainer: document.getElementById('wizard-budget-input-container'),
    wizardProbabilityStatus: document.getElementById('wizard-probability-status'),
    wizardResultsContainer: document.getElementById('wizard-results-container'),
    wizardNavigation: document.getElementById('wizard-navigation'),
    wizardBackBtn: document.getElementById('wizardBackBtn'),
    wizardNextBtn: document.getElementById('wizardNextBtn'),
    wizardStepIndicator: document.getElementById('wizard-step-indicator'),

    // --- Advanced View Sections ---
    championGuidanceSection: document.getElementById('championGuidanceSection'),
    probabilitySection: document.getElementById('probabilitySection'),
    anvilBudgetInputGroup: document.getElementById('anvilBudgetInputGroup'),
    results: document.getElementById('results'),
    probabilityResultsArea: document.getElementById('probabilityResultsArea'),

    // --- Inputs & Controls (shared or advanced) ---
    lmChampionSelect: document.getElementById('lmChampionSelect'), // This is now the hidden input
    customChampionDropdown: document.getElementById('customChampionDropdown'),
    customDropdownTrigger: document.getElementById('customDropdownTrigger'),
    customDropdownOptions: document.getElementById('customDropdownOptions'),
    selectedChampionImg: document.getElementById('selectedChampionImg'),
    selectedChampionName: document.getElementById('selectedChampionName'),
    guidanceButtons: document.getElementById('guidanceButtons'),
    f2pRecBtn: document.getElementById('f2pRecBtn'),
    minRecBtn: document.getElementById('minRecBtn'),
    guidanceStatus: document.getElementById('guidanceStatus'),
    userIdDisplay: document.getElementById('userIdDisplay'),
    mythicProbabilityInput: document.getElementById('mythicProbability'),
    mythicHardPityInput: document.getElementById('mythicHardPity'),
    currentMythicPityInput: document.getElementById('currentMythicPity'),
    currentLMPityInput: document.getElementById('currentLMPity'),
    lmRateUpChanceInput: document.getElementById('lmRateUpChance'),
    lmShardsYieldInput: document.getElementById('lmShardsYield'),
    anvilBudgetInput: document.getElementById('anvilBudget'),
    startStarLevelSelect: document.getElementById('startStarLevel'),
    targetStarLevelSelect: document.getElementById('targetStarLevel'),
    calculateBtn: document.getElementById('calculateBtn'),
    toggleUnlockCostBtn: document.getElementById('toggleUnlockCostBtn'),

    // --- Error & Status Displays ---
    mythicProbabilityError: document.getElementById('mythicProbabilityError'),
    mythicHardPityError: document.getElementById('mythicHardPityError'),
    currentMythicPityError: document.getElementById('currentMythicPityError'),
    currentLMPityError: document.getElementById('currentLMPityError'),
    lmRateUpChanceError: document.getElementById('lmRateUpChanceError'),
    lmShardsYieldError: document.getElementById('lmShardsYieldError'),
    starLevelError: document.getElementById('starLevelError'),
    probabilityStatusDiv: document.getElementById('probabilityStatus'),
    
    // --- Results Display ---
    shardsNeededForUpgradeSpan: document.getElementById('shardsNeededForUpgrade'),
    anvilsAvgSpan: document.getElementById('anvilsAvg'),
    anvilsBestSpan: document.getElementById('anvilsBest'),
    anvilsWorstSpan: document.getElementById('anvilsWorst'),
    systemTitle: document.getElementById('systemTitle'),
    unlockCostSection: document.getElementById('unlockCostSection'),
    anvilsUnlockAvgSpan: document.getElementById('anvilsUnlockAvg'),
    anvilsUnlockBestSpan: document.getElementById('anvilsUnlockBest'),
    anvilsUnlockWorstSpan: document.getElementById('anvilsUnlockWorst'),
    anvilCostBreakdownNote: document.getElementById('anvilCostBreakdownNote'),
    probabilitySummaryText: document.getElementById('probabilitySummaryText'),
    
    // --- Detailed Calculations Display ---
    detailUnlockCostSection: document.getElementById('detailUnlockCostSection'),
    calcDrawsPerMythicSpan: document.getElementById('calcDrawsPerMythic'),
    calcWorstCaseMythicsForLMSpan: document.getElementById('calcWorstCaseMythicsForLM'),
    calcAvgShardsSpan: document.getElementById('calcAvgShards'),
    detailLMSSpan: document.getElementById('detailLMS'),
    detailNMSSpan: document.getElementById('detailNMS'),
    detailAvgMythicsForLMSpan: document.getElementById('detailAvgMythicsForLM'),
    detailAnvilsUnlockAvgSpan: document.getElementById('detailAnvilsUnlockAvg'),
    detailAnvilsUnlockBestSpan: document.getElementById('detailAnvilsUnlockBest'),
    detailAnvilsUnlockWorstSpan: document.getElementById('detailAnvilsUnlockWorst'),
    detailTargetShardsSpan: document.getElementById('detailTargetShards'),
    detailAvgShardsSpan: document.getElementById('detailAvgShards'),
    detailMythicPullsAvgSpan: document.getElementById('detailMythicPullsAvg'),
    detailAnvilsAvgSpan: document.getElementById('detailAnvilsAvg'),
    detailBestShardsSpan: document.getElementById('detailBestShards'),
    detailMythicPullsBestSpan: document.getElementById('detailMythicPullsBest'),
    detailAnvilsBestSpan: document.getElementById('detailAnvilsBest'),
    detailWorstShardsSpan: document.getElementById('detailWorstShards'),
    detailMythicPullsWorstSpan: document.getElementById('detailMythicPullsWorst'),
    detailAnvilsWorstSpan: document.getElementById('detailAnvilsWorst'),
};


// =================================================================================================
// #region: --- SERVICES ---
// =================================================================================================

// ## Analytics Service ##

/**
 * Logs a custom event to Firebase Analytics if available.
 * @param {string} eventName - The name of the event to log.
 * @param {object} [params={}] - An object of key-value pairs to associate with the event.
 */
function logAnalyticEvent(eventName, params = {}) {
    if (state.fbAnalytics) {
        try {
            fbLogEventInternal(state.fbAnalytics, eventName, params);
        } catch (e) {
            console.warn(`Analytics event "${eventName}" failed:`, e);
        }
    } else {
        // console.log(`Analytics (not ready): ${eventName}`, params);
    }
}

// ## Calculation Service ##

/**
 * @typedef {object} LmCycleMetrics
 * @property {number} averageShardsPerEffectiveMythic - The average number of shards gained per mythic pull, considering the entire LM/NM cycle.
 * @property {number} expectedMythicPullsPerLmCycle - The average number of mythic pulls required to complete one full LM cycle (i.e., to get one LM).
 * @property {number} worstCaseMythicPullsPerLmCycle - The maximum number of mythic pulls to guarantee one LM.
 */

/**
 * Calculates the expected number of draws required to obtain one mythic item. This function is memoized for performance.
 * @param {number} mythicProbability - The base probability of a mythic pull (0 to 1).
 * @param {number} hardPity - The number of draws at which a mythic is guaranteed.
 * @returns {number} The expected number of draws per mythic, or NaN if inputs are invalid.
 */
const calculateExpectedDrawsPerMythic = memoize((mythicProbability, hardPity) => {
    if (!(mythicProbability > 0 && mythicProbability <= 1) || hardPity < 1) {
        return NaN;
    }
    let expectedDraws = 0.0;
    for (let k = 1; k < hardPity; k++) {
        const p_k = Math.pow(1 - mythicProbability, k - 1) * mythicProbability;
        expectedDraws += k * p_k;
    }
    expectedDraws += hardPity * Math.pow(1 - mythicProbability, hardPity - 1);
    return expectedDraws;
});

/**
 * Calculates metrics for a full "Legendary Mythic" (LM) cycle. This function is memoized for performance.
 * @param {number} lmShardYield - The number of shards from an LM pull.
 * @param {number} nmShardYield - The number of shards from a Non-Mythic (NM) pull.
 * @param {number} lmRateUpChance - The probability of a mythic being an LM (0 to 1).
 * @param {number} nmGuaranteeThreshold - The number of NM pulls before an LM is guaranteed.
 * @returns {LmCycleMetrics} The calculated metrics for the cycle.
 */
const calculateLmCycleMetrics = memoize((lmShardYield, nmShardYield, lmRateUpChance, nmGuaranteeThreshold) => {
    if (!(lmRateUpChance >= 0 && lmRateUpChance <= 1) || nmGuaranteeThreshold < 0) {
        return { averageShardsPerEffectiveMythic: NaN, expectedMythicPullsPerLmCycle: NaN, worstCaseMythicPullsPerLmCycle: NaN };
    }
    const nmRateUpChance = 1.0 - lmRateUpChance;
    let totalExpectedShardsInCycle = 0.0;
    let totalExpectedMythicPullsInCycle = 0.0;

    // Direct LM hit
    totalExpectedShardsInCycle += lmShardYield * lmRateUpChance;
    totalExpectedMythicPullsInCycle += 1 * lmRateUpChance;

    // Sequences of NM hits followed by an LM
    for (let i = 1; i < nmGuaranteeThreshold; i++) {
        const p_sequence = Math.pow(nmRateUpChance, i) * lmRateUpChance;
        totalExpectedShardsInCycle += ((nmShardYield * i) + lmShardYield) * p_sequence;
        totalExpectedMythicPullsInCycle += (i + 1) * p_sequence;
    }

    // Hitting the guarantee
    const p_guarantee_hit = Math.pow(nmRateUpChance, nmGuaranteeThreshold);
    totalExpectedShardsInCycle += ((nmShardYield * nmGuaranteeThreshold) + lmShardYield) * p_guarantee_hit;
    totalExpectedMythicPullsInCycle += (nmGuaranteeThreshold + 1) * p_guarantee_hit;

    const averageShards = (totalExpectedMythicPullsInCycle > 0) ? totalExpectedShardsInCycle / totalExpectedMythicPullsInCycle : 0.0;

    return {
        averageShardsPerEffectiveMythic: averageShards,
        expectedMythicPullsPerLmCycle: totalExpectedMythicPullsInCycle,
        worstCaseMythicPullsPerLmCycle: nmGuaranteeThreshold + 1
    };
});


/**
 * Calculates the total number of anvils needed to acquire a target number of shards.
 * @param {number} targetShards - The number of shards to acquire.
 * @param {number} avgShardsPerMythic - The average shards obtained per mythic pull.
 * @param {number} drawsPerMythic - The average draws required for one mythic pull.
 * @returns {number} The estimated total number of anvils. Returns 0 if targetShards <= 0, or Infinity if inputs are invalid.
 */
function calculateGachaAnvils(targetShards, avgShardsPerMythic, drawsPerMythic) {
    if (targetShards <= 0) return 0;
    if (avgShardsPerMythic <= 0 || drawsPerMythic <= 0) {
        return Infinity;
    }
    return Math.ceil(targetShards / avgShardsPerMythic) * drawsPerMythic;
}

/**
 * Initializes the Firebase app, authentication, and Firestore. Also sets up the auth state listener.
 * This version assumes the <auth-ui> component has already run initializeApp.
 * @async
 * @returns {Promise<boolean>} A promise that resolves to true if initialization was successful, false otherwise.
 */
async function initializeFirebaseAndAuth() {
    return new Promise((resolve, reject) => {
        document.addEventListener('firebase-ready', () => {
            if (!CONSTANTS.FIREBASE_CONFIG.projectId || CONSTANTS.FIREBASE_CONFIG.projectId.includes("YOUR_FALLBACK")) {
                console.warn("Firebase config is incomplete. Firestore features will be disabled.");
                DOM.userIdDisplay.textContent = "User ID: Firebase not configured";
                return resolve(false);
            }

            try {
                state.fbApp = getApp();
                state.fbAuth = getAuth(state.fbApp);
                state.fbDb = getFirestore(state.fbApp);
                state.fbAnalytics = getAnalytics(state.fbApp);

                onAuthStateChanged(state.fbAuth, handleAuthStateChange);
                
                resolve(true);
            } catch (error) {
                console.error("Firebase Connection Error in calculator.js:", error);
                UI.displayNotification("Failed to connect to Firebase services.", 'error', 'guidance');
                DOM.userIdDisplay.textContent = `User ID: Connection Error`;
                reject(error);
            }
        }, { once: true });
    });
}

/**
 * Handles changes in the user's authentication state.
 * @async
 * @param {import("firebase/auth").User|null} user - The current Firebase user object, or null if signed out.
 */
async function handleAuthStateChange(user) {
    if (user) {
        state.currentUserId = user.uid;
        DOM.userIdDisplay.textContent = `User ID: ${state.currentUserId.substring(0, 8)}...`;
        state.championsColRef = collection(state.fbDb, `artifacts/${CONSTANTS.APP_ID}/users/${state.currentUserId}/champions`);
        await populateLMChampionsDropdown(); 
        logAnalyticEvent('firebase_auth_status', { status: 'signed_in', method: user.isAnonymous ? 'anonymous' : 'custom' });
    } else {
        state.currentUserId = null;
        DOM.userIdDisplay.textContent = "User ID: Not signed in";
        state.championsColRef = null;
        DOM.selectedChampionName.textContent = '-- Sign in to load champions --';
        DOM.customDropdownTrigger.disabled = true;
        logAnalyticEvent('firebase_auth_status', { status: 'signed_out' });
    }
}

/**
 * Fetches the master list of Limited Mythic champions from the public Firestore collection and populates the custom guidance dropdown.
 * Recommendation data is stored on the option elements themselves.
 * @async
 */
async function populateLMChampionsDropdown() {
    if (!state.fbDb) {
        DOM.selectedChampionName.textContent = '-- DB Error --';
        return;
    }
    DOM.customDropdownTrigger.disabled = true;
    DOM.selectedChampionName.textContent = '-- Loading Champions... --';
    DOM.customDropdownOptions.innerHTML = '<li class="text-gray-500 px-4 py-2">Loading...</li>';

    try {
        const publicChampionsRef = collection(state.fbDb, `artifacts/${CONSTANTS.APP_ID}/public/data/champions`);
        const q = query(publicChampionsRef, where("baseRarity", "==", "Limited Mythic"), orderBy("name"));
        const querySnapshot = await getDocs(q);
        
        DOM.customDropdownOptions.innerHTML = ''; // Clear loading state
        
        // Add a default, non-selectable option
        const defaultOption = document.createElement('li');
        defaultOption.className = 'px-4 py-2 text-gray-500';
        defaultOption.textContent = '-- Select a Champion --';
        DOM.customDropdownOptions.appendChild(defaultOption);

        if (querySnapshot.empty) {
            DOM.selectedChampionName.textContent = '-- No LM Champions Found --';
            defaultOption.textContent = '-- No LM Champions Found --';
        } else {
            querySnapshot.forEach((doc) => {
                const champData = doc.data();
                const champName = champData.name || doc.id;
                const sanitizedName = champName.replace(/[^a-zA-Z0-9-_]/g, "");
                const imgSrc = `img/champions/avatars/${sanitizedName}.webp`;

                const optionEl = document.createElement('li');
                optionEl.className = 'text-gray-900 cursor-default select-none relative py-2 pl-3 pr-9 hover:bg-indigo-600 hover:text-white';
                optionEl.setAttribute('role', 'option');
                optionEl.dataset.value = champName;
                optionEl.dataset.recMin = champData.recommendationMin || 'not set';
                optionEl.dataset.recF2p = champData.recommendationF2P || 'not set';
                optionEl.dataset.imgSrc = imgSrc;

                optionEl.innerHTML = `
                    <div class="flex items-center">
                        <img src="${imgSrc}" alt="${champName}" class="h-6 w-6 flex-shrink-0 rounded-full" onerror="this.style.display='none'">
                        <span class="font-normal ml-3 block truncate">${champName}</span>
                    </div>
                `;

                // Event listener for selecting an option
                optionEl.addEventListener('click', () => {
                    // Update the hidden input
                    DOM.lmChampionSelect.value = optionEl.dataset.value;
                    // Copy dataset for recommendations to the hidden input
                    DOM.lmChampionSelect.dataset.recMin = optionEl.dataset.recMin;
                    DOM.lmChampionSelect.dataset.recF2p = optionEl.dataset.recF2p;

                    // Update the trigger button's display
                    DOM.selectedChampionName.textContent = optionEl.dataset.value;
                    DOM.selectedChampionImg.src = optionEl.dataset.imgSrc;
                    DOM.selectedChampionImg.classList.remove('hidden');
                    
                    // Hide the dropdown
                    DOM.customDropdownOptions.classList.add('hidden');
                    DOM.customDropdownTrigger.setAttribute('aria-expanded', 'false');

                    // Manually trigger a change event so other listeners can pick it up
                    DOM.lmChampionSelect.dispatchEvent(new Event('change'));
                });

                DOM.customDropdownOptions.appendChild(optionEl);
            });
            DOM.customDropdownTrigger.disabled = false;
            DOM.selectedChampionName.textContent = '-- Select a Champion --';
        }
        logAnalyticEvent('firestore_dropdown_populated', { type: 'lm_champions_custom', count: querySnapshot.size });
    } catch(error) {
        console.error("Error fetching LM champions:", error);
        DOM.selectedChampionName.textContent = '-- Error Loading Champions --';
        UI.displayNotification("Could not load champion list.", 'error', 'guidance');
        logAnalyticEvent('firestore_public_read_error', { collection: 'champions', error_message: error.message });
    }
}


// =================================================================================================
// #region: --- UI CONTROLLERS & DOM MANIPULATION ---
// =================================================================================================

const UI = {
    /**
     * @typedef {'guidance' | 'probability_sim' | 'wizard'} NotificationArea
     * @typedef {'info' | 'success' | 'error'} NotificationType
     */

    /**
     * Displays a temporary notification message in a specified area of the UI.
     * @param {string} message - The message to display.
     * @param {NotificationType} [type='info'] - The type of notification (info, success, error).
     * @param {NotificationArea} [area='guidance'] - The UI area where the notification should appear.
     */
    displayNotification(message, type = 'info', area = 'guidance') {
        let statusDiv;
        switch (area) {
            case 'probability_sim': statusDiv = DOM.probabilityStatusDiv; break;
            case 'wizard': statusDiv = state.isGuidedMode ? DOM.wizardProbabilityStatus : DOM.probabilityStatusDiv; break;
            case 'guidance':
            default: statusDiv = DOM.guidanceStatus;
        }
        if (!statusDiv) return;

        statusDiv.textContent = message;
        statusDiv.className = `status-message text-center py-1 status-${type}`;
        logAnalyticEvent('ui_notification_displayed', { type, area, message });

        setTimeout(() => {
            if (statusDiv.textContent === message) {
                statusDiv.textContent = '';
                statusDiv.className = 'status-message mt-3';
            }
        }, 4000);
    },

    /**
     * Sets the visual state of a button to indicate loading (e.g., shows a spinner).
     * @param {HTMLButtonElement} button - The button element.
     * @param {boolean} isLoading - True to show the loading state, false to return to normal.
     */
    setButtonLoadingState(button, isLoading) {
        if (!button) return;
        const buttonText = button.querySelector('.btn-text');
        const spinner = button.querySelector('.spinner');
        if (isLoading) {
            button.classList.add('btn-loading');
            button.disabled = true;
            if (buttonText) buttonText.style.display = 'none';
            if (spinner) spinner.style.display = 'inline-block';
        } else {
            button.classList.remove('btn-loading');
            button.disabled = false;
            if (buttonText) buttonText.style.display = 'inline-block';
            if (spinner) spinner.style.display = 'none';
        }
    },
    
    /**
     * Populates the star level dropdowns with options from SHARD_REQUIREMENTS.
     */
    populateStarLevels() {
        DOM.startStarLevelSelect.innerHTML = '';
        DOM.targetStarLevelSelect.innerHTML = '';

        const baseOption = document.createElement('option');
        baseOption.value = "0_shards";
        baseOption.textContent = "Base Character (0 Shards)";
        DOM.startStarLevelSelect.appendChild(baseOption);

        for (const level in CONSTANTS.SHARD_REQUIREMENTS) {
            const optS = document.createElement('option');
            optS.value = level;
            optS.textContent = level;
            DOM.startStarLevelSelect.appendChild(optS);

            const optT = document.createElement('option');
            optT.value = level;
            optT.textContent = level;
            DOM.targetStarLevelSelect.appendChild(optT);
        }
        if (DOM.targetStarLevelSelect.options.length > 0) DOM.targetStarLevelSelect.selectedIndex = 0;
        if (DOM.startStarLevelSelect.options.length > 0) DOM.startStarLevelSelect.selectedIndex = 0;
    },

    /**
     * Updates the appearance of the "Include Unlock Cost" toggle button based on the current state.
     */
    updateToggleUnlockButtonAppearance() {
        if (state.isUnlockCostIncluded) {
            DOM.toggleUnlockCostBtn.textContent = 'Include Initial Unlock: ON';
            DOM.toggleUnlockCostBtn.classList.remove('toggle-btn-off');
            DOM.toggleUnlockCostBtn.classList.add('toggle-btn-on');
        } else {
            DOM.toggleUnlockCostBtn.textContent = 'Include Initial Unlock: OFF';
            DOM.toggleUnlockCostBtn.classList.remove('toggle-btn-on');
            DOM.toggleUnlockCostBtn.classList.add('toggle-btn-off');
        }
    },

    /**
     * Resets the UI to its default state, used for Guided Mode.
     */
    resetToDefaults() {
        DOM.mythicProbabilityInput.value = "0.0384";
        DOM.mythicHardPityInput.value = "50";
        DOM.lmRateUpChanceInput.value = "0.269";
        DOM.currentMythicPityInput.value = "0";
        DOM.currentLMPityInput.value = "0";
        DOM.lmShardsYieldInput.value = "40";
        DOM.anvilBudgetInput.value = "100";
        DOM.startStarLevelSelect.value = "0_shards";
        DOM.targetStarLevelSelect.value = Object.keys(CONSTANTS.SHARD_REQUIREMENTS)[0];
        state.isUnlockCostIncluded = false;
        this.updateToggleUnlockButtonAppearance();
    },
};

// ## Charting Controller ##

/**
 * A factory function to create and configure a Chart.js bar chart.
 * @param {string} canvasId - The ID of the canvas element.
 * @param {object} chartData - The data object for the chart.
 * @param {object} chartOptions - The options object for the chart.
 * @returns {Chart|null} The new Chart.js instance, or null if canvas is not found.
 */
function createChart(canvasId, chartData, chartOptions) {
    const canvasElement = document.getElementById(canvasId);
    if (!canvasElement) {
        console.error(`Canvas element with ID '${canvasId}' not found.`);
        return null;
    }
    if (window[canvasId + 'Instance']) {
        window[canvasId + 'Instance'].destroy();
    }

    const ctx = canvasElement.getContext('2d');
    const instance = new Chart(ctx, {
        type: 'bar',
        data: chartData,
        options: chartOptions,
    });
    window[canvasId + 'Instance'] = instance;
    return instance;
}

/**
 * Updates the main anvil cost comparison chart with new data.
 * @param {number[]} costs - Array of average costs for the system.
 * @param {string[]} labels - Array of labels for the x-axis (star levels).
 * @param {boolean} includeUnlock - Whether to include the unlock cost in the bars.
 * @param {number} unlockCostAvgForChart - The average cost to unlock a character.
 */
function updateMainAnvilCostChart(costs, labels, includeUnlock, unlockCostAvgForChart) {
    const finalCosts = costs.map(cost => includeUnlock ? cost + unlockCostAvgForChart : cost);
    const data = {
        labels: labels,
        datasets: [{ label: 'Avg Total Anvils', data: finalCosts, backgroundColor: 'rgba(59, 130, 246, 0.7)' }]
    };
    const options = { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, title: { display: true, text: includeUnlock ? 'Total Anvils (Unlock + Upgrade)' : 'Anvils for Upgrade Only', color: CONSTANTS.CHART_STYLING.TITLE_COLOR }, grid: { color: CONSTANTS.CHART_STYLING.GRID_COLOR }, ticks: { color: CONSTANTS.CHART_STYLING.FONT_COLOR } }, x: { title: { display: true, text: 'Star Level', color: CONSTANTS.CHART_STYLING.TITLE_COLOR }, grid: { display: false }, ticks: { color: CONSTANTS.CHART_STYLING.FONT_COLOR } } }, plugins: { legend: { labels: { color: CONSTANTS.CHART_STYLING.FONT_COLOR } }, tooltip: { backgroundColor: CONSTANTS.CHART_STYLING.TOOLTIP_BG_COLOR, titleColor: CONSTANTS.CHART_STYLING.TITLE_COLOR, bodyColor: CONSTANTS.CHART_STYLING.FONT_COLOR, callbacks: { label: context => `${context.dataset.label}: ${Math.round(context.raw)} Anvils` } } } };
    state.anvilCostChart = createChart('anvilCostChart', data, options);
}

/**
 * Displays a probability distribution histogram chart.
 * @param {string} canvasId - The ID of the canvas element for the chart.
 * @param {object} histogram - The histogram data (labels, data).
 */
function displayProbabilityDistributionChart(canvasId, histogram) {
    const data = { labels: histogram.labels, datasets: [{ label: `Anvil Cost Frequency`, data: histogram.data, backgroundColor: 'rgba(16, 185, 129, 0.7)', }] };
    const options = { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, title: { display: true, text: 'Number of Runs', color: CONSTANTS.CHART_STYLING.TITLE_COLOR }, grid: { color: CONSTANTS.CHART_STYLING.GRID_COLOR }, ticks: { color: CONSTANTS.CHART_STYLING.FONT_COLOR } }, x: { title: { display: true, text: 'Anvils Spent', color: CONSTANTS.CHART_STYLING.TITLE_COLOR }, grid: { display: false }, ticks: { color: CONSTANTS.CHART_STYLING.FONT_COLOR, autoSkip: true, maxTicksLimit: 15 } } }, plugins: { legend: { display: false }, tooltip: { backgroundColor: CONSTANTS.CHART_STYLING.TOOLTIP_BG_COLOR, titleColor: CONSTANTS.CHART_STYLING.TITLE_COLOR, bodyColor: CONSTANTS.CHART_STYLING.FONT_COLOR, callbacks: { label: context => `${context.dataset.label}: ${context.parsed.y} runs` } } } };
    createChart(canvasId, data, options);
}

// =================================================================================================
// #region: --- GUIDED MODE WIZARD ---
// =================================================================================================

/**
 * Manages the view state between Advanced and Guided modes.
 * @param {boolean} showGuided - True to show Guided Mode, false for Advanced.
 */
function setView(showGuided) {
    state.isGuidedMode = showGuided;

    DOM.calculatorSectionsContainer.classList.toggle('hidden', showGuided);
    DOM.wizardContainer.classList.toggle('hidden', !showGuided);

    DOM.switchToGuidedBtn.classList.toggle('active', showGuided);
    DOM.switchToAdvancedBtn.classList.toggle('active', !showGuided);

    if (showGuided) {
        // Move shared components into the wizard
        DOM.wizardStep1.appendChild(DOM.championGuidanceSection);
        DOM.wizardBudgetInputContainer.appendChild(DOM.anvilBudgetInputGroup);
        navigateToWizardStep(1, true); // Reset to first step
    } else {
        // Move shared components back to the advanced view
        DOM.calculatorSectionsContainer.insertBefore(DOM.championGuidanceSection, DOM.calculatorSectionsContainer.firstChild);
        DOM.probabilitySection.insertBefore(DOM.anvilBudgetInputGroup, DOM.probabilityStatusDiv);
        // Move results back if they were in the wizard
        DOM.calculatorSectionsContainer.appendChild(DOM.results);
        DOM.calculatorSectionsContainer.appendChild(DOM.probabilityResultsArea);
    }
    logAnalyticEvent('view_switched', { view: showGuided ? 'guided' : 'advanced' });
}

/**
 * Navigates the user to a specific step in the wizard.
 * @param {number} stepNumber - The step to navigate to.
 * @param {boolean} [isReset=false] - If true, resets the wizard to its initial state.
 */
function navigateToWizardStep(stepNumber, isReset = false) {
    if (!isReset) {
        // --- Input Validation Before Proceeding ---
        if (state.wizardCurrentStep === 1 && !DOM.lmChampionSelect.value) {
            UI.displayNotification("Please select a champion to continue.", 'error', 'guidance');
            return;
        }
        if (state.wizardCurrentStep === 2 && !DOM.anvilBudgetInput.value) {
            UI.displayNotification("Please enter a budget to see probabilities.", 'error', 'wizard');
            return;
        }
    }
    
    state.wizardCurrentStep = stepNumber;
    
    // Show the correct step content
    [DOM.wizardStep1, DOM.wizardStep2, DOM.wizardStep3].forEach((step, index) => {
        step.classList.toggle('hidden', (index + 1) !== state.wizardCurrentStep);
    });

    // Update navigation visibility and text
    const isFinalStep = state.wizardCurrentStep === 3;
    DOM.wizardNavigation.classList.toggle('hidden', isFinalStep);
    DOM.wizardBackBtn.classList.toggle('hidden', state.wizardCurrentStep === 1);
    DOM.wizardNextBtn.textContent = state.wizardCurrentStep === CONSTANTS.WIZARD_MAX_STEPS ? 'Calculate Results' : 'Next';
    DOM.wizardStepIndicator.textContent = `Step ${state.wizardCurrentStep} of ${CONSTANTS.WIZARD_MAX_STEPS}`;

    // If moving to the final step, run the calculation
    if (isFinalStep) {
        DOM.wizardResultsContainer.appendChild(DOM.results);
        DOM.wizardResultsContainer.appendChild(DOM.probabilityResultsArea);
        runAllCalculations('wizard_finish');
        // Add a "Start Over" button
        const startOverBtn = document.createElement('button');
        startOverBtn.id = 'wizardStartOverBtn';
        startOverBtn.className = 'btn btn-primary mt-4 mx-auto';
        startOverBtn.textContent = 'Start Over';
        startOverBtn.onclick = () => navigateToWizardStep(1, true);
        DOM.wizardStep3.appendChild(startOverBtn);
    } else {
         // Clean up start over button if it exists
        const oldBtn = document.getElementById('wizardStartOverBtn');
        if (oldBtn) oldBtn.remove();
    }

    if (isReset) {
        UI.resetToDefaults();
    }
}

// =================================================================================================
// #region: --- CORE LOGIC & EVENT HANDLERS ---
// =================================================================================================

/**
 * Handles applying a star level recommendation from the Champion Guidance section.
 * @param {Event} event - The event that triggered the handler (e.g., button click).
 */
function handleChampionGuidance(event) {
    const selectedChampionName = DOM.lmChampionSelect.value;

    if (!selectedChampionName) {
        UI.displayNotification("Please select a champion first.", 'info', 'guidance');
        return;
    }

    const triggerId = event.target.id;
    let targetLevel;
    
    if (triggerId === 'f2pRecBtn') targetLevel = DOM.lmChampionSelect.dataset.recF2p;
    else if (triggerId === 'minRecBtn') targetLevel = DOM.lmChampionSelect.dataset.recMin;
    else return;

    if (targetLevel === 'not set' || !targetLevel) {
        UI.displayNotification(`Recommendation for ${selectedChampionName} is not set yet.`, 'info', 'guidance');
        DOM.startStarLevelSelect.value = '0_shards';
        DOM.targetStarLevelSelect.value = Object.keys(CONSTANTS.SHARD_REQUIREMENTS)[0];
        runAllCalculations('guidance_reset');
        return;
    }
    
    DOM.startStarLevelSelect.value = '0_shards';

    if (targetLevel === 'skip') {
        DOM.targetStarLevelSelect.value = '0_shards';
        UI.displayNotification(`${selectedChampionName} is a recommended 'Skip'. Target set to base.`, 'info', 'guidance');
    } else if (targetLevel === 'max') {
        DOM.targetStarLevelSelect.value = 'Red 5-Star';
        UI.displayNotification(`'As High As You Can Go' set to Red 5-Star for ${selectedChampionName}.`, 'info', 'guidance');
    } else if (Object.keys(CONSTANTS.SHARD_REQUIREMENTS).includes(targetLevel)) {
        DOM.targetStarLevelSelect.value = targetLevel;
        UI.displayNotification(`Recommendation applied for ${selectedChampionName}.`, 'success', 'guidance');
    } else {
        UI.displayNotification(`Could not find star level '${targetLevel}' for ${selectedChampionName}.`, 'error', 'guidance');
        return;
    }
    
    state.isUnlockCostIncluded = true;
    UI.updateToggleUnlockButtonAppearance();
    logAnalyticEvent('toggle_unlock_cost_auto', { included: true, source: 'guidance_button' });
    logAnalyticEvent('guidance_recommendation_applied', { champion: selectedChampionName, recommendation_type: triggerId, target_level: DOM.targetStarLevelSelect.value });

    // If in guided mode, automatically move to the next step
    if (state.isGuidedMode) {
        navigateToWizardStep(2);
    } else {
        runAllCalculations('guidance_button_click');
    }
}


/**
 * Gathers and validates all user inputs required for calculations.
 * @returns {{isValid: boolean, data: object, errors: object}} An object containing a validity flag, the parsed input data, and an error object.
 */
function validateAndGetInputs() {
    Object.values(DOM).filter(el => el && el.id && el.id.endsWith('Error')).forEach(el => el.classList.add('hidden'));
    const errors = {};
    const data = {};
    let isValid = true;
    const validate = (value, condition, errorEl, errorMessage) => {
        if (!condition(value)) {
            if (errorEl) { errorEl.textContent = errorMessage; errorEl.classList.remove('hidden'); }
            isValid = false;
            errors[errorEl ? errorEl.id : 'unknown_error'] = true;
            return NaN;
        }
        return value;
    };

    data.mythicProbability = validate(parseFloat(DOM.mythicProbabilityInput.value), v => !isNaN(v) && v > 0 && v <= 1, DOM.mythicProbabilityError, 'Must be > 0 and <= 1');
    data.mythicHardPity = validate(parseInt(DOM.mythicHardPityInput.value, 10), v => !isNaN(v) && v >= 1, DOM.mythicHardPityError, 'Must be >= 1');
    data.lmRateUpChance = validate(parseFloat(DOM.lmRateUpChanceInput.value), v => !isNaN(v) && v >= 0 && v <= 1, DOM.lmRateUpChanceError, 'Must be 0 to 1');
    data.currentMythicPity = validate(parseInt(DOM.currentMythicPityInput.value, 10) || 0, v => !isNaN(v) && v >= 0 && v < data.mythicHardPity, DOM.currentMythicPityError, `Must be 0 to ${data.mythicHardPity - 1}`);
    data.currentLMPity = validate(parseInt(DOM.currentLMPityInput.value, 10) || 0, v => !isNaN(v) && v >= 0 && v <= CONSTANTS.NM_GUARANTEE_THRESHOLD, DOM.currentLMPityError, `Must be 0 to ${CONSTANTS.NM_GUARANTEE_THRESHOLD}`);
    data.lmShardsYield = validate(parseInt(DOM.lmShardsYieldInput.value, 10), v => !isNaN(v) && v >= 0, DOM.lmShardsYieldError, 'Invalid');
    data.nmShardsYield = 0;
    data.anvilBudget = validate(parseInt(DOM.anvilBudgetInput.value, 10), v => !isNaN(v) && v > 0, state.isGuidedMode ? DOM.wizardProbabilityStatus : DOM.probabilityStatusDiv, 'Budget must be > 0');

    const startShards = DOM.startStarLevelSelect.value === "0_shards" ? 0 : CONSTANTS.SHARD_REQUIREMENTS[DOM.startStarLevelSelect.value] || 0;
    const targetTotalShards = CONSTANTS.SHARD_REQUIREMENTS[DOM.targetStarLevelSelect.value] || 0;
    data.shardsNeededForUpgrade = targetTotalShards - startShards;
    if (data.shardsNeededForUpgrade < 0) {
        DOM.starLevelError.textContent = "Target cannot be lower than start. Cost will be 0.";
        DOM.starLevelError.classList.remove('hidden');
        data.shardsNeededForUpgrade = 0;
        errors.starLevelError = true;
    }
    DOM.shardsNeededForUpgradeSpan.textContent = data.shardsNeededForUpgrade.toString();
    if (!isValid) { logAnalyticEvent('input_validation_error', { failed_fields: Object.keys(errors).join(',') }); }
    return { isValid, data, errors };
}

/**
 * Performs all the core Expected Value calculations based on validated inputs.
 * @param {object} inputs - The validated input data from `validateAndGetInputs`.
 * @returns {{isValid: boolean, data: object, errorMessage: string|null}} An object with calculation results or an error message.
 */
function performExpectedValueCalculations(inputs) {
    const { mythicProbability, mythicHardPity, lmRateUpChance, shardsNeededForUpgrade, lmShardsYield, nmShardsYield } = inputs;
    const results = {};
    results.drawsPerMythicAverage = calculateExpectedDrawsPerMythic(mythicProbability, mythicHardPity);
    if (isNaN(results.drawsPerMythicAverage)) return { isValid: false, errorMessage: 'Error in base Mythic calculation.' };
    results.unlockCycleMetrics = calculateLmCycleMetrics(1, 0, lmRateUpChance, CONSTANTS.NM_GUARANTEE_THRESHOLD);
    if (isNaN(results.unlockCycleMetrics.expectedMythicPullsPerLmCycle)) return { isValid: false, errorMessage: 'Error calculating unlock cycle.' };
    results.anvilsUnlockAvg = results.unlockCycleMetrics.expectedMythicPullsPerLmCycle * results.drawsPerMythicAverage;
    results.anvilsUnlockBest = 1 * 1;
    results.anvilsUnlockWorst = results.unlockCycleMetrics.worstCaseMythicPullsPerLmCycle * mythicHardPity;
    const lmCycleMetrics = calculateLmCycleMetrics(lmShardsYield, nmShardsYield, lmRateUpChance, CONSTANTS.NM_GUARANTEE_THRESHOLD);
    if (isNaN(lmCycleMetrics.averageShardsPerEffectiveMythic)) return { isValid: false, errorMessage: 'Error in shard per mythic calculation.' };
    results.avgEffShards = lmCycleMetrics.averageShardsPerEffectiveMythic;
    results.bestShards = lmShardsYield;
    results.worstShards = (nmShardsYield * CONSTANTS.NM_GUARANTEE_THRESHOLD + lmShardsYield) / (CONSTANTS.NM_GUARANTEE_THRESHOLD + 1);
    results.upgradeAnvilsAvg = calculateGachaAnvils(shardsNeededForUpgrade, results.avgEffShards, results.drawsPerMythicAverage);
    results.upgradeAnvilsBest = calculateGachaAnvils(shardsNeededForUpgrade, results.bestShards, 1);
    results.upgradeAnvilsWorst = calculateGachaAnvils(shardsNeededForUpgrade, results.worstShards, mythicHardPity);
    results.shardsNeededForUpgrade = shardsNeededForUpgrade;
    results.lmShardsYield = lmShardsYield;
    results.nmShardsYield = nmShardsYield;
    return { isValid: true, data: results };
}

/**
 * Updates the entire Expected Value results section of the UI with new calculation data.
 * @param {object} metrics - The calculated metrics from `performExpectedValueCalculations`.
 */
function updateExpectedValueUI(metrics) {
    const { drawsPerMythicAverage, unlockCycleMetrics, anvilsUnlockAvg, anvilsUnlockBest, anvilsUnlockWorst, avgEffShards, bestShards, worstShards, upgradeAnvilsAvg, upgradeAnvilsBest, upgradeAnvilsWorst, shardsNeededForUpgrade, lmShardsYield } = metrics;
    const formatNum = (val, dec = 2) => isFinite(val) ? val.toFixed(dec) : (shardsNeededForUpgrade <= 0 ? '0' : 'Inf');
    const formatAnvil = (val) => isFinite(val) ? Math.round(val).toString() : (shardsNeededForUpgrade <= 0 ? '0' : 'Infinity');
    const formatMythicPulls = (shards, effShards) => (effShards > 0 && shards > 0) ? Math.ceil(shards / effShards).toString() : (shards <= 0 ? '0' : 'Inf');
    DOM.calcDrawsPerMythicSpan.textContent = formatNum(drawsPerMythicAverage);
    DOM.calcWorstCaseMythicsForLMSpan.textContent = unlockCycleMetrics.worstCaseMythicPullsPerLmCycle.toString();
    DOM.calcAvgShardsSpan.textContent = formatNum(avgEffShards);
    DOM.detailLMSSpan.textContent = lmShardsYield.toString();
    DOM.detailNMSSpan.textContent = "0";
    const isIncluded = state.isUnlockCostIncluded;
    DOM.unlockCostSection.classList.toggle('hidden', !isIncluded);
    DOM.detailUnlockCostSection.classList.toggle('hidden', !isIncluded);
    DOM.systemTitle.textContent = isIncluded ? "Total Anvil Cost" : "Anvil Cost for Upgrade Only";
    if(isIncluded) {
        [DOM.anvilsUnlockAvgSpan, DOM.detailAnvilsUnlockAvgSpan].forEach(el => el.textContent = formatAnvil(anvilsUnlockAvg));
        [DOM.anvilsUnlockBestSpan, DOM.detailAnvilsUnlockBestSpan].forEach(el => el.textContent = formatAnvil(anvilsUnlockBest));
        [DOM.anvilsUnlockWorstSpan, DOM.detailAnvilsUnlockWorstSpan].forEach(el => el.textContent = formatAnvil(anvilsUnlockWorst));
        DOM.detailAvgMythicsForLMSpan.textContent = formatNum(unlockCycleMetrics.expectedMythicPullsPerLmCycle);
    }
    DOM.anvilsAvgSpan.textContent = formatAnvil(isIncluded ? anvilsUnlockAvg + upgradeAnvilsAvg : upgradeAnvilsAvg);
    DOM.anvilsBestSpan.textContent = formatAnvil(isIncluded ? anvilsUnlockBest + upgradeAnvilsBest : upgradeAnvilsBest);
    DOM.anvilsWorstSpan.textContent = formatAnvil(isIncluded ? anvilsUnlockWorst + upgradeAnvilsWorst : upgradeAnvilsWorst);
    DOM.detailTargetShardsSpan.textContent = shardsNeededForUpgrade.toString();
    DOM.detailAvgShardsSpan.textContent = formatNum(avgEffShards);
    DOM.detailMythicPullsAvgSpan.textContent = formatMythicPulls(shardsNeededForUpgrade, avgEffShards);
    DOM.detailAnvilsAvgSpan.textContent = formatAnvil(upgradeAnvilsAvg);
    DOM.detailBestShardsSpan.textContent = formatNum(bestShards);
    DOM.detailMythicPullsBestSpan.textContent = formatMythicPulls(shardsNeededForUpgrade, bestShards);
    DOM.detailAnvilsBestSpan.textContent = formatAnvil(upgradeAnvilsBest);
    DOM.detailWorstShardsSpan.textContent = formatNum(worstShards);
    DOM.detailMythicPullsWorstSpan.textContent = formatMythicPulls(shardsNeededForUpgrade, worstShards);
    DOM.detailAnvilsWorstSpan.textContent = formatAnvil(upgradeAnvilsWorst);
    const chartLabels = Object.keys(CONSTANTS.SHARD_REQUIREMENTS);
    const chartCosts = chartLabels.map(lvl => calculateGachaAnvils(CONSTANTS.SHARD_REQUIREMENTS[lvl], avgEffShards, drawsPerMythicAverage));
    updateMainAnvilCostChart(chartCosts, chartLabels, isIncluded, anvilsUnlockAvg);
}

const runAllCalculations = debounce((triggerSource = 'unknown') => {
    logAnalyticEvent('calculation_triggered', { type: 'combined', source: triggerSource });
    UI.setButtonLoadingState(DOM.calculateBtn, true);
    
    DOM.probabilityResultsArea.classList.add('hidden');

    setTimeout(() => {
        const inputs = validateAndGetInputs();
        if (!inputs.isValid) {
            UI.setButtonLoadingState(DOM.calculateBtn, false);
            UI.displayNotification("Please correct the highlighted input errors.", 'error', 'general');
            logAnalyticEvent('calculation_completed', { status: 'error', reason: 'input_validation' });
            return;
        }
        const metrics = performExpectedValueCalculations(inputs.data);
        if (!metrics.isValid) {
            UI.setButtonLoadingState(DOM.calculateBtn, false);
            UI.displayNotification(metrics.errorMessage || 'Error in EV calculation.', 'error', 'general');
            logAnalyticEvent('calculation_completed', { status: 'error', reason: 'ev_calculation_error' });
            return;
        }
        updateExpectedValueUI(metrics.data);
        runProbabilitySimulation(inputs.data);
        UI.setButtonLoadingState(DOM.calculateBtn, false);
        logAnalyticEvent('calculation_completed', { status: 'success' });
    }, 10);
}, CONSTANTS.DEBOUNCE_WAIT_MS);

// =================================================================================================
// #region: --- PROBABILITY SIMULATION ---
// =================================================================================================

/**
 * Simulates a single attempt to reach a shard goal within a budget.
 * @param {object} params - The parameters for the simulation.
 * @returns {number} The total anvils spent. Returns budget + 1 if the goal was not met.
 */
function simulateSingleSuccessAttempt({ budget, mythicProb, hardPity, lmRateUp, nmGuarantee, includeUnlock, targetShardsForUpgrade, lmShardsYield, initialMythicPity, initialLMPityStreak }) {
    let totalAnvilsSpent = 0;
    let currentShards = 0;
    let mythicPityCounter = initialMythicPity;
    let nmFailStreak = initialLMPityStreak;
    let isUnlocked = !includeUnlock;
    let nmPullCounterForBonus = 0;

    const performPull = () => {
        mythicPityCounter++;
        totalAnvilsSpent++;
        if (mythicPityCounter >= hardPity || Math.random() < mythicProb) {
            mythicPityCounter = 0;
            const isLMPull = nmFailStreak >= nmGuarantee || Math.random() < lmRateUp;
            if (isLMPull) {
                nmFailStreak = 0;
                return { isLM: true, shards: lmShardsYield };
            } else {
                nmFailStreak++;
                /*
                // Original bonus shard logic - currently disabled.
                let bonusShards = 0;
                nmPullCounterForBonus++;
                if (nmPullCounterForBonus <= 6) {
                    bonusShards = [2, 3, 5][Math.floor(Math.random() * 3)];
                }
                return { isLM: false, shards: bonusShards };
                */
               
                // Non-LM pulls currently grant 0 shards.
                return { isLM: false, shards: 0 };
            }
        }
        return null;
    };
    if (includeUnlock && !isUnlocked) {
        while (totalAnvilsSpent < budget) {
            const pullResult = performPull();
            if (pullResult) { currentShards += pullResult.shards; if (pullResult.isLM) { isUnlocked = true; break; } }
        }
        if (!isUnlocked) return budget + 1;
    }
    while (currentShards < targetShardsForUpgrade) {
        if (totalAnvilsSpent >= budget) return budget + 1;
        const pullResult = performPull();
        if (pullResult) { currentShards += pullResult.shards; }
    }
    return totalAnvilsSpent;
}

/**
 * Calculates a specific percentile from a sorted array of data.
 * @param {number[]} sortedData - The pre-sorted array of numbers.
 * @param {number} percentile - The percentile to calculate (0-100).
 * @returns {number} The value at the given percentile.
 */
function getPercentile(sortedData, percentile) {
    if (!sortedData || sortedData.length === 0) return NaN;
    const index = (percentile / 100) * (sortedData.length - 1);
    if (index === Math.floor(index)) { return sortedData[index]; }
    else { const lower = Math.floor(index); const upper = Math.ceil(index); return sortedData[lower] * (upper - index) + sortedData[upper] * (index - lower); }
}

/**
 * Creates histogram data from simulation results.
 * @param {number[]} anvilCosts - An array of anvil costs from all simulation runs.
 * @param {number} budget - The anvil budget for the simulation.
 * @param {number} [numBins=20] - The desired number of bins for the histogram.
 * @returns {{labels: string[], data: number[], successRate: number, medianCost: number, p90Cost: number}}
 */
function createHistogramData(anvilCosts, budget, numBins = 20) {
    const successfulRuns = anvilCosts.filter(cost => cost <= budget);
    if (successfulRuns.length === 0) { return { labels: [`> ${budget} (Failures)`], data: [anvilCosts.length], successRate: 0, medianCost: NaN, p90Cost: NaN }; }
    successfulRuns.sort((a, b) => a - b);
    const minCost = successfulRuns[0];
    const maxCost = successfulRuns[successfulRuns.length - 1];
    const binSize = Math.max(1, Math.ceil((maxCost - minCost + 1) / numBins));
    const bins = [];
    for (let i = minCost; i <= maxCost; i += binSize) { bins.push({ start: i, end: i + binSize - 1, count: 0 }); }
    let failures = 0;
    anvilCosts.forEach(cost => {
        if (cost <= budget) { const targetBin = bins.find(bin => cost >= bin.start && cost <= bin.end); if (targetBin) targetBin.count++; }
        else { failures++; }
    });
    const chartData = bins.map(bin => bin.count);
    const chartLabels = bins.map(bin => `${bin.start}-${bin.end}`);
    if (failures > 0) { chartLabels.push(`> ${budget} (Failed)`); chartData.push(failures); }
    return { labels: chartLabels, data: chartData, successRate: (successfulRuns.length / anvilCosts.length) * 100, medianCost: getPercentile(successfulRuns, 50), p90Cost: getPercentile(successfulRuns, 90), };
}

/**
 * Runs the main probability simulation and updates the UI with the results.
 * @param {object} inputs - The validated input data.
 */
function runProbabilitySimulation(inputs) {
    const simParams = { budget: inputs.anvilBudget, mythicProb: inputs.mythicProbability, hardPity: inputs.mythicHardPity, lmRateUp: inputs.lmRateUpChance, nmGuarantee: CONSTANTS.NM_GUARANTEE_THRESHOLD, includeUnlock: state.isUnlockCostIncluded, targetShardsForUpgrade: inputs.shardsNeededForUpgrade, lmShardsYield: inputs.lmShardsYield, initialMythicPity: inputs.currentMythicPity, initialLMPityStreak: inputs.currentLMPity };
    const anvilCosts = Array.from({ length: CONSTANTS.NUM_SIM_RUNS }, () => simulateSingleSuccessAttempt(simParams));
    const numBins = Math.min(25, Math.max(8, Math.floor(inputs.anvilBudget / 25)));
    const histData = createHistogramData(anvilCosts, inputs.anvilBudget, numBins);
    DOM.probabilityResultsArea.classList.remove('hidden');
    DOM.probabilitySummaryText.textContent = `Goal: ${DOM.targetStarLevelSelect.value} from ${DOM.startStarLevelSelect.value} with a ${inputs.anvilBudget} Anvil budget.`;
    const probSummaryEl = DOM.probabilityResultsArea.querySelector('#probSummary');
    if (probSummaryEl) { probSummaryEl.innerHTML = `Success: <strong>${histData.successRate.toFixed(1)}%</strong> | Median (Success): <strong>${Math.round(histData.medianCost) || 'N/A'}</strong> | P90 (Success): <strong>${Math.round(histData.p90Cost) || 'N/A'}</strong>`; }
    const detailsEl = DOM.probabilityResultsArea.querySelector('#probabilitySimulationDetails');
    if (detailsEl) { detailsEl.textContent = `Based on ${CONSTANTS.NUM_SIM_RUNS.toLocaleString()} simulated attempts.`; }
    displayProbabilityDistributionChart('probChart', histData);
}

// =================================================================================================
// #region: --- INITIALIZATION ---
// =================================================================================================

/**
 * Attaches all necessary event listeners to the DOM elements.
 */
function attachEventListeners() {
    // --- View and Wizard ---
    DOM.switchToGuidedBtn.addEventListener('click', () => setView(true));
    DOM.switchToAdvancedBtn.addEventListener('click', () => setView(false));
    DOM.wizardNextBtn.addEventListener('click', () => {
        if (state.wizardCurrentStep === CONSTANTS.WIZARD_MAX_STEPS) {
            navigateToWizardStep(3); // Go to results step
        } else {
            navigateToWizardStep(state.wizardCurrentStep + 1);
        }
    });
    DOM.wizardBackBtn.addEventListener('click', () => navigateToWizardStep(state.wizardCurrentStep - 1));

    // --- Custom Dropdown Logic ---
    DOM.customDropdownTrigger.addEventListener('click', () => {
        const isExpanded = DOM.customDropdownTrigger.getAttribute('aria-expanded') === 'true';
        DOM.customDropdownOptions.classList.toggle('hidden', isExpanded);
        DOM.customDropdownTrigger.setAttribute('aria-expanded', !isExpanded);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
        if (!DOM.customChampionDropdown.contains(event.target)) {
            DOM.customDropdownOptions.classList.add('hidden');
            DOM.customDropdownTrigger.setAttribute('aria-expanded', 'false');
        }
    });

    // --- Champion Guidance ---
    DOM.f2pRecBtn.addEventListener('click', handleChampionGuidance);
    DOM.minRecBtn.addEventListener('click', handleChampionGuidance);
    
    // Listen for the change event on the hidden input, which is fired by the custom dropdown logic.
    DOM.lmChampionSelect.addEventListener('change', () => {
        DOM.guidanceButtons.classList.toggle('hidden', !DOM.lmChampionSelect.value);
    });

    // --- Calculation Triggers ---
    DOM.calculateBtn.addEventListener('click', () => runAllCalculations('ev_button_click'));
    const evTriggerInputs = [ DOM.mythicProbabilityInput, DOM.mythicHardPityInput, DOM.lmRateUpChanceInput, DOM.currentMythicPityInput, DOM.currentLMPityInput, DOM.lmShardsYieldInput, DOM.startStarLevelSelect, DOM.targetStarLevelSelect, DOM.anvilBudgetInput ];
    evTriggerInputs.forEach(el => { if(el) el.addEventListener('input', (e) => { if (!state.isGuidedMode) runAllCalculations(`input_change_${e.target.id}`); }); });
    DOM.toggleUnlockCostBtn.addEventListener('click', () => {
        state.isUnlockCostIncluded = !state.isUnlockCostIncluded;
        UI.updateToggleUnlockButtonAppearance();
        logAnalyticEvent('toggle_unlock_cost', { included: state.isUnlockCostIncluded });
        if (!state.isGuidedMode) runAllCalculations('toggle_unlock_cost');
    });

    // --- Analytics for Details/Summary Toggles ---
    document.querySelectorAll('details').forEach(detailsEl => {
        detailsEl.addEventListener('toggle', function() { logAnalyticEvent('details_section_toggled', { section_id: this.id || 'anonymous_details', is_open: this.open }); });
    });
}

/**
 * The main entry point for the application.
 * @async
 */
async function main() {
    UI.populateStarLevels();
    UI.updateToggleUnlockButtonAppearance();
    await initializeFirebaseAndAuth();
    logAnalyticEvent('page_view', { app_id: CONSTANTS.APP_ID, version: '3.2.2' });
    attachEventListeners();
    runAllCalculations('initial_load');
}

// --- Start the application ---
document.addEventListener('DOMContentLoaded', main);
