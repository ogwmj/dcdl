/**
 * @file js/stores/core.js
 * @fileoverview Core calculation and time logic for the Store Analyzer.
 * @version 1.0.2 - Renamed Gem Store to Mystery Store.
 */

// --- Time Constants (in UTC) ---
const T_DAY = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6
};
const MS_IN_SECOND = 1000;
const MS_IN_MINUTE = 60 * MS_IN_SECOND;
const MS_IN_HOUR = 60 * MS_IN_MINUTE;
const MS_IN_DAY = 24 * MS_IN_HOUR;


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
    
    // Corrected Interstellar Visitor Logic
    // Visitor arrives at 00:00 UTC on Saturday and departs at 00:00 UTC on Monday.
    // This means the visitor is active on Saturday and Sunday.
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
 * @param {number} targetAnvils - The number of anvils the user needs.
 * @param {Array} gemStoreMasterList - A master list of ALL possible Mystery Store items.
 * @param {Array} allFiatBundles - All available currency store bundles.
 * @param {Array} interstellarItems - The static list of weekend deals.
 * @param {Date} targetDate - The date the user wants the anvils by.
 * @returns {object} An object containing the formatted plan and total costs.
 */
export function createAnvilAcquisitionPlan(targetAnvils, gemStoreMasterList, allFiatBundles, interstellarItems, targetDate) {
    let anvilsRemaining = targetAnvils;
    const now = new Date();
    if (targetDate <= now) {
        return { plan: ["Target date must be in the future."], totalGemCost: 0, totalFiatCost: 0 };
    }

    const availablePurchases = [];

    // --- 1. Collate all possible INDIVIDUAL purchases within the timeframe ---
    const msInDay = 24 * 60 * 60 * 1000;
    const nowTimestamp = now.getTime();
    const targetTimestamp = targetDate.getTime();
    
    let weeklyResetCount = 1; // Always include the current week
    let visitorResetCount = 0;
    
    let cursor = new Date(nowTimestamp);
    cursor.setUTCHours(0, 0, 0, 0);

    while (cursor <= targetDate) {
        const day = cursor.getUTCDay();
        if (day === T_DAY.Monday && cursor.getTime() > now.getTime()) weeklyResetCount++;
        if (day === T_DAY.Friday) visitorResetCount++;
        cursor.setDate(cursor.getDate() + 1);
    }

    const gemRefreshes = Math.floor((targetTimestamp - nowTimestamp) / (MS_IN_HOUR * 8));

    // Mystery Store
    if (gemRefreshes > 0) {
        gemStoreMasterList.forEach(item => {
            const analyzed = analyzeGemStoreItem(item);
            if (analyzed.analysis.gemCostPerAnvil !== 'N/A') {
                for (let i = 0; i < gemRefreshes * (item.limit || 1); i++) {
                    availablePurchases.push({
                        type: 'gem', name: item.itemName, cost: item.gemCost, anvils: analyzed.analysis.anvils,
                        efficiency: parseFloat(analyzed.analysis.gemCostPerAnvil),
                        sourceName: "Mystery Store"
                    });
                }
            }
        });
    }

    // Interstellar Visitor
    if (visitorResetCount > 0) {
        interstellarItems.forEach(item => {
            const analyzed = analyzeGemStoreItem(item);
            if (analyzed.analysis.gemCostPerAnvil !== 'N/A') {
                for (let i = 0; i < visitorResetCount * (item.limit || 1); i++) {
                    availablePurchases.push({
                        type: 'gem', name: item.itemName, cost: item.gemCost, anvils: analyzed.analysis.anvils,
                        efficiency: parseFloat(analyzed.analysis.gemCostPerAnvil),
                        sourceName: "Interstellar Visitor"
                    });
                }
            }
        });
    }

    // Currency Store
    if (weeklyResetCount > 0) {
        allFiatBundles.forEach(bundle => {
            if (bundle.bundleType === 'scaling') {
                for (let i = 0; i < weeklyResetCount; i++) {
                    bundle.tiers.forEach(tier => {
                        const anvils = getAnvilContent(tier.contents);
                        if (anvils > 0) {
                            for (let j = 0; j < (tier.limit || 1); j++) {
                                availablePurchases.push({
                                    type: 'fiat', name: `${bundle.bundleName} (Tier ${tier.tier})`, cost: tier.cost, anvils,
                                    efficiency: tier.cost > 0 ? (anvils / tier.cost) : 0,
                                    sourceName: "Currency Store"
                                });
                            }
                        }
                    });
                }
            }
        });
    }

    // --- 2. Sort all available purchases by efficiency ---
    const gemSources = availablePurchases.filter(s => s.type === 'gem').sort((a,b) => a.efficiency - b.efficiency);
    const fiatSources = availablePurchases.filter(s => s.type === 'fiat').sort((a,b) => b.efficiency - a.efficiency);
    const sortedSources = [...gemSources, ...fiatSources];

    // --- 3. Build the plan using the greedy algorithm ---
    const purchaseLog = [];
    for (const source of sortedSources) {
        if (anvilsRemaining <= 0) break;
        purchaseLog.push(source);
        anvilsRemaining -= source.anvils;
    }

    if (purchaseLog.length === 0 && anvilsRemaining > 0) {
        return { plan: [`No available sources to acquire **${targetAnvils}** Anvils within the selected timeframe.`], totalGemCost: 0, totalFiatCost: 0 };
    }
    
    // --- 4. Group and format the final plan ---
    const groupedPurchases = {};
    let totalGemCost = 0;
    let totalFiatCost = 0;

    purchaseLog.forEach(p => {
        const key = `${p.sourceName} - ${p.name}`;
        groupedPurchases[key] = (groupedPurchases[key] || 0) + 1;
        if(p.type === 'gem') totalGemCost += p.cost;
        if(p.type === 'fiat') totalFiatCost += p.cost;
    });

    const plan = [];
    const groupedByStore = {};

    for (const [key, count] of Object.entries(groupedPurchases)) {
        const [sourceName, itemName] = key.split(' - ');
        if (!groupedByStore[sourceName]) {
            groupedByStore[sourceName] = [];
        }
        groupedByStore[sourceName].push(`Purchase ${itemName} **${count}** time(s).`);
    }

    for (const [storeName, items] of Object.entries(groupedByStore)) {
        plan.push(`**${storeName}:**`);
        items.forEach(item => plan.push(`- ${item}`));
    }

    if (anvilsRemaining > 0) {
        plan.push(`---`);
        plan.push(`After all purchases, you will still need **${Math.ceil(anvilsRemaining)}** more Anvils.`);
    }

    return { plan, totalGemCost, totalFiatCost };
}


export function calculateSavingsTime(targetGemCost, currentGems, weeklyGemIncome) {
    const gemsNeeded = targetGemCost - currentGems;
    if (gemsNeeded <= 0) return { weeks: 0 };
    if (weeklyGemIncome <= 0) return { weeks: Infinity };
    const weeks = gemsNeeded / weeklyGemIncome;
    return { weeks: weeks.toFixed(1) };
}
