import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, deleteDoc, query, where, onSnapshot, setLogLevel, orderBy, addDoc, updateDoc, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

const ICON_ADD = '➕';
const ICON_UPDATE = '🔄';
const ICON_EDIT = '✏️';
const ICON_DELETE = '🗑️';
const ICON_CALCULATE = '⚙️'; 
const ICON_SAVE = '💾';
const ICON_CANCEL = '❌';
const ICON_SWAP = '🔁';
const ICON_RESET = '↩️';
const ICON_PREFILL = '✨'; 
const ICON_EXPORT = '📤'; 
const ICON_IMPORT = '📥';
const ICON_CONFIRM = '✔️'; 
const ICON_SHARE = '🔗'; 
const ICON_UNSHARE = '🚫';
const ICON_COPY = '📋'; 

const appId = typeof __app_id !== 'undefined' ? __app_id : 'dc-dark-legion-builder'; 
const firebaseConfigProvided = { 
    apiKey: "AIzaSyAzSQbS4LtAz20syWI2HREPR7UnYh6ldbI", 
    authDomain: "dc-dark-legion-tools.firebaseapp.com",
    projectId: "dc-dark-legion-tools",
    storageBucket: "dc-dark-legion-tools.firebasestorage.app", 
    messagingSenderId: "786517074225",
    appId: "1:786517074225:web:9f14dc4dcae0705fcfd010",
    measurementId: "G-FTF00DHGV6"
};
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : firebaseConfigProvided;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let app;
let auth;
let db;
let analytics;
let userId; 
let rosterDataTable = null; 
let scoreColumnVisible = true; 
let teamNameModalCallback = null; 
let confirmModalConfirmCallback = null;
let confirmModalCancelCallback = null;
let originalBestTeam = null; 
let currentDisplayedTeam = null; 
let championToReplaceIndex = -1; 

const loadingIndicatorEl = document.getElementById('loading-indicator');
const errorIndicatorEl = document.getElementById('error-indicator');
const errorMessageDetailsEl = document.getElementById('error-message-details');
const saveRosterIndicatorEl = document.getElementById('save-roster-indicator');
const toggleScoreColumnCheckbox = document.getElementById('toggle-score-column');
const synergiesSectionEl = document.getElementById('synergies-section');
const synergiesListEl = document.getElementById('synergies-list');
const synergyChampionsModalEl = document.getElementById('synergy-champions-modal');
const synergyModalTitleEl = document.getElementById('synergy-modal-title');
const synergyModalBodyEl = document.getElementById('synergy-modal-body');
const closeSynergyModalBtn = document.getElementById('close-synergy-modal-btn');
const toastContainer = document.getElementById('toast-container');

const teamNameModalEl = document.getElementById('team-name-modal');
const teamNameModalTitleEl = document.getElementById('team-name-modal-title');
const teamNameInputEl = document.getElementById('team-name-input');
const saveTeamNameBtn = document.getElementById('save-team-name-btn');
const cancelTeamNameBtn = document.getElementById('cancel-team-name-btn');

const processingModalEl = document.getElementById('processing-modal');
const processingStatusTextEl = document.getElementById('processing-status-text');
const progressBarInnerEl = document.getElementById('progress-bar-inner');
const prefillRosterBtn = document.getElementById('prefill-roster-btn'); 
const exportRosterBtn = document.getElementById('export-roster-btn');
const importRosterBtn = document.getElementById('import-roster-btn');
const importRosterFileEl = document.getElementById('import-roster-file');

const confirmModalEl = document.getElementById('confirm-modal');
const confirmModalTitleEl = document.getElementById('confirm-modal-title');
const confirmModalMessageEl = document.getElementById('confirm-modal-message');
const confirmModalConfirmBtn = document.getElementById('confirm-modal-confirm-btn');
const confirmModalCancelBtn = document.getElementById('confirm-modal-cancel-btn');

const shareTeamModalEl = document.getElementById('share-team-modal');
const shareTeamModalTitleEl = document.getElementById('share-team-modal-title');
const shareTeamLinkInputEl = document.getElementById('share-team-link-input');
const copyShareLinkBtn = document.getElementById('copy-share-link-btn');
const closeShareTeamModalBtn = document.getElementById('close-share-team-modal-btn');

const mainAppContentEl = document.getElementById('main-app-content');
const sharedTeamViewSectionEl = document.getElementById('shared-team-view-section');
const sharedTeamNameEl = document.getElementById('shared-team-name');
const sharedTeamOutputEl = document.getElementById('shared-team-output');

const swapChampionModalEl = document.createElement('div'); 
swapChampionModalEl.id = 'swap-champion-modal';
swapChampionModalEl.className = 'modal-backdrop hidden';
document.body.appendChild(swapChampionModalEl); 

function showToast(message, type = 'info', duration = 3000) {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    
    let baseClasses = 'toast mb-3 p-3 rounded-lg shadow-lg text-sm text-white flex justify-between items-center';
    let typeClasses = '';

    switch (type) {
        case 'success': typeClasses = 'bg-green-500'; break;
        case 'error':   typeClasses = 'bg-red-500';   break;
        case 'warning': typeClasses = 'bg-yellow-500 text-black'; break; 
        case 'info':
        default:        typeClasses = 'bg-blue-500';  break;
    }
    toast.className = `${baseClasses} ${typeClasses}`;
    
    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    toast.appendChild(messageSpan);

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.className = 'ml-2 text-lg font-semibold leading-none focus:outline-none'; 
    closeBtn.onclick = () => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500); 
    };
    toast.appendChild(closeBtn);

    toastContainer.appendChild(toast);

    toast.offsetHeight; 

    toast.classList.add('show');

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500); 
    }, duration);
}


async function initializeFirebase() {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        analytics = getAnalytics(app);
        setLogLevel('error');

        loadingIndicatorEl.classList.remove('hidden');
        errorIndicatorEl.classList.add('hidden');

        return new Promise((resolve, reject) => {
            const unsubscribe = onAuthStateChanged(auth, async (user) => {
                if (user) {
                    console.log("User is signed in:", user.uid);
                    userId = user.uid;
                    userIdDisplay.textContent = `User ID: ${userId.substring(0,8)}...`; 
                    resolve();
                } else {
                    console.log("User is not signed in. Attempting to sign in...");
                    try {
                        if (initialAuthToken) {
                            await signInWithCustomToken(auth, initialAuthToken);
                            console.log("Signed in with custom token.");
                        } else {
                            await signInAnonymously(auth);
                            console.log("Signed in anonymously.");
                        }
                    } catch (error) {
                        console.error("Error during sign-in:", error);
                        showError("Firebase Authentication failed: " + error.message);
                        userIdDisplay.textContent = "User ID: Firebase not configured";
                        reject(error); 
                    }
                }
            }, (error) => { 
                console.error("Auth state listener error:", error);
                showError("Firebase Auth listener error: " + error.message);
                reject(error); 
            });
        });

    } catch (error) {
        console.error("Error initializing Firebase:", error);
        showError("Firebase initialization failed: " + error.message);
        throw error; 
    }
}

function showError(message, details = "") {
    loadingIndicatorEl.classList.add('hidden');
    errorIndicatorEl.classList.remove('hidden');
    errorIndicatorEl.querySelector('p').textContent = message;
    errorMessageDetailsEl.textContent = details;
    showToast(message, 'error'); 
}

const STAR_COLOR_TIERS = { 
    "Unlocked": 0.0, 
    "White 1-Star": 1.0, "White 2-Star": 1.05, "White 3-Star": 1.10, "White 4-Star": 1.15, "White 5-Star": 1.20,
    "Blue 1-Star": 1.25, "Blue 2-Star": 1.30, "Blue 3-Star": 1.35, "Blue 4-Star": 1.40, "Blue 5-Star": 1.45,
    "Purple 1-Star": 1.50, "Purple 2-Star": 1.55, "Purple 3-Star": 1.60, "Purple 4-Star": 1.65, "Purple 5-Star": 1.70,
    "Gold 1-Star": 1.75, "Gold 2-Star": 1.80, "Gold 3-Star": 1.85, "Gold 4-Star": 1.90, "Gold 5-Star": 1.95,
    "Red 1-Star": 2.00, "Red 2-Star": 2.05, "Red 3-Star": 2.10, "Red 4-Star": 2.15, "Red 5-Star": 2.20
};

const LEGACY_PIECE_POINTS_PER_STAR_INCREMENT = 5; 
const LEGACY_PIECE_STAR_TIER_SCORE = {};

function generateLegacyPieceStarTierScores() {
    LEGACY_PIECE_STAR_TIER_SCORE["Unlocked"] = 0;
    const colors = ["White", "Blue", "Purple", "Gold", "Red"];
    let starStep = 0; 
    colors.forEach(color => {
        for (let i = 1; i <= 5; i++) {
            starStep++;
            const tierName = `${color} ${i}-Star`;
            LEGACY_PIECE_STAR_TIER_SCORE[tierName] = starStep * LEGACY_PIECE_POINTS_PER_STAR_INCREMENT;
        }
    });
}
generateLegacyPieceStarTierScores(); 


const CHAMPION_BASE_RARITY_SCORE = { 
    "Epic": 100, "Legendary": 150, "Mythic": 200, "Limited Mythic": 250
};

const STANDARD_GEAR_RARITIES = ["None", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Mythic Enhanced"];
const STANDARD_GEAR_RARITY_SCORE = {
    "None": 0, "Uncommon": 10, "Rare": 20, "Epic": 40, "Legendary": 70, "Mythic": 100, "Mythic Enhanced": 150
};

const LEGACY_PIECE_BASE_RARITY_SCORE = { 
    "None": 0, "Epic": 50, "Legendary": 80, "Mythic": 120, "Mythic+": 180
};

const CLASS_DIVERSITY_MULTIPLIER = 1.15; 
const SYNERGY_ACTIVATION_COUNT = 3; 
const SYNERGY_COHESION_MULTIPLER = 5;
const SYNERGY_COHESION_BASE = 2000;

let dbSynergies = []; 
let dbChampions = []; 
let dbLegacyPieces = []; 
let playerChampionRoster = []; 
let currentSelectedChampionClass = null; 
let editingChampionId = null; 
let currentBestTeamForSaving = null; 
let savedTeams = []; 

const formModeTitleEl = document.getElementById('form-mode-title');
const champSelectDbEl = document.getElementById('champ-select-db');
const champBaseRarityDisplayEl = document.getElementById('champ-base-rarity-display');
const champClassDisplayEl = document.getElementById('champ-class-display'); 
const champHealerStatusDisplayEl = document.getElementById('champ-healer-status-display'); 
const champStarColorEl = document.getElementById('champ-star-color');
const champInherentSynergiesDisplayEl = document.getElementById('champ-inherent-synergies-display');
const gearSelectEls = {
    head: document.getElementById('gear-head'),
    arms: document.getElementById('gear-arms'),
    legs: document.getElementById('gear-legs'),
    chest: document.getElementById('gear-chest'),
    waist: document.getElementById('gear-waist'),
};
const legacyPieceSelectEl = document.getElementById('legacy-piece-select'); 
const legacyPieceStarColorEl = document.getElementById('legacy-piece-star-color'); 
const addUpdateChampionBtn = document.getElementById('add-update-champion-btn'); 
const cancelEditBtn = document.getElementById('cancel-edit-btn'); 
const championsRosterTableWrapperEl = document.getElementById('champions-roster-table-wrapper'); 
const userIdDisplay = document.getElementById('userIdDisplay');
const requireHealerCheckboxEl = document.getElementById('require-healer-checkbox'); 
const excludeSavedTeamCheckboxEl = document.getElementById('exclude-saved-team-checkbox'); 
const selectExclusionTeamDropdownEl = document.getElementById('select-exclusion-team-dropdown'); 
const calculateBtn = document.getElementById('calculate-btn');
const resultsOutputEl = document.getElementById('results-output');
const savedTeamsListEl = document.getElementById('saved-teams-list'); 

function populateStarColorOptions(selectElement, tiersObject, defaultTier = "Unlocked") {
    if (!selectElement) {
        console.error("populateStarColorOptions: Select element not provided or not found for tiers:", tiersObject);
        return;
    }
    selectElement.innerHTML = ''; 
    Object.keys(tiersObject).forEach(tier => {
        const option = document.createElement('option');
        option.value = tier;
        option.textContent = tier;
        selectElement.appendChild(option);
    });
    if (tiersObject.hasOwnProperty(defaultTier)) {
        selectElement.value = defaultTier;
    } else if (Object.keys(tiersObject).length > 0) {
        selectElement.value = Object.keys(tiersObject)[0]; 
    }
}


function populateGearRarityOptions() {
    document.querySelectorAll('.gear-rarity-select').forEach(selectEl => {
        STANDARD_GEAR_RARITIES.forEach(rarity => {
            const option = document.createElement('option');
            option.value = rarity;
            option.textContent = rarity;
            selectEl.appendChild(option);
        });
    });
}

async function fetchSynergiesAndRender() { 
    try {
        const synergiesCollectionRef = collection(db, `artifacts/${appId}/public/data/synergies`);
        const querySnapshot = await getDocs(synergiesCollectionRef);
        dbSynergies = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => (a.name || "").localeCompare(b.name || ""));
        renderAvailableSynergies(); 
    } catch (error) {
        console.error("Error fetching synergies:", error);
        showError("Error fetching synergies from Firestore.", error.message);
        dbSynergies = []; 
        renderAvailableSynergies(); 
    }
}

function renderAvailableSynergies() {
    if (!synergiesListEl) return;
    synergiesListEl.innerHTML = ''; 

    if (dbSynergies.length === 0) {
        synergiesListEl.innerHTML = '<p class="text-sm text-gray-500 col-span-full">No synergies defined in the database.</p>';
        return;
    }

    dbSynergies.forEach(synergyDef => {
        const synergyItemContainer = document.createElement('div'); 
        synergyItemContainer.className = 'synergy-item-container border rounded-lg p-3 bg-slate-50 mb-3 shadow-sm';

        const count = playerChampionRoster.filter(champ => (champ.inherentSynergies || []).includes(synergyDef.name)).length;
        const synergyItemHeader = document.createElement('div');
        synergyItemHeader.className = 'synergy-item-header flex items-center justify-between hover:bg-slate-100 p-2 rounded-md -m-2 mb-1'; 
        synergyItemHeader.dataset.synergyName = synergyDef.name;

        const factionNameForIcon = synergyDef.name.trim().replace(/\s+/g, '_');
        const fallbackSpan = `<span class="icon-placeholder" style="display:none;">[${synergyDef.name}]</span>`;
        
        synergyItemHeader.innerHTML = `
            <div class="flex items-center flex-grow">
                <span class="icon-wrapper mr-2">
                    <img src="img/factions/${factionNameForIcon}.png" alt="${synergyDef.name}" title="${synergyDef.name}" class="w-6 h-6 object-contain" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';">
                    ${fallbackSpan}
                </span>
                <span class="synergy-name">${synergyDef.name}</span>
            </div>
            <span class="synergy-progress">${count}/${SYNERGY_ACTIVATION_COUNT}</span>
        `;
        synergyItemContainer.appendChild(synergyItemHeader);

        const contributingChampions = playerChampionRoster.filter(champ => 
            (champ.inherentSynergies || []).includes(synergyDef.name)
        );

        if (contributingChampions.length > 0) {
            const championsListDiv = document.createElement('div');
            championsListDiv.className = 'mt-2 pl-4 border-l-2 border-slate-200 space-y-1 synergy-champions-list'; 

            contributingChampions.forEach(champ => {
                const champDiv = document.createElement('div');
                champDiv.className = 'synergy-champion-entry flex items-center text-xs text-slate-600 py-1';

                const classIconHtml = getClassPlaceholder(champ.class).replace('icon-class-table', 'result-icon w-4 h-4 mr-1');
                const starRatingHTML = getStarRatingHTML(champ.starColorTier);
                
                let champSynergiesHtml = '';
                if (champ.inherentSynergies && champ.inherentSynergies.length > 0) {
                    champSynergiesHtml += `<div class="champion-synergies flex gap-0.5 ml-auto">`;
                    champ.inherentSynergies.forEach(syn => {
                        if (syn !== synergyDef.name) { 
                            const synNameForIcon = syn.trim().replace(/\s+/g, '_');
                            champSynergiesHtml += `<span class="icon-wrapper"><img src="img/factions/${synNameForIcon}.png" alt="${syn}" title="${syn}" class="result-icon w-3 h-3" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';"><span class="icon-placeholder text-xs" style="display:none;">[${syn}]</span></span>`;
                        }
                    });
                    champSynergiesHtml += `</div>`;
                }

                champDiv.innerHTML = `
                    ${classIconHtml}
                    <span class="font-medium text-slate-700">${champ.name}</span>
                    <span class="star-rating star-rating-sm ml-2">${starRatingHTML.replace(/font-size: 1.2em;/g, 'font-size: 0.9em;')}</span>
                    ${champSynergiesHtml}
                `;
                championsListDiv.appendChild(champDiv);
            });
            synergyItemContainer.appendChild(championsListDiv);
        } else {
            const noChampsP = document.createElement('p');
            noChampsP.className = 'text-xs text-slate-500 mt-1 pl-4';
            noChampsP.textContent = 'No champions in your roster have this synergy yet.';
            synergyItemContainer.appendChild(noChampsP);
        }
        
        synergiesListEl.appendChild(synergyItemContainer);
    });
}


async function fetchChampions() {
        try {
        const championsCollectionRef = collection(db, `artifacts/${appId}/public/data/champions`);
        const querySnapshot = await getDocs(championsCollectionRef);
        dbChampions = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return { 
                id: doc.id, 
                ...data,
                isHealer: data.isHealer === true 
            };
        }); 
    } catch (error) {
        console.error("Error fetching champions:", error);
        showError("Error fetching champions from Firestore.", error.message);
        dbChampions = [];
    }
}

async function fetchLegacyPieces() {
    try {
        const legacyPiecesCollectionRef = collection(db, `artifacts/${appId}/public/data/legacyPieces`);
        const querySnapshot = await getDocs(legacyPiecesCollectionRef);
        dbLegacyPieces = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        populateLegacyPieceSelect(); 
    } catch (error) {
        console.error("Error fetching legacy pieces:", error);
        showError("Error fetching legacy pieces from Firestore.", error.message);
        dbLegacyPieces = [];
        populateLegacyPieceSelect(); 
    }
}

function populateChampionSelect() {
    if (!champSelectDbEl) {
        console.error("FATAL: Champion select dropdown element (champ-select-db) not found in DOM!");
        return;
    }
    const currentSelectedValue = editingChampionId ? playerChampionRoster.find(c => c.id === editingChampionId)?.dbChampionId : champSelectDbEl.value; 
    champSelectDbEl.innerHTML = '<option value="">-- Select Champion --</option>'; 

    if (dbChampions.length === 0) {
        return;
    }
    
    const rosteredDbChampionIds = playerChampionRoster.map(rc => rc.dbChampionId);
    
    const availableChampions = dbChampions.filter(dbChamp => 
        !rosteredDbChampionIds.includes(dbChamp.id) || (editingChampionId && playerChampionRoster.find(c => c.id === editingChampionId)?.dbChampionId === dbChamp.id)
    );

    const sortedAvailableChampions = [...availableChampions].sort((a, b) => (a.name || "Unnamed Champion").localeCompare(b.name || "Unnamed Champion"));

    sortedAvailableChampions.forEach(champ => {
        if (!champ.id || !champ.name) { 
            console.warn("Champion data in dbChampions missing id or name, skipping:", JSON.stringify(champ)); 
            return; 
        }
        const option = document.createElement('option');
        option.value = champ.id; 
        option.textContent = champ.name;
        champSelectDbEl.appendChild(option);
    });

    if (availableChampions.some(champ => champ.id === currentSelectedValue)) {
        champSelectDbEl.value = currentSelectedValue;
    } else if (!editingChampionId) { 
        champBaseRarityDisplayEl.value = '';
        champClassDisplayEl.value = ''; 
        champHealerStatusDisplayEl.value = ''; 
        currentSelectedChampionClass = null; 
        champInherentSynergiesDisplayEl.textContent = 'Select a base champion to see synergies.';
    }
    populateLegacyPieceSelect(currentSelectedChampionClass);
}

function populateLegacyPieceSelect(championClass = null) {
    if (!legacyPieceSelectEl) {
        console.error("FATAL: Legacy Piece select dropdown element (legacy-piece-select) not found in DOM!");
        return;
    }
    const currentSelectedLegacyId = legacyPieceSelectEl.value; 
    legacyPieceSelectEl.innerHTML = '<option value="">-- None --</option>'; 
    
    if (dbLegacyPieces.length === 0) {
        return;
    }

    let filteredLegacyPieces = dbLegacyPieces;

    if (championClass && championClass !== "N/A") {
        const lowerChampionClass = championClass.toLowerCase();
        filteredLegacyPieces = dbLegacyPieces.filter(lp => {
            const description = (lp.description || "").toLowerCase();
            return description === "" || description.includes(lowerChampionClass);
        });
    } else {
            filteredLegacyPieces = dbLegacyPieces.filter(lp => {
            const description = (lp.description || "").toLowerCase();
            return description === ""; 
        });
    }

    const sortedLegacyPieces = [...filteredLegacyPieces].sort((a,b) => (a.name || "Unnamed LP").localeCompare(b.name || "Unnamed LP"));
    
    sortedLegacyPieces.forEach(lp => {
        if (!lp.id || !lp.name || !lp.baseRarity) { 
                console.warn("Legacy Piece data in dbLegacyPieces missing id, name, or baseRarity, skipping:", JSON.stringify(lp));
            return;
        }
        const option = document.createElement('option');
        option.value = lp.id; 
        option.textContent = `${lp.name} (${lp.baseRarity})`;
        legacyPieceSelectEl.appendChild(option);
    });

    if (sortedLegacyPieces.some(lp => lp.id === currentSelectedLegacyId)) {
        legacyPieceSelectEl.value = currentSelectedLegacyId;
    }
}


champSelectDbEl.addEventListener('change', (event) => {
    const selectedChampionId = event.target.value;
    if (selectedChampionId) {
        const selectedDbChampion = dbChampions.find(c => c.id === selectedChampionId);
        if (selectedDbChampion) {
            champBaseRarityDisplayEl.value = selectedDbChampion.baseRarity || 'N/A';
            champClassDisplayEl.value = selectedDbChampion.class || 'N/A'; 
            champHealerStatusDisplayEl.value = selectedDbChampion.isHealer ? 'Yes' : 'No'; 
            currentSelectedChampionClass = selectedDbChampion.class || null; 
            champInherentSynergiesDisplayEl.textContent = (selectedDbChampion.inherentSynergies || []).join(', ') || 'None';
        } else {
            currentSelectedChampionClass = null;
                champHealerStatusDisplayEl.value = '';
        }
    } else {
        champBaseRarityDisplayEl.value = '';
        champClassDisplayEl.value = ''; 
        champHealerStatusDisplayEl.value = '';
        currentSelectedChampionClass = null;
        champInherentSynergiesDisplayEl.textContent = 'Select a base champion to see synergies.';
    }
    populateLegacyPieceSelect(currentSelectedChampionClass); 
});

async function savePlayerRosterToFirestore() {
    if (!userId) {
        console.error("Cannot save roster: User not authenticated.");
        showToast("Error: User not authenticated. Cannot save roster.", "error");
        return;
    }
    saveRosterIndicatorEl.classList.remove('hidden');
    addUpdateChampionBtn.disabled = true;

    const rosterToSave = playerChampionRoster.map(champ => {
        const legacyPiece = champ.legacyPiece || {};
        const baseLpScore = LEGACY_PIECE_BASE_RARITY_SCORE[legacyPiece.rarity] || 0;
        const lpStarBonus = LEGACY_PIECE_STAR_TIER_SCORE[legacyPiece.starColorTier] || 0;
        return {
            ...champ,
            legacyPiece: {
                ...legacyPiece,
                score: legacyPiece.id ? baseLpScore + lpStarBonus : 0, 
                starColorTier: legacyPiece.starColorTier || "Unlocked" 
            }
        };
    });

    try {
        const rosterDocRef = doc(db, `artifacts/${appId}/users/${userId}/roster/myRoster`);
        await setDoc(rosterDocRef, { champions: rosterToSave }); 
        console.log("Player roster saved to Firestore.");
        showToast("Roster saved successfully!", "success");
        if (analytics) logEvent(analytics, 'roster_saved', { roster_size: playerChampionRoster.length });
    } catch (error) {
        console.error("Error saving player roster:", error);
        showToast("Failed to save your roster. Error: " + error.message, "error");
    } finally {
        saveRosterIndicatorEl.classList.add('hidden');
        addUpdateChampionBtn.disabled = false;
    }
}

async function loadPlayerRosterFromFirestore() {
    if (!userId) {
        return;
    }
    try {
        const rosterDocRef = doc(db, `artifacts/${appId}/users/${userId}/roster/myRoster`);
        const docSnap = await getDoc(rosterDocRef);

        if (docSnap.exists()) {
            const rosterData = docSnap.data();
            if (rosterData && Array.isArray(rosterData.champions)) {
                playerChampionRoster = rosterData.champions.map(savedChamp => {
                    const baseDetails = dbChampions.find(dbChamp => dbChamp.id === savedChamp.dbChampionId);
                    const loadedLegacyPiece = savedChamp.legacyPiece || { id: null, name: "None", rarity: "None", score: 0, starColorTier: "Unlocked" };
                    
                    const baseLpScore = LEGACY_PIECE_BASE_RARITY_SCORE[loadedLegacyPiece.rarity] || 0;
                    const lpStarBonus = LEGACY_PIECE_STAR_TIER_SCORE[loadedLegacyPiece.starColorTier] || 0;
                    const finalLpScore = loadedLegacyPiece.id ? baseLpScore + lpStarBonus : 0;

                    return {
                        ...savedChamp, 
                        name: baseDetails ? baseDetails.name : savedChamp.name, 
                        baseRarity: baseDetails ? baseDetails.baseRarity : savedChamp.baseRarity,
                        class: baseDetails ? (baseDetails.class || "N/A") : (savedChamp.class || "N/A"),
                        isHealer: baseDetails ? (baseDetails.isHealer === true) : false, 
                        inherentSynergies: baseDetails ? (baseDetails.inherentSynergies || []) : (savedChamp.inherentSynergies || []),
                        legacyPiece: {
                            ...loadedLegacyPiece,
                            score: finalLpScore, 
                            starColorTier: loadedLegacyPiece.starColorTier || "Unlocked" 
                        }
                    };
                });
                if (analytics) logEvent(analytics, 'roster_loaded', { roster_size: playerChampionRoster.length });
            } else {
                playerChampionRoster = []; 
            }
        } else {
            playerChampionRoster = []; 
        }
        renderPlayerChampionRoster(); 
        renderAvailableSynergies(); 
    } catch (error) {
        console.error("Error loading player roster:", error);
        showError("Error loading your saved roster.", error.message);
        playerChampionRoster = []; 
        renderPlayerChampionRoster(); 
        renderAvailableSynergies(); 
    }
}

function resetChampionForm() {
    champSelectDbEl.value = "";
    champSelectDbEl.disabled = false; 
    champBaseRarityDisplayEl.value = "";
    champClassDisplayEl.value = "";
    champHealerStatusDisplayEl.value = "";
    currentSelectedChampionClass = null;
    
    populateStarColorOptions(champStarColorEl, STAR_COLOR_TIERS, "Unlocked");
    populateStarColorOptions(legacyPieceStarColorEl, LEGACY_PIECE_STAR_TIER_SCORE, "Unlocked");

    champInherentSynergiesDisplayEl.textContent = 'Select a base champion to see synergies.';
    Object.values(gearSelectEls).forEach(sel => sel.value = STANDARD_GEAR_RARITIES[0]); 
    legacyPieceSelectEl.value = ""; 
    populateLegacyPieceSelect(null); 
    addUpdateChampionBtn.innerHTML = `<span class="btn-icon">${ICON_ADD}</span> <span class="btn-text">Add Champion to Roster</span> <span id="save-roster-indicator" class="saving-indicator hidden"></span>`;
}

window.editChampion = (championId) => {
    const championToEdit = playerChampionRoster.find(c => c.id === championId);
    if (!championToEdit) {
        console.error("Champion to edit not found in roster:", championId);
        return;
    }
    editingChampionId = championId;
    formModeTitleEl.textContent = "Edit Champion in Roster";

    champSelectDbEl.value = championToEdit.dbChampionId;
    champSelectDbEl.disabled = true; 

    champBaseRarityDisplayEl.value = championToEdit.baseRarity;
    champClassDisplayEl.value = championToEdit.class || "N/A";
    champHealerStatusDisplayEl.value = championToEdit.isHealer ? 'Yes' : 'No';
    currentSelectedChampionClass = championToEdit.class || null; 
    champStarColorEl.value = championToEdit.starColorTier;
    legacyPieceStarColorEl.value = (championToEdit.legacyPiece && championToEdit.legacyPiece.starColorTier) ? championToEdit.legacyPiece.starColorTier : "Unlocked";


    champInherentSynergiesDisplayEl.textContent = (championToEdit.inherentSynergies || []).join(', ') || 'None';

    gearSelectEls.head.value = championToEdit.gear.head.rarity;
    gearSelectEls.arms.value = championToEdit.gear.arms.rarity;
    gearSelectEls.legs.value = championToEdit.gear.legs.rarity;
    gearSelectEls.chest.value = championToEdit.gear.chest.rarity;
    gearSelectEls.waist.value = championToEdit.gear.waist.rarity;
    
    populateLegacyPieceSelect(currentSelectedChampionClass); 
    legacyPieceSelectEl.value = (championToEdit.legacyPiece && championToEdit.legacyPiece.id) ? championToEdit.legacyPiece.id : "";


    addUpdateChampionBtn.innerHTML = `<span class="btn-icon">${ICON_UPDATE}</span> <span class="btn-text">Update Champion in Roster</span> <span id="save-roster-indicator" class="saving-indicator hidden"></span>`;
    cancelEditBtn.classList.remove('hidden');
    window.scrollTo({ top: champSelectDbEl.offsetTop - 125, behavior: 'smooth' }); 
    if (analytics) logEvent(analytics, 'edit_champion_start', { champion_id: championToEdit.dbChampionId, champion_name: championToEdit.name });
};

function cancelEditMode() {
    editingChampionId = null;
    formModeTitleEl.textContent = "Add Your Champions to Roster";
    resetChampionForm(); 
    cancelEditBtn.classList.add('hidden');
    champSelectDbEl.disabled = false; 
    populateChampionSelect();
    if (analytics) logEvent(analytics, 'edit_champion_cancel');
}
cancelEditBtn.addEventListener('click', cancelEditMode);

addUpdateChampionBtn.addEventListener('click', async () => { 
    const selectedDbChampionId = champSelectDbEl.value;
    const selectedLegacyPieceId = legacyPieceSelectEl.value;
    const selectedLegacyPieceStarTier = legacyPieceStarColorEl.value;
    let legacyPieceData = { id: null, name: "None", rarity: "None", score: 0, starColorTier: "Unlocked", description: "" };

    if (selectedLegacyPieceId) {
        const dbLp = dbLegacyPieces.find(lp => lp.id === selectedLegacyPieceId);
        if (dbLp) {
            const baseLpScore = LEGACY_PIECE_BASE_RARITY_SCORE[dbLp.baseRarity] || 0;
            const lpStarBonus = LEGACY_PIECE_STAR_TIER_SCORE[selectedLegacyPieceStarTier] || 0;
            legacyPieceData = {
                id: dbLp.id, name: dbLp.name, rarity: dbLp.baseRarity,
                score: baseLpScore + lpStarBonus, 
                starColorTier: selectedLegacyPieceStarTier,
                description: dbLp.description || ""
            };
        }
    } else {
            legacyPieceData.starColorTier = "Unlocked"; 
            legacyPieceData.score = LEGACY_PIECE_BASE_RARITY_SCORE["None"] || 0; 
    }


    if (editingChampionId) { 
        const championIndex = playerChampionRoster.findIndex(c => c.id === editingChampionId);
        if (championIndex === -1) {
            console.error("Could not find champion to update in roster.");
            showToast("Error: Champion to update not found.", "error");
            cancelEditMode(); 
            return;
        }
        
        const baseChampionDataForUpdate = dbChampions.find(dbChamp => dbChamp.id === playerChampionRoster[championIndex].dbChampionId);

        playerChampionRoster[championIndex] = {
            ...playerChampionRoster[championIndex], 
            isHealer: baseChampionDataForUpdate ? (baseChampionDataForUpdate.isHealer === true) : (playerChampionRoster[championIndex].isHealer === true), 
            starColorTier: champStarColorEl.value,
            gear: { 
                head: { rarity: gearSelectEls.head.value, score: STANDARD_GEAR_RARITY_SCORE[gearSelectEls.head.value] || 0 },
                arms: { rarity: gearSelectEls.arms.value, score: STANDARD_GEAR_RARITY_SCORE[gearSelectEls.arms.value] || 0 },
                legs: { rarity: gearSelectEls.legs.value, score: STANDARD_GEAR_RARITY_SCORE[gearSelectEls.legs.value] || 0 },
                chest: { rarity: gearSelectEls.chest.value, score: STANDARD_GEAR_RARITY_SCORE[gearSelectEls.chest.value] || 0 },
                waist: { rarity: gearSelectEls.waist.value, score: STANDARD_GEAR_RARITY_SCORE[gearSelectEls.waist.value] || 0 },
            },
            legacyPiece: legacyPieceData, 
        };
        
        renderPlayerChampionRoster(); 
        await savePlayerRosterToFirestore(); 
        showToast(`${playerChampionRoster[championIndex].name} updated in roster!`, "success");
        if (analytics) logEvent(analytics, 'update_champion_roster', { champion_id: playerChampionRoster[championIndex].dbChampionId, champion_name: playerChampionRoster[championIndex].name, star_tier: champStarColorEl.value });
        cancelEditMode(); 

    } else { 
        if (!selectedDbChampionId) {
            showToast('Please select a base champion.', 'warning');
            return;
        }
        if (playerChampionRoster.some(rc => rc.dbChampionId === selectedDbChampionId)) {
            showToast('This champion is already in your roster.', 'warning');
            return; 
        }

        const baseChampionData = dbChampions.find(c => c.id === selectedDbChampionId);
        if (!baseChampionData) {
            showToast('Selected base champion data not found. Please try again.', 'error'); 
            return;
        }

        const playerChampion = {
            id: Date.now(), 
            dbChampionId: baseChampionData.id, 
            name: baseChampionData.name,
            baseRarity: baseChampionData.baseRarity,
            class: baseChampionData.class || "N/A", 
            isHealer: baseChampionData.isHealer === true, 
            inherentSynergies: baseChampionData.inherentSynergies || [], 
            starColorTier: champStarColorEl.value, 
            gear: { 
                head: { rarity: gearSelectEls.head.value },
                arms: { rarity: gearSelectEls.arms.value },
                legs: { rarity: gearSelectEls.legs.value },
                chest: { rarity: gearSelectEls.chest.value },
                waist: { rarity: gearSelectEls.waist.value },
            },
            legacyPiece: legacyPieceData, 
        };
        
        Object.keys(playerChampion.gear).forEach(slot => {
            playerChampion.gear[slot].score = STANDARD_GEAR_RARITY_SCORE[playerChampion.gear[slot].rarity] || 0; 
        });

        playerChampionRoster.push(playerChampion); 
        renderPlayerChampionRoster(); 
        await savePlayerRosterToFirestore(); 
        showToast(`${playerChampion.name} added to roster!`, "success");
        if (analytics) logEvent(analytics, 'add_champion_to_roster', { champion_id: playerChampion.dbChampionId, champion_name: playerChampion.name, star_tier: playerChampion.starColorTier });
        resetChampionForm(); 
        populateChampionSelect(); 
    }
});

function getStarRatingHTML(starColorTier) {
    if (!starColorTier || starColorTier === "Unlocked") { 
        return '<span class="unlocked-tier-text">Unlocked</span>'; 
    }
    
    const parts = starColorTier.match(/(\w+)\s*(\d+)-Star/);
    if (!parts || parts.length < 3) {
        return `<span class="unlocked-tier-text">${starColorTier}</span>`; 
    }

    const colorName = parts[1].toLowerCase();
    const starCount = parseInt(parts[2], 10);
    let colorClass = '';

    switch (colorName) {
        case 'red':    colorClass = 'text-red-500'; break;
        case 'gold':   colorClass = 'text-yellow-400'; break; 
        case 'purple': colorClass = 'text-purple-500'; break;
        case 'blue':   colorClass = 'text-blue-500'; break;
        case 'white':  colorClass = 'text-slate-400'; break; 
        default:       colorClass = 'text-gray-500'; 
    }

    let starsHTML = `<div class="star-rating inline-block" title="${starColorTier}">`; 
    for (let i = 0; i < starCount; i++) {
        starsHTML += `<span class="${colorClass}">★</span>`;
    }
    starsHTML += `</div>`;
    return starsHTML;
}


// Helper function to get image HTML for healer status
function getHealerPlaceholder() {
    const fallbackSpan = `<span class="icon-placeholder" style="display:none;">[H]</span>`;
    return `<span class="icon-wrapper"><img src="img/classes/Healer.png" alt="Healer" title="Healer" class="icon-class-table" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';"/>${fallbackSpan}</span>`;
}

// Helper function to get image HTML based on champion class
function getClassPlaceholder(className, customClasses = "icon-class-table") { 
    const cn = (className || "N/A").trim().replace(/\s+/g, '_'); 
    if (cn === "N/A" || cn === "") {
        return `<span class="icon-placeholder">[Class N/A]</span>`;
    }
    const fallbackSpan = `<span class="icon-placeholder" style="display:none;">[${cn.replace(/_/g, ' ')}]</span>`;
    return `<span class="icon-wrapper"><img src="img/classes/${cn}.png" alt="${cn.replace(/_/g, ' ')}" title="${cn.replace(/_/g, ' ')}" class="${customClasses}" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';"/>${fallbackSpan}</span>`;
}


function renderPlayerChampionRoster() { 
    const rosterTableWrapper = document.getElementById('champions-roster-table-wrapper');
    if (!rosterTableWrapper) return;

    if (rosterDataTable) {
        rosterDataTable.clear().destroy(); 
        rosterDataTable = null;
    }
    rosterTableWrapper.innerHTML = ''; 

    if (playerChampionRoster.length === 0) {
        rosterTableWrapper.innerHTML = '<p class="text-sm text-gray-500">No champions added to your roster yet.</p>';
        if(prefillRosterBtn) prefillRosterBtn.classList.remove('hidden');
    } else {
        if(prefillRosterBtn) prefillRosterBtn.classList.add('hidden');
        const table = document.createElement('table');
        table.id = 'rosterTable'; 
        table.className = 'display min-w-full'; 
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Name</th>
                <th>Rarity</th>
                <th>Class</th>
                <th class="dt-column-score">Ind. Score</th>
                <th>Star/Color</th>
                <th>Legacy Piece</th>
                <th>Actions</th>
            </tr>
        `;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        
        playerChampionRoster.forEach(champ => { 
            const tr = document.createElement('tr');
            
            let legacyDisplay = "None";
            let legacySortScore = 0;
            if (champ.legacyPiece && champ.legacyPiece.id) {
                legacyDisplay = `${champ.legacyPiece.name} (${champ.legacyPiece.rarity})`;
                const lpStarTier = champ.legacyPiece.starColorTier || "Unlocked";
                if (lpStarTier !== "Unlocked") {
                        legacyDisplay += ` <span class="text-xs whitespace-nowrap">${getStarRatingHTML(lpStarTier)}</span>`;
                }
                legacySortScore = champ.legacyPiece.score || 0;
            }
            
            const displayHealerIcon = champ.isHealer ? getHealerPlaceholder() : '';
            const displayClassIcon = getClassPlaceholder(champ.class); 
            const individualScore = Math.round(calculateIndividualChampionScore(champ)); 
            const starRatingHTML = getStarRatingHTML(champ.starColorTier);

            tr.innerHTML = `
                <td data-sort="${champ.name}"><div class="flex items-center">${displayHealerIcon}<span class="ml-1">${champ.name}</span></div></td>
                <td data-sort="${CHAMPION_BASE_RARITY_SCORE[champ.baseRarity] || 0}">${champ.baseRarity}</td>
                <td data-sort="${champ.class || 'N/A'}">${displayClassIcon}</td>
                <td class="dt-column-score" data-sort="${individualScore}">${individualScore}</td>
                <td data-sort="${STAR_COLOR_TIERS[champ.starColorTier] || 0}">${starRatingHTML}</td>
                <td data-sort="${legacySortScore}">${legacyDisplay}</td>
                <td>
                    <button class="btn btn-sm btn-warning text-xs mr-1" onclick="editChampion(${champ.id})"><span class="btn-icon">${ICON_EDIT}</span> Edit</button>
                    <button class="btn btn-sm btn-danger text-xs" onclick="removePlayerChampion(${champ.id})"><span class="btn-icon">${ICON_DELETE}</span> Remove</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        rosterTableWrapper.appendChild(table);

        if (typeof $ !== 'undefined' && $.fn.DataTable) {
            rosterDataTable = new $('#rosterTable').DataTable({
                responsive: true,
                "columnDefs": [
                    { "targets": [0, 1, 2, 4, 5, 6], "type": "string" }, 
                    { "targets": 3, "type": "num", "className": "dt-column-score text-right" } 
                ],
                    "order": [[3, "desc"]] 
            });
            rosterDataTable.column('.dt-column-score').visible(scoreColumnVisible);
            toggleScoreColumnCheckbox.checked = scoreColumnVisible;
        } else {
            console.warn("jQuery or DataTables not loaded, roster table will not have advanced features.");
        }
    }
    renderAvailableSynergies(); 
}

if (toggleScoreColumnCheckbox) {
    toggleScoreColumnCheckbox.addEventListener('change', function() {
        scoreColumnVisible = this.checked;
        if (rosterDataTable) {
            rosterDataTable.column('.dt-column-score').visible(scoreColumnVisible);
        }
        if(analytics) logEvent(analytics, 'toggle_score_column', { visible: scoreColumnVisible });
    });
}

window.removePlayerChampion = async (championId) => { 
    if (editingChampionId === championId) { 
        cancelEditMode(); 
    }
    const champToRemove = playerChampionRoster.find(c => c.id === championId);
    if (champToRemove) {
        openConfirmModal(
            `Are you sure you want to remove ${champToRemove.name} from your roster?`,
            async () => {
                playerChampionRoster = playerChampionRoster.filter(c => c.id !== championId);
                renderPlayerChampionRoster(); 
                await savePlayerRosterToFirestore(); 
                showToast(`${champToRemove.name} removed from roster.`, "info");
                if (analytics) logEvent(analytics, 'remove_champion_from_roster', { champion_id: champToRemove.dbChampionId, champion_name: champToRemove.name });
                populateChampionSelect();
            }
        );
    }
}

function calculateIndividualChampionScore(champion) { 
    let score = 0;
    const baseScore = CHAMPION_BASE_RARITY_SCORE[champion.baseRarity] || 0; 
    
    let starMultiplier;
    if (champion.starColorTier in STAR_COLOR_TIERS) {
        starMultiplier = STAR_COLOR_TIERS[champion.starColorTier]; 
    } else {
        starMultiplier = 1.0; 
        console.warn(`Unknown starColorTier: ${champion.starColorTier} for champion ${champion.name}, defaulting to multiplier 1.0`);
    }
    
    score = baseScore * starMultiplier; 

    if (champion.gear && typeof champion.gear === 'object') {
        Object.entries(champion.gear).forEach(([slot, g]) => { 
            const gearScore = (g && typeof g === 'object' && g.score) ? g.score : 0; 
            score += gearScore;
        });
    }
    
    const legacyPiece = champion.legacyPiece || {};
    const baseLpScore = LEGACY_PIECE_BASE_RARITY_SCORE[legacyPiece.rarity] || 0;
    const lpStarBonus = LEGACY_PIECE_STAR_TIER_SCORE[legacyPiece.starColorTier] || 0;
    const finalLpScore = legacyPiece.id ? baseLpScore + lpStarBonus : 0;
    score += finalLpScore;

    return score;
}

function generateCombinations(array, k) {
    const result = [];
    function backtrack(startIndex, currentCombination) {
        if (currentCombination.length === k) {
            result.push([...currentCombination]);
            return;
        }
        for (let i = startIndex; i < array.length; i++) {
            currentCombination.push(array[i]);
            backtrack(i + 1, currentCombination);
            currentCombination.pop();
        }
    }
    backtrack(0, []);
    return result;
}

function openProcessingModal() {
    if (!processingModalEl) return;
    updateProcessingStatus("Initializing calculation...", 0);
    processingModalEl.classList.remove('hidden');
    processingModalEl.classList.add('active');
}

function closeProcessingModal() {
    if (!processingModalEl) return;
    processingModalEl.classList.add('hidden');
    processingModalEl.classList.remove('active');
}

function updateProcessingStatus(statusText, progressPercentage) {
    if (processingStatusTextEl) {
        processingStatusTextEl.textContent = statusText;
    }
    if (progressBarInnerEl) {
        progressBarInnerEl.style.width = `${progressPercentage}%`;
    } else {
        console.error("Progress bar inner element (#progress-bar-inner) not found in the DOM.");
    }
}


calculateBtn.addEventListener('click', () => {
    if (editingChampionId) {
        showToast("Please finish or cancel editing the current champion before calculating.", "warning");
        return;
    }
    if (playerChampionRoster.length < 5) {
        resultsOutputEl.innerHTML = '<p class="text-red-500">You need at least 5 champions in your roster to form a team.</p>';
        return;
    }
    if (dbSynergies.length === 0) {
            resultsOutputEl.innerHTML = '<p class="text-orange-500">Warning: No synergies loaded from DB. Calculation will proceed without synergy bonuses.</p>';
    }

    openProcessingModal();
    updateProcessingStatus("Initializing calculation...", 0);
    
    let rosterForCombination = playerChampionRoster.map(rosterChamp => { 
        const baseChampData = dbChampions.find(dbChamp => dbChamp.id === rosterChamp.dbChampionId);
        return {
            ...rosterChamp,
            isHealer: baseChampData ? (baseChampData.isHealer === true) : false, 
            individualScore: calculateIndividualChampionScore(rosterChamp) 
        };
    });
    updateProcessingStatus("Preparing roster and calculating individual scores...", 5);
    
    const excludeChampions = excludeSavedTeamCheckboxEl.checked;
    const selectedExclusionOptions = Array.from(selectExclusionTeamDropdownEl.selectedOptions);
    const exclusionTeamIds = selectedExclusionOptions.map(option => option.value);

    let championsToExcludeIds = new Set();

    if (excludeChampions && exclusionTeamIds.length > 0) { 
        exclusionTeamIds.forEach(teamId => {
            const teamToExclude = savedTeams.find(st => st.id === teamId);
            if (teamToExclude && teamToExclude.members) {
                teamToExclude.members.forEach(member => championsToExcludeIds.add(member.dbChampionId));
            }
        });
    }
    
    if (championsToExcludeIds.size > 0) {
        rosterForCombination = rosterForCombination.filter(champ => !championsToExcludeIds.has(champ.dbChampionId));
        if (rosterForCombination.length < 5) {
            updateProcessingStatus("Error: Not enough champions after exclusion.", 100);
            resultsOutputEl.innerHTML = '<p class="text-red-500">After excluding champions, there are not enough remaining champions in your roster to form a team of 5.</p>';
            setTimeout(closeProcessingModal, 1500);
            return;
        }
    }
    updateProcessingStatus("Applying champion exclusion rules...", 10);

    let teamCombinations = [];
    const requireHealer = requireHealerCheckboxEl.checked;
    updateProcessingStatus("Generating potential team combinations...", 12);

    if (requireHealer) {
        updateProcessingStatus("Filtering for healers...", 13);
        const healers = rosterForCombination.filter(champ => champ.isHealer === true);
        if (healers.length === 0) {
            updateProcessingStatus("Error: No healers found for 'Require Healer'.", 100);
            resultsOutputEl.innerHTML = '<p class="text-red-500">No healers found in the available roster to meet the "Require Healer" criteria. Cannot form a team.</p>';
            setTimeout(closeProcessingModal, 1500);
            return;
        }
        if (rosterForCombination.length < 5) { 
            updateProcessingStatus("Error: Not enough champions for a team with a healer.", 100);
            resultsOutputEl.innerHTML = `<p class="text-red-500">Not enough champions in the available roster to form a team of 5 with a healer.</p>`;
            setTimeout(closeProcessingModal, 1500);
            return;
        }
        updateProcessingStatus("Generating combinations with healers...", 15);
        healers.forEach(healer => {
            const otherChamps = rosterForCombination.filter(champ => champ.id !== healer.id); 
            if (otherChamps.length >= 4) { 
                const combinationsOfFour = generateCombinations(otherChamps, 4);
                combinationsOfFour.forEach(combo => {
                    teamCombinations.push([healer, ...combo]); 
                });
            }
        });
            if (teamCombinations.length === 0 && healers.length > 0) { 
            updateProcessingStatus("Error: Not enough other champions to form team with healer.", 100);
            resultsOutputEl.innerHTML = '<p class="text-red-500">Not enough other champions in the available roster to form a valid team of 5 with any available healer.</p>';
            setTimeout(closeProcessingModal, 1500);
            return;
        }
    } else { 
        updateProcessingStatus("Generating general combinations...", 15);
        teamCombinations = generateCombinations(rosterForCombination, 5);
    }
    
    if (teamCombinations.length === 0) {
        updateProcessingStatus("Error: Could not generate any valid teams.", 100);
        resultsOutputEl.innerHTML = '<p class="text-red-500">Could not generate any valid teams with the current criteria.</p>';
        setTimeout(closeProcessingModal, 1500);
        return;
    }
    
    updateProcessingStatus(`Generated ${teamCombinations.length} combinations. Preparing for evaluation...`, 20);

    let bestTeam = null;
    let maxScore = -1; 
    const totalCombinations = teamCombinations.length;
    const textUpdateInterval = Math.max(1, Math.floor(totalCombinations / 20)); 

    setTimeout(() => { 
        teamCombinations.forEach((team, index) => {
            const evaluationProgress = Math.round(((index + 1) / totalCombinations) * 75); 
            const currentOverallProgress = 20 + evaluationProgress;

            if (index % textUpdateInterval === 0 || index === totalCombinations - 1) {
                    updateProcessingStatus(`Evaluating team ${index + 1} of ${totalCombinations}...`, currentOverallProgress);
            } else { 
                if (progressBarInnerEl) progressBarInnerEl.style.width = `${currentOverallProgress}%`;
            }

            const currentTeamBaseScoreSum = team.reduce((sum, member) => sum + member.individualScore, 0);
            let scoreAfterPercentageSynergies = currentTeamBaseScoreSum;
            let totalPercentageBonusAppliedValue = 0;
            let accumulatedBaseFlatBonus = 0;
            let accumulatedTieredFlatBonus = 0;
            const activeSynergiesForTeamCalculation = [];
            
            const teamSynergyCounts = new Map();
            team.forEach(member => {
                (member.inherentSynergies || []).forEach(synergyName => {
                    teamSynergyCounts.set(synergyName, (teamSynergyCounts.get(synergyName) || 0) + 1);
                });
            });

            const sortedSynergyDefs = [...dbSynergies].sort((a, b) => {
                if (a.bonusType === 'percentage' && b.bonusType !== 'percentage') return -1;
                if (a.bonusType !== 'percentage' && b.bonusType === 'percentage') return 1;
                return 0;
            });

            sortedSynergyDefs.forEach(synergyDef => {
                const memberCount = teamSynergyCounts.get(synergyDef.name) || 0;

                if (memberCount >= SYNERGY_ACTIVATION_COUNT) {
                    let primaryBonusAppliedThisSynergy = 0;
                    let tieredFlatBonusAppliedThisSynergy = 0;

                    if (synergyDef.bonusValue !== undefined && synergyDef.bonusValue !== null) {
                        if (synergyDef.bonusType === 'percentage') {
                            const bonusValue = scoreAfterPercentageSynergies * (synergyDef.bonusValue / 100);
                            totalPercentageBonusAppliedValue += bonusValue; 
                            scoreAfterPercentageSynergies += bonusValue;
                            primaryBonusAppliedThisSynergy = synergyDef.bonusValue; 
                        } else if (synergyDef.bonusType === 'flat') {
                            accumulatedBaseFlatBonus += synergyDef.bonusValue;
                            primaryBonusAppliedThisSynergy = synergyDef.bonusValue;
                        }
                    }

                    if (memberCount === 3) tieredFlatBonusAppliedThisSynergy = SYNERGY_COHESION_BASE * SYNERGY_COHESION_MULTIPLER;
                    else if (memberCount === 4) tieredFlatBonusAppliedThisSynergy = SYNERGY_COHESION_BASE * SYNERGY_COHESION_MULTIPLER * 2.5;
                    else if (memberCount >= 5) tieredFlatBonusAppliedThisSynergy = SYNERGY_COHESION_BASE * SYNERGY_COHESION_MULTIPLER * 5;
                    accumulatedTieredFlatBonus += tieredFlatBonusAppliedThisSynergy;
                    
                    activeSynergiesForTeamCalculation.push({
                        name: synergyDef.name,
                        bonusType: synergyDef.bonusType,
                        primaryBonusApplied: primaryBonusAppliedThisSynergy, 
                        tieredFlatBonusApplied: tieredFlatBonusAppliedThisSynergy,
                        description: synergyDef.description || '',
                        appliedAtMemberCount: memberCount
                    });
                }
            });

            const totalFlatSynergyBonusComponent = accumulatedBaseFlatBonus + accumulatedTieredFlatBonus;
            const subtotalAfterSynergies = scoreAfterPercentageSynergies + totalFlatSynergyBonusComponent;
            
            const uniqueClassesInTeam = new Set(team.map(m => m.class).filter(c => c && c !== "N/A"));
            let classDiversityBonusValue = 0;
            let finalTeamScore = subtotalAfterSynergies;
            let classDiversityBonusApplied = false;

            if (uniqueClassesInTeam.size >= 4) {
                classDiversityBonusValue = subtotalAfterSynergies * (CLASS_DIVERSITY_MULTIPLIER - 1);
                finalTeamScore += classDiversityBonusValue;
                classDiversityBonusApplied = true;
            }

            if (finalTeamScore > maxScore) {
                maxScore = finalTeamScore;
                bestTeam = {
                    members: team,
                    totalScore: finalTeamScore,
                    activeSynergies: activeSynergiesForTeamCalculation,
                    baseScoreSum: currentTeamBaseScoreSum,
                    uniqueClassesCount: uniqueClassesInTeam.size,
                    classDiversityBonusApplied: classDiversityBonusApplied,
                    scoreBreakdown: { 
                        base: currentTeamBaseScoreSum,
                        percentageSynergyBonus: totalPercentageBonusAppliedValue,
                        flatSynergyBonus: totalFlatSynergyBonusComponent,
                        subtotalAfterSynergies: subtotalAfterSynergies,
                        classDiversityBonus: classDiversityBonusValue,
                    }
                };
            }
        });
        updateProcessingStatus("Finalizing best team...", 98);
        if (analytics && bestTeam) {
            logEvent(analytics, 'calculate_optimal_team', {
                roster_size: playerChampionRoster.length,
                combinations_checked: teamCombinations.length,
                best_team_score: Math.round(bestTeam.totalScore),
                require_healer: requireHealer,
                excluded_teams_count: exclusionTeamIds.length
            });
        }
        displayResults(bestTeam); 
        updateProcessingStatus("Calculation complete! Displaying results...", 100);
        setTimeout(closeProcessingModal, 1000); 
    }, 50); 
});

function displayResults(teamToDisplay) {
    if (!teamToDisplay || !teamToDisplay.scoreBreakdown) { 
        resultsOutputEl.innerHTML = '<p class="text-red-500">No optimal team could be determined or score breakdown is missing.</p>';
        currentBestTeamForSaving = null; 
        originalBestTeam = null;
        currentDisplayedTeam = null;
        return;
    }
    
    originalBestTeam = JSON.parse(JSON.stringify(teamToDisplay)); 
    currentDisplayedTeam = JSON.parse(JSON.stringify(teamToDisplay)); 
    currentBestTeamForSaving = JSON.parse(JSON.stringify(teamToDisplay)); 

    renderTeamDisplay(currentDisplayedTeam, true); 
}

function renderTeamDisplay(teamObject, isModifiable = true) {
    if (!teamObject || !teamObject.scoreBreakdown) {
            resultsOutputEl.innerHTML = '<p class="text-red-500">Error rendering team display: Invalid team data.</p>';
            return;
    }
    const breakdown = teamObject.scoreBreakdown;
    let html = `<h3 class="text-xl font-semibold text-indigo-700 mb-3">Optimal Team ${isModifiable && originalBestTeam && JSON.stringify(teamObject.members.map(m=>m.id)) !== JSON.stringify(originalBestTeam.members.map(m=>m.id)) ? '(Modified)' : ''}</h3>`;
    
    html += `<div class="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">`;
    html += `<h4 class="text-md font-semibold text-indigo-600 mb-2">Score Calculation:</h4>`;
    html += `<p>Base Individual Scores Sum: <strong class="float-right">${Math.round(breakdown.base)}</strong></p>`;
    if (breakdown.percentageSynergyBonus > 0) {
            html += `<p>Total Percentage Synergy Bonus: <strong class="text-green-600 float-right">+${Math.round(breakdown.percentageSynergyBonus)}</strong></p>`;
    }
    if (breakdown.flatSynergyBonus > 0) {
        html += `<p>Total Flat Synergy Bonuses: <strong class="text-green-600 float-right">+${Math.round(breakdown.flatSynergyBonus)}</strong></p>`;
    }
    html += `<p class="border-t border-indigo-200 pt-1 mt-1">Subtotal After Synergies: <strong class="float-right">${Math.round(breakdown.subtotalAfterSynergies)}</strong></p>`;
    if (teamObject.classDiversityBonusApplied) {
        html += `<p>Class Diversity Bonus (x${CLASS_DIVERSITY_MULTIPLIER}): <strong class="text-green-600 float-right">+${Math.round(breakdown.classDiversityBonus)}</strong></p>`;
    }
    html += `<p class="border-t border-indigo-200 pt-1 mt-1 font-bold text-indigo-700">Final Team Score: <strong class="float-right">${Math.round(teamObject.totalScore)}</strong></p>`;
    html += `</div>`;

    html += `<h4 class="text-md font-semibold text-gray-700 mt-3 mb-1">Score Contribution:</h4>`;
    html += `<div class="score-chart-container mb-2">`;
    const totalScoreForChart = teamObject.totalScore > 0 ? teamObject.totalScore : 1; 
    
    const basePct = (breakdown.base / totalScoreForChart) * 100;
    const percSynPct = (breakdown.percentageSynergyBonus / totalScoreForChart) * 100;
    const flatSynPct = (breakdown.flatSynergyBonus / totalScoreForChart) * 100;
    const classDivPct = (breakdown.classDiversityBonus / totalScoreForChart) * 100;

    if (basePct > 0) html += `<div class="score-chart-segment bg-blue-500" style="width:${basePct.toFixed(1)}%;" title="Base: ${Math.round(breakdown.base)}"></div>`;
    if (percSynPct > 0) html += `<div class="score-chart-segment bg-green-500" style="width:${percSynPct.toFixed(1)}%;" title="Perc. Synergy: +${Math.round(breakdown.percentageSynergyBonus)}"></div>`;
    if (flatSynPct > 0) html += `<div class="score-chart-segment bg-teal-500" style="width:${flatSynPct.toFixed(1)}%;" title="Flat Synergy: +${Math.round(breakdown.flatSynergyBonus)}"></div>`;
    if (classDivPct > 0) html += `<div class="score-chart-segment bg-purple-500" style="width:${classDivPct.toFixed(1)}%;" title="Class Div.: +${Math.round(breakdown.classDiversityBonus)}"></div>`;
    html += `</div>`;
    html += `<div class="flex justify-around mb-4">
                ${basePct > 0 ? '<span class="score-chart-segment-label"><span class="inline-block w-3 h-3 bg-blue-500 rounded-sm mr-1"></span>Base</span>' : ''}
                ${percSynPct > 0 ? '<span class="score-chart-segment-label"><span class="inline-block w-3 h-3 bg-green-500 rounded-sm mr-1"></span>% Syn.</span>' : ''}
                ${flatSynPct > 0 ? '<span class="score-chart-segment-label"><span class="inline-block w-3 h-3 bg-teal-500 rounded-sm mr-1"></span>Flat Syn.</span>' : ''}
                ${classDivPct > 0 ? '<span class="score-chart-segment-label"><span class="inline-block w-3 h-3 bg-purple-500 rounded-sm mr-1"></span>Class Div.</span>' : ''}
                </div>`;
    
    html += `<p class="mb-2"><strong class="text-gray-700">Unique Classes in Team:</strong> ${teamObject.uniqueClassesCount} (${teamObject.members.map(m=>m.class || 'N/A').filter((v,i,a)=>a.indexOf(v)===i && v !== "N/A").join(', ') || 'None'})</p>`;
    let hasHealer = teamObject.members.some(member => member.isHealer === true);
    html += `<p class="mb-4"><strong class="text-gray-700">Team Contains Healer:</strong> <span class="${hasHealer ? 'text-green-600 font-semibold' : 'text-red-600'}">${hasHealer ? 'Yes' : 'No'}</span></p>`;
    
    html += `<h4 class="text-lg font-medium text-gray-700 mt-4 mb-2">Team Members:</h4>`;
    html += `<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">`; 

    teamObject.members.forEach((member, index) => {
        const classNameForIcon = (member.class && member.class !== "N/A") ? member.class.trim().replace(/\s+/g, '_') : "UnknownClass"; 
        const healerIconHtml = member.isHealer ? `<span class="icon-wrapper"><img src="img/classes/Healer.png" alt="Healer" title="Healer" class="result-icon class-icon ml-1" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';"><span class="icon-placeholder text-xs" style="display:none;">[H]</span></span>` : '';
        const starRatingHTML = getStarRatingHTML(member.starColorTier);
        const swapButtonHtml = isModifiable ? `<button class="btn btn-sm btn-info btn-outline mt-2 w-full" onclick="handleOpenSwapModal(${index})"><span class="btn-icon">${ICON_SWAP}</span> Swap</button>` : '';


        html += `<div class="p-3 border rounded-lg shadow-md bg-slate-50 flex flex-col justify-between champion-card">`; 
        html += `   <div>`; 
        html += `       <div class="flex items-center mb-2">`;
        html += `           <span class="icon-wrapper"><img src="img/classes/${classNameForIcon}.png" alt="${member.class || 'N/A'}" title="${member.class || 'N/A'}" class="result-icon class-icon mr-2" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';">`;
        html += `           <span class="icon-placeholder text-xs" style="display:none;">[${member.class || 'N/A'}]</span></span>`; 
        html += `           <strong class="text-sm text-slate-800 leading-tight">${member.name}</strong>`;
        html += healerIconHtml; 
        html += `       </div>`;
        html += `       <div class="text-xs text-slate-600 mb-2">`;
        html += `           <p>Tier: ${starRatingHTML}</p>`; 
        html += `           <p>Ind. Score: ${Math.round(member.individualScore)}</p>`;
        if (member.legacyPiece && member.legacyPiece.id) {
            html += `<p>Legacy: ${member.legacyPiece.name} (${member.legacyPiece.rarity})`;
            if (member.legacyPiece.starColorTier && member.legacyPiece.starColorTier !== "Unlocked") {
                html += ` <span class="whitespace-nowrap">${getStarRatingHTML(member.legacyPiece.starColorTier)}</span>`;
            }
            html += `</p>`;
        }

        html += `       </div>`;
        if (member.inherentSynergies && member.inherentSynergies.length > 0) {
            html += `   <div class="mt-1">`; 
            html += `       <p class="text-xs font-semibold text-slate-500 mb-1">Synergies:</p>`;
            html += `       <div class="flex flex-wrap gap-1">`;
            member.inherentSynergies.forEach(synergy => {
                const synergyNameForIcon = synergy.trim().replace(/\s+/g, '_'); 
                html += `       <span class="icon-wrapper"><img src="img/factions/${synergyNameForIcon}.png" alt="${synergy}" title="${synergy}" class="result-icon w-5 h-5" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';">`;
                html += `       <span class="icon-placeholder text-xs" style="display:none;">[${synergy}]</span></span>`; 
            });
            html += `       </div></div>`;
        }
        html += `   </div>`; 
        html += `   ${swapButtonHtml}`; 
        html += `</div>`; 
    });
    html += `</div>`; 

    if (teamObject.activeSynergies.length > 0) {
        html += `<h4 class="text-lg font-medium text-gray-700 mt-6 mb-2">Active Team Synergies:</h4><ul class="list-disc list-inside space-y-1 text-sm">`;
        teamObject.activeSynergies.forEach(synergy => {
            let bonusDisplay = "";
            if (synergy.bonusType === 'percentage' && synergy.primaryBonusApplied !== 0) {
                bonusDisplay += `${synergy.primaryBonusApplied}% (base)`;
            } else if (synergy.bonusType === 'flat' && synergy.primaryBonusApplied !== 0) {
                bonusDisplay += `+${synergy.primaryBonusApplied} flat (base)`;
            }

            if (synergy.tieredFlatBonusApplied > 0) {
                if (bonusDisplay.length > 0) bonusDisplay += " & ";
                bonusDisplay += `+${synergy.tieredFlatBonusApplied} flat (tier)`;
            }
            
            html += `<li><strong>${synergy.name}</strong> (${synergy.appliedAtMemberCount} members): ${bonusDisplay || 'No direct bonus value'}. ${synergy.description ? `(${synergy.description})` : ''}</li>`;
        });
        html += `</ul>`;
    } else {
        html += `<p class="text-gray-600 mt-6">No team synergies were active for this team, or no synergies loaded from DB.</p>`;
    }
    
    html += `<div class="mt-6 flex gap-2">`;
    html += `  <button id="save-team-btn" class="btn btn-success"><span class="btn-icon">${ICON_SAVE}</span> <span class="btn-text">Save This Team</span></button>`;
    if (isModifiable && originalBestTeam && JSON.stringify(teamObject.members.map(m=>m.id)) !== JSON.stringify(originalBestTeam.members.map(m=>m.id))) {
            html += `<button id="reset-team-btn" class="btn btn-outline btn-info"><span class="btn-icon">${ICON_RESET}</span> Reset to Original</button>`;
    }
    html += `</div>`;

    resultsOutputEl.innerHTML = html;

    const saveTeamBtn = document.getElementById('save-team-btn');
    if (saveTeamBtn) {
        saveTeamBtn.addEventListener('click', saveCurrentBestTeam);
    }
    const resetTeamBtn = document.getElementById('reset-team-btn');
    if (resetTeamBtn) {
        resetTeamBtn.addEventListener('click', handleResetTeam);
    }
}

function openTeamNameModal(currentName = '', title = 'Enter Team Name', callback) {
    teamNameModalTitleEl.textContent = title;
    teamNameInputEl.value = currentName;
    teamNameModalCallback = callback; 
    teamNameModalEl.classList.remove('hidden');
    teamNameModalEl.classList.add('active');
    teamNameInputEl.focus();
}

function closeTeamNameModal() {
    teamNameModalEl.classList.add('hidden');
    teamNameModalEl.classList.remove('active');
    teamNameInputEl.value = ''; 
    teamNameModalCallback = null; 
}

if (saveTeamNameBtn) {
    saveTeamNameBtn.addEventListener('click', () => {
        const teamName = teamNameInputEl.value.trim();
        if (teamName === "") {
            showToast("Team name cannot be empty.", "warning");
            return;
        }
        if (teamNameModalCallback) {
            teamNameModalCallback(teamName); 
        }
        closeTeamNameModal();
    });
}

if (cancelTeamNameBtn) {
    cancelTeamNameBtn.addEventListener('click', closeTeamNameModal);
}

if (teamNameModalEl) {
    teamNameModalEl.addEventListener('click', (event) => {
        if (event.target === teamNameModalEl) {
            closeTeamNameModal();
        }
    });
}


async function saveCurrentBestTeam() {
    if (!userId) {
        showToast("You must be signed in to save teams.", "error");
        return;
    }
    if (!currentDisplayedTeam) { 
        showToast("No current team to save. Please calculate a team first.", "warning");
        return;
    }

    const defaultTeamName = `Team (Score: ${Math.round(currentDisplayedTeam.totalScore)}) - ${new Date().toLocaleDateString()}`;
    
    openTeamNameModal(defaultTeamName, 'Save Team As', async (teamNameToSave) => {
        const teamDataToSave = {
            name: teamNameToSave,
            members: currentDisplayedTeam.members.map(m => ({ 
                dbChampionId: m.dbChampionId, 
                name: m.name,
                baseRarity: m.baseRarity,
                class: m.class,
                isHealer: m.isHealer === true, 
                starColorTier: m.starColorTier,
                gear: m.gear, 
                legacyPiece: { 
                    id: m.legacyPiece.id,
                    name: m.legacyPiece.name,
                    rarity: m.legacyPiece.rarity,
                    score: m.legacyPiece.score,
                    starColorTier: m.legacyPiece.starColorTier || "Unlocked",
                    description: m.legacyPiece.description
                },
                inherentSynergies: m.inherentSynergies || [],
                individualScore: m.individualScore 
            })),
            totalScore: currentDisplayedTeam.totalScore,
            activeSynergies: currentDisplayedTeam.activeSynergies, 
            scoreBreakdown: currentDisplayedTeam.scoreBreakdown, 
            baseScoreSum: currentDisplayedTeam.baseScoreSum, 
            uniqueClassesCount: currentDisplayedTeam.uniqueClassesCount,
            classDiversityBonusApplied: currentDisplayedTeam.classDiversityBonusApplied,
            createdAt: serverTimestamp()
        };
        
        const saveTeamBtn = document.getElementById('save-team-btn'); 
        if(saveTeamBtn) saveTeamBtn.disabled = true; 

        try {
            const savedTeamsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/savedTeams`);
            await addDoc(savedTeamsCollectionRef, teamDataToSave); 
            showToast("Team saved successfully!", "success");
            if (analytics) logEvent(analytics, 'save_team', { team_name: teamNameToSave, team_score: Math.round(teamDataToSave.totalScore), member_count: teamDataToSave.members.length });
            loadSavedTeams(); 
        } catch (error) {
            console.error("Error saving team:", error);
            showToast("Failed to save team. Error: " + error.message, "error");
        } finally {
                if(saveTeamBtn) saveTeamBtn.disabled = false; 
        }
    });
}

async function loadSavedTeams() {
    if (!userId) return;
    try {
        const savedTeamsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/savedTeams`);
        const q = query(savedTeamsCollectionRef, orderBy("createdAt", "desc")); 
        const querySnapshot = await getDocs(q);
        savedTeams = querySnapshot.docs.map(doc => {
            const teamData = doc.data();
            const members = (teamData.members || []).map(member => ({
                ...member,
                legacyPiece: {
                    ...(member.legacyPiece || {}),
                    starColorTier: (member.legacyPiece && member.legacyPiece.starColorTier) ? member.legacyPiece.starColorTier : "Unlocked"
                }
            }));
            return { id: doc.id, ...teamData, members };
        });
        renderSavedTeams(); 
    } catch (error) {
        console.error("Error loading saved teams:", error);
        savedTeamsListEl.innerHTML = `<p class="text-red-500">Error loading saved teams.</p>`;
    }
}

function renderSavedTeams() {
    savedTeamsListEl.innerHTML = ''; 
    selectExclusionTeamDropdownEl.innerHTML = ''; 

    if (savedTeams.length === 0) {
        savedTeamsListEl.innerHTML = '<p class="text-sm text-gray-500">No teams saved yet.</p>';
        return;
    }

    savedTeams.forEach(team => {
        const teamContainerDiv = document.createElement('div');
        teamContainerDiv.className = 'p-4 border rounded-lg bg-white shadow-lg mb-6'; 

        let shareButtonHtml;
        if (team.publicShareId) {
            shareButtonHtml = `<button class="btn btn-sm btn-info text-xs" onclick="unshareTeam('${team.id}', '${team.publicShareId}')"><span class="btn-icon">${ICON_UNSHARE}</span> Unshare</button>`;
        } else {
            shareButtonHtml = `<button class="btn btn-sm btn-success text-xs" onclick="shareTeam('${team.id}')"><span class="btn-icon">${ICON_SHARE}</span> Share</button>`;
        }


        let teamHeaderHtml = `
            <div class="flex justify-between items-center mb-3 pb-2 border-b border-gray-200">
                <div>
                    <h4 class="font-semibold text-lg text-indigo-700">${team.name}</h4>
                    <p class="text-sm text-gray-600">Total Score: <strong class="text-pink-600">${Math.round(team.totalScore)}</strong></p>
                    ${team.publicShareId ? `<p class="text-xs text-blue-500 mt-1">Publicly Shared (ID: ${team.publicShareId.substring(0,6)}...)</p>` : ''}
                </div>
                <div class="flex-shrink-0 space-x-1">
                        ${shareButtonHtml}
                        <button class="btn btn-sm btn-warning text-xs" onclick="renameSavedTeam('${team.id}', '${team.name.replace(/'/g, "\\'")}')"><span class="btn-icon">${ICON_EDIT}</span> Rename</button>
                        <button class="btn btn-sm btn-danger text-xs" onclick="deleteSavedTeam('${team.id}')"><span class="btn-icon">${ICON_DELETE}</span> Delete</button>
                </div>
            </div>
        `;
        teamContainerDiv.innerHTML = teamHeaderHtml;

        const membersGridDiv = document.createElement('div');
        membersGridDiv.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3';

        if (team.members && Array.isArray(team.members)) {
            team.members.forEach(member => {
                const classNameForIcon = (member.class && member.class !== "N/A") ? member.class.trim().replace(/\s+/g, '_') : "UnknownClass";
                const healerIconHtml = member.isHealer ? `<span class="icon-wrapper"><img src="img/classes/Healer.png" alt="Healer" title="Healer" class="result-icon class-icon ml-1" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';"><span class="icon-placeholder text-xs" style="display:none;">[H]</span></span>` : '';
                const starRatingHTML = getStarRatingHTML(member.starColorTier);
                
                let individualScore = member.individualScore;
                if (individualScore === undefined) { 
                    const baseChampDetails = dbChampions.find(c => c.id === member.dbChampionId) || {};
                    const memberForScoreCalc = { 
                        ...member,
                        baseRarity: member.baseRarity || baseChampDetails.baseRarity,
                        legacyPiece: {
                            ...(member.legacyPiece || {}),
                            rarity: (member.legacyPiece && member.legacyPiece.rarity) ? member.legacyPiece.rarity : "None",
                            starColorTier: (member.legacyPiece && member.legacyPiece.starColorTier) ? member.legacyPiece.starColorTier : "Unlocked"
                        }
                    };
                    individualScore = calculateIndividualChampionScore(memberForScoreCalc);
                }


                let memberCardHtml = `<div class="p-3 border rounded-lg shadow-md bg-slate-50 flex flex-col justify-between champion-card">`;
                memberCardHtml += `   <div>`;
                memberCardHtml += `       <div class="flex items-center mb-2">`;
                memberCardHtml += `           <span class="icon-wrapper"><img src="img/classes/${classNameForIcon}.png" alt="${member.class || 'N/A'}" title="${member.class || 'N/A'}" class="result-icon class-icon mr-2" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';">`;
                memberCardHtml += `           <span class="icon-placeholder text-xs" style="display:none;">[${member.class || 'N/A'}]</span></span>`;
                memberCardHtml += `           <strong class="text-sm text-slate-800 leading-tight">${member.name}</strong>`;
                memberCardHtml += healerIconHtml;
                memberCardHtml += `       </div>`;

                memberCardHtml += `       <div class="text-xs text-slate-600 mb-2">`;
                memberCardHtml += `           <p>Tier: ${starRatingHTML}</p>`;
                memberCardHtml += `           <p>Score: ${Math.round(individualScore)}</p>`;
                if (member.legacyPiece && member.legacyPiece.id) {
                    memberCardHtml += `<p>Legacy: ${member.legacyPiece.name} (${member.legacyPiece.rarity})`;
                    if (member.legacyPiece.starColorTier && member.legacyPiece.starColorTier !== "Unlocked") {
                            memberCardHtml += ` <span class="whitespace-nowrap">${getStarRatingHTML(member.legacyPiece.starColorTier)}</span>`;
                    }
                    memberCardHtml += `</p>`;
                }
                memberCardHtml += `       </div>`;

                if (member.inherentSynergies && member.inherentSynergies.length > 0) {
                    memberCardHtml += `   <div class="mt-1">`; 
                    memberCardHtml += `       <p class="text-xs font-semibold text-slate-500 mb-1">Synergies:</p>`;
                    memberCardHtml += `       <div class="flex flex-wrap gap-1">`;
                    member.inherentSynergies.forEach(synergy => {
                        const synergyNameForIcon = synergy.trim().replace(/\s+/g, '_');
                        memberCardHtml += `<span class="icon-wrapper"><img src="img/factions/${synergyNameForIcon}.png" alt="${synergy}" title="${synergy}" class="result-icon w-5 h-5" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';">`;
                        memberCardHtml += `<span class="icon-placeholder text-xs" style="display:none;">[${synergy}]</span></span>`;
                    });
                    memberCardHtml += `       </div></div>`;
                }
                memberCardHtml += `   </div>`;
                memberCardHtml += `</div>`;
                membersGridDiv.innerHTML += memberCardHtml;
            });
        }
        teamContainerDiv.appendChild(membersGridDiv);
        savedTeamsListEl.appendChild(teamContainerDiv);

        const option = document.createElement('option');
        option.value = team.id;
        option.textContent = team.name;
        selectExclusionTeamDropdownEl.appendChild(option);
    });
}

excludeSavedTeamCheckboxEl.addEventListener('change', () => {
    selectExclusionTeamDropdownEl.disabled = !excludeSavedTeamCheckboxEl.checked;
    if (!excludeSavedTeamCheckboxEl.checked) {
        Array.from(selectExclusionTeamDropdownEl.options).forEach(option => {
            option.selected = false;
        });
    }
});

window.renameSavedTeam = async (teamId, currentName) => {
    if (!userId) {
            showToast("You must be signed in to rename teams.", "error");
        return;
    }
    openTeamNameModal(currentName, 'Rename Team', async (newName) => {
        if (newName && newName.trim() !== "" && newName.trim() !== currentName) {
            try {
                const teamDocRef = doc(db, `artifacts/${appId}/users/${userId}/savedTeams`, teamId);
                await updateDoc(teamDocRef, { name: newName.trim() });
                showToast("Team renamed successfully.", "success");
                if (analytics) logEvent(analytics, 'rename_saved_team');
                loadSavedTeams(); 
            } catch (error) {
                console.error("Error renaming saved team:", error);
                showToast("Failed to rename team. Error: " + error.message, "error");
            }
        } else if (newName === "") {
            showToast("Team name cannot be empty.", "warning");
        } else {
            showToast("Rename cancelled or name unchanged.", "info");
        }
    });
};


window.deleteSavedTeam = async (teamId) => {
    if (!userId) {
        showToast("You must be signed in to delete teams.", "error");
        return;
    }
    const teamToDelete = savedTeams.find(t => t.id === teamId);
    if (!teamToDelete) {
        showToast("Team not found.", "error");
        return;
    }

    openConfirmModal(
        `Are you sure you want to delete the team "${teamToDelete.name}"? If it's shared, the public link will also be removed.`,
        async () => {
            try {
                let wasShared = false;
                if (teamToDelete.publicShareId) {
                    const publicTeamDocRef = doc(db, `artifacts/${appId}/public/data/sharedTeams`, teamToDelete.publicShareId);
                    await deleteDoc(publicTeamDocRef);
                    showToast(`Public share for "${teamToDelete.name}" removed.`, "info");
                    wasShared = true;
                }

                const privateTeamDocRef = doc(db, `artifacts/${appId}/users/${userId}/savedTeams`, teamId);
                await deleteDoc(privateTeamDocRef);
                showToast(`Team "${teamToDelete.name}" deleted successfully.`, "success");
                if (analytics) logEvent(analytics, 'delete_saved_team', { was_shared: wasShared });
                loadSavedTeams(); 
            } catch (error) {
                console.error("Error deleting team:", error);
                showToast("Failed to delete team. Error: " + error.message, "error");
            }
        }
    );
};

window.handleOpenSwapModal = (indexToReplace) => {
    championToReplaceIndex = indexToReplace;
    if (!swapChampionModalEl.querySelector('.modal-content')) { 
        swapChampionModalEl.innerHTML = `
            <div class="modal-content">
                <div class="flex justify-between items-center mb-4">
                    <h3 id="swap-modal-title" class="text-xl font-semibold">Swap Champion</h3>
                    <button id="close-swap-modal-btn" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                <div id="swap-modal-body" class="text-sm max-h-96 overflow-y-auto">
                    </div>
            </div>
        `;
        swapChampionModalEl.querySelector('#close-swap-modal-btn').addEventListener('click', () => {
            swapChampionModalEl.classList.add('hidden');
            swapChampionModalEl.classList.remove('active');
        });
        swapChampionModalEl.addEventListener('click', (event) => { 
            if (event.target === swapChampionModalEl) {
                swapChampionModalEl.classList.add('hidden');
                swapChampionModalEl.classList.remove('active');
            }
        });
    }

    const swapModalBody = swapChampionModalEl.querySelector('#swap-modal-body');
    swapModalBody.innerHTML = ''; 

    const currentTeamMemberIds = currentDisplayedTeam.members.map(m => m.dbChampionId);
    const availableToSwap = playerChampionRoster.filter(pChamp => !currentTeamMemberIds.includes(pChamp.dbChampionId));

    if (availableToSwap.length === 0) {
        swapModalBody.innerHTML = '<p>No other champions available in your roster to swap.</p>';
    } else {
        const ul = document.createElement('ul');
        ul.className = 'list-none space-y-2';
        availableToSwap.forEach(champ => {
            const li = document.createElement('li');
            li.className = 'p-3 border rounded-md hover:bg-gray-100 cursor-pointer flex justify-between items-center';
            li.dataset.champId = champ.id; 

            const classIconHtml = getClassPlaceholder(champ.class, 'result-icon class-icon-swap mr-2'); 
            const starRatingHTML = getStarRatingHTML(champ.starColorTier);
            
            let champDetailsHtml = `<div class="champion-details flex items-center">
                                    ${classIconHtml}
                                    <strong class="text-slate-700">${champ.name}</strong>
                                    <div class="star-rating ml-2">${starRatingHTML}</div>
                                    </div>`;
            
            let champSynergiesHtml = '';
            if (champ.inherentSynergies && champ.inherentSynergies.length > 0) {
                champSynergiesHtml += `<div class="champion-synergies flex gap-1 ml-auto">`; 
                champ.inherentSynergies.forEach(synergy => {
                    const synergyNameForIcon = synergy.trim().replace(/\s+/g, '_');
                    champSynergiesHtml += `<span class="icon-wrapper"><img src="img/factions/${synergyNameForIcon}.png" alt="${synergy}" title="${synergy}" class="result-icon w-4 h-4" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';"><span class="icon-placeholder text-xs" style="display:none;">[${synergy}]</span></span>`;
                });
                champSynergiesHtml += `</div>`;
            }
            
            li.innerHTML = champDetailsHtml + champSynergiesHtml;

            li.addEventListener('click', () => {
                handleChampionSwap(champ.id, championToReplaceIndex);
                swapChampionModalEl.classList.add('hidden');
                swapChampionModalEl.classList.remove('active');
            });
            ul.appendChild(li);
        });
        swapModalBody.appendChild(ul);
    }
    swapChampionModalEl.classList.remove('hidden');
    swapChampionModalEl.classList.add('active');

    if (analytics && currentDisplayedTeam && currentDisplayedTeam.members[indexToReplace]) {
        logEvent(analytics, 'open_swap_modal', { champion_to_replace_name: currentDisplayedTeam.members[indexToReplace].name });
    }
}

window.handleChampionSwap = async (selectedRosterChampId, indexToReplace) => {
    const newChampion = playerChampionRoster.find(rc => rc.id === selectedRosterChampId);
    if (!newChampion || indexToReplace < 0 || indexToReplace >= currentDisplayedTeam.members.length) {
        showToast("Error selecting champion for swap.", "error");
        return;
    }

    const newTeamMembers = [...currentDisplayedTeam.members];
    newTeamMembers[indexToReplace] = { 
        ...newChampion,
        individualScore: calculateIndividualChampionScore(newChampion) 
    };
    
    openProcessingModal();
    updateProcessingStatus("Recalculating team score...", 10);

    setTimeout(async () => {
        const recalculatedTeam = recalculateTeamScore(newTeamMembers);
        currentDisplayedTeam = recalculatedTeam; 
        currentBestTeamForSaving = JSON.parse(JSON.stringify(recalculatedTeam)); 
        
        updateProcessingStatus("Updating display...", 90);
        renderTeamDisplay(currentDisplayedTeam, true); 
        
        updateProcessingStatus("Recalculation complete!", 100);
        setTimeout(closeProcessingModal, 500);
    }, 50);

    if (analytics && newChampion) {
        logEvent(analytics, 'execute_champion_swap', { 
            swapped_in_champion_name: newChampion.name,
            swapped_out_champion_name: currentDisplayedTeam.members[indexToReplace].name 
        });
    }
}

window.handleResetTeam = () => {
    if (originalBestTeam) {
        currentDisplayedTeam = JSON.parse(JSON.stringify(originalBestTeam));
        currentBestTeamForSaving = JSON.parse(JSON.stringify(originalBestTeam));
        renderTeamDisplay(currentDisplayedTeam, true);
        showToast("Team reset to original calculation.", "info");
    }
}

function recalculateTeamScore(teamMembersArray) {
    const currentTeamBaseScoreSum = teamMembersArray.reduce((sum, member) => sum + (member.individualScore || calculateIndividualChampionScore(member)), 0);
    let scoreAfterPercentageSynergies = currentTeamBaseScoreSum;
    let totalPercentageBonusAppliedValue = 0;
    let accumulatedBaseFlatBonus = 0;
    let accumulatedTieredFlatBonus = 0;
    const activeSynergiesForTeamCalculation = [];

    const teamSynergyCounts = new Map();
    teamMembersArray.forEach(member => {
        (member.inherentSynergies || []).forEach(synergyName => {
            teamSynergyCounts.set(synergyName, (teamSynergyCounts.get(synergyName) || 0) + 1);
        });
    });

    const sortedSynergyDefs = [...dbSynergies].sort((a, b) => {
        if (a.bonusType === 'percentage' && b.bonusType !== 'percentage') return -1;
        if (a.bonusType !== 'percentage' && b.bonusType === 'percentage') return 1;
        return 0;
    });

    sortedSynergyDefs.forEach(synergyDef => {
        const memberCount = teamSynergyCounts.get(synergyDef.name) || 0;

        if (memberCount >= SYNERGY_ACTIVATION_COUNT) {
            let primaryBonusAppliedThisSynergy = 0;
            let tieredFlatBonusAppliedThisSynergy = 0;

            if (synergyDef.bonusValue !== undefined && synergyDef.bonusValue !== null) {
                if (synergyDef.bonusType === 'percentage') {
                    const bonusValue = scoreAfterPercentageSynergies * (synergyDef.bonusValue / 100);
                    totalPercentageBonusAppliedValue += bonusValue;
                    scoreAfterPercentageSynergies += bonusValue;
                    primaryBonusAppliedThisSynergy = synergyDef.bonusValue;
                } else if (synergyDef.bonusType === 'flat') {
                    accumulatedBaseFlatBonus += synergyDef.bonusValue;
                    primaryBonusAppliedThisSynergy = synergyDef.bonusValue;
                }
            }
            if (memberCount === 3) tieredFlatBonusAppliedThisSynergy = 25000;
            else if (memberCount === 4) tieredFlatBonusAppliedThisSynergy = 100000;
            else if (memberCount >= 5) tieredFlatBonusAppliedThisSynergy = 250000;
            accumulatedTieredFlatBonus += tieredFlatBonusAppliedThisSynergy;
            
            activeSynergiesForTeamCalculation.push({
                name: synergyDef.name, bonusType: synergyDef.bonusType,
                primaryBonusApplied: primaryBonusAppliedThisSynergy,
                tieredFlatBonusApplied: tieredFlatBonusAppliedThisSynergy,
                description: synergyDef.description || '',
                appliedAtMemberCount: memberCount
            });
        }
    });

    const totalFlatSynergyBonusComponent = accumulatedBaseFlatBonus + accumulatedTieredFlatBonus;
    const subtotalAfterSynergies = scoreAfterPercentageSynergies + totalFlatSynergyBonusComponent;
    
    const uniqueClassesInTeam = new Set(teamMembersArray.map(m => m.class).filter(c => c && c !== "N/A"));
    let classDiversityBonusValue = 0;
    let finalTeamScore = subtotalAfterSynergies;
    let classDiversityBonusApplied = false;

    if (uniqueClassesInTeam.size >= 4) {
        classDiversityBonusValue = subtotalAfterSynergies * (CLASS_DIVERSITY_MULTIPLIER - 1);
        finalTeamScore += classDiversityBonusValue;
        classDiversityBonusApplied = true;
    }

    if (analytics) logEvent(analytics, 'reset_calculated_team');

    return {
        members: teamMembersArray,
        totalScore: finalTeamScore,
        activeSynergies: activeSynergiesForTeamCalculation,
        baseScoreSum: currentTeamBaseScoreSum,
        uniqueClassesCount: uniqueClassesInTeam.size,
        classDiversityBonusApplied: classDiversityBonusApplied,
        scoreBreakdown: {
            base: currentTeamBaseScoreSum,
            percentageSynergyBonus: totalPercentageBonusAppliedValue,
            flatSynergyBonus: totalFlatSynergyBonusComponent,
            subtotalAfterSynergies: subtotalAfterSynergies,
            classDiversityBonus: classDiversityBonusValue,
        }
    };
}

if (prefillRosterBtn) {
    prefillRosterBtn.addEventListener('click', async () => {
        const prefillAction = async () => {
            if (dbChampions.length === 0) {
                showToast("No base champions loaded from the database to pre-fill.", "error");
                return;
            }

            playerChampionRoster = [];

            dbChampions.forEach(baseChamp => {
                const defaultGear = {};
                STANDARD_GEAR_RARITIES.slice(1).forEach((rarity, index) => { 
                    const slotName = Object.keys(gearSelectEls)[index] || `gear_slot_${index+1}`; 
                        if(Object.keys(gearSelectEls).includes(slotName)){ 
                        defaultGear[slotName] = { rarity: "None", score: 0 };
                        }
                });
                Object.keys(gearSelectEls).forEach(slot => {
                    if (!defaultGear[slot]) {
                        defaultGear[slot] = { rarity: "None", score: 0 };
                    }
                });

                const newChamp = {
                    id: Date.now() + Math.random(), 
                    dbChampionId: baseChamp.id,
                    name: baseChamp.name,
                    baseRarity: baseChamp.baseRarity,
                    class: baseChamp.class || "N/A",
                    isHealer: baseChamp.isHealer === true,
                    inherentSynergies: baseChamp.inherentSynergies || [],
                    starColorTier: "Unlocked",
                    gear: defaultGear,
                    legacyPiece: { 
                        id: null, 
                        name: "None", 
                        rarity: "None", 
                        score: 0, 
                        starColorTier: "Unlocked", 
                        description: "" 
                    },
                };
                playerChampionRoster.push(newChamp);
            });

            showToast("Roster pre-filled with all champions at Unlocked tier!", "success");
            renderPlayerChampionRoster(); 
            await savePlayerRosterToFirestore();
            populateChampionSelect(); 
            if (analytics) logEvent(analytics, 'prefill_roster', { champion_count: dbChampions.length });
        };

        if (playerChampionRoster.length > 0) {
            openConfirmModal(
                "This will replace your current roster. Are you sure you want to pre-fill with all champions?",
                prefillAction
            );
        } else {
                openConfirmModal(
                "Are you sure you want to pre-fill your roster with all champions at Unlocked tier?",
                    prefillAction
            );
        }
    });
}

if (exportRosterBtn) {
    exportRosterBtn.addEventListener('click', () => {
        if (playerChampionRoster.length === 0) {
            showToast("Roster is empty. Nothing to export.", "warning");
            return;
        }
        const exportableRoster = playerChampionRoster.map(champ => {
            return {
                dbChampionId: champ.dbChampionId, 
                starColorTier: champ.starColorTier,
                gear: { 
                    head: { rarity: champ.gear.head.rarity },
                    arms: { rarity: champ.gear.arms.rarity },
                    legs: { rarity: champ.gear.legs.rarity },
                    chest: { rarity: champ.gear.chest.rarity },
                    waist: { rarity: champ.gear.waist.rarity },
                },
                legacyPiece: { 
                    id: champ.legacyPiece.id,
                    starColorTier: champ.legacyPiece.starColorTier || "Unlocked"
                }
            };
        });

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
    });
}

if (importRosterBtn) {
    importRosterBtn.addEventListener('click', () => {
        importRosterFileEl.click(); 
        if (analytics && playerChampionRoster.length > 0) logEvent(analytics, 'export_roster', { roster_size: playerChampionRoster.length });
    });
}

if (importRosterFileEl) {
    importRosterFileEl.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }
        if (file.type !== "application/json") {
            showToast("Invalid file type. Please select a JSON file.", "error");
            importRosterFileEl.value = ''; 
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const processImport = async () => {
                try {
                    const importedData = JSON.parse(e.target.result);
                    if (!Array.isArray(importedData)) {
                        showToast("Invalid roster format in JSON file.", "error");
                        return;
                    }

                    const newRoster = [];
                    let importErrors = 0;

                    for (const importedChamp of importedData) {
                        const baseChampionData = dbChampions.find(c => c.id === importedChamp.dbChampionId);
                        if (!baseChampionData) {
                            console.warn(`Champion with dbChampionId ${importedChamp.dbChampionId} not found in current game data. Skipping.`);
                            importErrors++;
                            continue;
                        }

                        let legacyPieceData = { id: null, name: "None", rarity: "None", score: 0, starColorTier: "Unlocked", description: "" };
                        if (importedChamp.legacyPiece && importedChamp.legacyPiece.id) {
                            const dbLp = dbLegacyPieces.find(lp => lp.id === importedChamp.legacyPiece.id);
                            if (dbLp) {
                                const lpStarTier = importedChamp.legacyPiece.starColorTier || "Unlocked";
                                const baseLpScore = LEGACY_PIECE_BASE_RARITY_SCORE[dbLp.baseRarity] || 0;
                                const lpStarBonus = LEGACY_PIECE_STAR_TIER_SCORE[lpStarTier] || 0;
                                legacyPieceData = {
                                    id: dbLp.id, name: dbLp.name, rarity: dbLp.baseRarity,
                                    score: baseLpScore + lpStarBonus,
                                    starColorTier: lpStarTier,
                                    description: dbLp.description || ""
                                };
                            } else {
                                console.warn(`Legacy Piece with id ${importedChamp.legacyPiece.id} not found. Assigning 'None'.`);
                            }
                        }

                        const playerChampion = {
                            id: Date.now() + Math.random(), 
                            dbChampionId: baseChampionData.id,
                            name: baseChampionData.name,
                            baseRarity: baseChampionData.baseRarity,
                            class: baseChampionData.class || "N/A",
                            isHealer: baseChampionData.isHealer === true,
                            inherentSynergies: baseChampionData.inherentSynergies || [],
                            starColorTier: importedChamp.starColorTier || "Unlocked",
                            gear: {
                                head: { rarity: importedChamp.gear?.head?.rarity || "None" },
                                arms: { rarity: importedChamp.gear?.arms?.rarity || "None" },
                                legs: { rarity: importedChamp.gear?.legs?.rarity || "None" },
                                chest: { rarity: importedChamp.gear?.chest?.rarity || "None" },
                                waist: { rarity: importedChamp.gear?.waist?.rarity || "None" },
                            },
                            legacyPiece: legacyPieceData,
                        };
                        
                        Object.keys(playerChampion.gear).forEach(slot => {
                            playerChampion.gear[slot].score = STANDARD_GEAR_RARITY_SCORE[playerChampion.gear[slot].rarity] || 0;
                        });
                        newRoster.push(playerChampion);
                    }

                    playerChampionRoster = newRoster;
                    renderPlayerChampionRoster();
                    await savePlayerRosterToFirestore(); 
                    populateChampionSelect(); 
                    
                    if (importErrors > 0) {
                        showToast(`Roster imported with ${importErrors} champion(s) skipped due to missing base data.`, "warning");
                    } else {
                        showToast("Roster imported successfully!", "success");
                    }
                    if (analytics) logEvent(analytics, 'import_roster_success', { imported_count: newRoster.length, error_count: importErrors });

                } catch (err) {
                    console.error("Error importing roster:", err);
                    showToast("Error importing roster: " + err.message, "error");
                } finally {
                    importRosterFileEl.value = ''; 
                }
            };
            
            openConfirmModal(
                "Importing this roster will overwrite your current roster. Are you sure?",
                processImport, // onConfirm
                () => { // onCancel
                    importRosterFileEl.value = ''; // Reset file input if cancelled
                    showToast("Roster import cancelled.", "info");
                }
            );
        };
        reader.readAsText(file);
    });
}

// --- Confirmation Modal Logic ---
function openConfirmModal(message, onConfirm, onCancel = null, title = "Confirm Action") {
    if (!confirmModalEl || !confirmModalMessageEl || !confirmModalTitleEl) {
        console.error("Confirmation modal elements not found!");
        if (typeof confirm !== 'undefined' && confirm(message)) {
            if (onConfirm) onConfirm();
        } else {
            if (onCancel) onCancel();
        }
        return;
    }
    confirmModalTitleEl.textContent = title;
    confirmModalMessageEl.textContent = message;
    confirmModalConfirmCallback = onConfirm;
    confirmModalCancelCallback = onCancel;

    confirmModalEl.classList.remove('hidden');
    confirmModalEl.classList.add('active');
}

function closeConfirmModal() {
    if (!confirmModalEl) return;
    confirmModalEl.classList.add('hidden');
    confirmModalEl.classList.remove('active');
    confirmModalConfirmCallback = null;
    confirmModalCancelCallback = null;
}

if (confirmModalConfirmBtn) {
    confirmModalConfirmBtn.addEventListener('click', () => {
        if (confirmModalConfirmCallback) {
            confirmModalConfirmCallback();
        }
        closeConfirmModal();
    });
}

if (confirmModalCancelBtn) {
    confirmModalCancelBtn.addEventListener('click', () => {
        if (confirmModalCancelCallback) {
            confirmModalCancelCallback();
        }
        closeConfirmModal();
    });
}

if (confirmModalEl) {
    confirmModalEl.addEventListener('click', (event) => {
        if (event.target === confirmModalEl) {
            if (confirmModalCancelCallback) {
                confirmModalCancelCallback(); 
            }
            closeConfirmModal();
        }
    });
}

function openShareTeamModal(shareLink) {
    if (!shareTeamModalEl || !shareTeamLinkInputEl) {
        console.error("Share team modal elements not found!");
        showToast("Could not display share link.", "error");
        return;
    }
    shareTeamLinkInputEl.value = shareLink;
    shareTeamModalEl.classList.remove('hidden');
    shareTeamModalEl.classList.add('active');
    shareTeamLinkInputEl.focus();
    shareTeamLinkInputEl.select();
}

function closeShareTeamModal() {
    if (!shareTeamModalEl) return;
    shareTeamModalEl.classList.add('hidden');
    shareTeamModalEl.classList.remove('active');
}

if (closeShareTeamModalBtn) {
    closeShareTeamModalBtn.addEventListener('click', closeShareTeamModal);
}
if (shareTeamModalEl) {
    shareTeamModalEl.addEventListener('click', (event) => {
        if (event.target === shareTeamModalEl) {
            closeShareTeamModal();
        }
    });
}
if (copyShareLinkBtn) {
    copyShareLinkBtn.addEventListener('click', () => {
        if (!shareTeamLinkInputEl) return;
        try {
            shareTeamLinkInputEl.select();
            document.execCommand('copy'); 
            showToast("Link copied to clipboard!", "success");
            if (analytics) logEvent(analytics, 'share_link_sopied', { link: shareTeamLinkInputEl.value });
        } catch (err) {
            showToast("Failed to copy link. Please copy it manually.", "warning");
            console.error('Failed to copy text: ', err);
        }
    });
}

window.shareTeam = async (teamId) => {
    if (!userId) {
        showToast("You must be signed in to share teams.", "error");
        return;
    }
    const teamToShare = savedTeams.find(t => t.id === teamId);
    if (!teamToShare) {
        showToast("Could not find the team to share.", "error");
        return;
    }

    openConfirmModal(
        `Are you sure you want to generate a public share link for the team "${teamToShare.name}"? Anyone with the link will be able to view it. This action cannot be undone directly, but you can delete the original team to remove the share.`,
        async () => {
            try {
                const publicTeamData = {
                    name: teamToShare.name,
                    members: teamToShare.members.map(m => ({ 
                        dbChampionId: m.dbChampionId, 
                        name: m.name, 
                        baseRarity: m.baseRarity,
                        class: m.class,
                        isHealer: m.isHealer === true, 
                        starColorTier: m.starColorTier,
                        gear: m.gear, 
                        legacyPiece: m.legacyPiece, 
                        inherentSynergies: m.inherentSynergies || [],
                        individualScore: m.individualScore 
                    })),
                    totalScore: teamToShare.totalScore,
                    activeSynergies: teamToShare.activeSynergies, 
                    scoreBreakdown: teamToShare.scoreBreakdown,
                    uniqueClassesCount: teamToShare.uniqueClassesCount, 
                    classDiversityBonusApplied: teamToShare.classDiversityBonusApplied, 
                    createdAt: serverTimestamp(), 
                    originalOwnerId: userId 
                };

                const sharedTeamsCollectionRef = collection(db, `artifacts/${appId}/public/data/sharedTeams`);
                const docRef = await addDoc(sharedTeamsCollectionRef, publicTeamData);
                
                const privateTeamDocRef = doc(db, `artifacts/${appId}/users/${userId}/savedTeams`, teamId);
                await updateDoc(privateTeamDocRef, { publicShareId: docRef.id });
                
                const shareLink = `${window.location.origin}${window.location.pathname}?sharedTeamId=${docRef.id}`;
                openShareTeamModal(shareLink);
                showToast("Public share link generated!", "success");
                loadSavedTeams(); 
                if (analytics) logEvent(analytics, 'share_team', { shared_team_id: docRef.id, original_team_id: teamId, team_name: teamToShare.name });

            } catch (error) {
                console.error("Error sharing team:", error);
                showToast("Failed to share team. Error: " + error.message, "error");
            }
        },
        () => {
            showToast("Team sharing cancelled.", "info");
        },
        "Confirm Public Share" 
    );
};

window.unshareTeam = async (savedTeamId, publicShareId) => {
    if (!userId || !publicShareId || !savedTeamId) {
        showToast("Missing information to unshare team.", "error");
        return;
    }
    
    const teamToUnshare = savedTeams.find(t => t.id === savedTeamId);
    if (!teamToUnshare) {
        showToast("Could not find the original team to unshare.", "error");
        return;
    }

    openConfirmModal(
        `Are you sure you want to remove the public share link for the team "${teamToUnshare.name}"? The team will remain in your private saved teams.`,
        async () => {
            try {
                const publicTeamDocRef = doc(db, `artifacts/${appId}/public/data/sharedTeams`, publicShareId);
                await deleteDoc(publicTeamDocRef);

                const privateTeamDocRef = doc(db, `artifacts/${appId}/users/${userId}/savedTeams`, savedTeamId);
                await updateDoc(privateTeamDocRef, { publicShareId: deleteField() }); 

                showToast(`Team "${teamToUnshare.name}" is no longer publicly shared.`, "success");
                loadSavedTeams(); 
                if (analytics) logEvent(analytics, 'unshare_team', { unshared_team_id: publicShareId, original_team_id: savedTeamId });
            } catch (error) {
                console.error("Error unsharing team:", error);
                showToast("Failed to unshare team. Error: " + error.message, "error");
            }
        },
        null, 
        "Confirm Unshare"
    );
};

async function handleSharedTeamLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedTeamId = urlParams.get('sharedTeamId');

    if (sharedTeamId) {
        loadingIndicatorEl.classList.remove('hidden');
        mainAppContentEl.classList.add('hidden'); 
        sharedTeamViewSectionEl.classList.remove('hidden'); 
        sharedTeamOutputEl.innerHTML = '<div class="loading-spinner"></div><p class="text-center text-indigo-600">Loading shared team...</p>';

        try {
            if (!db) { 
                await initializeFirebase(); 
                await Promise.all([
                    fetchChampions(), 
                    fetchSynergiesAndRender(),
                    fetchLegacyPieces() 
                ]);
            }
            const sharedTeamDocRef = doc(db, `artifacts/${appId}/public/data/sharedTeams`, sharedTeamId);
            const docSnap = await getDoc(sharedTeamDocRef);

            if (docSnap.exists()) {
                const sharedTeamData = docSnap.data();
                sharedTeamNameEl.textContent = sharedTeamData.name || "Shared Team";
                renderSharedTeam(sharedTeamData); 
                if (analytics) logEvent(analytics, 'view_shared_team', { shared_team_id: sharedTeamId });
            } else {
                sharedTeamOutputEl.innerHTML = '<p class="text-red-500 text-center">Shared team not found or link is invalid.</p>';
            }
        } catch (error) {
            console.error("Error fetching shared team:", error);
            sharedTeamOutputEl.innerHTML = '<p class="text-red-500 text-center">Error loading shared team.</p>';
            showToast("Error loading shared team: " + error.message, "error");
        } finally {
            loadingIndicatorEl.classList.add('hidden');
        }
    } else {
        mainAppContentEl.classList.remove('hidden');
        sharedTeamViewSectionEl.classList.add('hidden');
        return false; 
    }
    return true; 
}

function renderSharedTeam(teamObject) {
    if (!teamObject) { 
        sharedTeamOutputEl.innerHTML = '<p class="text-red-500">Error: Invalid shared team data provided.</p>';
            return;
    }
    
    const breakdown = teamObject.scoreBreakdown || { base: 0, percentageSynergyBonus: 0, flatSynergyBonus: 0, subtotalAfterSynergies: 0, classDiversityBonus: 0};
    
    let html = `<div class="mb-4 p-3 bg-indigo-100 border border-indigo-300 rounded-lg text-sm">`; 
    html += `<h4 class="text-md font-semibold text-indigo-700 mb-2">Score Calculation:</h4>`;
    html += `<p>Base Individual Scores Sum: <strong class="float-right">${Math.round(breakdown.base)}</strong></p>`;
    if (breakdown.percentageSynergyBonus > 0) {
            html += `<p>Total Percentage Synergy Bonus: <strong class="text-green-600 float-right">+${Math.round(breakdown.percentageSynergyBonus)}</strong></p>`;
    }
    if (breakdown.flatSynergyBonus > 0) {
        html += `<p>Total Flat Synergy Bonuses: <strong class="text-green-600 float-right">+${Math.round(breakdown.flatSynergyBonus)}</strong></p>`;
    }
    html += `<p class="border-t border-indigo-200 pt-1 mt-1">Subtotal After Synergies: <strong class="float-right">${Math.round(breakdown.subtotalAfterSynergies)}</strong></p>`;
    if (teamObject.classDiversityBonusApplied) { 
        html += `<p>Class Diversity Bonus (x${CLASS_DIVERSITY_MULTIPLIER}): <strong class="text-green-600 float-right">+${Math.round(breakdown.classDiversityBonus)}</strong></p>`;
    }
    html += `<p class="border-t border-indigo-200 pt-1 mt-1 font-bold text-indigo-700">Final Team Score: <strong class="float-right">${Math.round(teamObject.totalScore)}</strong></p>`;
    html += `</div>`;

    html += `<h4 class="text-md font-semibold text-gray-700 mt-3 mb-1">Score Contribution:</h4>`;
    html += `<div class="score-chart-container mb-2">`;
    const totalScoreForChart = teamObject.totalScore > 0 ? teamObject.totalScore : 1; 
    
    const basePct = (breakdown.base / totalScoreForChart) * 100;
    const percSynPct = (breakdown.percentageSynergyBonus / totalScoreForChart) * 100;
    const flatSynPct = (breakdown.flatSynergyBonus / totalScoreForChart) * 100;
    const classDivPct = (breakdown.classDiversityBonus / totalScoreForChart) * 100;

    if (basePct > 0) html += `<div class="score-chart-segment bg-blue-500" style="width:${basePct.toFixed(1)}%;" title="Base: ${Math.round(breakdown.base)}"></div>`;
    if (percSynPct > 0) html += `<div class="score-chart-segment bg-green-500" style="width:${percSynPct.toFixed(1)}%;" title="Perc. Synergy: +${Math.round(breakdown.percentageSynergyBonus)}"></div>`;
    if (flatSynPct > 0) html += `<div class="score-chart-segment bg-teal-500" style="width:${flatSynPct.toFixed(1)}%;" title="Flat Synergy: +${Math.round(breakdown.flatSynergyBonus)}"></div>`;
    if (classDivPct > 0 && teamObject.classDiversityBonusApplied) html += `<div class="score-chart-segment bg-purple-500" style="width:${classDivPct.toFixed(1)}%;" title="Class Div.: +${Math.round(breakdown.classDiversityBonus)}"></div>`;
    html += `</div>`;
    html += `<div class="flex justify-around mb-4">
                ${basePct > 0 ? '<span class="score-chart-segment-label"><span class="inline-block w-3 h-3 bg-blue-500 rounded-sm mr-1"></span>Base</span>' : ''}
                ${percSynPct > 0 ? '<span class="score-chart-segment-label"><span class="inline-block w-3 h-3 bg-green-500 rounded-sm mr-1"></span>% Syn.</span>' : ''}
                ${flatSynPct > 0 ? '<span class="score-chart-segment-label"><span class="inline-block w-3 h-3 bg-teal-500 rounded-sm mr-1"></span>Flat Syn.</span>' : ''}
                ${classDivPct > 0 && teamObject.classDiversityBonusApplied ? '<span class="score-chart-segment-label"><span class="inline-block w-3 h-3 bg-purple-500 rounded-sm mr-1"></span>Class Div.</span>' : ''}
                </div>`;
    
    const uniqueClassesDisplay = teamObject.uniqueClassesCount !== undefined ? teamObject.uniqueClassesCount : 'N/A';
    const uniqueClassNames = teamObject.members ? teamObject.members.map(m=>m.class || 'N/A').filter((v,i,a)=>a.indexOf(v)===i && v !== "N/A").join(', ') : 'None';

    html += `<p class="mb-2"><strong class="text-gray-700">Unique Classes in Team:</strong> ${uniqueClassesDisplay} (${uniqueClassNames || 'None'})</p>`;
    let hasHealer = teamObject.members ? teamObject.members.some(member => member.isHealer === true) : false;
    html += `<p class="mb-4"><strong class="text-gray-700">Team Contains Healer:</strong> <span class="${hasHealer ? 'text-green-600 font-semibold' : 'text-red-600'}">${hasHealer ? 'Yes' : 'No'}</span></p>`;
    
    html += `<h4 class="text-lg font-medium text-gray-700 mt-4 mb-2">Team Members:</h4>`;
    html += `<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">`; 

    if (teamObject.members && Array.isArray(teamObject.members)) {
        teamObject.members.forEach((member, index) => {
            const classNameForIcon = (member.class && member.class !== "N/A") ? member.class.trim().replace(/\s+/g, '_') : "UnknownClass"; 
            const healerIconHtml = member.isHealer ? `<span class="icon-wrapper"><img src="img/classes/Healer.png" alt="Healer" title="Healer" class="result-icon class-icon ml-1" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';"><span class="icon-placeholder text-xs" style="display:none;">[H]</span></span>` : '';
            const starRatingHTML = getStarRatingHTML(member.starColorTier);
            
            html += `<div class="p-3 border rounded-lg shadow-md bg-white flex flex-col justify-between champion-card">`; 
            html += `   <div>`; 
            html += `       <div class="flex items-center mb-2">`;
            html += `           <span class="icon-wrapper"><img src="img/classes/${classNameForIcon}.png" alt="${member.class || 'N/A'}" title="${member.class || 'N/A'}" class="result-icon class-icon mr-2" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';">`;
            html += `           <span class="icon-placeholder text-xs" style="display:none;">[${member.class || 'N/A'}]</span></span>`; 
            html += `           <strong class="text-sm text-slate-800 leading-tight">${member.name}</strong>`;
            html += healerIconHtml; 
            html += `       </div>`;
            html += `       <div class="text-xs text-slate-600 mb-2">`;
            html += `           <p>Tier: ${starRatingHTML}</p>`; 
            html += `           <p>Ind. Score: ${Math.round(member.individualScore || 0)}</p>`; 
            
            if (member.gear) {
                html += `<p class="mt-1 font-semibold">Gear:</p><ul class="list-disc list-inside ml-2">`;
                Object.entries(member.gear).forEach(([slot, gearItem]) => {
                    if (gearItem && gearItem.rarity && gearItem.rarity !== "None") {
                            html += `<li>${slot.charAt(0).toUpperCase() + slot.slice(1)}: ${gearItem.rarity}</li>`;
                    }
                });
                html += `</ul>`;
            }

            if (member.legacyPiece && member.legacyPiece.id) {
                html += `<p class="mt-1 font-semibold">Legacy: ${member.legacyPiece.name} (${member.legacyPiece.rarity})`;
                if (member.legacyPiece.starColorTier && member.legacyPiece.starColorTier !== "Unlocked") {
                    html += ` <span class="whitespace-nowrap">${getStarRatingHTML(member.legacyPiece.starColorTier)}</span>`;
                }
                html += `</p>`;
            }

            html += `       </div>`;
            if (member.inherentSynergies && member.inherentSynergies.length > 0) {
                html += `   <div class="mt-1">`; 
                html += `       <p class="text-xs font-semibold text-slate-500 mb-1">Synergies:</p>`;
                html += `       <div class="flex flex-wrap gap-1">`;
                member.inherentSynergies.forEach(synergy => {
                    const synergyNameForIcon = synergy.trim().replace(/\s+/g, '_'); 
                    html += `       <span class="icon-wrapper"><img src="img/factions/${synergyNameForIcon}.png" alt="${synergy}" title="${synergy}" class="result-icon w-5 h-5" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';">`;
                    html += `       <span class="icon-placeholder text-xs" style="display:none;">[${synergy}]</span></span>`; 
                });
                html += `       </div></div>`;
            }
            html += `   </div>`; 
            html += `</div>`; 
        });
    }
    html += `</div>`; 

    if (teamObject.activeSynergies && teamObject.activeSynergies.length > 0) {
        html += `<h4 class="text-lg font-medium text-gray-700 mt-6 mb-2">Active Team Synergies:</h4><ul class="list-disc list-inside space-y-1 text-sm">`;
        teamObject.activeSynergies.forEach(synergy => {
            let bonusDisplay = "";
            if (synergy.bonusType === 'percentage' && synergy.primaryBonusApplied !== 0) {
                bonusDisplay += `${synergy.primaryBonusApplied}% (base)`;
            } else if (synergy.bonusType === 'flat' && synergy.primaryBonusApplied !== 0) {
                bonusDisplay += `+${synergy.primaryBonusApplied} flat (base)`;
            }

            if (synergy.tieredFlatBonusApplied > 0) {
                if (bonusDisplay.length > 0) bonusDisplay += " & ";
                bonusDisplay += `+${synergy.tieredFlatBonusApplied} flat (tier)`;
            }
            
            html += `<li><strong>${synergy.name}</strong> (${synergy.appliedAtMemberCount} members): ${bonusDisplay || 'No direct bonus value'}. ${synergy.description ? `(${synergy.description})` : ''}</li>`;
        });
        html += `</ul>`;
    } else {
        html += `<p class="text-gray-600 mt-6">No team synergies were active for this team.</p>`;
    }
    
    sharedTeamOutputEl.innerHTML = html;
}

async function main() {
    try {
        await initializeFirebase();
        if (analytics) logEvent(analytics, 'page_view', { page_title: document.title, page_location: window.location.href });
        
        const isSharedView = await handleSharedTeamLink();

        if (!isSharedView) {
            document.getElementById('add-update-champion-btn').innerHTML = `<span class="btn-icon">${ICON_ADD}</span> <span class="btn-text">Add Champion to Roster</span> <span id="save-roster-indicator" class="saving-indicator hidden"></span>`;
            document.getElementById('cancel-edit-btn').innerHTML = `<span class="btn-icon">${ICON_CANCEL}</span> <span class="btn-text">Cancel Edit</span>`;
            document.getElementById('calculate-btn').innerHTML = `<span class="btn-icon">${ICON_CALCULATE}</span> <span class="btn-text">Calculate Best Team</span>`;
            document.getElementById('save-team-name-btn').innerHTML = `<span class="btn-icon">${ICON_SAVE}</span> <span class="btn-text">Save Name</span>`;
            document.getElementById('cancel-team-name-btn').innerHTML = `<span class="btn-icon">${ICON_CANCEL}</span> <span class="btn-text">Cancel</span>`;
            if(prefillRosterBtn) prefillRosterBtn.innerHTML = `<span class="btn-icon">${ICON_PREFILL}</span> <span class="btn-text">Pre-fill Roster</span>`;
            if(exportRosterBtn) exportRosterBtn.innerHTML = `<span class="btn-icon">${ICON_EXPORT}</span> <span class="btn-text">Export Roster</span>`;
            if(importRosterBtn) importRosterBtn.innerHTML = `<span class="btn-icon">${ICON_IMPORT}</span> <span class="btn-text">Import Roster</span>`;
            if(confirmModalConfirmBtn) confirmModalConfirmBtn.innerHTML = `<span class="btn-icon">${ICON_CONFIRM}</span> <span class="btn-text">Confirm</span>`;
            if(confirmModalCancelBtn) confirmModalCancelBtn.innerHTML = `<span class="btn-icon">${ICON_CANCEL}</span> <span class="btn-text">Cancel</span>`;
            if(copyShareLinkBtn) copyShareLinkBtn.innerHTML = `<span class="btn-icon">${ICON_COPY}</span> <span class="btn-text">Copy Link</span>`;

            populateStarColorOptions(champStarColorEl, STAR_COLOR_TIERS, "Unlocked");
            populateStarColorOptions(legacyPieceStarColorEl, LEGACY_PIECE_STAR_TIER_SCORE, "Unlocked"); 
            populateGearRarityOptions(); 
            
            if (dbChampions.length === 0) await fetchChampions();
            if (dbSynergies.length === 0) await fetchSynergiesAndRender(); 
            if (dbLegacyPieces.length === 0) await fetchLegacyPieces();
            
            await loadPlayerRosterFromFirestore(); 
            await loadSavedTeams(); 

            populateChampionSelect(); 
            resetChampionForm(); 
            
            synergiesSectionEl.classList.remove('hidden'); 
            loadingIndicatorEl.classList.add('hidden'); 
        }

    } catch (error) {
        if (analytics) logEvent(analytics, 'exception', { description: error.message, fatal: true });
        console.error("Main execution error:", error);
        loadingIndicatorEl.classList.add('hidden'); 
        if (!errorIndicatorEl.classList.contains('hidden')) { 
            // Error already shown by showError
        } else { 
            showError("An unexpected error occurred during page load.", error.message);
        }
    }
}

document.addEventListener('DOMContentLoaded', main);
