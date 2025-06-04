import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, setDoc, deleteDoc, onSnapshot, query, serverTimestamp, orderBy, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent as fbLogEventInternal } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

let fbApp;
let fbAuth;
let fbDb;
let fbAnalytics;
let currentUserId = null;
let championsColRef = null; 
let unsubscribeChampionsListener = null;

let probChartCurrentInstance = null;
let probChartProposedInstance = null;
let anvilCostChart = null; 

const appId = typeof __app_id !== 'undefined' ? __app_id : 'dc-dark-legion-builder'; 
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "AIzaSyAzSQbS4LtAz20syWI2HREPR7UnYh6ldbI",
    authDomain: "dc-dark-legion-tools.firebaseapp.com",
    projectId: "dc-dark-legion-tools",
    storageBucket: "dc-dark-legion-tools.appspot.com",
    messagingSenderId: "786517074225",
    appId: "1:786517074225:web:9f14dc4dcae0705fcfd010"
};

function logAnalyticEvent(eventName, params = {}) {
    if (fbAnalytics) {
        try {
            fbLogEventInternal(fbAnalytics, eventName, params);
        } catch (e) {
            console.warn(`Analytics event "${eventName}" failed:`, e);
        }
    } else {
        console.log(`Analytics (fbAnalytics not ready): ${eventName}`, params);
    }
}

const championNameInput = document.getElementById('championName');
const saveChampionBtn = document.getElementById('saveChampionBtn');
const savedChampionsSelect = document.getElementById('savedChampions');
const loadChampionBtn = document.getElementById('loadChampionBtn');
const deleteChampionBtn = document.getElementById('deleteChampionBtn');
const championStatusDiv = document.getElementById('championStatus');
const userIdDisplay = document.getElementById('userIdDisplay');

const exportConfigBtn = document.getElementById('exportConfigBtn');
const importConfigText = document.getElementById('importConfigText');
const importConfigBtn = document.getElementById('importConfigBtn');
const localConfigStatus = document.getElementById('localConfigStatus');

const mythicProbabilityInput = document.getElementById('mythicProbability');
const mythicHardPityInput = document.getElementById('mythicHardPity');
const currentMythicPityInput = document.getElementById('currentMythicPity');
const currentLMPityInput = document.getElementById('currentLMPity');
const lmRateUpChanceInput = document.getElementById('lmRateUpChance');
const mythicProbabilityError = document.getElementById('mythicProbabilityError');
const mythicHardPityError = document.getElementById('mythicHardPityError');
const currentMythicPityError = document.getElementById('currentMythicPityError');
const currentLMPityError = document.getElementById('currentLMPityError');
const lmRateUpChanceError = document.getElementById('lmRateUpChanceError');

const anvilBudgetInput = document.getElementById('anvilBudget');
const calculateProbabilityBtn = document.getElementById('calculateProbabilityBtn');
const probabilityStatusDiv = document.getElementById('probabilityStatus');
const probabilityResultsArea = document.getElementById('probabilityResultsArea');
const probabilitySummaryTextEl = document.getElementById('probabilitySummaryText');
const probSummaryCurrentEl = document.getElementById('probSummaryCurrent');
const probSummaryProposedEl = document.getElementById('probSummaryProposed');
const probabilitySimulationDetailsEl = document.getElementById('probabilitySimulationDetails');
const probabilityBtnText = calculateProbabilityBtn.querySelector('.btn-text');
const probabilityBtnSpinner = calculateProbabilityBtn.querySelector('.spinner');

const sectionToggleContainer = document.getElementById('sectionToggleContainer');
const reorderableSectionsContainer = document.getElementById('reorderableSectionsContainer'); 
const SECTION_VISIBILITY_STORAGE_KEY = 'anvilCalcSectionVisibility_v2'; 
const SECTION_ORDER_STORAGE_KEY = 'anvilCalcSectionOrder_v2';

const currentLMSInput = document.getElementById('currentLMSInput');
const currentNMSInput = document.getElementById('currentNMSInput');
const proposedLMSInput = document.getElementById('proposedLMSInput');
const currentLMSError = document.getElementById('currentLMSError');
const currentNMSError = document.getElementById('currentNMSError');
const proposedLMSError = document.getElementById('proposedLMSError');

function calculateExpectedDrawsPerMythic(mythicProbability, hardPity) {
    if (!(mythicProbability > 0 && mythicProbability <= 1) || hardPity < 1) { return NaN; }
    let expectedDraws = 0.0;
    for (let k = 1; k < hardPity; k++) {
        const p_k = Math.pow(1 - mythicProbability, k - 1) * mythicProbability;
        expectedDraws += k * p_k;
    }
    expectedDraws += hardPity * Math.pow(1 - mythicProbability, hardPity - 1);
    return expectedDraws;
}

function calculateLmCycleMetrics(lmShardYield, nmShardYield, lmRateUpChance, nmGuaranteeThreshold) {
    if (!(lmRateUpChance >= 0 && lmRateUpChance <= 1) || nmGuaranteeThreshold < 0) { return { averageShardsPerEffectiveMythic: NaN, expectedMythicPullsPerLmCycle: NaN, worstCaseMythicPullsPerLmCycle: NaN };}
    const nmRateUpChance = 1.0 - lmRateUpChance;
    let totalExpectedShardsInCycle = 0.0, totalExpectedMythicPullsInCycle = 0.0;
    totalExpectedShardsInCycle += lmShardYield * lmRateUpChance;
    totalExpectedMythicPullsInCycle += 1 * lmRateUpChance;
    for (let i = 1; i < nmGuaranteeThreshold; i++) {
        const p_sequence = Math.pow(nmRateUpChance, i) * lmRateUpChance;
        totalExpectedShardsInCycle += ((nmShardYield * i) + lmShardYield) * p_sequence;
        totalExpectedMythicPullsInCycle += (i + 1) * p_sequence;
    }
    const p_guarantee_hit = Math.pow(nmRateUpChance, nmGuaranteeThreshold);
    totalExpectedShardsInCycle += ((nmShardYield * nmGuaranteeThreshold) + lmShardYield) * p_guarantee_hit;
    totalExpectedMythicPullsInCycle += (nmGuaranteeThreshold + 1) * p_guarantee_hit;
    const averageShards = (totalExpectedMythicPullsInCycle === 0 || totalExpectedShardsInCycle === 0) ? 0.0 : totalExpectedShardsInCycle / totalExpectedMythicPullsInCycle;
    return { averageShardsPerEffectiveMythic: averageShards, expectedMythicPullsPerLmCycle: totalExpectedMythicPullsInCycle, worstCaseMythicPullsPerLmCycle: nmGuaranteeThreshold + 1 };
}

function calculateGachaAnvils(targetShards, avgShardsPerMythic, drawsPerMythic) {
    if (targetShards <= 0) return 0;
    if (avgShardsPerMythic <= 0 || drawsPerMythic <= 0) { return Infinity; }
    return Math.ceil(targetShards / avgShardsPerMythic) * drawsPerMythic;
}

const startStarLevelSelect = document.getElementById('startStarLevel');
const targetStarLevelSelect = document.getElementById('targetStarLevel');
const calculateBtn = document.getElementById('calculateBtn');
const calculateBtnText = calculateBtn.querySelector('.btn-text');
const calculateBtnSpinner = calculateBtn.querySelector('.spinner');
const toggleUnlockCostBtn = document.getElementById('toggleUnlockCostBtn');
const advisoryBox = document.getElementById('advisoryBox');
const advisoryMessage = document.getElementById('advisoryMessage');
const shardsNeededForUpgradeSpan = document.getElementById('shardsNeededForUpgrade');
const anvilsCurrentSpan = document.getElementById('anvilsCurrent');
const anvilsProposedSpan = document.getElementById('anvilsProposed');
const anvilsBestCurrentSpan = document.getElementById('anvilsBestCurrent');
const anvilsWorstCurrentSpan = document.getElementById('anvilsWorstCurrent');
const anvilsBestProposedSpan = document.getElementById('anvilsBestProposed');
const anvilsWorstProposedSpan = document.getElementById('anvilsWorstProposed');
const conclusionParagraph = document.getElementById('conclusion');
const currentSystemTitle = document.getElementById('currentSystemTitle');
const proposedSystemTitle = document.getElementById('proposedSystemTitle');
const unlockCostSection = document.getElementById('unlockCostSection');
const anvilsUnlockAvgSpan = document.getElementById('anvilsUnlockAvg');
const anvilsUnlockBestSpan = document.getElementById('anvilsUnlockBest');
const anvilsUnlockWorstSpan = document.getElementById('anvilsUnlockWorst');
const calcDrawsPerMythicSpan = document.getElementById('calcDrawsPerMythic');
const calcWorstCaseMythicsForLMSpan = document.getElementById('calcWorstCaseMythicsForLM');
const calcAvgShardsCurrentSpan = document.getElementById('calcAvgShardsCurrent');
const calcAvgShardsProposedSpan = document.getElementById('calcAvgShardsProposed');
const detailLMSCurrentSpan = document.getElementById('detailLMSCurrent');
const detailNMSCurrentSpan = document.getElementById('detailNMSCurrent');
const detailLMSProposedSpan = document.getElementById('detailLMSProposed');
const detailNMSProposedSpan = document.getElementById('detailNMSProposed');
const anvilCostBreakdownNote = document.getElementById('anvilCostBreakdownNote');
const detailUnlockCostSection = document.getElementById('detailUnlockCostSection');
const detailAvgMythicsForLMSpan = document.getElementById('detailAvgMythicsForLM');
const detailAnvilsUnlockAvgSpan = document.getElementById('detailAnvilsUnlockAvg');
const detailAnvilsUnlockBestSpan = document.getElementById('detailAnvilsUnlockBest');
const detailAnvilsUnlockWorstSpan = document.getElementById('detailAnvilsUnlockWorst');
const detailTargetShardsCurrentSpan = document.getElementById('detailTargetShardsCurrent');
const detailAvgShardsCurrentSpan = document.getElementById('detailAvgShardsCurrent');
const detailMythicPullsAvgCurrentSpan = document.getElementById('detailMythicPullsAvgCurrent');
const detailAnvilsAvgCurrentSpan = document.getElementById('detailAnvilsAvgCurrent');
const detailBestShardsCurrentSpan = document.getElementById('detailBestShardsCurrent');
const detailMythicPullsBestCurrentSpan = document.getElementById('detailMythicPullsBestCurrent');
const detailAnvilsBestCurrentSpan = document.getElementById('detailAnvilsBestCurrent');
const detailWorstShardsCurrentSpan = document.getElementById('detailWorstShardsCurrent');
const detailMythicPullsWorstCurrentSpan = document.getElementById('detailMythicPullsWorstCurrent');
const detailAnvilsWorstCurrentSpan = document.getElementById('detailAnvilsWorstCurrent');
const detailTargetShardsProposedSpan = document.getElementById('detailTargetShardsProposed');
const detailAvgShardsProposedSpan = document.getElementById('detailAvgShardsProposed');
const detailMythicPullsAvgProposedSpan = document.getElementById('detailMythicPullsAvgProposed');
const detailAnvilsAvgProposedSpan = document.getElementById('detailAnvilsAvgProposed');
const detailBestShardsProposedSpan = document.getElementById('detailBestShardsProposed');
const detailMythicPullsBestProposedSpan = document.getElementById('detailMythicPullsBestProposed');
const detailAnvilsBestProposedSpan = document.getElementById('detailAnvilsBestProposed');
const detailWorstShardsProposedSpan = document.getElementById('detailWorstShardsProposed');
const detailMythicPullsWorstProposedSpan = document.getElementById('detailMythicPullsWorstProposed');
const detailAnvilsWorstProposedSpan = document.getElementById('detailAnvilsWorstProposed');
const starLevelError = document.getElementById('starLevelError');

let isUnlockCostIncluded = false;
const NM_GUARANTEE_THRESHOLD = 3; 
const SHARD_REQUIREMENTS = {
    "White 1-Star": 2, "White 2-Star": 5, "White 3-Star": 10, "White 4-Star": 20, "White 5-Star": 40,
    "Blue 1-Star": 60, "Blue 2-Star": 80, "Blue 3-Star": 100, "Blue 4-Star": 130, "Blue 5-Star": 160,
    "Purple 1-Star": 200, "Purple 2-Star": 240, "Purple 3-Star": 280, "Purple 4-Star": 320, "Purple 5-Star": 360,
    "Gold 1-Star": 400, "Gold 2-Star": 440, "Gold 3-Star": 480, "Gold 4-Star": 540, "Gold 5-Star": 600,
    "Red 1-Star": 680, "Red 2-Star": 760, "Red 3-Star": 840, "Red 4-Star": 920, "Red 5-Star": 1000
};

async function initializeFirebaseAndAuth() {
    if (!firebaseConfig.projectId || firebaseConfig.projectId === "YOUR_FALLBACK_PROJECT_ID") {
        console.warn("Firebase config is using fallback values or is incomplete. Firestore features will be disabled.");
        userIdDisplay.textContent = "User ID: Firebase not configured";
        disableChampionManagementFeatures(true, "Firebase not configured.");
        logAnalyticEvent('firebase_auth_status', { status: 'config_issue', method: 'none' });
        return false; 
    }
    try {
        fbApp = initializeApp(firebaseConfig);
        fbAuth = getAuth(fbApp);
        fbDb = getFirestore(fbApp);
        fbAnalytics = getAnalytics(fbApp); 
        logAnalyticEvent('firebase_sdk_initialized');

        onAuthStateChanged(fbAuth, async (user) => {
            if (user) {
                currentUserId = user.uid;
                console.log("User is signed in with UID:", currentUserId);
                userIdDisplay.textContent = `User ID: ${currentUserId.substring(0,8)}...`; 
                championsColRef = collection(fbDb, `artifacts/${appId}/users/${currentUserId}/champions`);
                await populateSavedChampionsDropdownFromFirestore();
                disableChampionManagementFeatures(false);
                logAnalyticEvent('firebase_auth_status', { status: 'signed_in', method: user.isAnonymous ? 'anonymous' : 'custom_token_or_other', user_id_prefix: currentUserId.substring(0,8) });
            } else {
                currentUserId = null;
                console.log("User is signed out.");
                userIdDisplay.textContent = "User ID: Not signed in";
                championsColRef = null;
                if (unsubscribeChampionsListener) { unsubscribeChampionsListener(); unsubscribeChampionsListener = null; }
                savedChampionsSelect.innerHTML = '<option value="">-- Sign in to manage configurations --</option>';
                disableChampionManagementFeatures(true, "Sign in to use cloud save.");
                logAnalyticEvent('firebase_auth_status', { status: 'signed_out', method: 'none' });
            }
        });

        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            console.log("Attempting to sign in with custom token...");
            await signInWithCustomToken(fbAuth, __initial_auth_token);
        } else {
            console.log("No custom token, attempting to sign in anonymously...");
            await signInAnonymously(fbAuth);
        }
        return true;
    } catch (error) { 
        console.error("Firebase Initialization or Authentication Error:", error); 
        displayUiNotification("Authentication failed. Cloud features disabled.", 'error', 'champion_config');
        userIdDisplay.textContent = `User ID: Auth Error (${error.code || error.message})`;
        disableChampionManagementFeatures(true, "Authentication error.");
        logAnalyticEvent('firebase_auth_status', { status: 'failure', method: (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) ? 'custom_token' : 'anonymous', error_code: error.code, error_message: error.message });
        return false;
    }
}

function disableChampionManagementFeatures(disable, reason = "") {
    saveChampionBtn.disabled = disable;
    loadChampionBtn.disabled = disable;
    deleteChampionBtn.disabled = disable;
    savedChampionsSelect.disabled = disable;
    if (disable && reason) {
        savedChampionsSelect.innerHTML = `<option value="">-- ${reason} --</option>`;
    }
}

function displayUiNotification(message, type = 'info', area = 'general', isErrorForStatus = false) {
    let statusDiv;
    let statusClassPrefix = 'status-';
    switch (area) {
        case 'champion_config': statusDiv = championStatusDiv; break;
        case 'probability_sim': statusDiv = probabilityStatusDiv; break;
        case 'local_config': statusDiv = localConfigStatus; break;
        default: statusDiv = championStatusDiv;
    }

    if (!statusDiv) return;

    statusDiv.textContent = message;
    statusDiv.className = 'status-message text-center py-1';
    
    if (type === 'error' || isErrorForStatus) {
        statusDiv.classList.add(statusClassPrefix + 'error');
    } else if (type === 'success') {
        statusDiv.classList.add(statusClassPrefix + 'success');
    } else {
        statusDiv.classList.add(statusClassPrefix + 'info');
    }
    
    logAnalyticEvent('ui_notification_displayed', { type: type, area: area, message_length: message.length });

    setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.className = 'status-message mt-3';
    }, 4000);
}

async function saveChampionToFirestore() {
    if (!currentUserId || !championsColRef) {
        displayUiNotification("Not signed in. Cannot save configuration.", 'error', 'champion_config');
        return;
    }
    const championConfigName = championNameInput.value.trim();
    if (!championConfigName) {
        displayUiNotification("Configuration name cannot be empty.", 'error', 'champion_config');
        return;
    }
    if (/[.#$[\]/]/.test(championConfigName) || championConfigName.length > 100) {
        displayUiNotification("Config name invalid (no .#$[]/) or too long.", 'error', 'champion_config');
        return;
    }

    const championData = {
        name: championConfigName,
        mythicProbability: mythicProbabilityInput.value,
        mythicHardPity: mythicHardPityInput.value,
        lmRateUpChance: lmRateUpChanceInput.value,
        currentMythicPity: currentMythicPityInput.value, 
        currentLMPity: currentLMPityInput.value,       
        includeUnlockCost: isUnlockCostIncluded,
        startStarLevel: startStarLevelSelect.value,
        targetStarLevel: targetStarLevelSelect.value,
        currentLMS: currentLMSInput.value,
        currentNMS: currentNMSInput.value,
        proposedLMS: proposedLMSInput.value,
        savedAt: serverTimestamp()
    };

    try {
        const championDocRef = doc(championsColRef, championConfigName);
        await setDoc(championDocRef, championData, { merge: true });
        displayUiNotification(`Configuration "${championConfigName}" saved successfully!`, 'success', 'champion_config');
        logAnalyticEvent('save_config_firebase', { name_length: championConfigName.length, success: true });
        championNameInput.value = ''; 
    } catch (e) {
        displayUiNotification(`Error saving: ${e.message}`, 'error', 'champion_config');
        console.error("Error saving to Firestore:", e);
        logAnalyticEvent('save_config_firebase', { name_length: championConfigName.length, success: false, error_message: e.message });
    }
}

async function loadChampionFromFirestore(configNameToLoad = null) {
    if (!currentUserId || !championsColRef) {
        displayUiNotification("Not signed in. Cannot load configurations.", 'error', 'champion_config');
        return;
    }
    const championConfigName = configNameToLoad || savedChampionsSelect.value;
    if (!championConfigName) {
        displayUiNotification("No configuration selected/provided to load.", 'error', 'champion_config');
        return;
    }

    try {
        const championDocRef = doc(championsColRef, championConfigName);
        const docSnap = await getDoc(championDocRef);

        if (docSnap.exists()) {
            const championData = docSnap.data();
            mythicProbabilityInput.value = championData.mythicProbability || "0.0384";
            mythicHardPityInput.value = championData.mythicHardPity || "50";
            lmRateUpChanceInput.value = championData.lmRateUpChance || "0.269";
            currentMythicPityInput.value = championData.currentMythicPity || "0";
            currentLMPityInput.value = championData.currentLMPity || "0";
            isUnlockCostIncluded = championData.includeUnlockCost === true; 
            updateToggleUnlockButtonAppearance();
            startStarLevelSelect.value = championData.startStarLevel || "0_shards";
            targetStarLevelSelect.value = championData.targetStarLevel || Object.keys(SHARD_REQUIREMENTS)[0];
            championNameInput.value = championData.name || championConfigName;

            currentLMSInput.value = championData.currentLMS !== undefined ? championData.currentLMS : "40";
            currentNMSInput.value = championData.currentNMS !== undefined ? championData.currentNMS : "0";
            proposedLMSInput.value = championData.proposedLMS !== undefined ? championData.proposedLMS : "40"; 
            
            handleExpectedValueCalculation('load_config_firebase'); 
            probabilityResultsArea.classList.add('hidden');
            probabilityResultsArea.innerHTML = '';
            if(probabilityStatusDiv) probabilityStatusDiv.textContent = '';


            displayUiNotification(`Configuration "${championConfigName}" loaded.`, 'success', 'champion_config');
            logAnalyticEvent('load_config_firebase', { success: true, name_length: championConfigName.length });
        } else {
            displayUiNotification(`Configuration "${championConfigName}" not found.`, 'error', 'champion_config');
            logAnalyticEvent('load_config_firebase', { success: false, name_length: championConfigName.length, reason: 'not_found' });
        }
    } catch (e) {
        displayUiNotification(`Error loading: ${e.message}`, 'error', 'champion_config');
        console.error("Error loading from Firestore:", e);
        logAnalyticEvent('load_config_firebase', { success: false, name_length: championConfigName.length, error_message: e.message });
    }
}

async function deleteChampionFromFirestore() {
    if (!currentUserId || !championsColRef) {
        displayUiNotification("Not signed in. Cannot delete configurations.", 'error', 'champion_config');
        return;
    }
    const championConfigName = savedChampionsSelect.value;
    if (!championConfigName) {
        displayUiNotification("No configuration selected to delete.", 'error', 'champion_config');
        return;
    }
    
    if (! (await showConfirmationModal(`Are you sure you want to delete the configuration "${championConfigName}"? This action cannot be undone.`))) {
        displayUiNotification("Deletion cancelled.", 'info', 'champion_config');
        logAnalyticEvent('delete_config_firebase_action', { action: 'cancelled', name_length: championConfigName.length });
        return;
    }

    try {
        const championDocRef = doc(championsColRef, championConfigName);
        await deleteDoc(championDocRef);
        displayUiNotification(`Configuration "${championConfigName}" deleted.`, 'success', 'champion_config');
        logAnalyticEvent('delete_config_firebase_action', { action: 'confirmed', success: true, name_length: championConfigName.length });
        championNameInput.value = '';
    } catch (e) {
        displayUiNotification(`Error deleting: ${e.message}`, 'error', 'champion_config');
        console.error("Error deleting from Firestore:", e);
        logAnalyticEvent('delete_config_firebase_action', { action: 'confirmed', success: false, name_length: championConfigName.length, error_message: e.message });
    }
}

async function populateSavedChampionsDropdownFromFirestore() {
    if (!currentUserId || !championsColRef) {
        savedChampionsSelect.innerHTML = '<option value="">-- Not signed in --</option>';
        return;
    }
    if (unsubscribeChampionsListener) { unsubscribeChampionsListener(); }
    
    const q = query(championsColRef, orderBy("name"));

    unsubscribeChampionsListener = onSnapshot(q, (querySnapshot) => {
        const hadSelection = savedChampionsSelect.value;
        savedChampionsSelect.innerHTML = '<option value="">-- Select a Configuration --</option>';
        if (querySnapshot.empty) {
            savedChampionsSelect.innerHTML = '<option value="">-- No configurations saved --</option>';
        } else {
            querySnapshot.forEach((docSnap) => {
                const championData = docSnap.data();
                const option = document.createElement('option');
                option.value = docSnap.id; 
                option.textContent = championData.name || docSnap.id; 
                savedChampionsSelect.appendChild(option);
            });
        }
        if (hadSelection && Array.from(savedChampionsSelect.options).some(opt => opt.value === hadSelection)) {
            savedChampionsSelect.value = hadSelection;
        }
        logAnalyticEvent('firestore_dropdown_populated', { count: querySnapshot.size });
    }, (error) => { 
        console.error("Error listening to champion configurations:", error);
        displayUiNotification("Error fetching configurations. Try refreshing.", 'error', 'champion_config');
        savedChampionsSelect.innerHTML = '<option value="">-- Error loading --</option>';
        logAnalyticEvent('firestore_listener_error', { collection: 'champions', error_message: error.message });
    });
}

let currentSectionOrder = []; 
const allToggleableSections = [ 
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
];

function initializeSectionCustomization() {
    const visibilityPrefs = loadSectionVisibilityPreferences();
    const orderPrefs = loadSectionOrderPreferences();
    currentSectionOrder = orderPrefs.length > 0 ? orderPrefs : allToggleableSections.map(s => s.id);
    const validSectionIds = new Set(allToggleableSections.map(s => s.id));
    currentSectionOrder = currentSectionOrder.filter(id => validSectionIds.has(id));
    allToggleableSections.forEach(s => { if (!currentSectionOrder.includes(s.id)) currentSectionOrder.push(s.id); });
    saveSectionOrderPreferences(); 
    renderSectionToggles();
    renderSectionsInOrder();
}

function renderSectionToggles() {
    sectionToggleContainer.innerHTML = ''; 
    currentSectionOrder.forEach((sectionId, index) => {
        const sectionConfig = allToggleableSections.find(s => s.id === sectionId);
        if (!sectionConfig) return;
        const sectionElement = document.getElementById(sectionConfig.id);
        if (!sectionElement) { console.warn(`Section element with ID '${sectionConfig.id}' not found for toggling.`); return; }
        const visibilityPrefs = loadSectionVisibilityPreferences();
        const isVisible = visibilityPrefs[sectionConfig.id] !== undefined ? visibilityPrefs[sectionConfig.id] : sectionConfig.defaultVisible;
        const itemDiv = document.createElement('div'); itemDiv.className = 'toggle-item';
        const label = document.createElement('label'); label.className = 'toggle-label text-sm';
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = isVisible; checkbox.dataset.targetSectionId = sectionConfig.id; checkbox.className = 'form-checkbox h-4 w-4 rounded'; checkbox.addEventListener('change', handleVisibilityChange);
        label.appendChild(checkbox); label.appendChild(document.createTextNode(` ${sectionConfig.name}`)); itemDiv.appendChild(label);
        const buttonsDiv = document.createElement('div'); buttonsDiv.className = 'order-buttons';
        const upButton = document.createElement('button'); upButton.innerHTML = '&uarr;'; upButton.title = "Move Up"; upButton.disabled = index === 0; upButton.addEventListener('click', () => moveSection(index, -1));
        const downButton = document.createElement('button'); downButton.innerHTML = '&darr;'; downButton.title = "Move Down"; downButton.disabled = index === currentSectionOrder.length - 1; downButton.addEventListener('click', () => moveSection(index, 1));
        buttonsDiv.appendChild(upButton); buttonsDiv.appendChild(downButton); itemDiv.appendChild(buttonsDiv);
        sectionToggleContainer.appendChild(itemDiv);
        sectionElement.classList.toggle('hidden', !isVisible);
    });
}

function handleVisibilityChange(event) {
    const targetId = event.target.dataset.targetSectionId;
    const sectionToToggle = document.getElementById(targetId);
    if (sectionToToggle) { sectionToToggle.classList.toggle('hidden', !event.target.checked); saveSectionVisibilityPreferences(); }
    logAnalyticEvent('section_visibility_change', { section_id: targetId, is_visible: event.target.checked });
}

function moveSection(currentIndex, direction) {
    const newIndex = currentIndex + direction;
    if (newIndex < 0 || newIndex >= currentSectionOrder.length) return;
    const itemToMove = currentSectionOrder.splice(currentIndex, 1)[0];
    currentSectionOrder.splice(newIndex, 0, itemToMove);
    saveSectionOrderPreferences(); renderSectionToggles(); renderSectionsInOrder(); 
    logAnalyticEvent('section_order_change', { moved_section_id: itemToMove, direction: direction > 0 ? 'down' : 'up' });
}

function saveSectionVisibilityPreferences() {
    const preferences = {};
    sectionToggleContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => { preferences[checkbox.dataset.targetSectionId] = checkbox.checked; });
    try { localStorage.setItem(SECTION_VISIBILITY_STORAGE_KEY, JSON.stringify(preferences)); } catch (e) { console.error("Error saving section visibility to localStorage:", e); }
}

function loadSectionVisibilityPreferences() {
    try { const savedPrefs = localStorage.getItem(SECTION_VISIBILITY_STORAGE_KEY); return savedPrefs ? JSON.parse(savedPrefs) : {}; } 
    catch (e) { console.error("Error loading section visibility from localStorage:", e); return {}; }
}

function saveSectionOrderPreferences() {
    try { localStorage.setItem(SECTION_ORDER_STORAGE_KEY, JSON.stringify(currentSectionOrder)); } 
    catch (e) { console.error("Error saving section order to localStorage:", e); }
}

function loadSectionOrderPreferences() {
    try { const savedOrder = localStorage.getItem(SECTION_ORDER_STORAGE_KEY); return savedOrder ? JSON.parse(savedOrder) : []; } 
    catch (e) { console.error("Error loading section order from localStorage:", e); return []; }
}

function renderSectionsInOrder() {
    if (!reorderableSectionsContainer) { console.error("Reorderable sections container not found."); return; }
    const fragment = document.createDocumentFragment();
    currentSectionOrder.forEach(sectionId => {
        const sectionElement = document.getElementById(sectionId);
        if (sectionElement) fragment.appendChild(sectionElement);
        else console.warn(`Element with ID ${sectionId} not found for reordering.`);
    });
    reorderableSectionsContainer.innerHTML = ''; reorderableSectionsContainer.appendChild(fragment);
}

function populateStarLevels() {
    startStarLevelSelect.innerHTML = ''; targetStarLevelSelect.innerHTML = '';
    const baseOption = document.createElement('option');
    baseOption.value = "0_shards"; baseOption.textContent = "Base Character (0 Shards)";
    startStarLevelSelect.appendChild(baseOption);
    for (const level in SHARD_REQUIREMENTS) {
        const optS = document.createElement('option'); optS.value = level; optS.textContent = level; startStarLevelSelect.appendChild(optS);
        const optT = document.createElement('option'); optT.value = level; optT.textContent = level; targetStarLevelSelect.appendChild(optT);
    }
    if (targetStarLevelSelect.options.length > 0) targetStarLevelSelect.selectedIndex = 0;
    if (startStarLevelSelect.options.length > 0) startStarLevelSelect.selectedIndex = 0;
}

function updateMainAnvilCostChart(currentCosts, proposedCosts, labels, includeUnlock, unlockCostAvgForChart) {
    const ctx = document.getElementById('anvilCostChart').getContext('2d');
    if (anvilCostChart) { anvilCostChart.destroy(); } 
    const finalCurrentCosts = currentCosts.map(cost => includeUnlock ? cost + unlockCostAvgForChart : cost);
    const finalProposedCosts = proposedCosts.map(cost => includeUnlock ? cost + unlockCostAvgForChart : cost);
    const yAxisLabel = includeUnlock ? 'Total Average Anvils (Unlock + Shards to Level)' : 'Average Anvils for Shards (Post-Unlock to Level)';
    
    const chartGridColor = 'rgba(0, 0, 0, 0.1)'; 
    const chartFontColor = '#6b7280'; 


    anvilCostChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Current System (Avg Total to Level)', data: finalCurrentCosts, backgroundColor: 'rgba(59, 130, 246, 0.7)', borderColor: 'rgba(59, 130, 246, 1)', borderWidth: 1 },
                { label: 'Proposed System (Avg Total to Level)', data: finalProposedCosts, backgroundColor: 'rgba(16, 185, 129, 0.7)', borderColor: 'rgba(16, 185, 129, 1)', borderWidth: 1 }
            ]
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            scales: { 
                y: { beginAtZero: true, title: { display: true, text: yAxisLabel, color: chartFontColor }, grid: { color: chartGridColor }, ticks: { color: chartFontColor } }, 
                x: { title: { display: true, text: 'Star Level (Total Accumulation from Base)', color: chartFontColor }, grid: { color: chartGridColor }, ticks: { color: chartFontColor } } 
            }, 
            plugins: { 
                legend: { labels: { color: chartFontColor } },
                tooltip: { 
                    titleColor: chartFontColor, bodyColor: chartFontColor, 
                    backgroundColor: '#f8fafc',
                    borderColor: chartGridColor, 
                    borderWidth:1,
                    callbacks: { label: context => `${context.dataset.label}: ${Math.round(context.raw)} Anvils` } 
                },
                title: { display: false } 
            } 
        }
    });
}

function setButtonLoadingState(buttonElement, buttonTextElement, buttonSpinnerElement, isLoading) {
    const isGloballyDisabled = buttonElement.hasAttribute('data-globally-disabled');
    if (isLoading) {
        buttonElement.classList.add('btn-loading');
        buttonElement.disabled = true;
        if (buttonTextElement) buttonTextElement.style.display = 'none';
        if (buttonSpinnerElement) buttonSpinnerElement.style.display = 'inline-block';
    } else {
        buttonElement.classList.remove('btn-loading');
        if (!isGloballyDisabled) { 
            buttonElement.disabled = false;
        }
        if (buttonTextElement) buttonTextElement.style.display = 'inline-block';
        if (buttonSpinnerElement) buttonSpinnerElement.style.display = 'none';
    }
}

function updateToggleUnlockButtonAppearance() {
    if (isUnlockCostIncluded) {
        toggleUnlockCostBtn.textContent = 'Include Initial Unlock: ON';
        toggleUnlockCostBtn.classList.remove('toggle-btn-off'); toggleUnlockCostBtn.classList.add('toggle-btn-on');
    } else {
        toggleUnlockCostBtn.textContent = 'Include Initial Unlock: OFF';
        toggleUnlockCostBtn.classList.remove('toggle-btn-on'); toggleUnlockCostBtn.classList.add('toggle-btn-off');
    }
}

function simulateSingleSuccessAttemptForDistribution(budget, mythicProb, hardPity, lmRateUp, nmGuarantee, 
                                        includeUnlock, targetShardsForUpgrade, 
                                        systemConfig,
                                        initialMythicPity = 0, initialLMPityStreak = 0) { 
    
    let totalAnvilsSpent = 0;
    let currentShards = 0;
    let mythicPityCounter = initialMythicPity; 
    let nmFailStreak = initialLMPityStreak;   
    let isUnlocked = !includeUnlock;
    let nmPullCounterForProposedBonus = 0;

    if (includeUnlock && !isUnlocked) {
        while (totalAnvilsSpent < budget) {
            mythicPityCounter++;
            totalAnvilsSpent++;
            if (mythicPityCounter >= hardPity || Math.random() < mythicProb) {
                mythicPityCounter = 0; 
                if (nmFailStreak >= nmGuarantee || Math.random() < lmRateUp) {
                    isUnlocked = true;
                    nmFailStreak = 0; 
                    currentShards += systemConfig.lmShardsYield; 
                    break;
                } else {
                    nmFailStreak++;
                    if (systemConfig.type === 'proposed') {
                        nmPullCounterForProposedBonus++;
                        if (nmPullCounterForProposedBonus <= 6) {
                            const randomShards = [2, 3, 5][Math.floor(Math.random() * 3)];
                            currentShards += randomShards;
                        }
                    } else {
                        currentShards += systemConfig.nmShardsYieldCurrent;
                    }
                }
            }
        }
        if (!isUnlocked) return budget + 1;
    }

    const remainingShardsNeeded = Math.max(0, targetShardsForUpgrade - (includeUnlock ? 0 : currentShards) );

    if (remainingShardsNeeded > 0) {
            while (currentShards < targetShardsForUpgrade) {
            if (totalAnvilsSpent >= budget) return budget + 1;

            mythicPityCounter++;
            totalAnvilsSpent++;
            if (mythicPityCounter >= hardPity || Math.random() < mythicProb) {
                mythicPityCounter = 0; 
                let isLMThisPull = (nmFailStreak >= nmGuarantee || Math.random() < lmRateUp);
                
                if (isLMThisPull) {
                    nmFailStreak = 0;
                    currentShards += systemConfig.lmShardsYield;
                } else {
                    nmFailStreak++;
                    if (systemConfig.type === 'proposed') {
                        nmPullCounterForProposedBonus++;
                        if (nmPullCounterForProposedBonus <= 6) {
                            const randomShards = [2, 3, 5][Math.floor(Math.random() * 3)];
                            currentShards += randomShards;
                        }
                    } else {
                        currentShards += systemConfig.nmShardsYieldCurrent;
                    }
                }
            }
        }
    }
    return totalAnvilsSpent <= budget ? totalAnvilsSpent : budget + 1;
}

function getPercentile(sortedData, percentile) {
    if (!sortedData || sortedData.length === 0) return NaN;
    const index = (percentile / 100) * (sortedData.length -1) ; 
    if (index === Math.floor(index)) {
        return sortedData[index];
    } else {
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        return sortedData[lower] * (upper - index) + sortedData[upper] * (index - lower);
    }
}

function createHistogramData(anvilCosts, budget, numBins = 20) {
    const successfulRuns = anvilCosts.filter(cost => cost <= budget);
    if (successfulRuns.length === 0) {
        return { labels: [`> ${budget} (Failures)`], data: [anvilCosts.length], successRate: 0, medianCost: NaN, p90Cost: NaN };
    }

    const minCost = Math.min(...successfulRuns);
    let maxCost = Math.max(...successfulRuns); 
    if (maxCost < minCost) maxCost = minCost; 

    const binSize = Math.max(1, Math.ceil((maxCost - minCost + 1) / numBins));
    const bins = [];
    const labels = [];
    
    for (let i = 0; i < numBins; i++) {
        const binStart = minCost + (i * binSize);
        const binEnd = binStart + binSize - 1;
        if (binStart > maxCost && bins.length > 0) break; 
        bins.push({ start: binStart, end: Math.min(binEnd, maxCost), count: 0 }); 
        labels.push(`${binStart}-${Math.min(binEnd, maxCost)}`);
        if (Math.min(binEnd, maxCost) >= maxCost) break; 
    }
    
    let failures = 0;
    anvilCosts.forEach(cost => {
        if (cost <= budget) {
            let binned = false;
            for (const bin of bins) {
                if (cost >= bin.start && cost <= bin.end) {
                    bin.count++;
                    binned = true;
                    break;
                }
            }
            if (!binned && bins.length > 0 && cost <= bins[bins.length-1].end) { 
                bins[bins.length-1].count++;
            }
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
    
    const successRate = (successfulRuns.length / anvilCosts.length) * 100;
    successfulRuns.sort((a, b) => a - b);
    const medianCost = getPercentile(successfulRuns, 50);
    const p90Cost = getPercentile(successfulRuns, 90);


    return { labels: chartLabels, data: chartData, successRate, medianCost, p90Cost };
}

function displayProbabilityDistributionChart(canvasId, histogram, systemLabel, budget) {
    const canvasElement = document.getElementById(canvasId); 
    if (!canvasElement) {
        console.error(`Canvas element with ID '${canvasId}' not found for chart.`);
        return;
    }
    const ctx = canvasElement.getContext('2d');
    if (window[canvasId + 'Instance']) {
        window[canvasId + 'Instance'].destroy();
    }

    const chartGridColor = 'rgba(0, 0, 0, 0.1)'; 
    const chartFontColor = '#6b7280'; 
    const titleColor = '#1e293b'; 


    window[canvasId + 'Instance'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: histogram.labels,
            datasets: [{
                label: `Anvil Cost Frequency`,
                data: histogram.data,
                backgroundColor: systemLabel.toLowerCase().includes('current') ? 'rgba(59, 130, 246, 0.7)' : 'rgba(16, 185, 129, 0.7)',
                borderColor: systemLabel.toLowerCase().includes('current') ? 'rgba(59, 130, 246, 1)' : 'rgba(16, 185, 129, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Number of Simulation Runs', color: titleColor }, grid: { color: chartGridColor }, ticks: { color: chartFontColor } },
                x: { title: { display: true, text: 'Anvils Spent', color: titleColor }, grid: { color: chartGridColor }, ticks: { color: chartFontColor, autoSkip: true, maxTicksLimit: 10 } }
            },
            plugins: {
                tooltip: { 
                    titleColor: titleColor, bodyColor: chartFontColor, 
                    backgroundColor: '#ffffff', 
                    borderColor: chartGridColor, borderWidth:1,
                    callbacks: { label: context => `${context.dataset.label}: ${context.parsed.y} runs` } 
                },
                legend: { labels: { color: chartFontColor } },
                title: { display: false } 
            }
        }
    });
}


function runProbabilitySimulation() {
    logAnalyticEvent('calculation_triggered', { type: 'probability_simulation', source: 'button_click' });
    setButtonLoadingState(calculateProbabilityBtn, probabilityBtnText, probabilityBtnSpinner, true);
    displayUiNotification("Calculating probability distribution... this may take a moment.", 'info', 'probability_sim');
    
    probabilityResultsArea.innerHTML = ` 
        <p id="probabilitySummaryText" class="mb-2 text-center font-medium"></p>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div>
                <h4 class="font-semibold text-lg text-center mb-1">Current System - Anvil Cost Distribution</h4>
                <div class="chart-container prob-chart-container"> 
                    <canvas id="probChartCurrent"></canvas>
                </div>
                <p id="probSummaryCurrent" class="text-sm text-center mt-2"></p>
            </div>
            <div>
                <h4 class="font-semibold text-lg text-center mb-1">Proposed System - Anvil Cost Distribution</h4>
                <div class="chart-container prob-chart-container">
                    <canvas id="probChartProposed"></canvas>
                </div>
                <p id="probSummaryProposed" class="text-sm text-center mt-2"></p>
            </div>
        </div>
        <p id="probabilitySimulationDetails" class="text-xs mt-4 text-center"></p>
    `;
    probabilityResultsArea.classList.remove('hidden'); 
    
    const probabilitySummaryTextEl_local = document.getElementById('probabilitySummaryText');
    const probSummaryCurrentEl_local = document.getElementById('probSummaryCurrent');
    const probSummaryProposedEl_local = document.getElementById('probSummaryProposed');
    const probabilitySimulationDetailsEl_local = document.getElementById('probabilitySimulationDetails');

    setTimeout(() => { 
        const budget = parseInt(anvilBudgetInput.value);
        if (isNaN(budget) || budget <= 0) { 
            displayUiNotification("Please enter a valid Anvil budget.", 'error', 'probability_sim'); 
            setButtonLoadingState(calculateProbabilityBtn, probabilityBtnText, probabilityBtnSpinner, false); 
            logAnalyticEvent('probability_simulation_completed', { status: 'error', reason: 'invalid_budget', budget: anvilBudgetInput.value });
            return; 
        }
        
        const mythicProb = parseFloat(mythicProbabilityInput.value);
        const hardPity = parseInt(mythicHardPityInput.value);
        const lmRateUp = parseFloat(lmRateUpChanceInput.value);
        const initialMythicPity = parseInt(currentMythicPityInput.value) || 0;
        const initialLMPityStreak = parseInt(currentLMPityInput.value) || 0;
        const includeUnlock = isUnlockCostIncluded;
        const startS = (startStarLevelSelect.value === "0_shards") ? 0 : (SHARD_REQUIREMENTS[startStarLevelSelect.value] || 0);
        const targetS = SHARD_REQUIREMENTS[targetStarLevelSelect.value] || 0;
        const shardsNeededForUpgrade = Math.max(0, targetS - startS);

        if (isNaN(mythicProb) || isNaN(hardPity) || isNaN(lmRateUp) || initialMythicPity < 0 || (hardPity > 0 && initialMythicPity >= hardPity) || initialLMPityStreak < 0 || initialLMPityStreak >= NM_GUARANTEE_THRESHOLD) {
                displayUiNotification("Invalid base pull rates or pity inputs for simulation.", 'error', 'probability_sim');
                setButtonLoadingState(calculateProbabilityBtn, probabilityBtnText, probabilityBtnSpinner, false);
                logAnalyticEvent('probability_simulation_completed', { status: 'error', reason: 'invalid_pull_rates_or_pity' });
                return;
        }
        
        const NUM_SIM_RUNS = 10000; 
        const anvilCostsCurrent = [];
        const anvilCostsProposed = [];

        const lmShardsCurrentVal = parseInt(currentLMSInput.value) || 0; 
        const nmShardsCurrentVal = parseInt(currentNMSInput.value) || 0; 
        const lmShardsProposedVal = parseInt(proposedLMSInput.value) || 0; 
        
        const currentSystemConfig = { type: 'current', lmShardsYield: lmShardsCurrentVal, nmShardsYieldCurrent: nmShardsCurrentVal };
        const proposedSystemConfig = { type: 'proposed', lmShardsYield: lmShardsProposedVal };


        for (let i = 0; i < NUM_SIM_RUNS; i++) {
            anvilCostsCurrent.push(simulateSingleSuccessAttemptForDistribution(budget, mythicProb, hardPity, lmRateUp, NM_GUARANTEE_THRESHOLD, includeUnlock, shardsNeededForUpgrade, currentSystemConfig, initialMythicPity, initialLMPityStreak));
            anvilCostsProposed.push(simulateSingleSuccessAttemptForDistribution(budget, mythicProb, hardPity, lmRateUp, NM_GUARANTEE_THRESHOLD, includeUnlock, shardsNeededForUpgrade, proposedSystemConfig, initialMythicPity, initialLMPityStreak));
        }
        
        const numBins = Math.min(20, Math.max(5, Math.floor(budget/20))); 

        const histDataCurrent = createHistogramData(anvilCostsCurrent, budget, numBins);
        const histDataProposed = createHistogramData(anvilCostsProposed, budget, numBins);

        if(probabilitySummaryTextEl_local) probabilitySummaryTextEl_local.textContent = `Goal: Reach ${targetStarLevelSelect.value} from ${startStarLevelSelect.value}${includeUnlock ? " (including initial unlock)" : ""} with a budget of ${budget} Anvils.`;
        
        displayProbabilityDistributionChart('probChartCurrent', histDataCurrent, 'Current System', budget);
        if(probSummaryCurrentEl_local) probSummaryCurrentEl_local.innerHTML = `Success Rate: <strong>${histDataCurrent.successRate.toFixed(1)}%</strong>. ` +
                                        (isNaN(histDataCurrent.medianCost) ? '' : `Median Cost (Success): <strong>${Math.round(histDataCurrent.medianCost)}</strong>. `) +
                                        (isNaN(histDataCurrent.p90Cost) ? '' : `P90 Cost (Success): <strong>${Math.round(histDataCurrent.p90Cost)}</strong>.`);

        displayProbabilityDistributionChart('probChartProposed', histDataProposed, 'Proposed System', budget);
        if(probSummaryProposedEl_local) probSummaryProposedEl_local.innerHTML = `Success Rate: <strong>${histDataProposed.successRate.toFixed(1)}%</strong>. ` +
                                        (isNaN(histDataProposed.medianCost) ? '' : `Median Cost (Success): <strong>${Math.round(histDataProposed.medianCost)}</strong>. `) +
                                        (isNaN(histDataProposed.p90Cost) ? '' : `P90 Cost (Success): <strong>${Math.round(histDataProposed.p90Cost)}</strong>.`);


        if(probabilitySimulationDetailsEl_local) probabilitySimulationDetailsEl_local.textContent = `Based on ${NUM_SIM_RUNS} simulated attempts for each system, starting with ${initialMythicPity} mythic pity and ${initialLMPityStreak} non-LM pulls.`;
        
        displayUiNotification("Probability distribution calculation complete.", 'success', 'probability_sim');
        setButtonLoadingState(calculateProbabilityBtn, probabilityBtnText, probabilityBtnSpinner, false);
        logAnalyticEvent('probability_simulation_completed', { 
            status: 'success', 
            budget: budget, 
            shards_needed: shardsNeededForUpgrade,
            include_unlock: includeUnlock,
            current_sys_success_rate: parseFloat(histDataCurrent.successRate.toFixed(1)),
            proposed_sys_success_rate: parseFloat(histDataProposed.successRate.toFixed(1)),
            current_sys_median_cost: isNaN(histDataCurrent.medianCost) ? null : Math.round(histDataCurrent.medianCost),
            proposed_sys_median_cost: isNaN(histDataProposed.medianCost) ? null : Math.round(histDataProposed.medianCost)
        });
    }, 50);
}

function handleExpectedValueCalculation(triggerSource = 'unknown') {
    logAnalyticEvent('calculation_triggered', { type: 'expected_value', source: triggerSource });
    setButtonLoadingState(calculateBtn, calculateBtnText, calculateBtnSpinner, true);
    setTimeout(() => {
        const inputs = validateAndGetEVInputs();
        if (!inputs.isValid) {
            setButtonLoadingState(calculateBtn, calculateBtnText, calculateBtnSpinner, false);
            conclusionParagraph.textContent = 'Please correct the highlighted input errors.';
            logAnalyticEvent('ev_calculation_completed', { status: 'error', reason: 'input_validation', failed_fields: Object.keys(inputs.errors).join(',') });
            return;
        }
        const metrics = performExpectedValueCalculations(inputs.data);
        if (!metrics.isValid) {
            conclusionParagraph.textContent = metrics.errorMessage || 'Error in EV calculation.';
            setButtonLoadingState(calculateBtn, calculateBtnText, calculateBtnSpinner, false);
            logAnalyticEvent('ev_calculation_completed', { status: 'error', reason: 'calculation_error', error_message: metrics.errorMessage });
            return;
        }
        updateExpectedValueUI(metrics.data);
        setButtonLoadingState(calculateBtn, calculateBtnText, calculateBtnSpinner, false);
        logAnalyticEvent('ev_calculation_completed', { 
            status: 'success', 
            shards_needed: metrics.data.shardsNeededForUpgrade,
            include_unlock: isUnlockCostIncluded,
            current_avg_anvils: Math.round(isUnlockCostIncluded ? metrics.data.anvilsUnlockAvg + metrics.data.upgradeAnvilsCurrent : metrics.data.upgradeAnvilsCurrent),
            proposed_avg_anvils: Math.round(isUnlockCostIncluded ? metrics.data.anvilsUnlockAvg + metrics.data.upgradeAnvilsProposed : metrics.data.upgradeAnvilsProposed)
        });
    }, 50);
}

function resetExpectedValueDisplayFields() {
    [mythicProbabilityError, mythicHardPityError, lmRateUpChanceError, starLevelError, currentMythicPityError, currentLMPityError, 
        currentLMSError, currentNMSError, proposedLMSError].forEach(el => { if(el) el.classList.add('hidden'); }); 
    conclusionParagraph.textContent = '';
    document.querySelectorAll('#results span, .calculation-detail span').forEach(span => {
        if (!span.closest('.btn') && !span.closest('#championStatus') && !span.closest('#probabilityStatus') && !span.closest('#localConfigStatus') ) { 
            span.textContent = '--';
        }
    });
    unlockCostSection.classList.add('hidden');
    detailUnlockCostSection.classList.add('hidden');
}

function validateAndGetEVInputs() {
    resetExpectedValueDisplayFields();
    let isValid = true;
    const errors = {};

    const mythicProbability = parseFloat(mythicProbabilityInput.value);
    const mythicHardPity = parseInt(mythicHardPityInput.value);
    const lmRateUpChance = parseFloat(lmRateUpChanceInput.value);
    const currentMythicPity = parseInt(currentMythicPityInput.value) || 0; 
    const currentLMPity = parseInt(currentLMPityInput.value) || 0; 

    const lmShardsCurrent = parseInt(currentLMSInput.value);
    const nmShardsCurrent = parseInt(currentNMSInput.value);
    const lmShardsProposed = parseInt(proposedLMSInput.value);
    const nmShardsProposedForEV = 0;

    if (isNaN(mythicProbability) || mythicProbability <= 0 || mythicProbability > 1) { mythicProbabilityError.textContent = 'Invalid probability.'; mythicProbabilityError.classList.remove('hidden'); isValid = false; errors.mythicProbability = true;}
    if (isNaN(mythicHardPity) || mythicHardPity < 1) { mythicHardPityError.textContent = 'Invalid pity.'; mythicHardPityError.classList.remove('hidden'); isValid = false; errors.mythicHardPity = true;}
    if (isNaN(lmRateUpChance) || lmRateUpChance < 0 || lmRateUpChance > 1) { lmRateUpChanceError.textContent = 'Invalid rate-up chance.'; lmRateUpChanceError.classList.remove('hidden'); isValid = false; errors.lmRateUpChance = true;}
    
    if (isNaN(currentMythicPity) || currentMythicPity < 0 || (mythicHardPity > 0 && currentMythicPity >= mythicHardPity) ) {
        currentMythicPityError.textContent = `Must be 0 to ${mythicHardPity > 0 ? mythicHardPity -1 : 'N/A'}.`; 
        currentMythicPityError.classList.remove('hidden'); isValid = false; errors.currentMythicPity = true;
    }
        if (isNaN(currentLMPity) || currentLMPity < 0 || currentLMPity >= NM_GUARANTEE_THRESHOLD ) { 
        currentLMPityError.textContent = `Must be 0 to ${NM_GUARANTEE_THRESHOLD - 1}.`; 
        currentLMPityError.classList.remove('hidden'); isValid = false; errors.currentLMPity = true;
    }

    if (isNaN(lmShardsCurrent) || lmShardsCurrent < 0) { currentLMSError.textContent = 'Invalid.'; currentLMSError.classList.remove('hidden'); isValid = false; errors.lmShardsCurrent = true; }
    if (isNaN(nmShardsCurrent) || nmShardsCurrent < 0) { currentNMSError.textContent = 'Invalid.'; currentNMSError.classList.remove('hidden'); isValid = false; errors.nmShardsCurrent = true; }
    if (isNaN(lmShardsProposed) || lmShardsProposed < 0) { proposedLMSError.textContent = 'Invalid.'; proposedLMSError.classList.remove('hidden'); isValid = false; errors.lmShardsProposed = true; }

    const startStarValue = startStarLevelSelect.value;
    const targetStarValue = targetStarLevelSelect.value;
    const startShards = (startStarValue === "0_shards") ? 0 : (SHARD_REQUIREMENTS[startStarValue] || 0);
    const targetTotalShards = SHARD_REQUIREMENTS[targetStarValue] || 0;
    let shardsNeededForUpgrade = targetTotalShards - startShards;

    if (shardsNeededForUpgrade < 0) {
        starLevelError.textContent = "Target level cannot be lower than starting level. Cost will be 0.";
        starLevelError.classList.remove('hidden');
        shardsNeededForUpgrade = 0; 
        errors.starLevel = true;
    }
    shardsNeededForUpgradeSpan.textContent = shardsNeededForUpgrade.toString();

    if (!isValid) {
        logAnalyticEvent('input_validation_error', { failed_fields: Object.keys(errors).join(',') });
    }

    return { 
        isValid, 
        data: { mythicProbability, mythicHardPity, lmRateUpChance, shardsNeededForUpgrade, currentMythicPity, currentLMPity,
                lmShardsCurrent, nmShardsCurrent, lmShardsProposed, nmShardsProposed: nmShardsProposedForEV }, 
        errors 
    };
}

function performExpectedValueCalculations(inputs) {
    const { mythicProbability, mythicHardPity, lmRateUpChance, shardsNeededForUpgrade,
            lmShardsCurrent, nmShardsCurrent, lmShardsProposed, nmShardsProposed } = inputs;
    
    let errorMessage = null;

    const drawsPerMythicAverage = calculateExpectedDrawsPerMythic(mythicProbability, mythicHardPity);
    if (isNaN(drawsPerMythicAverage)) return { isValid: false, errorMessage: 'Error in base Mythic calculation (drawsPerMythicAverage).' };

    const unlockCycleMetrics = calculateLmCycleMetrics(1, 0, lmRateUpChance, NM_GUARANTEE_THRESHOLD);
    if (isNaN(unlockCycleMetrics.expectedMythicPullsPerLmCycle)) return { isValid: false, errorMessage: 'Error calculating LM cycle for unlock.' };
    
    const anvilsUnlockAvg = unlockCycleMetrics.expectedMythicPullsPerLmCycle * drawsPerMythicAverage;
    const anvilsUnlockBest = 1 * 1; 
    const anvilsUnlockWorst = unlockCycleMetrics.worstCaseMythicPullsPerLmCycle * mythicHardPity;

    const lmCycleMetricsCurrentSystem = calculateLmCycleMetrics(lmShardsCurrent, nmShardsCurrent, lmRateUpChance, NM_GUARANTEE_THRESHOLD);
    const lmCycleMetricsProposedSystem = calculateLmCycleMetrics(lmShardsProposed, nmShardsProposed, lmRateUpChance, NM_GUARANTEE_THRESHOLD);
    if (isNaN(lmCycleMetricsCurrentSystem.averageShardsPerEffectiveMythic) || isNaN(lmCycleMetricsProposedSystem.averageShardsPerEffectiveMythic)) {
        return { isValid: false, errorMessage: 'Error in shard per mythic calculation for progression.' };
    }

    const avgEffShardsCurr = lmCycleMetricsCurrentSystem.averageShardsPerEffectiveMythic;
    const avgEffShardsProp = lmCycleMetricsProposedSystem.averageShardsPerEffectiveMythic;
    const bestShardsCurr = lmShardsCurrent; 
    const bestShardsProp = lmShardsProposed;
    const worstShardsCurr = (nmShardsCurrent * NM_GUARANTEE_THRESHOLD + lmShardsCurrent) / (NM_GUARANTEE_THRESHOLD + 1);
    const worstShardsProp = (nmShardsProposed * NM_GUARANTEE_THRESHOLD + lmShardsProposed) / (NM_GUARANTEE_THRESHOLD + 1);

    const upgradeAnvilsCurrent = calculateGachaAnvils(shardsNeededForUpgrade, avgEffShardsCurr, drawsPerMythicAverage);
    const upgradeAnvilsProposed = calculateGachaAnvils(shardsNeededForUpgrade, avgEffShardsProp, drawsPerMythicAverage);
    const upgradeAnvilsBestCurrent = calculateGachaAnvils(shardsNeededForUpgrade, bestShardsCurr, 1); 
    const upgradeAnvilsWorstCurrent = calculateGachaAnvils(shardsNeededForUpgrade, worstShardsCurr, mythicHardPity);
    const upgradeAnvilsBestProposed = calculateGachaAnvils(shardsNeededForUpgrade, bestShardsProp, 1);
    const upgradeAnvilsWorstProposed = calculateGachaAnvils(shardsNeededForUpgrade, worstShardsProp, mythicHardPity);

    return {
        isValid: true,
        data: {
            drawsPerMythicAverage, 
            unlockCycleMetrics, anvilsUnlockAvg, anvilsUnlockBest, anvilsUnlockWorst,
            avgEffShardsCurr, avgEffShardsProp,
            bestShardsCurr, bestShardsProp, worstShardsCurr, worstShardsProp,
            upgradeAnvilsCurrent, upgradeAnvilsProposed,
            upgradeAnvilsBestCurrent, upgradeAnvilsWorstCurrent,
            upgradeAnvilsBestProposed, upgradeAnvilsWorstProposed,
            shardsNeededForUpgrade,
            lmShardsCurrent, nmShardsCurrent, lmShardsProposed, nmShardsProposed
        }
    };
}

function updateExpectedValueUI(metrics) {
    const {
        drawsPerMythicAverage, unlockCycleMetrics, anvilsUnlockAvg, anvilsUnlockBest, anvilsUnlockWorst,
        avgEffShardsCurr, avgEffShardsProp,
        bestShardsCurr, bestShardsProp, worstShardsCurr, worstShardsProp,
        upgradeAnvilsCurrent, upgradeAnvilsProposed,
        upgradeAnvilsBestCurrent, upgradeAnvilsWorstCurrent,
        upgradeAnvilsBestProposed, upgradeAnvilsWorstProposed,
        shardsNeededForUpgrade,
        lmShardsCurrent, nmShardsCurrent, lmShardsProposed
    } = metrics;

    calcDrawsPerMythicSpan.textContent = drawsPerMythicAverage.toFixed(2);
    if(calcWorstCaseMythicsForLMSpan) calcWorstCaseMythicsForLMSpan.textContent = unlockCycleMetrics.worstCaseMythicPullsPerLmCycle.toString();
    calcAvgShardsCurrentSpan.textContent = avgEffShardsCurr.toFixed(2);
    calcAvgShardsProposedSpan.textContent = avgEffShardsProp.toFixed(2);

    detailLMSCurrentSpan.textContent = lmShardsCurrent.toString();
    detailNMSCurrentSpan.textContent = nmShardsCurrent.toString();
    detailLMSProposedSpan.textContent = lmShardsProposed.toString();
    detailNMSProposedSpan.textContent = "0 (after first 6 NM bonus pulls)";


    if (isUnlockCostIncluded) {
        unlockCostSection.classList.remove('hidden');
        detailUnlockCostSection.classList.remove('hidden');
        [anvilsUnlockAvgSpan, detailAnvilsUnlockAvgSpan].forEach(s => s.textContent = Math.round(anvilsUnlockAvg).toString());
        [anvilsUnlockBestSpan, detailAnvilsUnlockBestSpan].forEach(s => s.textContent = Math.round(anvilsUnlockBest).toString());
        [anvilsUnlockWorstSpan, detailAnvilsUnlockWorstSpan].forEach(s => s.textContent = Math.round(anvilsUnlockWorst).toString());
        if(detailAvgMythicsForLMSpan) detailAvgMythicsForLMSpan.textContent = unlockCycleMetrics.expectedMythicPullsPerLmCycle.toFixed(2);
        
        advisoryBox.classList.add('advisory-indigo-theme'); 
        advisoryMessage.innerHTML = `Costs displayed below **INCLUDE** initial unlock. Shard upgrade costs are for the selected range.`;
        currentSystemTitle.textContent = "Current System (Total: Unlock + Upgrade)"; 
        proposedSystemTitle.textContent = "Proposed System (Total: Unlock + Upgrade)";
        anvilCostBreakdownNote.textContent = "Anvil Cost Breakdown below shows costs for the selected shard upgrade. Overall total includes unlock if checked.";

        anvilsCurrentSpan.textContent = Math.round(anvilsUnlockAvg + upgradeAnvilsCurrent).toString(); 
        anvilsProposedSpan.textContent = Math.round(anvilsUnlockAvg + upgradeAnvilsProposed).toString();
        anvilsBestCurrentSpan.textContent = Math.round(anvilsUnlockBest + upgradeAnvilsBestCurrent).toString(); 
        anvilsWorstCurrentSpan.textContent = Math.round(anvilsUnlockWorst + upgradeAnvilsWorstCurrent).toString();
        anvilsBestProposedSpan.textContent = Math.round(anvilsUnlockBest + upgradeAnvilsBestProposed).toString(); 
        anvilsWorstProposedSpan.textContent = Math.round(anvilsUnlockWorst + upgradeAnvilsWorstProposed).toString();
    } else {
        unlockCostSection.classList.add('hidden'); 
        detailUnlockCostSection.classList.add('hidden');
        advisoryBox.classList.remove('advisory-indigo-theme'); 
        advisoryMessage.innerHTML = `Costs displayed are for the **selected shard upgrade only**. Initial unlock cost is NOT included unless checked above.`;
        currentSystemTitle.textContent = "Current Bleed System (Upgrade Only)"; 
        proposedSystemTitle.textContent = "Proposed Bleed System (Upgrade Only)";
        anvilCostBreakdownNote.textContent = "Anvil Cost Breakdown below is for the selected shard upgrade only.";

        anvilsCurrentSpan.textContent = Math.round(upgradeAnvilsCurrent).toString(); 
        anvilsProposedSpan.textContent = Math.round(upgradeAnvilsProposed).toString();
        anvilsBestCurrentSpan.textContent = Math.round(upgradeAnvilsBestCurrent).toString(); 
        anvilsWorstCurrentSpan.textContent = Math.round(upgradeAnvilsWorstCurrent).toString();
        anvilsBestProposedSpan.textContent = Math.round(upgradeAnvilsBestProposed).toString(); 
        anvilsWorstProposedSpan.textContent = Math.round(upgradeAnvilsWorstProposed).toString();
    }

    const setDetail = (el, val, fix=2) => el.textContent = isFinite(val) ? (fix===-1 ? val.toString() : val.toFixed(fix)) : (shardsNeededForUpgrade <= 0 ? '0' : 'Inf');
    const setDetailAnvil = (el, val) => el.textContent = isFinite(val) ? Math.round(val).toString() : (shardsNeededForUpgrade <= 0 ? '0' : 'Infinity');
    const setDetailMythicPulls = (el, shards, effShards) => el.textContent = (effShards > 0 && shards > 0 ? Math.ceil(shards / effShards) : (shards <= 0 ? 0 : 'Inf')).toString();

    detailTargetShardsCurrentSpan.textContent = shardsNeededForUpgrade.toString();
    setDetail(detailAvgShardsCurrentSpan, avgEffShardsCurr); setDetailMythicPulls(detailMythicPullsAvgCurrentSpan, shardsNeededForUpgrade, avgEffShardsCurr); setDetailAnvil(detailAnvilsAvgCurrentSpan, upgradeAnvilsCurrent);
    setDetail(detailBestShardsCurrentSpan, bestShardsCurr); setDetailMythicPulls(detailMythicPullsBestCurrentSpan, shardsNeededForUpgrade, bestShardsCurr); setDetailAnvil(detailAnvilsBestCurrentSpan, upgradeAnvilsBestCurrent);
    setDetail(detailWorstShardsCurrentSpan, worstShardsCurr); setDetailMythicPulls(detailMythicPullsWorstCurrentSpan, shardsNeededForUpgrade, worstShardsCurr); setDetailAnvil(detailAnvilsWorstCurrentSpan, upgradeAnvilsWorstCurrent);
    
    detailTargetShardsProposedSpan.textContent = shardsNeededForUpgrade.toString();
    setDetail(detailAvgShardsProposedSpan, avgEffShardsProp); setDetailMythicPulls(detailMythicPullsAvgProposedSpan, shardsNeededForUpgrade, avgEffShardsProp); setDetailAnvil(detailAnvilsAvgProposedSpan, upgradeAnvilsProposed);
    setDetail(detailBestShardsProposedSpan, bestShardsProp); setDetailMythicPulls(detailMythicPullsBestProposedSpan, shardsNeededForUpgrade, bestShardsProp); setDetailAnvil(detailAnvilsBestProposedSpan, upgradeAnvilsBestProposed);
    setDetail(detailWorstShardsProposedSpan, worstShardsProp); setDetailMythicPulls(detailMythicPullsWorstProposedSpan, shardsNeededForUpgrade, worstShardsProp); setDetailAnvil(detailAnvilsWorstProposedSpan, upgradeAnvilsWorstProposed);
    
    const totalCurrent = parseFloat(anvilsCurrentSpan.textContent), totalProposed = parseFloat(anvilsProposedSpan.textContent);
    if (shardsNeededForUpgrade <= 0 && !isUnlockCostIncluded) { conclusionParagraph.textContent = "No shards needed for this upgrade range. Cost is 0."; }
    else if (isFinite(totalCurrent) && isFinite(totalProposed)) {
        const diff = Math.ceil(Math.abs(totalCurrent - totalProposed));
        if (totalCurrent < totalProposed) conclusionParagraph.textContent = `The Current System is ~${diff} Anvils more efficient on average for the selected goal.`;
        else if (totalProposed < totalCurrent) conclusionParagraph.textContent = `The Proposed System is ~${diff} Anvils more efficient on average for the selected goal.`;
        else conclusionParagraph.textContent = 'Both systems require approximately the same Anvils on average for the selected goal.';
    } else { conclusionParagraph.textContent = 'Could not determine efficiency due to non-finite Anvil costs.'; }

    const chartLabels = Object.keys(SHARD_REQUIREMENTS);
    const chartCostsCurr = chartLabels.map(lvl => isFinite(calculateGachaAnvils(SHARD_REQUIREMENTS[lvl], avgEffShardsCurr, drawsPerMythicAverage)) ? Math.round(calculateGachaAnvils(SHARD_REQUIREMENTS[lvl], avgEffShardsCurr, drawsPerMythicAverage)) : 0);
    const chartCostsProp = chartLabels.map(lvl => isFinite(calculateGachaAnvils(SHARD_REQUIREMENTS[lvl], avgEffShardsProp, drawsPerMythicAverage)) ? Math.round(calculateGachaAnvils(SHARD_REQUIREMENTS[lvl], avgEffShardsProp, drawsPerMythicAverage)) : 0);
    updateMainAnvilCostChart(chartCostsCurr, chartCostsProp, chartLabels, isUnlockCostIncluded, anvilsUnlockAvg);
}

function exportConfiguration() {
    const configData = {
        championName: championNameInput.value.trim() || "Unnamed Export",
        mythicProbability: mythicProbabilityInput.value,
        mythicHardPity: mythicHardPityInput.value,
        lmRateUpChance: lmRateUpChanceInput.value,
        currentMythicPity: currentMythicPityInput.value,
        currentLMPity: currentLMPityInput.value,
        includeUnlockCost: isUnlockCostIncluded,
        startStarLevel: startStarLevelSelect.value,
        targetStarLevel: targetStarLevelSelect.value,
        currentLMS: currentLMSInput.value,
        currentNMS: currentNMSInput.value,
        proposedLMS: proposedLMSInput.value
    };

    try {
        const jsonString = JSON.stringify(configData, null, 2); 

        const exportModalBackdrop = document.createElement('div');
        exportModalBackdrop.className = 'modal-backdrop active';
        
        const exportModalContent = document.createElement('div');
        exportModalContent.className = 'modal-content';
        
        const title = document.createElement('h3');
        title.textContent = 'Exported Configuration Code (JSON)';
        exportModalContent.appendChild(title);

        const explanation = document.createElement('p');
        explanation.textContent = 'Copy the JSON code below. You can paste this code into the "Import" section later to restore these settings.';
        explanation.className = 'text-sm text-muted mb-2';
        exportModalContent.appendChild(explanation);
        
        const codeTextarea = document.createElement('textarea');
        codeTextarea.value = jsonString; 
        codeTextarea.readOnly = true;
        codeTextarea.rows = 10; 
        exportModalContent.appendChild(codeTextarea);

        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'modal-buttons mt-4';

        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy Code';
        copyButton.className = 'btn btn-primary px-4 py-2';
        copyButton.onclick = () => {
            codeTextarea.select();
            document.execCommand('copy'); 
            displayUiNotification('Code copied to clipboard!', 'success', 'local_config');
        };

        const closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.className = 'btn btn-secondary px-4 py-2';
        closeButton.onclick = () => {
            document.body.removeChild(exportModalBackdrop);
        };
        
        buttonsDiv.appendChild(copyButton);
        buttonsDiv.appendChild(closeButton);
        exportModalContent.appendChild(buttonsDiv);
        exportModalBackdrop.appendChild(exportModalContent);
        document.body.appendChild(exportModalBackdrop);

        displayUiNotification('Configuration exported!', 'success', 'local_config');
        logAnalyticEvent('export_config_local', { success: true });


    } catch (e) {
        displayUiNotification('Error exporting configuration.', 'error', 'local_config');
        console.error("Error exporting configuration:", e);
        logAnalyticEvent('export_config_local', { success: false, error_message: e.message });
    }
}

function importConfiguration() {
    const jsonString = importConfigText.value.trim(); 
    if (!jsonString) {
        displayUiNotification('Paste configuration text first.', 'error', 'local_config');
        return;
    }

    try {
        const configData = JSON.parse(jsonString); 

        if (typeof configData !== 'object' || configData === null) {
            throw new Error("Invalid configuration format.");
        }

        championNameInput.value = configData.championName || '';
        mythicProbabilityInput.value = configData.mythicProbability || "0.0384";
        mythicHardPityInput.value = configData.mythicHardPity || "50";
        lmRateUpChanceInput.value = configData.lmRateUpChance || "0.269";
        currentMythicPityInput.value = configData.currentMythicPity || "0";
        currentLMPityInput.value = configData.currentLMPity || "0";
        isUnlockCostIncluded = configData.includeUnlockCost === true;
        updateToggleUnlockButtonAppearance();
        startStarLevelSelect.value = configData.startStarLevel || "0_shards";
        targetStarLevelSelect.value = configData.targetStarLevel || (Object.keys(SHARD_REQUIREMENTS)[0] || "White 1-Star");
        
        currentLMSInput.value = configData.currentLMS !== undefined ? configData.currentLMS : "40";
        currentNMSInput.value = configData.currentNMS !== undefined ? configData.currentNMS : "0";
        proposedLMSInput.value = configData.proposedLMS !== undefined ? configData.proposedLMS : "40"; 


        handleExpectedValueCalculation('import_config_local');
        probabilityResultsArea.classList.add('hidden');
        probabilityResultsArea.innerHTML = ''; 
        if(probabilityStatusDiv) probabilityStatusDiv.textContent = '';


        displayUiNotification('Configuration imported successfully!', 'success', 'local_config');
        logAnalyticEvent('import_config_local', { success: true });
        importConfigText.value = ''; 

    } catch (e) {
        displayUiNotification('Error importing configuration. Invalid or corrupted JSON.', 'error', 'local_config');
        console.error("Error importing configuration:", e);
        logAnalyticEvent('import_config_local', { success: false, error_message: e.message });
    }
}

function showConfirmationModal(message) {
    return new Promise((resolve) => {
        const modalBackdrop = document.createElement('div');
        modalBackdrop.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'bg-white p-6 rounded-lg shadow-xl text-gray-800 max-w-sm';
        
        const messageP = document.createElement('p');
        messageP.textContent = message;
        messageP.className = 'mb-4';
        modalContent.appendChild(messageP);
        
        const buttonDiv = document.createElement('div');
        buttonDiv.className = 'flex justify-end gap-3';
        
        const confirmButton = document.createElement('button');
        confirmButton.textContent = 'Confirm';
        confirmButton.className = 'btn btn-danger px-4 py-2';
        confirmButton.onclick = () => {
            document.body.removeChild(modalBackdrop);
            resolve(true);
        };
        
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'btn btn-secondary px-4 py-2';
        cancelButton.onclick = () => {
            document.body.removeChild(modalBackdrop);
            resolve(false);
        };
        
        buttonDiv.appendChild(cancelButton);
        buttonDiv.appendChild(confirmButton);
        modalContent.appendChild(buttonDiv);
        modalBackdrop.appendChild(modalContent);
        document.body.appendChild(modalBackdrop);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    populateStarLevels();
    updateToggleUnlockButtonAppearance();
    initializeSectionCustomization(); 
    
    await initializeFirebaseAndAuth(); 
    logAnalyticEvent('page_view', { app_id: appId });


    saveChampionBtn.addEventListener('click', saveChampionToFirestore);
    loadChampionBtn.addEventListener('click', () => loadChampionFromFirestore());
    deleteChampionBtn.addEventListener('click', deleteChampionFromFirestore);
    
    if(exportConfigBtn) exportConfigBtn.addEventListener('click', exportConfiguration);
    if(importConfigBtn) importConfigBtn.addEventListener('click', importConfiguration);

    calculateProbabilityBtn.addEventListener('click', runProbabilitySimulation); 
    calculateBtn.addEventListener('click', () => handleExpectedValueCalculation('ev_button_click'));
    
    const evTriggerInputs = [mythicProbabilityInput, mythicHardPityInput, lmRateUpChanceInput, 
                                currentMythicPityInput, currentLMPityInput, anvilBudgetInput,
                                currentLMSInput, currentNMSInput, proposedLMSInput];
    
    evTriggerInputs.forEach(el => {
        if(el) el.addEventListener('input', (event) => {
            handleExpectedValueCalculation(`input_change_${event.target.id}`);
        });
    });
    
    [startStarLevelSelect, targetStarLevelSelect].forEach(el => {
        if(el) el.addEventListener('change', (event) => {
            handleExpectedValueCalculation(`select_change_${event.target.id}`);
        });
    });
    
    if(toggleUnlockCostBtn) {
        toggleUnlockCostBtn.addEventListener('click', () => {
            isUnlockCostIncluded = !isUnlockCostIncluded;
            updateToggleUnlockButtonAppearance();
            logAnalyticEvent('toggle_unlock_cost', { included: isUnlockCostIncluded });
            handleExpectedValueCalculation('toggle_unlock_cost');
        });
    }

    const detailsElements = {
        'customizeViewDetails': 'customize_view',
        'detailedCalculationsDetails': 'detailed_ev',
        'explanationSection': 'explanation_guide'
    };

    for (const id in detailsElements) {
        const element = document.getElementById(id);
        if (element && element.tagName === 'DETAILS') {
            element.addEventListener('toggle', function() {
                logAnalyticEvent('details_section_toggled', { 
                    section_name: detailsElements[id], 
                    is_open: this.open 
                });
            });
        } else if (element) {
                const parentDetails = element.closest('details');
                if(parentDetails && parentDetails.id === id) {
                parentDetails.addEventListener('toggle', function() {
                        logAnalyticEvent('details_section_toggled', { 
                        section_name: detailsElements[id], 
                        is_open: this.open 
                    });
                });
                }
        }
    }
    
    handleExpectedValueCalculation('initial_load'); 
});