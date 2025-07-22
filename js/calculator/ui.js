/**
 * @file js/calculator/ui.js
 * @fileoverview Handles UI interactions, event listeners, and data flow
 * for the redesigned Anvil Calculator.
 * @version 2.3.0 - Community Average Feature
 */

import { calculateExpectedValue, runProbabilitySimulation } from './core.js';
import { drawCostCard, drawProbabilityChart, drawMonteCarloChart } from './canvas.js';
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

// #region --- DOM ELEMENT REFERENCES ---
const DOM = {
    // Wizard
    stepper: document.getElementById('stepper'),
    step1Btn: document.getElementById('step-btn-1'),
    step2Btn: document.getElementById('step-btn-2'),
    step1Content: document.getElementById('step-1-content'),
    step2Content: document.getElementById('step-2-content'),
    calculateBtn: document.getElementById('calculateBtn'),

    // Inputs
    lmChampionSelect: document.getElementById('lmChampionSelect'),
    startStarLevel: document.getElementById('startStarLevel'),
    targetStarLevel: document.getElementById('targetStarLevel'),
    toggleUnlockCost: document.getElementById('toggleUnlockCost'),
    currentMythicPity: document.getElementById('currentMythicPity'),
    currentLMPity: document.getElementById('currentLMPity'),
    anvilBudget: document.getElementById('anvilBudget'),
    mythicProbability: document.getElementById('mythicProbability'),
    mythicHardPity: document.getElementById('mythicHardPity'),
    lmRateUpChance: document.getElementById('lmRateUpChance'),
    lmShardsYield: document.getElementById('lmShardsYield'),

    // Custom Dropdown Elements
    customChampionDropdown: document.getElementById('custom-champion-dropdown'),
    customDropdownTrigger: document.getElementById('custom-champion-dropdown-trigger'),
    customDropdownOptions: document.getElementById('custom-champion-dropdown-options'),
    selectedChampionImg: document.getElementById('selected-champion-img'),
    selectedChampionName: document.getElementById('selected-champion-name'),
    
    // Reference the new button
    guidanceButtons: document.getElementById('guidanceButtons'),
    applyCommunityAvgBtn: document.getElementById('applyCommunityAvgBtn'),

    // Results
    resultsContainer: document.getElementById('results-container'),
    probabilitySummary: document.getElementById('probability-summary'),
    budgetDisplay: document.getElementById('budget-display'),
    
    // Accessibility
    canvasAccessibility: document.getElementById('canvas-accessibility'),

    // Shard Requirements
    shardRequirementSummary: document.getElementById('shard-requirement-summary'),

    // Live Tracker
    liveTrackerContainer: document.getElementById('live-tracker-container'),
    logPullsBtn: document.getElementById('log-pulls-btn'),
    pullsMadeInput: document.getElementById('pulls-made'),
    lmPulledCountInput: document.getElementById('lm-pulled-count'),
    otherMythicCountInput: document.getElementById('other-mythic-count'),
    lmPulledContainer: document.getElementById('lm-pulled-container'),
    lmPulledCheckbox: document.getElementById('lm-pulled'),
    liveAnvilsSpent: document.getElementById('live-anvils-spent'),
    liveShardsAcquired: document.getElementById('live-shards-acquired'),
    liveMythicPity: document.getElementById('live-mythic-pity'),
    liveLMPity: document.getElementById('live-lm-pity'),
    liveShardsRemaining: document.getElementById('live-shards-remaining'),
    liveLmRemainingGoal: document.getElementById('live-lm-remaining-goal'),
    liveLmPulledTotal: document.getElementById('live-lm-pulled-total'),
    liveCurrentStarLevel: document.getElementById('live-current-star-level'),
};

// #region --- DATA & STATE ---
const SHARD_REQUIREMENTS_ORDERED = [
    { level: "Red 5-Star", shards: 1000 }, { level: "Red 4-Star", shards: 920 },
    { level: "Red 3-Star", shards: 840 }, { level: "Red 2-Star", shards: 760 },
    { level: "Red 1-Star", shards: 680 }, { level: "Gold 5-Star", shards: 600 },
    { level: "Gold 4-Star", shards: 540 }, { level: "Gold 3-Star", shards: 480 },
    { level: "Gold 2-Star", shards: 440 }, { level: "Gold 1-Star", shards: 400 },
    { level: "Purple 5-Star", shards: 360 }, { level: "Purple 4-Star", shards: 320 },
    { level: "Purple 3-Star", shards: 280 }, { level: "Purple 2-Star", shards: 240 },
    { level: "Purple 1-Star", shards: 200 }, { level: "Blue 5-Star", shards: 160 },
    { level: "Blue 4-Star", shards: 130 }, { level: "Blue 3-Star", shards: 100 },
    { level: "Blue 2-Star", shards: 80 }, { level: "Blue 1-Star", shards: 60 },
    { level: "White 5-Star", shards: 40 }, { level: "White 4-Star", shards: 20 },
    { level: "White 3-Star", shards: 10 }, { level: "White 2-Star", shards: 5 },
    { level: "White 1-Star", shards: 2 }
];

let db;
let analytics;
let startStarSelectorControl = null;
let targetStarSelectorControl = null;
let initialCalculationInputs = null;
let liveProgressState = null;

// #region --- UI INITIALIZATION & EVENT LISTENERS ---

/**
 * Checks the URL for a 'champion' parameter and pre-selects them.
 */
function handleUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const championIdFromUrl = urlParams.get('addChampion');

    if (championIdFromUrl) {
        const championOption = DOM.customDropdownOptions.querySelector(`li[data-value="${championIdFromUrl}"]`);
        if (championOption) {
            championOption.click();
        } else {
            console.warn(`Champion with ID '${championIdFromUrl}' not found in the dropdown.`);
        }
    }
}

/**
 * Determines the current star level based on the total number of shards.
 * @param {number} totalShards - The total shards a champion has.
 * @returns {string} The name of the star level.
 */
function getStarLevelFromShards(totalShards) {
    for (const tier of SHARD_REQUIREMENTS_ORDERED) {
        if (totalShards >= tier.shards) {
            return tier.level;
        }
    }
    return "Base Character";
}

/**
 * Fetches champion data from Firestore and populates the custom dropdown.
 */
async function fetchAndPopulateChampions() {
    if (!db) {
        console.error("Firestore DB is not initialized.");
        DOM.selectedChampionName.textContent = 'DB Error';
        return;
    }

    DOM.customDropdownTrigger.disabled = true;
    DOM.selectedChampionName.textContent = 'Loading...';
    DOM.customDropdownOptions.innerHTML = '<li class="text-gray-500 px-4 py-2">Loading...</li>';

    try {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'dc-dark-legion-builder';
        const championsRef = collection(db, `artifacts/${appId}/public/data/champions`);
        const q = query(championsRef, where("baseRarity", "==", "Limited Mythic"), orderBy("name"));
        const querySnapshot = await getDocs(q);

        DOM.customDropdownOptions.innerHTML = '';

        if (querySnapshot.empty) {
            DOM.selectedChampionName.textContent = 'No Champions Found';
        } else {
            const defaultOption = document.createElement('li');
            defaultOption.className = 'px-4 py-2 text-gray-500';
            defaultOption.textContent = '-- Select a Champion --';
            DOM.customDropdownOptions.appendChild(defaultOption);

            querySnapshot.forEach((doc) => {
                const champ = doc.data();
                const optionEl = document.createElement('li');
                const sanitizedName = (champ.name || "").replace(/[^a-zA-Z0-9-_]/g, "");
                const imgSrc = `img/champions/avatars/${sanitizedName}.webp`;

                optionEl.dataset.value = doc.id;
                
                // === MODIFICATION START ===
                // Store the community average level on the element itself for easy access.
                optionEl.dataset.communityLevel = champ.communityAverageLevel || 'not set';
                // === MODIFICATION END ===

                optionEl.innerHTML = `
                    <div class="flex items-center">
                        <img src="${imgSrc}" alt="${champ.name}" class="champion-avatar" onerror="this.style.display='none'">
                        <span class="ml-3 font-normal block truncate">${champ.name}</span>
                    </div>
                `;

                optionEl.addEventListener('click', () => {
                    DOM.lmChampionSelect.value = optionEl.dataset.value;
                    DOM.selectedChampionName.textContent = champ.name;
                    DOM.selectedChampionImg.src = imgSrc;
                    DOM.selectedChampionImg.classList.remove('hidden');

                    DOM.customDropdownOptions.classList.add('hidden');
                    DOM.customDropdownTrigger.setAttribute('aria-expanded', 'false');
                    
                    if (analytics) {
                        logEvent(analytics, 'select_champion', {
                            champion_name: champ.name,
                            champion_id: doc.id
                        });
                    }

                    DOM.lmChampionSelect.dispatchEvent(new Event('change'));
                });
                DOM.customDropdownOptions.appendChild(optionEl);
            });
            DOM.selectedChampionName.textContent = 'Select a Champion...';
            DOM.selectedChampionImg.classList.add('hidden');
        }
        DOM.customDropdownTrigger.disabled = false;

    } catch (error) {
        console.error("Error fetching champions:", error);
        DOM.selectedChampionName.textContent = 'Error Loading';
    }
}

/**
 * @description Creates an interactive star rating component.
 * @param {string} containerId - The ID of the container element for the component.
 * @param {string} hiddenInputId - The ID of the hidden input that stores the component's value.
 * @param {boolean} allowBase - Whether to include the "Base Character" option.
 * @returns {object} An object with a `setValue` method to programmatically update the component.
 */
function createStarSelector(containerId, hiddenInputId, allowBase = true) {
    const container = document.getElementById(containerId);
    const hiddenInput = document.getElementById(hiddenInputId);
    if (!container || !hiddenInput) return;

    let tiers = ["White", "Blue", "Purple", "Gold", "Red"];
    if (allowBase) {
        tiers.unshift("Base");
    }

    let selectedTier = allowBase ? "Base" : "White";
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
        btn.textContent = tier === 'Base' ? 'Base (0*)' : tier;
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
        tiers.forEach(t => starsContainer.classList.remove(`tier-${t.toLowerCase()}`));
        starsContainer.classList.add(`tier-${selectedTier.toLowerCase()}`);

        tiersContainer.querySelectorAll('.star-selector-tier-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tier === selectedTier);
        });

        starsContainer.querySelectorAll('.star-selector-star').forEach(star => {
            star.classList.toggle('active', parseInt(star.dataset.value, 10) <= selectedStars);
        });

        starsContainer.style.display = selectedTier === 'Base' ? 'none' : 'flex';
    };

    const updateValue = () => {
        if (selectedTier === 'Base') {
            hiddenInput.value = '0_shards';
        } else {
            hiddenInput.value = `${selectedTier} ${selectedStars}-Star`;
        }
        updateVisuals();
        updateShardRequirementSummary();
    };

    tiersContainer.addEventListener('click', e => {
        if (e.target.matches('.star-selector-tier-btn')) {
            selectedTier = e.target.dataset.tier;
            if (selectedTier === 'Base') {
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
            if (selectedTier === 'Base') {
                selectedTier = 'White';
            }
            updateValue();
        }
    });

    const setValue = (valueString) => {
        if (!valueString || valueString === '0_shards' || valueString.startsWith('Base')) {
            selectedTier = "Base";
            selectedStars = 0;
        } else {
            const parts = valueString.split(' ');
            selectedTier = parts[0];
            selectedStars = parseInt(parts[1], 10) || 0;
        }
        updateValue();
    };

    setValue(allowBase ? '0_shards' : 'White 1-Star');

    return { setValue };
}

/**
 * Populates select dropdowns with options.
 */
function initializeDropdowns() {
    startStarSelectorControl = createStarSelector('start-star-selector-container', 'startStarLevel', true);
    targetStarSelectorControl = createStarSelector('target-star-selector-container', 'targetStarLevel', false);
}

/**
 * Handles wizard step navigation.
 */
function navigateToStep(stepNum) {
    const fromStep = DOM.stepper.classList.contains('step-2') ? 2 : 1;
    if (fromStep === stepNum) return;

    if (stepNum === 1) {
        DOM.stepper.classList.remove('step-2');
        DOM.step1Btn.classList.add('active');
        DOM.step2Btn.classList.remove('active');
        DOM.step1Content.classList.remove('hidden-step');
        DOM.step2Content.classList.add('hidden-step');
    } else if (stepNum === 2) {
        DOM.stepper.classList.add('step-2');
        DOM.step1Btn.classList.remove('active');
        DOM.step2Btn.classList.add('active');
        DOM.step1Content.classList.add('hidden-step');
        DOM.step2Content.classList.remove('hidden-step');
    }

    if (analytics) {
        logEvent(analytics, 'navigate_step', {
            from_step: fromStep,
            to_step: stepNum,
            page_title: document.title
        });
    }
}

/**
 * Handles applying the community average star level recommendation.
 * @param {Event} event - The button click event.
 */
function handleCommunityGuidance(event) {
    const selectedValue = DOM.lmChampionSelect.value;
    if (!selectedValue || selectedValue === 'default') {
        alert("Please select a champion first.");
        return;
    }
    const selectedOptionEl = DOM.customDropdownOptions.querySelector(`li[data-value="${selectedValue}"]`);
    if (!selectedOptionEl) return;

    const targetLevel = selectedOptionEl.dataset.communityLevel;

    if (analytics) {
        logEvent(analytics, 'guidance_used', {
            champion_id: selectedValue,
            champion_name: DOM.selectedChampionName.textContent,
            guidance_type: 'Community Average',
            target_level: targetLevel
        });
    }

    if (targetLevel && targetLevel !== 'not set') {
        if (targetStarSelectorControl) {
            targetStarSelectorControl.setValue(targetLevel);
        }
        if (startStarSelectorControl) {
            startStarSelectorControl.setValue('0_shards');
        }
        DOM.toggleUnlockCost.checked = true;
        
        // Use the notification center to provide feedback
        document.dispatchEvent(new CustomEvent('show-notification', {
            detail: { message: 'Community average level applied.', type: 'success' }
        }));

    } else {
        alert(`Community average data is not available for this champion yet.`);
    }
}

/**
 * Attaches all event listeners for the page.
 */
function attachEventListeners() {
    DOM.step1Btn.addEventListener('click', () => navigateToStep(1));
    DOM.step2Btn.addEventListener('click', () => navigateToStep(2));
    DOM.calculateBtn.addEventListener('click', handleCalculation);

    DOM.customDropdownTrigger.addEventListener('click', () => {
        const isExpanded = DOM.customDropdownTrigger.getAttribute('aria-expanded') === 'true';
        DOM.customDropdownOptions.classList.toggle('hidden', isExpanded);
        DOM.customDropdownTrigger.setAttribute('aria-expanded', !isExpanded);
    });

    document.addEventListener('click', (event) => {
        if (DOM.customChampionDropdown && !DOM.customChampionDropdown.contains(event.target)) {
            DOM.customDropdownOptions.classList.add('hidden');
            DOM.customDropdownTrigger.setAttribute('aria-expanded', 'false');
        }
    });

    DOM.lmChampionSelect.addEventListener('change', () => {
        const selectedValue = DOM.lmChampionSelect.value;
        const selectedOptionEl = DOM.customDropdownOptions.querySelector(`li[data-value="${selectedValue}"]`);

        // Show the guidance button if the community level is set
        if (selectedOptionEl && selectedOptionEl.dataset.communityLevel && selectedOptionEl.dataset.communityLevel !== 'not set') {
            DOM.guidanceButtons.classList.remove('hidden');
        } else {
            DOM.guidanceButtons.classList.add('hidden');
        }
    });
    
    // Replaced the old listeners with the new one.
    if(DOM.applyCommunityAvgBtn) {
        DOM.applyCommunityAvgBtn.addEventListener('click', handleCommunityGuidance);
    }

    DOM.lmShardsYield.addEventListener('input', updateShardRequirementSummary);
    DOM.toggleUnlockCost.addEventListener('change', updateShardRequirementSummary);

    DOM.logPullsBtn.addEventListener('click', handlePullLogging);
}


// #region --- DATA GATHERING & CALCULATION HANDLING ---

function updateShardRequirementSummary() {
    const startValue = DOM.startStarLevel.value;
    const targetValue = DOM.targetStarLevel.value;

    const findShards = (level) => (SHARD_REQUIREMENTS_ORDERED.find(t => t.level === level) || {}).shards || 0;

    const startShards = startValue === '0_shards' ? 0 : findShards(startValue);
    const targetShards = findShards(targetValue);

    if (!targetValue || !targetShards) {
        DOM.shardRequirementSummary.classList.add('hidden');
        return;
    }

    const shardsNeeded = targetShards - startShards;
    const lmShardsYield = parseInt(DOM.lmShardsYield.value, 10) || 40;
    const includeUnlock = DOM.toggleUnlockCost.checked;

    const pullsForShards = (shardsNeeded > 0 && lmShardsYield > 0) ? Math.ceil(shardsNeeded / lmShardsYield) : 0;
    const unlockPullCost = includeUnlock ? 1 : 0;
    const totalEstimatedPulls = pullsForShards + unlockPullCost;

    if (totalEstimatedPulls > 0) {
        let primaryMessage, secondaryMessage;

        if (pullsForShards > 0 && includeUnlock) {
            primaryMessage = `Shards to Goal: <strong class="text-indigo-400">${shardsNeeded.toLocaleString()}</strong>`;
            secondaryMessage = `Requires an estimated <strong class="text-indigo-400">${totalEstimatedPulls}</strong> successful LM pulls (${pullsForShards} for shards + 1 for unlock).`;
        } else if (pullsForShards > 0) {
            primaryMessage = `Shards to Goal: <strong class="text-indigo-400">${shardsNeeded.toLocaleString()}</strong>`;
            secondaryMessage = `Requires an estimated <strong class="text-indigo-400">${totalEstimatedPulls}</strong> successful LM pull(s).`;
        } else if (includeUnlock) {
            primaryMessage = 'No shards needed for upgrade.';
            secondaryMessage = 'Requires an estimated <strong class="text-indigo-400">1</strong> successful LM pull for the unlock.';
        }

        DOM.shardRequirementSummary.innerHTML = `
            <p class="text-sm font-medium text-slate-300">${primaryMessage}</p>
            <p class="text-xs text-slate-400 mt-1">${secondaryMessage}</p>
        `;
        DOM.shardRequirementSummary.classList.remove('hidden');

    } else {
        DOM.shardRequirementSummary.classList.add('hidden');
    }
}

/**
 * Gathers all inputs from the DOM and returns a structured object.
 * @returns {object|null} An object with all input values, or null if validation fails.
 */
function gatherInputs() {
    return {
        lmChampionSelect: DOM.lmChampionSelect.value,
        startStarLevel: DOM.startStarLevel.value,
        targetStarLevel: DOM.targetStarLevel.value,
        toggleUnlockCost: DOM.toggleUnlockCost.checked,
        currentMythicPity: parseInt(DOM.currentMythicPity.value) || 0,
        currentLMPity: parseInt(DOM.currentLMPity.value) || 0,
        anvilBudget: parseInt(DOM.anvilBudget.value) || 100,
        mythicProbability: parseFloat(DOM.mythicProbability.value) || 0.0384,
        mythicHardPity: parseInt(DOM.mythicHardPity.value) || 50,
        lmRateUpChance: parseFloat(DOM.lmRateUpChance.value) || 0.269,
        lmShardsYield: parseInt(DOM.lmShardsYield.value) || 40,
    };
}


/**
 * Main handler for the "Calculate" button click.
 */
function handleCalculation() {
    const inputs = gatherInputs();
    if (!inputs || inputs.lmChampionSelect === 'default') {
        alert("Please select a champion before calculating.");
        return;
    }

    initialCalculationInputs = { ...inputs };

    if (analytics) {
        const eventParams = {...inputs};
        eventParams.championName = DOM.selectedChampionName.textContent || 'unknown';
        logEvent(analytics, 'calculate', eventParams);
    }

    const evResults = calculateExpectedValue(inputs);
    if (evResults.error) {
        alert(`Calculation Error: ${evResults.error}`);
        return;
    }

    const simResults = runProbabilitySimulation(inputs);
    liveProgressState = {
        totalAnvilsSpent: 0,
        shardsAcquired: 0,
        shardsGoal: evResults.shardsNeededForUpgrade,
        isUnlocked: !inputs.toggleUnlockCost,
        currentMythicPity: inputs.currentMythicPity,
        currentLMPity: inputs.currentLMPity,
        totalLMPulled: 0,
    };

    displayResults(inputs, evResults, simResults);
    DOM.liveTrackerContainer.classList.remove('hidden');
    updateLiveProgressDisplay();
}

/**
 * Updates the live progress display with the current state.
 */
function updateLiveProgressDisplay() {
    if (!liveProgressState || !initialCalculationInputs) return;

    // --- Calculations ---
    const shardsRemaining = Math.max(0, liveProgressState.shardsGoal - liveProgressState.shardsAcquired);
    const shardYield = initialCalculationInputs.lmShardsYield || 40;
    const estimatedLMsToGoal = shardYield > 0 ? Math.ceil(shardsRemaining / shardYield) : 0;
    
    // --- Shards & Star Level
    const findShards = (level) => (SHARD_REQUIREMENTS_ORDERED.find(t => t.level === level) || {}).shards || 0;
    const initialShards = initialCalculationInputs.startStarLevel === "0_shards" ? 0 : findShards(initialCalculationInputs.startStarLevel);
    const totalCurrentShards = initialShards + liveProgressState.shardsAcquired;
    const currentStarLevel = getStarLevelFromShards(totalCurrentShards);

    // --- UI Updates ---
    DOM.liveAnvilsSpent.textContent = liveProgressState.totalAnvilsSpent.toLocaleString();
    DOM.liveMythicPity.textContent = liveProgressState.currentMythicPity.toLocaleString();
    DOM.liveLMPity.textContent = liveProgressState.currentLMPity.toLocaleString();
    DOM.liveLmPulledTotal.textContent = liveProgressState.totalLMPulled.toLocaleString();
    DOM.liveShardsRemaining.textContent = shardsRemaining.toLocaleString();
    DOM.liveLmRemainingGoal.textContent = estimatedLMsToGoal.toLocaleString();
    DOM.liveCurrentStarLevel.textContent = currentStarLevel;
}

/**
 * Handles the logic when a user logs their pulls.
 */
// In ui.js, replace the entire handlePullLogging function with this one

/**
 * Handles the logic when a user logs their pulls, allowing for multiple mythic types.
 */
function handlePullLogging() {
    const pullsMade = parseInt(DOM.pullsMadeInput.value, 10) || 0;
    const lmsPulled = parseInt(DOM.lmPulledCountInput.value, 10) || 0;
    const otherMythicsPulled = parseInt(DOM.otherMythicCountInput.value, 10) || 0;

    if (pullsMade <= 0) {
        alert("Please enter a valid number of pulls.");
        return;
    }

    const totalMythicsPulled = lmsPulled + otherMythicsPulled;

    // --- Update State ---
    liveProgressState.totalAnvilsSpent += pullsMade;

    if (totalMythicsPulled > 0) {
        // Pity resets completely since at least one mythic was pulled in the batch.
        liveProgressState.currentMythicPity = 0;

        // Process other mythics first, as they build the LM pity streak.
        for (let i = 0; i < otherMythicsPulled; i++) {
            liveProgressState.currentLMPity++;
        }

        // Process LMs, which resets the LM pity streak.
        for (let i = 0; i < lmsPulled; i++) {
            liveProgressState.currentLMPity = 0; // Streak resets
            liveProgressState.totalLMPulled++;
            if (!liveProgressState.isUnlocked) {
                liveProgressState.isUnlocked = true;
            } else {
                liveProgressState.shardsAcquired += initialCalculationInputs.lmShardsYield;
            }
        }
    } else {
        // No mythics, so we just add to the pity counter.
        liveProgressState.currentMythicPity += pullsMade;
    }

    // Reset logging form for the next entry
    DOM.pullsMadeInput.value = "10";
    DOM.lmPulledCountInput.value = "0";
    DOM.otherMythicCountInput.value = "0";
    
    recalculateProjections();
}

/**
 * Recalculates projections based on the current live state.
 */
function recalculateProjections() {
    // Determine remaining shards needed
    const remainingShards = Math.max(0, liveProgressState.shardsGoal - liveProgressState.shardsAcquired);
    const remainingBudget = Math.max(0, initialCalculationInputs.anvilBudget - liveProgressState.totalAnvilsSpent);

    // Create a new set of inputs for the calculation functions
    const updatedInputs = {
        ...initialCalculationInputs, // Use original settings (rates, pity, etc.)
        shardsNeededForUpgrade: remainingShards,
        anvilBudget: remainingBudget,
        currentMythicPity: liveProgressState.currentMythicPity,
        currentLMPity: liveProgressState.currentLMPity,
        // If the character is now unlocked, we no longer include that cost.
        toggleUnlockCost: !liveProgressState.isUnlocked, 
    };

    // Run the calculations with the updated state
    const evResults = calculateExpectedValue(updatedInputs);
    const simResults = runProbabilitySimulation(updatedInputs);

    // Redisplay the results and update the progress display
    displayResults(updatedInputs, evResults, simResults);
    updateLiveProgressDisplay();
}

// #region --- RESULTS DISPLAY ---

/**
 * Updates the accessibility div with text content of the results.
 * @param {object} totalCosts - The calculated total costs.
 * @param {object} simResults - The simulation results.
 */
function updateAccessibilityInfo(totalCosts, simResults) {
    let text = `Calculation Results. `;
    text += `Average cost: ${Math.round(totalCosts.avg)} Anvils. `;
    text += `Best case cost: ${Math.round(totalCosts.best)} Anvils. `;
    text += `Worst case cost: ${Math.round(totalCosts.worst)} Anvils. `;
    text += `With a budget of ${simResults.budget} Anvils, the success rate is ${simResults.successRate.toFixed(1)}%.`;
    DOM.canvasAccessibility.textContent = text;
}


/**
 * Renders all results to the UI, including canvases.
 * @param {object} inputs - The user inputs used for calculation.
 * @param {object} evResults - The results from calculateExpectedValue.
 * @param {object} simResults - The results from runProbabilitySimulation.
 */
function displayResults(inputs, evResults, simResults) {
    DOM.resultsContainer.style.display = 'block';

    const totalCosts = {
        avg: evResults.upgradeCost.avg + (inputs.toggleUnlockCost ? evResults.unlockCost.avg : 0),
        best: evResults.upgradeCost.best + (inputs.toggleUnlockCost ? evResults.unlockCost.best : 0),
        worst: evResults.upgradeCost.worst + (inputs.toggleUnlockCost ? evResults.unlockCost.worst : 0),
    };

    drawCostCard('average-case-display', totalCosts.avg, '#818cf8');
    drawCostCard('best-case-display', totalCosts.best, '#4ade80');
    drawCostCard('worst-case-display', totalCosts.worst, '#f87171');
    
    DOM.budgetDisplay.textContent = inputs.anvilBudget.toLocaleString();
    DOM.probabilitySummary.textContent = `Your success rate is ${simResults.successRate.toFixed(1)}%. This chart shows the cost distribution of the successful attempts.`;

    drawProbabilityChart('probability-chart-canvas', simResults);
    drawMonteCarloChart('monte-carlo-chart-canvas', simResults);

    updateAccessibilityInfo(totalCosts, simResults);
    
    DOM.resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


// --- APP INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    initializeDropdowns();
    attachEventListeners();

    document.addEventListener('firebase-ready', async () => {
        try {
            const app = getApp();
            db = getFirestore(app);
            analytics = getAnalytics(app);
            
            logEvent(analytics, 'page_view', {
                page_title: document.title,
                page_location: location.href,
                page_path: location.pathname
            });

            await fetchAndPopulateChampions();
            
            handleUrlParameters();
        } catch(e) {
            console.error("Firebase could not be initialized in calculator-ui:", e);
            if (DOM.selectedChampionName) {
                DOM.selectedChampionName.textContent = 'Firebase Error';
            }
        }
    }, { once: true });
});
