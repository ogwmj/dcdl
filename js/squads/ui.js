/**
 * @file js/squads/ui.js
 * @description Handles all UI interactions, rendering, and analytics for the dynamic squads page by fetching data from Firestore.
 */

// --- MODULES & GLOBALS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

// --- CONFIG & SETUP ---
const SQUADS_PER_PAGE = 6;
const CACHE_KEY = 'squads_data_cache';
const CACHE_DURATION_MS = 60 * 60 * 1000 * 24;
let ALL_DATA = {};
let db, analytics;

const listContainer = document.getElementById('squad-list-container');
const detailContainer = document.getElementById('squad-detail-container');

// --- FIREBASE INITIALIZATION ---
// This section runs immediately when the script is loaded.
try {
    const firebaseConfig = {
        apiKey: "AIzaSyAzSQbS4LtAz20syWI2HREPR7UnYh6ldbI",
        authDomain: "dc-dark-legion-tools.firebaseapp.com",
        projectId: "dc-dark-legion-tools",
        storageBucket: "dc-dark-legion-tools.appspot.com",
        messagingSenderId: "786517074225",
        appId: "1:786517074225:web:9f14dc4dcae0705fcfd010",
        measurementId: "G-FTF00DHGV6"
    };
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    analytics = getAnalytics(app);
    // Dispatch event for other components that might need it (like auth-ui)
    document.dispatchEvent(new CustomEvent('firebase-ready', { detail: { app } }));
} catch (e) {
    console.error("Firebase initialization failed in ui.js:", e);
    if (listContainer) {
        listContainer.innerHTML = `<p class="text-center text-red-400">Critical error: Could not initialize application services.</p>`;
    }
}

// --- DATA HANDLING ---

/**
 * Fetches a single collection from Firestore and returns its documents as an array of objects.
 * @param {string} collectionName - The name of the collection to fetch.
 * @returns {Promise<Array<Object>>} - A promise that resolves to an array of document data.
 */
async function fetchCollection(collectionName) {
    const collectionPath = `artifacts/dc-dark-legion-builder/public/data/${collectionName}`;
    const querySnapshot = await getDocs(collection(db, collectionPath));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Fetches all necessary data from Firestore, using a localStorage cache to avoid frequent reads.
 * The cache is set to expire after 1 hour.
 */
async function loadAllDataFromFirestore() {
    // 1. Check for cached data in localStorage
    const cachedItem = localStorage.getItem(CACHE_KEY);
    if (cachedItem) {
        try {
            const cachedData = JSON.parse(cachedItem);
            const cacheTimestamp = cachedData.timestamp || 0;
            const isCacheValid = (Date.now() - cacheTimestamp) < CACHE_DURATION_MS;

            if (isCacheValid && cachedData.data) {
                console.log("Loading data from cache.");
                ALL_DATA = cachedData.data;
                return; // Exit if cache is valid
            }
        } catch (e) {
            console.error("Failed to parse cache, fetching fresh data.", e);
        }
    }

    // 2. If cache is invalid or doesn't exist, fetch from Firestore
    console.log("Cache invalid or not found. Fetching data from Firestore.");
    try {
        const [squads, champions, synergies, effects] = await Promise.all([
            fetchCollection('squads'),
            fetchCollection('champions'),
            fetchCollection('synergies'),
            fetchCollection('effects')
        ]);
        
        ALL_DATA = { squads, champions, synergies, effects };

        // 3. Store the newly fetched data and a timestamp in localStorage
        const cachePayload = {
            timestamp: Date.now(),
            data: ALL_DATA
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cachePayload));

    } catch (error) {
        console.error("Failed to load data from Firestore:", error);
        if (listContainer) {
            listContainer.innerHTML = `<p class="text-center text-red-400">Failed to load core data from Firestore. Please try again later.</p>`;
        }
    }
}


// --- SEO HANDLING ---

/**
 * Updates the page's SEO meta tags for a specific squad.
 * @param {object} squad - The squad object containing details.
 */
function updateSeoTags(squad) {
    const title = `DC: Dark Legion - ${squad.name} Squad Guide`;
    const description = squad.shortDescription;
    const url = `https://dcdl-companion.com/squads.html?id=${squad.id}`;

    document.title = title;
    
    // Helper to update a meta tag's content
    const updateMeta = (selector, content) => {
        const el = document.querySelector(selector);
        if (el) el.setAttribute('content', content);
    };

    updateMeta('meta[name="description"]', description);
    updateMeta('meta[property="og:title"]', title);
    updateMeta('meta[property="og:description"]', description);
    updateMeta('meta[property="og:url"]', url);
    updateMeta('meta[name="twitter:title"]', title);
    updateMeta('meta[name="twitter:description"]', description);

    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) canonicalLink.setAttribute('href', url);
}

/**
 * Resets SEO meta tags to their default values for the list view.
 */
function resetSeoTags() {
    const title = 'DC: Dark Legion - Squads';
    const description = 'An in-depth guide to DC: Dark Legion team compositions. Explore top-tier squads, strategies, synergies, and skill breakdowns.';
    const url = 'https://dcdl-companion.com/squads.html';

    document.title = title;

    const updateMeta = (selector, content) => {
        const el = document.querySelector(selector);
        if (el) el.setAttribute('content', content);
    };

    updateMeta('meta[name="description"]', description);
    updateMeta('meta[property="og:title"]', title);
    updateMeta('meta[property="og:description"]', description);
    updateMeta('meta[property="og:url"]', url);
    updateMeta('meta[name="twitter:title"]', title);
    updateMeta('meta[name="twitter:description"]', description);

    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) canonicalLink.setAttribute('href', url);
}


// --- UI RENDERING ---

/**
 * Renders the list of all squads with pagination.
 * @param {number} page - The current page number to display.
 */
function renderListView(page = 1) {
    if (!listContainer || !detailContainer) return;
    detailContainer.style.display = 'none';
    listContainer.style.display = 'block';
    resetSeoTags(); // Reset SEO for the list view

    const squads = ALL_DATA.squads;
    if (!squads || squads.length === 0) {
        listContainer.innerHTML = `<p class="text-center text-yellow-400">No squads found.</p>`;
        return;
    }

    const totalPages = Math.ceil(squads.length / SQUADS_PER_PAGE);
    const startIndex = (page - 1) * SQUADS_PER_PAGE;
    const pagedSquads = squads.slice(startIndex, startIndex + SQUADS_PER_PAGE);

    const cardsHtml = pagedSquads.map(squad => {
        const memberPortraits = squad.members.map(member => {
            const champion = ALL_DATA.champions.find(c => c.id === member.dbChampionId);
            const imageUrl = champion?.cardImageUrl || '/img/champions/cards/default.png';
            return `<img src="${imageUrl}" alt="${member.name}" title="${member.name}" class="member-portrait" onerror="this.onerror=null;this.src='/img/champions/cards/default.png';">`;
        }).join('');

        const synergyBadges = squad.activeSynergies.map(synergy => {
            const imageName = synergy.name.replace(/\s+/g, '_') + '.png';
            const imageUrl = `/img/factions/${imageName}`;
            return `
                <div class="flex items-center gap-2 bg-slate-800 rounded-full pr-3 py-1">
                    <img src="${imageUrl}" alt="${synergy.name}" title="${synergy.name}" class="w-6 h-6 object-contain" onerror="this.onerror=null;this.src='/img/factions/default.png';">
                    <span class="text-xs font-semibold text-gray-300">${synergy.name}</span>
                </div>
            `;
        }).join('');

        return `
            <a href="?id=${squad.id}" class="squad-list-card">
                <div>
                    <div class="squad-card-header">
                        <h3>${squad.name}</h3>
                        <p>${squad.shortDescription}</p>
                    </div>
                    <div class="squad-card-members">${memberPortraits}</div>
                </div>
                <div class="squad-card-synergies mt-auto pt-4">${synergyBadges}</div>
            </a>
        `;
    }).join('');

    const paginationHtml = `
        <div class="pagination-controls">
            <a href="?page=${page - 1}" id="prev-page" class="pagination-btn ${page === 1 ? 'disabled' : ''}">Previous</a>
            <span class="page-indicator">Page ${page} of ${totalPages}</span>
            <a href="?page=${page + 1}" id="next-page" class="pagination-btn ${page >= totalPages ? 'disabled' : ''}">Next</a>
        </div>`;

    listContainer.innerHTML = `
        <header class="py-8 md:py-12 text-center">
            <h1 class="text-5xl md:text-7xl font-extrabold mb-4 glowing-text text-white">Ultimate Squads Guide</h1>
            <p class="text-xl md:text-2xl text-blue-200">Your guide to squad builds and strategies.</p>
        </header>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">${cardsHtml}</div>
        ${paginationHtml}
    `;
    
    document.querySelectorAll('.pagination-btn, .squad-list-card').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (btn.classList.contains('disabled')) {
                e.preventDefault();
                return;
            }
            e.preventDefault();
            const url = new URL(e.currentTarget.href);
            history.pushState({}, '', url.search);
            main();
        });
    });
}

/**
 * Renders the detailed view for a single squad.
 * @param {string} squadId - The ID of the squad to display.
 */
function renderDetailView(squadId) {
    if (!listContainer || !detailContainer) return;
    listContainer.style.display = 'none';
    detailContainer.style.display = 'block';

    const squad = ALL_DATA.squads.find(s => s.id === squadId);
    if (!squad) {
        detailContainer.innerHTML = `<div class="text-center py-20"><h2 class="text-3xl text-white">Squad Not Found</h2><a href="/squads.html" class="mt-4 inline-block pagination-btn">Back to List</a></div>`;
        return;
    }
    
    updateSeoTags(squad); // Update SEO for the detail view

    const lineupHtml = squad.members.map(member => {
        const champion = ALL_DATA.champions.find(c => c.id === member.dbChampionId);
        const imageUrl = champion?.cardImageUrl || '/img/champions/cards/default.png';
        const legacyPieceName = member.legacyPiece?.name;
        
        const legacyPieceHtml = (legacyPieceName && legacyPieceName !== 'None')
            ? `<p class="text-purple-400 text-xs font-semibold mt-2 flex items-center justify-center gap-2"><i class="fas fa-gem"></i>${legacyPieceName}</p>`
            : '';

        return `
            <div class="champion-card-enhanced is-small">
                <div class="card-image-container"><img src="${imageUrl}" class="card-avatar-top" onerror="this.onerror=null;this.src='/img/champions/cards/default.png';"></div>
                <div class="card-content-bottom">
                    <h4 class="champion-name">${member.name}</h4>
                    <p class="champion-class">${member.class}</p>
                    ${legacyPieceHtml}
                </div>
            </div>`;
    }).join('');

    const synergyTiersHtml = squad.activeSynergies.map(activeSynergy => {
        const synergyData = ALL_DATA.synergies.find(s => s.name === activeSynergy.name);
        if (!synergyData) return '';
        const tier = synergyData.tiers.find(t => t.countRequired === activeSynergy.appliedAtMemberCount);
        const imageName = activeSynergy.name.replace(/\s+/g, '_') + '.png';
        const imageUrl = `/img/factions/${imageName}`;
        
        return `
            <li class="flex items-start gap-3">
                <img src="${imageUrl}" alt="${activeSynergy.name}" class="w-8 h-8 object-contain flex-shrink-0" onerror="this.onerror=null;this.src='/img/factions/default.png';">
                <div>
                    <span class="font-bold text-white">${activeSynergy.name} (${activeSynergy.appliedAtMemberCount} members)</span>
                    <p class="text-gray-400 text-sm">${tier ? tier.tierDescription : 'Bonus details not found.'}</p>
                </div>
            </li>
        `;
    }).join('');
    
    const rolesHtml = squad.members.map(member => {
        const champion = ALL_DATA.champions.find(c => c.id === member.dbChampionId);
        if (!champion) return `<p>Details for ${member.name} not found.</p>`;
        
        const skillTabs = champion.skills.map((skill, index) => 
            `<button class="skill-tab-btn ${index === 0 ? 'active' : ''}" data-skill="${champion.id}-skill-${index}">${skill.name}</button>`
        ).join('');

        const skillContents = champion.skills.map((skill, index) => {
            const highlightedDesc = skill.description.replace(/\[(.*?)\]/g, (match, p1) => {
                const effect = ALL_DATA.effects.find(e => e.name.toLowerCase() === p1.toLowerCase());
                return effect ? `<strong class="text-amber-400" title="${effect.description}">${match}</strong>` : match;
            });
            return `<div class="skill-tab-content ${index === 0 ? 'active' : ''}" id="${champion.id}-skill-${index}">${highlightedDesc}</div>`
        }).join('');

        return `
            <div class="champion-role-card" data-champion-name="${champion.name}">
                <h3 class="champion-role-title"><span>${champion.class}:</span> ${champion.name}</h3>
                <div class="skill-tabs-container mt-4">
                    <div class="skill-tabs">${skillTabs}</div>
                    <div class="skill-content">${skillContents}</div>
                </div>
            </div>`;
    }).join('');

    detailContainer.innerHTML = `
        <header class="py-8 md:py-12 text-center">
            <h1 class="text-5xl md:text-7xl font-extrabold mb-4 glowing-text text-white">${squad.name}</h1>
            <p class="text-xl md:text-2xl text-blue-200">${squad.shortDescription}</p>
        </header>
        <section class="mb-12">
            <h2 class="guide-section-title">The Lineup</h2>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">${lineupHtml}</div>
        </section>
        <section class="guide-section">
            <h2 class="guide-section-title">Strategy & Synergies</h2>
            <div class="guide-text">${squad.longDescription}</div>
            <div class="synergy-breakdown-card">
                <div class="synergy-content">
                    <ul class="synergy-list space-y-4">${synergyTiersHtml}</ul>
                </div>
            </div>
        </section>
        <section class="guide-section">
            <h2 class="guide-section-title mt-8">Role & Skill Analysis</h2>
            <div class="space-y-8">${rolesHtml}</div>
        </section>
        <div class="text-center py-20"><a href="/squads.html" class="mt-4 inline-block pagination-btn">Back to List</a></div>
    `;
    
    setupSkillTabs();
}

// --- UI INTERACTIONS ---

function setupSkillTabs() {
    const skillContainers = document.querySelectorAll('.champion-role-card');
    skillContainers.forEach(container => {
        const championName = container.dataset.championName;
        const tabs = container.querySelectorAll('.skill-tab-btn');
        const contents = container.querySelectorAll('.skill-tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const contentToShow = container.querySelector(`#${tab.dataset.skill}`);
                if (contentToShow) contentToShow.classList.add('active');

                if (analytics) {
                    logEvent(analytics, 'select_skill_tab', {
                        squad_name: document.querySelector('h1.glowing-text').innerText,
                        champion_name: championName,
                        skill_name: tab.innerText.trim()
                    });
                }
            });
        });
    });
}

// --- INITIALIZATION & ROUTING ---

async function main() {
    if (!db) {
        console.error("Firestore DB not available. Aborting main execution.");
        return;
    }
    
    await loadAllDataFromFirestore();
    
    const urlParams = new URLSearchParams(window.location.search);
    const squadId = urlParams.get('id');
    const page = parseInt(urlParams.get('page')) || 1;

    if (squadId) {
        renderDetailView(squadId);
    } else {
        renderListView(page);
    }

    if (analytics) {
        logEvent(analytics, 'page_view', {
            page_title: document.title,
            page_location: location.href,
            squad_id: squadId || `list_view_page_${page}`
        });
    }
}

// Listen for browser back/forward navigation
window.addEventListener('popstate', main);

// Initial load, waits for DOM to be ready.
document.addEventListener('DOMContentLoaded', main);
