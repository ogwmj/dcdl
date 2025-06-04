/**
 * @file calculator.js
 * @fileoverview Interactive web application to calculate and simulate the "Anvil" cost for character upgrades in a gacha game.
 * It features two main functionalities:
 * 1.  **Expected Value (EV) Calculation**: Determines the average, best-case, and worst-case Anvil cost to upgrade a character between specified star levels, comparing a "Current" and a "Proposed" shard acquisition system.
 * 2.  **Probability Simulation**: Runs a Monte Carlo simulation to find the probability of successfully achieving an upgrade goal within a given Anvil budget.
 *
 * The application integrates with Firebase for user authentication (anonymous), cloud storage of user-defined configurations, and analytics.
 * It also supports local import/export of settings via JSON and allows for UI customization (hiding/reordering sections).
 *
 * @author Originally by the user, refactored and documented by Google's Gemini.
 * @version 2.0.0
 */

// --- Firebase SDK Imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, deleteDoc, onSnapshot, query, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent as fbLogEventInternal } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

// #region --- CONSTANTS & CONFIGURATION ---

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
    /** Local storage key for section visibility preferences. @type {string} */
    SECTION_VISIBILITY_STORAGE_KEY: 'anvilCalcSectionVisibility_v2',
    /** Local storage key for section order preferences. @type {string} */
    SECTION_ORDER_STORAGE_KEY: 'anvilCalcSectionOrder_v2',
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
    /**
     * Configuration for all toggleable UI sections.
     * @type {Array<{id: string, name: string, defaultVisible: boolean}>}
     */
    ALL_TOGGLEABLE_SECTIONS: [
        { id: 'championManagementSection', name: 'Champion Configurations', defaultVisible: true },
        { id: 'basePullRatesSection', name: 'Base Pull Rates', defaultVisible: true },
        { id: 'upgradeRangeSection', name: 'Upgrade Range', defaultVisible: true },
        { id: 'advisoryBox', name: 'Advisory Note', defaultVisible: true },
        { id: 'shardBleedSystemsSection', name: 'Shard Bleed Systems', defaultVisible: true },
        { id: 'probabilitySection', name: 'Probability Simulation', defaultVisible: true },
        { id: 'results', name: 'Expected Value Results', defaultVisible: true },
        { id: 'detailedCalculationsDetails', name: 'Detailed EV Calculations', defaultVisible: true },
        { id: 'mainAnvilCostChartContainer', name: 'Anvil Cost Chart (EV)', defaultVisible: true },
        { id: 'explanationSection', name: 'Features & Terminology Guide', defaultVisible: false }
    ],
    /** Chart.js styling options */
    CHART_STYLING: {
        GRID_COLOR: 'rgba(0, 0, 0, 0.1)',
        FONT_COLOR: '#6b7280',
        TITLE_COLOR: '#1e293b',
        TOOLTIP_BG_COLOR: '#f8fafc',
    },
};

// #endregion

// #region --- APPLICATION STATE ---

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
    /** The current order of UI sections. @type {string[]} */
    currentSectionOrder: [],
};

// #endregion

// #region --- DOM ELEMENT REFERENCES ---

/**
 * A collection of cached DOM element references.
 * @namespace
 */
const DOM = {
    // Champion Management
    championNameInput: document.getElementById('championName'),
    saveChampionBtn: document.getElementById('saveChampionBtn'),
    savedChampionsSelect: document.getElementById('savedChampions'),
    loadChampionBtn: document.getElementById('loadChampionBtn'),
    deleteChampionBtn: document.getElementById('deleteChampionBtn'),
    championStatusDiv: document.getElementById('championStatus'),
    userIdDisplay: document.getElementById('userIdDisplay'),

    // Local Config
    exportConfigBtn: document.getElementById('exportConfigBtn'),
    importConfigText: document.getElementById('importConfigText'),
    importConfigBtn: document.getElementById('importConfigBtn'),
    localConfigStatus: document.getElementById('localConfigStatus'),

    // Base Inputs
    mythicProbabilityInput: document.getElementById('mythicProbability'),
    mythicHardPityInput: document.getElementById('mythicHardPity'),
    currentMythicPityInput: document.getElementById('currentMythicPity'),
    currentLMPityInput: document.getElementById('currentLMPity'),
    lmRateUpChanceInput: document.getElementById('lmRateUpChance'),

    // Shard System Inputs
    currentLMSInput: document.getElementById('currentLMSInput'),
    currentNMSInput: document.getElementById('currentNMSInput'),
    proposedLMSInput: document.getElementById('proposedLMSInput'),

    // Error Displays
    mythicProbabilityError: document.getElementById('mythicProbabilityError'),
    mythicHardPityError: document.getElementById('mythicHardPityError'),
    currentMythicPityError: document.getElementById('currentMythicPityError'),
    currentLMPityError: document.getElementById('currentLMPityError'),
    lmRateUpChanceError: document.getElementById('lmRateUpChanceError'),
    currentLMSError: document.getElementById('currentLMSError'),
    currentNMSError: document.getElementById('currentNMSError'),
    proposedLMSError: document.getElementById('proposedLMSError'),
    starLevelError: document.getElementById('starLevelError'),

    // Probability Simulation
    anvilBudgetInput: document.getElementById('anvilBudget'),
    calculateProbabilityBtn: document.getElementById('calculateProbabilityBtn'),
    probabilityStatusDiv: document.getElementById('probabilityStatus'),
    probabilityResultsArea: document.getElementById('probabilityResultsArea'),

    // Section Customization
    sectionToggleContainer: document.getElementById('sectionToggleContainer'),
    reorderableSectionsContainer: document.getElementById('reorderableSectionsContainer'),

    // Expected Value Calculation
    startStarLevelSelect: document.getElementById('startStarLevel'),
    targetStarLevelSelect: document.getElementById('targetStarLevel'),
    calculateBtn: document.getElementById('calculateBtn'),
    toggleUnlockCostBtn: document.getElementById('toggleUnlockCostBtn'),

    // EV Results Display
    advisoryBox: document.getElementById('advisoryBox'),
    advisoryMessage: document.getElementById('advisoryMessage'),
    shardsNeededForUpgradeSpan: document.getElementById('shardsNeededForUpgrade'),
    anvilsCurrentSpan: document.getElementById('anvilsCurrent'),
    anvilsProposedSpan: document.getElementById('anvilsProposed'),
    anvilsBestCurrentSpan: document.getElementById('anvilsBestCurrent'),
    anvilsWorstCurrentSpan: document.getElementById('anvilsWorstCurrent'),
    anvilsBestProposedSpan: document.getElementById('anvilsBestProposed'),
    anvilsWorstProposedSpan: document.getElementById('anvilsWorstProposed'),
    conclusionParagraph: document.getElementById('conclusion'),
    currentSystemTitle: document.getElementById('currentSystemTitle'),
    proposedSystemTitle: document.getElementById('proposedSystemTitle'),
    unlockCostSection: document.getElementById('unlockCostSection'),
    anvilsUnlockAvgSpan: document.getElementById('anvilsUnlockAvg'),
    anvilsUnlockBestSpan: document.getElementById('anvilsUnlockBest'),
    anvilsUnlockWorstSpan: document.getElementById('anvilsUnlockWorst'),
    anvilCostBreakdownNote: document.getElementById('anvilCostBreakdownNote'),
    
    // EV Detailed Calculations Display
    detailUnlockCostSection: document.getElementById('detailUnlockCostSection'),
    calcDrawsPerMythicSpan: document.getElementById('calcDrawsPerMythic'),
    calcWorstCaseMythicsForLMSpan: document.getElementById('calcWorstCaseMythicsForLM'),
    calcAvgShardsCurrentSpan: document.getElementById('calcAvgShardsCurrent'),
    calcAvgShardsProposedSpan: document.getElementById('calcAvgShardsProposed'),
    detailLMSCurrentSpan: document.getElementById('detailLMSCurrent'),
    detailNMSCurrentSpan: document.getElementById('detailNMSCurrent'),
    detailLMSProposedSpan: document.getElementById('detailLMSProposed'),
    detailNMSProposedSpan: document.getElementById('detailNMSProposed'),
    detailAvgMythicsForLMSpan: document.getElementById('detailAvgMythicsForLM'),
    detailAnvilsUnlockAvgSpan: document.getElementById('detailAnvilsUnlockAvg'),
    detailAnvilsUnlockBestSpan: document.getElementById('detailAnvilsUnlockBest'),
    detailAnvilsUnlockWorstSpan: document.getElementById('detailAnvilsUnlockWorst'),
    detailTargetShardsCurrentSpan: document.getElementById('detailTargetShardsCurrent'),
    detailAvgShardsCurrentSpan: document.getElementById('detailAvgShardsCurrent'),
    detailMythicPullsAvgCurrentSpan: document.getElementById('detailMythicPullsAvgCurrent'),
    detailAnvilsAvgCurrentSpan: document.getElementById('detailAnvilsAvgCurrent'),
    detailBestShardsCurrentSpan: document.getElementById('detailBestShardsCurrent'),
    detailMythicPullsBestCurrentSpan: document.getElementById('detailMythicPullsBestCurrent'),
    detailAnvilsBestCurrentSpan: document.getElementById('detailAnvilsBestCurrent'),
    detailWorstShardsCurrentSpan: document.getElementById('detailWorstShardsCurrent'),
    detailMythicPullsWorstCurrentSpan: document.getElementById('detailMythicPullsWorstCurrent'),
    detailAnvilsWorstCurrentSpan: document.getElementById('detailAnvilsWorstCurrent'),
    detailTargetShardsProposedSpan: document.getElementById('detailTargetShardsProposed'),
    detailAvgShardsProposedSpan: document.getElementById('detailAvgShardsProposed'),
    detailMythicPullsAvgProposedSpan: document.getElementById('detailMythicPullsAvgProposed'),
    detailAnvilsAvgProposedSpan: document.getElementById('detailAnvilsAvgProposed'),
    detailBestShardsProposedSpan: document.getElementById('detailBestShardsProposed'),
    detailMythicPullsBestProposedSpan: document.getElementById('detailMythicPullsBestProposed'),
    detailAnvilsBestProposedSpan: document.getElementById('detailAnvilsBestProposed'),
    detailWorstShardsProposedSpan: document.getElementById('detailWorstShardsProposed'),
    detailMythicPullsWorstProposedSpan: document.getElementById('detailMythicPullsWorstProposed'),
    detailAnvilsWorstProposedSpan: document.getElementById('detailAnvilsWorstProposed'),
};

// #endregion

// #region --- SERVICES ---

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
        console.log(`Analytics (not ready): ${eventName}`, params);
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
 * Calculates the expected number of draws required to obtain one mythic item.
 * @param {number} mythicProbability - The base probability of a mythic pull (0 to 1).
 * @param {number} hardPity - The number of draws at which a mythic is guaranteed.
 * @returns {number} The expected number of draws per mythic, or NaN if inputs are invalid.
 */
function calculateExpectedDrawsPerMythic(mythicProbability, hardPity) {
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
}

/**
 * Calculates metrics for a full "Legendary Mythic" (LM) cycle.
 * @param {number} lmShardYield - The number of shards from an LM pull.
 * @param {number} nmShardYield - The number of shards from a Non-Mythic (NM) pull.
 * @param {number} lmRateUpChance - The probability of a mythic being an LM (0 to 1).
 * @param {number} nmGuaranteeThreshold - The number of NM pulls before an LM is guaranteed.
 * @returns {LmCycleMetrics} The calculated metrics for the cycle.
 */
function calculateLmCycleMetrics(lmShardYield, nmShardYield, lmRateUpChance, nmGuaranteeThreshold) {
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
}

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

// ## Firebase Service ##

/**
 * Initializes the Firebase app, authentication, and Firestore. Also sets up the auth state listener.
 * @async
 * @returns {Promise<boolean>} A promise that resolves to true if initialization and sign-in were successful, false otherwise.
 */
async function initializeFirebaseAndAuth() {
    if (!CONSTANTS.FIREBASE_CONFIG.projectId || CONSTANTS.FIREBASE_CONFIG.projectId.includes("YOUR_FALLBACK")) {
        console.warn("Firebase config is incomplete. Firestore features will be disabled.");
        DOM.userIdDisplay.textContent = "User ID: Firebase not configured";
        UI.disableChampionManagementFeatures(true, "Firebase not configured.");
        logAnalyticEvent('firebase_auth_status', { status: 'config_issue' });
        return false;
    }

    try {
        state.fbApp = initializeApp(CONSTANTS.FIREBASE_CONFIG);
        state.fbAuth = getAuth(state.fbApp);
        state.fbDb = getFirestore(state.fbApp);
        state.fbAnalytics = getAnalytics(state.fbApp);
        logAnalyticEvent('firebase_sdk_initialized');

        onAuthStateChanged(state.fbAuth, handleAuthStateChange);

        // Prefer custom token if provided, otherwise sign in anonymously.
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(state.fbAuth, __initial_auth_token);
        } else {
            await signInAnonymously(state.fbAuth);
        }
        return true;
    } catch (error) {
        console.error("Firebase Initialization or Authentication Error:", error);
        UI.displayNotification("Authentication failed. Cloud features disabled.", 'error', 'champion_config');
        DOM.userIdDisplay.textContent = `User ID: Auth Error`;
        UI.disableChampionManagementFeatures(true, "Authentication error.");
        logAnalyticEvent('firebase_auth_status', { status: 'failure', error_code: error.code, error_message: error.message });
        return false;
    }
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
        
        await populateSavedChampionsDropdownFromFirestore();
        UI.disableChampionManagementFeatures(false);
        logAnalyticEvent('firebase_auth_status', { status: 'signed_in', method: user.isAnonymous ? 'anonymous' : 'custom' });
    } else {
        state.currentUserId = null;
        DOM.userIdDisplay.textContent = "User ID: Not signed in";
        state.championsColRef = null;
        if (state.unsubscribeChampionsListener) {
            state.unsubscribeChampionsListener();
            state.unsubscribeChampionsListener = null;
        }
        DOM.savedChampionsSelect.innerHTML = '<option value="">-- Sign in to manage configurations --</option>';
        UI.disableChampionManagementFeatures(true, "Sign in to use cloud save.");
        logAnalyticEvent('firebase_auth_status', { status: 'signed_out' });
    }
}

/**
 * Saves the current calculator configuration to Firestore under the current user's profile.
 * @async
 */
async function saveChampionToFirestore() {
    if (!state.currentUserId || !state.championsColRef) {
        UI.displayNotification("Not signed in. Cannot save.", 'error', 'champion_config');
        return;
    }
    const championConfigName = DOM.championNameInput.value.trim();
    if (!championConfigName) {
        UI.displayNotification("Configuration name cannot be empty.", 'error', 'champion_config');
        return;
    }
    if (/[.#$[\]/]/.test(championConfigName) || championConfigName.length > 100) {
        UI.displayNotification("Config name contains invalid characters or is too long.", 'error', 'champion_config');
        return;
    }

    const championData = {
        name: championConfigName,
        mythicProbability: DOM.mythicProbabilityInput.value,
        mythicHardPity: DOM.mythicHardPityInput.value,
        lmRateUpChance: DOM.lmRateUpChanceInput.value,
        currentMythicPity: DOM.currentMythicPityInput.value,
        currentLMPity: DOM.currentLMPityInput.value,
        includeUnlockCost: state.isUnlockCostIncluded,
        startStarLevel: DOM.startStarLevelSelect.value,
        targetStarLevel: DOM.targetStarLevelSelect.value,
        currentLMS: DOM.currentLMSInput.value,
        currentNMS: DOM.currentNMSInput.value,
        proposedLMS: DOM.proposedLMSInput.value,
        savedAt: serverTimestamp()
    };

    try {
        const championDocRef = doc(state.championsColRef, championConfigName);
        await setDoc(championDocRef, championData, { merge: true });
        UI.displayNotification(`Configuration "${championConfigName}" saved successfully!`, 'success', 'champion_config');
        logAnalyticEvent('save_config_firebase', { success: true });
        DOM.championNameInput.value = '';
    } catch (e) {
        UI.displayNotification(`Error saving: ${e.message}`, 'error', 'champion_config');
        console.error("Error saving to Firestore:", e);
        logAnalyticEvent('save_config_firebase', { success: false, error_message: e.message });
    }
}

/**
 * Loads a selected configuration from Firestore and applies it to the UI.
 * @async
 * @param {string|null} [configNameToLoad=null] - The name of the config to load. If null, uses the value from the dropdown.
 */
async function loadChampionFromFirestore(configNameToLoad = null) {
    if (!state.currentUserId || !state.championsColRef) {
        UI.displayNotification("Not signed in. Cannot load configurations.", 'error', 'champion_config');
        return;
    }
    const championConfigName = configNameToLoad || DOM.savedChampionsSelect.value;
    if (!championConfigName) {
        UI.displayNotification("No configuration selected to load.", 'error', 'champion_config');
        return;
    }

    try {
        const championDocRef = doc(state.championsColRef, championConfigName);
        const docSnap = await getDoc(championDocRef);

        if (docSnap.exists()) {
            const championData = docSnap.data();
            UI.applyConfigToInputs(championData);
            handleExpectedValueCalculation('load_config_firebase');
            UI.displayNotification(`Configuration "${championConfigName}" loaded.`, 'success', 'champion_config');
            logAnalyticEvent('load_config_firebase', { success: true });
        } else {
            UI.displayNotification(`Configuration "${championConfigName}" not found.`, 'error', 'champion_config');
            logAnalyticEvent('load_config_firebase', { success: false, reason: 'not_found' });
        }
    } catch (e) {
        UI.displayNotification(`Error loading: ${e.message}`, 'error', 'champion_config');
        console.error("Error loading from Firestore:", e);
        logAnalyticEvent('load_config_firebase', { success: false, error_message: e.message });
    }
}

/**
 * Deletes the selected configuration from Firestore after user confirmation.
 * @async
 */
async function deleteChampionFromFirestore() {
    if (!state.currentUserId || !state.championsColRef) {
        UI.displayNotification("Not signed in. Cannot delete.", 'error', 'champion_config');
        return;
    }
    const championConfigName = DOM.savedChampionsSelect.value;
    if (!championConfigName) {
        UI.displayNotification("No configuration selected to delete.", 'error', 'champion_config');
        return;
    }

    const confirmed = await UI.showConfirmationModal(`Delete "${championConfigName}"? This cannot be undone.`);
    if (!confirmed) {
        UI.displayNotification("Deletion cancelled.", 'info', 'champion_config');
        logAnalyticEvent('delete_config_action', { action: 'cancelled' });
        return;
    }

    try {
        await deleteDoc(doc(state.championsColRef, championConfigName));
        UI.displayNotification(`Configuration "${championConfigName}" deleted.`, 'success', 'champion_config');
        logAnalyticEvent('delete_config_action', { action: 'confirmed', success: true });
        DOM.championNameInput.value = '';
    } catch (e) {
        UI.displayNotification(`Error deleting: ${e.message}`, 'error', 'champion_config');
        console.error("Error deleting from Firestore:", e);
        logAnalyticEvent('delete_config_action', { action: 'confirmed', success: false, error_message: e.message });
    }
}

/**
 * Fetches and listens for real-time updates to the saved champion configurations from Firestore and populates the dropdown.
 * @async
 */
async function populateSavedChampionsDropdownFromFirestore() {
    if (!state.currentUserId || !state.championsColRef) {
        DOM.savedChampionsSelect.innerHTML = '<option value="">-- Not signed in --</option>';
        return;
    }
    if (state.unsubscribeChampionsListener) {
        state.unsubscribeChampionsListener();
    }

    const q = query(state.championsColRef, orderBy("name"));
    state.unsubscribeChampionsListener = onSnapshot(q, (querySnapshot) => {
        const hadSelection = DOM.savedChampionsSelect.value;
        DOM.savedChampionsSelect.innerHTML = ''; // Clear existing
        if (querySnapshot.empty) {
            DOM.savedChampionsSelect.innerHTML = '<option value="">-- No configurations saved --</option>';
        } else {
            DOM.savedChampionsSelect.innerHTML = '<option value="">-- Select a Configuration --</option>';
            querySnapshot.forEach((docSnap) => {
                const option = document.createElement('option');
                option.value = docSnap.id;
                option.textContent = docSnap.data().name || docSnap.id;
                DOM.savedChampionsSelect.appendChild(option);
            });
        }
        // Restore previous selection if it still exists
        if (hadSelection && Array.from(DOM.savedChampionsSelect.options).some(opt => opt.value === hadSelection)) {
            DOM.savedChampionsSelect.value = hadSelection;
        }
        logAnalyticEvent('firestore_dropdown_populated', { count: querySnapshot.size });
    }, (error) => {
        console.error("Error listening to champion configurations:", error);
        UI.displayNotification("Error fetching configurations.", 'error', 'champion_config');
        DOM.savedChampionsSelect.innerHTML = '<option value="">-- Error loading --</option>';
        logAnalyticEvent('firestore_listener_error', { error_message: error.message });
    });
}


// #endregion

// #region --- UI CONTROLLERS & DOM MANIPULATION ---

const UI = {
    /**
     * @typedef {'champion_config' | 'probability_sim' | 'local_config' | 'general'} NotificationArea
     * @typedef {'info' | 'success' | 'error'} NotificationType
     */

    /**
     * Displays a temporary notification message in a specified area of the UI.
     * @param {string} message - The message to display.
     * @param {NotificationType} [type='info'] - The type of notification (info, success, error).
     * @param {NotificationArea} [area='general'] - The UI area where the notification should appear.
     */
    displayNotification(message, type = 'info', area = 'general') {
        let statusDiv;
        switch (area) {
            case 'champion_config': statusDiv = DOM.championStatusDiv; break;
            case 'probability_sim': statusDiv = DOM.probabilityStatusDiv; break;
            case 'local_config': statusDiv = DOM.localConfigStatus; break;
            default: statusDiv = DOM.championStatusDiv;
        }
        if (!statusDiv) return;

        statusDiv.textContent = message;
        statusDiv.className = `status-message text-center py-1 status-${type}`;
        logAnalyticEvent('ui_notification_displayed', { type, area });

        setTimeout(() => {
            statusDiv.textContent = '';
            statusDiv.className = 'status-message mt-3';
        }, 4000);
    },

    /**
     * Enables or disables the champion management feature buttons and select input.
     * @param {boolean} disable - True to disable the features, false to enable.
     * @param {string} [reason=""] - A message to display in the dropdown when disabled.
     */
    disableChampionManagementFeatures(disable, reason = "") {
        DOM.saveChampionBtn.disabled = disable;
        DOM.loadChampionBtn.disabled = disable;
        DOM.deleteChampionBtn.disabled = disable;
        DOM.savedChampionsSelect.disabled = disable;
        if (disable && reason) {
            DOM.savedChampionsSelect.innerHTML = `<option value="">-- ${reason} --</option>`;
        }
    },

    /**
     * Sets the visual state of a button to indicate loading (e.g., shows a spinner).
     * @param {HTMLButtonElement} button - The button element.
     * @param {boolean} isLoading - True to show the loading state, false to return to normal.
     */
    setButtonLoadingState(button, isLoading) {
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
     * Shows a confirmation modal dialog.
     * @param {string} message - The confirmation message to display to the user.
     * @returns {Promise<boolean>} A promise that resolves to true if the user confirms, false otherwise.
     */
    showConfirmationModal(message) {
        return new Promise((resolve) => {
            const modalBackdrop = document.createElement('div');
            modalBackdrop.className = 'modal-backdrop active';
            const modalContent = document.createElement('div');
            modalContent.className = 'modal-content';
            modalContent.innerHTML = `
                <p class="mb-4">${message}</p>
                <div class="flex justify-end gap-3">
                    <button class="btn btn-secondary px-4 py-2" id="cancelBtn">Cancel</button>
                    <button class="btn btn-danger px-4 py-2" id="confirmBtn">Confirm</button>
                </div>
            `;
            modalBackdrop.appendChild(modalContent);
            document.body.appendChild(modalBackdrop);

            const close = (result) => {
                document.body.removeChild(modalBackdrop);
                resolve(result);
            };

            modalContent.querySelector('#confirmBtn').onclick = () => close(true);
            modalContent.querySelector('#cancelBtn').onclick = () => close(false);
        });
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
     * @typedef {object} ConfigData
     * @property {string} [name]
     * @property {string} [mythicProbability]
     * @property {string} [mythicHardPity]
     * @property {string} [lmRateUpChance]
     * @property {string} [currentMythicPity]
     * @property {string} [currentLMPity]
     * @property {boolean} [includeUnlockCost]
     * @property {string} [startStarLevel]
     * @property {string} [targetStarLevel]
     * @property {string} [currentLMS]
     * @property {string} [currentNMS]
     * @property {string} [proposedLMS]
     */
    
    /**
     * Applies a configuration data object to all the relevant UI input fields.
     * @param {ConfigData} configData - The configuration data to apply.
     */
    applyConfigToInputs(configData) {
        DOM.mythicProbabilityInput.value = configData.mythicProbability || "0.0384";
        DOM.mythicHardPityInput.value = configData.mythicHardPity || "50";
        DOM.lmRateUpChanceInput.value = configData.lmRateUpChance || "0.269";
        DOM.currentMythicPityInput.value = configData.currentMythicPity || "0";
        DOM.currentLMPityInput.value = configData.currentLMPity || "0";
        state.isUnlockCostIncluded = configData.includeUnlockCost === true;
        this.updateToggleUnlockButtonAppearance();
        DOM.startStarLevelSelect.value = configData.startStarLevel || "0_shards";
        DOM.targetStarLevelSelect.value = configData.targetStarLevel || Object.keys(CONSTANTS.SHARD_REQUIREMENTS)[0];
        DOM.championNameInput.value = configData.name || configData.championName || ''; // Support both 'name' and 'championName'
        DOM.currentLMSInput.value = configData.currentLMS !== undefined ? configData.currentLMS : "40";
        DOM.currentNMSInput.value = configData.currentNMS !== undefined ? configData.currentNMS : "0";
        DOM.proposedLMSInput.value = configData.proposedLMS !== undefined ? configData.proposedLMS : "40";
        
        // Reset simulation results area
        DOM.probabilityResultsArea.classList.add('hidden');
        DOM.probabilityResultsArea.innerHTML = '';
        if(DOM.probabilityStatusDiv) DOM.probabilityStatusDiv.textContent = '';
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
    // Destroy existing chart on this canvas if it exists
    if (window[canvasId + 'Instance']) {
        window[canvasId + 'Instance'].destroy();
    }

    const ctx = canvasElement.getContext('2d');
    const instance = new Chart(ctx, {
        type: 'bar',
        data: chartData,
        options: chartOptions,
    });
    window[canvasId + 'Instance'] = instance; // Cache instance
    return instance;
}

/**
 * Updates the main anvil cost comparison chart with new data.
 * @param {number[]} currentCosts - Array of average costs for the current system.
 * @param {number[]} proposedCosts - Array of average costs for the proposed system.
 * @param {string[]} labels - Array of labels for the x-axis (star levels).
 * @param {boolean} includeUnlock - Whether to include the unlock cost in the bars.
 * @param {number} unlockCostAvgForChart - The average cost to unlock a character.
 */
function updateMainAnvilCostChart(currentCosts, proposedCosts, labels, includeUnlock, unlockCostAvgForChart) {
    const finalCurrentCosts = currentCosts.map(cost => includeUnlock ? cost + unlockCostAvgForChart : cost);
    const finalProposedCosts = proposedCosts.map(cost => includeUnlock ? cost + unlockCostAvgForChart : cost);

    const data = {
        labels: labels,
        datasets: [
            { label: 'Current System (Avg Total)', data: finalCurrentCosts, backgroundColor: 'rgba(59, 130, 246, 0.7)' },
            { label: 'Proposed System (Avg Total)', data: finalProposedCosts, backgroundColor: 'rgba(16, 185, 129, 0.7)' }
        ]
    };
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                title: { display: true, text: includeUnlock ? 'Total Anvils (Unlock + Upgrade)' : 'Anvils for Upgrade Only', color: CONSTANTS.CHART_STYLING.TITLE_COLOR },
                grid: { color: CONSTANTS.CHART_STYLING.GRID_COLOR },
                ticks: { color: CONSTANTS.CHART_STYLING.FONT_COLOR }
            },
            x: {
                title: { display: true, text: 'Star Level', color: CONSTANTS.CHART_STYLING.TITLE_COLOR },
                grid: { display: false },
                ticks: { color: CONSTANTS.CHART_STYLING.FONT_COLOR }
            }
        },
        plugins: {
            legend: { labels: { color: CONSTANTS.CHART_STYLING.FONT_COLOR } },
            tooltip: {
                backgroundColor: CONSTANTS.CHART_STYLING.TOOLTIP_BG_COLOR,
                titleColor: CONSTANTS.CHART_STYLING.TITLE_COLOR,
                bodyColor: CONSTANTS.CHART_STYLING.FONT_COLOR,
                callbacks: { label: context => `${context.dataset.label}: ${Math.round(context.raw)} Anvils` }
            }
        }
    };
    
    state.anvilCostChart = createChart('anvilCostChart', data, options);
}

/**
 * Displays a probability distribution histogram chart.
 * @param {string} canvasId - The ID of the canvas element for the chart.
 * @param {object} histogram - The histogram data (labels, data).
 * @param {string} systemLabel - A label for the system being displayed (e.g., "Current System").
 */
function displayProbabilityDistributionChart(canvasId, histogram, systemLabel) {
    const isCurrentSystem = systemLabel.toLowerCase().includes('current');
    const data = {
        labels: histogram.labels,
        datasets: [{
            label: `Anvil Cost Frequency`,
            data: histogram.data,
            backgroundColor: isCurrentSystem ? 'rgba(59, 130, 246, 0.7)' : 'rgba(16, 185, 129, 0.7)',
        }]
    };
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: { beginAtZero: true, title: { display: true, text: 'Number of Runs', color: CONSTANTS.CHART_STYLING.TITLE_COLOR }, grid: { color: CONSTANTS.CHART_STYLING.GRID_COLOR }, ticks: { color: CONSTANTS.CHART_STYLING.FONT_COLOR } },
            x: { title: { display: true, text: 'Anvils Spent', color: CONSTANTS.CHART_STYLING.TITLE_COLOR }, grid: { display: false }, ticks: { color: CONSTANTS.CHART_STYLING.FONT_COLOR, autoSkip: true, maxTicksLimit: 15 } }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: CONSTANTS.CHART_STYLING.TOOLTIP_BG_COLOR,
                titleColor: CONSTANTS.CHART_STYLING.TITLE_COLOR,
                bodyColor: CONSTANTS.CHART_STYLING.FONT_COLOR,
                callbacks: { label: context => `${context.dataset.label}: ${context.parsed.y} runs` }
            }
        }
    };

    createChart(canvasId, data, options);
}

// ## Section Customization Controller ##

/**
 * Manages the visibility and order of UI sections.
 * @namespace
 */
const SectionCustomizer = {
    /**
     * Initializes section visibility and order from localStorage.
     */
    initialize() {
        const visibilityPrefs = this.loadPreferences(CONSTANTS.SECTION_VISIBILITY_STORAGE_KEY);
        const orderPrefs = this.loadPreferences(CONSTANTS.SECTION_ORDER_STORAGE_KEY, []);

        state.currentSectionOrder = orderPrefs.length > 0 ? orderPrefs : CONSTANTS.ALL_TOGGLEABLE_SECTIONS.map(s => s.id);
        
        // Ensure all sections are accounted for
        const validSectionIds = new Set(CONSTANTS.ALL_TOGGLEABLE_SECTIONS.map(s => s.id));
        state.currentSectionOrder = state.currentSectionOrder.filter(id => validSectionIds.has(id));
        CONSTANTS.ALL_TOGGLEABLE_SECTIONS.forEach(s => {
            if (!state.currentSectionOrder.includes(s.id)) {
                state.currentSectionOrder.push(s.id);
            }
        });

        this.savePreferences(CONSTANTS.SECTION_ORDER_STORAGE_KEY, state.currentSectionOrder);
        this.renderToggles();
        this.renderSectionsInOrder();
    },

    /**
     * Renders the toggle switches and reorder buttons for each section.
     */
    renderToggles() {
        DOM.sectionToggleContainer.innerHTML = '';
        const visibilityPrefs = this.loadPreferences(CONSTANTS.SECTION_VISIBILITY_STORAGE_KEY);

        state.currentSectionOrder.forEach((sectionId, index) => {
            const sectionConfig = CONSTANTS.ALL_TOGGLEABLE_SECTIONS.find(s => s.id === sectionId);
            if (!sectionConfig) return;

            const isVisible = visibilityPrefs[sectionConfig.id] !== false; // Default to visible
            const itemDiv = document.createElement('div');
            itemDiv.className = 'toggle-item';
            itemDiv.innerHTML = `
                <label class="toggle-label text-sm">
                    <input type="checkbox" data-target-section-id="${sectionConfig.id}" class="form-checkbox h-4 w-4 rounded" ${isVisible ? 'checked' : ''}>
                    ${sectionConfig.name}
                </label>
                <div class="order-buttons">
                    <button title="Move Up" ${index === 0 ? 'disabled' : ''} data-index="${index}" data-direction="-1">&uarr;</button>
                    <button title="Move Down" ${index === state.currentSectionOrder.length - 1 ? 'disabled' : ''} data-index="${index}" data-direction="1">&darr;</button>
                </div>
            `;
            DOM.sectionToggleContainer.appendChild(itemDiv);
            
            const sectionElement = document.getElementById(sectionConfig.id);
            if (sectionElement) sectionElement.classList.toggle('hidden', !isVisible);
        });
        
        // Add event listeners after rendering
        DOM.sectionToggleContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener('change', this.handleVisibilityChange.bind(this)));
        DOM.sectionToggleContainer.querySelectorAll('.order-buttons button').forEach(btn => btn.addEventListener('click', this.handleMoveSection.bind(this)));
    },

    /**
     * Re-renders the sections in the main container based on the current order.
     */
    renderSectionsInOrder() {
        if (!DOM.reorderableSectionsContainer) return;
        const fragment = document.createDocumentFragment();
        state.currentSectionOrder.forEach(sectionId => {
            const sectionElement = document.getElementById(sectionId);
            if (sectionElement) fragment.appendChild(sectionElement);
        });
        DOM.reorderableSectionsContainer.innerHTML = '';
        DOM.reorderableSectionsContainer.appendChild(fragment);
    },

    /**
     * Handles the change event for a section visibility toggle.
     * @param {Event} event - The change event object.
     */
    handleVisibilityChange(event) {
        const checkbox = event.target;
        const targetId = checkbox.dataset.targetSectionId;
        const sectionToToggle = document.getElementById(targetId);

        if (sectionToToggle) {
            sectionToToggle.classList.toggle('hidden', !checkbox.checked);
            const prefs = this.loadPreferences(CONSTANTS.SECTION_VISIBILITY_STORAGE_KEY);
            prefs[targetId] = checkbox.checked;
            this.savePreferences(CONSTANTS.SECTION_VISIBILITY_STORAGE_KEY, prefs);
            logAnalyticEvent('section_visibility_change', { section_id: targetId, is_visible: checkbox.checked });
        }
    },
    
    /**
     * Handles a click on a move up/down button.
     * @param {Event} event - The click event object.
     */
    handleMoveSection(event) {
        const button = event.currentTarget;
        const currentIndex = parseInt(button.dataset.index, 10);
        const direction = parseInt(button.dataset.direction, 10);
        const newIndex = currentIndex + direction;

        if (newIndex < 0 || newIndex >= state.currentSectionOrder.length) return;

        const itemToMove = state.currentSectionOrder.splice(currentIndex, 1)[0];
        state.currentSectionOrder.splice(newIndex, 0, itemToMove);

        this.savePreferences(CONSTANTS.SECTION_ORDER_STORAGE_KEY, state.currentSectionOrder);
        this.renderToggles();
        this.renderSectionsInOrder();
        logAnalyticEvent('section_order_change', { moved_section_id: itemToMove, direction: direction > 0 ? 'down' : 'up' });
    },

    /**
     * Saves a preference object to localStorage.
     * @param {string} key - The localStorage key.
     * @param {object | Array} value - The value to save.
     */
    savePreferences(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error(`Error saving to localStorage (${key}):`, e);
        }
    },

    /**
     * Loads a preference object from localStorage.
     * @param {string} key - The localStorage key.
     * @param {object | Array} [defaultValue={}] - The default value to return on failure.
     * @returns {object | Array} The loaded preference or the default value.
     */
    loadPreferences(key, defaultValue = {}) {
        try {
            const saved = localStorage.getItem(key);
            return saved ? JSON.parse(saved) : defaultValue;
        } catch (e) {
            console.error(`Error loading from localStorage (${key}):`, e);
            return defaultValue;
        }
    }
};

// #endregion

// #region --- CORE LOGIC & EVENT HANDLERS ---

/**
 * Gathers and validates all user inputs required for the Expected Value calculation.
 * @returns {{isValid: boolean, data: object, errors: object}} An object containing a validity flag, the parsed input data, and an error object.
 */
function validateAndGetEVInputs() {
    // Reset previous errors
    Object.values(DOM).filter(el => el && el.id && el.id.endsWith('Error')).forEach(el => el.classList.add('hidden'));

    const errors = {};
    const data = {};
    let isValid = true;

    const validate = (value, condition, errorEl, errorMessage) => {
        if (!condition(value)) {
            errorEl.textContent = errorMessage;
            errorEl.classList.remove('hidden');
            isValid = false;
            errors[errorEl.id] = true;
            return NaN;
        }
        return value;
    };

    data.mythicProbability = validate(parseFloat(DOM.mythicProbabilityInput.value), v => !isNaN(v) && v > 0 && v <= 1, DOM.mythicProbabilityError, 'Must be > 0 and <= 1');
    data.mythicHardPity = validate(parseInt(DOM.mythicHardPityInput.value, 10), v => !isNaN(v) && v >= 1, DOM.mythicHardPityError, 'Must be >= 1');
    data.lmRateUpChance = validate(parseFloat(DOM.lmRateUpChanceInput.value), v => !isNaN(v) && v >= 0 && v <= 1, DOM.lmRateUpChanceError, 'Must be 0 to 1');
    data.currentMythicPity = validate(parseInt(DOM.currentMythicPityInput.value, 10) || 0, v => !isNaN(v) && v >= 0 && v < data.mythicHardPity, DOM.currentMythicPityError, `Must be 0 to ${data.mythicHardPity - 1}`);
    data.currentLMPity = validate(parseInt(DOM.currentLMPityInput.value, 10) || 0, v => !isNaN(v) && v >= 0 && v < CONSTANTS.NM_GUARANTEE_THRESHOLD, DOM.currentLMPityError, `Must be 0 to ${CONSTANTS.NM_GUARANTEE_THRESHOLD - 1}`);
    
    data.lmShardsCurrent = validate(parseInt(DOM.currentLMSInput.value, 10), v => !isNaN(v) && v >= 0, DOM.currentLMSError, 'Invalid');
    data.nmShardsCurrent = validate(parseInt(DOM.currentNMSInput.value, 10), v => !isNaN(v) && v >= 0, DOM.currentNMSError, 'Invalid');
    data.lmShardsProposed = validate(parseInt(DOM.proposedLMSInput.value, 10), v => !isNaN(v) && v >= 0, DOM.proposedLMSError, 'Invalid');
    data.nmShardsProposed = 0; // This is a fixed value in the proposed system logic

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

    if (!isValid) {
        logAnalyticEvent('input_validation_error', { failed_fields: Object.keys(errors).join(',') });
    }

    return { isValid, data, errors };
}

/**
 * Performs all the core Expected Value calculations based on validated inputs.
 * @param {object} inputs - The validated input data from `validateAndGetEVInputs`.
 * @returns {{isValid: boolean, data: object, errorMessage: string|null}} An object with calculation results or an error message.
 */
function performExpectedValueCalculations(inputs) {
    const { mythicProbability, mythicHardPity, lmRateUpChance, shardsNeededForUpgrade, lmShardsCurrent, nmShardsCurrent, lmShardsProposed, nmShardsProposed } = inputs;
    const results = {};

    results.drawsPerMythicAverage = calculateExpectedDrawsPerMythic(mythicProbability, mythicHardPity);
    if (isNaN(results.drawsPerMythicAverage)) return { isValid: false, errorMessage: 'Error in base Mythic calculation.' };

    results.unlockCycleMetrics = calculateLmCycleMetrics(1, 0, lmRateUpChance, CONSTANTS.NM_GUARANTEE_THRESHOLD);
    if (isNaN(results.unlockCycleMetrics.expectedMythicPullsPerLmCycle)) return { isValid: false, errorMessage: 'Error calculating unlock cycle.' };

    results.anvilsUnlockAvg = results.unlockCycleMetrics.expectedMythicPullsPerLmCycle * results.drawsPerMythicAverage;
    results.anvilsUnlockBest = 1 * 1; // 1 pull, 1 mythic
    results.anvilsUnlockWorst = results.unlockCycleMetrics.worstCaseMythicPullsPerLmCycle * mythicHardPity;

    const lmCycleMetricsCurrent = calculateLmCycleMetrics(lmShardsCurrent, nmShardsCurrent, lmRateUpChance, CONSTANTS.NM_GUARANTEE_THRESHOLD);
    const lmCycleMetricsProposed = calculateLmCycleMetrics(lmShardsProposed, nmShardsProposed, lmRateUpChance, CONSTANTS.NM_GUARANTEE_THRESHOLD);
    if (isNaN(lmCycleMetricsCurrent.averageShardsPerEffectiveMythic) || isNaN(lmCycleMetricsProposed.averageShardsPerEffectiveMythic)) {
        return { isValid: false, errorMessage: 'Error in shard per mythic calculation.' };
    }

    results.avgEffShardsCurr = lmCycleMetricsCurrent.averageShardsPerEffectiveMythic;
    results.avgEffShardsProp = lmCycleMetricsProposed.averageShardsPerEffectiveMythic;
    results.bestShardsCurr = lmShardsCurrent;
    results.bestShardsProp = lmShardsProposed;
    results.worstShardsCurr = (nmShardsCurrent * CONSTANTS.NM_GUARANTEE_THRESHOLD + lmShardsCurrent) / (CONSTANTS.NM_GUARANTEE_THRESHOLD + 1);
    results.worstShardsProp = (nmShardsProposed * CONSTANTS.NM_GUARANTEE_THRESHOLD + lmShardsProposed) / (CONSTANTS.NM_GUARANTEE_THRESHOLD + 1);

    results.upgradeAnvilsCurrent = calculateGachaAnvils(shardsNeededForUpgrade, results.avgEffShardsCurr, results.drawsPerMythicAverage);
    results.upgradeAnvilsProposed = calculateGachaAnvils(shardsNeededForUpgrade, results.avgEffShardsProp, results.drawsPerMythicAverage);
    results.upgradeAnvilsBestCurrent = calculateGachaAnvils(shardsNeededForUpgrade, results.bestShardsCurr, 1);
    results.upgradeAnvilsWorstCurrent = calculateGachaAnvils(shardsNeededForUpgrade, results.worstShardsCurr, mythicHardPity);
    results.upgradeAnvilsBestProposed = calculateGachaAnvils(shardsNeededForUpgrade, results.bestShardsProp, 1);
    results.upgradeAnvilsWorstProposed = calculateGachaAnvils(shardsNeededForUpgrade, results.worstShardsProp, mythicHardPity);
    
    // Pass along some original inputs for UI updates
    results.shardsNeededForUpgrade = shardsNeededForUpgrade;
    results.lmShardsCurrent = lmShardsCurrent;
    results.nmShardsCurrent = nmShardsCurrent;
    results.lmShardsProposed = lmShardsProposed;

    return { isValid: true, data: results };
}

/**
 * Updates the entire Expected Value results section of the UI with new calculation data.
 * @param {object} metrics - The calculated metrics from `performExpectedValueCalculations`.
 */
function updateExpectedValueUI(metrics) {
    const {
        drawsPerMythicAverage, unlockCycleMetrics, anvilsUnlockAvg, anvilsUnlockBest, anvilsUnlockWorst,
        avgEffShardsCurr, avgEffShardsProp, bestShardsCurr, bestShardsProp, worstShardsCurr, worstShardsProp,
        upgradeAnvilsCurrent, upgradeAnvilsProposed, upgradeAnvilsBestCurrent, upgradeAnvilsWorstCurrent,
        upgradeAnvilsBestProposed, upgradeAnvilsWorstProposed, shardsNeededForUpgrade,
        lmShardsCurrent, nmShardsCurrent, lmShardsProposed
    } = metrics;

    const formatNum = (val, dec = 2) => isFinite(val) ? val.toFixed(dec) : (shardsNeededForUpgrade <= 0 ? '0' : 'Inf');
    const formatAnvil = (val) => isFinite(val) ? Math.round(val).toString() : (shardsNeededForUpgrade <= 0 ? '0' : 'Infinity');
    const formatMythicPulls = (shards, effShards) => (effShards > 0 && shards > 0) ? Math.ceil(shards / effShards).toString() : (shards <= 0 ? '0' : 'Inf');

    // Update main calculation details
    DOM.calcDrawsPerMythicSpan.textContent = formatNum(drawsPerMythicAverage);
    DOM.calcWorstCaseMythicsForLMSpan.textContent = unlockCycleMetrics.worstCaseMythicPullsPerLmCycle.toString();
    DOM.calcAvgShardsCurrentSpan.textContent = formatNum(avgEffShardsCurr);
    DOM.calcAvgShardsProposedSpan.textContent = formatNum(avgEffShardsProp);
    
    // Update system parameter details
    DOM.detailLMSCurrentSpan.textContent = lmShardsCurrent.toString();
    DOM.detailNMSCurrentSpan.textContent = nmShardsCurrent.toString();
    DOM.detailLMSProposedSpan.textContent = lmShardsProposed.toString();
    DOM.detailNMSProposedSpan.textContent = "0 (after bonus pulls)";
    
    // Update main result boxes based on unlock cost inclusion
    const isIncluded = state.isUnlockCostIncluded;
    DOM.unlockCostSection.classList.toggle('hidden', !isIncluded);
    DOM.detailUnlockCostSection.classList.toggle('hidden', !isIncluded);
    DOM.advisoryBox.classList.toggle('advisory-indigo-theme', isIncluded);
    DOM.advisoryMessage.innerHTML = isIncluded ? `Costs below <strong>INCLUDE</strong> initial unlock.` : `Costs below are for the <strong>selected shard upgrade ONLY</strong>.`;
    DOM.currentSystemTitle.textContent = isIncluded ? "Current System (Total)" : "Current System (Upgrade Only)";
    DOM.proposedSystemTitle.textContent = isIncluded ? "Proposed System (Total)" : "Proposed System (Upgrade Only)";

    if(isIncluded) {
        [DOM.anvilsUnlockAvgSpan, DOM.detailAnvilsUnlockAvgSpan].forEach(el => el.textContent = formatAnvil(anvilsUnlockAvg));
        [DOM.anvilsUnlockBestSpan, DOM.detailAnvilsUnlockBestSpan].forEach(el => el.textContent = formatAnvil(anvilsUnlockBest));
        [DOM.anvilsUnlockWorstSpan, DOM.detailAnvilsUnlockWorstSpan].forEach(el => el.textContent = formatAnvil(anvilsUnlockWorst));
        DOM.detailAvgMythicsForLMSpan.textContent = formatNum(unlockCycleMetrics.expectedMythicPullsPerLmCycle);
    }
    
    DOM.anvilsCurrentSpan.textContent = formatAnvil(isIncluded ? anvilsUnlockAvg + upgradeAnvilsCurrent : upgradeAnvilsCurrent);
    DOM.anvilsProposedSpan.textContent = formatAnvil(isIncluded ? anvilsUnlockAvg + upgradeAnvilsProposed : upgradeAnvilsProposed);
    DOM.anvilsBestCurrentSpan.textContent = formatAnvil(isIncluded ? anvilsUnlockBest + upgradeAnvilsBestCurrent : upgradeAnvilsBestCurrent);
    DOM.anvilsWorstCurrentSpan.textContent = formatAnvil(isIncluded ? anvilsUnlockWorst + upgradeAnvilsWorstCurrent : upgradeAnvilsWorstCurrent);
    DOM.anvilsBestProposedSpan.textContent = formatAnvil(isIncluded ? anvilsUnlockBest + upgradeAnvilsBestProposed : upgradeAnvilsBestProposed);
    DOM.anvilsWorstProposedSpan.textContent = formatAnvil(isIncluded ? anvilsUnlockWorst + upgradeAnvilsWorstProposed : upgradeAnvilsWorstProposed);

    // Update detailed breakdown tables
    DOM.detailTargetShardsCurrentSpan.textContent = shardsNeededForUpgrade.toString();
    DOM.detailAvgShardsCurrentSpan.textContent = formatNum(avgEffShardsCurr);
    DOM.detailMythicPullsAvgCurrentSpan.textContent = formatMythicPulls(shardsNeededForUpgrade, avgEffShardsCurr);
    DOM.detailAnvilsAvgCurrentSpan.textContent = formatAnvil(upgradeAnvilsCurrent);
    DOM.detailBestShardsCurrentSpan.textContent = formatNum(bestShardsCurr);
    DOM.detailMythicPullsBestCurrentSpan.textContent = formatMythicPulls(shardsNeededForUpgrade, bestShardsCurr);
    DOM.detailAnvilsBestCurrentSpan.textContent = formatAnvil(upgradeAnvilsBestCurrent);
    DOM.detailWorstShardsCurrentSpan.textContent = formatNum(worstShardsCurr);
    DOM.detailMythicPullsWorstCurrentSpan.textContent = formatMythicPulls(shardsNeededForUpgrade, worstShardsCurr);
    DOM.detailAnvilsWorstCurrentSpan.textContent = formatAnvil(upgradeAnvilsWorstCurrent);

    DOM.detailTargetShardsProposedSpan.textContent = shardsNeededForUpgrade.toString();
    DOM.detailAvgShardsProposedSpan.textContent = formatNum(avgEffShardsProp);
    DOM.detailMythicPullsAvgProposedSpan.textContent = formatMythicPulls(shardsNeededForUpgrade, avgEffShardsProp);
    DOM.detailAnvilsAvgProposedSpan.textContent = formatAnvil(upgradeAnvilsProposed);
    DOM.detailBestShardsProposedSpan.textContent = formatNum(bestShardsProp);
    DOM.detailMythicPullsBestProposedSpan.textContent = formatMythicPulls(shardsNeededForUpgrade, bestShardsProp);
    DOM.detailAnvilsBestProposedSpan.textContent = formatAnvil(upgradeAnvilsBestProposed);
    DOM.detailWorstShardsProposedSpan.textContent = formatNum(worstShardsProp);
    DOM.detailMythicPullsWorstProposedSpan.textContent = formatMythicPulls(shardsNeededForUpgrade, worstShardsProp);
    DOM.detailAnvilsWorstProposedSpan.textContent = formatAnvil(upgradeAnvilsWorstProposed);

    // Update conclusion text
    const totalCurrent = parseFloat(DOM.anvilsCurrentSpan.textContent);
    const totalProposed = parseFloat(DOM.anvilsProposedSpan.textContent);
    if (shardsNeededForUpgrade <= 0 && !isIncluded) {
        DOM.conclusionParagraph.textContent = "No shards needed for this upgrade range. Cost is 0.";
    } else if (isFinite(totalCurrent) && isFinite(totalProposed)) {
        const diff = Math.abs(totalCurrent - totalProposed);
        if (totalCurrent < totalProposed) DOM.conclusionParagraph.textContent = `The Current System is ~${Math.round(diff)} Anvils more efficient on average.`;
        else if (totalProposed < totalCurrent) DOM.conclusionParagraph.textContent = `The Proposed System is ~${Math.round(diff)} Anvils more efficient on average.`;
        else DOM.conclusionParagraph.textContent = 'Both systems require a similar number of Anvils on average.';
    } else {
        DOM.conclusionParagraph.textContent = 'Could not determine efficiency due to non-finite Anvil costs.';
    }

    // Update the main cost chart
    const chartLabels = Object.keys(CONSTANTS.SHARD_REQUIREMENTS);
    const chartCostsCurr = chartLabels.map(lvl => calculateGachaAnvils(CONSTANTS.SHARD_REQUIREMENTS[lvl], avgEffShardsCurr, drawsPerMythicAverage));
    const chartCostsProp = chartLabels.map(lvl => calculateGachaAnvils(CONSTANTS.SHARD_REQUIREMENTS[lvl], avgEffShardsProp, drawsPerMythicAverage));
    updateMainAnvilCostChart(chartCostsCurr, chartCostsProp, chartLabels, isIncluded, anvilsUnlockAvg);
}

/**
 * Controller function that orchestrates the Expected Value calculation and UI update.
 * @param {string} [triggerSource='unknown'] - A string identifying what triggered the calculation for analytics.
 */
function handleExpectedValueCalculation(triggerSource = 'unknown') {
    logAnalyticEvent('calculation_triggered', { type: 'expected_value', source: triggerSource });
    UI.setButtonLoadingState(DOM.calculateBtn, true);

    setTimeout(() => { // Use timeout to allow UI to update (show loader)
        const inputs = validateAndGetEVInputs();
        if (!inputs.isValid) {
            UI.setButtonLoadingState(DOM.calculateBtn, false);
            DOM.conclusionParagraph.textContent = 'Please correct the highlighted input errors.';
            logAnalyticEvent('ev_calculation_completed', { status: 'error', reason: 'input_validation' });
            return;
        }

        const metrics = performExpectedValueCalculations(inputs.data);
        if (!metrics.isValid) {
            DOM.conclusionParagraph.textContent = metrics.errorMessage || 'Error in EV calculation.';
            UI.setButtonLoadingState(DOM.calculateBtn, false);
            logAnalyticEvent('ev_calculation_completed', { status: 'error', reason: 'calculation_error' });
            return;
        }

        updateExpectedValueUI(metrics.data);
        UI.setButtonLoadingState(DOM.calculateBtn, false);
        logAnalyticEvent('ev_calculation_completed', { status: 'success' });
    }, 10); // small delay
}

/**
 * Exports the current configuration settings to a JSON string and displays it in a modal.
 */
function exportConfiguration() {
    const configData = {
        championName: DOM.championNameInput.value.trim() || "Unnamed Export",
        mythicProbability: DOM.mythicProbabilityInput.value,
        mythicHardPity: DOM.mythicHardPityInput.value,
        lmRateUpChance: DOM.lmRateUpChanceInput.value,
        currentMythicPity: DOM.currentMythicPityInput.value,
        currentLMPity: DOM.currentLMPityInput.value,
        includeUnlockCost: state.isUnlockCostIncluded,
        startStarLevel: DOM.startStarLevelSelect.value,
        targetStarLevel: DOM.targetStarLevelSelect.value,
        currentLMS: DOM.currentLMSInput.value,
        currentNMS: DOM.currentNMSInput.value,
        proposedLMS: DOM.proposedLMSInput.value
    };

    try {
        const jsonString = JSON.stringify(configData, null, 2);
        // Using a simple modal via showConfirmationModal structure
        const modalBackdrop = document.createElement('div');
        modalBackdrop.className = 'modal-backdrop active';
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        modalContent.innerHTML = `
            <h3 class="text-lg font-semibold">Exported Configuration (JSON)</h3>
            <p class="text-sm text-gray-600 mb-2">Copy the code below to import it later.</p>
            <textarea readonly rows="10" class="w-full p-2 border rounded bg-gray-50 font-mono text-sm">${jsonString}</textarea>
            <div class="flex justify-end gap-3 mt-4">
                <button class="btn btn-primary px-4 py-2" id="copyBtn">Copy Code</button>
                <button class="btn btn-secondary px-4 py-2" id="closeBtn">Close</button>
            </div>
        `;
        modalBackdrop.appendChild(modalContent);
        document.body.appendChild(modalBackdrop);

        modalContent.querySelector('#copyBtn').onclick = () => {
            modalContent.querySelector('textarea').select();
            document.execCommand('copy');
            UI.displayNotification('Code copied to clipboard!', 'success', 'local_config');
        };
        modalContent.querySelector('#closeBtn').onclick = () => document.body.removeChild(modalBackdrop);

        logAnalyticEvent('export_config_local', { success: true });
    } catch (e) {
        UI.displayNotification('Error exporting configuration.', 'error', 'local_config');
        console.error("Error exporting configuration:", e);
        logAnalyticEvent('export_config_local', { success: false, error_message: e.message });
    }
}

/**
 * Imports a configuration from a JSON string provided by the user.
 */
function importConfiguration() {
    const jsonString = DOM.importConfigText.value.trim();
    if (!jsonString) {
        UI.displayNotification('Paste configuration text first.', 'error', 'local_config');
        return;
    }

    try {
        const configData = JSON.parse(jsonString);
        if (typeof configData !== 'object' || configData === null) {
            throw new Error("Invalid configuration format.");
        }

        UI.applyConfigToInputs(configData);
        handleExpectedValueCalculation('import_config_local');
        
        UI.displayNotification('Configuration imported successfully!', 'success', 'local_config');
        logAnalyticEvent('import_config_local', { success: true });
        DOM.importConfigText.value = '';

    } catch (e) {
        UI.displayNotification('Import failed. Invalid or corrupted JSON.', 'error', 'local_config');
        console.error("Error importing configuration:", e);
        logAnalyticEvent('import_config_local', { success: false, error_message: e.message });
    }
}

// #endregion

// #region --- PROBABILITY SIMULATION ---

/**
 * Simulates a single attempt to reach a shard goal within a budget.
 * @param {object} params - The parameters for the simulation.
 * @returns {number} The total anvils spent. Returns budget + 1 if the goal was not met.
 */
function simulateSingleSuccessAttempt({ budget, mythicProb, hardPity, lmRateUp, nmGuarantee, includeUnlock, targetShardsForUpgrade, systemConfig, initialMythicPity, initialLMPityStreak }) {
    let totalAnvilsSpent = 0;
    let currentShards = 0;
    let mythicPityCounter = initialMythicPity;
    let nmFailStreak = initialLMPityStreak;
    let isUnlocked = !includeUnlock;
    let nmPullCounterForProposedBonus = 0;

    const performPull = () => {
        mythicPityCounter++;
        totalAnvilsSpent++;
        if (mythicPityCounter >= hardPity || Math.random() < mythicProb) {
            mythicPityCounter = 0;
            const isLMPull = nmFailStreak >= nmGuarantee || Math.random() < lmRateUp;
            if (isLMPull) {
                nmFailStreak = 0;
                return { isLM: true, shards: systemConfig.lmShardsYield };
            } else {
                nmFailStreak++;
                let bonusShards = 0;
                if (systemConfig.type === 'proposed') {
                    nmPullCounterForProposedBonus++;
                    if (nmPullCounterForProposedBonus <= 6) {
                        bonusShards = [2, 3, 5][Math.floor(Math.random() * 3)];
                    }
                }
                return { isLM: false, shards: (systemConfig.nmShardsYieldCurrent || 0) + bonusShards };
            }
        }
        return null; // No mythic this pull
    };

    // 1. Unlock phase (if required)
    if (includeUnlock && !isUnlocked) {
        while (totalAnvilsSpent < budget) {
            const pullResult = performPull();
            if (pullResult) {
                currentShards += pullResult.shards;
                if (pullResult.isLM) {
                    isUnlocked = true;
                    break;
                }
            }
        }
        if (!isUnlocked) return budget + 1; // Failed to unlock within budget
    }

    // 2. Shard acquisition phase
    while (currentShards < targetShardsForUpgrade) {
        if (totalAnvilsSpent >= budget) return budget + 1; // Ran out of budget
        const pullResult = performPull();
        if (pullResult) {
            currentShards += pullResult.shards;
        }
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
    if (index === Math.floor(index)) {
        return sortedData[index];
    } else {
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        return sortedData[lower] * (upper - index) + sortedData[upper] * (index - lower);
    }
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
    if (successfulRuns.length === 0) {
        return { labels: [`> ${budget} (Failures)`], data: [anvilCosts.length], successRate: 0, medianCost: NaN, p90Cost: NaN };
    }
    
    successfulRuns.sort((a, b) => a - b);
    const minCost = successfulRuns[0];
    const maxCost = successfulRuns[successfulRuns.length - 1];
    const binSize = Math.max(1, Math.ceil((maxCost - minCost + 1) / numBins));
    const bins = [];
    
    for (let i = minCost; i <= maxCost; i += binSize) {
        const binStart = i;
        const binEnd = i + binSize - 1;
        bins.push({ start: binStart, end: binEnd, count: 0 });
    }

    let failures = 0;
    anvilCosts.forEach(cost => {
        if (cost <= budget) {
            const targetBin = bins.find(bin => cost >= bin.start && cost <= bin.end);
            if (targetBin) targetBin.count++;
        } else {
            failures++;
        }
    });

    const chartData = bins.map(bin => bin.count);
    const chartLabels = bins.map(bin => `${bin.start}-${bin.end}`);
    if (failures > 0) {
        chartLabels.push(`> ${budget} (Failed)`);
        chartData.push(failures);
    }

    return {
        labels: chartLabels,
        data: chartData,
        successRate: (successfulRuns.length / anvilCosts.length) * 100,
        medianCost: getPercentile(successfulRuns, 50),
        p90Cost: getPercentile(successfulRuns, 90),
    };
}

/**
 * Runs the main probability simulation and updates the UI with the results.
 */
function runProbabilitySimulation() {
    logAnalyticEvent('calculation_triggered', { type: 'probability_simulation' });
    UI.setButtonLoadingState(DOM.calculateProbabilityBtn, true);
    UI.displayNotification("Running simulation... this may take a moment.", 'info', 'probability_sim');

    // Use a timeout to allow the UI to update before the heavy computation begins.
    setTimeout(() => {
        const inputs = validateAndGetEVInputs(); // Use the same validation logic
        const budget = parseInt(DOM.anvilBudgetInput.value, 10);

        if (!inputs.isValid || isNaN(budget) || budget <= 0) {
            UI.displayNotification("Invalid inputs for simulation.", 'error', 'probability_sim');
            UI.setButtonLoadingState(DOM.calculateProbabilityBtn, false);
            logAnalyticEvent('probability_simulation_completed', { status: 'error', reason: 'invalid_inputs' });
            return;
        }

        const simParams = {
            budget: budget,
            mythicProb: inputs.data.mythicProbability,
            hardPity: inputs.data.mythicHardPity,
            lmRateUp: inputs.data.lmRateUpChance,
            nmGuarantee: CONSTANTS.NM_GUARANTEE_THRESHOLD,
            includeUnlock: state.isUnlockCostIncluded,
            targetShardsForUpgrade: inputs.data.shardsNeededForUpgrade,
            initialMythicPity: inputs.data.currentMythicPity,
            initialLMPityStreak: inputs.data.currentLMPity
        };
        
        const currentSystemConfig = { type: 'current', lmShardsYield: inputs.data.lmShardsCurrent, nmShardsYieldCurrent: inputs.data.nmShardsCurrent };
        const proposedSystemConfig = { type: 'proposed', lmShardsYield: inputs.data.lmShardsProposed };

        const anvilCostsCurrent = Array.from({ length: CONSTANTS.NUM_SIM_RUNS }, () => simulateSingleSuccessAttempt({ ...simParams, systemConfig: currentSystemConfig }));
        const anvilCostsProposed = Array.from({ length: CONSTANTS.NUM_SIM_RUNS }, () => simulateSingleSuccessAttempt({ ...simParams, systemConfig: proposedSystemConfig }));

        const numBins = Math.min(25, Math.max(8, Math.floor(budget / 25)));
        const histDataCurrent = createHistogramData(anvilCostsCurrent, budget, numBins);
        const histDataProposed = createHistogramData(anvilCostsProposed, budget, numBins);

        // Update UI with results
        DOM.probabilityResultsArea.innerHTML = ` 
            <p class="mb-2 text-center font-medium">Goal: ${DOM.targetStarLevelSelect.value} from ${DOM.startStarLevelSelect.value} with a ${budget} Anvil budget.</p>
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div>
                    <h4 class="font-semibold text-lg text-center mb-1">Current System</h4>
                    <div class="chart-container prob-chart-container"><canvas id="probChartCurrent"></canvas></div>
                    <p id="probSummaryCurrent" class="text-sm text-center mt-2"></p>
                </div>
                <div>
                    <h4 class="font-semibold text-lg text-center mb-1">Proposed System</h4>
                    <div class="chart-container prob-chart-container"><canvas id="probChartProposed"></canvas></div>
                    <p id="probSummaryProposed" class="text-sm text-center mt-2"></p>
                </div>
            </div>
            <p class="text-xs mt-4 text-center text-gray-500">Based on ${CONSTANTS.NUM_SIM_RUNS.toLocaleString()} simulated attempts for each system.</p>
        `;
        DOM.probabilityResultsArea.classList.remove('hidden');

        document.getElementById('probSummaryCurrent').innerHTML = `Success: <strong>${histDataCurrent.successRate.toFixed(1)}%</strong> | Median (Success): <strong>${Math.round(histDataCurrent.medianCost) || 'N/A'}</strong> | P90 (Success): <strong>${Math.round(histDataCurrent.p90Cost) || 'N/A'}</strong>`;
        document.getElementById('probSummaryProposed').innerHTML = `Success: <strong>${histDataProposed.successRate.toFixed(1)}%</strong> | Median (Success): <strong>${Math.round(histDataProposed.medianCost) || 'N/A'}</strong> | P90 (Success): <strong>${Math.round(histDataProposed.p90Cost) || 'N/A'}</strong>`;

        displayProbabilityDistributionChart('probChartCurrent', histDataCurrent, 'Current System');
        displayProbabilityDistributionChart('probChartProposed', histDataProposed, 'Proposed System');

        UI.displayNotification("Simulation complete.", 'success', 'probability_sim');
        UI.setButtonLoadingState(DOM.calculateProbabilityBtn, false);
        logAnalyticEvent('probability_simulation_completed', { status: 'success' });
    }, 50);
}

// #endregion

// #region --- INITIALIZATION ---

/**
 * Attaches all necessary event listeners to the DOM elements.
 */
function attachEventListeners() {
    // Firebase actions
    DOM.saveChampionBtn.addEventListener('click', saveChampionToFirestore);
    DOM.loadChampionBtn.addEventListener('click', () => loadChampionFromFirestore());
    DOM.deleteChampionBtn.addEventListener('click', deleteChampionFromFirestore);

    // Local config actions
    DOM.exportConfigBtn.addEventListener('click', exportConfiguration);
    DOM.importConfigBtn.addEventListener('click', importConfiguration);

    // Calculation triggers
    DOM.calculateProbabilityBtn.addEventListener('click', runProbabilitySimulation);
    DOM.calculateBtn.addEventListener('click', () => handleExpectedValueCalculation('ev_button_click'));
    
    // Auto-recalculate on input change for EV
    const evTriggerInputs = [
        DOM.mythicProbabilityInput, DOM.mythicHardPityInput, DOM.lmRateUpChanceInput,
        DOM.currentMythicPityInput, DOM.currentLMPityInput, DOM.currentLMSInput,
        DOM.currentNMSInput, DOM.proposedLMSInput, DOM.startStarLevelSelect, DOM.targetStarLevelSelect
    ];
    evTriggerInputs.forEach(el => {
        if(el) el.addEventListener('input', (e) => handleExpectedValueCalculation(`input_change_${e.target.id}`));
    });

    // Toggle unlock cost
    DOM.toggleUnlockCostBtn.addEventListener('click', () => {
        state.isUnlockCostIncluded = !state.isUnlockCostIncluded;
        UI.updateToggleUnlockButtonAppearance();
        logAnalyticEvent('toggle_unlock_cost', { included: state.isUnlockCostIncluded });
        handleExpectedValueCalculation('toggle_unlock_cost');
    });

    // Analytics for details/summary toggles
    document.querySelectorAll('details').forEach(detailsEl => {
        detailsEl.addEventListener('toggle', function() {
            logAnalyticEvent('details_section_toggled', {
                section_id: this.id || 'anonymous_details',
                is_open: this.open
            });
        });
    });
}

/**
 * The main entry point for the application.
 * @async
 */
async function main() {
    UI.populateStarLevels();
    UI.updateToggleUnlockButtonAppearance();
    SectionCustomizer.initialize();
    
    await initializeFirebaseAndAuth();
    logAnalyticEvent('page_view', { app_id: CONSTANTS.APP_ID });

    attachEventListeners();
    
    // Perform an initial calculation on load
    handleExpectedValueCalculation('initial_load');
}

// --- Start the application ---
document.addEventListener('DOMContentLoaded', main);
