/**
 * @file core.js
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
