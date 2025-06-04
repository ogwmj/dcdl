/**
 * @file teams.js
 * @description Main application script for the DC Dark Legion Team Builder.
 * It encapsulates all functionality, state, and UI logic for the app.
 * Utilizes ES Module imports for Firebase.
 * 
 * @author Originally by the user, refactored and documented by Google's Gemini.
 * @version 2.0.0
 */

// ES Module Imports for Firebase (from original user code)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, deleteDoc, query, where, onSnapshot, setLogLevel, orderBy, addDoc, updateDoc, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

// Strict mode for better error handling and to prevent accidental global variables
'use strict';

//================================================================================
// 1. CONFIGURATION
//================================================================================
/**
 * @module config
 * @description Holds all static configuration, constants, and scoring data for the application.
 */
const config = {
    /** @property {string} appId - The unique identifier for the application's data in Firestore. */
    appId: typeof __app_id !== 'undefined' ? __app_id : 'dc-dark-legion-builder',
    
    /** @property {object} firebaseConfig - Firebase project configuration details. */
    firebaseConfig: typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
        apiKey: "AIzaSyAzSQbS4LtAz20syWI2HREPR7UnYh6ldbI", // Example, should be replaced by __firebase_config
        authDomain: "dc-dark-legion-tools.firebaseapp.com",
        projectId: "dc-dark-legion-tools",
        storageBucket: "dc-dark-legion-tools.firebasestorage.app",
        messagingSenderId: "786517074225",
        appId: "1:786517074225:web:9f14dc4dcae0705fcfd010",
        measurementId: "G-FTF00DHGV6"
    },

    /** @property {string|null} initialAuthToken - An initial authentication token, if provided. */
    initialAuthToken: typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null,

    /** @property {object} ICONS - A map of constant strings for UI icons. */
    ICONS: {
        ADD: '➕', UPDATE: '🔄', EDIT: '✏️', DELETE: '🗑️', CALCULATE: '⚙️',
        SAVE: '💾', CANCEL: '❌', SWAP: '🔁', RESET: '↩️', PREFILL: '✨',
        EXPORT: '📤', IMPORT: '📥', CONFIRM: '✔️', SHARE: '🔗', UNSHARE: '🚫', COPY: '📋'
    },
    
    /** @property {object} STAR_COLOR_TIERS - Multipliers for champion star/color tiers. */
    STAR_COLOR_TIERS: {
        "Unlocked": 0.0, "White 1-Star": 1.0, "White 2-Star": 1.05, "White 3-Star": 1.10, "White 4-Star": 1.15, "White 5-Star": 1.20,
        "Blue 1-Star": 1.25, "Blue 2-Star": 1.30, "Blue 3-Star": 1.35, "Blue 4-Star": 1.40, "Blue 5-Star": 1.45,
        "Purple 1-Star": 1.50, "Purple 2-Star": 1.55, "Purple 3-Star": 1.60, "Purple 4-Star": 1.65, "Purple 5-Star": 1.70,
        "Gold 1-Star": 1.75, "Gold 2-Star": 1.80, "Gold 3-Star": 1.85, "Gold 4-Star": 1.90, "Gold 5-Star": 1.95,
        "Red 1-Star": 2.00, "Red 2-Star": 2.05, "Red 3-Star": 2.10, "Red 4-Star": 2.15, "Red 5-Star": 2.20
    },
    
    /** @property {object} LEGACY_PIECE_STAR_TIER_SCORE - Point values for legacy piece star tiers. */
    LEGACY_PIECE_STAR_TIER_SCORE: {},

    /** @property {number} LEGACY_PIECE_POINTS_PER_STAR_INCREMENT - Points awarded per legacy piece star increment. */
    LEGACY_PIECE_POINTS_PER_STAR_INCREMENT: 5,
    
    /** @property {object} CHAMPION_BASE_RARITY_SCORE - Base scores for champion rarities. */
    CHAMPION_BASE_RARITY_SCORE: { "Epic": 100, "Legendary": 150, "Mythic": 200, "Limited Mythic": 250 },
    
    /** @property {string[]} STANDARD_GEAR_RARITIES - An ordered list of standard gear rarities. */
    STANDARD_GEAR_RARITIES: ["None", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Mythic Enhanced"],

    /** @property {object} STANDARD_GEAR_RARITY_SCORE - Point values for standard gear rarities. */
    STANDARD_GEAR_RARITY_SCORE: { "None": 0, "Uncommon": 10, "Rare": 20, "Epic": 40, "Legendary": 70, "Mythic": 100, "Mythic Enhanced": 150 },
    
    /** @property {object} LEGACY_PIECE_BASE_RARITY_SCORE - Base scores for legacy piece rarities. */
    LEGACY_PIECE_BASE_RARITY_SCORE: { "None": 0, "Epic": 50, "Legendary": 80, "Mythic": 120, "Mythic+": 180 },
    
    /** @property {number} CLASS_DIVERSITY_MULTIPLIER - Score multiplier for having a diverse team of classes. */
    CLASS_DIVERSITY_MULTIPLIER: 1.15,

    /** @property {number} SYNERGY_ACTIVATION_COUNT - Number of champions required to activate a synergy. */
    SYNERGY_ACTIVATION_COUNT: 3,
    
    /** @property {number} SYNERGY_COHESION_MULTIPLER - Multiplier for synergy cohesion bonus. */
    SYNERGY_COHESION_MULTIPLER: 5,

    /** @property {number} SYNERGY_COHESION_BASE - Base score for synergy cohesion. */
    SYNERGY_COHESION_BASE: 2000,
};

/**
 * @function generateLegacyPieceStarTierScores
 * @description Populates the LEGACY_PIECE_STAR_TIER_SCORE object based on defined colors and increments.
 * @private
 */
function generateLegacyPieceStarTierScores() {
    config.LEGACY_PIECE_STAR_TIER_SCORE["Unlocked"] = 0;
    const colors = ["White", "Blue", "Purple", "Gold", "Red"];
    let starStep = 0;
    colors.forEach(color => {
        for (let i = 1; i <= 5; i++) {
            starStep++;
            const tierName = `${color} ${i}-Star`;
            config.LEGACY_PIECE_STAR_TIER_SCORE[tierName] = starStep * config.LEGACY_PIECE_POINTS_PER_STAR_INCREMENT;
        }
    });
}
generateLegacyPieceStarTierScores();

//================================================================================
// 2. APPLICATION STATE
//================================================================================
/**
 * @module state
 * @description Holds the dynamic state of the application.
 */
const state = {
    firebase: { app: null, auth: null, db: null, analytics: null },
    userId: null,
    dbChampions: [],
    dbSynergies: [],
    dbLegacyPieces: [],
    playerChampionRoster: [],
    savedTeams: [],
    editingChampionId: null,
    currentSelectedChampionClass: null,
    originalBestTeam: null,
    currentDisplayedTeam: null,
    championToReplaceIndex: -1,
    rosterDataTable: null,
    scoreColumnVisible: true,
    modalCallbacks: {
        teamName: null,
        confirm: null,
        cancel: null
    }
};

//================================================================================
// 3. DOM ELEMENT CACHE
//================================================================================
/**
 * @module dom
 * @description Caches references to all necessary DOM elements.
 * This function should be called after DOMContentLoaded.
 */
let domElements = {}; // Will be populated by cacheDomElements

function cacheDomElements() {
    domElements = {
        loadingIndicator: document.getElementById('loading-indicator'),
        errorIndicator: document.getElementById('error-indicator'),
        errorMessageDetails: document.getElementById('error-message-details'),
        saveRosterIndicator: document.getElementById('save-roster-indicator'),
        userIdDisplay: document.getElementById('userIdDisplay'),
        mainAppContent: document.getElementById('main-app-content'),
        toastContainer: document.getElementById('toast-container'),

        // Champion Form
        formModeTitle: document.getElementById('form-mode-title'),
        champSelectDb: document.getElementById('champ-select-db'),
        champBaseRarityDisplay: document.getElementById('champ-base-rarity-display'),
        champClassDisplay: document.getElementById('champ-class-display'),
        champHealerStatusDisplay: document.getElementById('champ-healer-status-display'),
        champStarColor: document.getElementById('champ-star-color'),
        champInherentSynergiesDisplay: document.getElementById('champ-inherent-synergies-display'),
        gearSelects: {
            head: document.getElementById('gear-head'), arms: document.getElementById('gear-arms'),
            legs: document.getElementById('gear-legs'), chest: document.getElementById('gear-chest'),
            waist: document.getElementById('gear-waist'),
        },
        legacyPieceSelect: document.getElementById('legacy-piece-select'),
        legacyPieceStarColor: document.getElementById('legacy-piece-star-color'),
        addUpdateChampionBtn: document.getElementById('add-update-champion-btn'),
        cancelEditBtn: document.getElementById('cancel-edit-btn'),

        // Roster & Synergies
        championsRosterTableWrapper: document.getElementById('champions-roster-table-wrapper'),
        toggleScoreColumnCheckbox: document.getElementById('toggle-score-column'),
        synergiesSection: document.getElementById('synergies-section'),
        synergiesList: document.getElementById('synergies-list'),

        // Calculation & Results
        calculateBtn: document.getElementById('calculate-btn'),
        requireHealerCheckbox: document.getElementById('require-healer-checkbox'),
        excludeSavedTeamCheckbox: document.getElementById('exclude-saved-team-checkbox'),
        selectExclusionTeamDropdown: document.getElementById('select-exclusion-team-dropdown'),
        resultsOutput: document.getElementById('results-output'),
        
        // Saved Teams
        savedTeamsList: document.getElementById('saved-teams-list'),
        
        // Import / Export / Prefill
        prefillRosterBtn: document.getElementById('prefill-roster-btn'),
        exportRosterBtn: document.getElementById('export-roster-btn'),
        importRosterBtn: document.getElementById('import-roster-btn'),
        importRosterFile: document.getElementById('import-roster-file'),

        // Modals
        processingModal: document.getElementById('processing-modal'),
        processingStatusText: document.getElementById('processing-status-text'),
        progressBarInner: document.getElementById('progress-bar-inner'),

        teamNameModal: document.getElementById('team-name-modal'),
        teamNameModalTitle: document.getElementById('team-name-modal-title'),
        teamNameInput: document.getElementById('team-name-input'),
        saveTeamNameBtn: document.getElementById('save-team-name-btn'),
        cancelTeamNameBtn: document.getElementById('cancel-team-name-btn'),

        confirmModal: document.getElementById('confirm-modal'),
        confirmModalTitle: document.getElementById('confirm-modal-title'),
        confirmModalMessage: document.getElementById('confirm-modal-message'),
        confirmModalConfirmBtn: document.getElementById('confirm-modal-confirm-btn'),
        confirmModalCancelBtn: document.getElementById('confirm-modal-cancel-btn'),

        shareTeamModal: document.getElementById('share-team-modal'),
        shareTeamLinkInput: document.getElementById('share-team-link-input'),
        copyShareLinkBtn: document.getElementById('copy-share-link-btn'),
        closeShareTeamModalBtn: document.getElementById('close-share-team-modal-btn'),
        
        swapChampionModal: document.getElementById('swap-champion-modal'), // Assuming it's in HTML or created early
        
        // Shared Team View
        sharedTeamViewSection: document.getElementById('shared-team-view-section'),
        sharedTeamName: document.getElementById('shared-team-name'),
        sharedTeamOutput: document.getElementById('shared-team-output'),
    };
}

//================================================================================
// 4. FIREBASE SERVICE
//================================================================================
/**
 * @module firebaseService
 * @description Handles all communication with Firebase services.
 */
const firebaseService = {
    /**
     * Initializes the Firebase app, auth, and Firestore instances.
     * Handles anonymous or custom token user sign-in.
     * @returns {Promise<void>} A promise that resolves when initialization and authentication are complete.
     */
    async init() {
        // Firebase functions are imported at the top of the file and are available directly.
        try {
            state.firebase.app = initializeApp(config.firebaseConfig);
            state.firebase.auth = getAuth(state.firebase.app);
            state.firebase.db = getFirestore(state.firebase.app);
            state.firebase.analytics = getAnalytics(state.firebase.app);
            setLogLevel('error'); // Firebase SDK's setLogLevel

            ui.showLoading(true);
            ui.showError(false);

            return new Promise((resolve, reject) => {
                onAuthStateChanged(state.firebase.auth, async (user) => {
                    if (user) {
                        console.log("User is signed in:", user.uid);
                        state.userId = user.uid;
                        if (domElements.userIdDisplay) domElements.userIdDisplay.textContent = `User ID: ${state.userId.substring(0, 8)}...`;
                        resolve();
                    } else {
                        console.log("User is not signed in. Attempting to sign in...");
                        try {
                            if (config.initialAuthToken) {
                                await signInWithCustomToken(state.firebase.auth, config.initialAuthToken);
                            } else {
                                await signInAnonymously(state.firebase.auth);
                            }
                            // Note: onAuthStateChanged will be called again after successful sign-in
                        } catch (error) {
                            console.error("Error during sign-in:", error);
                            ui.showError("Firebase Authentication failed.", error.message);
                            if (domElements.userIdDisplay) domElements.userIdDisplay.textContent = "User ID: Not authenticated";
                            reject(error);
                        }
                    }
                }, (error) => {
                    console.error("Auth state listener error:", error);
                    ui.showError("Firebase Auth listener error.", error.message);
                    reject(error);
                });
            });
        } catch (error) {
            console.error("Error initializing Firebase:", error);
            ui.showError("Firebase initialization failed.", error.message);
            throw error; // Re-throw to be caught by the main init's try-catch
        }
    },

    /**
     * Fetches a collection from Firestore.
     * @param {string} collectionPath - The path to the Firestore collection.
     * @returns {Promise<Array<object>>} A promise that resolves with an array of documents.
     */
    async fetchCollection(collectionPath) {
        try {
            const collectionRef = collection(state.firebase.db, collectionPath); // Firebase SDK's collection
            const snapshot = await getDocs(collectionRef); // Firebase SDK's getDocs
            return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })); // docSnap instead of doc
        } catch (error) {
            console.error(`Error fetching collection ${collectionPath}:`, error);
            ui.showError(`Error fetching data for ${collectionPath}.`, error.message);
            return [];
        }
    },
    
    /**
     * Fetches all static game data (champions, synergies, legacy pieces).
     * @returns {Promise<void>}
     */
    async fetchGameData() {
        const dataRootPath = `artifacts/${config.appId}/public/data`;
        try {
            [state.dbChampions, state.dbSynergies, state.dbLegacyPieces] = await Promise.all([
                this.fetchCollection(`${dataRootPath}/champions`),
                this.fetchCollection(`${dataRootPath}/synergies`),
                this.fetchCollection(`${dataRootPath}/legacyPieces`),
            ]);
            // Post-processing
            state.dbChampions.forEach(c => c.isHealer = c.isHealer === true);
            state.dbSynergies.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        } catch (error) {
            console.error("Error fetching game data:", error);
            ui.showError("Could not load essential game data.", error.message);
            // Ensure arrays are initialized to prevent errors later
            state.dbChampions = state.dbChampions || [];
            state.dbSynergies = state.dbSynergies || [];
            state.dbLegacyPieces = state.dbLegacyPieces || [];
        }
    },

    /**
     * Loads the player's champion roster from Firestore.
     * @returns {Promise<void>}
     */
    async loadPlayerRoster() {
        if (!state.userId) return;
        try {
            const rosterDocRef = doc(state.firebase.db, `artifacts/${config.appId}/users/${state.userId}/roster/myRoster`); // Firebase SDK's doc
            const docSnap = await getDoc(rosterDocRef); // Firebase SDK's getDoc

            if (docSnap.exists() && Array.isArray(docSnap.data().champions)) {
                state.playerChampionRoster = docSnap.data().champions.map(savedChamp => {
                    const baseDetails = state.dbChampions.find(dbChamp => dbChamp.id === savedChamp.dbChampionId);
                    const loadedLegacyPiece = savedChamp.legacyPiece || { id: null, name: "None", rarity: "None", score: 0, starColorTier: "Unlocked" };
                    
                    const baseLpScore = config.LEGACY_PIECE_BASE_RARITY_SCORE[loadedLegacyPiece.rarity] || 0;
                    const lpStarBonus = config.LEGACY_PIECE_STAR_TIER_SCORE[loadedLegacyPiece.starColorTier] || 0;
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
                this.logAnalytics('roster_loaded', { roster_size: state.playerChampionRoster.length });
            } else {
                state.playerChampionRoster = [];
            }
        } catch (error) {
            console.error("Error loading player roster:", error);
            ui.showError("Error loading your saved roster.", error.message);
            state.playerChampionRoster = [];
        }
    },
    
    /**
     * Saves the player's current roster to Firestore.
     * @returns {Promise<void>}
     */
    async savePlayerRoster() {
        if (!state.userId) {
            ui.showToast("Error: User not authenticated. Cannot save roster.", "error");
            return;
        }
        if (domElements.saveRosterIndicator) domElements.saveRosterIndicator.classList.remove('hidden');
        if (domElements.addUpdateChampionBtn) domElements.addUpdateChampionBtn.disabled = true;

        const rosterToSave = state.playerChampionRoster.map(champ => {
            const legacyPiece = champ.legacyPiece || {};
            const baseLpScore = config.LEGACY_PIECE_BASE_RARITY_SCORE[legacyPiece.rarity] || 0;
            const lpStarBonus = config.LEGACY_PIECE_STAR_TIER_SCORE[legacyPiece.starColorTier] || 0;
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
            const rosterDocRef = doc(state.firebase.db, `artifacts/${config.appId}/users/${state.userId}/roster/myRoster`); // Firebase SDK's doc
            await setDoc(rosterDocRef, { champions: rosterToSave }); // Firebase SDK's setDoc
            ui.showToast("Roster saved successfully!", "success");
            this.logAnalytics('roster_saved', { roster_size: state.playerChampionRoster.length });
        } catch (error) {
            console.error("Error saving player roster:", error);
            ui.showToast("Failed to save your roster. Error: " + error.message, "error");
        } finally {
            if (domElements.saveRosterIndicator) domElements.saveRosterIndicator.classList.add('hidden');
            if (domElements.addUpdateChampionBtn) domElements.addUpdateChampionBtn.disabled = false;
        }
    },
    
    /**
     * Loads all saved teams for the current user from Firestore.
     * @returns {Promise<void>}
     */
    async loadSavedTeams() {
        if (!state.userId) return;
        try {
            const teamsCollectionRef = collection(state.firebase.db, `artifacts/${config.appId}/users/${state.userId}/savedTeams`); // Firebase SDK's collection
            const q = query(teamsCollectionRef, orderBy("createdAt", "desc")); // Firebase SDK's query, orderBy
            const snapshot = await getDocs(q); // Firebase SDK's getDocs
            state.savedTeams = snapshot.docs.map(docSnap => { // docSnap instead of doc
                const teamData = docSnap.data();
                const members = (teamData.members || []).map(member => ({
                    ...member,
                    legacyPiece: {
                        ...(member.legacyPiece || {}),
                        starColorTier: (member.legacyPiece && member.legacyPiece.starColorTier) ? member.legacyPiece.starColorTier : "Unlocked"
                    }
                }));
                return { id: docSnap.id, ...teamData, members };
            });
        } catch (error) {
            console.error("Error loading saved teams:", error);
            if (domElements.savedTeamsList) domElements.savedTeamsList.innerHTML = `<p class="text-red-500">Error loading saved teams.</p>`;
        }
    },

    /**
     * Saves a new team to Firestore.
     * @param {object} teamDataToSave - The team data object to be saved.
     * @returns {Promise<object|null>} The document reference if successful, null otherwise.
     */
    async saveNewTeam(teamDataToSave) {
        if (!state.userId) {
            ui.showToast("You must be signed in to save teams.", "error");
            return null;
        }
        try {
            const savedTeamsCollectionRef = collection(state.firebase.db, `artifacts/${config.appId}/users/${state.userId}/savedTeams`);
            const docRef = await addDoc(savedTeamsCollectionRef, { // Firebase SDK's addDoc
                ...teamDataToSave,
                createdAt: serverTimestamp() // Firebase SDK's serverTimestamp
            });
            this.logAnalytics('save_team', { team_name: teamDataToSave.name, team_score: Math.round(teamDataToSave.totalScore) });
            return docRef;
        } catch (error) {
            console.error("Error saving new team:", error);
            ui.showToast("Failed to save team. Error: " + error.message, "error");
            return null;
        }
    },

    /**
     * Updates an existing saved team in Firestore.
     * @param {string} teamId - The ID of the team to update.
     * @param {object} updates - An object containing the fields to update.
     * @returns {Promise<void>}
     */
    async updateSavedTeam(teamId, updates) {
        if (!state.userId) return;
        try {
            const teamDocRef = doc(state.firebase.db, `artifacts/${config.appId}/users/${state.userId}/savedTeams`, teamId);
            await updateDoc(teamDocRef, updates); // Firebase SDK's updateDoc
        } catch (error) {
            console.error("Error updating team:", error);
            ui.showToast("Failed to update team. Error: " + error.message, "error");
        }
    },

    /**
     * Deletes a saved team (both private and its public share if it exists).
     * @param {string} teamId - The ID of the private team to delete.
     * @param {string|null} publicShareId - The ID of the public share, if any.
     * @returns {Promise<void>}
     */
    async deleteCompleteSavedTeam(teamId, publicShareId) {
        if (!state.userId) return;
        try {
            if (publicShareId) {
                const publicTeamDocRef = doc(state.firebase.db, `artifacts/${config.appId}/public/data/sharedTeams`, publicShareId);
                await deleteDoc(publicTeamDocRef); // Firebase SDK's deleteDoc
            }
            const privateTeamDocRef = doc(state.firebase.db, `artifacts/${config.appId}/users/${state.userId}/savedTeams`, teamId);
            await deleteDoc(privateTeamDocRef);
        } catch (error) {
            console.error("Error deleting team:", error);
            ui.showToast("Failed to delete team. Error: " + error.message, "error");
        }
    },
    
    /**
     * Creates a public share document for a team.
     * @param {object} publicTeamData - The data for the public team document.
     * @returns {Promise<object|null>} The document reference of the created public share, or null on error.
     */
    async createPublicShare(publicTeamData) {
        try {
            const sharedTeamsCollectionRef = collection(state.firebase.db, `artifacts/${config.appId}/public/data/sharedTeams`);
            const docRef = await addDoc(sharedTeamsCollectionRef, {
                ...publicTeamData,
                createdAt: serverTimestamp(),
                originalOwnerId: state.userId 
            });
            return docRef;
        } catch (error) {
            console.error("Error creating public share:", error);
            ui.showToast("Failed to create public share. Error: " + error.message, "error");
            return null;
        }
    },

    /**
     * Deletes a public share document.
     * @param {string} publicShareId - The ID of the public share to delete.
     * @returns {Promise<void>}
     */
    async deletePublicShare(publicShareId) {
        try {
            const publicTeamDocRef = doc(state.firebase.db, `artifacts/${config.appId}/public/data/sharedTeams`, publicShareId);
            await deleteDoc(publicTeamDocRef);
        } catch (error) {
            console.error("Error deleting public share:", error);
            ui.showToast("Failed to remove public share. Error: " + error.message, "error");
        }
    },

    /**
     * Fetches a publicly shared team by its ID.
     * @param {string} sharedTeamId - The ID of the shared team.
     * @returns {Promise<object|null>} The shared team data if found, otherwise null.
     */
    async fetchSharedTeam(sharedTeamId) {
        try {
            const sharedTeamDocRef = doc(state.firebase.db, `artifacts/${config.appId}/public/data/sharedTeams`, sharedTeamId);
            const docSnap = await getDoc(sharedTeamDocRef);
            if (docSnap.exists()) {
                return docSnap.data();
            }
            return null;
        } catch (error) {
            console.error("Error fetching shared team:", error);
            ui.showError("Error loading shared team data.", error.message);
            return null;
        }
    },

    /**
     * Logs an event to Firebase Analytics.
     * @param {string} eventName - The name of the event to log.
     * @param {object} [eventParams={}] - Optional parameters for the event.
     */
    logAnalytics(eventName, eventParams = {}) {
        if (state.firebase.analytics) {
            logEvent(state.firebase.analytics, eventName, eventParams); // Firebase SDK's logEvent
        }
    }
};

//================================================================================
// 5. SCORE CALCULATOR
//================================================================================
/**
 * @module calculator
 * @description Contains pure functions for score calculations.
 */
const calculator = {
    /**
     * Calculates the total individual score for a single champion.
     * @param {object} champion - The champion object from the player's roster.
     * @returns {number} The calculated individual score.
     */
    getIndividualChampionScore(champion) {
        let score = 0;
        const baseScore = config.CHAMPION_BASE_RARITY_SCORE[champion.baseRarity] || 0;
        const starMultiplier = config.STAR_COLOR_TIERS[champion.starColorTier] || 1.0;
        
        score = baseScore * starMultiplier;

        if (champion.gear && typeof champion.gear === 'object') {
            Object.values(champion.gear).forEach(g => {
                // Ensure g.rarity is valid before accessing STANDARD_GEAR_RARITY_SCORE
                if (g && typeof g.rarity === 'string') {
                    score += config.STANDARD_GEAR_RARITY_SCORE[g.rarity] || 0;
                }
            });
        }

        if (champion.legacyPiece && champion.legacyPiece.id) {
            const lp = champion.legacyPiece;
            const baseLpScore = config.LEGACY_PIECE_BASE_RARITY_SCORE[lp.rarity] || 0;
            const lpStarBonus = config.LEGACY_PIECE_STAR_TIER_SCORE[lp.starColorTier] || 0;
            score += (baseLpScore + lpStarBonus);
        }
        return score;
    },
    
    /**
     * Recalculates the total score and breakdown for a given team of 5.
     * @param {Array<object>} teamMembers - An array of 5 champion objects.
     * @returns {object} An object containing the recalculated team details and score breakdown.
     */
    recalculateTeamScore(teamMembers) {
        const baseScoreSum = teamMembers.reduce((sum, member) => sum + (member.individualScore !== undefined ? member.individualScore : this.getIndividualChampionScore(member)), 0);
        
        let scoreAfterPercentageSynergies = baseScoreSum;
        let totalPercentageBonusValue = 0;
        let accumulatedBaseFlatBonus = 0;
        let accumulatedTieredFlatBonus = 0;
        const activeSynergies = [];

        const teamSynergyCounts = new Map();
        teamMembers.forEach(member => {
            (member.inherentSynergies || []).forEach(synergyName => {
                teamSynergyCounts.set(synergyName, (teamSynergyCounts.get(synergyName) || 0) + 1);
            });
        });

        const sortedSynergyDefs = [...state.dbSynergies].sort((a, b) => {
            if (a.bonusType === 'percentage' && b.bonusType !== 'percentage') return -1;
            if (a.bonusType !== 'percentage' && b.bonusType === 'percentage') return 1;
            return 0;
        });
        
        sortedSynergyDefs.forEach(synergyDef => {
            const memberCount = teamSynergyCounts.get(synergyDef.name) || 0;
            if (memberCount < config.SYNERGY_ACTIVATION_COUNT) return;

            let primaryBonusAppliedThisSynergy = 0;
            let tieredFlatBonusAppliedThisSynergy = 0;

            if (synergyDef.bonusValue !== undefined && synergyDef.bonusValue !== null) {
                if (synergyDef.bonusType === 'percentage') {
                    const bonus = scoreAfterPercentageSynergies * (synergyDef.bonusValue / 100);
                    totalPercentageBonusValue += bonus;
                    scoreAfterPercentageSynergies += bonus;
                    primaryBonusAppliedThisSynergy = synergyDef.bonusValue;
                } else if (synergyDef.bonusType === 'flat') {
                    accumulatedBaseFlatBonus += synergyDef.bonusValue;
                    primaryBonusAppliedThisSynergy = synergyDef.bonusValue;
                }
            }
            
            if (memberCount === 3) tieredFlatBonusAppliedThisSynergy = config.SYNERGY_COHESION_BASE * config.SYNERGY_COHESION_MULTIPLER;
            else if (memberCount === 4) tieredFlatBonusAppliedThisSynergy = config.SYNERGY_COHESION_BASE * config.SYNERGY_COHESION_MULTIPLER * 2.5;
            else if (memberCount >= 5) tieredFlatBonusAppliedThisSynergy = config.SYNERGY_COHESION_BASE * config.SYNERGY_COHESION_MULTIPLER * 5;
            accumulatedTieredFlatBonus += tieredFlatBonusAppliedThisSynergy;
            
            activeSynergies.push({
                name: synergyDef.name,
                bonusType: synergyDef.bonusType,
                primaryBonusApplied: primaryBonusAppliedThisSynergy,
                tieredFlatBonusApplied: tieredFlatBonusAppliedThisSynergy,
                description: synergyDef.description || '',
                appliedAtMemberCount: memberCount
            });
        });

        const totalFlatSynergyBonusComponent = accumulatedBaseFlatBonus + accumulatedTieredFlatBonus;
        const subtotalAfterSynergies = scoreAfterPercentageSynergies + totalFlatSynergyBonusComponent;
        const uniqueClasses = new Set(teamMembers.map(m => m.class).filter(c => c && c !== "N/A"));
        let classDiversityBonus = 0;
        let finalScore = subtotalAfterSynergies;
        let classDiversityBonusApplied = false;

        if (uniqueClasses.size >= 4) {
            classDiversityBonus = subtotalAfterSynergies * (config.CLASS_DIVERSITY_MULTIPLIER - 1);
            finalScore += classDiversityBonus;
            classDiversityBonusApplied = true;
        }

        return {
            members: teamMembers,
            totalScore: finalScore,
            activeSynergies,
            baseScoreSum,
            uniqueClassesCount: uniqueClasses.size,
            classDiversityBonusApplied,
            scoreBreakdown: {
                base: baseScoreSum,
                percentageSynergyBonus: totalPercentageBonusValue,
                flatSynergyBonus: totalFlatSynergyBonusComponent,
                subtotalAfterSynergies,
                classDiversityBonus,
            }
        };
    },
    
    /**
     * Generates all unique combinations of a given size from an array.
     * @param {Array<any>} array - The source array.
     * @param {number} k - The size of each combination.
     * @returns {Array<Array<any>>} An array of all possible combinations.
     */
    generateCombinations(array, k) {
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
    },

    /**
     * Finds the best team from the player's roster based on scoring rules.
     * @param {object} options - Calculation options.
     * @param {boolean} options.requireHealer - Whether the team must include a healer.
     * @param {Array<string>} options.exclusionTeamIds - Array of saved team IDs to exclude champions from.
     * @returns {object|null} The best team object or null if no team could be formed.
     */
    findBestTeam(options) {
        ui.updateProcessingStatus("Preparing roster...", 5);
        let roster = state.playerChampionRoster.map(champ => ({
            ...champ,
            individualScore: this.getIndividualChampionScore(champ)
        }));

        if (options.exclusionTeamIds && options.exclusionTeamIds.length > 0) {
            ui.updateProcessingStatus("Applying exclusions...", 10);
            const championsToExclude = new Set();
            options.exclusionTeamIds.forEach(teamId => {
                const team = state.savedTeams.find(st => st.id === teamId);
                if (team && team.members) team.members.forEach(member => championsToExclude.add(member.dbChampionId));
            });
            roster = roster.filter(champ => !championsToExclude.has(champ.dbChampionId));
        }

        if (roster.length < 5) {
             ui.showError("Not enough champions available after exclusions to form a team.");
             if (domElements.resultsOutput) domElements.resultsOutput.innerHTML = '<p class="text-red-500">After excluding champions, there are not enough remaining champions in your roster to form a team of 5.</p>';
             return null;
        }
        
        ui.updateProcessingStatus("Generating combinations...", 15);
        let combinations = [];
        if (options.requireHealer) {
            const healers = roster.filter(c => c.isHealer);
            if (healers.length === 0) {
                ui.showError("Cannot calculate: 'Require Healer' is checked, but no healers are available in the roster.");
                if (domElements.resultsOutput) domElements.resultsOutput.innerHTML = '<p class="text-red-500">No healers found in the available roster to meet the "Require Healer" criteria.</p>';
                return null;
            }
            const nonHealers = roster.filter(c => !c.isHealer);
            if (nonHealers.length < 4) {
                ui.showError("Cannot calculate: Not enough non-healers to form a team with a healer.");
                if (domElements.resultsOutput) domElements.resultsOutput.innerHTML = '<p class="text-red-500">Not enough other champions to form a team of 5 with a healer.</p>';
                return null;
            }
            healers.forEach(healer => {
                this.generateCombinations(nonHealers, 4).forEach(combo => {
                    combinations.push([healer, ...combo]);
                });
            });
        } else {
            combinations = this.generateCombinations(roster, 5);
        }
        
        if (combinations.length === 0) {
            ui.showError("Could not generate any valid teams with the current criteria.");
            if (domElements.resultsOutput) domElements.resultsOutput.innerHTML = '<p class="text-red-500">Could not generate any valid teams with the current criteria.</p>';
            return null;
        }
        
        const totalCombinations = combinations.length;
        ui.updateProcessingStatus(`Evaluating ${totalCombinations} teams...`, 20);
        
        let bestTeam = null;
        let maxScore = -1;
        const textUpdateInterval = Math.max(1, Math.floor(totalCombinations / 20));

        // Use a loop that allows for UI updates if processing is very long (though this is synchronous)
        for (let i = 0; i < totalCombinations; i++) {
            const team = combinations[i];
            const evaluationProgress = Math.round(((i + 1) / totalCombinations) * 75);
            const currentOverallProgress = 20 + evaluationProgress;

            if (i % textUpdateInterval === 0 || i === totalCombinations - 1) {
                ui.updateProcessingStatus(`Evaluating team ${i + 1} of ${totalCombinations}...`, currentOverallProgress);
            } else {
                if (domElements.progressBarInner) domElements.progressBarInner.style.width = `${currentOverallProgress}%`;
            }
            
            const calculatedTeam = this.recalculateTeamScore(team);
            if (calculatedTeam.totalScore > maxScore) {
                maxScore = calculatedTeam.totalScore;
                bestTeam = calculatedTeam;
            }
        }
        
        ui.updateProcessingStatus("Finalizing results...", 98);
        return bestTeam;
    }
};

//================================================================================
// 6. UI / VIEW RENDERER
//================================================================================
/**
 * @module ui
 * @description Handles all DOM manipulations, rendering, and UI feedback.
 */
const ui = {
   /**
     * Shows or hides the main loading indicator.
     * @param {boolean} isLoading - True to show, false to hide.
     */
    showLoading(isLoading) {
        if (domElements.loadingIndicator) domElements.loadingIndicator.classList.toggle('hidden', !isLoading);
    },

    /**
     * Displays an error message in the UI.
     * @param {string|false} message - The error message to display, or false to hide the indicator.
     * @param {string} [details=""] - Additional details for the error.
     */
    showError(message, details = "") {
        if (domElements.loadingIndicator) domElements.loadingIndicator.classList.add('hidden');
        if (domElements.errorIndicator) domElements.errorIndicator.classList.toggle('hidden', !message);
        if (message && domElements.errorIndicator) {
            const pTag = domElements.errorIndicator.querySelector('p');
            if (pTag) pTag.textContent = message;
            if (domElements.errorMessageDetails) domElements.errorMessageDetails.textContent = details;
            this.showToast(message, 'error');
        }
    },

    /**
     * Displays a temporary toast message.
     * @param {string} message - The message to show.
     * @param {'info'|'success'|'warning'|'error'} [type='info'] - The type of toast.
     * @param {number} [duration=3000] - How long the toast stays visible in milliseconds.
     */
    showToast(message, type = 'info', duration = 3000) {
        if (!domElements.toastContainer) return;
        const toast = document.createElement('div');
        const typeClasses = {
            success: 'bg-green-500', error: 'bg-red-500',
            warning: 'bg-yellow-500 text-black', info: 'bg-blue-500'
        };
        toast.className = `toast mb-3 p-3 rounded-lg shadow-lg text-sm text-white flex justify-between items-center ${typeClasses[type] || typeClasses.info}`;
        
        const messageSpan = document.createElement('span');
        messageSpan.textContent = message;
        toast.appendChild(messageSpan);

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.className = 'ml-2 text-lg font-semibold leading-none focus:outline-none';
        closeBtn.onclick = () => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300); // Shorter removal for quicker UI response
        };
        toast.appendChild(closeBtn);
        
        domElements.toastContainer.appendChild(toast);
        
        // Trigger reflow for animation
        toast.offsetHeight; 
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';


        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },
    
    /**
     * Populates a select dropdown with star/color tier options.
     * @param {HTMLSelectElement} selectElement - The select DOM element.
     * @param {object} tiersObject - The object containing tier names and values.
     * @param {string} [defaultTier="Unlocked"] - The default tier to select.
     */
    populateStarColorOptions(selectElement, tiersObject, defaultTier = "Unlocked") {
        if (!selectElement) return;
        selectElement.innerHTML = '';
        Object.keys(tiersObject).forEach(tier => {
            const option = document.createElement('option');
            option.value = tier;
            option.textContent = tier;
            selectElement.appendChild(option);
        });
        selectElement.value = tiersObject.hasOwnProperty(defaultTier) ? defaultTier : (Object.keys(tiersObject)[0] || '');
    },

    /**
     * Populates gear rarity select dropdowns.
     */
    populateGearRarityOptions() {
        document.querySelectorAll('.gear-rarity-select').forEach(selectEl => {
            selectEl.innerHTML = ''; // Clear existing options
            config.STANDARD_GEAR_RARITIES.forEach(rarity => {
                const option = document.createElement('option');
                option.value = rarity;
                option.textContent = rarity;
                selectEl.appendChild(option);
            });
            selectEl.value = config.STANDARD_GEAR_RARITIES[0]; // Default to "None"
        });
    },
    
    /**
     * Renders the list of available synergies based on the current player roster.
     */
    renderAvailableSynergies() {
        if (!domElements.synergiesList) return;
        domElements.synergiesList.innerHTML = '';

        if (state.dbSynergies.length === 0) {
            domElements.synergiesList.innerHTML = '<p class="text-sm text-gray-500 col-span-full">No synergies defined.</p>';
            return;
        }

        state.dbSynergies.forEach(synergyDef => {
            const container = document.createElement('div');
            container.className = 'synergy-item-container border rounded-lg p-3 bg-slate-50 mb-3 shadow-sm';
            
            const count = state.playerChampionRoster.filter(champ => (champ.inherentSynergies || []).includes(synergyDef.name)).length;
            const header = document.createElement('div');
            header.className = 'synergy-item-header flex items-center justify-between hover:bg-slate-100 p-2 rounded-md -m-2 mb-1 cursor-default';
            header.dataset.synergyName = synergyDef.name;

            const factionIconName = synergyDef.name.trim().replace(/\s+/g, '_');
            const fallbackSpan = `<span class="icon-placeholder" style="display:none;">[${synergyDef.name}]</span>`;
            header.innerHTML = `
                <div class="flex items-center flex-grow">
                    <span class="icon-wrapper mr-2">
                        <img src="img/factions/${factionIconName}.png" alt="${synergyDef.name}" title="${synergyDef.name}" class="w-6 h-6 object-contain" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">
                        ${fallbackSpan}
                    </span>
                    <span class="synergy-name">${synergyDef.name}</span>
                </div>
                <span class="synergy-progress">${count}/${config.SYNERGY_ACTIVATION_COUNT}</span>
            `;
            container.appendChild(header);

            const contributingChamps = state.playerChampionRoster.filter(c => (c.inherentSynergies || []).includes(synergyDef.name));
            if (contributingChamps.length > 0) {
                const champsListDiv = document.createElement('div');
                champsListDiv.className = 'mt-2 pl-4 border-l-2 border-slate-200 space-y-1 synergy-champions-list';
                contributingChamps.forEach(champ => {
                    const champDiv = document.createElement('div');
                    champDiv.className = 'synergy-champion-entry flex items-center text-xs text-slate-600 py-1';
                    const classIconHtml = this.getClassPlaceholder(champ.class, 'result-icon w-4 h-4 mr-1');
                    const starHtml = this.getStarRatingHTML(champ.starColorTier, '0.9em');
                    
                    let champSynergiesHtml = '<div class="champion-synergies flex gap-0.5 ml-auto">';
                    (champ.inherentSynergies || []).forEach(syn => {
                        if (syn !== synergyDef.name) {
                            const synIconName = syn.trim().replace(/\s+/g, '_');
                            champSynergiesHtml += `<span class="icon-wrapper"><img src="img/factions/${synIconName}.png" alt="${syn}" title="${syn}" class="result-icon w-3 h-3" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';"><span class="icon-placeholder text-xs" style="display:none;">[${syn}]</span></span>`;
                        }
                    });
                    champSynergiesHtml += `</div>`;

                    champDiv.innerHTML = `${classIconHtml} <span class="font-medium text-slate-700">${champ.name}</span> <span class="star-rating star-rating-sm ml-2">${starHtml}</span> ${champSynergiesHtml}`;
                    champsListDiv.appendChild(champDiv);
                });
                container.appendChild(champsListDiv);
            } else {
                container.innerHTML += '<p class="text-xs text-slate-500 mt-1 pl-4">No champions in roster with this synergy.</p>';
            }
            domElements.synergiesList.appendChild(container);
        });
    },
    
    /**
     * Populates the main champion select dropdown.
     * Filters out champions already in the roster unless editing that specific champion.
     */
    populateChampionSelect() {
        if (!domElements.champSelectDb) return;
        const currentSelectedValue = state.editingChampionId 
            ? state.playerChampionRoster.find(c => c.id === state.editingChampionId)?.dbChampionId 
            : domElements.champSelectDb.value;
        
        domElements.champSelectDb.innerHTML = '<option value="">-- Select Champion --</option>';
        if (state.dbChampions.length === 0) return;

        const rosteredDbIds = new Set(state.playerChampionRoster.map(rc => rc.dbChampionId));
        const availableChampions = state.dbChampions
            .filter(dbChamp => !rosteredDbIds.has(dbChamp.id) || (state.editingChampionId && dbChamp.id === currentSelectedValue))
            .sort((a, b) => (a.name || "Z").localeCompare(b.name || "Z"));

        availableChampions.forEach(champ => {
            if (!champ.id || !champ.name) return;
            const option = document.createElement('option');
            option.value = champ.id;
            option.textContent = champ.name;
            domElements.champSelectDb.appendChild(option);
        });

        if (availableChampions.some(c => c.id === currentSelectedValue)) {
            domElements.champSelectDb.value = currentSelectedValue;
        }
        // Trigger change to update dependent fields if a value is set
        if (domElements.champSelectDb.value) {
             domElements.champSelectDb.dispatchEvent(new Event('change'));
        } else {
             eventHandlers.handleChampionSelectChange(); // Manually call if no value selected
        }
    },

    /**
     * Populates the legacy piece select dropdown, optionally filtered by champion class.
     * @param {string|null} [championClass=null] - The class of the currently selected champion.
     */
    populateLegacyPieceSelect(championClass = null) {
        if (!domElements.legacyPieceSelect) return;
        const currentSelectedId = domElements.legacyPieceSelect.value;
        domElements.legacyPieceSelect.innerHTML = '<option value="">-- None --</option>';
        if (state.dbLegacyPieces.length === 0) return;

        let filtered = state.dbLegacyPieces;
        if (championClass && championClass !== "N/A") {
            const lowerClass = championClass.toLowerCase();
            filtered = state.dbLegacyPieces.filter(lp => {
                const desc = (lp.description || "").toLowerCase();
                return desc === "" || desc.includes(lowerClass); // Empty description means universal
            });
        } else { // No class or N/A class, only show universal LPs
             filtered = state.dbLegacyPieces.filter(lp => (lp.description || "") === "");
        }
        
        const sorted = [...filtered].sort((a, b) => (a.name || "Z").localeCompare(b.name || "Z"));
        sorted.forEach(lp => {
            if (!lp.id || !lp.name || !lp.baseRarity) return;
            const option = document.createElement('option');
            option.value = lp.id;
            option.textContent = `${lp.name} (${lp.baseRarity})`;
            domElements.legacyPieceSelect.appendChild(option);
        });

        if (sorted.some(lp => lp.id === currentSelectedId)) {
            domElements.legacyPieceSelect.value = currentSelectedId;
        }
    },
    
    /**
     * Resets the champion input form to its default state.
     */
    resetChampionForm() {
        if (domElements.champSelectDb) {
            domElements.champSelectDb.value = "";
            domElements.champSelectDb.disabled = false;
        }
        if (domElements.champBaseRarityDisplay) domElements.champBaseRarityDisplay.value = "";
        if (domElements.champClassDisplay) domElements.champClassDisplay.value = "";
        if (domElements.champHealerStatusDisplay) domElements.champHealerStatusDisplay.value = "";
        state.currentSelectedChampionClass = null;
        
        this.populateStarColorOptions(domElements.champStarColor, config.STAR_COLOR_TIERS, "Unlocked");
        this.populateStarColorOptions(domElements.legacyPieceStarColor, config.LEGACY_PIECE_STAR_TIER_SCORE, "Unlocked");

        if (domElements.champInherentSynergiesDisplay) domElements.champInherentSynergiesDisplay.textContent = 'Select a base champion.';
        Object.values(domElements.gearSelects).forEach(sel => { if (sel) sel.value = config.STANDARD_GEAR_RARITIES[0]; });
        if (domElements.legacyPieceSelect) domElements.legacyPieceSelect.value = "";
        this.populateLegacyPieceSelect(null);
        
        if (domElements.addUpdateChampionBtn) domElements.addUpdateChampionBtn.innerHTML = `<span class="btn-icon">${config.ICONS.ADD}</span> <span class="btn-text">Add Champion</span>`;
        if (domElements.formModeTitle) domElements.formModeTitle.textContent = "Add Champion to Roster";
        if (domElements.cancelEditBtn) domElements.cancelEditBtn.classList.add('hidden');
        this.populateChampionSelect(); // Refresh available champions
    },

    /**
     * Renders the player's champion roster into a DataTable (if available) or a simple table.
     */
    renderPlayerChampionRoster() {
        if (!domElements.championsRosterTableWrapper) return;

        if (state.rosterDataTable) {
            state.rosterDataTable.destroy();
            state.rosterDataTable = null;
        }
        domElements.championsRosterTableWrapper.innerHTML = '';

        if (state.playerChampionRoster.length === 0) {
            domElements.championsRosterTableWrapper.innerHTML = '<p class="text-sm text-gray-500">No champions in roster.</p>';
            if(domElements.prefillRosterBtn) domElements.prefillRosterBtn.classList.remove('hidden');
            this.renderAvailableSynergies();
            return;
        }
        
        if(domElements.prefillRosterBtn) domElements.prefillRosterBtn.classList.add('hidden');
        const table = document.createElement('table');
        table.id = 'rosterTable';
        table.className = 'display min-w-full';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Name</th><th>Rarity</th><th>Class</th>
                    <th class="dt-column-score">Ind. Score</th>
                    <th>Star/Color</th><th>Legacy Piece</th><th>Actions</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        const tbody = table.querySelector('tbody');
        state.playerChampionRoster.forEach(champ => {
            const tr = tbody.insertRow();
            const indScore = Math.round(calculator.getIndividualChampionScore(champ));
            let lpDisplay = "None";
            let lpSortScore = 0;
            if (champ.legacyPiece && champ.legacyPiece.id) {
                lpDisplay = `${champ.legacyPiece.name} (${champ.legacyPiece.rarity})`;
                const lpStarTier = champ.legacyPiece.starColorTier || "Unlocked";
                if (lpStarTier !== "Unlocked") {
                    lpDisplay += ` <span class="text-xs whitespace-nowrap">${this.getStarRatingHTML(lpStarTier, '0.8em')}</span>`;
                }
                lpSortScore = champ.legacyPiece.score || 0;
            }

            tr.innerHTML = `
                <td data-sort="${champ.name}"><div class="flex items-center">${champ.isHealer ? this.getHealerPlaceholder('icon-class-table mr-1') : ''}${champ.name}</div></td>
                <td data-sort="${config.CHAMPION_BASE_RARITY_SCORE[champ.baseRarity] || 0}">${champ.baseRarity}</td>
                <td data-sort="${champ.class || 'N/A'}">${this.getClassPlaceholder(champ.class)}</td>
                <td class="dt-column-score text-right" data-sort="${indScore}">${indScore}</td>
                <td data-sort="${config.STAR_COLOR_TIERS[champ.starColorTier] || 0}">${this.getStarRatingHTML(champ.starColorTier)}</td>
                <td data-sort="${lpSortScore}">${lpDisplay}</td>
                <td>
                    <button class="btn btn-sm btn-warning text-xs mr-1" data-action="edit" data-champion-id="${champ.id}"><span class="btn-icon">${config.ICONS.EDIT}</span> Edit</button>
                    <button class="btn btn-sm btn-danger text-xs" data-action="delete" data-champion-id="${champ.id}"><span class="btn-icon">${config.ICONS.DELETE}</span> Del</button>
                </td>
            `;
        });
        domElements.championsRosterTableWrapper.appendChild(table);

        if (typeof $ !== 'undefined' && $.fn.DataTable) {
            state.rosterDataTable = new $('#rosterTable').DataTable({
                responsive: true,
                columnDefs: [
                    { targets: [0, 1, 2, 4, 5, 6], type: "string" },
                    { targets: 3, type: "num", className: "dt-column-score text-right" }
                ],
                order: [[3, "desc"]]
            });
            state.rosterDataTable.column('.dt-column-score').visible(state.scoreColumnVisible);
            if (domElements.toggleScoreColumnCheckbox) domElements.toggleScoreColumnCheckbox.checked = state.scoreColumnVisible;
        }
        this.renderAvailableSynergies();
    },

    /**
     * Generates HTML for star rating display.
     * @param {string} starColorTier - The star/color tier string (e.g., "Red 5-Star").
     * @param {string} [fontSize='1em'] - Optional font size for the stars.
     * @returns {string} HTML string for the star rating.
     */
    getStarRatingHTML(starColorTier, fontSize = '1em') {
        if (!starColorTier || starColorTier === "Unlocked") return '<span class="unlocked-tier-text text-xs">Unlocked</span>';
        
        const parts = starColorTier.match(/(\w+)\s*(\d+)-Star/);
        if (!parts || parts.length < 3) return `<span class="unlocked-tier-text text-xs">${starColorTier}</span>`;

        const colorName = parts[1].toLowerCase();
        const starCount = parseInt(parts[2], 10);
        const colors = { red: 'text-red-500', gold: 'text-yellow-400', purple: 'text-purple-500', blue: 'text-blue-500', white: 'text-slate-400' };
        const colorClass = colors[colorName] || 'text-gray-500';

        let starsHTML = `<div class="star-rating inline-block" title="${starColorTier}" style="font-size:${fontSize}; line-height:1;">`;
        for (let i = 0; i < starCount; i++) starsHTML += `<span class="${colorClass}">★</span>`;
        starsHTML += `</div>`;
        return starsHTML;
    },

    /**
     * Gets HTML for a healer icon placeholder.
     * @param {string} [customClasses="icon-class-table"] - Custom CSS classes for the image.
     * @returns {string} HTML string for the healer icon.
     */
    getHealerPlaceholder(customClasses = "icon-class-table") {
        const fallback = `<span class="icon-placeholder" style="display:none;">[H]</span>`;
        return `<span class="icon-wrapper"><img src="img/classes/Healer.png" alt="Healer" title="Healer" class="${customClasses}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">${fallback}</span>`;
    },

    /**
     * Gets HTML for a class icon placeholder.
     * @param {string} className - The name of the class.
     * @param {string} [customClasses="icon-class-table"] - Custom CSS classes for the image.
     * @returns {string} HTML string for the class icon.
     */
    getClassPlaceholder(className, customClasses = "icon-class-table") {
        const cn = (className || "N/A").trim().replace(/\s+/g, '_');
        if (cn === "N/A" || cn === "") return `<span class="icon-placeholder text-xs">[N/A]</span>`;
        const fallback = `<span class="icon-placeholder" style="display:none;">[${cn.replace(/_/g, ' ')}]</span>`;
        return `<span class="icon-wrapper"><img src="img/classes/${cn}.png" alt="${cn.replace(/_/g, ' ')}" title="${cn.replace(/_/g, ' ')}" class="${customClasses}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">${fallback}</span>`;
    },
    
    /**
     * Opens or closes the processing modal.
     * @param {boolean} show - True to show, false to hide.
     */
    toggleProcessingModal(show) {
        if (!domElements.processingModal) return;
        domElements.processingModal.classList.toggle('hidden', !show);
        domElements.processingModal.classList.toggle('active', show);
        if (show) this.updateProcessingStatus("Initializing...", 0);
    },

    /**
     * Updates the status text and progress bar in the processing modal.
     * @param {string} statusText - The text to display.
     * @param {number} progressPercentage - The progress percentage (0-100).
     */
    updateProcessingStatus(statusText, progressPercentage) {
        if (domElements.processingStatusText) domElements.processingStatusText.textContent = statusText;
        if (domElements.progressBarInner) domElements.progressBarInner.style.width = `${progressPercentage}%`;
    },
    
    /**
     * Displays the calculated team results in the UI.
     * @param {object} teamToDisplay - The team object with members and score breakdown.
     */
    displayResults(teamToDisplay) {
        if (!domElements.resultsOutput || !teamToDisplay || !teamToDisplay.scoreBreakdown) {
            if (domElements.resultsOutput) domElements.resultsOutput.innerHTML = '<p class="text-red-500">No optimal team determined or score data missing.</p>';
            state.currentBestTeamForSaving = null;
            state.originalBestTeam = null;
            state.currentDisplayedTeam = null;
            return;
        }
        
        state.originalBestTeam = JSON.parse(JSON.stringify(teamToDisplay)); 
        state.currentDisplayedTeam = JSON.parse(JSON.stringify(teamToDisplay)); 
        state.currentBestTeamForSaving = JSON.parse(JSON.stringify(teamToDisplay));

        const htmlString = this._renderTeamDisplay(state.currentDisplayedTeam, true); // true for modifiable
        domElements.resultsOutput.innerHTML = htmlString;

        // Bind events for Save and Reset buttons AFTER they are in the DOM
        const saveBtn = domElements.resultsOutput.querySelector('#save-team-btn');
        if (saveBtn) saveBtn.addEventListener('click', eventHandlers.handleSaveCurrentBestTeam);
        
        const resetBtn = domElements.resultsOutput.querySelector('#reset-team-btn');
        if (resetBtn) resetBtn.addEventListener('click', eventHandlers.handleResetTeamDisplay);
    },

    /**
     * Internal helper to generate the team display HTML string.
     * @param {object} teamObject - The team object to render.
     * @param {boolean} isModifiable - Whether modification buttons should be shown.
     * @returns {string} The HTML string for the team display.
     * @private
     */
    _renderTeamDisplay(teamObject, isModifiable) {
        // This function now returns HTML string instead of directly manipulating DOM
        if (!teamObject || !teamObject.scoreBreakdown) return '<p class="text-red-500">Error rendering team: Invalid team data.</p>';

        const breakdown = teamObject.scoreBreakdown;
        let html = `<h3 class="text-xl font-semibold text-indigo-700 mb-3">Optimal Team ${isModifiable && state.originalBestTeam && JSON.stringify(teamObject.members.map(m=>m.id)) !== JSON.stringify(state.originalBestTeam.members.map(m=>m.id)) ? '(Modified)' : ''}</h3>`;
        
        html += `<div class="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
                    <h4 class="text-md font-semibold text-indigo-600 mb-2">Score Calculation:</h4>
                    <p>Base Individual Scores Sum: <strong class="float-right">${Math.round(breakdown.base)}</strong></p>`;
        if (breakdown.percentageSynergyBonus > 0) html += `<p>Total Percentage Synergy Bonus: <strong class="text-green-600 float-right">+${Math.round(breakdown.percentageSynergyBonus)}</strong></p>`;
        if (breakdown.flatSynergyBonus > 0) html += `<p>Total Flat Synergy Bonuses: <strong class="text-green-600 float-right">+${Math.round(breakdown.flatSynergyBonus)}</strong></p>`;
        html += `<p class="border-t border-indigo-200 pt-1 mt-1">Subtotal After Synergies: <strong class="float-right">${Math.round(breakdown.subtotalAfterSynergies)}</strong></p>`;
        if (teamObject.classDiversityBonusApplied) html += `<p>Class Diversity Bonus (x${config.CLASS_DIVERSITY_MULTIPLIER}): <strong class="text-green-600 float-right">+${Math.round(breakdown.classDiversityBonus)}</strong></p>`;
        html += `<p class="border-t border-indigo-200 pt-1 mt-1 font-bold text-indigo-700">Final Team Score: <strong class="float-right">${Math.round(teamObject.totalScore)}</strong></p></div>`;

        html += `<h4 class="text-md font-semibold text-gray-700 mt-3 mb-1">Score Contribution:</h4>
                 <div class="score-chart-container mb-2">`;
        const totalScoreForChart = teamObject.totalScore > 0 ? teamObject.totalScore : 1;
        const chartSegments = [
            { value: breakdown.base, color: 'bg-blue-500', title: `Base: ${Math.round(breakdown.base)}`, label: 'Base' },
            { value: breakdown.percentageSynergyBonus, color: 'bg-green-500', title: `Perc. Syn.: +${Math.round(breakdown.percentageSynergyBonus)}`, label: '% Syn.' },
            { value: breakdown.flatSynergyBonus, color: 'bg-teal-500', title: `Flat Syn.: +${Math.round(breakdown.flatSynergyBonus)}`, label: 'Flat Syn.' },
            { value: breakdown.classDiversityBonus, color: 'bg-purple-500', title: `Class Div.: +${Math.round(breakdown.classDiversityBonus)}`, label: 'Class Div.' }
        ];
        let legendHtml = '<div class="flex flex-wrap justify-around mb-4 text-xs">';
        chartSegments.forEach(seg => {
            if (seg.value > 0) {
                const pct = (seg.value / totalScoreForChart) * 100;
                html += `<div class="score-chart-segment ${seg.color}" style="width:${pct.toFixed(1)}%;" title="${seg.title}"></div>`;
                legendHtml += `<span class="score-chart-segment-label mx-1"><span class="inline-block w-2 h-2 ${seg.color} rounded-sm mr-1"></span>${seg.label}</span>`;
            }
        });
        html += `</div>`;
        legendHtml += `</div>`;
        html += legendHtml;
        
        html += `<p class="mb-2 text-sm"><strong class="text-gray-700">Unique Classes:</strong> ${teamObject.uniqueClassesCount} (${teamObject.members.map(m=>m.class || 'N/A').filter((v,i,a)=>a.indexOf(v)===i && v !== "N/A").join(', ') || 'None'})</p>`;
        html += `<p class="mb-4 text-sm"><strong class="text-gray-700">Healer:</strong> <span class="${teamObject.members.some(m => m.isHealer) ? 'text-green-600 font-semibold' : 'text-red-600'}">${teamObject.members.some(m => m.isHealer) ? 'Yes' : 'No'}</span></p>`;
        
        html += `<h4 class="text-lg font-medium text-gray-700 mt-4 mb-2">Team Members:</h4>
                 <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">`;
        teamObject.members.forEach((member, index) => {
            html += `<div class="p-3 border rounded-lg shadow-md bg-slate-50 flex flex-col justify-between champion-card">
                        <div>
                            <div class="flex items-center mb-2">
                                ${this.getClassPlaceholder(member.class, 'result-icon class-icon mr-2')}
                                <strong class="text-sm text-slate-800 leading-tight">${member.name}</strong>
                                ${member.isHealer ? this.getHealerPlaceholder('result-icon class-icon ml-1') : ''}
                            </div>
                            <div class="text-xs text-slate-600 mb-2">
                                <p>Tier: ${this.getStarRatingHTML(member.starColorTier, '0.9em')}</p>
                                <p>Ind. Score: ${Math.round(member.individualScore)}</p>`;
            if (member.legacyPiece && member.legacyPiece.id) {
                html += `<p>Legacy: ${member.legacyPiece.name} (${member.legacyPiece.rarity})`;
                if (member.legacyPiece.starColorTier && member.legacyPiece.starColorTier !== "Unlocked") {
                    html += ` <span class="whitespace-nowrap">${this.getStarRatingHTML(member.legacyPiece.starColorTier, '0.8em')}</span>`;
                }
                html += `</p>`;
            }
            html += `       </div>`;
            if (member.inherentSynergies && member.inherentSynergies.length > 0) {
                html += `<div class="mt-1"><p class="text-xs font-semibold text-slate-500 mb-1">Synergies:</p><div class="flex flex-wrap gap-1">`;
                member.inherentSynergies.forEach(synergy => {
                    const synIconName = synergy.trim().replace(/\s+/g, '_');
                    html += `<span class="icon-wrapper"><img src="img/factions/${synIconName}.png" alt="${synergy}" title="${synergy}" class="result-icon w-5 h-5" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';"><span class="icon-placeholder text-xs" style="display:none;">[${synergy}]</span></span>`;
                });
                html += `</div></div>`;
            }
            html += `   </div>
                        ${isModifiable ? `<button class="btn btn-sm btn-info btn-outline mt-2 w-full" data-action="swap-champion" data-index="${index}"><span class="btn-icon">${config.ICONS.SWAP}</span> Swap</button>` : ''}
                    </div>`;
        });
        html += `</div>`;

        if (teamObject.activeSynergies.length > 0) {
            html += `<h4 class="text-lg font-medium text-gray-700 mt-6 mb-2">Active Team Synergies:</h4><ul class="list-disc list-inside space-y-1 text-sm">`;
            teamObject.activeSynergies.forEach(synergy => {
                let bonusDisplay = "";
                if (synergy.bonusType === 'percentage' && synergy.primaryBonusApplied !== 0) bonusDisplay += `${synergy.primaryBonusApplied}% (base)`;
                else if (synergy.bonusType === 'flat' && synergy.primaryBonusApplied !== 0) bonusDisplay += `+${synergy.primaryBonusApplied} flat (base)`;
                if (synergy.tieredFlatBonusApplied > 0) bonusDisplay += `${bonusDisplay.length > 0 ? " & " : ""}+${synergy.tieredFlatBonusApplied} flat (tier)`;
                html += `<li><strong>${synergy.name}</strong> (${synergy.appliedAtMemberCount} members): ${bonusDisplay || 'N/A'}. ${synergy.description ? `(${synergy.description})` : ''}</li>`;
            });
            html += `</ul>`;
        } else {
            html += `<p class="text-gray-600 mt-6">No active team synergies.</p>`;
        }
        
        if (isModifiable) {
            html += `<div class="mt-6 flex gap-2">
                        <button id="save-team-btn" class="btn btn-success"><span class="btn-icon">${config.ICONS.SAVE}</span> Save Team</button>`;
            if (state.originalBestTeam && JSON.stringify(teamObject.members.map(m=>m.id)) !== JSON.stringify(state.originalBestTeam.members.map(m=>m.id))) {
                html += `<button id="reset-team-btn" class="btn btn-outline btn-info"><span class="btn-icon">${config.ICONS.RESET}</span> Reset</button>`;
            }
            html += `</div>`;
        }
        return html;
    },

    /**
     * Toggles a modal's visibility.
     * @param {HTMLElement} modalEl - The modal element.
     * @param {boolean} show - True to show, false to hide.
     */
    toggleModal(modalEl, show) {
        if (!modalEl) return;
        modalEl.classList.toggle('hidden', !show);
        modalEl.classList.toggle('active', show);
    },

    /**
     * Opens the team name input modal.
     * @param {string} [currentName=''] - The current name to prefill.
     * @param {string} [title='Enter Team Name'] - The modal title.
     * @param {function} callback - Function to call with the entered name on save.
     */
    openTeamNameModal(currentName = '', title = 'Enter Team Name', callback) {
        if (!domElements.teamNameModal || !domElements.teamNameModalTitle || !domElements.teamNameInput) return;
        domElements.teamNameModalTitle.textContent = title;
        domElements.teamNameInput.value = currentName;
        state.modalCallbacks.teamName = callback;
        this.toggleModal(domElements.teamNameModal, true);
        domElements.teamNameInput.focus();
    },

    /**
     * Opens the confirmation modal.
     * @param {string} message - The confirmation message.
     * @param {function} onConfirm - Callback if confirmed.
     * @param {function|null} [onCancel=null] - Callback if cancelled.
     * @param {string} [title='Confirm Action'] - The modal title.
     */
    openConfirmModal(message, onConfirm, onCancel = null, title = "Confirm Action") {
        if (!domElements.confirmModal || !domElements.confirmModalMessage || !domElements.confirmModalTitle) {
            if (confirm(message)) { 
                if (onConfirm) onConfirm();
            } else {
                if (onCancel) onCancel();
            }
            return;
        }
        domElements.confirmModalTitle.textContent = title;
        domElements.confirmModalMessage.textContent = message;
        state.modalCallbacks.confirm = onConfirm;
        state.modalCallbacks.cancel = onCancel;
        this.toggleModal(domElements.confirmModal, true);
    },
    
    /**
     * Renders the list of saved teams.
     */
    renderSavedTeams() {
        if (!domElements.savedTeamsList || !domElements.selectExclusionTeamDropdown) return;
        domElements.savedTeamsList.innerHTML = '';
        domElements.selectExclusionTeamDropdown.innerHTML = '';

        if (state.savedTeams.length === 0) {
            domElements.savedTeamsList.innerHTML = '<p class="text-sm text-gray-500">No teams saved yet.</p>';
            return;
        }

        state.savedTeams.forEach(team => {
            const container = document.createElement('div');
            container.className = 'p-4 border rounded-lg bg-white shadow-lg mb-6';
            
            const shareButtonHtml = team.publicShareId
                ? `<button class="btn btn-sm btn-info text-xs" data-action="unshare-team" data-team-id="${team.id}" data-share-id="${team.publicShareId}"><span class="btn-icon">${config.ICONS.UNSHARE}</span> Unshare</button>`
                : `<button class="btn btn-sm btn-success text-xs" data-action="share-team" data-team-id="${team.id}"><span class="btn-icon">${config.ICONS.SHARE}</span> Share</button>`;

            container.innerHTML = `
                <div class="flex justify-between items-center mb-3 pb-2 border-b border-gray-200">
                    <div>
                        <h4 class="font-semibold text-lg text-indigo-700">${team.name}</h4>
                        <p class="text-sm text-gray-600">Score: <strong class="text-pink-600">${Math.round(team.totalScore)}</strong></p>
                        ${team.publicShareId ? `<p class="text-xs text-blue-500 mt-1">Shared (ID: ${team.publicShareId.substring(0,6)}...)</p>` : ''}
                    </div>
                    <div class="flex-shrink-0 space-x-1">
                        ${shareButtonHtml}
                        <button class="btn btn-sm btn-warning text-xs" data-action="rename-team" data-team-id="${team.id}" data-current-name="${team.name.replace(/"/g, "&quot;")}"><span class="btn-icon">${config.ICONS.EDIT}</span> Rename</button>
                        <button class="btn btn-sm btn-danger text-xs" data-action="delete-team" data-team-id="${team.id}"><span class="btn-icon">${config.ICONS.DELETE}</span> Delete</button>
                    </div>
                </div>
            `;
            
            const membersGrid = document.createElement('div');
            membersGrid.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3';
            if (team.members && Array.isArray(team.members)) {
                team.members.forEach(member => {
                    const indScore = member.individualScore !== undefined ? member.individualScore : calculator.getIndividualChampionScore(member);
                    membersGrid.innerHTML += `
                        <div class="p-3 border rounded-lg shadow-md bg-slate-50 flex flex-col justify-between">
                            <div>
                                <div class="flex items-center mb-2">
                                    ${this.getClassPlaceholder(member.class, 'result-icon class-icon mr-2')}
                                    <strong class="text-sm text-slate-800 leading-tight">${member.name}</strong>
                                    ${member.isHealer ? this.getHealerPlaceholder('result-icon class-icon ml-1') : ''}
                                </div>
                                <div class="text-xs text-slate-600 mb-2">
                                    <p>Tier: ${this.getStarRatingHTML(member.starColorTier, '0.9em')}</p>
                                    <p>Score: ${Math.round(indScore)}</p>
                                    ${member.legacyPiece && member.legacyPiece.id ? `<p>Legacy: ${member.legacyPiece.name} (${member.legacyPiece.rarity}) ${member.legacyPiece.starColorTier !== "Unlocked" ? this.getStarRatingHTML(member.legacyPiece.starColorTier, '0.8em') : ''}</p>` : ''}
                                </div>
                            </div>
                        </div>`;
                });
            }
            container.appendChild(membersGrid);
            domElements.savedTeamsList.appendChild(container);

            const option = document.createElement('option');
            option.value = team.id;
            option.textContent = team.name;
            domElements.selectExclusionTeamDropdown.appendChild(option);
        });
    },
    
    /**
     * Opens the modal to share a team link.
     * @param {string} shareLink - The link to display and copy.
     */
    openShareTeamModal(shareLink) {
        if (!domElements.shareTeamModal || !domElements.shareTeamLinkInput) {
            this.showToast("Could not display share link.", "error");
            return;
        }
        domElements.shareTeamLinkInput.value = shareLink;
        this.toggleModal(domElements.shareTeamModal, true);
        domElements.shareTeamLinkInput.focus();
        domElements.shareTeamLinkInput.select();
    },
    
    /**
     * Renders a shared team's details (read-only view).
     * @param {object} teamObject - The shared team data.
     */
    renderSharedTeam(teamObject) {
        if (!domElements.sharedTeamOutput || !teamObject) {
            if (domElements.sharedTeamOutput) domElements.sharedTeamOutput.innerHTML = '<p class="text-red-500">Error: Invalid shared team data.</p>';
            return;
        }
        if (domElements.sharedTeamName) domElements.sharedTeamName.textContent = teamObject.name || "Shared Team";
        
        const htmlString = this._renderTeamDisplay(teamObject, false); // false for not modifiable
        domElements.sharedTeamOutput.innerHTML = htmlString;
    },

    /**
     * Opens the swap champion modal, populating it with available champions.
     * @param {number} indexToReplace - The index of the champion in the current team to be replaced.
     */
    openSwapChampionModal(indexToReplace) {
        if (!domElements.swapChampionModal) return;
        state.championToReplaceIndex = indexToReplace;
        
        const modalBody = domElements.swapChampionModal.querySelector('#swap-modal-body'); 
        if (!modalBody) {
            console.error("Swap modal body not found!");
            return;
        }
        modalBody.innerHTML = '';

        const currentTeamMemberDbIds = new Set(state.currentDisplayedTeam.members.map(m => m.dbChampionId));
        const availableToSwap = state.playerChampionRoster
            .filter(pChamp => !currentTeamMemberDbIds.has(pChamp.dbChampionId))
            .sort((a,b) => (a.name || "Z").localeCompare(b.name || "Z"));

        if (availableToSwap.length === 0) {
            modalBody.innerHTML = '<p>No other champions available in your roster to swap.</p>';
        } else {
            const ul = document.createElement('ul');
            ul.className = 'list-none space-y-2';
            availableToSwap.forEach(champ => {
                const li = document.createElement('li');
                li.className = 'p-3 border rounded-md hover:bg-gray-100 cursor-pointer flex justify-between items-center';
                li.dataset.rosterChampId = champ.id;

                const indScore = calculator.getIndividualChampionScore(champ);
                li.innerHTML = `
                    <div class="champion-details flex items-center">
                        ${this.getClassPlaceholder(champ.class, 'result-icon class-icon-swap mr-2')}
                        <strong class="text-slate-700">${champ.name}</strong>
                        <span class="star-rating ml-2">${this.getStarRatingHTML(champ.starColorTier, '0.9em')}</span>
                        <span class="text-xs text-slate-500 ml-2">(Score: ${Math.round(indScore)})</span>
                    </div>
                    <div class="champion-synergies flex gap-1 ml-auto">
                        ${(champ.inherentSynergies || []).map(syn => {
                            const synIconName = syn.trim().replace(/\s+/g, '_');
                            return `<span class="icon-wrapper"><img src="img/factions/${synIconName}.png" alt="${syn}" title="${syn}" class="result-icon w-4 h-4" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';"><span class="icon-placeholder text-xs" style="display:none;">[${syn}]</span></span>`;
                        }).join('')}
                    </div>
                `;
                li.addEventListener('click', () => {
                    eventHandlers.handleChampionSwapConfirm(champ.id, state.championToReplaceIndex);
                    this.toggleModal(domElements.swapChampionModal, false);
                });
                ul.appendChild(li);
            });
            modalBody.appendChild(ul);
        }
        this.toggleModal(domElements.swapChampionModal, true);
        if (state.currentDisplayedTeam && state.currentDisplayedTeam.members[indexToReplace]) {
            firebaseService.logAnalytics('open_swap_modal', { champion_to_replace: state.currentDisplayedTeam.members[indexToReplace].name });
        }
    },
};

//================================================================================
// 7. EVENT HANDLERS
//================================================================================
/**
 * @module eventHandlers
 * @description Contains functions that handle user events.
 */
const eventHandlers = {
    /**
     * Handles changes in the main champion select dropdown.
     * Updates display fields for rarity, class, healer status, and synergies.
     */
    handleChampionSelectChange() {
        const selectedId = domElements.champSelectDb ? domElements.champSelectDb.value : null;
        if (selectedId) {
            const selectedDbChampion = state.dbChampions.find(c => c.id === selectedId);
            if (selectedDbChampion) {
                if (domElements.champBaseRarityDisplay) domElements.champBaseRarityDisplay.value = selectedDbChampion.baseRarity || 'N/A';
                if (domElements.champClassDisplay) domElements.champClassDisplay.value = selectedDbChampion.class || 'N/A';
                if (domElements.champHealerStatusDisplay) domElements.champHealerStatusDisplay.value = selectedDbChampion.isHealer ? 'Yes' : 'No';
                state.currentSelectedChampionClass = selectedDbChampion.class || null;
                if (domElements.champInherentSynergiesDisplay) domElements.champInherentSynergiesDisplay.textContent = (selectedDbChampion.inherentSynergies || []).join(', ') || 'None';
            }
        } else { // No champion selected
            if (domElements.champBaseRarityDisplay) domElements.champBaseRarityDisplay.value = '';
            if (domElements.champClassDisplay) domElements.champClassDisplay.value = '';
            if (domElements.champHealerStatusDisplay) domElements.champHealerStatusDisplay.value = '';
            state.currentSelectedChampionClass = null;
            if (domElements.champInherentSynergiesDisplay) domElements.champInherentSynergiesDisplay.textContent = 'Select a base champion.';
        }
        ui.populateLegacyPieceSelect(state.currentSelectedChampionClass);
    },

    /**
     * Handles the 'Add' or 'Update' champion button click.
     */
    async handleAddUpdateChampion() {
        const selectedDbChampionId = domElements.champSelectDb.value;
        const selectedLegacyPieceId = domElements.legacyPieceSelect.value;
        const selectedLegacyPieceStarTier = domElements.legacyPieceStarColor.value;
        let legacyPieceData = { id: null, name: "None", rarity: "None", score: 0, starColorTier: "Unlocked", description: "" };

        if (selectedLegacyPieceId) {
            const dbLp = state.dbLegacyPieces.find(lp => lp.id === selectedLegacyPieceId);
            if (dbLp) {
                const baseLpScore = config.LEGACY_PIECE_BASE_RARITY_SCORE[dbLp.baseRarity] || 0;
                const lpStarBonus = config.LEGACY_PIECE_STAR_TIER_SCORE[selectedLegacyPieceStarTier] || 0;
                legacyPieceData = {
                    id: dbLp.id, name: dbLp.name, rarity: dbLp.baseRarity,
                    score: baseLpScore + lpStarBonus, 
                    starColorTier: selectedLegacyPieceStarTier,
                    description: dbLp.description || ""
                };
            }
        } else {
            legacyPieceData.starColorTier = "Unlocked";
            legacyPieceData.score = config.LEGACY_PIECE_BASE_RARITY_SCORE["None"] || 0;
        }

        const gear = {};
        Object.entries(domElements.gearSelects).forEach(([slot, el]) => {
            gear[slot] = { rarity: el.value, score: config.STANDARD_GEAR_RARITY_SCORE[el.value] || 0 };
        });
        
        if (state.editingChampionId) { // Update existing champion
            const champIndex = state.playerChampionRoster.findIndex(c => c.id === state.editingChampionId);
            if (champIndex === -1) {
                ui.showToast("Error: Champion to update not found.", "error");
                this.handleCancelEdit();
                return;
            }
            const baseChampionData = state.dbChampions.find(dbC => dbC.id === state.playerChampionRoster[champIndex].dbChampionId);

            state.playerChampionRoster[champIndex] = {
                ...state.playerChampionRoster[champIndex],
                isHealer: baseChampionData ? (baseChampionData.isHealer === true) : state.playerChampionRoster[champIndex].isHealer,
                starColorTier: domElements.champStarColor.value,
                gear,
                legacyPiece: legacyPieceData,
            };
            ui.showToast(`${state.playerChampionRoster[champIndex].name} updated!`, "success");
            firebaseService.logAnalytics('update_champion_roster', { champion_name: state.playerChampionRoster[champIndex].name });
            this.handleCancelEdit(); // Resets form and editing state
        } else { // Add new champion
            if (!selectedDbChampionId) {
                ui.showToast('Please select a base champion.', 'warning');
                return;
            }
            if (state.playerChampionRoster.some(rc => rc.dbChampionId === selectedDbChampionId)) {
                ui.showToast('This champion is already in your roster.', 'warning');
                return; 
            }
            const baseChampionData = state.dbChampions.find(c => c.id === selectedDbChampionId);
            if (!baseChampionData) {
                ui.showToast('Selected base champion data not found.', 'error');
                return;
            }
            const newPlayerChampion = {
                id: Date.now(), // Simple unique ID for client-side
                dbChampionId: baseChampionData.id,
                name: baseChampionData.name,
                baseRarity: baseChampionData.baseRarity,
                class: baseChampionData.class || "N/A",
                isHealer: baseChampionData.isHealer === true,
                inherentSynergies: baseChampionData.inherentSynergies || [],
                starColorTier: domElements.champStarColor.value,
                gear,
                legacyPiece: legacyPieceData,
            };
            state.playerChampionRoster.push(newPlayerChampion);
            ui.showToast(`${newPlayerChampion.name} added to roster!`, "success");
            firebaseService.logAnalytics('add_champion_to_roster', { champion_name: newPlayerChampion.name });
            ui.resetChampionForm(); // Resets form, populates champion select
        }
        
        await firebaseService.savePlayerRoster();
        ui.renderPlayerChampionRoster(); // This will also call renderAvailableSynergies
    },

    /**
     * Handles the click on "Cancel Edit" button.
     */
    handleCancelEdit() {
        state.editingChampionId = null;
        ui.resetChampionForm();
    },

    /**
     * Handles roster table actions (edit, delete) using event delegation.
     * @param {Event} event - The click event.
     */
    handleRosterTableActions(event) {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const championId = parseInt(button.dataset.championId, 10);
        const action = button.dataset.action;

        if (action === 'edit') {
            const championToEdit = state.playerChampionRoster.find(c => c.id === championId);
            if (!championToEdit) return;

            state.editingChampionId = championId;
            if (domElements.formModeTitle) domElements.formModeTitle.textContent = "Edit Champion";
            if (domElements.champSelectDb) {
                 ui.populateChampionSelect(); // Ensure the selected champ is available
                 domElements.champSelectDb.value = championToEdit.dbChampionId;
                 domElements.champSelectDb.disabled = true;
                 domElements.champSelectDb.dispatchEvent(new Event('change')); // Trigger update of dependent fields
            }
            if (domElements.champStarColor) domElements.champStarColor.value = championToEdit.starColorTier;
            Object.entries(domElements.gearSelects).forEach(([slot, el]) => {
                if (el && championToEdit.gear && championToEdit.gear[slot]) el.value = championToEdit.gear[slot].rarity;
            });
            if (domElements.legacyPieceSelect && championToEdit.legacyPiece) {
                ui.populateLegacyPieceSelect(championToEdit.class); // Repopulate with current class context
                domElements.legacyPieceSelect.value = championToEdit.legacyPiece.id || "";
            }
            if (domElements.legacyPieceStarColor && championToEdit.legacyPiece) domElements.legacyPieceStarColor.value = championToEdit.legacyPiece.starColorTier || "Unlocked";
            
            if (domElements.addUpdateChampionBtn) domElements.addUpdateChampionBtn.innerHTML = `<span class="btn-icon">${config.ICONS.UPDATE}</span> <span class="btn-text">Update Champion</span>`;
            if (domElements.cancelEditBtn) domElements.cancelEditBtn.classList.remove('hidden');
            window.scrollTo({ top: domElements.champSelectDb.offsetTop - 125, behavior: 'smooth' });
            firebaseService.logAnalytics('edit_champion_start', { champion_name: championToEdit.name });

        } else if (action === 'delete') {
            const champToRemove = state.playerChampionRoster.find(c => c.id === championId);
            if (champToRemove) {
                ui.openConfirmModal(
                    `Remove ${champToRemove.name} from roster?`,
                    async () => {
                        if (state.editingChampionId === championId) this.handleCancelEdit();
                        state.playerChampionRoster = state.playerChampionRoster.filter(c => c.id !== championId);
                        await firebaseService.savePlayerRoster();
                        ui.renderPlayerChampionRoster();
                        ui.populateChampionSelect(); // Refresh dropdown
                        ui.showToast(`${champToRemove.name} removed.`, "info");
                        firebaseService.logAnalytics('remove_champion_from_roster', { champion_name: champToRemove.name });
                    }
                );
            }
        } else if (action === 'swap-champion') {
            const indexToReplace = parseInt(button.dataset.index, 10);
            if (!isNaN(indexToReplace)) {
                ui.openSwapChampionModal(indexToReplace);
            }
        }
    },
    
    /**
     * Handles the click on the main "Calculate Best Team" button.
     */
    handleCalculateClick() {
        if (state.editingChampionId) {
            ui.showToast("Finish or cancel editing champion before calculating.", "warning");
            return;
        }
        if (state.playerChampionRoster.length < 5) {
            if (domElements.resultsOutput) domElements.resultsOutput.innerHTML = '<p class="text-red-500">Need at least 5 champions in roster.</p>';
            return;
        }
        if (state.dbSynergies.length === 0 && domElements.resultsOutput) {
            domElements.resultsOutput.innerHTML = '<p class="text-orange-500">Warning: No synergies loaded. Calculation will proceed without synergy bonuses.</p>';
        }

        ui.toggleProcessingModal(true);
        
        // Use setTimeout to allow UI to update before heavy calculation
        setTimeout(() => {
            const options = {
                requireHealer: domElements.requireHealerCheckbox ? domElements.requireHealerCheckbox.checked : false,
                exclusionTeamIds: domElements.selectExclusionTeamDropdown ? Array.from(domElements.selectExclusionTeamDropdown.selectedOptions).map(opt => opt.value) : []
            };
            
            const bestTeam = calculator.findBestTeam(options);
            
            if (bestTeam) {
                ui.displayResults(bestTeam); 
                firebaseService.logAnalytics('calculate_optimal_team', {
                    roster_size: state.playerChampionRoster.length,
                    combinations_checked: calculator.generateCombinations(state.playerChampionRoster, 5).length, 
                    best_team_score: Math.round(bestTeam.totalScore),
                    require_healer: options.requireHealer,
                    excluded_teams_count: options.exclusionTeamIds.length
                });
                ui.updateProcessingStatus("Calculation complete! Displaying results...", 100);
            } else {
                ui.updateProcessingStatus("Calculation failed or no team found.", 100);
            }
            setTimeout(() => ui.toggleProcessingModal(false), bestTeam ? 1000 : 2000);
        }, 50);
    },

    /**
     * Handles saving the currently displayed best team.
     */
    handleSaveCurrentBestTeam() {
        if (!state.userId) {
            ui.showToast("Must be signed in to save teams.", "error");
            return;
        }
        if (!state.currentDisplayedTeam) {
            ui.showToast("No current team to save.", "warning");
            return;
        }
        const defaultName = `Team (Score: ${Math.round(state.currentDisplayedTeam.totalScore)}) - ${new Date().toLocaleDateString()}`;
        ui.openTeamNameModal(defaultName, 'Save Team As', async (teamNameToSave) => {
            const teamDataToSave = {
                name: teamNameToSave,
                members: state.currentDisplayedTeam.members.map(m => ({ 
                    dbChampionId: m.dbChampionId, name: m.name, baseRarity: m.baseRarity, class: m.class,
                    isHealer: m.isHealer === true, starColorTier: m.starColorTier, gear: m.gear, 
                    legacyPiece: m.legacyPiece, inherentSynergies: m.inherentSynergies || [],
                    individualScore: m.individualScore !== undefined ? m.individualScore : calculator.getIndividualChampionScore(m)
                })),
                totalScore: state.currentDisplayedTeam.totalScore,
                activeSynergies: state.currentDisplayedTeam.activeSynergies, 
                scoreBreakdown: state.currentDisplayedTeam.scoreBreakdown, 
                baseScoreSum: state.currentDisplayedTeam.baseScoreSum, 
                uniqueClassesCount: state.currentDisplayedTeam.uniqueClassesCount,
                classDiversityBonusApplied: state.currentDisplayedTeam.classDiversityBonusApplied,
            };
            
            const saveBtn = domElements.resultsOutput.querySelector('#save-team-btn'); 
            if(saveBtn) saveBtn.disabled = true;

            const docRef = await firebaseService.saveNewTeam(teamDataToSave);
            if (docRef) {
                ui.showToast("Team saved successfully!", "success");
                await firebaseService.loadSavedTeams(); 
                ui.renderSavedTeams();
            } 
            if(saveBtn) saveBtn.disabled = false;
        });
    },

    /**
     * Handles resetting the displayed team to the original calculation.
     */
    handleResetTeamDisplay() {
        if (state.originalBestTeam) {
            // Re-render using the stored originalBestTeam
            ui.displayResults(state.originalBestTeam); // This will set currentDisplayedTeam and currentBestTeamForSaving
            ui.showToast("Team reset to original calculation.", "info");
            firebaseService.logAnalytics('reset_calculated_team');
        }
    },

    /**
     * Handles the confirmation of a champion swap.
     * @param {string} selectedRosterChampId - The ID of the champion from the roster to swap in.
     * @param {number} indexToReplace - The index in the current team to replace.
     */
    async handleChampionSwapConfirm(selectedRosterChampId, indexToReplace) {
        const newChampion = state.playerChampionRoster.find(rc => rc.id.toString() === selectedRosterChampId.toString()); 
        if (!newChampion || indexToReplace < 0 || !state.currentDisplayedTeam || indexToReplace >= state.currentDisplayedTeam.members.length) {
            ui.showToast("Error selecting champion for swap.", "error");
            return;
        }

        const oldChampionName = state.currentDisplayedTeam.members[indexToReplace].name;
        const newTeamMembers = [...state.currentDisplayedTeam.members];
        newTeamMembers[indexToReplace] = { 
            ...newChampion,
            individualScore: calculator.getIndividualChampionScore(newChampion) 
        };
        
        ui.toggleProcessingModal(true);
        ui.updateProcessingStatus("Recalculating team score...", 10);

        setTimeout(async () => { 
            const recalculatedTeam = calculator.recalculateTeamScore(newTeamMembers);
            // Update currentDisplayedTeam and currentBestTeamForSaving before re-rendering
            state.currentDisplayedTeam = recalculatedTeam; 
            state.currentBestTeamForSaving = JSON.parse(JSON.stringify(recalculatedTeam)); 
            
            ui.updateProcessingStatus("Updating display...", 90);
            // Call displayResults which handles setting currentDisplayedTeam and rendering
            ui.displayResults(recalculatedTeam); 
            
            ui.updateProcessingStatus("Recalculation complete!", 100);
            setTimeout(() => ui.toggleProcessingModal(false), 500);
            firebaseService.logAnalytics('execute_champion_swap', { 
                swapped_in: newChampion.name, swapped_out: oldChampionName 
            });
        }, 50);
    },

    /**
     * Handles actions for saved teams (rename, delete, share, unshare).
     * @param {Event} event - The click event.
     */
    async handleSavedTeamActions(event) {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const teamId = button.dataset.teamId;
        const action = button.dataset.action;
        const team = state.savedTeams.find(t => t.id === teamId);

        if (!team && (action !== 'share-team' && action !== 'unshare-team')) { 
             if(!state.savedTeams.find(t => t.id === teamId) && (action === 'share-team' || action === 'unshare-team')){
             } else {
                ui.showToast("Team not found for action.", "error");
                return;
             }
        }


        switch (action) {
            case 'rename-team':
                const currentName = button.dataset.currentName;
                ui.openTeamNameModal(currentName, 'Rename Team', async (newName) => {
                    if (newName && newName.trim() !== "" && newName.trim() !== currentName) {
                        await firebaseService.updateSavedTeam(teamId, { name: newName.trim() });
                        ui.showToast("Team renamed.", "success");
                        firebaseService.logAnalytics('rename_saved_team');
                        await firebaseService.loadSavedTeams();
                        ui.renderSavedTeams();
                    }
                });
                break;
            case 'delete-team':
                 if (!team) { ui.showToast("Team not found to delete.", "error"); break; }
                ui.openConfirmModal(
                    `Delete team "${team.name}"? This also removes any public share.`,
                    async () => {
                        await firebaseService.deleteCompleteSavedTeam(teamId, team.publicShareId);
                        ui.showToast(`Team "${team.name}" deleted.`, "success");
                        firebaseService.logAnalytics('delete_saved_team', { was_shared: !!team.publicShareId });
                        await firebaseService.loadSavedTeams();
                        ui.renderSavedTeams();
                    }
                );
                break;
            case 'share-team':
                 if (!team) { ui.showToast("Team not found to share.", "error"); break; }
                ui.openConfirmModal(
                    `Share "${team.name}" publicly? Anyone with the link can view it.`,
                    async () => {
                        const publicData = { 
                            name: team.name, members: team.members, totalScore: team.totalScore,
                            activeSynergies: team.activeSynergies, scoreBreakdown: team.scoreBreakdown,
                            uniqueClassesCount: team.uniqueClassesCount, classDiversityBonusApplied: team.classDiversityBonusApplied
                        };
                        const docRef = await firebaseService.createPublicShare(publicData);
                        if (docRef && docRef.id) {
                            await firebaseService.updateSavedTeam(teamId, { publicShareId: docRef.id });
                            const shareLink = `${window.location.origin}${window.location.pathname}?sharedTeamId=${docRef.id}`;
                            ui.openShareTeamModal(shareLink);
                            ui.showToast("Public share link generated!", "success");
                            firebaseService.logAnalytics('share_team', { team_name: team.name });
                            await firebaseService.loadSavedTeams();
                            ui.renderSavedTeams();
                        }
                    }, null, "Confirm Public Share"
                );
                break;
            case 'unshare-team':
                const shareId = button.dataset.shareId;
                if (!team || !shareId) { ui.showToast("Missing info to unshare.", "error"); break;}
                ui.openConfirmModal(
                    `Remove public share for "${team.name}"?`,
                    async () => {
                        await firebaseService.deletePublicShare(shareId);
                        await firebaseService.updateSavedTeam(teamId, { publicShareId: deleteField() }); 
                        ui.showToast(`"${team.name}" is no longer shared.`, "success");
                        firebaseService.logAnalytics('unshare_team');
                        await firebaseService.loadSavedTeams();
                        ui.renderSavedTeams();
                    }, null, "Confirm Unshare"
                );
                break;
        }
    },
    
    /**
     * Handles prefilling the roster with all champions.
     */
    async handlePrefillRoster() {
        const prefillAction = async () => {
            if (state.dbChampions.length === 0) {
                ui.showToast("No base champions loaded to pre-fill.", "error");
                return;
            }
            state.playerChampionRoster = state.dbChampions.map(baseChamp => {
                const defaultGear = {};
                Object.keys(domElements.gearSelects).forEach(slot => {
                    defaultGear[slot] = { rarity: "None", score: 0 };
                });
                return {
                    id: Date.now() + Math.random(), dbChampionId: baseChamp.id, name: baseChamp.name,
                    baseRarity: baseChamp.baseRarity, class: baseChamp.class || "N/A",
                    isHealer: baseChamp.isHealer === true, inherentSynergies: baseChamp.inherentSynergies || [],
                    starColorTier: "Unlocked", gear: defaultGear,
                    legacyPiece: { id: null, name: "None", rarity: "None", score: 0, starColorTier: "Unlocked", description: "" },
                };
            });
            ui.showToast("Roster pre-filled with all champions at Unlocked tier!", "success");
            await firebaseService.savePlayerRoster();
            ui.renderPlayerChampionRoster();
            ui.populateChampionSelect();
            firebaseService.logAnalytics('prefill_roster', { champion_count: state.dbChampions.length });
        };
        const message = state.playerChampionRoster.length > 0 
            ? "This will replace your current roster. Are you sure?" 
            : "Pre-fill roster with all champions at Unlocked tier?";
        ui.openConfirmModal(message, prefillAction);
    },

    /**
     * Handles exporting the current roster to a JSON file.
     */
    handleExportRoster() {
        if (state.playerChampionRoster.length === 0) {
            ui.showToast("Roster is empty. Nothing to export.", "warning");
            return;
        }
        const exportableRoster = state.playerChampionRoster.map(champ => ({
            dbChampionId: champ.dbChampionId, starColorTier: champ.starColorTier,
            gear: { 
                head: { rarity: champ.gear.head.rarity }, arms: { rarity: champ.gear.arms.rarity },
                legs: { rarity: champ.gear.legs.rarity }, chest: { rarity: champ.gear.chest.rarity },
                waist: { rarity: champ.gear.waist.rarity },
            },
            legacyPiece: { id: champ.legacyPiece.id, starColorTier: champ.legacyPiece.starColorTier || "Unlocked" }
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
        ui.showToast("Roster exported!", "success");
        firebaseService.logAnalytics('export_roster', { roster_size: state.playerChampionRoster.length });
    },

    /**
     * Handles the import roster file selection.
     * @param {Event} event - The file input change event.
     */
    async handleImportRosterFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (file.type !== "application/json") {
            ui.showToast("Invalid file type. Please select JSON.", "error");
            if (domElements.importRosterFile) domElements.importRosterFile.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = async (e) => {
            const processImport = async () => {
                try {
                    const importedData = JSON.parse(e.target.result);
                    if (!Array.isArray(importedData)) {
                        ui.showToast("Invalid roster format in JSON.", "error"); return;
                    }
                    const newRoster = []; let importErrors = 0;
                    for (const impChamp of importedData) {
                        const baseChamp = state.dbChampions.find(c => c.id === impChamp.dbChampionId);
                        if (!baseChamp) { importErrors++; continue; }
                        let legacyPieceData = { id: null, name: "None", rarity: "None", score: 0, starColorTier: "Unlocked", description: "" };
                        if (impChamp.legacyPiece && impChamp.legacyPiece.id) {
                            const dbLp = state.dbLegacyPieces.find(lp => lp.id === impChamp.legacyPiece.id);
                            if (dbLp) {
                                const lpStarTier = impChamp.legacyPiece.starColorTier || "Unlocked";
                                const baseLpScore = config.LEGACY_PIECE_BASE_RARITY_SCORE[dbLp.baseRarity] || 0;
                                const lpStarBonus = config.LEGACY_PIECE_STAR_TIER_SCORE[lpStarTier] || 0;
                                legacyPieceData = {
                                    id: dbLp.id, name: dbLp.name, rarity: dbLp.baseRarity,
                                    score: baseLpScore + lpStarBonus, starColorTier: lpStarTier,
                                    description: dbLp.description || ""
                                };
                            }
                        }
                        const playerChampion = {
                            id: Date.now() + Math.random(), dbChampionId: baseChamp.id, name: baseChamp.name,
                            baseRarity: baseChamp.baseRarity, class: baseChamp.class || "N/A",
                            isHealer: baseChamp.isHealer === true, inherentSynergies: baseChamp.inherentSynergies || [],
                            starColorTier: impChamp.starColorTier || "Unlocked",
                            gear: {
                                head: { rarity: impChamp.gear?.head?.rarity || "None" },
                                arms: { rarity: impChamp.gear?.arms?.rarity || "None" },
                                legs: { rarity: impChamp.gear?.legs?.rarity || "None" },
                                chest: { rarity: impChamp.gear?.chest?.rarity || "None" },
                                waist: { rarity: impChamp.gear?.waist?.rarity || "None" },
                            },
                            legacyPiece: legacyPieceData,
                        };
                        Object.keys(playerChampion.gear).forEach(slot => {
                            playerChampion.gear[slot].score = config.STANDARD_GEAR_RARITY_SCORE[playerChampion.gear[slot].rarity] || 0;
                        });
                        newRoster.push(playerChampion);
                    }
                    state.playerChampionRoster = newRoster;
                    await firebaseService.savePlayerRoster();
                    ui.renderPlayerChampionRoster();
                    ui.populateChampionSelect();
                    ui.showToast(importErrors > 0 ? `Roster imported with ${importErrors} errors.` : "Roster imported!", importErrors > 0 ? "warning" : "success");
                    firebaseService.logAnalytics('import_roster_success', { imported_count: newRoster.length, error_count: importErrors });
                } catch (err) { ui.showToast("Error importing: " + err.message, "error"); }
                finally { if (domElements.importRosterFile) domElements.importRosterFile.value = ''; }
            };
            ui.openConfirmModal("Importing will overwrite current roster. Sure?", processImport, () => {
                if (domElements.importRosterFile) domElements.importRosterFile.value = '';
                ui.showToast("Import cancelled.", "info");
            });
        };
        reader.readAsText(file);
    },
};

//================================================================================
// 8. INITIALIZATION AND EVENT BINDING
//================================================================================
/**
 * Binds all application event listeners to their respective handlers.
 * @private
 */
function bindEventListeners() {
    if (domElements.addUpdateChampionBtn) domElements.addUpdateChampionBtn.addEventListener('click', eventHandlers.handleAddUpdateChampion);
    if (domElements.cancelEditBtn) domElements.cancelEditBtn.addEventListener('click', eventHandlers.handleCancelEdit);
    if (domElements.champSelectDb) domElements.champSelectDb.addEventListener('change', eventHandlers.handleChampionSelectChange);
    if (domElements.championsRosterTableWrapper) domElements.championsRosterTableWrapper.addEventListener('click', eventHandlers.handleRosterTableActions);
    if (domElements.calculateBtn) domElements.calculateBtn.addEventListener('click', eventHandlers.handleCalculateClick);
    
    if (domElements.savedTeamsList) domElements.savedTeamsList.addEventListener('click', eventHandlers.handleSavedTeamActions);
    
    if (domElements.resultsOutput) {
        domElements.resultsOutput.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button) return;
            // Note: Save/Reset buttons are bound in ui.displayResults after HTML is set.
            // This delegation is primarily for swap buttons if they were part of resultsOutput.
            if (button.dataset.action === 'swap-champion') {
                const index = parseInt(button.dataset.index, 10);
                if (!isNaN(index)) ui.openSwapChampionModal(index);
            }
        });
    }

    if (domElements.saveTeamNameBtn) domElements.saveTeamNameBtn.addEventListener('click', () => {
        const name = domElements.teamNameInput.value.trim();
        if (name === "") { ui.showToast("Team name cannot be empty.", "warning"); return; }
        if (state.modalCallbacks.teamName) state.modalCallbacks.teamName(name);
        ui.toggleModal(domElements.teamNameModal, false);
    });
    if (domElements.cancelTeamNameBtn) domElements.cancelTeamNameBtn.addEventListener('click', () => ui.toggleModal(domElements.teamNameModal, false));
    if (domElements.teamNameModal) domElements.teamNameModal.addEventListener('click', e => { if (e.target === domElements.teamNameModal) ui.toggleModal(domElements.teamNameModal, false); });

    if (domElements.confirmModalConfirmBtn) domElements.confirmModalConfirmBtn.addEventListener('click', () => {
        if (state.modalCallbacks.confirm) state.modalCallbacks.confirm();
        ui.toggleModal(domElements.confirmModal, false);
    });
    if (domElements.confirmModalCancelBtn) domElements.confirmModalCancelBtn.addEventListener('click', () => {
        if (state.modalCallbacks.cancel) state.modalCallbacks.cancel();
        ui.toggleModal(domElements.confirmModal, false);
    });
    if (domElements.confirmModal) domElements.confirmModal.addEventListener('click', e => { if (e.target === domElements.confirmModal) { if (state.modalCallbacks.cancel) state.modalCallbacks.cancel(); ui.toggleModal(domElements.confirmModal, false); }});

    if (domElements.closeShareTeamModalBtn) domElements.closeShareTeamModalBtn.addEventListener('click', () => ui.toggleModal(domElements.shareTeamModal, false));
    if (domElements.shareTeamModal) domElements.shareTeamModal.addEventListener('click', e => { if (e.target === domElements.shareTeamModal) ui.toggleModal(domElements.shareTeamModal, false); });
    if (domElements.copyShareLinkBtn) domElements.copyShareLinkBtn.addEventListener('click', () => {
        if (!domElements.shareTeamLinkInput) return;
        try {
            domElements.shareTeamLinkInput.select();
            document.execCommand('copy'); 
            ui.showToast("Link copied!", "success");
            firebaseService.logAnalytics('share_link_copied');
        } catch (err) { ui.showToast("Failed to copy.", "warning"); }
    });
    
    if (domElements.swapChampionModal) {
        const closeSwapBtn = domElements.swapChampionModal.querySelector('#close-swap-modal-btn'); 
        if (closeSwapBtn) closeSwapBtn.addEventListener('click', () => ui.toggleModal(domElements.swapChampionModal, false));
        domElements.swapChampionModal.addEventListener('click', e => { if (e.target === domElements.swapChampionModal) ui.toggleModal(domElements.swapChampionModal, false); });
    }

    if (domElements.prefillRosterBtn) domElements.prefillRosterBtn.addEventListener('click', eventHandlers.handlePrefillRoster);
    if (domElements.exportRosterBtn) domElements.exportRosterBtn.addEventListener('click', eventHandlers.handleExportRoster);
    if (domElements.importRosterBtn) domElements.importRosterBtn.addEventListener('click', () => { if(domElements.importRosterFile) domElements.importRosterFile.click()});
    if (domElements.importRosterFile) domElements.importRosterFile.addEventListener('change', eventHandlers.handleImportRosterFile);

    if (domElements.toggleScoreColumnCheckbox) {
        domElements.toggleScoreColumnCheckbox.addEventListener('change', function() {
            state.scoreColumnVisible = this.checked;
            if (state.rosterDataTable) {
                state.rosterDataTable.column('.dt-column-score').visible(state.scoreColumnVisible);
            }
            firebaseService.logAnalytics('toggle_score_column', { visible: state.scoreColumnVisible });
        });
    }
    if(domElements.excludeSavedTeamCheckbox && domElements.selectExclusionTeamDropdown) {
        domElements.excludeSavedTeamCheckbox.addEventListener('change', () => {
            domElements.selectExclusionTeamDropdown.disabled = !domElements.excludeSavedTeamCheckbox.checked;
            if (!domElements.excludeSavedTeamCheckbox.checked) {
                Array.from(domElements.selectExclusionTeamDropdown.options).forEach(option => option.selected = false);
            }
        });
    }
}

/**
 * Sets initial innerHTML for buttons with icons.
 * @private
 */
function setInitialButtonIcons() {
    const setBtn = (el, icon, text) => { if (el) el.innerHTML = `<span class="btn-icon">${icon}</span> <span class="btn-text">${text}</span>`; };
    setBtn(domElements.addUpdateChampionBtn, config.ICONS.ADD, 'Add Champion');
    setBtn(domElements.cancelEditBtn, config.ICONS.CANCEL, 'Cancel Edit');
    setBtn(domElements.calculateBtn, config.ICONS.CALCULATE, 'Calculate Best Team');
    setBtn(domElements.saveTeamNameBtn, config.ICONS.SAVE, 'Save Name');
    setBtn(domElements.cancelTeamNameBtn, config.ICONS.CANCEL, 'Cancel');
    setBtn(domElements.prefillRosterBtn, config.ICONS.PREFILL, 'Pre-fill Roster');
    setBtn(domElements.exportRosterBtn, config.ICONS.EXPORT, 'Export Roster');
    setBtn(domElements.importRosterBtn, config.ICONS.IMPORT, 'Import Roster');
    setBtn(domElements.confirmModalConfirmBtn, config.ICONS.CONFIRM, 'Confirm');
    setBtn(domElements.confirmModalCancelBtn, config.ICONS.CANCEL, 'Cancel');
    setBtn(domElements.copyShareLinkBtn, config.ICONS.COPY, 'Copy Link');
}

/**
 * Handles viewing a shared team link from URL parameters.
 * @returns {Promise<boolean>} True if a shared team link was processed, false otherwise.
 */
async function handleSharedTeamLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedTeamId = urlParams.get('sharedTeamId');

    if (sharedTeamId) {
        ui.showLoading(true);
        if (domElements.mainAppContent) domElements.mainAppContent.classList.add('hidden');
        if (domElements.sharedTeamViewSection) domElements.sharedTeamViewSection.classList.remove('hidden');
        if (domElements.sharedTeamOutput) domElements.sharedTeamOutput.innerHTML = '<div class="loading-spinner mx-auto my-4"></div><p class="text-center text-indigo-600">Loading shared team...</p>';

        try {
            if (!state.firebase.db) await firebaseService.init(); 
            if (state.dbChampions.length === 0 || state.dbSynergies.length === 0 || state.dbLegacyPieces.length === 0) {
                 await firebaseService.fetchGameData();
            }
            
            const sharedTeamData = await firebaseService.fetchSharedTeam(sharedTeamId);
            if (sharedTeamData) {
                ui.renderSharedTeam(sharedTeamData);
                firebaseService.logAnalytics('view_shared_team', { shared_team_id: sharedTeamId });
            } else {
                if (domElements.sharedTeamOutput) domElements.sharedTeamOutput.innerHTML = '<p class="text-red-500 text-center">Shared team not found or link is invalid.</p>';
            }
        } catch (error) {
            console.error("Error processing shared team link:", error);
            if (domElements.sharedTeamOutput) domElements.sharedTeamOutput.innerHTML = '<p class="text-red-500 text-center">Error loading shared team.</p>';
        } finally {
            ui.showLoading(false);
        }
        return true; 
    } else {
        if (domElements.mainAppContent) domElements.mainAppContent.classList.remove('hidden');
        if (domElements.sharedTeamViewSection) domElements.sharedTeamViewSection.classList.add('hidden');
        return false; 
    }
}


/**
 * Initializes the application: fetches data, binds events, and renders the initial UI.
 * This is the main entry point of the application.
 */
async function init() {
    cacheDomElements(); 
    try {
        await firebaseService.init(); 
        firebaseService.logAnalytics('page_view', { page_title: document.title, page_location: window.location.href });
        
        const isSharedView = await handleSharedTeamLink();

        if (!isSharedView) { 
            setInitialButtonIcons();
            ui.populateStarColorOptions(domElements.champStarColor, config.STAR_COLOR_TIERS, "Unlocked");
            ui.populateStarColorOptions(domElements.legacyPieceStarColor, config.LEGACY_PIECE_STAR_TIER_SCORE, "Unlocked");
            ui.populateGearRarityOptions();
            
            await firebaseService.fetchGameData(); 
            
            await firebaseService.loadPlayerRoster(); 
            await firebaseService.loadSavedTeams();   

            ui.populateChampionSelect(); 
            ui.resetChampionForm();      
            ui.renderPlayerChampionRoster(); 
            ui.renderSavedTeams();       
            ui.renderAvailableSynergies(); 
            
            if (domElements.synergiesSection) domElements.synergiesSection.classList.remove('hidden');
        }
        
        bindEventListeners(); 
        ui.showLoading(false); 

    } catch (error) {
        console.error("Main execution error in init:", error);
        ui.showLoading(false);
        if (!domElements.errorIndicator || domElements.errorIndicator.classList.contains('hidden')) {
            ui.showError("A critical error occurred on page load.", error.message);
        }
        firebaseService.logAnalytics('exception', { description: `Main init: ${error.message}`, fatal: true });
    }
}

// Start the application once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', init);

