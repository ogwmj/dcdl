/**
 * @file js/squads/ui.js
 * @description Handles all UI interactions, rendering, and analytics for the dynamic squads page by fetching data from Firestore.
 */

// --- MODULES & GLOBALS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, runTransaction, getDoc, addDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- CONFIG & SETUP ---
const SQUADS_PER_PAGE = 6;
const CACHE_KEY = 'squads_data_cache';
const CACHE_KEY_HOURS = 24;
const CACHE_DURATION_MS = CACHE_KEY_HOURS * 60 * 60 * 1000;
let ALL_DATA = {};
let db, analytics, auth, currentUser, userRoles = [];
let isEditMode = false;
let currentEditingSquadId = null;

const listContainer = document.getElementById('squad-list-container');
const detailContainer = document.getElementById('squad-detail-container');
const adminControlsContainer = document.getElementById('admin-controls-container');
const createSquadModal = document.getElementById('create-squad-modal');

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
    auth = getAuth(app);
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
    const CACHE_KEY = 'squads_data_cache';
    const CACHE_DURATION_MS = 60 * 60 * 1000 * 24;
    
    const cachedItem = localStorage.getItem(CACHE_KEY);
    if (cachedItem) {
        try {
            const cachedData = JSON.parse(cachedItem);
            const isCacheValid = (Date.now() - (cachedData.timestamp || 0)) < CACHE_DURATION_MS;
            if (isCacheValid && cachedData.data && cachedData.data.legacyPieces) {
                ALL_DATA = cachedData.data;
                return;
            }
        } catch (e) { console.error("Failed to parse cache, fetching fresh data.", e); }
    }
    
    console.log("Cache invalid or not found. Fetching data from Firestore.");
    try {
        const [squads, champions, synergies, effects, legacyPieces] = await Promise.all([
            fetchCollection('squads'),
            fetchCollection('champions'),
            fetchCollection('synergies'),
            fetchCollection('effects'),
            fetchCollection('legacyPieces')
        ]);
        
        ALL_DATA = { squads, champions, synergies, effects, legacyPieces };

        const cachePayload = {
            timestamp: Date.now(),
            data: ALL_DATA
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cachePayload));

    } catch (error) {
        console.error("Failed to load data from Firestore:", error);
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

function generateCreatorProfileHtml(creatorData) {
    const profile = creatorData.creatorProfile || {};
    const socials = profile.socials || {};

    const socialLinks = [
        { key: 'discord', icon: 'fab fa-discord', url: socials.discord },
        { key: 'youtube', icon: 'fab fa-youtube', url: socials.youtube },
        { key: 'twitch', icon: 'fab fa-twitch', url: socials.twitch },
        { key: 'x', icon: 'fab fa-twitter', url: socials.x },
        { key: 'tiktok', icon: 'fab fa-tiktok', url: socials.tiktok },
        { key: 'instagram', icon: 'fab fa-instagram', url: socials.instagram }
    ];

    const socialsHtml = socialLinks
        .filter(link => link.url) // Only include socials that have a URL
        .map(link => `<a href="${link.url}" target="_blank" rel="noopener noreferrer" title="${link.key.charAt(0).toUpperCase() + link.key.slice(1)}"><i class="${link.icon}"></i></a>`)
        .join('');

    return `
        <section class="guide-section mt-8">
            <h2 class="guide-section-title">Squad Creator</h2>
            <div class="creator-card">
                <div class="creator-header">
                    <img src="${profile.logo || '/img/dcdl_logo.png'}" alt="Creator Logo" class="creator-logo" onerror="this.onerror=null;this.src='/img/dcdl_logo.png';">
                    <span class="creator-username">${creatorData.username || 'Anonymous'}</span>
                </div>
                ${profile.description ? `<p class="creator-description">"${profile.description}"</p>` : ''}
                ${socialsHtml ? `<div class="creator-socials">${socialsHtml}</div>` : ''}
            </div>
        </section>
    `;
}

/**
 * Renders the list of all squads with pagination.
 * @param {number} page - The current page number to display.
 */
function renderListView(page = 1) {
    if (!listContainer || !detailContainer) return;
    detailContainer.style.display = 'none';
    listContainer.style.display = 'block';
    resetSeoTags();

    const squads = ALL_DATA.squads || [];
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

        const ratingsHtml = `
            <div class="squad-card-ratings">
                <span class="rating-display" title="${squad.thumbsUp || 0} up-votes">
                    <i class="fas fa-thumbs-up text-green-400"></i>
                    <span>${squad.thumbsUp || 0}</span>
                </span>
                <span class="rating-display" title="${squad.thumbsDown || 0} down-votes">
                    <i class="fas fa-thumbs-down text-red-400"></i>
                    <span>${squad.thumbsDown || 0}</span>
                </span>
            </div>
        `;

        return `
            <a href="?id=${squad.id}" class="squad-list-card">
                <div>
                    <div class="squad-card-header">
                        <h3>${squad.name}</h3>
                        <p>${squad.shortDescription}</p>
                    </div>
                    <div class="squad-card-members">${memberPortraits}</div>
                </div>
                <div class="squad-card-footer mt-auto pt-4">
                    <div class="squad-card-synergies">${synergyBadges}</div>
                    ${ratingsHtml}
                </div>
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

    adminControlsContainer.innerHTML = '';
    if (userRoles.includes('creator')) {
        const createBtn = document.createElement('button');
        createBtn.id = 'open-create-modal-btn';
        createBtn.className = 'btn-primary';
        createBtn.textContent = 'Create New Squad';
        adminControlsContainer.appendChild(createBtn);
        createBtn.addEventListener('click', openCreateModal);
    }
}

/**
 * Renders the detailed view for a single squad.
 * @param {string} squadId - The ID of the squad to display.
 */
async function renderDetailView(squadId) {
    if (!listContainer || !detailContainer) return;
    listContainer.style.display = 'none';
    detailContainer.style.display = 'block';

    const squad = ALL_DATA.squads.find(s => s.id === squadId);
    if (!squad) {
        detailContainer.innerHTML = `<div class="text-center py-20"><h2 class="text-3xl text-white">Squad Not Found</h2><a href="/squads.html" class="mt-4 inline-block pagination-btn">Back to List</a></div>`;
        return;
    }
    
    updateSeoTags(squad);

    let creatorData = null;
    if (squad.originalOwnerId) {
        try {
            const userDocRef = doc(db, `artifacts/dc-dark-legion-builder/users`, squad.originalOwnerId);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                creatorData = userDocSnap.data();
            }
        } catch (error) {
            console.error("Could not fetch creator profile:", error);
        }
    }

    let userVote = null;
    if (currentUser && !currentUser.isAnonymous) {
        const ratingDocRef = doc(db, `artifacts/dc-dark-legion-builder/public/data/squads/${squadId}/ratings`, currentUser.uid);
        const ratingDocSnap = await getDoc(ratingDocRef);
        if (ratingDocSnap.exists()) {
            userVote = ratingDocSnap.data().vote;
        }
    }
    
    const thumbsUp = squad.thumbsUp || 0;
    const thumbsDown = squad.thumbsDown || 0;
    const canVote = currentUser && !currentUser.isAnonymous;
    const ratingHtml = `
        <div id="squad-rating-widget" class="flex items-center gap-4" ${currentUser ? '' : 'title="You must be logged in to vote"'}>
            <button class="rating-btn ${userVote === 1 ? 'active' : ''}" data-vote="1" ${!currentUser ? 'disabled' : ''}>
                <i class="fas fa-thumbs-up"></i>
                <span id="thumbs-up-count">${thumbsUp}</span>
            </button>
            <button class="rating-btn ${userVote === -1 ? 'active' : ''}" data-vote="-1" ${!currentUser ? 'disabled' : ''}>
                <i class="fas fa-thumbs-down"></i>
                <span id="thumbs-down-count">${thumbsDown}</span>
            </button>
        </div>
    `;

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

    const creatorHtml = creatorData ? generateCreatorProfileHtml(creatorData) : '';

    detailContainer.innerHTML = `
        <header class="py-8 md:py-12 text-center">
            <h1 class="text-5xl md:text-7xl font-extrabold mb-4 glowing-text text-white">${squad.name}</h1>
            <p class="text-xl md:text-2xl text-blue-200">${squad.shortDescription}</p>
            <div class="flex justify-center mt-4">${ratingHtml}</div>
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
        ${creatorHtml}
        <div class="text-center py-20"><a href="/squads.html" class="mt-4 inline-block pagination-btn">Back to List</a></div>
    `;

    const header = detailContainer.querySelector('header');
    if (header && currentUser && squad.originalOwnerId === currentUser.uid) {
        const editBtn = document.createElement('button');
        editBtn.id = 'edit-squad-btn';
        editBtn.className = 'btn-primary';
        editBtn.textContent = 'Edit Squad';
        
        const ratingWidgetContainer = header.querySelector('.flex.justify-center.mt-4');
        if (ratingWidgetContainer) {
            editBtn.style.marginLeft = '1rem';
            ratingWidgetContainer.appendChild(editBtn);
        } else {
            header.appendChild(editBtn);
        }
        
        editBtn.addEventListener('click', () => openEditModal(squad));
    }

    document.getElementById('squad-rating-widget').addEventListener('click', (e) => {
        const button = e.target.closest('.rating-btn');
        if (button && !button.disabled) {
            handleSquadRating(squadId, parseInt(button.dataset.vote));
        }
    });
    
    setupSkillTabs();
}

/**
 * Handles a user's rating action for a squad using a Firestore transaction.
 * @param {string} squadId The ID of the squad being rated.
 * @param {number} newVote The new vote value (1 for up, -1 for down).
 */
async function handleSquadRating(squadId, newVote) {
    if (!currentUser || currentUser.isAnonymous) {
        document.dispatchEvent(new CustomEvent('show-toast', {
            detail: { message: 'Please log in to rate squads.', type: 'error' }
        }));
        return;
    }

    const squadDocRef = doc(db, `artifacts/dc-dark-legion-builder/public/data/squads`, squadId);
    const ratingDocRef = doc(squadDocRef, 'ratings', currentUser.uid);

    try {
        const finalVoteValue = await runTransaction(db, async (transaction) => {
            const squadDoc = await transaction.get(squadDocRef);
            const ratingDoc = await transaction.get(ratingDocRef);

            if (!squadDoc.exists()) { throw "Squad document does not exist!"; }

            const currentVote = ratingDoc.exists() ? ratingDoc.data().vote : 0;
            let squadData = squadDoc.data();
            squadData.thumbsUp = squadData.thumbsUp || 0;
            squadData.thumbsDown = squadData.thumbsDown || 0;
            
            let voteChange = 0;

            // If user clicks the same vote button again, they are toggling it off.
            if (currentVote === newVote) {
                transaction.delete(ratingDocRef);
                voteChange = 0; // The new vote will be 0 (none)
            } else {
                transaction.set(ratingDocRef, { userId: currentUser.uid, vote: newVote });
                voteChange = newVote;
            }

            // Decrement the old vote count if it exists
            if (currentVote === 1) squadData.thumbsUp -= 1;
            if (currentVote === -1) squadData.thumbsDown -= 1;

            // Increment the new vote count if it's a new vote
            if (voteChange === 1) squadData.thumbsUp += 1;
            if (voteChange === -1) squadData.thumbsDown += 1;
            
            transaction.update(squadDocRef, {
                thumbsUp: squadData.thumbsUp,
                thumbsDown: squadData.thumbsDown
            });
            
            return voteChange;
        });

        // Optimistically update the UI after successful transaction
        const finalSquad = (await getDoc(squadDocRef)).data();
        
        document.getElementById('thumbs-up-count').textContent = finalSquad.thumbsUp || 0;
        document.getElementById('thumbs-down-count').textContent = finalSquad.thumbsDown || 0;
        
        document.querySelectorAll('.rating-btn').forEach(btn => btn.classList.remove('active'));
        if (finalVoteValue !== 0) {
            document.querySelector(`.rating-btn[data-vote="${finalVoteValue}"]`).classList.add('active');
        }

        if(analytics) logEvent(analytics, 'rate_squad', { squad_name: finalSquad.name, rating: finalVoteValue });

    } catch (e) {
        console.error("Rating transaction failed: ", e);
        document.dispatchEvent(new CustomEvent('show-toast', {
            detail: { message: 'Could not save your rating. Please try again.', type: 'error' }
        }));
    }
}

// --- MODAL AND FORM HANDLING ---

/**
 * Initializes the TinyMCE WYSIWYG editor on the textarea.
 */
function initWysiwygEditor(initialContent = '') {
    tinymce.remove('textarea#squad-long-desc');
    tinymce.init({
        selector: 'textarea#squad-long-desc',
        plugins: 'lists link image media table code help wordcount',
        toolbar: 'undo redo | blocks | bold italic | alignleft aligncenter alignright | bullist numlist outdent indent | link image media | code | help',
        skin: 'oxide-dark',
        content_css: 'dark',
        height: 300,
        extended_valid_elements: 'iframe[src|title|width|height|allowfullscreen|frameborder]',
        media_live_embeds: true,
        setup: function(editor) {
            editor.on('init', function() {
                this.setContent(initialContent);
            });
        }
    });
}

function openCreateModal() {
    if (!createSquadModal) return;
    isEditMode = false;
    populateCreateFormSelectors();
    initWysiwygEditor(); 
    createSquadModal.classList.remove('hidden');
    createSquadModal.classList.add('flex');
}

function openEditModal(squad) {
    if (!createSquadModal) return;
    isEditMode = true;
    currentEditingSquadId = squad.id;

    createSquadModal.querySelector('h2').textContent = 'Edit Squad';
    createSquadModal.querySelector('#submit-create-btn').textContent = 'Update Squad';
    
    populateCreateFormSelectors();
    
    const form = document.getElementById('create-squad-form');
    form.querySelector('#squad-name').value = squad.name;
    form.querySelector('#squad-short-desc').value = squad.shortDescription;
    
    for (let i = 0; i < 5; i++) {
        const member = squad.members[i];
        if (member) {
            form.querySelector(`select[name="champion${i+1}"]`).value = member.dbChampionId;
            if (member.legacyPiece) {
                form.querySelector(`select[name="legacyPiece${i+1}"]`).value = member.legacyPiece.id;
            }
        }
    }
    
    initWysiwygEditor(squad.longDescription || '');
    
    createSquadModal.classList.remove('hidden');
    createSquadModal.classList.add('flex');
}

function closeCreateModal() {
    if (!createSquadModal) return;
    tinymce.remove('textarea#squad-long-desc');
    createSquadModal.classList.add('hidden');
    createSquadModal.classList.remove('flex');
    document.getElementById('create-squad-form').reset();
    
    isEditMode = false;
    currentEditingSquadId = null;
    createSquadModal.querySelector('h2').textContent = 'Create New Squad';
    createSquadModal.querySelector('#submit-create-btn').textContent = 'Create Squad';
}

function populateCreateFormSelectors() {
    const { champions, legacyPieces } = ALL_DATA;

    if (!champions || !Array.isArray(champions) || !legacyPieces || !Array.isArray(legacyPieces)) {
        console.error("Champion or Legacy Piece data is not loaded correctly.", ALL_DATA);
        return;
    }

    const membersContainer = document.getElementById('squad-members-container');
    membersContainer.innerHTML = ''; // Clear previous

    for (let i = 1; i <= 5; i++) {
        const memberDiv = document.createElement('div');
        memberDiv.className = 'grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-slate-700 pb-4';
        
        // Champion Selector
        let championOptions = '<option value="">-- Select Champion --</option>';
        champions.sort((a, b) => a.name.localeCompare(b.name)).forEach(champ => {
            championOptions += `<option value="${champ.id}">${champ.name}</option>`;
        });

        // Legacy Piece Selector
        let legacyOptions = '<option value="">-- No Legacy Piece --</option>';
        legacyPieces.sort((a, b) => a.name.localeCompare(b.name)).forEach(piece => {
            legacyOptions += `<option value="${piece.id}">${piece.name}</option>`;
        });

        memberDiv.innerHTML = `
            <div>
                <label class="form-label">Member ${i}</label>
                <select name="champion${i}" class="form-select" required>${championOptions}</select>
            </div>
            <div>
                <label class="form-label">Legacy Piece</label>
                <select name="legacyPiece${i}" class="form-select">${legacyOptions}</select>
            </div>
        `;
        membersContainer.appendChild(memberDiv);
    }
}

async function handleCreateSquadSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    // 1. Validate Short Description for HTML
    const shortDescription = formData.get('shortDescription');
    const htmlTagRegex = /<[a-z][\s\S]*>/i;
    if (htmlTagRegex.test(shortDescription)) {
        showNotification('Short Description cannot contain HTML tags.', 'error');
        return;
    }

    // 2. Gather selections to check for duplicates
    const selectedChampionIds = [];
    const selectedLegacyPieceIds = [];

    for (let i = 1; i <= 5; i++) {
        const championId = formData.get(`champion${i}`);
        const legacyPieceId = formData.get(`legacyPiece${i}`);
        
        if (championId) {
            selectedChampionIds.push(championId);
        }
        // Only check for duplicate legacy pieces if one was actually selected
        if (legacyPieceId) {
            selectedLegacyPieceIds.push(legacyPieceId);
        }
    }

    // 3. Check for duplicate champions
    const uniqueChampions = new Set(selectedChampionIds);
    if (uniqueChampions.size !== selectedChampionIds.length) {
        showNotification('Each champion can only be used once per squad.', 'error');
        return;
    }

    // 4. Check for duplicate legacy pieces
    const uniqueLegacyPieces = new Set(selectedLegacyPieceIds);
    if (uniqueLegacyPieces.size !== selectedLegacyPieceIds.length) {
        showNotification('Each legacy piece can only be equipped by one champion.', 'error');
        return;
    }

    const rawHtmlContent = tinymce.get('squad-long-desc').getContent();

    if (!rawHtmlContent.trim()) {
        showNotification('The "Long Description" cannot be empty.', 'error');
        tinymce.get('squad-long-desc').focus();
        return; // Stop the function
    }

    // Sanitize the HTML content with DOMPurify to prevent XSS attacks
    const sanitizedHtmlContent = DOMPurify.sanitize(rawHtmlContent, {
        USE_PROFILES: { html: true }, // Allows common HTML tags
        ALLOWED_TAGS: ['p', 'b', 'i', 'u', 'strong', 'em', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'img', 'iframe', 'br'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'width', 'height', 'allowfullscreen', 'frameborder', 'style', 'class']
    });

    const members = [];
    for (let i = 1; i <= 5; i++) {
        const championId = formData.get(`champion${i}`);
        const legacyPieceId = formData.get(`legacyPiece${i}`);
        if (!championId) continue;

        const championData = ALL_DATA.champions.find(c => c.id === championId);
        const legacyPieceData = ALL_DATA.legacyPieces.find(lp => lp.id === legacyPieceId);

        members.push({
            dbChampionId: championId,
            name: championData.name,
            class: championData.class,
            legacyPiece: legacyPieceData ? { id: legacyPieceId, name: legacyPieceData.name } : null
        });
    }

    if (members.length !== 5) {
        showNotification("Please select all 5 squad members.", "error");
        return;
    }

    // --- Synergy Calculation (Simplified) ---
    const memberSynergies = members.flatMap(m => ALL_DATA.champions.find(c => c.id === m.dbChampionId)?.inherentSynergies || []);
    const synergyCounts = memberSynergies.reduce((acc, syn) => {
        acc[syn] = (acc[syn] || 0) + 1;
        return acc;
    }, {});
    
    const activeSynergies = Object.entries(synergyCounts).map(([name, count]) => {
        const synergyInfo = ALL_DATA.synergies.find(s => s.name === name);
        const applicableTier = synergyInfo?.tiers.filter(t => t.countRequired <= count).pop();
        return applicableTier ? { name, appliedAtMemberCount: applicableTier.countRequired } : null;
    }).filter(Boolean);

    const squadData = {
        name: form.querySelector('#squad-name').value,
        shortDescription: form.querySelector('#squad-short-desc').value,
        longDescription: sanitizedHtmlContent,
        members: members,
        activeSynergies: activeSynergies,
    };

    if (isEditMode) {
        const originalSquad = ALL_DATA.squads.find(s => s.id === currentEditingSquadId);
        if (!originalSquad) {
            showNotification("Error: Original squad data not found.", "error");
            return;
        }

        const updatePayload = {};
        const allowedKeys = ['name', 'shortDescription', 'longDescription', 'members', 'activeSynergies'];

        for (const key of allowedKeys) {
            if (JSON.stringify(originalSquad[key]) !== JSON.stringify(squadData[key])) {
                updatePayload[key] = squadData[key];
            }
        }

        if (Object.keys(updatePayload).length === 0) {
            showNotification("No changes were detected.", "info");
            closeCreateModal();
            return;
        }

        try {
            const squadDocRef = doc(db, 'artifacts/dc-dark-legion-builder/public/data/squads', currentEditingSquadId);
            await updateDoc(squadDocRef, updatePayload);
            showNotification('Squad updated successfully!', 'success');

            // 1. Update the in-memory data using the still-valid ID
            const squadIndex = ALL_DATA.squads.findIndex(s => s.id === currentEditingSquadId);
            if (squadIndex > -1) {
                ALL_DATA.squads[squadIndex] = { ...ALL_DATA.squads[squadIndex], ...updatePayload };
            }

            // 2. Update the browser's local storage cache
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                data: ALL_DATA
            }));

            // 3. Re-render the view with the correct ID BEFORE the modal is closed
            renderDetailView(currentEditingSquadId);

            // 4. Finally, close the modal and reset the state as the last step
            closeCreateModal();
        } catch (error) {
            console.error("Error updating squad:", error);
            showNotification('Failed to update squad. Please check console.', 'error');
        }
    } else {
        const newSquad = {
            name: formData.get('name'),
            shortDescription: formData.get('shortDescription'),
            longDescription: sanitizedHtmlContent,
            members: members,
            activeSynergies: activeSynergies,
            originalOwnerId: currentUser.uid,
            createdAt: serverTimestamp(),
            thumbsUp: 0,
            thumbsDown: 0,
        };

        try {
            const squadCollection = collection(db, 'artifacts/dc-dark-legion-builder/public/data/squads');
            await addDoc(squadCollection, newSquad);
            document.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Squad created successfully!', type: 'success' } }));
            closeCreateModal();
            localStorage.removeItem('squads_data_cache'); // Invalidate cache
            setTimeout(() => window.location.reload(), 1000); // Reload to show new squad
        } catch (error) {
            console.error("Error creating squad:", error);
            document.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Failed to create squad.', type: 'error' } }));
        }
    }
}

// --- UI INTERACTIONS ---

/**
 * @function showNotification
 * @description A helper to dispatch toast notifications.
 */
function showNotification(message, type) {
    const event = new CustomEvent('show-toast', { detail: { message, type } });
    document.dispatchEvent(event);
}

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

async function initializeAppAndRender() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (user && !user.isAnonymous) {
            // User is logged in, fetch their roles
            const userDocRef = doc(db, "artifacts/dc-dark-legion-builder/users", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                userRoles = userDocSnap.data().roles || [];
            } else {
                userRoles = [];
            }
        } else {
            // User is logged out or anonymous
            userRoles = [];
        }
        await main();
    });
}

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

document.addEventListener('DOMContentLoaded', initializeAppAndRender);
document.getElementById('create-squad-form').addEventListener('submit', handleCreateSquadSubmit);
document.getElementById('close-modal-btn').addEventListener('click', closeCreateModal);
document.getElementById('cancel-create-btn').addEventListener('click', closeCreateModal);
