/**
 * @file js/mementos/ui.js
 * @fileoverview Handles UI interactions for The Monitor's Mementos page.
 * @version 1.1.5
 */

import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

// #region --- GLOBAL VARIABLES & CONFIG ---

let db, analytics;
const comicDataCache = new Map();
const APP_ID = 'dc-dark-legion-builder';

// #endregion

// #region --- DOM ELEMENT REFERENCES ---

const pageLoader = document.getElementById('page-loader');
const mainHeader = document.getElementById('main-header');
const pageTitle = document.getElementById('page-title');
const pageDescription = document.getElementById('page-description');
const comicsView = document.getElementById('comics-view');
const mementosView = document.getElementById('mementos-view');
const limitedComicsContainer = document.getElementById('limited-comics-container');
const standardComicsContainer = document.getElementById('standard-comics-container');
const mementoDetailGrid = document.getElementById('memento-detail-grid');

// #endregion

// #region --- HELPER FUNCTIONS ---

function formatTitleForImage(title) {
    return title.replace(/'/g, "").replace(/[\s-]/g, '_');
}

function padSortOrder(num) {
    return String(num).padStart(2, '0');
}

function getTierColor(tierString) {
    if (!tierString) return 'unlocked';
    return tierString.split(' ')[0].toLowerCase();
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
    pageTitle.textContent = "Monitor's Mementos";
    pageDescription.textContent = "A complete collection of comic book mementos.";
    mainHeader.classList.remove('text-left');
}

function switchView(viewName) {
    comicsView.classList.toggle('hidden', viewName !== 'comics');
    mementosView.classList.toggle('hidden', viewName !== 'mementos');
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
    limitedComicsContainer.innerHTML = '';
    standardComicsContainer.innerHTML = '';
    const limitedComics = comics.filter(c => c.isLimited).sort((a, b) => a.sortOrder - b.sortOrder);
    const standardComics = comics.filter(c => !c.isLimited).sort((a, b) => a.sortOrder - b.sortOrder);
    if (limitedComics.length > 0) {
        limitedComics.forEach(comic => limitedComicsContainer.appendChild(createComicCardLink(comic)));
    } else {
        limitedComicsContainer.innerHTML = '<p class="text-slate-400 col-span-full">No limited edition mementos found.</p>';
    }
    if (standardComics.length > 0) {
        standardComics.forEach(comic => standardComicsContainer.appendChild(createComicCardLink(comic)));
    } else {
        standardComicsContainer.innerHTML = '<p class="text-slate-400 col-span-full">No standard issue mementos found.</p>';
    }
    switchView('comics');
    hideLoader();
}

function displayMementosView(comic, mementos) {
    pageTitle.textContent = comic.title;
    pageDescription.textContent = "A collection of mementos.";
    mainHeader.classList.add('text-left');
    mementoDetailGrid.innerHTML = '';
    const formattedComicTitle = formatTitleForImage(comic.title);
    mementos.sort((a, b) => a.sortOrder - b.sortOrder).forEach(memento => {
        const paddedOrder = padSortOrder(memento.sortOrder);
        const mementoImageUrl = `https://dcdl-companion.com/img/mementos/${formattedComicTitle}/icon_collection_${formattedComicTitle}_${paddedOrder}.webp`;
        const tierHtml = createMementoTierHtml(memento.starColorTier);
        const mementoEl = document.createElement('div');
        mementoEl.className = 'memento-card';
        mementoEl.innerHTML = `
            <img src="${mementoImageUrl}" alt="${memento.name}" class="memento-image" loading="lazy">
            <div class="memento-name">${memento.name}</div>
            ${tierHtml}
        `;
        mementoDetailGrid.appendChild(mementoEl);
    });
    switchView('mementos');
    hideLoader();
}

function hideLoader() {
    if (pageLoader) {
        pageLoader.remove();
    }
}

// #endregion

// #region --- FIREBASE DATA FETCHING ---

function initFirebaseServices() {
    try {
        const app = getApp();
        db = getFirestore(app);
        analytics = getAnalytics(app);
    } catch (e) {
        console.error("Mementos UI: Error getting Firebase services.", e);
        document.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Failed to connect to content service.', type: 'error' } }));
    }
}

async function fetchAllComics() {
    if (comicDataCache.size > 0) {
        return Array.from(comicDataCache.values());
    }
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
        const mementos = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return mementos;
    } catch (error) {
        console.error(`Mementos UI: Error fetching mementos for comic ${comicId}:`, error);
        return [];
    }
}

// #endregion

// #region --- INITIALIZATION & FIXES ---

/**
 * Fixes an issue where desktop navigation links might not appear due to CSS conflicts or other script interference.
 * This function ensures the navigation container is visible on wider screens.
 */
function applyNavVisibilityFix() {
    try {
        const navLinksContainer = document.querySelector('navigation-widget .hidden.md\\:flex');
        // The 'md' breakpoint in Tailwind is typically 768px.
        if (navLinksContainer && window.innerWidth >= 768) {
            // Forcefully remove the `hidden` class and reset inline style to prevent conflicts.
            navLinksContainer.classList.remove('hidden');
            navLinksContainer.style.display = ''; // Let the Tailwind 'md:flex' class take over.
        }
    } catch (error) {
        console.error("Failed to apply navigation visibility fix:", error);
    }
}


async function initializePage() {
    try {
        initFirebaseServices();
        if (!db || !analytics) {
            console.error("Mementos UI: DB or Analytics not available. Halting initialization.");
            hideLoader();
            return;
        }

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
                console.error(`Mementos UI: Comic with ID ${comicId} not found in cache. Displaying main view.`);
                displayComicsView(Array.from(comicDataCache.values()));
            }
        } else {
            logEvent(analytics, 'page_view', { page_title: "Monitor's Mementos" });
            displayComicsView(Array.from(comicDataCache.values()));
        }
    } catch (error) {
        console.error("Mementos UI: A critical error occurred during page initialization:", error);
        document.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'A critical error occurred while loading the page.', type: 'error' } }));
        hideLoader();
    }
}

document.addEventListener('firebase-ready', () => {
    initializePage();
    // After initializing the page content, apply the navigation visibility fix.
    applyNavVisibilityFix();
    // Also apply the fix whenever the window is resized.
    window.addEventListener('resize', applyNavVisibilityFix);
}, { once: true });

// #endregion
