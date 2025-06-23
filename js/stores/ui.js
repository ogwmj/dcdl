/**
 * @file js/stores/ui.js
 * @fileoverview Handles UI interactions, data fetching, and rendering for the Store Analyzer.
 * @version 1.9.2 - Added daily gem requirement to all strategy cards.
 */

import {
    getStoreTimers,
    analyzeScalingBundle,
    analyzeSubscription,
    analyzeGemStoreItem,
    calculateSavingsTime,
    findBestAnvilDeals,
    createAnvilAcquisitionPlan
} from './core.js';

// --- Firebase Imports ---
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";


// --- DOM ELEMENT REFERENCES ---
const DOM = {
    eventTimer: document.getElementById('event-timer'),
    bestGemDealCard: document.getElementById('best-gem-deal-card'),
    bestFiatDealCard: document.getElementById('best-fiat-deal-card'),
    gemStoreContainer: document.getElementById('gem-store-container'),
    currencyStoreSection: document.getElementById('currency-store-section'),
    currencyStoreContainer: document.getElementById('currency-store-container'),
    interstellarVisitorSection: document.getElementById('interstellar-visitor-section'),
    interstellarVisitorContainer: document.getElementById('interstellar-visitor-container'),
    strategyTabs: document.querySelectorAll('.tab-btn'),
    // Anvil Planner
    anvilTargetInput: document.getElementById('anvil-target-input'),
    anvilTimeframeDate: document.getElementById('anvil-timeframe-date'),
    calculateAnvilPlanBtn: document.getElementById('calculate-anvil-plan-btn'),
    anvilPlanResultContainer: document.getElementById('anvil-plan-result-container'),
    // Strategy cards
    strategyViewContainer: document.getElementById('strategy-view-container'),
    f2pCard: document.getElementById('f2p-card'),
    casualCard: document.getElementById('casual-card'),
    effectiveCard: document.getElementById('effective-card'),
};

// --- App State ---
let db;
let analytics;
let gemStoreData = [];
let currencyStoreData = [];
let interstellarVisitorData = [];
let currentStrategy = 'f2p';
const ANVIL_TO_GEM_VALUE = 60;
const BASE_GEMS_PER_DOLLAR = 100;


// --- RENDER FUNCTIONS ---

function createScalingBundleCard(bundle) {
    const tiersHtml = bundle.tiers.map(tier => {
        const valuePerDollar = parseFloat(tier.analysis.valuePerDollar);
        const percentageValue = (valuePerDollar / BASE_GEMS_PER_DOLLAR) * 100;
        
        const valueDisplay = valuePerDollar > 0 
            ? `<span class="font-semibold text-amber-400" title="${valuePerDollar.toFixed(2)} Eq. Gems per dollar">${percentageValue.toFixed(0)}% Value</span>`
            : `<span class="text-slate-500">-</span>`;
        
        return `
        <li class="flex justify-between items-center py-2 border-b border-slate-700 last:border-b-0 p-2 rounded">
            <span class="text-slate-300">Tier ${tier.tier} ($${tier.cost})</span>
            <div>
                ${valueDisplay}
            </div>
        </li>
    `}).join('');

    return `
        <div class="p-4 bg-slate-900 rounded-lg border border-slate-700">
            <h4 class="font-bold text-lg text-slate-100 mb-2">${bundle.bundleName}</h4>
            <ul class="text-sm">${tiersHtml}</ul>
        </div>
    `;
}

function createGemStoreCard(item) {
    const highlightClass = item.analysis.gemCostPerAnvil !== 'N/A' && item.analysis.gemCostPerAnvil < ANVIL_TO_GEM_VALUE ? 'ring-2 ring-green-400' : '';
    return `
        <div class="p-4 bg-slate-700/50 rounded-lg border border-slate-600 ${highlightClass}">
            <h4 class="font-bold text-slate-100">${item.itemName}</h4>
            <p class="text-sm text-indigo-300">${item.gemCost} Gems</p>
            <p class="text-xs text-slate-400 mt-2">Cost per Anvil: <span class="font-semibold text-amber-400">${item.analysis.gemCostPerAnvil}</span> Gems</p>
        </div>
    `;
}

function createSubscriptionCard(pass) {
    const analysis = analyzeSubscription(pass, 1.0); 
    const percentageValue = (parseFloat(analysis.analysis.gemsPerDollar) / BASE_GEMS_PER_DOLLAR) * 100;

    return `
        <div class="p-4 bg-slate-900 rounded-lg border border-slate-700">
            <h4 class="font-bold text-lg text-slate-100">${analysis.bundleName}</h4>
            <p class="text-sm text-slate-300">$${analysis.cost} for ${analysis.durationDays} days</p>
            <p class="text-sm text-slate-400 mt-2">Value (at 100% login): <span class="font-semibold text-green-400">${percentageValue.toFixed(0)}%</span></p>
        </div>
    `;
}

function renderMessage(container, message) {
    container.innerHTML = `<p class="text-center text-slate-400">${message}</p>`;
}


// --- ANVIL PLANNER & HIGHLIGHTS ---

function displayBestAnvilDeals() {
    const allGemItems = [...gemStoreData, ...interstellarVisitorData];
    const analyzedFiatBundles = currencyStoreData
        .map(bundle => analyzeScalingBundle(bundle, ANVIL_TO_GEM_VALUE));
        
    const { bestGemDeal, bestFiatDeal } = findBestAnvilDeals(allGemItems, analyzedFiatBundles);
    
    if (bestGemDeal) {
        DOM.bestGemDealCard.innerHTML = `
            <h3 class="font-semibold text-indigo-300 text-lg">Best Gem Source</h3>
            <p class="text-slate-200 text-xl font-bold">${bestGemDeal.itemName}</p>
            <p class="text-slate-400">at <strong class="text-amber-400">${bestGemDeal.analysis.gemCostPerAnvil}</strong> Gems per Anvil</p>
        `;
    } else {
        DOM.bestGemDealCard.innerHTML = `
            <h3 class="font-semibold text-indigo-300 text-lg">Best Gem Source</h3>
            <p class="text-slate-400">No Anvil deals available for Gems right now.</p>
        `;
    }

    if (bestFiatDeal) {
        const percentageValue = (parseFloat(bestFiatDeal.valuePerDollar) / BASE_GEMS_PER_DOLLAR) * 100;
        DOM.bestFiatDealCard.innerHTML = `
            <h3 class="font-semibold text-green-300 text-lg">Best Fiat Source</h3>
            <p class="text-slate-200 text-xl font-bold">${bestFiatDeal.name}</p>
            <p class="text-slate-400">at <strong class="text-amber-400">${bestFiatDeal.anvilsPerDollar}</strong> Anvils/$ (${percentageValue.toFixed(0)}% Value)</p>
        `;
    } else {
        DOM.bestFiatDealCard.innerHTML = `
             <h3 class="font-semibold text-green-300 text-lg">Best Fiat Source</h3>
            <p class="text-slate-400">No Anvil deals available for purchase this week.</p>
        `;
    }
}

/**
 * Updates all strategy cards with the daily gem requirement from a plan.
 * @param {number} dailyGemsNeeded - The average daily gems required.
 * @param {number} totalGemCost - The total gem cost of the plan.
 */
function updateAllStrategyCardsWithGemReq(dailyGemsNeeded, totalGemCost) {
    const cards = [DOM.f2pCard, DOM.casualCard, DOM.effectiveCard];
    
    // Clear any previous requirement text
    cards.forEach(card => card.querySelector('.daily-gem-req')?.remove());

    if (!dailyGemsNeeded || dailyGemsNeeded <= 0) return;

    // Create and append the new text to each card
    const f2pText = `To afford the Gem purchases in this plan, you'll need to earn an average of <strong class="text-green-400">${dailyGemsNeeded.toLocaleString()} Gems</strong> per day.`;
    const spenderText = `The Gem-based part of this plan costs <strong class="text-indigo-300">${totalGemCost.toLocaleString()} Gems</strong>. To earn this requires an average of <strong class="text-green-400">${dailyGemsNeeded.toLocaleString()} Gems</strong> per day.`;

    const f2pP = document.createElement('p');
    f2pP.className = 'text-lg mt-4 daily-gem-req';
    f2pP.innerHTML = f2pText;
    DOM.f2pCard.appendChild(f2pP);

    const casualP = document.createElement('p');
    casualP.className = 'text-lg mt-4 daily-gem-req';
    casualP.innerHTML = spenderText;
    DOM.casualCard.appendChild(casualP);

    const effectiveP = document.createElement('p');
    effectiveP.className = 'text-lg mt-4 daily-gem-req';
    effectiveP.innerHTML = spenderText;
    DOM.effectiveCard.appendChild(effectiveP);
}


function handleAnvilPlanCalculation() {
    const target = parseInt(DOM.anvilTargetInput.value, 10);
    const timeframe = DOM.anvilTimeframeDate.value;

    if (!target || target <= 0) {
        DOM.anvilPlanResultContainer.innerHTML = `<p class="text-red-400">Please enter a valid number of Anvils.</p>`;
        return;
    }
    if (!timeframe) {
        DOM.anvilPlanResultContainer.innerHTML = `<p class="text-red-400">Please select a target date.</p>`;
        return;
    }
    
    if (analytics) {
        logEvent(analytics, 'calculate_anvil_plan', {
            target_anvils: target,
            target_date: timeframe
        });
    }

    const targetDate = new Date(timeframe + 'T00:00:00Z');
    
    const gemStoreMasterList = gemStoreData; 
    const interstellarMasterList = interstellarVisitorData;

    const { plan, totalGemCost, totalFiatCost, anvilsStillNeeded } = createAnvilAcquisitionPlan(target, gemStoreMasterList, currencyStoreData, interstellarMasterList, targetDate);

    if (plan.length === 0) {
        DOM.anvilPlanResultContainer.innerHTML = `<p class="text-amber-400">No sources of Anvils are currently available.</p>`;
        return;
    }
    
    let planHtml = plan.map(step => {
        if (step.startsWith('**') && step.endsWith(':**')) {
             return `<h5 class="font-bold text-indigo-300 mt-3 mb-1">${step.replace(/\*\*/g, '')}</h5>`;
        }
        return `<li class="ml-4">${step.replace(/\*\*(.*?)\*\*/g, '<strong class="text-amber-400">$1</strong>')}</li>`;
    }).join('');
    
    planHtml += `<div class="mt-4 pt-3 border-t border-slate-700">
        <h5 class="font-bold text-green-300">Total Estimated Cost:</h5>
        <ul class="list-disc list-inside ml-2">
            ${totalGemCost > 0 ? `<li>${totalGemCost.toLocaleString()} Gems</li>` : ''}
            ${totalFiatCost > 0 ? `<li>$${totalFiatCost.toFixed(2)}</li>` : ''}
        </ul>
    </div>`;

    DOM.anvilPlanResultContainer.innerHTML = `<ul class="list-none space-y-1">${planHtml}</ul>`;

    // Update strategy cards with daily gem requirement
    const daysUntilTarget = (targetDate - new Date()) / (1000 * 60 * 60 * 24);
    if (totalGemCost > 0 && daysUntilTarget > 0) {
        const dailyGemsNeeded = Math.ceil(totalGemCost / daysUntilTarget);
        updateAllStrategyCardsWithGemReq(dailyGemsNeeded, totalGemCost);
    } else {
        updateAllStrategyCardsWithGemReq(0, 0); // Clear the text if no gem cost
    }
}

function updateStrategyCardContent(deals = []) {
    const allGemDeals = [...gemStoreData, ...interstellarVisitorData];
    const bestGemDealForAnvils = findBestAnvilDeals(allGemDeals, []).bestGemDeal;

    if (bestGemDealForAnvils) {
        DOM.f2pCard.querySelector('p:first-child').innerHTML = `The most efficient way to spend your Gems on Anvils right now is the <strong class="text-amber-400">${bestGemDealForAnvils.itemName}</strong>, costing <strong class="text-green-400">${bestGemDealForAnvils.analysis.gemCostPerAnvil} Gems</strong> per Anvil.`;
    } else {
        DOM.f2pCard.querySelector('p:first-child').innerHTML = `Focusing on maximizing free resources. There are no Anvil deals in the Gem stores currently.`;
    }
    
    const bestCasualDeal = deals.find(deal => {
        if (deal.bundleType === 'subscription' && deal.cost < 20) return true;
        if (deal.bundleType === 'scaling') return deal.tiers.some(tier => tier.cost < 20);
        return false;
    });

    if (bestCasualDeal) {
        DOM.casualCard.querySelector('p:first-child').innerHTML = `<p class="text-lg">For casual spending, the <strong class="text-amber-400">${bestCasualDeal.bundleName}</strong> offers great value in its lower, cheaper tiers. Check its breakdown in the Currency Store.</p>`;
    } else {
        DOM.casualCard.querySelector('p:first-child').innerHTML = `<p class="text-lg">Looking for high-value deals under $20. There are no recommended deals in this price range this week.</p>`;
    }

    const bestOverallDeal = deals[0];
    if (bestOverallDeal) {
        const bestValue = bestOverallDeal.tiers ? Math.max(...bestOverallDeal.tiers.map(t => parseFloat(t.analysis.valuePerDollar))) : parseFloat(bestOverallDeal.analysis.gemsPerDollar);
        const bestPercentage = (bestValue / BASE_GEMS_PER_DOLLAR) * 100;
        DOM.effectiveCard.querySelector('p:first-child').innerHTML = `
            <p class="text-lg">The most cost-effective deal this week is the <strong class="text-amber-400">${bestOverallDeal.bundleName}</strong>, offering a top value of <strong class="text-green-400">${bestPercentage.toFixed(0)}%</strong>.</p>
        `;
    } else {
        DOM.effectiveCard.querySelector('p:first-child').innerHTML = `<p class="text-lg">Seeking the most mathematically optimal deals. There are currently no currency deals to analyze.</p>`;
    }
}


function handleStrategyChange(strategy) {
    if (currentStrategy === strategy) return;
    currentStrategy = strategy;
    
    if(analytics) {
        logEvent(analytics, 'select_content', {
            content_type: 'spending_strategy',
            item_id: strategy
        });
    }

    DOM.strategyTabs.forEach(t => t.classList.toggle('active', t.dataset.strategy === strategy));
    DOM.strategyViewContainer.querySelectorAll('.strategy-card').forEach(card => card.classList.toggle('active', card.id === `${strategy}-card`));
    renderFilteredStores();
}

// --- DATA FETCHING & DISPLAY LOGIC ---

function renderFilteredStores() {
    let analyzedCurrencyData = currencyStoreData.map(bundle => {
        if (bundle.bundleType === 'scaling') return analyzeScalingBundle(bundle, ANVIL_TO_GEM_VALUE);
        if (bundle.bundleType === 'subscription') return analyzeSubscription(bundle, 1.0);
        return null;
    }).filter(Boolean);
    
    const sortedForEffective = [...analyzedCurrencyData].sort((a, b) => {
        const valA = a.tiers ? Math.max(...a.tiers.map(t => t.analysis.valuePerDollar)) : a.analysis.gemsPerDollar;
        const valB = b.tiers ? Math.max(...b.tiers.map(t => t.analysis.valuePerDollar)) : b.analysis.gemsPerDollar;
        return valB - valA;
    });
    updateStrategyCardContent(sortedForEffective);


    if (gemStoreData.length === 0) renderMessage(DOM.gemStoreContainer, "No items in rotation.");
    else DOM.gemStoreContainer.innerHTML = gemStoreData.map(item => createGemStoreCard(analyzeGemStoreItem(item))).join('');

    if (interstellarVisitorData.length === 0) renderMessage(DOM.interstellarVisitorContainer, "No items available.");
    else DOM.interstellarVisitorContainer.innerHTML = interstellarVisitorData.map(item => createGemStoreCard(analyzeGemStoreItem(item))).join('');

    if (currentStrategy === 'f2p') {
        DOM.currencyStoreSection.classList.add('hidden');
    } else {
        DOM.currencyStoreSection.classList.remove('hidden');
        
        let dealsToRender = (currentStrategy === 'effective') ? sortedForEffective : analyzedCurrencyData;

        if (dealsToRender.length === 0) {
            renderMessage(DOM.currencyStoreContainer, "No deals available.");
        } else {
            DOM.currencyStoreContainer.innerHTML = dealsToRender.map(bundle => {
                if (bundle.bundleType === 'scaling') return createScalingBundleCard(bundle);
                if (bundle.bundleType === 'subscription') return createSubscriptionCard(bundle);
                return '';
            }).join('');
        }
    }
}

async function fetchAllStoresAndRender() {
    if (!db || !analytics) return; 
    
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'dc-dark-legion-builder';

    try {
        const gemStoreRef = collection(db, `artifacts/${appId}/public/data/gemStoreRotation`);
        gemStoreData = (await getDocs(gemStoreRef)).docs.map(doc => doc.data());

        const currencyStoreRef = collection(db, `artifacts/${appId}/public/data/currencyStore`);
        const currencyQuery = query(currencyStoreRef, where("isFeatured", "==", true));
        currencyStoreData = (await getDocs(currencyQuery)).docs.map(doc => doc.data());
        
        const interstellarVisitorRef = collection(db, `artifacts/${appId}/public/data/interstellarVisitor`);
        interstellarVisitorData = (await getDocs(interstellarVisitorRef)).docs.map(doc => doc.data());
        
        renderFilteredStores();
        displayBestAnvilDeals(); 

    } catch (error) {
        console.error("Error fetching store data:", error);
        logEvent(analytics, 'exception', { description: "Error fetching store data", fatal: false });
        renderMessage(DOM.gemStoreContainer, "Error loading store data.");
    }
}


function updateTimers() { 
    const timers = getStoreTimers();
    const visitorMsg = `${timers.interstellarVisitor.statusMessage} ${timers.interstellarVisitor.countdown}`;
    const gemMsg = `Gem Store resets in: ${timers.gemStore.countdown}`;
    DOM.eventTimer.textContent = `${visitorMsg}  |  ${gemMsg}`;

    if (timers.interstellarVisitor.isActive) {
        DOM.interstellarVisitorSection.classList.remove('hidden');
    } else {
        DOM.interstellarVisitorSection.classList.add('hidden');
    }
}


// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const nextWeek = new Date(today.setDate(today.getDate() + 7));
    DOM.anvilTimeframeDate.value = nextWeek.toISOString().split('T')[0];

    updateTimers();
    setInterval(updateTimers, 1000);

    // Event listeners
    DOM.strategyTabs.forEach(tab => tab.addEventListener('click', () => handleStrategyChange(tab.dataset.strategy)));
    DOM.calculateAnvilPlanBtn.addEventListener('click', handleAnvilPlanCalculation);

    document.addEventListener('firebase-ready', async () => {
        try {
            const app = getApp();
            db = getFirestore(app);
            analytics = getAnalytics(app);
            
            logEvent(analytics, 'page_view', {
                page_title: document.title,
                page_location: location.href
            });

            await fetchAllStoresAndRender();
        } catch (e) {
            console.error("Firebase could not be initialized in stores-ui:", e);
        }
    }, { once: true });
});
