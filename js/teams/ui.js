/**
 * @file ui.js
 * @description Handles all UI interactions, event listeners, and data flow
 * for the redesigned Team Builder.
 */

import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, deleteDoc, query, orderBy, addDoc, updateDoc, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { TeamCalculator, GAME_CONSTANTS, ensureIndividualScores } from './core.js';

// --- DOM ELEMENT REFERENCES ---
const DOM = {
    // Indicators
    loadingIndicator: document.getElementById('loading-indicator'),
    errorIndicator: document.getElementById('error-indicator'),
    errorMessageDetails: document.getElementById('error-message-details'),
    saveRosterIndicator: document.getElementById('save-roster-indicator'),

    // Main Layout
    mainAppContent: document.getElementById('main-app-content'),
    stepper: document.getElementById('stepper'),
    step1Btn: document.getElementById('step-btn-1'),
    step2Btn: document.getElementById('step-btn-2'),
    step1Content: document.getElementById('step-1-content'),
    step2Content: document.getElementById('step-2-content'),

    // Roster Form Container
    rosterFormContainer: document.querySelector('#step-1-content > .grid'),
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
    
    // Custom Dropdown
    customChampDropdown: document.getElementById('custom-champ-dropdown'),
    customChampDropdownTrigger: document.getElementById('custom-champ-dropdown-trigger'),
    customChampDropdownOptions: document.getElementById('custom-champ-dropdown-options'),
    selectedChampImg: document.getElementById('selected-champ-img'),
    selectedChampName: document.getElementById('selected-champ-name'),

    // Roster Table & Management
    rosterTableContainer: document.getElementById('roster-table-container'),
    rosterEmptyMessage: document.getElementById('roster-empty-message'),
    prefillRosterBtn: document.getElementById('prefill-roster-btn'),
    exportRosterBtn: document.getElementById('export-roster-btn'),
    importRosterBtn: document.getElementById('import-roster-btn'),
    importRosterFile: document.getElementById('import-roster-file'),

    // Team Calculation
    requireHealerCheckbox: document.getElementById('require-healer-checkbox'),
    excludeSavedTeamCheckbox: document.getElementById('exclude-saved-team-checkbox'),
    selectExclusionTeamDropdown: document.getElementById('select-exclusion-team-dropdown'),
    calculateBtn: document.getElementById('calculate-btn'),
    resultsOutput: document.getElementById('results-output'),
    savedTeamsList: document.getElementById('saved-teams-list'),
    
    // Modals
    teamNameModal: document.getElementById('team-name-modal'),
    processingModal: document.getElementById('processing-modal'),
    confirmModal: document.getElementById('confirm-modal'),
    shareTeamModal: document.getElementById('share-team-modal'),
    swapChampionModal: document.getElementById('swap-champion-modal'),

    // Toast
    toastContainer: document.getElementById('toast-container'),
};

// --- GLOBAL STATE ---
let db, auth, userId;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'dc-dark-legion-builder';
let dbChampions = [], dbSynergies = [], dbLegacyPieces = [];
let playerRoster = [];
let savedTeams = [];
let characterComicsData = new Map();
let rosterDataTable = null;
let editingChampionId = null;
let teamModalCallback = null, confirmModalCallback = null;
let originalBestTeam = null, currentDisplayedTeam = null;

// =================================================================================================
// #region INITIALIZATION
// =================================================================================================
document.addEventListener('DOMContentLoaded', initializePage);

async function initializePage() {
    showLoading(true, "Initializing...");
    try {
        await initializeFirebase();
        
        showLoading(true, "Loading Game Data...");
        await Promise.all([
            fetchData('champions', (data) => dbChampions = data),
            fetchData('synergies', (data) => dbSynergies = data.sort((a,b) => a.name.localeCompare(b.name))),
            fetchData('legacyPieces', (data) => dbLegacyPieces = data.sort((a,b) => a.name.localeCompare(b.name))),
            fetchCharacterComics()
        ]);
        
        populateStaticDropdowns();
        attachEventListeners();
        
        // Now that game data is loaded, process user data
        await handleUserSession();

        showLoading(false);
        DOM.mainAppContent.classList.remove('hidden');
    } catch (error) {
        showError("Initialization failed. Please refresh.", error.message);
        console.error("Initialization Error:", error);
    }
}

async function initializeFirebase() {
    return new Promise((resolve) => {
        document.addEventListener('firebase-ready', () => {
            const app = getApp();
            auth = getAuth(app);
            db = getFirestore(app);
            // Listen for subsequent auth changes after initial load
            onAuthStateChanged(auth, handleUserSession);
            resolve();
        }, { once: true });
    });
}

async function handleUserSession() {
    const user = auth.currentUser;
    if (user) {
        userId = user.uid;
        showLoading(true, "Loading your data...");
        await loadUserData();
        showLoading(false);
    } else {
        userId = null;
        playerRoster = [];
        savedTeams = [];
        renderRosterTable();
        renderSavedTeams();
        populateChampionSelect();
    }
}


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

async function fetchCharacterComics() {
    if (!db) throw new Error("Firestore not initialized");
    try {
        const q = query(collection(db, `artifacts/${appId}/public/data/characterComics`));
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => {
            // Use the document ID (e.g., "green_arrow") as the key
            characterComicsData.set(doc.id, doc.data());
        });
    } catch (error) {
        console.warn("Could not load character comics data:", error.message);
        // This is not a critical failure, so we just log a warning.
    }
}

async function loadUserData() {
    if (!userId) return;
    await Promise.all([
        loadRosterFromFirestore(),
        loadSavedTeamsFromFirestore()
    ]);
    populateChampionSelect();
}

function populateStaticDropdowns() {
    populateDropdown(DOM.champStarColor, Object.keys(GAME_CONSTANTS.STAR_COLOR_TIERS), "Unlocked");
    populateDropdown(DOM.legacyPieceStarColor, Object.keys(GAME_CONSTANTS.LEGACY_PIECE_STAR_TIER_MODIFIER), "Unlocked");
    
    const forceLevels = Object.keys(GAME_CONSTANTS.FORCE_LEVEL_MODIFIER).map(i => ({ value: i, text: `${i} / 5` }));
    populateDropdown(DOM.champForceLevel, forceLevels, '0');
    
    document.querySelectorAll('.gear-rarity-select').forEach(sel => {
        populateDropdown(sel, GAME_CONSTANTS.STANDARD_GEAR_RARITIES.map(r => ({value: r, text: r})));
    });

    populateLegacyPieceSelect();
}

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

// =================================================================================================
// #endregion INITIALIZATION
// =================================================================================================


// =================================================================================================
// #region Event Listeners
// =================================================================================================

function attachEventListeners() {
    // Wizard Navigation
    DOM.step1Btn.addEventListener('click', () => navigateToStep(1));
    DOM.step2Btn.addEventListener('click', () => navigateToStep(2));

    // Roster Management
    DOM.addUpdateChampionBtn.addEventListener('click', handleAddUpdateChampion);
    DOM.cancelEditBtn.addEventListener('click', cancelEditMode);
    DOM.prefillRosterBtn.addEventListener('click', handlePrefillRoster);
    DOM.exportRosterBtn.addEventListener('click', handleExportRoster);
    DOM.importRosterBtn.addEventListener('click', () => DOM.importRosterFile.click());
    DOM.importRosterFile.addEventListener('change', handleImportRoster);

    // Custom Dropdown
    DOM.customChampDropdownTrigger.addEventListener('click', toggleChampionDropdown);
    DOM.champSelectDb.addEventListener('change', (e) => updateChampionFormDisplay(e.target.value));

    document.addEventListener('click', (event) => {
        if (DOM.customChampDropdown && !DOM.customChampDropdown.contains(event.target)) {
            DOM.customChampDropdownOptions.classList.add('hidden');
            DOM.customChampDropdownTrigger.setAttribute('aria-expanded', 'false');
        }
    });
    
    // Team Calculation & Results
    DOM.calculateBtn.addEventListener('click', handleCalculate);
    DOM.excludeSavedTeamCheckbox.addEventListener('change', (e) => {
        DOM.selectExclusionTeamDropdown.disabled = !e.target.checked;
    });
    DOM.resultsOutput.addEventListener('click', (e) => {
        const target = e.target;
        if (target.id === 'save-team-btn') {
            saveCurrentBestTeam();
        } else if (target.id === 'reset-team-btn') {
            handleResetTeam();
        } else if (target.dataset.action === 'swap') {
            const index = parseInt(target.dataset.index, 10);
            openSwapModal(index);
        }
    });

    // --- ADD THIS NEW LISTENER ---
    DOM.savedTeamsList.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        const id = button.dataset.id;

        switch (action) {
            case 'share':
                shareTeam(id);
                break;
            case 'unshare':
                unshareTeam(id, button.dataset.publicId);
                break;
            case 'rename':
                renameSavedTeam(id, button.dataset.name);
                break;
            case 'delete':
                deleteSavedTeam(id);
                break;
        }
    });
}

function navigateToStep(stepNum) {
    const isStep1 = stepNum === 1;
    DOM.stepper.classList.toggle('step-2', !isStep1);
    DOM.step1Btn.classList.toggle('active', isStep1);
    DOM.step2Btn.classList.toggle('active', !isStep1);
    DOM.step1Content.classList.toggle('hidden-step', !isStep1);
    DOM.step2Content.classList.toggle('hidden-step', isStep1);
}

// =================================================================================================
// #endregion Event Listeners
// =================================================================================================


// =================================================================================================
// #region Roster Management
// =================================================================================================
async function handleAddUpdateChampion() {
    const selectedDbChampionId = DOM.champSelectDb.value;
    const selectedLegacyPieceId = DOM.legacyPieceSelect.value;
    const selectedLegacyPieceStarTier = DOM.legacyPieceStarColor.value;
    const selectedForceLevel = parseInt(DOM.champForceLevel.value, 10) || 0;

    let legacyPieceData = {
        id: null, name: "None", rarity: "None", starColorTier: "Unlocked", description: ""
    };
    if (selectedLegacyPieceId) {
        const dbLp = dbLegacyPieces.find(lp => lp.id === selectedLegacyPieceId);
        if (dbLp) {
            legacyPieceData = {
                id: dbLp.id, name: dbLp.name, rarity: dbLp.baseRarity,
                starColorTier: selectedLegacyPieceStarTier, description: dbLp.description || ""
            };
        }
    }

    if (editingChampionId) {
        const championIndex = playerRoster.findIndex(c => c.id === editingChampionId);
        if (championIndex === -1) {
            cancelEditMode();
            return;
        }
        const baseChampionDataForUpdate = dbChampions.find(dbChamp => dbChamp.id === playerRoster[championIndex].dbChampionId);
        
        playerRoster[championIndex] = {
            ...playerRoster[championIndex],
            isHealer: baseChampionDataForUpdate ? (baseChampionDataForUpdate.isHealer === true) : (playerRoster[championIndex].isHealer === true),
            starColorTier: DOM.champStarColor.value,
            forceLevel: selectedForceLevel,
            gear: {
                head: { rarity: DOM.gear.head.value },
                arms: { rarity: DOM.gear.arms.value },
                legs: { rarity: DOM.gear.legs.value },
                chest: { rarity: DOM.gear.chest.value },
                waist: { rarity: DOM.gear.waist.value },
            },
            legacyPiece: legacyPieceData,
        };

        const updatedChampion = playerRoster[championIndex];
        await recalculateAndUpdateSavedTeams(updatedChampion);

        showToast(`${playerRoster[championIndex].name} updated!`, "success");

    } else {
        if (!selectedDbChampionId) {
            showToast('Please select a champion.', 'warning');
            return;
        }
        if (playerRoster.some(rc => rc.dbChampionId === selectedDbChampionId)) {
            showToast('Champion already in roster.', 'warning');
            return;
        }
        const baseChampionData = dbChampions.find(c => c.id === selectedDbChampionId);
        if (!baseChampionData) {
            showToast('Base champion data not found.', 'error');
            return;
        }
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
                head: { rarity: DOM.gear.head.value },
                arms: { rarity: DOM.gear.arms.value },
                legs: { rarity: DOM.gear.legs.value },
                chest: { rarity: DOM.gear.chest.value },
                waist: { rarity: DOM.gear.waist.value },
            },
            legacyPiece: legacyPieceData
        };
        playerRoster.push(newChampion);
        showToast(`${newChampion.name} added!`, "success");
    }
    
    await saveRosterToFirestore();
    renderRosterTable();
    populateChampionSelect();
    cancelEditMode();
}


function renderRosterTable() {
    // If a DataTable instance already exists, destroy it to prevent errors
    if (rosterDataTable) {
        rosterDataTable.destroy();
        rosterDataTable = null;
    }

    const tableElement = document.getElementById('roster-table');
    const tbody = tableElement.querySelector('tbody');

    if (playerRoster.length === 0) {
        // Roster is empty: hide the table, show the empty message.
        tableElement.style.display = 'none';
        DOM.rosterEmptyMessage.classList.remove('hidden');
        DOM.prefillRosterBtn.classList.remove('hidden');
        return;
    }

    // Roster has players: show the table, hide the empty message.
    tableElement.style.display = ''; // Revert to default display (e.g., 'table')
    DOM.rosterEmptyMessage.classList.add('hidden');
    DOM.prefillRosterBtn.classList.add('hidden');
    tbody.innerHTML = ''; // Clear previous rows

    playerRoster.forEach(champ => {
        const score = Math.round(TeamCalculator.calculateIndividualChampionScore(champ, GAME_CONSTANTS));
        
        let upgradeButton = '';
        if (champ.baseRarity === 'Legendary' && champ.canUpgrade) {
            upgradeButton = `<button class="btn btn-secondary btn-sm" data-action="upgrade" data-id="${champ.id}">Upgrade</button>`;
        }

        let legacyDisplay = "None";
        const legacyPiece = champ.legacyPiece || {};
        if (legacyPiece.id && legacyPiece.rarity && legacyPiece.rarity !== "None") {
            const lpStarRating = getStarRatingHTML(legacyPiece.starColorTier || "Unlocked");
            legacyDisplay = `${legacyPiece.name} (${legacyPiece.rarity})<br><div class="text-xs">${lpStarRating}</div>`;
        }

        const healerIconHtml = champ.isHealer ? getHealerPlaceholder() : '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><div class="flex items-center">${healerIconHtml}${champ.name}</div></td>
            <td>${getClassPlaceholder(champ.class)}</td>
            <td>${champ.baseRarity}</td>
            <td>${getStarRatingHTML(champ.starColorTier)}</td>
            <td>${score}</td>
            <td>${legacyDisplay}</td>
            <td class="actions-cell">
                ${upgradeButton}
                <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${champ.id}">Edit</button>
                <button class="btn btn-secondary btn-sm" data-action="remove" data-id="${champ.id}">Remove</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Attach listeners to the newly created buttons
    tbody.querySelectorAll('[data-action="edit"]').forEach(btn => btn.addEventListener('click', (e) => handleEditChampion(parseFloat(e.target.dataset.id))));
    tbody.querySelectorAll('[data-action="remove"]').forEach(btn => btn.addEventListener('click', (e) => handleRemoveChampion(parseFloat(e.target.dataset.id))));
    tbody.querySelectorAll('[data-action="upgrade"]').forEach(btn => btn.addEventListener('click', (e) => handleUpgradeChampion(parseFloat(e.target.dataset.id))));

    // Initialize DataTables
    if (typeof $ !== 'undefined' && $.fn.DataTable) {
        rosterDataTable = new $('#roster-table').DataTable({
            responsive: true,
            order: [[4, 'desc']],
            columnDefs: [ { targets: [6], orderable: false } ]
        });
    }
}

function cancelEditMode() {
    editingChampionId = null;
    DOM.formModeTitle.textContent = "Add Champion to Roster";
    const btnText = DOM.addUpdateChampionBtn.firstChild;
    if (btnText) btnText.nodeValue = "Add Champion ";
    DOM.cancelEditBtn.classList.add('hidden');
    DOM.customChampDropdownTrigger.disabled = false;
    
    // Manual form reset
    if (DOM.rosterFormContainer) {
         DOM.champSelectDb.value = '';
         DOM.champStarColor.value = 'Unlocked';
         DOM.champForceLevel.value = '0';
         Object.values(DOM.gear).forEach(el => el.value = 'None');
         DOM.legacyPieceSelect.value = '';
         DOM.legacyPieceStarColor.value = 'Unlocked';
    }
    
    populateChampionSelect();
    updateChampionFormDisplay(null);
}


function handleEditChampion(id) {
    const champ = playerRoster.find(c => c.id === id);
    if (!champ) return;
    
    editingChampionId = id;
    DOM.formModeTitle.textContent = "Edit Champion";
    const btnText = DOM.addUpdateChampionBtn.firstChild;
    if (btnText) btnText.nodeValue = "Update Champion ";
    DOM.cancelEditBtn.classList.remove('hidden');

    // Populate form
    DOM.champSelectDb.value = champ.dbChampionId;
    DOM.champStarColor.value = champ.starColorTier;
    DOM.champForceLevel.value = champ.forceLevel;
    
    Object.keys(DOM.gear).forEach(key => {
        const gearValue = champ.gear?.[key];
        DOM.gear[key].value = gearValue?.rarity || gearValue || 'None';
    });

    populateLegacyPieceSelect(champ.class);
    DOM.legacyPieceSelect.value = champ.legacyPiece?.id || '';
    DOM.legacyPieceStarColor.value = champ.legacyPiece?.starColorTier || 'Unlocked';
    
    updateChampionFormDisplay(champ.dbChampionId, true);
    DOM.customChampDropdownTrigger.disabled = true;

    if (DOM.rosterFormContainer) {
        window.scrollTo({ top: DOM.rosterFormContainer.offsetTop - 125, behavior: 'smooth' });
    }
}


function handleRemoveChampion(id) {
    const champ = playerRoster.find(c => c.id === id);
    if (!champ) return;

    openConfirmModal('Confirm Deletion', `Are you sure you want to remove ${champ.name} from your roster?`, async () => {
        playerRoster = playerRoster.filter(c => c.id !== id);
        await saveRosterToFirestore();
        renderRosterTable();
        populateChampionSelect();
        showToast(`${champ.name} removed from roster.`, 'info');
    });
}

async function handleUpgradeChampion(id) {
    const champIndex = playerRoster.findIndex(c => c.id === id);
    if (champIndex === -1) {
        showToast("Champion not found for upgrade.", "error");
        return;
    }
    const champ = playerRoster[champIndex];
    
    const message = `Upgrade ${champ.name} from Legendary to Mythic? This is permanent and also upgrades their star tier to Blue 5-Star.`;
    
    openConfirmModal('Confirm Upgrade', message, async () => {
        const upgradedChamp = { ...champ };
        if (upgradedChamp.upgradeSynergy && !upgradedChamp.inherentSynergies.includes(upgradedChamp.upgradeSynergy)) {
            upgradedChamp.inherentSynergies.push(upgradedChamp.upgradeSynergy);
        }
        upgradedChamp.baseRarity = "Mythic";
        upgradedChamp.canUpgrade = false;
        upgradedChamp.starColorTier = "Blue 5-Star";

        upgradedChamp.individualScore = TeamCalculator.calculateIndividualChampionScore(upgradedChamp, GAME_CONSTANTS);
        
        playerRoster[champIndex] = upgradedChamp;
        
        await recalculateAndUpdateSavedTeams(upgradedChamp);
        await saveRosterToFirestore();
        
        renderRosterTable();
        
        showToast(`${upgradedChamp.name} upgraded to Mythic!`, 'success');
    });
}

async function recalculateAndUpdateSavedTeams(upgradedChampion) {
    if (!savedTeams || savedTeams.length === 0 || !upgradedChampion) return;

    const teamsToUpdate = savedTeams.filter(team =>
        team.members.some(member => member.dbChampionId === upgradedChampion.dbChampionId)
    );

    if (teamsToUpdate.length === 0) return;

    showToast(`Found ${teamsToUpdate.length} saved team(s) to update...`, 'info');
    const calculator = new TeamCalculator(dbSynergies, GAME_CONSTANTS);

    for (const team of teamsToUpdate) {
        let updatedMembers = team.members.map(member => 
            member.dbChampionId === upgradedChampion.dbChampionId ? { ...upgradedChampion } : member
        );
        
        // Ensure all members of the team have up-to-date scores
        updatedMembers = ensureIndividualScores(updatedMembers, dbChampions);

        const reEvaluatedTeam = calculator.evaluateTeam(updatedMembers);

        const dataToUpdate = {
            members: reEvaluatedTeam.members.map(m => ({
                 dbChampionId: m.dbChampionId, starColorTier: m.starColorTier, forceLevel: m.forceLevel, gear: m.gear, legacyPiece: m.legacyPiece 
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
    
    renderSavedTeams();
    showToast(`${teamsToUpdate.length} saved team(s) updated successfully!`, 'success');
}

function handlePrefillRoster() {
    const prefillAction = async () => {
        if (dbChampions.length === 0) {
            showToast("Champion data not loaded yet. Cannot pre-fill roster.", "error");
            return;
        }

        playerRoster = dbChampions.map(baseChamp => {
            const defaultGear = {};
            Object.keys(DOM.gear).forEach(slot => {
                defaultGear[slot] = { rarity: 'None' };
            });
            return {
                id: Date.now() + Math.random(),
                dbChampionId: baseChamp.id,
                name: baseChamp.name,
                baseRarity: baseChamp.baseRarity,
                class: baseChamp.class || "N/A",
                isHealer: baseChamp.isHealer === true,
                inherentSynergies: baseChamp.inherentSynergies || [],
                starColorTier: "Unlocked",
                forceLevel: 0,
                gear: defaultGear,
                legacyPiece: {
                    id: null,
                    name: "None",
                    rarity: "None",
                    starColorTier: "Unlocked",
                    description: ""
                }
            };
        });

        await saveRosterToFirestore();
        renderRosterTable();
        populateChampionSelect();
        showToast("Roster pre-filled with all champions!", "success");
    };

    if (playerRoster.length > 0) {
        openConfirmModal(
            'Overwrite Roster?',
            'This will replace your current roster with a default set of all champions. Are you sure?',
            prefillAction
        );
    } else {
        prefillAction(); // If roster is empty, no need for confirmation.
    }
}

function handleExportRoster() {
    if (playerRoster.length === 0) {
        showToast("Roster is empty, nothing to export.", "warning");
        return;
    }

    const exportableRoster = playerRoster.map(c => ({
        dbChampionId: c.dbChampionId,
        starColorTier: c.starColorTier,
        forceLevel: c.forceLevel || 0,
        gear: {
            head: {
                rarity: c.gear.head.rarity
            },
            arms: {
                rarity: c.gear.arms.rarity
            },
            legs: {
                rarity: c.gear.legs.rarity
            },
            chest: {
                rarity: c.gear.chest.rarity
            },
            waist: {
                rarity: c.gear.waist.rarity
            },
        },
        legacyPiece: {
            id: c.legacyPiece.id,
            starColorTier: c.legacyPiece.starColorTier || "Unlocked"
        }
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
}

function handleImportRoster(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }
    if (file.type !== "application/json") {
        showToast("Invalid file type. Please select a JSON file.", "error");
        DOM.importRosterFile.value = ''; // Reset input
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const processImport = async () => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (!Array.isArray(importedData)) {
                    showToast("Invalid roster format: JSON is not an array.", "error");
                    return;
                }

                const newRoster = [];
                let importErrors = 0;

                for (const importedChamp of importedData) {
                    const baseChampionData = dbChampions.find(c => c.id === importedChamp.dbChampionId);
                    if (!baseChampionData) {
                        importErrors++;
                        continue;
                    }
                    let legacyPieceData = {
                        id: null,
                        name: "None",
                        rarity: "None",
                        starColorTier: "Unlocked",
                        description: ""
                    };
                    if (importedChamp.legacyPiece && importedChamp.legacyPiece.id) {
                        const dbLp = dbLegacyPieces.find(lp => lp.id === importedChamp.legacyPiece.id);
                        if (dbLp) {
                            const lpStarTier = importedChamp.legacyPiece.starColorTier || "Unlocked";
                            legacyPieceData = {
                                id: dbLp.id,
                                name: dbLp.name,
                                rarity: dbLp.baseRarity,
                                starColorTier: lpStarTier,
                                description: dbLp.description || ""
                            };
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
                        forceLevel: importedChamp.forceLevel || 0,
                        gear: {
                            head: {
                                rarity: importedChamp.gear?.head?.rarity || "None"
                            },
                            arms: {
                                rarity: importedChamp.gear?.arms?.rarity || "None"
                            },
                            legs: {
                                rarity: importedChamp.gear?.legs?.rarity || "None"
                            },
                            chest: {
                                rarity: importedChamp.gear?.chest?.rarity || "None"
                            },
                            waist: {
                                rarity: importedChamp.gear?.waist?.rarity || "None"
                            },
                        },
                        legacyPiece: legacyPieceData
                    };
                    newRoster.push(playerChampion);
                }

                playerRoster = newRoster;
                await saveRosterToFirestore();
                renderRosterTable();
                populateChampionSelect();

                if (importErrors > 0) {
                    showToast(`Roster imported successfully with ${importErrors} champion(s) skipped.`, "warning");
                } else {
                    showToast("Roster imported successfully!", "success");
                }
            } catch (err) {
                console.error("Error processing imported roster:", err);
                showToast("Failed to read or process the roster file.", "error");
            } finally {
                DOM.importRosterFile.value = ''; // Reset input
            }
        };

        openConfirmModal(
            'Confirm Import',
            'This will overwrite your current roster. Are you sure you want to continue?',
            processImport,
            () => {
                DOM.importRosterFile.value = ''; // Reset on cancel
                showToast("Import cancelled.", "info");
            }
        );
    };

    reader.readAsText(file);
}

async function saveRosterToFirestore() {
    if (!userId) return;
    DOM.saveRosterIndicator.classList.remove('hidden');
    try {
        const rosterToSave = playerRoster.map(champ => {
            const {
                individualScore,
                ...rest
            } = champ;
            return rest;
        });
        await setDoc(doc(db, `artifacts/${appId}/users/${userId}/roster/myRoster`), { champions: rosterToSave });
    } catch(e) {
        showToast("Failed to save roster.", "error");
    } finally {
        DOM.saveRosterIndicator.classList.add('hidden');
    }
}


async function loadRosterFromFirestore() {
    if (!userId) return;
    const docRef = doc(db, `artifacts/${appId}/users/${userId}/roster/myRoster`);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data().champions || [];
        playerRoster = data.map(savedChamp => {
            const base = dbChampions.find(c => c.id === savedChamp.dbChampionId) || {};
            // Explicitly merge properties to ensure base data like `canUpgrade` is always fresh
            const mergedChamp = {
                ...base,
                ...savedChamp,
            };
            return mergedChamp;
        });
    } else {
        playerRoster = [];
    }
    renderRosterTable();
}
// =================================================================================================
// #endregion Roster Management
// =================================================================================================


// =================================================================================================
// #region Team Calculation & Display
// =================================================================================================
function getScoreBreakdownHtml(team) {
    if (!team || !team.scoreBreakdown) return '';

    const { base, percentageSynergyBonus, flatSynergyBonus, synergyDepthBonus, classDiversityBonus, subtotalAfterSynergies } = team.scoreBreakdown;
    let breakdownHtml = `
        <details class="score-breakdown-details">
            <summary>View Score Calculation</summary>
            <div class="breakdown-content">
                <div class="breakdown-row"><span>Base Individual Scores Sum</span><strong>${Math.round(base)}</strong></div>
    `;

    // Add active synergies
    team.activeSynergies.forEach(synergy => {
        breakdownHtml += `<div class="breakdown-row is-bonus"><span>${synergy.name} (${synergy.appliedAtMemberCount} members)</span><strong>+${Math.round(synergy.calculatedBonus)}</strong></div>`;
    });

    // Add synergy depth bonus if it exists
    if (synergyDepthBonus > 0) {
        breakdownHtml += `<div class="breakdown-row is-bonus"><span>Synergy Depth Bonus</span><strong>+${Math.round(synergyDepthBonus)}</strong></div>`;
    }
    
    breakdownHtml += `<div class="breakdown-row is-subtotal"><span>Subtotal after Synergies</span><strong>${Math.round(subtotalAfterSynergies)}</strong></div>`;

    // Add class diversity bonus if it was applied
    if (team.classDiversityBonusApplied) {
        breakdownHtml += `<div class="breakdown-row is-bonus"><span>Class Diversity Bonus (x${GAME_CONSTANTS.CLASS_DIVERSITY_MULTIPLIER})</span><strong>+${Math.round(classDiversityBonus)}</strong></div>`;
    }

    // Add the final total score
    breakdownHtml += `<div class="breakdown-row is-total"><span>Final Team Score</span><strong>${Math.round(team.totalScore)}</strong></div>`;
    
    breakdownHtml += `</div></details>`;
    return breakdownHtml;
}

function openSwapModal(indexToReplace) {
    const championToReplace = currentDisplayedTeam.members[indexToReplace];
    const modalBody = DOM.swapChampionModal.querySelector('.modal-content');

    if (!modalBody) {
        // Create modal content if it doesn't exist
        DOM.swapChampionModal.innerHTML = `
            <div class="modal-content">
                <h3 id="swap-modal-title">Swap Out ${championToReplace.name}</h3>
                <div id="swap-modal-body" class="max-h-96 overflow-y-auto"></div>
                <div class="modal-buttons">
                    <button class="btn btn-secondary" data-action="close-swap">Cancel</button>
                </div>
            </div>
        `;
        DOM.swapChampionModal.querySelector('[data-action="close-swap"]').addEventListener('click', () => closeModal('swapChampionModal'));
    } else {
         modalBody.querySelector('h3').textContent = `Swap Out ${championToReplace.name}`;
    }

    const swapBody = DOM.swapChampionModal.querySelector('#swap-modal-body');
    swapBody.innerHTML = '<p class="text-slate-400 text-center">Loading available champions...</p>';

    const currentTeamIds = new Set(currentDisplayedTeam.members.map(m => m.id));
    const availableChamps = playerRoster.filter(p => !currentTeamIds.has(p.id))
                                       .sort((a,b) => TeamCalculator.calculateIndividualChampionScore(b, GAME_CONSTANTS) - TeamCalculator.calculateIndividualChampionScore(a, GAME_CONSTANTS));

    if (availableChamps.length === 0) {
        swapBody.innerHTML = '<p class="text-slate-400 text-center">No other champions are available to swap in.</p>';
    } else {
        // --- This is the updated rendering logic ---
        const list = availableChamps.map(champ => {
            const starRatingHtml = getStarRatingHTML(champ.starColorTier);
            const synergyIconsHtml = (champ.inherentSynergies || []).map(getSynergyIcon).join('');

            return `
                <li class="flex items-center justify-between p-2 hover:bg-slate-700 rounded-md cursor-pointer" data-action="swap-select" data-id="${champ.id}">
                    
                    <div class="flex items-center gap-x-3">
                        <span class="font-semibold text-white">${champ.name}</span>
                        <div class="flex gap-x-1">${synergyIconsHtml}</div>
                    </div>

                    <div class="text-sm">${starRatingHtml}</div>

                </li>
            `;
        }).join('');
        swapBody.innerHTML = `<ul class="space-y-1">${list}</ul>`;
    }

    // Attach delegated event listener for this specific modal instance
    swapBody.onclick = (e) => {
        const target = e.target.closest('li[data-action="swap-select"]');
        if (target) {
            const newChampId = parseFloat(target.dataset.id);
            handleSwap(newChampId, indexToReplace);
        }
    };
    
    openModal('swapChampionModal');
}

function handleSwap(newChampionId, indexToReplace) {
    const newChampion = playerRoster.find(rc => rc.id === newChampionId);
    if (!newChampion) {
        showToast("Error: Selected champion not found.", "error");
        return;
    }

    // Create a new team array with the swapped champion
    const newTeamMembers = [...currentDisplayedTeam.members];
    newTeamMembers[indexToReplace] = newChampion;
    
    // Recalculate the entire team score and synergies
    const calculator = new TeamCalculator(dbSynergies, GAME_CONSTANTS);
    const reEvaluatedTeam = calculator.evaluateTeam(ensureIndividualScores(newTeamMembers, dbChampions));

    // Update the state and re-render the results
    currentDisplayedTeam = reEvaluatedTeam;
    displayTeamResults(currentDisplayedTeam);
    closeModal('swapChampionModal');
    showToast(`${newChampion.name} swapped in.`, 'info');
}

function handleResetTeam() {
    if (originalBestTeam) {
        currentDisplayedTeam = JSON.parse(JSON.stringify(originalBestTeam));
        displayTeamResults(currentDisplayedTeam);
        showToast("Team has been reset to the original.", "info");
    }
}

async function handleCalculate() {
    if (playerRoster.length < 5) {
        showToast("You need at least 5 champions in your roster.", "warning");
        return;
    }
    openModal('processingModal', `
        <div class="modal-content">
            <h3>Calculating...</h3>
            <div class="loading-spinner mx-auto"></div>
            <p id="processing-status" class="text-slate-300 mt-4 text-center">Initializing...</p>
        </div>
    `);
    try {
        let rosterForCalc = playerRoster.map(champ => ({
            ...champ,
            individualScore: TeamCalculator.calculateIndividualChampionScore(champ, GAME_CONSTANTS)
        }));

        if (DOM.excludeSavedTeamCheckbox.checked) {
            const exclusionTeamIds = Array.from(DOM.selectExclusionTeamDropdown.selectedOptions).map(option => option.value);
            if (exclusionTeamIds.length > 0) {
                const championsToExcludeIds = new Set();
                exclusionTeamIds.forEach(teamId => {
                    const teamToExclude = savedTeams.find(st => st.id === teamId);
                    if (teamToExclude?.members) {
                        teamToExclude.members.forEach(member => championsToExcludeIds.add(member.dbChampionId));
                    }
                });
                
                rosterForCalc = rosterForCalc.filter(champ => !championsToExcludeIds.has(champ.dbChampionId));

                if (rosterForCalc.length < 5) {
                    throw new Error("Not enough champions remaining after exclusion to form a team of 5.");
                }
            }
        }
        
        const calculator = new TeamCalculator(dbSynergies, GAME_CONSTANTS);
        const bestTeam = await calculator.findOptimalTeam(rosterForCalc, {
            requireHealer: DOM.requireHealerCheckbox.checked,
            updateProgress: (status, progress) => { 
                const statusP = document.getElementById('processing-status');
                if (statusP) statusP.textContent = status;
            }
        });

        originalBestTeam = JSON.parse(JSON.stringify(bestTeam));
        currentDisplayedTeam = JSON.parse(JSON.stringify(bestTeam));
        
        displayTeamResults(currentDisplayedTeam);

    } catch (e) {
        showToast(e.message, "error");
    } finally {
        closeModal('processingModal');
    }
}

function displayTeamResults(team) {
    if (!team) {
        DOM.resultsOutput.innerHTML = '<p class="text-center text-slate-500">Could not determine an optimal team.</p>';
        return;
    }

    const isModified = originalBestTeam && JSON.stringify(team.members.map(m => m.id)) !== JSON.stringify(originalBestTeam.members.map(m => m.id));
    const scoreBreakdownHtml = getScoreBreakdownHtml(team);

    let html = `
        <div class="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div class="text-center mb-6">
                <h3 class="text-2xl font-bold text-accent">${isModified ? 'Modified Team' : 'Optimal Team Found!'}</h3>
                <p class="text-lg">Total Score: <strong class="text-primary">${Math.round(team.totalScore)}</strong></p>
            </div>
            ${scoreBreakdownHtml}
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
    `;

    team.members.forEach((member, index) => {
        // --- Card Enhancement Logic ---
        const starRating = getStarRatingHTML(member.starColorTier);
        const forceLevel = member.forceLevel > 0 ? `<p class="force-level">Force: ${member.forceLevel} / 5</p>` : '';
        const synergies = (member.inherentSynergies || []).map(getSynergyIcon).join('');
        const championImageName = (member.name || 'Unknown').replace(/[^a-zA-Z0-9-_]/g, "");

        html += `
            <div class="champion-card-enhanced" data-champion-name="${championImageName}">
                <div class="card-background-image"></div>
                <img src="img/champions/avatars/${championImageName}.webp" alt="${member.name}" class="champion-avatar-center">
                <div class="card-content-overlay">
                    <div class="card-header">
                        ${getClassPlaceholder(member.class)}
                        <h4 class="champion-name">${member.name}</h4>
                    </div>
                    <div class="champion-details">
                        <p>${member.baseRarity}</p>
                        ${starRating}
                        ${forceLevel}
                    </div>
                    <div class="synergy-icons">${synergies}</div>
                </div>
                <button class="btn btn-secondary btn-sm swap-button" data-action="swap" data-index="${index}">Swap</button>
            </div>
        `;
    });

    html += `</div><div class="mt-6 text-center flex justify-center items-center gap-3">
        <button id="save-team-btn" class="btn btn-primary">Save This Team</button>
    `;

    if (isModified) {
        html += `<button id="reset-team-btn" class="btn btn-secondary">Reset to Original</button>`;
    }

    html += `</div></div>`;
    DOM.resultsOutput.innerHTML = html;
    applyChampionCardBackgrounds();
}

function renderSavedTeams() {
    const listEl = DOM.savedTeamsList;
    const dropdownEl = DOM.selectExclusionTeamDropdown;

    if (!listEl || !dropdownEl) return;
    
    listEl.innerHTML = '';
    dropdownEl.innerHTML = '';

    if (savedTeams.length === 0) {
        listEl.innerHTML = '<p class="text-center text-slate-500">No teams saved yet.</p>';
        return;
    }

    const calculator = new TeamCalculator(dbSynergies, GAME_CONSTANTS);

    savedTeams.forEach(team => {
        const option = document.createElement('option');
        option.value = team.id;
        option.textContent = team.name;
        dropdownEl.appendChild(option);

        const membersWithScores = ensureIndividualScores(team.members, dbChampions);
        const reEvaluatedTeam = calculator.evaluateTeam(membersWithScores);

        const teamCard = document.createElement('div');
        teamCard.className = 'saved-team-card p-4 border rounded-lg bg-white shadow mb-4';
        
        let shareButtonHtml = team.publicShareId 
            ? `<button class="btn btn-sm btn-secondary" data-action="unshare" data-id="${team.id}" data-public-id="${team.publicShareId}">Unshare</button>`
            : `<button class="btn btn-sm btn-primary" data-action="share" data-id="${team.id}">Share</button>`;
        
        let teamNameHtml = `<h4 class="font-bold text-lg text-accent">${team.name}</h4>`;
        if (team.publicShareId) {
            const shareUrl = `${window.location.origin}${window.location.pathname.replace('teams.html', 'share.html')}?sharedTeamId=${team.publicShareId}`;
            teamNameHtml = `
                <h4 class="font-bold text-lg text-accent flex items-center gap-2">
                    ${team.name}
                    <a href="${shareUrl}" target="_blank" class="text-blue-600 hover:underline" title="View Shared Page">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 inline-block" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                            <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                        </svg>
                    </a>
                </h4>`;
        }
        
        const headerHtml = `
            <div class="flex justify-between items-start mb-4 pb-2 border-b">
                <div>
                    ${teamNameHtml}
                    <p class="text-sm text-slate-600">Total Score: <strong>${Math.round(reEvaluatedTeam.totalScore)}</strong></p>
                </div>
                <div class="flex items-center gap-2">
                    ${shareButtonHtml}
                    <button class="btn btn-sm btn-secondary" data-action="rename" data-id="${team.id}" data-name="${team.name.replace(/'/g, "\\'")}">Rename</button>
                    <button class="btn btn-sm btn-secondary" data-action="delete" data-id="${team.id}">Delete</button>
                </div>
            </div>
        `;
        const membersHtml = `
            <div class="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-3">
                ${reEvaluatedTeam.members.map(member => {
                    const championName = member?.name || "Unknown Champion";
                    const championImageName = championName.replace(/[^a-zA-Z0-9-_]/g, "");
                    const synergies = (member.inherentSynergies || []).map(getSynergyIcon).join('');
                    const forceLevel = member.forceLevel > 0 ? `<p class="force-level !text-xs">Force: ${member.forceLevel} / 5</p>` : '';

                    return `
                    <div class="champion-card-enhanced is-small" data-champion-name="${championImageName}">
                        <div class="card-background-image"></div>
                        <img src="img/champions/avatars/${championImageName}.webp" alt="${championName}" class="champion-avatar-center">
                        <div class="card-content-overlay">
                            <div class="card-header">
                                ${getClassPlaceholder(member.class)}
                                <h4 class="champion-name">${championName}</h4>
                            </div>
                            <div class="champion-details">
                                <p>${member.baseRarity}</p>
                                ${getStarRatingHTML(member.starColorTier)}
                                ${forceLevel}
                            </div>
                            <div class="synergy-icons is-small">${synergies}</div>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        `;

        teamCard.innerHTML = headerHtml + membersHtml;
        listEl.appendChild(teamCard);
    });

    applyChampionCardBackgrounds();
}

async function saveCurrentBestTeam() {
    if (!currentDisplayedTeam) {
        showToast("No team to save.", "warning");
        return;
    }
    const defaultName = `Team (Score: ${Math.round(currentDisplayedTeam.totalScore)})`;
    openTeamNameModal(defaultName, 'Save Team', async (teamName) => {
        if (!userId) {
            showToast("You must be logged in to save teams.", "error");
            return;
        }
        const teamData = {
            name: teamName,
            members: currentDisplayedTeam.members.map(m => ({
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
            totalScore: currentDisplayedTeam.totalScore,
            activeSynergies: currentDisplayedTeam.activeSynergies,
            scoreBreakdown: currentDisplayedTeam.scoreBreakdown,
            baseScoreSum: currentDisplayedTeam.baseScoreSum,
            uniqueClassesCount: currentDisplayedTeam.uniqueClassesCount,
            classDiversityBonusApplied: currentDisplayedTeam.classDiversityBonusApplied,
            createdAt: serverTimestamp()
        };
        try {
            await addDoc(collection(db, `artifacts/${appId}/users/${userId}/savedTeams`), teamData);
            showToast("Team saved successfully!", "success");
            await loadSavedTeamsFromFirestore();
        } catch (error) {
            console.error("Error saving team:", error);
            showToast("Failed to save team.", "error");
        }
    });
}


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
function applyChampionCardBackgrounds() {
    const cards = document.querySelectorAll('.champion-card-enhanced');

    cards.forEach(card => {
        const bgElement = card.querySelector('.card-background-image');
        const championName = card.dataset.championName; // e.g., GreenArrow
        
        if (!bgElement || !championName) return;

        // Format name to match Firestore document ID (e.g., GreenArrow -> green_arrow)
        const championId = championName.replace(/([A-Z])/g, '_$1').toLowerCase().substring(1);
        const comicData = characterComicsData.get(championId);

        if (comicData && comicData.imageUrl) {
            // We found a comic cover, use it as the background
            bgElement.style.backgroundImage = `url('${comicData.imageUrl}')`;
            card.classList.remove('is-fallback-avatar');
        } else {
            // Fallback: use the champion's avatar
            const avatarUrl = `img/champions/avatars/${championName}.webp`;
            bgElement.style.backgroundImage = `url('${avatarUrl}')`;
            card.classList.add('is-fallback-avatar');
        }
    });
}

function getSynergyIcon(synergyName) {
    if (!synergyName) return '';
    const nameForIcon = synergyName.trim().replace(/\s+/g, '_');
    const fallbackSpan = `<span class="icon-placeholder text-xs" style="display:none;">[${synergyName}]</span>`;
    return `<span class="icon-wrapper" title="${synergyName}">
                <img src="img/factions/${nameForIcon}.png" alt="${synergyName}" class="synergy-icon" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';">
                ${fallbackSpan}
            </span>`;
}

function getHealerPlaceholder() {
    const fallbackSpan = `<span class="icon-placeholder" style="display:none;">[H]</span>`;
    return `<span class="icon-wrapper"><img src="img/classes/Healer.png" alt="Healer" title="Healer" class="icon-class-table" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';"/>${fallbackSpan}</span>`;
}

function getClassPlaceholder(className) {
    const cn = (className || "N/A").trim().replace(/\s+/g, '_');
    if (cn === "N/A" || cn === "") {
        return `<span class="icon-placeholder">[Class N/A]</span>`;
    }
    const fallbackSpan = `<span class="icon-placeholder" style="display:none;">[${cn.replace(/_/g, ' ')}]</span>`;
    const imgSrc = `img/classes/${cn}.png`;
    const customClasses = "icon-class-table";

    return `<span class="icon-wrapper"><img src="${imgSrc}" alt="${cn.replace(/_/g, ' ')}" title="${cn.replace(/_/g, ' ')}" class="${customClasses}" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.icon-placeholder'); if (fb) fb.style.display='inline-block';"/>${fallbackSpan}</span>`;
}

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

function showError(message, details = '') {
    showLoading(false);
    DOM.errorIndicator.classList.remove('hidden');
    DOM.errorIndicator.querySelector('p').textContent = message;
    DOM.errorMessageDetails.textContent = details;
}

function toggleChampionDropdown() {
    const isExpanded = DOM.customChampDropdownTrigger.getAttribute('aria-expanded') === 'true';
    DOM.customChampDropdownOptions.classList.toggle('hidden', isExpanded);
    DOM.customChampDropdownTrigger.setAttribute('aria-expanded', String(!isExpanded));
}

function populateChampionSelect() {
    const optionsEl = DOM.customChampDropdownOptions;
    optionsEl.innerHTML = '';
    
    DOM.selectedChampName.textContent = '-- Select Champion --';
    DOM.selectedChampImg.classList.add('hidden');
    DOM.champSelectDb.value = '';

    const rosteredIds = playerRoster.map(c => c.dbChampionId);
    const availableChamps = dbChampions
        .filter(c => !rosteredIds.includes(c.id) || (editingChampionId && c.id === playerRoster.find(r => r.id === editingChampionId)?.dbChampionId))
        .sort((a,b) => a.name.localeCompare(b.name));

    availableChamps.forEach(champ => {
        const li = document.createElement('li');
        li.dataset.value = champ.id;
        li.innerHTML = `
            <div class="flex items-center">
                <img src="img/champions/avatars/${champ.name.replace(/[^a-zA-Z0-9-_]/g, "")}.webp" 
                     alt="${champ.name}" class="champion-avatar">
                <span class="ml-3 font-normal block truncate">${champ.name}</span>
            </div>
        `;
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

function populateLegacyPieceSelect(championClass) {
    const currentVal = DOM.legacyPieceSelect.value;
    DOM.legacyPieceSelect.innerHTML = '<option value="">-- None --</option>';
    let filtered = dbLegacyPieces;
    if (championClass) {
        filtered = dbLegacyPieces.filter(lp => !lp.description || lp.description.toLowerCase().includes(championClass.toLowerCase()));
    }
    filtered.forEach(lp => {
        const opt = document.createElement('option');
        opt.value = lp.id;
        opt.textContent = `${lp.name} (${lp.baseRarity})`;
        DOM.legacyPieceSelect.appendChild(opt);
    });
    if (filtered.some(lp => lp.id === currentVal)) {
        DOM.legacyPieceSelect.value = currentVal;
    }
}

function getStarRatingHTML(tier) {
    if (!tier || tier === "Unlocked") return `<span class="text-slate-400">Unlocked</span>`;
    const tierParts = tier.split(' ');
    if (tierParts.length < 2) return `<span class="text-slate-400">${tier}</span>`;
    
    const color = tierParts[0];
    const stars = tierParts[1];
    const starCount = parseInt(stars, 10);

    if (isNaN(starCount)) return `<span class="text-slate-400">${tier}</span>`;

    let colorClass = 'text-slate-400';
    if (color === 'Red') colorClass = 'text-red-500';
    else if (color === 'Gold') colorClass = 'text-yellow-400';
    else if (color === 'Purple') colorClass = 'text-purple-500';
    else if (color === 'Blue') colorClass = 'text-blue-500';

    return `<div class="star-rating inline-block" title="${tier}"><span class="${colorClass}">${'★'.repeat(starCount)}</span><span class="text-slate-300">${'★'.repeat(5-starCount)}</span></div>`;
}

function openModal(modalId, content) {
    const modal = DOM[modalId];
    if(modal) {
        if(content) modal.innerHTML = content;
        modal.classList.remove('hidden');
        modal.classList.add('is-open');
    }
}

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

function openTeamNameModal(defaultName, title, callback) {
    const content = `
        <div class="modal-content">
            <h3>${title}</h3>
            <div class="input-group">
                <label for="team-name-input" style="color: #94a3b8; font-weight: 600; font-size: 0.875rem; margin-bottom: 0.5rem; display: block;">Team Name</label>
                <input type="text" id="team-name-input" value="${defaultName}" style="width: 100%; background-color: #0d1226; border: 1px solid rgba(59, 130, 246, 0.3); color: #e2e8f0; padding: 0.75rem; border-radius: 8px; font-size: 1rem;">
            </div>
            <div class="modal-buttons">
                <button id="modal-cancel-btn" class="btn btn-secondary">Cancel</button>
                <button id="modal-confirm-btn" class="btn btn-primary">Save</button>
            </div>
        </div>
    `;
    openModal('teamNameModal', content);

    const confirmBtn = DOM.teamNameModal.querySelector('#modal-confirm-btn');
    const cancelBtn = DOM.teamNameModal.querySelector('#modal-cancel-btn');
    const inputEl = DOM.teamNameModal.querySelector('#team-name-input');
    
    teamModalCallback = callback;

    const confirmHandler = () => {
        const teamName = inputEl.value.trim();
        if (teamName && teamModalCallback) {
            teamModalCallback(teamName);
        }
        closeModal('teamNameModal');
    };

    const cancelHandler = () => {
        closeModal('teamNameModal');
    };

    confirmBtn.addEventListener('click', confirmHandler, { once: true });
    cancelBtn.addEventListener('click', cancelHandler, { once: true });
    DOM.teamNameModal.addEventListener('click', (e) => {
        if (e.target === DOM.teamNameModal) cancelHandler();
    }, { once: true });
}


function openConfirmModal(title, message, onConfirm, onCancel = null) {
    const content = `
        <div class="modal-content">
            <h3>${title}</h3>
            <p class="text-slate-300 text-center">${message}</p>
            <div class="modal-buttons">
                <button id="modal-cancel-btn" class="btn btn-secondary">Cancel</button>
                <button id="modal-confirm-btn" class="btn btn-primary">Confirm</button>
            </div>
        </div>
    `;
    openModal('confirmModal', content);

    const confirmBtn = DOM.confirmModal.querySelector('#modal-confirm-btn');
    const cancelBtn = DOM.confirmModal.querySelector('#modal-cancel-btn');

    const confirmHandler = () => {
        if (onConfirm) onConfirm();
        closeModal('confirmModal');
    };
    
    const cancelHandler = () => {
        if (onCancel) onCancel();
        closeModal('confirmModal');
    };

    confirmBtn.addEventListener('click', confirmHandler, { once: true });
    cancelBtn.addEventListener('click', cancelHandler, { once: true });
    DOM.confirmModal.addEventListener('click', (e) => {
        if (e.target === DOM.confirmModal) cancelHandler();
    }, { once: true });
}

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
window.shareTeam = async (teamId) => {
    console.log('click');
    if (!userId || !db) return showToast("Not authenticated.", "error");
    const teamToShare = savedTeams.find(t => t.id === teamId);
    if (!teamToShare) return showToast("Team not found.", "error");

    openConfirmModal('Confirm Share', `Generate a public share link for "${teamToShare.name}"?`, async () => {
        try {
            const publicTeamData = {
                name: teamToShare.name,
                members: teamToShare.members,
                totalScore: teamToShare.totalScore,
                activeSynergies: teamToShare.activeSynergies,
                scoreBreakdown: teamToShare.scoreBreakdown,
                uniqueClassesCount: teamToShare.uniqueClassesCount,
                classDiversityBonusApplied: teamToShare.classDiversityBonusApplied,
                createdAt: serverTimestamp(),
                originalOwnerId: userId
            };
            const docRef = await addDoc(collection(db, `artifacts/${appId}/public/data/sharedTeams`), publicTeamData);
            await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/savedTeams`, teamId), { publicShareId: docRef.id });

            const shareLink = `${window.location.origin}${window.location.pathname.replace('teams.html', 'share.html')}?sharedTeamId=${docRef.id}`;
            
            openShareTeamModal(shareLink);
            
            showToast("Share link generated!", "success");
            await loadSavedTeamsFromFirestore();
        } catch (error) {
            console.error("Error sharing team:", error);
            showToast("Failed to share team.", "error");
        }
    });
};

window.unshareTeam = async (teamId, publicShareId) => {
    if (!userId || !db) return showToast("Not authenticated.", "error");
    const teamToUnshare = savedTeams.find(t => t.id === teamId);
    if (!teamToUnshare) return showToast("Team not found.", "error");

    openConfirmModal('Confirm Unshare', `Remove the public link for "${teamToUnshare.name}"?`, async () => {
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/public/data/sharedTeams`, publicShareId));
            await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/savedTeams`, teamId), { publicShareId: deleteField() });
            showToast("Team is no longer shared.", "success");
            await loadSavedTeamsFromFirestore();
        } catch (error) {
            console.error("Error unsharing team:", error);
            showToast("Failed to unshare team.", "error");
        }
    });
};

window.renameSavedTeam = (teamId, currentName) => {
    if (!userId || !db) return showToast("Not authenticated.", "error");
    openTeamNameModal(currentName, 'Rename Team', async (newName) => {
        if (newName && newName.trim() !== "" && newName.trim() !== currentName) {
            try {
                const teamDocRef = doc(db, `artifacts/${appId}/users/${userId}/savedTeams`, teamId);
                await updateDoc(teamDocRef, { name: newName.trim() });

                const team = savedTeams.find(t => t.id === teamId);
                if (team && team.publicShareId) {
                    const publicTeamDocRef = doc(db, `artifacts/${appId}/public/data/sharedTeams`, team.publicShareId);
                    await updateDoc(publicTeamDocRef, { name: newName.trim() });
                }

                showToast("Team renamed successfully!", "success");
                await loadSavedTeamsFromFirestore();
            } catch (error) {
                console.error("Error renaming team:", error);
                showToast("Failed to rename team.", "error");
            }
        }
    });
};

window.deleteSavedTeam = (teamId) => {
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
            await loadSavedTeamsFromFirestore();
        } catch (error) {
            console.error("Error deleting team:", error);
            showToast("Failed to delete team.", "error");
        }
    });
};

function openShareTeamModal(shareLink) {
    const content = `
        <div class="modal-content">
            <h3>Share Team Link</h3>
            <p class="text-slate-300 text-center mb-4">Anyone with this link can view this team.</p>
            <div class="input-group">
                <input type="text" id="share-link-input" value="${shareLink}" readonly style="width: 100%; background-color: #0d1226; border: 1px solid rgba(59, 130, 246, 0.3); color: #e2e8f0; padding: 0.75rem; border-radius: 8px; font-size: 1rem;">
            </div>
            <div class="modal-buttons mt-4">
                 <button id="modal-close-btn" class="btn btn-secondary">Close</button>
                 <button id="modal-copy-btn" class="btn btn-primary">Copy Link</button>
            </div>
        </div>
    `;
    openModal('shareTeamModal', content);
    
    const copyBtn = DOM.shareTeamModal.querySelector('#modal-copy-btn');
    const closeBtn = DOM.shareTeamModal.querySelector('#modal-close-btn');
    const inputEl = DOM.shareTeamModal.querySelector('#share-link-input');

    copyBtn.addEventListener('click', () => {
        inputEl.select();
        document.execCommand('copy');
        showToast('Link copied to clipboard!', 'success');
    });
    
    closeBtn.addEventListener('click', () => closeModal('shareTeamModal'));
}
