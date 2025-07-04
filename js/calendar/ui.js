/**
 * @file js/calendar/ui.js
 * @description Fetches and renders the Limited Mythic champion rotation calendar.
 * @version 3.0.0 - Displays Community Average data.
 */

// Import necessary functions from the Firebase SDK
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

// --- GLOBAL STATE ---
let db;
let sortedChampionsList = [];
const DOM = {
    timelineContainer: document.getElementById('timeline-container')
};
const comicModalBackdrop = document.getElementById('comic-modal-backdrop');
const comicModalBody = document.getElementById('comic-modal-body');
const comicModalClose = document.getElementById('comic-modal-close');
const championDetailsCache = new Map();

// --- HELPER & COMIC VIEW FUNCTIONS (No changes here) ---
async function fetchChampionDetails(relatedIds) {
    const championsToFetch = relatedIds.filter(id => !championDetailsCache.has(id));
    if (championsToFetch.length > 0) {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'dc-dark-legion-builder';
        const championsRef = collection(db, `artifacts/${appId}/public/data/champions`);
        const q = query(championsRef, where('__name__', 'in', championsToFetch));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach(doc => championDetailsCache.set(doc.id, { id: doc.id, ...doc.data() }));
    }
    return relatedIds.map(id => championDetailsCache.get(id)).filter(Boolean);
}

async function showComicModal(championId) {
    comicModalBackdrop.classList.add('is-visible');
    comicModalBody.innerHTML = `<div class="loader-spinner" style="animation: spin 1.5s linear infinite;"></div>`;
    try {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'dc-dark-legion-builder';
        const championDocRef = doc(db, `artifacts/${appId}/public/data/champions`, championId);
        const championSnap = await getDoc(championDocRef);
        if (!championSnap.exists()) throw new Error("Main champion not found.");
        const mainChampion = { id: championSnap.id, ...championSnap.data() };
        const relatedSubcollectionRef = collection(db, `artifacts/${appId}/public/data/champions/${championId}/relatedChampions`);
        const relatedQuerySnapshot = await getDocs(relatedSubcollectionRef);
        let relatedChampionIds = relatedQuerySnapshot.empty ? [] : (relatedQuerySnapshot.docs[0].data().championIds || []);
        let relatedChampionsHtml = '';
        if (relatedChampionIds.length > 0) {
            const relatedChampions = await fetchChampionDetails(relatedChampionIds);
            relatedChampions.sort((a, b) => a.name.localeCompare(b.name));
            relatedChampionsHtml = relatedChampions.map(related => {
                const cleanName = related.name.replace(/[^a-zA-Z0-9_]/g, "");
                return `<div class="related-champion-panel"><img src="img/champions/avatars/${cleanName}.webp" alt="${related.name}" onerror="this.src='img/champions/avatars/dc_logo.webp'"><h4>${related.name}</h4></div>`;
            }).join('');
        }
        const mainChampCleanName = mainChampion.name.replace(/[^a-zA-Z0-9-_]/g, "");
        const featuringSection = relatedChampionsHtml ? `<div class="comic-featuring-title">Increased Odds...</div><div class="related-champions-grid">${relatedChampionsHtml}</div>` : '';
        comicModalBody.innerHTML = `<div class="comic-header"><img src="img/logo_white.webp" alt="Logo" class="comic-header-logo"></div><div class="comic-image-panel"><img src="img/champions/full/${mainChampCleanName}.webp" alt="${mainChampion.name}" class="comic-featured-image" onerror="this.parentElement.style.display='none'"></div><h3 class="comic-main-title">${mainChampion.name}</h3>${featuringSection}`;
    } catch (error) {
        console.error("Error creating comic modal:", error);
        comicModalBody.innerHTML = `<p class="text-center text-red-500">Could not load champion details.</p>`;
    }
}

function hideComicModal() {
    comicModalBackdrop.classList.remove('is-visible');
    comicModalBody.innerHTML = '';
}

// --- CORE FUNCTIONS ---

function createSchedule() {
    return sortedChampionsList.map((champion, i) => ({
        ...champion,
        startWeek: (i * 2) + 1,
        endWeek: ((i * 2) + 1) + 3,
    }));
}

/**
 * Takes a string like "Gold 4-Star" and returns styled star icons.
 * @param {string} ratingString - The star rating value.
 * @returns {string} The complete HTML for the star display.
 */
function createStarRatingHtml(ratingString) {
    if (!ratingString || typeof ratingString !== 'string' || ratingString === 'N/A' || ratingString === 'Unlocked') {
        return '<span class="roster-value not-on-roster">N/A</span>';
    }

    const parts = ratingString.split(' ');
    if (parts.length < 2) return `<span class="roster-value">${ratingString}</span>`;

    const tier = parts[0].toLowerCase();
    const stars = parseInt(parts[1], 10) || 0;

    let starsHtml = '';
    for (let i = 0; i < 5; i++) {
        starsHtml += `<span class="star-icon ${i < stars ? 'active' : ''}">★</span>`;
    }
    
    return `<div class="roster-stars tier-${tier}">${starsHtml}</div>`;
}

function renderTimeline(schedule, currentWeek) {
    if (!DOM.timelineContainer) return;
    let timelineHtml = '';
    schedule.forEach((event, index) => {
        const rowClass = index % 2 === 0 ? 'odd' : 'even';
        let statusClass = 'is-upcoming';
        if (currentWeek >= event.startWeek && currentWeek <= event.endWeek) {
            statusClass = 'is-active';
        } else if (currentWeek > event.endWeek) {
            statusClass = 'is-past';
        }

        let communityAvgHtml = '';
        if (event.id !== 'TBA') {
            const communityLevel = event.communityAverageLevel || 'N/A';
            const communityStarsHtml = createStarRatingHtml(communityLevel);
            communityAvgHtml = `
                <div class="roster-container">
                    <h4>Community Average</h4>
                    <div class="roster-details-wrapper">
                        ${communityStarsHtml}
                    </div>
                </div>`;
        }

        const championName = event.name || "To Be Announced";
        const championLink = event.id === 'TBA' ? championName : `<a href="calculator.html?addChampion=${event.id}" class="champion-link">${championName}</a>`;

        timelineHtml += `
            <div id="event-${index}" class="timeline-event ${rowClass} ${statusClass}" role="button" tabindex="0" data-champion-id="${event.id}" style="grid-column-start: ${index + 1};">
                <div class="timeline-content">
                    <div class="timeline-main-info">
                        <img src="${event.avatar}" alt="${championName}" class="timeline-avatar" onerror="this.src='img/champions/avatars/dc_logo.webp'">
                        <div class="timeline-text-content">
                             <h3>${championLink}</h3>
                             <p class="date-range">Weeks ${event.startWeek} &ndash; ${event.endWeek}</p>
                             <span class="duration-tag">4 Week Cycle</span>
                        </div>
                    </div>
                    ${communityAvgHtml}
                </div>
            </div>`;
    });
    DOM.timelineContainer.innerHTML = timelineHtml;
}

async function initializeCalendar(analytics) {
    showTimelineMessage('Loading calendar data...');
    try {
        const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'dc-dark-legion-builder';
        
        const championsRef = collection(db, `artifacts/${APP_ID}/public/data/champions`);
        const rotationConfigRef = doc(db, `artifacts/${APP_ID}/public/data/siteConfig/championRotation`);

        const [rotationConfigSnap, championsQuerySnap] = await Promise.all([
            getDoc(rotationConfigRef),
            getDocs(query(championsRef, where("baseRarity", "==", "Limited Mythic")))
        ]);
        
        if (championsQuerySnap.empty) {
            showTimelineMessage('No "Limited Mythic" champions found.');
            return;
        }

        const championsMap = new Map();
        championsQuerySnap.forEach(doc => {
            const champ = doc.data();
            championsMap.set(doc.id, {
                id: doc.id,
                name: champ.name,
                avatar: `img/champions/avatars/${(champ.name || "").replace(/[^a-zA-Z0-9-_]/g, "")}.webp`,
                // === MODIFICATION START ===
                // Fetch the community average level for each champion
                communityAverageLevel: champ.communityAverageLevel || 'N/A'
                // === MODIFICATION END ===
            });
        });

        const rotationOrder = rotationConfigSnap.exists() ? rotationConfigSnap.data().order : [];
        sortedChampionsList = rotationOrder.length > 0
            ? rotationOrder.map(id => (id === 'TBA' ? { id: 'TBA', name: 'To Be Announced', avatar: 'img/champions/avatars/dc_logo.webp' } : championsMap.get(id))).filter(Boolean)
            : [...championsMap.values()].sort((a, b) => a.name.localeCompare(b.name));

        const schedule = createSchedule();
        const rotationStartDate = new Date("2025-06-09T00:00:00Z");
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        const weeksSinceStart = Math.floor((Date.now() - rotationStartDate.getTime()) / msPerWeek);
        const currentWeek = weeksSinceStart + 1;

        renderTimeline(schedule, currentWeek);

        if (analytics) {
            logEvent(analytics, 'page_view', { page_title: document.title, page_location: window.location.href, page_path: window.location.pathname });
        }

        DOM.timelineContainer.addEventListener('click', (e) => {
            const eventElement = e.target.closest('.timeline-event');
            if (eventElement) {
                const championId = eventElement.dataset.championId;
                if (championId && championId !== 'TBA' && !e.target.closest('.champion-link')) {
                    showComicModal(championId);
                }
            }
        });
        
        comicModalClose.addEventListener('click', hideComicModal);
        comicModalBackdrop.addEventListener('click', (e) => { if (e.target === comicModalBackdrop) hideComicModal(); });

    } catch (error) {
        console.error("Error fetching calendar data:", error);
        showTimelineMessage('Failed to load calendar data. Please try again later.');
    }
}

function showTimelineMessage(message) {
    if (DOM.timelineContainer) {
        DOM.timelineContainer.innerHTML = `<p class="text-center text-blue-200 text-lg">${message}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('firebase-ready', () => {
        try {
            const app = getApp();
            db = getFirestore(app);
            const analytics = getAnalytics(app);
            initializeCalendar(analytics); 
        } catch (e) {
            console.error("Calendar: Firebase initialization failed.", e);
            showTimelineMessage("Could not connect to services.");
        }
    }, { once: true });
});
