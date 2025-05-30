// --- DOM Elements (Champion Management) ---
const championNameInput = document.getElementById('championName'); // MODIFIED
const saveChampionBtn = document.getElementById('saveChampionBtn'); // MODIFIED
const savedChampionsSelect = document.getElementById('savedChampions'); // MODIFIED
const loadChampionBtn = document.getElementById('loadChampionBtn'); // MODIFIED
const deleteChampionBtn = document.getElementById('deleteChampionBtn'); // MODIFIED
const championStatusDiv = document.getElementById('championStatus'); // MODIFIED
const CHAMPION_STORAGE_PREFIX = 'gachaCalcChampion_'; // MODIFIED


// --- Core Calculation Functions ---
function calculateExpectedDrawsPerMythic(mythicProbability, hardPity) {
    if (!(mythicProbability > 0 && mythicProbability <= 1) || hardPity < 1) {
        return NaN;
    }
    let expectedDraws = 0.0;
    for (let k = 1; k < hardPity; k++) {
        const p_k = Math.pow(1 - mythicProbability, k - 1) * mythicProbability;
        expectedDraws += k * p_k;
    }
    const p_hit_pity = Math.pow(1 - mythicProbability, hardPity - 1);
    expectedDraws += hardPity * p_hit_pity;
    return expectedDraws;
}

function calculateLmCycleMetrics(lmShardYield, nmShardYield, lmRateUpChance, nmGuaranteeThreshold) {
    if (!(lmRateUpChance >= 0 && lmRateUpChance <= 1) || nmGuaranteeThreshold < 0) {
        return { averageShardsPerEffectiveMythic: NaN, expectedMythicPullsPerLmCycle: NaN, worstCaseMythicPullsPerLmCycle: NaN };
    }
    const nmRateUpChance = 1.0 - lmRateUpChance;
    let totalExpectedShardsInCycle = 0.0;
    let totalExpectedMythicPullsInCycle = 0.0;
    const p_lm_1st = lmRateUpChance;
    totalExpectedShardsInCycle += lmShardYield * p_lm_1st;
    totalExpectedMythicPullsInCycle += 1 * p_lm_1st;
    for (let i = 1; i < nmGuaranteeThreshold; i++) {
        const p_sequence = Math.pow(nmRateUpChance, i) * lmRateUpChance;
        const shardsInSequence = (nmShardYield * i) + lmShardYield;
        const mythicPullsInSequence = i + 1;
        totalExpectedShardsInCycle += shardsInSequence * p_sequence;
        totalExpectedMythicPullsInCycle += mythicPullsInSequence * p_sequence;
    }
    const p_guarantee_hit = Math.pow(nmRateUpChance, nmGuaranteeThreshold);
    const shardsInGuaranteeSequence = (nmShardYield * nmGuaranteeThreshold) + lmShardYield;
    const mythicPullsInGuaranteeSequence = nmGuaranteeThreshold + 1;
    totalExpectedShardsInCycle += shardsInGuaranteeSequence * p_guarantee_hit;
    totalExpectedMythicPullsInCycle += mythicPullsInGuaranteeSequence * p_guarantee_hit;
    const averageShards = (totalExpectedMythicPullsInCycle === 0 || totalExpectedShardsInCycle === 0) ? 0.0 : totalExpectedShardsInCycle / totalExpectedMythicPullsInCycle;
    return {
        averageShardsPerEffectiveMythic: averageShards,
        expectedMythicPullsPerLmCycle: totalExpectedMythicPullsInCycle,
        worstCaseMythicPullsPerLmCycle: nmGuaranteeThreshold + 1
    };
}

function calculateGachaAnvils(targetShards, avgShardsPerMythic, drawsPerMythic) {
    if (targetShards <= 0) return 0;
    if (avgShardsPerMythic <= 0 || drawsPerMythic <= 0) {
        return Infinity;
    }
    const expectedMythicPulls = Math.ceil(targetShards / avgShardsPerMythic);
    return expectedMythicPulls * drawsPerMythic;
}

// --- DOM Elements (Calculator Inputs & Outputs) ---
const mythicProbabilityInput = document.getElementById('mythicProbability');
const mythicHardPityInput = document.getElementById('mythicHardPity');
const lmRateUpChanceInput = document.getElementById('lmRateUpChance');
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

const mythicProbabilityError = document.getElementById('mythicProbabilityError');
const mythicHardPityError = document.getElementById('mythicHardPityError');
const lmRateUpChanceError = document.getElementById('lmRateUpChanceError');
const starLevelError = document.getElementById('starLevelError');

// --- Game Constants and Data ---
let isUnlockCostIncluded = false; 
const NM_GUARANTEE_THRESHOLD = 3;
const SHARD_REQUIREMENTS = {
    "White 1-Star": 2, "White 2-Star": 5, "White 3-Star": 10, "White 4-Star": 20, "White 5-Star": 40,
    "Blue 1-Star": 60, "Blue 2-Star": 80, "Blue 3-Star": 100, "Blue 4-Star": 130, "Blue 5-Star": 160,
    "Purple 1-Star": 200, "Purple 2-Star": 240, "Purple 3-Star": 280, "Purple 4-Star": 320, "Purple 5-Star": 360,
    "Gold 1-Star": 400, "Gold 2-Star": 440, "Gold 3-Star": 480, "Gold 4-Star": 540, "Gold 5-Star": 600,
    "Red 1-Star": 680, "Red 2-Star": 760, "Red 3-Star": 840, "Red 4-Star": 920, "Red 5-Star": 1000
};
const LM_SHARDS_CURRENT = 40;
const NM_SHARDS_CURRENT = 0;
const LM_SHARDS_PROPOSED = 25;
const NM_SHARDS_PROPOSED = 5;
let anvilCostChart;

function populateStarLevels() {
    startStarLevelSelect.innerHTML = ''; 
    targetStarLevelSelect.innerHTML = ''; 

    const baseOption = document.createElement('option');
    baseOption.value = "0_shards";
    baseOption.textContent = "Base Character (0 Shards)";
    startStarLevelSelect.appendChild(baseOption);

    for (const level in SHARD_REQUIREMENTS) {
        const optionStart = document.createElement('option');
        optionStart.value = level;
        optionStart.textContent = level;
        startStarLevelSelect.appendChild(optionStart);

        const optionTarget = document.createElement('option');
        optionTarget.value = level;
        optionTarget.textContent = level;
        targetStarLevelSelect.appendChild(optionTarget);
    }
    if (targetStarLevelSelect.options.length > 0) {
        targetStarLevelSelect.selectedIndex = 0;
    }
}

function updateChart(currentCosts, proposedCosts, labels, includeUnlock, unlockCostAvgForChart) {
    const ctx = document.getElementById('anvilCostChart').getContext('2d');
    if (anvilCostChart) {
        anvilCostChart.destroy();
    }
    const finalCurrentCosts = currentCosts.map(cost => includeUnlock ? cost + unlockCostAvgForChart : cost);
    const finalProposedCosts = proposedCosts.map(cost => includeUnlock ? cost + unlockCostAvgForChart : cost);
    const yAxisLabel = includeUnlock ? 'Total Average Anvils (Unlock + Shards to Level)' : 'Average Anvils for Shards (Post-Unlock to Level)';
    anvilCostChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Current System (Avg Total to Level)',
                    data: finalCurrentCosts,
                    backgroundColor: 'rgba(59, 130, 246, 0.7)', borderColor: 'rgba(59, 130, 246, 1)', borderWidth: 1
                },
                {
                    label: 'Proposed System (Avg Total to Level)',
                    data: finalProposedCosts,
                    backgroundColor: 'rgba(16, 185, 129, 0.7)', borderColor: 'rgba(16, 185, 129, 1)', borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, title: { display: true, text: yAxisLabel } }, x: { title: { display: true, text: 'Star Level (Total Accumulation from Base)' } } },
            plugins: { tooltip: { callbacks: { label: context => context.dataset.label + ': ' + Math.round(context.raw) + ' Anvils' } } }
        }
    });
}

// MODIFIED: Renamed function and updated references
function displayChampionStatus(message, isError = false) {
    championStatusDiv.textContent = message; // MODIFIED
    championStatusDiv.className = 'status-message text-center py-1'; 
    if (isError) {
        championStatusDiv.classList.add('status-error'); // MODIFIED
    } else {
        championStatusDiv.classList.add('status-success'); // MODIFIED
    }
    setTimeout(() => {
        championStatusDiv.textContent = ''; // MODIFIED
        championStatusDiv.className = 'status-message h-8'; 
    }, 3000);
}

// MODIFIED: Renamed function and updated references
function saveChampion() {
    const championName = championNameInput.value.trim(); // MODIFIED
    if (!championName) {
        displayChampionStatus("Champion name cannot be empty.", true); // MODIFIED
        return;
    }
    const championData = { // MODIFIED
        mythicProbability: mythicProbabilityInput.value,
        mythicHardPity: mythicHardPityInput.value,
        lmRateUpChance: lmRateUpChanceInput.value,
        includeUnlockCost: isUnlockCostIncluded, 
        startStarLevel: startStarLevelSelect.value,
        targetStarLevel: targetStarLevelSelect.value
    };
    try {
        localStorage.setItem(CHAMPION_STORAGE_PREFIX + championName, JSON.stringify(championData)); // MODIFIED
        displayChampionStatus(`Champion "${championName}" saved successfully!`); // MODIFIED
        populateSavedChampionsDropdown(); // MODIFIED
        championNameInput.value = ''; 
    } catch (e) {
        displayChampionStatus("Error saving champion. LocalStorage might be full or disabled.", true); // MODIFIED
        console.error("Error saving to localStorage:", e);
    }
}

// MODIFIED: Renamed function and updated references
function loadChampion() {
    const championName = savedChampionsSelect.value; // MODIFIED
    if (!championName) {
        displayChampionStatus("No champion selected to load.", true); // MODIFIED
        return;
    }
    try {
        const championDataString = localStorage.getItem(CHAMPION_STORAGE_PREFIX + championName); // MODIFIED
        if (championDataString) {
            const championData = JSON.parse(championDataString); // MODIFIED
            mythicProbabilityInput.value = championData.mythicProbability;
            mythicHardPityInput.value = championData.mythicHardPity;
            lmRateUpChanceInput.value = championData.lmRateUpChance;
            isUnlockCostIncluded = championData.includeUnlockCost; 
            updateToggleUnlockButtonAppearance(); 
            startStarLevelSelect.value = championData.startStarLevel;
            targetStarLevelSelect.value = championData.targetStarLevel;
            updateCalculator(); 
            displayChampionStatus(`Champion "${championName}" loaded.`); // MODIFIED
        } else {
            displayChampionStatus(`Champion "${championName}" not found.`, true); // MODIFIED
        }
    } catch (e) {
        displayChampionStatus("Error loading champion. Data might be corrupted.", true); // MODIFIED
        console.error("Error loading from localStorage:", e);
    }
}

// MODIFIED: Renamed function and updated references
function deleteChampion() {
    const championName = savedChampionsSelect.value; // MODIFIED
    if (!championName) {
        displayChampionStatus("No champion selected to delete.", true); // MODIFIED
        return;
    }
    try {
        localStorage.removeItem(CHAMPION_STORAGE_PREFIX + championName); // MODIFIED
        displayChampionStatus(`Champion "${championName}" deleted.`); // MODIFIED
        populateSavedChampionsDropdown(); // MODIFIED
    } catch (e) {
        displayChampionStatus("Error deleting champion.", true); // MODIFIED
        console.error("Error deleting from localStorage:", e);
    }
}

// MODIFIED: Renamed function and updated references
function populateSavedChampionsDropdown() {
    savedChampionsSelect.innerHTML = '<option value="">-- Select a Champion --</option>'; // MODIFIED
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(CHAMPION_STORAGE_PREFIX)) { // MODIFIED
                const championName = key.substring(CHAMPION_STORAGE_PREFIX.length); // MODIFIED
                const option = document.createElement('option');
                option.value = championName;
                option.textContent = championName;
                savedChampionsSelect.appendChild(option); // MODIFIED
            }
        }
    } catch (e) {
        displayChampionStatus("Could not access localStorage to populate champions.", true); // MODIFIED
        console.error("Error accessing localStorage for populating champions:", e);
    }
}

function setButtonLoadingState(isLoading) {
    if (isLoading) {
        calculateBtn.classList.add('btn-loading');
        calculateBtn.disabled = true;
        if(calculateBtnText) calculateBtnText.style.display = 'none';
        if(calculateBtnSpinner) calculateBtnSpinner.style.display = 'inline-block';
    } else {
        calculateBtn.classList.remove('btn-loading');
        calculateBtn.disabled = false;
        if(calculateBtnText) calculateBtnText.style.display = 'inline-block';
        if(calculateBtnSpinner) calculateBtnSpinner.style.display = 'none';
    }
}

function updateToggleUnlockButtonAppearance() {
    if (isUnlockCostIncluded) {
        toggleUnlockCostBtn.textContent = 'Include Initial Unlock: ON';
        toggleUnlockCostBtn.classList.remove('toggle-btn-off');
        toggleUnlockCostBtn.classList.add('toggle-btn-on');
    } else {
        toggleUnlockCostBtn.textContent = 'Include Initial Unlock: OFF';
        toggleUnlockCostBtn.classList.remove('toggle-btn-on');
        toggleUnlockCostBtn.classList.add('toggle-btn-off');
    }
}


function updateCalculator() {
    setButtonLoadingState(true); 

    setTimeout(() => {
        mythicProbabilityError.classList.add('hidden');
        mythicHardPityError.classList.add('hidden');
        lmRateUpChanceError.classList.add('hidden');
        starLevelError.classList.add('hidden');
        conclusionParagraph.textContent = '';

        const allSpans = document.querySelectorAll('#results span, .calculation-detail strong');
        allSpans.forEach(span => span.textContent = '--');
        
        document.getElementById('currentLMS').textContent = LM_SHARDS_CURRENT;
        document.getElementById('currentNMS').textContent = NM_SHARDS_CURRENT;
        document.getElementById('proposedLMS').textContent = LM_SHARDS_PROPOSED;
        document.getElementById('proposedNMS').textContent = NM_SHARDS_PROPOSED;
        detailLMSCurrentSpan.textContent = LM_SHARDS_CURRENT;
        detailNMSCurrentSpan.textContent = NM_SHARDS_CURRENT;
        detailLMSProposedSpan.textContent = LM_SHARDS_PROPOSED;
        detailNMSProposedSpan.textContent = NM_SHARDS_PROPOSED;

        let isValid = true;
        const mythicProbability = parseFloat(mythicProbabilityInput.value);
        if (isNaN(mythicProbability) || mythicProbability <= 0 || mythicProbability > 1) {
            mythicProbabilityError.textContent = 'Invalid probability.'; mythicProbabilityError.classList.remove('hidden'); isValid = false;
        }
        const mythicHardPity = parseInt(mythicHardPityInput.value);
        if (isNaN(mythicHardPity) || mythicHardPity < 1) {
            mythicHardPityError.textContent = 'Invalid pity.'; mythicHardPityError.classList.remove('hidden'); isValid = false;
        }
        const lmRateUpChance = parseFloat(lmRateUpChanceInput.value);
        if (isNaN(lmRateUpChance) || lmRateUpChance < 0 || lmRateUpChance > 1) {
            lmRateUpChanceError.textContent = 'Invalid rate-up chance.'; lmRateUpChanceError.classList.remove('hidden'); isValid = false;
        }

        const startStarValue = startStarLevelSelect.value;
        const targetStarValue = targetStarLevelSelect.value;
        const startShards = (startStarValue === "0_shards") ? 0 : (SHARD_REQUIREMENTS[startStarValue] || 0);
        const targetTotalShards = SHARD_REQUIREMENTS[targetStarValue] || 0;
        let shardsNeededForUpgrade = targetTotalShards - startShards;

        if (shardsNeededForUpgrade < 0) {
            starLevelError.textContent = "Target level cannot be lower than starting level. Cost will be 0.";
            starLevelError.classList.remove('hidden');
            shardsNeededForUpgrade = 0;
        }
        shardsNeededForUpgradeSpan.textContent = shardsNeededForUpgrade.toString();

        if (!isValid) {
            setButtonLoadingState(false); 
            return;
        }

        const drawsPerMythicAverage = calculateExpectedDrawsPerMythic(mythicProbability, mythicHardPity);
        const drawsPerMythicBest = 1;
        const drawsPerMythicWorst = mythicHardPity;
        calcDrawsPerMythicSpan.textContent = drawsPerMythicAverage.toFixed(2);
        if (isNaN(drawsPerMythicAverage)) {
            conclusionParagraph.textContent = 'Error in base Mythic calculation.'; 
            setButtonLoadingState(false); return;
        }

        const unlockCycleMetrics = calculateLmCycleMetrics(1, 0, lmRateUpChance, NM_GUARANTEE_THRESHOLD);
        let anvilsUnlockAvg = 0, anvilsUnlockBest = 0, anvilsUnlockWorst = 0;
        let avgMythicsNeededForOneLM = 0;
        let worstCaseMythicsForLM = 0; 

        if (!isNaN(unlockCycleMetrics.expectedMythicPullsPerLmCycle)) {
            avgMythicsNeededForOneLM = unlockCycleMetrics.expectedMythicPullsPerLmCycle;
            worstCaseMythicsForLM = unlockCycleMetrics.worstCaseMythicPullsPerLmCycle; 
            anvilsUnlockAvg = avgMythicsNeededForOneLM * drawsPerMythicAverage;
            anvilsUnlockBest = 1 * drawsPerMythicBest;
            anvilsUnlockWorst = worstCaseMythicsForLM * drawsPerMythicWorst;
        } else {
            conclusionParagraph.textContent = 'Error calculating LM cycle for unlock.'; 
            setButtonLoadingState(false); return;
        }
        if(calcWorstCaseMythicsForLMSpan) { 
            calcWorstCaseMythicsForLMSpan.textContent = worstCaseMythicsForLM.toString();
        }

        const lmCycleMetricsCurrentSystem = calculateLmCycleMetrics(LM_SHARDS_CURRENT, NM_SHARDS_CURRENT, lmRateUpChance, NM_GUARANTEE_THRESHOLD);
        const lmCycleMetricsProposedSystem = calculateLmCycleMetrics(LM_SHARDS_PROPOSED, NM_SHARDS_PROPOSED, lmRateUpChance, NM_GUARANTEE_THRESHOLD);
        const avgEffectiveShardsCurrent = lmCycleMetricsCurrentSystem.averageShardsPerEffectiveMythic;
        const avgEffectiveShardsProposed = lmCycleMetricsProposedSystem.averageShardsPerEffectiveMythic;
        if (isNaN(avgEffectiveShardsCurrent) || isNaN(avgEffectiveShardsProposed)) {
            conclusionParagraph.textContent = 'Error in shard per mythic calculation.'; 
            setButtonLoadingState(false); return;
        }
        calcAvgShardsCurrentSpan.textContent = avgEffectiveShardsCurrent.toFixed(2);
        calcAvgShardsProposedSpan.textContent = avgEffectiveShardsProposed.toFixed(2);

        const bestShardsProgressionCurrent = LM_SHARDS_CURRENT;
        const bestShardsProgressionProposed = LM_SHARDS_PROPOSED;
        const worstShardsProgressionCurrent = (NM_SHARDS_CURRENT * NM_GUARANTEE_THRESHOLD + LM_SHARDS_CURRENT) / (NM_GUARANTEE_THRESHOLD + 1);
        const worstShardsProgressionProposed = (NM_SHARDS_PROPOSED * NM_GUARANTEE_THRESHOLD + LM_SHARDS_PROPOSED) / (NM_GUARANTEE_THRESHOLD + 1);

        let upgradeAnvilsCurrent = calculateGachaAnvils(shardsNeededForUpgrade, avgEffectiveShardsCurrent, drawsPerMythicAverage);
        let upgradeAnvilsProposed = calculateGachaAnvils(shardsNeededForUpgrade, avgEffectiveShardsProposed, drawsPerMythicAverage);
        let upgradeAnvilsBestCurrent = calculateGachaAnvils(shardsNeededForUpgrade, bestShardsProgressionCurrent, drawsPerMythicBest);
        let upgradeAnvilsWorstCurrent = calculateGachaAnvils(shardsNeededForUpgrade, worstShardsProgressionCurrent, drawsPerMythicWorst);
        let upgradeAnvilsBestProposed = calculateGachaAnvils(shardsNeededForUpgrade, bestShardsProgressionProposed, drawsPerMythicBest);
        let upgradeAnvilsWorstProposed = calculateGachaAnvils(shardsNeededForUpgrade, worstShardsProgressionProposed, drawsPerMythicWorst);

        if (isUnlockCostIncluded) { 
            unlockCostSection.classList.remove('hidden');
            detailUnlockCostSection.classList.remove('hidden');
            anvilsUnlockAvgSpan.textContent = Math.round(anvilsUnlockAvg).toString();
            anvilsUnlockBestSpan.textContent = Math.round(anvilsUnlockBest).toString();
            anvilsUnlockWorstSpan.textContent = Math.round(anvilsUnlockWorst).toString();
            detailAvgMythicsForLMSpan.textContent = avgMythicsNeededForOneLM.toFixed(2);
            detailAnvilsUnlockAvgSpan.textContent = Math.round(anvilsUnlockAvg).toString();
            detailAnvilsUnlockBestSpan.textContent = Math.round(anvilsUnlockBest).toString();
            detailAnvilsUnlockWorstSpan.textContent = Math.round(anvilsUnlockWorst).toString();
            advisoryMessage.innerHTML = `Costs displayed below **INCLUDE** initial unlock. Shard upgrade costs are for the selected range.`;
            advisoryBox.classList.remove('bg-yellow-50', 'border-yellow-500', 'text-yellow-700');
            advisoryBox.classList.add('bg-indigo-50', 'border-indigo-500', 'text-indigo-700');
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
            advisoryMessage.innerHTML = `Costs displayed are for the **selected shard upgrade only**. Initial unlock cost is NOT included unless checked above.`;
            advisoryBox.classList.add('bg-yellow-50', 'border-yellow-500', 'text-yellow-700');
            advisoryBox.classList.remove('bg-indigo-50', 'border-indigo-500', 'text-indigo-700');
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

        detailTargetShardsCurrentSpan.textContent = shardsNeededForUpgrade.toString();
        detailAvgShardsCurrentSpan.textContent = avgEffectiveShardsCurrent.toFixed(2);
        detailMythicPullsAvgCurrentSpan.textContent = (avgEffectiveShardsCurrent > 0 && shardsNeededForUpgrade > 0 ? Math.ceil(shardsNeededForUpgrade / avgEffectiveShardsCurrent) : (shardsNeededForUpgrade <= 0 ? 0 : 'Inf')).toString();
        detailAnvilsAvgCurrentSpan.textContent = isFinite(upgradeAnvilsCurrent) ? Math.round(upgradeAnvilsCurrent).toString() : (shardsNeededForUpgrade <= 0 ? '0' : 'Infinity');
        detailBestShardsCurrentSpan.textContent = bestShardsProgressionCurrent.toFixed(2);
        detailMythicPullsBestCurrentSpan.textContent = (bestShardsProgressionCurrent > 0 && shardsNeededForUpgrade > 0 ? Math.ceil(shardsNeededForUpgrade / bestShardsProgressionCurrent) : (shardsNeededForUpgrade <= 0 ? 0 : 'Inf')).toString();
        detailAnvilsBestCurrentSpan.textContent = isFinite(upgradeAnvilsBestCurrent) ? Math.round(upgradeAnvilsBestCurrent).toString() : (shardsNeededForUpgrade <= 0 ? '0' : 'Infinity');
        detailWorstShardsCurrentSpan.textContent = worstShardsProgressionCurrent.toFixed(2);
        detailMythicPullsWorstCurrentSpan.textContent = (worstShardsProgressionCurrent > 0 && shardsNeededForUpgrade > 0 ? Math.ceil(shardsNeededForUpgrade / worstShardsProgressionCurrent) : (shardsNeededForUpgrade <= 0 ? 0 : 'Inf')).toString();
        detailAnvilsWorstCurrentSpan.textContent = isFinite(upgradeAnvilsWorstCurrent) ? Math.round(upgradeAnvilsWorstCurrent).toString() : (shardsNeededForUpgrade <= 0 ? '0' : 'Infinity');

        detailTargetShardsProposedSpan.textContent = shardsNeededForUpgrade.toString();
        detailAvgShardsProposedSpan.textContent = avgEffectiveShardsProposed.toFixed(2);
        detailMythicPullsAvgProposedSpan.textContent = (avgEffectiveShardsProposed > 0 && shardsNeededForUpgrade > 0 ? Math.ceil(shardsNeededForUpgrade / avgEffectiveShardsProposed) : (shardsNeededForUpgrade <= 0 ? 0 : 'Inf')).toString();
        detailAnvilsAvgProposedSpan.textContent = isFinite(upgradeAnvilsProposed) ? Math.round(upgradeAnvilsProposed).toString() : (shardsNeededForUpgrade <= 0 ? '0' : 'Infinity');
        detailBestShardsProposedSpan.textContent = bestShardsProgressionProposed.toFixed(2);
        detailMythicPullsBestProposedSpan.textContent = (bestShardsProgressionProposed > 0 && shardsNeededForUpgrade > 0 ? Math.ceil(shardsNeededForUpgrade / bestShardsProgressionProposed) : (shardsNeededForUpgrade <= 0 ? 0 : 'Inf')).toString();
        detailAnvilsBestProposedSpan.textContent = isFinite(upgradeAnvilsBestProposed) ? Math.round(upgradeAnvilsBestProposed).toString() : (shardsNeededForUpgrade <= 0 ? '0' : 'Infinity');
        detailWorstShardsProposedSpan.textContent = worstShardsProgressionProposed.toFixed(2);
        detailMythicPullsWorstProposedSpan.textContent = (worstShardsProgressionProposed > 0 && shardsNeededForUpgrade > 0 ? Math.ceil(shardsNeededForUpgrade / worstShardsProgressionProposed) : (shardsNeededForUpgrade <= 0 ? 0 : 'Inf')).toString();
        detailAnvilsWorstProposedSpan.textContent = isFinite(upgradeAnvilsWorstProposed) ? Math.round(upgradeAnvilsWorstProposed).toString() : (shardsNeededForUpgrade <= 0 ? '0' : 'Infinity');
        
        const totalCurrentAvgDisplayed = parseFloat(anvilsCurrentSpan.textContent);
        const totalProposedAvgDisplayed = parseFloat(anvilsProposedSpan.textContent);

        if (shardsNeededForUpgrade <= 0 && !isUnlockCostIncluded) { 
            conclusionParagraph.textContent = "No shards needed for this upgrade range. Cost is 0."
        } else if (isFinite(totalCurrentAvgDisplayed) && isFinite(totalProposedAvgDisplayed)) {
            if (totalCurrentAvgDisplayed < totalProposedAvgDisplayed) {
                conclusionParagraph.textContent = `The Current System is ~${Math.ceil(totalProposedAvgDisplayed - totalCurrentAvgDisplayed)} Anvils more efficient on average for the selected goal.`;
            } else if (totalProposedAvgDisplayed < totalCurrentAvgDisplayed) {
                conclusionParagraph.textContent = `The Proposed System is ~${Math.ceil(totalCurrentAvgDisplayed - totalProposedAvgDisplayed)} Anvils more efficient on average for the selected goal.`;
            } else {
                conclusionParagraph.textContent = 'Both systems require approximately the same Anvils on average for the selected goal.';
            }
        } else {
            conclusionParagraph.textContent = 'Could not determine efficiency due to non-finite Anvil costs.';
        }

        const allStarLevelsForChart = Object.keys(SHARD_REQUIREMENTS);
        const chartProgressionCostsCurrent = [];
        const chartProgressionCostsProposed = [];
        allStarLevelsForChart.forEach(level => {
            const s = SHARD_REQUIREMENTS[level];
            const currentProgCost = calculateGachaAnvils(s, avgEffectiveShardsCurrent, drawsPerMythicAverage);
            const proposedProgCost = calculateGachaAnvils(s, avgEffectiveShardsProposed, drawsPerMythicAverage);
            chartProgressionCostsCurrent.push(isFinite(currentProgCost) ? Math.round(currentProgCost) : 0);
            chartProgressionCostsProposed.push(isFinite(proposedProgCost) ? Math.round(proposedProgCost) : 0);
        });
        updateChart(chartProgressionCostsCurrent, chartProgressionCostsProposed, allStarLevelsForChart, isUnlockCostIncluded, anvilsUnlockAvg); 
        
        setButtonLoadingState(false); 
    }, 50); 
}

document.addEventListener('DOMContentLoaded', () => {
    populateStarLevels();
    populateSavedChampionsDropdown(); // MODIFIED
    updateToggleUnlockButtonAppearance(); 

    // MODIFIED Event Listeners for Champion Management
    saveChampionBtn.addEventListener('click', saveChampion);
    loadChampionBtn.addEventListener('click', loadChampion);
    deleteChampionBtn.addEventListener('click', deleteChampion);

    calculateBtn.addEventListener('click', updateCalculator);
    mythicProbabilityInput.addEventListener('input', updateCalculator);
    mythicHardPityInput.addEventListener('input', updateCalculator);
    lmRateUpChanceInput.addEventListener('input', updateCalculator);
    startStarLevelSelect.addEventListener('change', updateCalculator);
    targetStarLevelSelect.addEventListener('change', updateCalculator);
    toggleUnlockCostBtn.addEventListener('click', () => {
        isUnlockCostIncluded = !isUnlockCostIncluded;
        updateToggleUnlockButtonAppearance();
        updateCalculator();
    });
    
    updateCalculator(); 
});
