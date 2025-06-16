/**
 * @file calculator-core.js
 * @fileoverview Core calculation logic for the Anvil Calculator.
 * This module is completely decoupled from the DOM and UI. It takes
 * parameters and returns structured data, making it pure and testable.
 * @version 1.1.0 - Re-introduced actual vs. effective rate logic.
 */

// --- CONSTANTS ---

const CONSTANTS = {
    NM_GUARANTEE_THRESHOLD: 3, // Non-LM pulls before a guarantee.
    NUM_SIM_RUNS: 10000,       // Simulation runs for probability.
    SHARD_REQUIREMENTS: {
        "White 1-Star": 2, "White 2-Star": 5, "White 3-Star": 10, "White 4-Star": 20, "White 5-Star": 40,
        "Blue 1-Star": 60, "Blue 2-Star": 80, "Blue 3-Star": 100, "Blue 4-Star": 130, "Blue 5-Star": 160,
        "Purple 1-Star": 200, "Purple 2-Star": 240, "Purple 3-Star": 280, "Purple 4-Star": 320, "Purple 5-Star": 360,
        "Gold 1-Star": 400, "Gold 2-Star": 440, "Gold 3-Star": 480, "Gold 4-Star": 540, "Gold 5-Star": 600,
        "Red 1-Star": 680, "Red 2-Star": 760, "Red 3-Star": 840, "Red 4-Star": 920, "Red 5-Star": 1000
    }
};

// --- HELPER FUNCTIONS ---

/**
 * Memoizes a function to cache its results.
 * @param {Function} func The function to memoize.
 * @returns {Function} The new memoized function.
 */
function memoize(func) {
    const cache = {};
    return function(...args) {
        const key = JSON.stringify(args);
        if (cache[key] !== undefined) {
            return cache[key];
        }
        const result = func.apply(this, args);
        cache[key] = result;
        return result;
    };
}

/**
 * Calculates the actual (base) probability rate from a known effective rate by inverting
 * the pity mechanism calculation. It uses an iterative binary search for precision.
 * @param {number} effectiveRate - The effective probability of an LM pull (0 to 1), including pity.
 * @param {number} nmGuaranteeThreshold - The number of non-LM pulls before a guarantee.
 * @returns {number} The calculated actual base rate.
 */
function calculateActualRateFromEffectiveRate(effectiveRate, nmGuaranteeThreshold) {
    if (effectiveRate <= 0) return 0;
    if (effectiveRate >= 1) return 1;

    const targetExpectedPulls = 1 / effectiveRate;
    const n = nmGuaranteeThreshold + 1;

    const calculateExpectedPulls = (rate) => {
        let expectedPulls = 0;
        for (let i = 1; i < n; i++) {
            expectedPulls += i * Math.pow(1 - rate, i - 1) * rate;
        }
        expectedPulls += n * Math.pow(1 - rate, n - 1);
        return expectedPulls;
    };

    let low = 0, high = effectiveRate;
    let mid;

    for (let i = 0; i < 100; i++) {
        mid = (low + high) / 2;
        const calculatedPulls = calculateExpectedPulls(mid);
        if (calculatedPulls > targetExpectedPulls) {
            low = mid;
        } else {
            high = mid;
        }
    }
    return (low + high) / 2;
}


// --- CORE CALCULATION LOGIC ---

/**
 * Calculates the expected number of draws to get a mythic item.
 * @param {number} mythicProbability - Base probability (0-1).
 * @param {number} hardPity - Pity count.
 * @returns {number} Expected draws per mythic.
 */
const calculateExpectedDrawsPerMythic = memoize((mythicProbability, hardPity) => {
    if (!(mythicProbability > 0 && mythicProbability <= 1) || hardPity < 1) return NaN;
    let expectedDraws = 0.0;
    for (let k = 1; k < hardPity; k++) {
        expectedDraws += k * Math.pow(1 - mythicProbability, k - 1) * mythicProbability;
    }
    expectedDraws += hardPity * Math.pow(1 - mythicProbability, hardPity - 1);
    return expectedDraws;
});

/**
 * Calculates metrics for a Legendary Mythic (LM) cycle.
 * @param {number} lmShardYield - Shards from an LM pull.
 * @param {number} nmShardYield - Shards from a Non-Mythic (NM) pull.
 * @param {number} lmRateUpChance - Probability of a mythic being an LM (0-1).
 * @param {number} nmGuaranteeThreshold - NM pulls before guaranteed LM.
 * @returns {object} Object with cycle metrics.
 */
const calculateLmCycleMetrics = memoize((lmShardYield, nmShardYield, lmRateUpChance, nmGuaranteeThreshold) => {
    if (!(lmRateUpChance >= 0 && lmRateUpChance <= 1) || nmGuaranteeThreshold < 0) {
        return { averageShardsPerEffectiveMythic: NaN, expectedMythicPullsPerLmCycle: NaN, worstCaseMythicPullsPerLmCycle: NaN };
    }
    const nmRateUpChance = 1.0 - lmRateUpChance;
    let totalExpectedShards = 0.0;
    let totalExpectedMythicPulls = 0.0;

    // Direct LM hit
    totalExpectedShards += lmShardYield * lmRateUpChance;
    totalExpectedMythicPulls += 1 * lmRateUpChance;

    // Sequences of NM hits -> LM
    for (let i = 1; i < nmGuaranteeThreshold; i++) {
        const p_sequence = Math.pow(nmRateUpChance, i) * lmRateUpChance;
        totalExpectedShards += ((nmShardYield * i) + lmShardYield) * p_sequence;
        totalExpectedMythicPulls += (i + 1) * p_sequence;
    }

    // Guarantee hit
    const p_guarantee = Math.pow(nmRateUpChance, nmGuaranteeThreshold);
    totalExpectedShards += ((nmShardYield * nmGuaranteeThreshold) + lmShardYield) * p_guarantee;
    totalExpectedMythicPulls += (nmGuaranteeThreshold + 1) * p_guarantee;
    
    const averageShards = totalExpectedMythicPulls > 0 ? totalExpectedShards / totalExpectedMythicPulls : 0.0;

    return {
        averageShardsPerEffectiveMythic: averageShards,
        expectedMythicPullsPerLmCycle: totalExpectedMythicPulls,
        worstCaseMythicPullsPerLmCycle: nmGuaranteeThreshold + 1
    };
});

/**
 * Calculates total Anvils needed for a target number of shards.
 * @param {number} targetShards - Number of shards to acquire.
 * @param {number} avgShardsPerMythic - Average shards per mythic pull.
 * @param {number} drawsPerMythic - Average draws for one mythic pull.
 * @returns {number} Estimated total anvils.
 */
function calculateGachaAnvils(targetShards, avgShardsPerMythic, drawsPerMythic) {
    if (targetShards <= 0) return 0;
    if (avgShardsPerMythic <= 0 || drawsPerMythic <= 0) return Infinity;
    return Math.ceil(targetShards / avgShardsPerMythic) * drawsPerMythic;
}

/**
 * Main function to perform all Expected Value calculations.
 * @param {object} inputs - Object containing all validated user inputs.
 * @returns {object} Calculated metrics or an error object.
 */
export function calculateExpectedValue(inputs) {
    const {
        mythicProbability, mythicHardPity, lmRateUpChance,
        startStarLevel, targetStarLevel, lmShardsYield
    } = inputs;

    const startShards = startStarLevel === "0_shards" ? 0 : CONSTANTS.SHARD_REQUIREMENTS[startStarLevel] || 0;
    const targetTotalShards = CONSTANTS.SHARD_REQUIREMENTS[targetStarLevel] || 0;
    const shardsNeededForUpgrade = Math.max(0, targetTotalShards - startShards);

    const drawsPerMythicAverage = calculateExpectedDrawsPerMythic(mythicProbability, mythicHardPity);
    if (isNaN(drawsPerMythicAverage)) return { error: 'Invalid base mythic calculation.' };

    // NEW: Calculate the actual rate from the effective rate provided by the user
    const actualLmRateUpChance = calculateActualRateFromEffectiveRate(lmRateUpChance, CONSTANTS.NM_GUARANTEE_THRESHOLD);

    const unlockCycleMetrics = calculateLmCycleMetrics(1, 0, actualLmRateUpChance, CONSTANTS.NM_GUARANTEE_THRESHOLD);
    if (isNaN(unlockCycleMetrics.expectedMythicPullsPerLmCycle)) return { error: 'Error calculating unlock cycle.' };

    const anvilsUnlockAvg = unlockCycleMetrics.expectedMythicPullsPerLmCycle * drawsPerMythicAverage;
    const anvilsUnlockBest = 1 * 1;
    const anvilsUnlockWorst = unlockCycleMetrics.worstCaseMythicPullsPerLmCycle * mythicHardPity;

    const lmCycleMetrics = calculateLmCycleMetrics(lmShardsYield, 0, actualLmRateUpChance, CONSTANTS.NM_GUARANTEE_THRESHOLD);
    if (isNaN(lmCycleMetrics.averageShardsPerEffectiveMythic)) return { error: 'Error in shard per mythic calculation.' };
    
    const avgEffShards = lmCycleMetrics.averageShardsPerEffectiveMythic;
    const bestShards = lmShardsYield;
    const worstShards = (0 * CONSTANTS.NM_GUARANTEE_THRESHOLD + lmShardsYield) / (CONSTANTS.NM_GUARANTEE_THRESHOLD + 1);

    const upgradeAnvilsAvg = calculateGachaAnvils(shardsNeededForUpgrade, avgEffShards, drawsPerMythicAverage);
    const upgradeAnvilsBest = calculateGachaAnvils(shardsNeededForUpgrade, bestShards, 1);
    const upgradeAnvilsWorst = calculateGachaAnvils(shardsNeededForUpgrade, worstShards, mythicHardPity);

    return {
        shardsNeededForUpgrade,
        unlockCost: {
            avg: anvilsUnlockAvg,
            best: anvilsUnlockBest,
            worst: anvilsUnlockWorst,
        },
        upgradeCost: {
            avg: upgradeAnvilsAvg,
            best: upgradeAnvilsBest,
            worst: upgradeAnvilsWorst,
        }
    };
}


// --- PROBABILITY SIMULATION ---

/**
 * Runs a single simulation attempt.
 * @param {object} params - Simulation parameters.
 * @returns {number} Total anvils spent, or budget + 1 on failure.
 */
function simulateSingleRun(params) {
    const {
        budget, mythicProb, hardPity, lmRateUp, nmGuarantee,
        includeUnlock, targetShardsForUpgrade, lmShardsYield,
        initialMythicPity, initialLMPityStreak
    } = params;

    let totalAnvils = 0;
    let currentShards = 0;
    let mythicPityCounter = initialMythicPity;
    let nmFailStreak = initialLMPityStreak;
    let isUnlocked = !includeUnlock;

    const performPull = () => {
        mythicPityCounter++;
        totalAnvils++;
        if (mythicPityCounter >= hardPity || Math.random() < mythicProb) {
            mythicPityCounter = 0;
            // Use the actual rate for the simulation
            const isLMPull = nmFailStreak >= nmGuarantee || Math.random() < lmRateUp;
            if (isLMPull) {
                nmFailStreak = 0;
                return { isLM: true, shards: lmShardsYield };
            }
            nmFailStreak++;
            return { isLM: false, shards: 0 };
        }
        return null;
    };

    if (includeUnlock && !isUnlocked) {
        while (totalAnvils < budget) {
            const pull = performPull();
            if (pull && pull.isLM) {
                isUnlocked = true;
                break;
            }
        }
        if (!isUnlocked) return budget + 1;
    }

    while (currentShards < targetShardsForUpgrade) {
        if (totalAnvils >= budget) return budget + 1;
        const pull = performPull();
        if (pull) currentShards += pull.shards;
    }

    return totalAnvils;
}

/**
 * Runs the main probability simulation.
 * @param {object} inputs - Object containing all validated user inputs.
 * @returns {object} Simulation results.
 */
export function runProbabilitySimulation(inputs) {
    const {
        anvilBudget, mythicProbability, mythicHardPity, lmRateUpChance,
        startStarLevel, targetStarLevel, lmShardsYield, toggleUnlockCost,
        currentMythicPity, currentLMPity
    } = inputs;

    const startShards = startStarLevel === "0_shards" ? 0 : CONSTANTS.SHARD_REQUIREMENTS[startStarLevel] || 0;
    const targetTotalShards = CONSTANTS.SHARD_REQUIREMENTS[targetStarLevel] || 0;
    const shardsNeededForUpgrade = Math.max(0, targetTotalShards - startShards);
    
    // NEW: Calculate the actual rate for the simulation
    const actualLmRateUpChance = calculateActualRateFromEffectiveRate(lmRateUpChance, CONSTANTS.NM_GUARANTEE_THRESHOLD);

    const simParams = {
        budget: anvilBudget,
        mythicProb: mythicProbability,
        hardPity: mythicHardPity,
        lmRateUp: actualLmRateUpChance, // Use the actual rate
        nmGuarantee: CONSTANTS.NM_GUARANTEE_THRESHOLD,
        includeUnlock: toggleUnlockCost,
        targetShardsForUpgrade: shardsNeededForUpgrade,
        lmShardsYield: lmShardsYield,
        initialMythicPity: currentMythicPity,
        initialLMPityStreak: currentLMPity,
    };

    const anvilCosts = Array.from({ length: CONSTANTS.NUM_SIM_RUNS }, () => simulateSingleRun(simParams));
    
    const successfulRuns = anvilCosts.filter(cost => cost <= anvilBudget);
    const successRate = (successfulRuns.length / CONSTANTS.NUM_SIM_RUNS) * 100;

    return {
        anvilCosts,
        successRate,
        successfulRuns,
        budget: anvilBudget
    };
}
