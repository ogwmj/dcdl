/**
 * @file js/stores/core.js
 * @fileoverview Core calculation and time logic for the Store Analyzer.
 * @version 1.1.1 - Reworked planner engine to use a dynamic, stateful purchasing model.
 */

// --- Time Constants (in UTC) ---
const T_DAY = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6
};
const MS_IN_SECOND = 1000;
const MS_IN_MINUTE = 60 * MS_IN_SECOND;
const MS_IN_HOUR = 60 * MS_IN_MINUTE;
const MS_IN_DAY = 24 * MS_IN_HOUR;

// --- Gem Income Tiers ---
const GEM_INCOME_TIERS = {
    low: { daily: 65, weekly: 870, monthly: 220 },
    medium: { daily: 250, weekly: 1800, monthly: 400 },
    high: { daily: 1000, weekly: 4000, monthly: 720 },
};

const SUPER_MONTHLY_PASS = {
    name: "Super Monthly Pass",
    cost: 9.99,
    dailyGems: 90,
    durationDays: 30,
    maxStacks: 5,
};


// --- TIME CALCULATION FUNCTIONS ---

function getNextDailyRefresh(now, hoursUTC) {
    for (const hour of hoursUTC) {
        const potentialRefresh = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0, 0));
        if (potentialRefresh > now) {
            return potentialRefresh;
        }
    }
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(now.getUTCDate() + 1);
    return new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), hoursUTC[0], 0, 0, 0));
}

function getNextWeeklyRefresh(now, targetDayUTC) {
    const nextRefresh = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    while (nextRefresh.getUTCDay() !== targetDayUTC) {
        nextRefresh.setUTCDate(nextRefresh.getUTCDate() + 1);
    }
    if (nextRefresh <= now) {
        nextRefresh.setUTCDate(nextRefresh.getUTCDate() + 7);
    }
    return nextRefresh;
}

function formatCountdown(ms) {
    if (ms <= 0) return "Refreshed!";
    
    const days = Math.floor(ms / MS_IN_DAY);
    ms %= MS_IN_DAY;
    const hours = Math.floor(ms / MS_IN_HOUR);
    ms %= MS_IN_HOUR;
    const minutes = Math.floor(ms / MS_IN_MINUTE);
    ms %= MS_IN_MINUTE;
    const seconds = Math.floor(ms / MS_IN_SECOND);

    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds >= 0 && parts.length < 3) parts.push(`${seconds}s`);
    
    return parts.join(' ');
}

export function getStoreTimers(now = new Date()) {
    const gemStoreRefreshHours = [0, 8, 16];
    const nextGemStoreRefresh = getNextDailyRefresh(now, gemStoreRefreshHours);
    
    const nextCurrencyStoreRefresh = getNextWeeklyRefresh(now, T_DAY.Monday);

    const currentUTCDay = now.getUTCDay();
    
    const visitorArrivalDayUTC = T_DAY.Saturday;
    const visitorDepartureDayUTC = T_DAY.Monday;
    const isVisitorActive = currentUTCDay === T_DAY.Saturday || currentUTCDay === T_DAY.Sunday;

    const nextArrival = getNextWeeklyRefresh(now, visitorArrivalDayUTC);
    const nextDeparture = getNextWeeklyRefresh(now, visitorDepartureDayUTC);
    
    const visitorTimerTarget = isVisitorActive ? nextDeparture : nextArrival;
    const visitorStatusMessage = isVisitorActive ? "Visitor departs in:" : "Visitor arrives in:";

    return {
        gemStore: {
            countdown: formatCountdown(nextGemStoreRefresh - now),
        },
        currencyStore: {
            countdown: formatCountdown(nextCurrencyStoreRefresh - now),
        },
        interstellarVisitor: {
            isActive: isVisitorActive,
            statusMessage: visitorStatusMessage,
            countdown: formatCountdown(visitorTimerTarget - now),
        }
    };
}


// --- VALUE ANALYSIS FUNCTIONS ---

function getAnvilContent(contents = []) {
    return contents.find(c => c.item === 'Anvil')?.quantity || 0;
}

export function analyzeScalingBundle(bundle, anvilToGemValue) {
    const tierAnalysis = bundle.tiers.map(tier => {
        const anvils = getAnvilContent(tier.contents);
        const gems = tier.contents?.find(c => c.item === 'Gems')?.quantity || 0;
        const totalEquivalentGemValue = gems + (anvils * anvilToGemValue);
        
        return {
            ...tier,
            analysis: {
                anvils,
                gems,
                equivalentGemValue: totalEquivalentGemValue,
                valuePerDollar: tier.cost > 0 ? (totalEquivalentGemValue / tier.cost).toFixed(2) : 0,
                anvilsPerDollar: tier.cost > 0 ? (anvils / tier.cost).toFixed(2) : 0,
            }
        };
    });

    return { ...bundle, tiers: tierAnalysis };
}

export function analyzeSubscription(pass, loginConsistency = 1.0) {
    const dailyGemsTotal = pass.dailyGems * pass.durationDays * loginConsistency;
    const totalGems = pass.immediateGems + dailyGemsTotal;

    return {
        ...pass,
        analysis: {
            projectedGems: Math.round(totalGems),
            gemsPerDollar: pass.cost > 0 ? (totalGems / pass.cost).toFixed(2) : 0,
        }
    };
}

export function analyzeGemStoreItem(item) {
    const anvils = getAnvilContent(item.itemContents);
    if (anvils === 0) {
        return { ...item, analysis: { anvils, gemCostPerAnvil: 'N/A' } };
    }

    const gemCostPerAnvil = item.gemCost > 0 ? (item.gemCost / anvils).toFixed(2) : 'N/A';
    return { ...item, analysis: { anvils, gemCostPerAnvil } };
}

export function findBestAnvilDeals(allGemItems, analyzedFiatBundles) {
    let bestGemDeal = null;
    let bestFiatDeal = null;

    const gemAnvilDeals = allGemItems.map(analyzeGemStoreItem).filter(item => item.analysis.gemCostPerAnvil !== 'N/A');
    if (gemAnvilDeals.length > 0) {
        bestGemDeal = gemAnvilDeals.reduce((best, current) => 
            parseFloat(current.analysis.gemCostPerAnvil) < parseFloat(best.analysis.gemCostPerAnvil) ? current : best
        );
    }

    const fiatAnvilDeals = [];
    analyzedFiatBundles.forEach(bundle => {
        if (bundle.bundleType === 'scaling') {
            bundle.tiers.forEach(tier => {
                if (tier.analysis.anvils > 0) {
                    fiatAnvilDeals.push({
                        name: `${bundle.bundleName} (Tier ${tier.tier})`,
                        anvilsPerDollar: tier.analysis.anvilsPerDollar,
                        valuePerDollar: tier.analysis.valuePerDollar,
                    });
                }
            });
        }
    });

    if (fiatAnvilDeals.length > 0) {
        bestFiatDeal = fiatAnvilDeals.reduce((best, current) => 
            parseFloat(current.anvilsPerDollar) > parseFloat(best.anvilsPerDollar) ? current : best
        );
    }
    
    return { bestGemDeal, bestFiatDeal };
}

/**
 * Creates an optimal acquisition plan for a target number of anvils within a timeframe.
 * @returns {object} An object containing the formatted plan and a detailed cost/income breakdown.
 */
export function createAnvilAcquisitionPlan(targetAnvils, gemStoreMasterList, allFiatBundles, interstellarItems, targetDate, gemIncomeLevel = 'medium', superMonthlyPassQty = 0) {
    const now = new Date();
    if (targetDate <= now) {
        return { plan: ["Target date must be in the future."] };
    }

    // --- 1. Collate all possible purchase opportunities ---
    const nowTimestamp = now.getTime();
    const targetTimestamp = targetDate.getTime();
    const daysUntilTarget = Math.max(0, (targetTimestamp - nowTimestamp) / MS_IN_DAY);
    
    let weeklyResetCount = 0;
    let visitorResetCount = 0;
    
    let tempDate = new Date(now.getTime());
    for (let i = 0; i < daysUntilTarget; i++) {
        tempDate.setUTCDate(tempDate.getUTCDate() + 1);
        const day = tempDate.getUTCDay();
        if (day === T_DAY.Monday) weeklyResetCount++;
        if (day === T_DAY.Friday) visitorResetCount++;
    }
    if(now.getUTCDay() !== T_DAY.Monday && daysUntilTarget > 0) weeklyResetCount++;

    const gemRefreshes = Math.floor(daysUntilTarget * 3);

    let availableGemPurchases = [];
    const allGemMasterList = [...gemStoreMasterList, ...interstellarItems];
    allGemMasterList.forEach(item => {
        const analyzed = analyzeGemStoreItem(item);
        if (analyzed.analysis.anvils > 0 && analyzed.analysis.gemCostPerAnvil !== 'N/A') {
            const isVisitorItem = interstellarItems.includes(item);
            const availabilityCount = isVisitorItem ? (visitorResetCount * (item.limit || 1)) : (gemRefreshes * (item.limit || 1));
            
            for (let i = 0; i < availabilityCount; i++) {
                availableGemPurchases.push({
                    type: 'gem', name: item.itemName, cost: item.gemCost, anvils: analyzed.analysis.anvils,
                    efficiency: parseFloat(analyzed.analysis.gemCostPerAnvil),
                    sourceName: isVisitorItem ? "Interstellar Visitor" : "Mystery Store",
                    weekIndex: isVisitorItem ? Math.floor(i / (item.limit || 1)) : -1,
                });
            }
        }
    });
    availableGemPurchases.sort((a, b) => a.efficiency - b.efficiency);

    let availableFiatPurchases = [];
    if (weeklyResetCount > 0) {
        allFiatBundles.forEach(bundle => {
            if (bundle.bundleType === 'scaling') {
                for (let i = 0; i < weeklyResetCount; i++) {
                    bundle.tiers.forEach(tier => {
                        const anvils = getAnvilContent(tier.contents);
                        const gems = tier.contents?.find(c => c.item === 'Gems')?.quantity || 0;
                        const value = (anvils * 60) + gems; // Simple value score
                        if (value > 0) {
                            for (let j = 0; j < (tier.limit || 1); j++) {
                                availableFiatPurchases.push({
                                    type: 'fiat', name: `${bundle.bundleName} (Tier ${tier.tier})`, cost: tier.cost, anvils, gems,
                                    efficiency: tier.cost > 0 ? value / tier.cost : Infinity,
                                    sourceName: "Currency Store", weekIndex: i,
                                });
                            }
                        }
                    });
                }
            }
        });
    }
    availableFiatPurchases.sort((a, b) => b.efficiency - a.efficiency); // Sort by best value per dollar

    // --- 2. Calculate initial gem pool from income ---
    const incomeTier = GEM_INCOME_TIERS[gemIncomeLevel];
    const f2pDailyGemIncome = incomeTier.daily + (incomeTier.weekly / 7) + (incomeTier.monthly / 30);
    const f2pGeneratedGems = f2pDailyGemIncome * daysUntilTarget;
    
    const passActiveDurationDays = SUPER_MONTHLY_PASS.durationDays * superMonthlyPassQty;
    const effectivePassDays = Math.min(daysUntilTarget, passActiveDurationDays);
    const passGeneratedGems = (superMonthlyPassQty > 0 ? SUPER_MONTHLY_PASS.dailyGems : 0) * effectivePassDays;

    let gemPool = f2pGeneratedGems + passGeneratedGems;
    
    // --- 3. Iteratively build the plan ---
    const purchaseLog = [];
    let anvilsRemaining = targetAnvils;
    let sanityCheck = 0;

    while (anvilsRemaining > 0 && sanityCheck < 1000) {
        sanityCheck++;
        
        let bestGemOption = availableGemPurchases[0];
        let canAffordGemOption = bestGemOption && gemPool >= bestGemOption.cost;

        if (canAffordGemOption) {
            // If we can afford the best gem deal, we take it.
            const itemToBuy = availableGemPurchases.shift();
            purchaseLog.push(itemToBuy);
            gemPool -= itemToBuy.cost;
            anvilsRemaining -= itemToBuy.anvils;
        } else {
            // We can't afford the best gem deal (or any gem deal), so we must buy a fiat bundle.
            if (availableFiatPurchases.length > 0) {
                const itemToBuy = availableFiatPurchases.shift();
                purchaseLog.push(itemToBuy);
                gemPool += itemToBuy.gems;
                anvilsRemaining -= itemToBuy.anvils;
            } else {
                // No more options left.
                break;
            }
        }
    }
    
    // --- 4. Final calculations and formatting ---
    let totalGemCost = 0;
    let totalFiatCost = 0;
    let gemsFromFiatPurchases = 0;
    const scheduledPurchases = {};

    purchaseLog.forEach(p => {
        if (p.type === 'gem') {
            totalGemCost += p.cost;
        } else if (p.type === 'fiat') {
            totalFiatCost += p.cost;
            gemsFromFiatPurchases += p.gems;
        }

        let key;
        if (p.sourceName === 'Mystery Store') {
            key = `Always Available (Mystery Store)`;
        } else {
             key = `Week ${p.weekIndex + 1}${p.sourceName === 'Interstellar Visitor' ? ' (Visitor)' : ''}`;
        }
        
        if (!scheduledPurchases[key]) scheduledPurchases[key] = [];
        const existing = scheduledPurchases[key].find(i => i.name === p.name);
        if (existing) existing.count++;
        else scheduledPurchases[key].push({ name: p.name, source: p.sourceName, count: 1 });
    });

    const plan = [];
    const sortedWeeks = Object.keys(scheduledPurchases).sort((a, b) => {
        if (a.startsWith('Always')) return -1;
        if (b.startsWith('Always')) return 1;
        const weekA = parseInt(a.match(/(\d+)/)[0], 10);
        const weekB = parseInt(b.match(/(\d+)/)[0], 10);
        return weekA - weekB;
    });
    
    sortedWeeks.forEach(week => {
        plan.push(`**${week}:**`);
        scheduledPurchases[week].forEach(item => {
            plan.push(`- Purchase ${item.name} **${item.count}** time(s).`);
        });
    });
    
    if (anvilsRemaining > 0) {
        plan.push(`---`);
        plan.push(`After all purchases, you will still be short by **${Math.ceil(anvilsRemaining)}** Anvils.`);
    }
    
    const totalGemsAcquired = f2pGeneratedGems + passGeneratedGems + gemsFromFiatPurchases;
    const finalGemSurplus = totalGemsAcquired - totalGemCost;

    return { 
        plan, 
        totalFiatCost: totalFiatCost + (superMonthlyPassQty * SUPER_MONTHLY_PASS.cost),
        gemBreakdown: {
            neededForPurchases: Math.ceil(totalGemCost),
            fromF2PIncome: Math.ceil(f2pGeneratedGems),
            fromPasses: Math.ceil(passGeneratedGems),
            fromBundles: Math.ceil(gemsFromFiatPurchases),
            netCost: Math.ceil(Math.max(0, -finalGemSurplus)),
            surplus: Math.ceil(Math.max(0, finalGemSurplus))
        }
    };
}


export function calculateSavingsTime(targetGemCost, currentGems, weeklyGemIncome) {
    const gemsNeeded = targetGemCost - currentGems;
    if (gemsNeeded <= 0) return { weeks: 0 };
    if (weeklyGemIncome <= 0) return { weeks: Infinity };
    const weeks = gemsNeeded / weeklyGemIncome;
    return { weeks: weeks.toFixed(1) };
}
