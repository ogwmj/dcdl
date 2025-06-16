/**
 * @file calculator-ui.js
 * @fileoverview Handles UI interactions, event listeners, and data flow
 * for the redesigned Anvil Calculator.
 * @version 1.6.0 - Added Monte Carlo chart rendering.
 */

import { calculateExpectedValue, runProbabilitySimulation } from './core.js';
import { drawCostCard, drawProbabilityChart, drawMonteCarloChart } from './canvas.js';
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// --- DOM ELEMENT REFERENCES ---
const DOM = {
    // Wizard
    stepper: document.getElementById('stepper'),
    step1Btn: document.getElementById('step-btn-1'),
    step2Btn: document.getElementById('step-btn-2'),
    step1Content: document.getElementById('step-1-content'),
    step2Content: document.getElementById('step-2-content'),
    calculateBtn: document.getElementById('calculateBtn'),

    // Inputs
    lmChampionSelect: document.getElementById('lmChampionSelect'), // Hidden Input
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
    
    // Guidance Buttons
    guidanceButtons: document.getElementById('guidanceButtons'),
    f2pRecBtn: document.getElementById('f2pRecBtn'),
    minRecBtn: document.getElementById('minRecBtn'),

    // Results
    resultsContainer: document.getElementById('results-container'),
    probabilitySummary: document.getElementById('probability-summary'),
    budgetDisplay: document.getElementById('budget-display'),
    
    // Accessibility
    canvasAccessibility: document.getElementById('canvas-accessibility'),
};

// --- DATA & STATE ---
const SHARD_REQUIREMENTS = {
    "Base Character (0 Shards)": 0, "White 1-Star": 2, "White 2-Star": 5, "White 3-Star": 10, "White 4-Star": 20, "White 5-Star": 40,
    "Blue 1-Star": 60, "Blue 2-Star": 80, "Blue 3-Star": 100, "Blue 4-Star": 130, "Blue 5-Star": 160,
    "Purple 1-Star": 200, "Purple 2-Star": 240, "Purple 3-Star": 280, "Purple 4-Star": 320, "Purple 5-Star": 360,
    "Gold 1-Star": 400, "Gold 2-Star": 440, "Gold 3-Star": 480, "Gold 4-Star": 540, "Gold 5-Star": 600,
    "Red 1-Star": 680, "Red 2-Star": 760, "Red 3-Star": 840, "Red 4-Star": 920, "Red 5-Star": 1000
};

let db; // Firestore database instance

// --- UI INITIALIZATION & EVENT LISTENERS ---

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

        DOM.customDropdownOptions.innerHTML = ''; // Clear loading state

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
                optionEl.dataset.recF2p = champ.recommendationF2P || 'not set';
                optionEl.dataset.recMin = champ.recommendationMin || 'not set';

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
 * Populates select dropdowns with options.
 */
function initializeDropdowns() {
    // Star levels
    Object.keys(SHARD_REQUIREMENTS).forEach(level => {
        if (level.startsWith('Base')) {
            DOM.startStarLevel.add(new Option(level, "0_shards"));
        } else {
            const option = new Option(level, level);
            DOM.startStarLevel.add(option.cloneNode(true));
            DOM.targetStarLevel.add(option);
        }
    });
    DOM.startStarLevel.value = "0_shards";
    DOM.targetStarLevel.selectedIndex = 0;
}

/**
 * Handles wizard step navigation.
 * @param {number} stepNum - The step number to navigate to.
 */
function navigateToStep(stepNum) {
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
}

/**
 * Handles applying a star level recommendation from the Champion Guidance section.
 * @param {Event} event - The event that triggered the handler (e.g., button click).
 */
function handleChampionGuidance(event) {
    const selectedValue = DOM.lmChampionSelect.value;
    if (!selectedValue || selectedValue === 'default') {
        alert("Please select a champion first.");
        return;
    }
    const selectedOptionEl = DOM.customDropdownOptions.querySelector(`li[data-value="${selectedValue}"]`);
    if (!selectedOptionEl) return;


    const triggerId = event.target.id;
    let targetLevel;
    
    if (triggerId === 'f2pRecBtn') {
        targetLevel = selectedOptionEl.dataset.recF2p;
    } else if (triggerId === 'minRecBtn') {
        targetLevel = selectedOptionEl.dataset.recMin;
    } else {
        return;
    }

    if (targetLevel && targetLevel !== 'not set') {
        DOM.startStarLevel.value = '0_shards';
        DOM.targetStarLevel.value = targetLevel;
        DOM.toggleUnlockCost.checked = true; // Recommendations assume starting from scratch
        
        handleCalculation();
    } else {
        alert(`Recommendation for the selected champion is not set.`);
    }
}

/**
 * Attaches all event listeners for the page.
 */
function attachEventListeners() {
    DOM.step1Btn.addEventListener('click', () => navigateToStep(1));
    DOM.step2Btn.addEventListener('click', () => navigateToStep(2));
    DOM.calculateBtn.addEventListener('click', handleCalculation);

    // Custom Dropdown Logic
    DOM.customDropdownTrigger.addEventListener('click', () => {
        const isExpanded = DOM.customDropdownTrigger.getAttribute('aria-expanded') === 'true';
        DOM.customDropdownOptions.classList.toggle('hidden', isExpanded);
        DOM.customDropdownTrigger.setAttribute('aria-expanded', !isExpanded);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
        if (DOM.customChampionDropdown && !DOM.customChampionDropdown.contains(event.target)) {
            DOM.customDropdownOptions.classList.add('hidden');
            DOM.customDropdownTrigger.setAttribute('aria-expanded', 'false');
        }
    });

    // Show/hide recommendation buttons based on champion selection
    DOM.lmChampionSelect.addEventListener('change', () => {
        const selectedValue = DOM.lmChampionSelect.value;
        const selectedOptionEl = DOM.customDropdownOptions.querySelector(`li[data-value="${selectedValue}"]`);

        if (selectedOptionEl && selectedOptionEl.dataset.recF2p !== 'not set') {
            DOM.guidanceButtons.classList.remove('hidden');
        } else {
            DOM.guidanceButtons.classList.add('hidden');
        }
    });

    DOM.f2pRecBtn.addEventListener('click', handleChampionGuidance);
    DOM.minRecBtn.addEventListener('click', handleChampionGuidance);
}


// --- DATA GATHERING & CALCULATION HANDLING ---

/**
 * Gathers all inputs from the DOM and returns a structured object.
 * @returns {object|null} An object with all input values, or null if validation fails.
 */
function gatherInputs() {
    // Basic validation could be added here
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

    const evResults = calculateExpectedValue(inputs);
    if (evResults.error) {
        alert(`Calculation Error: ${evResults.error}`);
        return;
    }

    const simResults = runProbabilitySimulation(inputs);
    displayResults(inputs, evResults, simResults);
}


// --- RESULTS DISPLAY ---

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

    drawCostCard('average-case-canvas', totalCosts.avg, '#4338ca');
    drawCostCard('best-case-canvas', totalCosts.best, '#059669');
    drawCostCard('worst-case-canvas', totalCosts.worst, '#dc2626');
    
    DOM.budgetDisplay.textContent = inputs.anvilBudget.toLocaleString();
    DOM.probabilitySummary.textContent = `Your success rate is ${simResults.successRate.toFixed(1)}%. This chart shows the cost distribution of the successful attempts.`;

    drawProbabilityChart('probability-chart-canvas', simResults);
    
    // Draw the Monte Carlo chart
    drawMonteCarloChart('monte-carlo-chart-canvas', simResults);

    updateAccessibilityInfo(totalCosts, simResults);
    
    DOM.resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


// --- APP INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    initializeDropdowns();
    attachEventListeners();

    document.addEventListener('firebase-ready', () => {
        try {
            const app = getApp();
            db = getFirestore(app);
            fetchAndPopulateChampions();
        } catch(e) {
            console.error("Firebase could not be initialized in calculator-ui:", e);
            if (DOM.selectedChampionName) {
                DOM.selectedChampionName.textContent = 'Firebase Error';
            }
        }
    }, { once: true });
});
