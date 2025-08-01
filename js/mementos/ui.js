/**
 * @file js/mementos/ui.js
 * @fileoverview Handles UI interactions for The Monitor's Mementos page.
 * @version 1.3.0 - Added wishlist functionality.
 */

import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, query, orderBy, doc, getDoc, setDoc, updateDoc, deleteField } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

// #region --- GLOBAL VARIABLES & CONFIG ---

let db, auth, analytics, userId;
const comicDataCache = new Map();
let userCollection = new Map(); // Stores user's memento counts { mementoId: count }
let userWishlist = []; // Stores user's wishlist [mementoId, mementoId]
const APP_ID = 'dc-dark-legion-builder';

// Public Usernames of Creators to feature on this page.
const FEATURED_CREATOR_PUBLIC_IDS = ['ogwmj', 'Tyvokka'];

// #endregion

// #region --- DOM ELEMENT REFERENCES ---

const DOM = {
    pageLoader: document.getElementById('page-loader'),
    mainHeader: document.getElementById('main-header'),
    pageTitle: document.getElementById('page-title'),
    pageDescription: document.getElementById('page-description'),
    comicsView: document.getElementById('comics-view'),
    mementosView: document.getElementById('mementos-view'),
    limitedComicsContainer: document.getElementById('limited-comics-container'),
    standardComicsContainer: document.getElementById('standard-comics-container'),
    mementoDetailGrid: document.getElementById('memento-detail-grid'),
    featuredCreatorsContainer: document.getElementById('featured-creators-container'),
};

// #endregion

// #region --- HELPER FUNCTIONS ---

function formatTitleForImage(title) {
    return title.replace(/'/g, "").replace(/[\s-]/g, '_');
}

function padSortOrder(num) {
    return String(num).padStart(2, '0');
}

function createMementoTierHtml(ratingString) {
    if (!ratingString || typeof ratingString !== 'string' || ratingString === 'N/A' || ratingString === 'Unlocked') {
        return '<span class="memento-tier-na">N/A</span>';
    }
    const parts = ratingString.split(' ');
    if (parts.length < 2) return `<span class="memento-tier">${ratingString}</span>`;
    const tier = parts[0].toLowerCase();
    const starMatch = ratingString.match(/\d+/);
    const stars = starMatch ? parseInt(starMatch[0], 10) : 0;
    let starsHtml = '';
    for (let i = 0; i < 5; i++) {
        starsHtml += `<span class="star-icon ${i < stars ? 'active' : ''}">★</span>`;
    }
    return `<div class="memento-stars tier-${tier}">${starsHtml}</div>`;
}

// #endregion

// #region --- VIEW RENDERING & MANAGEMENT ---

function resetHeader() {
    DOM.pageTitle.textContent = "Monitor's Mementos";
    DOM.pageDescription.textContent = "A complete collection of comic book mementos.";
    DOM.mainHeader.classList.remove('text-left');
    if (DOM.featuredCreatorsContainer && DOM.featuredCreatorsContainer.parentElement) {
        DOM.featuredCreatorsContainer.parentElement.classList.remove('hidden');
    }
}

function switchView(viewName) {
    DOM.comicsView.classList.toggle('hidden', viewName !== 'comics');
    DOM.mementosView.classList.toggle('hidden', viewName !== 'mementos');
    if (DOM.featuredCreatorsContainer && DOM.featuredCreatorsContainer.parentElement) {
        DOM.featuredCreatorsContainer.parentElement.classList.toggle('hidden', viewName === 'mementos');
    }
}

function createComicCardLink(comic) {
    const formattedTitle = formatTitleForImage(comic.title);
    const coverImageUrl = `https://dcdl-companion.com/img/mementos/${formattedTitle}/icon_collection_${formattedTitle}_cover.webp`;
    const cardLink = document.createElement('a');
    cardLink.className = 'comic-card';
    cardLink.href = `?comic=${comic.id}`;
    cardLink.dataset.comicId = comic.id;
    let limitedBadge = comic.isLimited ? '<div class="limited-badge">Limited</div>' : '';
    cardLink.innerHTML = `
        <div class="comic-cover-wrapper">
            <img src="${coverImageUrl}" alt="${comic.title} Cover" class="comic-cover" loading="lazy">
            ${limitedBadge}
        </div>
        <div class="comic-title">${comic.title}</div>
    `;
    return cardLink;
}

function displayComicsView(comics) {
    resetHeader();
    DOM.limitedComicsContainer.innerHTML = '';
    DOM.standardComicsContainer.innerHTML = '';
    const limitedComics = comics.filter(c => c.isLimited).sort((a, b) => a.sortOrder - b.sortOrder);
    const standardComics = comics.filter(c => !c.isLimited).sort((a, b) => a.sortOrder - b.sortOrder);
    limitedComics.forEach(comic => DOM.limitedComicsContainer.appendChild(createComicCardLink(comic)));
    standardComics.forEach(comic => DOM.standardComicsContainer.appendChild(createComicCardLink(comic)));
    switchView('comics');
    hideLoader();
    displayFeaturedCreators(FEATURED_CREATOR_PUBLIC_IDS);
}

function displayMementosView(comic, mementos) {
    DOM.pageTitle.textContent = comic.title;
    DOM.pageDescription.textContent = userId ? "Track your collection and wishlist below." : "Log in to track your collection.";
    DOM.mainHeader.classList.add('text-left');
    DOM.mementoDetailGrid.innerHTML = '';
    const formattedComicTitle = formatTitleForImage(comic.title);
    mementos.sort((a, b) => a.sortOrder - b.sortOrder).forEach(memento => {
        const paddedOrder = padSortOrder(memento.sortOrder);
        const mementoImageUrl = `https://dcdl-companion.com/img/mementos/${formattedComicTitle}/icon_collection_${formattedComicTitle}_${paddedOrder}.webp`;
        const tierHtml = createMementoTierHtml(memento.starColorTier);
        const mementoEl = document.createElement('div');
        mementoEl.className = 'memento-card';
        mementoEl.id = `memento-${memento.id}`;
        
        let actionsHtml = '';
        if (userId) {
            const isWishlisted = userWishlist.includes(memento.id);
            actionsHtml = `
                <div class="memento-actions-wrapper">
                    <div class="memento-counter">
                        <button class="counter-btn" data-action="decrement" data-memento-id="${memento.id}">-</button>
                        <span class="counter-display" id="count-${memento.id}">0</span>
                        <button class="counter-btn" data-action="increment" data-memento-id="${memento.id}">+</button>
                    </div>
                    <button class="wishlist-btn ${isWishlisted ? 'active' : ''}" data-action="wishlist" data-memento-id="${memento.id}" title="Toggle Wishlist">
                        <i class="fas fa-star"></i>
                    </button>
                </div>`;
        }

        mementoEl.innerHTML = `
            <img src="${mementoImageUrl}" alt="${memento.name}" class="memento-image" loading="lazy">
            <div class="memento-name mt-2">${memento.name}</div>
            ${tierHtml}
            ${actionsHtml}
        `;
        DOM.mementoDetailGrid.appendChild(mementoEl);
    });
    updateMementosUIWithUserData();
    switchView('mementos');
    hideLoader();
}

function updateMementosUIWithUserData() {
    if (!userId) return;
    document.querySelectorAll('.memento-card').forEach(card => {
        const mementoId = card.id.replace('memento-', '');
        const count = userCollection.get(mementoId) || 0;
        const display = card.querySelector(`#count-${mementoId}`);
        if (display) {
            display.textContent = count;
            const decrementBtn = card.querySelector('[data-action="decrement"]');
            if(decrementBtn) decrementBtn.disabled = count === 0;
        }
        card.classList.toggle('is-owned', count > 0);
        card.classList.toggle('has-duplicates', count > 1);

        const wishlistBtn = card.querySelector('.wishlist-btn');
        if (wishlistBtn) {
            wishlistBtn.classList.toggle('active', userWishlist.includes(mementoId));
        }
    });
}

function hideLoader() {
    if (DOM.pageLoader) {
        DOM.pageLoader.remove();
    }
}

function generateMementoCreatorCardHtml(creatorData) {
    const socials = creatorData.socials || {};
    const socialLinks = [
        { key: 'discord', icon: 'fab fa-discord', url: socials.discord },
        { key: 'youtube', icon: 'fab fa-youtube', url: socials.youtube },
        { key: 'twitch', icon: 'fab fa-twitch', url: socials.twitch },
        { key: 'x', icon: 'fab fa-twitter', url: socials.x },
        { key: 'tiktok', icon: 'fab fa-tiktok', url: socials.tiktok },
        { key: 'instagram', icon: 'fab fa-instagram', url: socials.instagram }
    ];
    const socialsHtml = socialLinks.filter(link => link.url).map(link => `<a href="${link.url}" target="_blank" rel="noopener noreferrer" title="${link.key.charAt(0).toUpperCase() + link.key.slice(1)}"><i class="${link.icon}"></i></a>`).join('');
    const logoUrl = creatorData.logo || '/img/champions/avatars/dc_logo.webp';
    return `<div class="creator-card-memento"><img src="${logoUrl}" alt="${creatorData.username || 'Creator'} Logo" class="creator-logo-memento" onerror="this.onerror=null;this.src='/img/champions/avatars/dc_logo.webp';"><h3 class="creator-username-memento">${creatorData.username || 'Anonymous'}</h3>${creatorData.description ? `<p class="creator-description-memento">${creatorData.description}</p>` : ''}${socialsHtml ? `<div class="creator-socials-memento">${socialsHtml}</div>` : ''}</div>`;
}

async function displayFeaturedCreators(creatorPublicIds) {
    if (!DOM.featuredCreatorsContainer) return;
    DOM.featuredCreatorsContainer.innerHTML = '<p class="text-center text-slate-400 col-span-full">Loading featured creators...</p>';
    const profiles = await fetchPublicCreatorProfiles(creatorPublicIds);
    if (profiles.length === 0) {
        DOM.featuredCreatorsContainer.innerHTML = '<p class="text-center text-slate-400 col-span-full">No featured creators to display at this time.</p>';
    } else {
        DOM.featuredCreatorsContainer.innerHTML = profiles.map(generateMementoCreatorCardHtml).join('');
    }
}

// #endregion

// #region --- FIREBASE DATA & USER COLLECTION ---

function initFirebaseServices() {
    try {
        const app = getApp();
        auth = getAuth(app);
        db = getFirestore(app);
        analytics = getAnalytics(app);
    } catch (e) {
        console.error("Mementos UI: Error getting Firebase services.", e);
    }
}

async function fetchAllComics() {
    if (comicDataCache.size > 0) return Array.from(comicDataCache.values());
    try {
        const comicsColRef = collection(db, `/artifacts/${APP_ID}/public/data/mementoComics`);
        const q = query(comicsColRef, orderBy('sortOrder', 'asc'));
        const querySnapshot = await getDocs(q);
        const comics = [];
        querySnapshot.forEach(doc => {
            const comicData = { id: doc.id, ...doc.data() };
            comics.push(comicData);
            comicDataCache.set(comicData.id, comicData);
        });
        return comics;
    } catch (error) {
        console.error("Mementos UI: Error fetching comics:", error);
        return [];
    }
}

async function fetchMementosForComic(comicId) {
    try {
        const mementosColRef = collection(db, `/artifacts/${APP_ID}/public/data/mementoComics/${comicId}/mementos`);
        const q = query(mementosColRef, orderBy('sortOrder', 'asc'));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error(`Mementos UI: Error fetching mementos for comic ${comicId}:`, error);
        return [];
    }
}

async function fetchUserCollection() {
    if (!userId || !db) {
        userCollection.clear();
        userWishlist = [];
        return;
    };
    try {
        const docRef = doc(db, `artifacts/${APP_ID}/users/${userId}/mementos/collection`);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            userCollection = new Map(Object.entries(data.mementos || {}));
            userWishlist = data.wishlist || [];
        } else {
            userCollection.clear();
            userWishlist = [];
        }
    } catch (error) {
        console.error("Error fetching user memento collection:", error);
        userCollection.clear();
        userWishlist = [];
    }
}

async function updateUserCollection(mementoId, newCount) {
    if (!userId) return;
    
    const docRef = doc(db, `artifacts/${APP_ID}/users/${userId}/mementos/collection`);
    const fieldPath = `mementos.${mementoId}`;

    userCollection.set(mementoId, newCount);
    updateMementosUIWithUserData();

    try {
        if (newCount > 0) {
            await updateDoc(docRef, { [fieldPath]: newCount });
        } else {
            await updateDoc(docRef, { [fieldPath]: deleteField() });
        }
    } catch (error) {
        if (error.code === 'not-found' || error.message.includes('No document to update')) {
            if (newCount > 0) {
                try {
                    await setDoc(docRef, { mementos: { [mementoId]: newCount } }, { merge: true });
                } catch (e) {
                    console.error("Error creating/merging user collection document:", e);
                }
            }
        } else {
            console.error("Error updating user collection:", error);
        }
    }
}

async function updateUserWishlist() {
    if (!userId) return;
    const docRef = doc(db, `artifacts/${APP_ID}/users/${userId}/mementos/collection`);
    try {
        await setDoc(docRef, { wishlist: userWishlist }, { merge: true });
    } catch (error) {
        console.error("Error updating wishlist:", error);
        document.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Failed to update wishlist.', type: 'error' } }));
    }
}

async function fetchPublicCreatorProfiles(publicIds) {
    if (!db || !publicIds || publicIds.length === 0) return [];
    const profiles = [];
    try {
        for (const username of publicIds) {
            const docRef = doc(db, 'public_creator_profiles', username);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                profiles.push({ id: docSnap.id, ...docSnap.data() });
            }
        }
    } catch (error) {
        console.error("Error fetching public creator profiles:", error);
    }
    return profiles;
}

// #endregion

// #region --- EVENT LISTENERS & INITIALIZATION ---

function handleActionsClick(event) {
    const button = event.target.closest('button');
    if (!button || !userId) return;

    const action = button.dataset.action;
    const mementoId = button.dataset.mementoId;

    if (action === 'increment' || action === 'decrement') {
        const currentCount = userCollection.get(mementoId) || 0;
        let newCount = (action === 'increment') ? currentCount + 1 : Math.max(0, currentCount - 1);
        logEvent(analytics, 'update_memento_count', { memento_id: mementoId, new_count: newCount });
        updateUserCollection(mementoId, newCount);
    } else if (action === 'wishlist') {
        const index = userWishlist.indexOf(mementoId);
        if (index > -1) {
            userWishlist.splice(index, 1);
            logEvent(analytics, 'update_wishlist', { memento_id: mementoId, action: 'remove' });
        } else {
            if (userWishlist.length >= 5) {
                document.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Wishlist is full (max 5 items).', type: 'warning' } }));
                return;
            }
            userWishlist.push(mementoId);
            logEvent(analytics, 'update_wishlist', { memento_id: mementoId, action: 'add' });
        }
        updateMementosUIWithUserData();
        updateUserWishlist();
    }
}

async function initializePage() {
    try {
        const params = new URLSearchParams(window.location.search);
        const comicId = params.get('comic');

        await fetchAllComics();

        if (comicId) {
            const comicData = comicDataCache.get(comicId);
            if (comicData) {
                logEvent(analytics, 'select_content', { content_type: 'comic', item_id: comicData.title });
                const mementos = await fetchMementosForComic(comicId);
                displayMementosView(comicData, mementos);
            } else {
                displayComicsView(Array.from(comicDataCache.values()));
            }
        } else {
            logEvent(analytics, 'page_view', { page_title: "Monitor's Mementos" });
            displayComicsView(Array.from(comicDataCache.values()));
        }
    } catch (error) {
        console.error("Mementos UI: A critical error occurred during page initialization:", error);
        hideLoader();
    }
}

document.addEventListener('firebase-ready', () => {
    initFirebaseServices();
    if (!db || !analytics) {
        hideLoader();
        return;
    }
    
    onAuthStateChanged(getAuth(), async (user) => {
        if (user && !user.isAnonymous) {
            userId = user.uid;
            await fetchUserCollection();
        } else {
            userId = null;
            userCollection.clear();
            userWishlist = [];
        }
        const params = new URLSearchParams(window.location.search);
        const comicId = params.get('comic');
        if (comicId && DOM.mementosView && !DOM.mementosView.classList.contains('hidden')) {
             const comicData = comicDataCache.get(comicId);
             const mementos = await fetchMementosForComic(comicId);
             displayMementosView(comicData, mementos);
        }
    });
    
    initializePage();
    DOM.mementoDetailGrid.addEventListener('click', handleActionsClick);

}, { once: true });

// #endregion
