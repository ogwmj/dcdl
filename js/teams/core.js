/**
 * @file js/teams/core.js
 * @description Core logic for the Team Builder, including the TeamCalculator class
 * and data management functions. Decoupled from the DOM.
 */

// =================================================================================================
// #region: Data Definitions & Game Constants
// =================================================================================================

const STAR_COLOR_TIERS = { "Unlocked": 1.0, "White 1-Star": 1.0, "White 2-Star": 1.05, "White 3-Star": 1.10, "White 4-Star": 1.15, "White 5-Star": 1.20, "Blue 1-Star": 1.25, "Blue 2-Star": 1.30, "Blue 3-Star": 1.35, "Blue 4-Star": 1.40, "Blue 5-Star": 1.45, "Purple 1-Star": 1.50, "Purple 2-Star": 1.55, "Purple 3-Star": 1.60, "Purple 4-Star": 1.65, "Purple 5-Star": 1.70, "Gold 1-Star": 1.75, "Gold 2-Star": 1.80, "Gold 3-Star": 1.85, "Gold 4-Star": 1.90, "Gold 5-Star": 1.95, "Red 1-Star": 2.00, "Red 2-Star": 2.05, "Red 3-Star": 2.10, "Red 4-Star": 2.15, "Red 5-Star": 2.20 };
const LEGACY_PIECE_MODIFIER_PER_STAR_INCREMENT = 0.0025;
const LEGACY_PIECE_STAR_TIER_MODIFIER = {};
function generateLegacyPieceStarTierModifiers() {
    LEGACY_PIECE_STAR_TIER_MODIFIER["Unlocked"] = 0;
    const colors = ["White", "Blue", "Purple", "Gold", "Red"];
    let starStep = 0;
    colors.forEach(color => {
        for (let i = 1; i <= 5; i++) {
            starStep++;
            const tierName = `${color} ${i}-Star`;
            LEGACY_PIECE_STAR_TIER_MODIFIER[tierName] = starStep * LEGACY_PIECE_MODIFIER_PER_STAR_INCREMENT;
        }
    });
}
generateLegacyPieceStarTierModifiers();

export const GAME_CONSTANTS = {
    CHAMPION_BASE_RARITY_SCORE: { "Epic": 100, "Legendary": 150, "Mythic": 220, "Limited Mythic": 260 },
    STANDARD_GEAR_RARITIES: ["None", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Mythic Enhanced"],
    STANDARD_GEAR_RARITY_MODIFIER: { "None": 0.0, "Uncommon": 0.02, "Rare": 0.05, "Epic": 0.10, "Legendary": 0.15, "Mythic": 0.20, "Mythic Enhanced": 0.25 },
    LEGACY_PIECE_BASE_RARITY_MODIFIER: { "None": 0.0, "Epic": 0.10, "Legendary": 0.15, "Mythic": 0.20, "Mythic+": 0.25 },
    STAR_COLOR_TIERS: STAR_COLOR_TIERS,
    LEGACY_PIECE_STAR_TIER_MODIFIER: LEGACY_PIECE_STAR_TIER_MODIFIER,
    FORCE_LEVEL_MODIFIER: { 0: 0.0, 1: 0.10, 2: 0.20, 3: 0.30, 4: 0.40, 5: 0.50 },
    SYNERGY_COUNT_MODIFIER: 0.15,
    CLASS_DIVERSITY_MULTIPLIER: 1.15,
    SYNERGY_ACTIVATION_COUNT: 3,
    SYNERGY_DEPTH_BONUS: 450,
    INDIVIDUAL_SCORE_WEIGHT: 1.25,
    LEGACY_TIERS_ORDERED: ["Unlocked", "White 1-Star", "White 2-Star", "White 3-Star", "White 4-Star", "White 5-Star", "Blue 1-Star", "Blue 2-Star", "Blue 3-Star", "Blue 4-Star", "Blue 5-Star", "Purple 1-Star", "Purple 2-Star", "Purple 3-Star", "Purple 4-Star", "Purple 5-Star", "Gold 1-Star", "Gold 2-Star", "Gold 3-Star", "Gold 4-Star", "Gold 5-Star", "Red 1-Star", "Red 2-Star", "Red 3-Star", "Red 4-Star", "Red 5-Star"],
};

// =================================================================================================
// #region: Team Calculation Logic
// =================================================================================================

export class TeamCalculator {
    constructor(allSynergies, gameConstants) {
        this.synergies = [...allSynergies].sort((a, b) => {
            if (a.bonusType === 'percentage' && b.bonusType !== 'percentage') return -1;
            if (a.bonusType !== 'percentage' && b.bonusType === 'percentage') return 1;
            return 0;
        });
        this.constants = gameConstants;
    }

    static calculateIndividualChampionScore(champion, gameConstants) {
        const baseScore = gameConstants.CHAMPION_BASE_RARITY_SCORE[champion.baseRarity] || 0;
        const starMultiplier = gameConstants.STAR_COLOR_TIERS[champion.starColorTier] || 1.0;
        if (starMultiplier === 1.0 && champion.starColorTier !== "White 1-Star" && champion.starColorTier !== "Unlocked") {
            console.warn(`Unknown starColorTier: ${champion.starColorTier} for champion ${champion.name}, defaulting to multiplier 1.0`);
        }
        const championCoreScore = baseScore * starMultiplier;

        let totalEquipmentMultiplier = 1.0;

        if (champion.gear && typeof champion.gear === 'object') {
            Object.values(champion.gear).forEach(gearPiece => {
                if (gearPiece && gearPiece.rarity) {
                    totalEquipmentMultiplier += gameConstants.STANDARD_GEAR_RARITY_MODIFIER[gearPiece.rarity] || 0;
                }
            });
        }

        const legacyPiece = champion.legacyPiece || {};
        if (legacyPiece.id && legacyPiece.rarity !== 'None') {
            const baseLpModifier = gameConstants.LEGACY_PIECE_BASE_RARITY_MODIFIER[legacyPiece.rarity] || 0;
            const lpStarModifier = gameConstants.LEGACY_PIECE_STAR_TIER_MODIFIER[legacyPiece.starColorTier] || 0;
            totalEquipmentMultiplier += baseLpModifier + lpStarModifier;
        }

        const forceLevel = champion.forceLevel || 0;
        const forceModifier = gameConstants.FORCE_LEVEL_MODIFIER[forceLevel] || 0;
        totalEquipmentMultiplier += forceModifier;

        const synergyCount = Array.isArray(champion.inherentSynergies) ? champion.inherentSynergies.length : 0;
        totalEquipmentMultiplier += synergyCount * (gameConstants.SYNERGY_COUNT_MODIFIER || 0);

        const finalScore = championCoreScore * totalEquipmentMultiplier;

        return finalScore;
    }

    evaluateTeam(teamMembers) {
        const baseScoreSum = teamMembers.reduce((sum, member) => sum + (member.individualScore || 0), 0);
        let scoreAfterPercentageSynergies = baseScoreSum;
        let totalPercentageBonusAppliedValue = 0;
        let accumulatedBaseFlatBonus = 0;
        const activeSynergiesForTeam = [];

        const teamSynergyCounts = new Map();
        teamMembers.forEach(member => {
            (member.inherentSynergies || []).forEach(synergyName => {
                teamSynergyCounts.set(synergyName, (teamSynergyCounts.get(synergyName) || 0) + 1);
            });
        });

        this.synergies.forEach(synergyDef => {
            const memberCount = teamSynergyCounts.get(synergyDef.name) || 0;
            if (memberCount === 0) {
                return;
            }

            const isTiered = synergyDef.tiers && Array.isArray(synergyDef.tiers) && synergyDef.tiers.length > 0;
            let calculatedBonus = 0;

            if (isTiered) {
                const applicableTier = synergyDef.tiers
                    .filter(tier => memberCount >= tier.countRequired)
                    .sort((a, b) => b.countRequired - a.countRequired)[0];

                if (applicableTier) {
                    calculatedBonus = (synergyDef.bonusValue || 0) * (applicableTier.countRequired || 0);
                    accumulatedBaseFlatBonus += calculatedBonus;

                    activeSynergiesForTeam.push({
                        name: synergyDef.name,
                        description: applicableTier.tierDescription || synergyDef.description || '',
                        appliedAtMemberCount: memberCount,
                        bonusValue: synergyDef.bonusValue || 0,
                        bonusType: synergyDef.bonusType,
                        calculatedBonus: calculatedBonus
                    });
                }
            } else {
                if (synergyDef.bonusValue && memberCount >= this.constants.SYNERGY_ACTIVATION_COUNT) {
                    if (synergyDef.bonusType === 'percentage') {
                        calculatedBonus = scoreAfterPercentageSynergies * (synergyDef.bonusValue / 100);
                        totalPercentageBonusAppliedValue += calculatedBonus;
                        scoreAfterPercentageSynergies += calculatedBonus;
                    } else if (synergyDef.bonusType === 'flat') {
                        calculatedBonus = synergyDef.bonusValue;
                        accumulatedBaseFlatBonus += calculatedBonus;
                    }
                    activeSynergiesForTeam.push({
                        name: synergyDef.name,
                        description: synergyDef.description || '',
                        appliedAtMemberCount: memberCount,
                        bonusValue: synergyDef.bonusValue,
                        bonusType: synergyDef.bonusType,
                        calculatedBonus: calculatedBonus
                    });
                }
            }
        });

        let subtotalAfterSynergies = scoreAfterPercentageSynergies + accumulatedBaseFlatBonus;

        let synergyDepthBonusValue = 0;
        teamSynergyCounts.forEach((memberCount, synergyName) => {
            const synergyDef = this.synergies.find(s => s.name === synergyName);
            if (!synergyDef) return;

            let minActivationCount = this.constants.SYNERGY_ACTIVATION_COUNT;
            if (synergyDef.tiers && synergyDef.tiers.length > 0) {
                const lowestTier = synergyDef.tiers.sort((a, b) => a.countRequired - b.countRequired)[0];
                if (lowestTier) {
                    minActivationCount = lowestTier.countRequired;
                }
            }

            if (memberCount > minActivationCount) {
                const extraMembers = memberCount - minActivationCount;
                synergyDepthBonusValue += extraMembers * (this.constants.SYNERGY_DEPTH_BONUS || 0);
            }
        });
        subtotalAfterSynergies += synergyDepthBonusValue;


        const uniqueClassesInTeam = new Set(teamMembers.map(m => m.class).filter(c => c && c !== "N/A"));
        let classDiversityBonusValue = 0;
        let finalTeamScore = subtotalAfterSynergies;
        let classDiversityBonusApplied = false;

        if (uniqueClassesInTeam.size >= 4) {
            classDiversityBonusValue = subtotalAfterSynergies * (this.constants.CLASS_DIVERSITY_MULTIPLIER - 1);
            finalTeamScore += classDiversityBonusValue;
            classDiversityBonusApplied = true;
        }

        const comparisonScore = finalTeamScore + (baseScoreSum * this.constants.INDIVIDUAL_SCORE_WEIGHT);

        return {
            members: teamMembers,
            totalScore: finalTeamScore,
            comparisonScore: comparisonScore,
            activeSynergies: activeSynergiesForTeam,
            baseScoreSum: baseScoreSum,
            uniqueClassesCount: uniqueClassesInTeam.size,
            classDiversityBonusApplied: classDiversityBonusApplied,
            scoreBreakdown: {
                base: baseScoreSum,
                percentageSynergyBonus: totalPercentageBonusAppliedValue,
                flatSynergyBonus: accumulatedBaseFlatBonus,
                synergyDepthBonus: synergyDepthBonusValue,
                subtotalAfterSynergies: subtotalAfterSynergies,
                classDiversityBonus: classDiversityBonusValue
            }
        };
    }

    async findOptimalTeam(roster, options) {
        const {
            requireHealer,
            updateProgress
        } = options;
        await updateProgress("Generating potential team combinations...", 12);

        let teamCombinations = [];
        if (requireHealer) {
            const healers = roster.filter(champ => champ.isHealer === true);
            if (healers.length === 0) throw new Error("No healers found to meet the 'Require Healer' criteria.");
            if (roster.length < 5) throw new Error("Not enough champions to form a team of 5 with a healer.");

            await updateProgress("Generating combinations with healers...", 15);
            healers.forEach(healer => {
                const otherChamps = roster.filter(champ => champ.id !== healer.id);
                if (otherChamps.length >= 4) {
                    const combinationsOfFour = generateCombinations(otherChamps, 4);
                    combinationsOfFour.forEach(combo => teamCombinations.push([healer, ...combo]));
                }
            });
        } else {
            await updateProgress("Generating general combinations...", 15);
            teamCombinations = generateCombinations(roster, 5);
        }

        if (teamCombinations.length === 0) throw new Error("Could not generate any valid teams with the current criteria.");
        await updateProgress(`Generated ${teamCombinations.length} combinations. Evaluating...`, 20);

        return new Promise((resolve) => {
            let bestTeam = null;
            let maxComparisonScore = -1;
            let currentIndex = 0;
            const processBatch = () => {
                const batchEndTime = Date.now() + 16;
                while (Date.now() < batchEndTime && currentIndex < teamCombinations.length) {
                    const evaluatedTeam = this.evaluateTeam(teamCombinations[currentIndex]);

                    if (evaluatedTeam.comparisonScore > maxComparisonScore) {
                        maxComparisonScore = evaluatedTeam.comparisonScore;
                        bestTeam = evaluatedTeam;
                    }
                    currentIndex++;
                }

                if (currentIndex < teamCombinations.length) {
                    const progress = 20 + Math.round((currentIndex / teamCombinations.length) * 75);
                    updateProgress(`Evaluating team ${currentIndex} of ${teamCombinations.length}...`, progress);
                    requestAnimationFrame(processBatch);
                } else {
                    updateProgress("Finalizing best team...", 98);
                    resolve(bestTeam);
                }
            };
            requestAnimationFrame(processBatch);
        });
    }

    /**
     * Finds the best single-step upgrades for champions not on the provided best team.
     * @param {object} bestTeam - The result from evaluateTeam for the current best team.
     * @param {Array<object>} fullRoster - The entire player roster.
     * @param {object} gameConstants - The GAME_CONSTANTS object.
     * @param {boolean} requireHealer - A flag indicating if the team must contain a healer.
     * @param {Array<string>} excludedChampionDbIds - An array of champion dbChampionIds to exclude from suggestions.
     * @param {Array<string>} requiredSynergies - An array of synergy names that challengers must have.
     * @returns {Array<object>} A sorted list of the best upgrade suggestions.
     */
    findUpgradeSuggestions(bestTeam, fullRoster, gameConstants, requireHealer = false, excludedChampionDbIds = [], requiredSynergies = []) {
        const suggestions = [];
        const bestTeamMemberIds = new Set(bestTeam.members.map(m => m.id));
        
        // 1. Identify the "Weakest Link", respecting the requireHealer flag
        let potentialSwapTargets = bestTeam.members;
        if (requireHealer) {
            // If a healer is required, the potential targets can only be non-healers.
            const nonHealersOnTeam = bestTeam.members.filter(m => m.isHealer !== true);
            // Only use the filtered list if it's possible to do so (i.e., the team isn't 100% healers).
            if (nonHealersOnTeam.length > 0) {
                potentialSwapTargets = nonHealersOnTeam;
            }
        }
        
        // If no potential targets are found (e.g., an all-healer team), the function will gracefully exit.
        if (!potentialSwapTargets.length) {
            return [];
        }

        let swapTarget;
        if (potentialSwapTargets.length === 1) {
            swapTarget = potentialSwapTargets[0];
        } else {
            // Calculate the score drop caused by removing each potential target. The one with the smallest drop is the weakest link.
            const memberContributions = potentialSwapTargets.map(memberToTest => {
                const teamWithoutMember = bestTeam.members.filter(m => m.id !== memberToTest.id);
                const scoreWithoutMember = this.evaluateTeam(teamWithoutMember).totalScore;
                const scoreContribution = bestTeam.totalScore - scoreWithoutMember;
                return { member: memberToTest, contribution: scoreContribution };
            });
            memberContributions.sort((a, b) => a.contribution - b.contribution); // Sort ascending by contribution
            swapTarget = memberContributions[0].member;
        }
        
        // 2. Identify "Challengers", respecting all filters
        const excludedDbIdsSet = new Set(excludedChampionDbIds);
        const challengers = fullRoster.filter(champ => {
            const hasRequiredSynergy = requiredSynergies.length === 0 || 
                (champ.inherentSynergies && champ.inherentSynergies.some(s => requiredSynergies.includes(s)));
            
            return !bestTeamMemberIds.has(champ.id) && 
                !excludedDbIdsSet.has(champ.dbChampionId) &&
                hasRequiredSynergy;
        });

        challengers.forEach(champ => {
            // This helper function and the rest of the loops remain the same
            const runSimulation = (hypotheticalChamp, suggestionData) => {
                hypotheticalChamp.individualScore = TeamCalculator.calculateIndividualChampionScore(hypotheticalChamp, gameConstants);
                const testTeamMembers = bestTeam.members.map(member => member.id === swapTarget.id ? hypotheticalChamp : member);
                const evaluatedTestTeam = this.evaluateTeam(testTeamMembers);
                if (evaluatedTestTeam.totalScore > bestTeam.totalScore) {
                    suggestions.push({
                        ...suggestionData,
                        championToUpgrade: champ,
                        displacedChampion: swapTarget,
                        newTeamScore: evaluatedTestTeam.totalScore,
                        scoreIncrease: evaluatedTestTeam.totalScore - bestTeam.totalScore,
                    });
                }
            };

            // --- Suggestion Type: Force Level ---
            if (champ.forceLevel < 5) {
                const hypotheticalChamp = { ...champ, forceLevel: champ.forceLevel + 1 };
                runSimulation(hypotheticalChamp, {
                    upgradeType: 'Force Level',
                    fromValue: champ.forceLevel,
                    toValue: hypotheticalChamp.forceLevel,
                });
            }

            // --- Suggestion Type: Gear ---
            const gearSlots = ['head', 'arms', 'chest', 'legs', 'waist'];
            gearSlots.forEach(slot => {
                const currentRarity = champ.gear[slot]?.rarity || 'None';
                const currentRarityIndex = gameConstants.STANDARD_GEAR_RARITIES.indexOf(currentRarity);
                if (currentRarityIndex < gameConstants.STANDARD_GEAR_RARITIES.length - 1) {
                    const nextRarity = gameConstants.STANDARD_GEAR_RARITIES[currentRarityIndex + 1];
                    const hypotheticalChamp = {
                        ...champ,
                        gear: { ...champ.gear, [slot]: { rarity: nextRarity } },
                    };
                    runSimulation(hypotheticalChamp, {
                        upgradeType: 'Gear',
                        itemName: slot.charAt(0).toUpperCase() + slot.slice(1),
                        fromValue: currentRarity,
                        toValue: nextRarity,
                    });
                }
            });

            // --- Suggestion Type: Legacy Piece Tier ---
            if (champ.legacyPiece && champ.legacyPiece.id) {
                const currentTier = champ.legacyPiece.starColorTier || 'Unlocked';
                const currentTierIndex = gameConstants.LEGACY_TIERS_ORDERED.indexOf(currentTier);
                if (currentTierIndex < gameConstants.LEGACY_TIERS_ORDERED.length - 1) {
                    const nextTier = gameConstants.LEGACY_TIERS_ORDERED[currentTierIndex + 1];
                    const hypotheticalChamp = {
                        ...champ,
                        legacyPiece: { ...champ.legacyPiece, starColorTier: nextTier },
                    };
                    runSimulation(hypotheticalChamp, {
                        upgradeType: 'Legacy Piece',
                        itemName: champ.legacyPiece.name,
                        fromValue: currentTier,
                        toValue: nextTier,
                    });
                }
            }
        });

        return suggestions.sort((a, b) => b.scoreIncrease - a.scoreIncrease);
    }
}

/**
 * Generates all unique combinations of a specific size from an array.
 * @param {Array<any>} array - The source array.
 * @param {number} k - The size of each combination.
 * @returns {Array<Array<any>>} An array of combination arrays.
 */
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

/**
 * Ensures all members of a team array have their individual score calculated.
 * This is a utility for handling older data formats or re-calculating scores.
 * @param {Array<object>} members - The array of team members.
 * @param {Array<object>} dbChampions - The full database of champions for lookups.
 * @returns {Array<object>} The team members array with scores.
 */
export function ensureIndividualScores(members, dbChampions) {
    if (!members || !Array.isArray(members)) return [];
    
    return members.map(member => {
        const newMember = { ...member };
        
        // Always recalculate score to ensure consistency, not just if it's undefined
        const baseChampDetails = dbChampions.find(c => c.id === newMember.dbChampionId) || {};
        
        const memberForScoreCalc = {
            ...baseChampDetails,
            ...newMember,
            gear: newMember.gear || {}, // Ensure gear is an object
            legacyPiece: {
                ...(newMember.legacyPiece || {}),
                rarity: newMember.legacyPiece?.rarity || "None",
                starColorTier: newMember.legacyPiece?.starColorTier || "Unlocked"
            }
        };
        
        newMember.individualScore = TeamCalculator.calculateIndividualChampionScore(memberForScoreCalc, GAME_CONSTANTS);
        
        return newMember;
    });
}
