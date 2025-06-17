/**
 * @file js/calendar/ui.js
 * @description Fetches and renders the Limited Mythic champion rotation calendar dynamically from Firestore.
 * Highlights the current rotation and displays investment recommendations.
 * @version 1.1.0
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

// --- HELPER FUNCTIONS ---

/**
 * Creates the HTML for a single star rating recommendation with a tooltip.
 * @param {string} label - The label for the recommendation (e.g., "F2P").
 * @param {string} recValue - The recommendation string (e.g., "Gold 4-Star", "skip", "not set").
 * @returns {string} The complete HTML for the recommendation block.
 */
function createRecommendationHtml(label, recValue) {
    const lowerRecValue = (recValue || '').toLowerCase();
    let recommendationContentHtml = '';
    let tooltipText = '';

    // Define tooltip texts based on the label
    if (label === 'F2P') {
        tooltipText = 'This recommendation is if you are a light-to-non spender in the game, and how high you should take the champion in rank as a stopping point.';
    } else if (label === 'Min') {
        tooltipText = 'If you pull for this champion, this is the base level you should take them to. Anything less would not be a viable champion.';
    }

    // Generate the main content for the recommendation block based on its value
    if (lowerRecValue === '' || lowerRecValue === 'not set') {
        recommendationContentHtml = `
            <span class="recommendation-label">${label}</span>
            <span class="recommendation-skip">Not Set Yet</span>
        `;
    } else if (lowerRecValue === 'skip') {
        recommendationContentHtml = `
            <span class="recommendation-label">${label}</span>
            <span class="recommendation-skip">Not Recommended</span>
        `;
    } else if (label === 'F2P' && recValue === 'Red 5-Star') {
        recommendationContentHtml = `
            <span class="recommendation-label">${label}</span>
            <div class="recommendation-rainbow-stars">
                <span class="star-icon tier-white active">★</span>
                <span class="star-icon tier-blue active">★</span>
                <span class="star-icon tier-purple active">★</span>
                <span class="star-icon tier-gold active">★</span>
                <span class="star-icon tier-red active">★</span>
            </div>
        `;
    } else {
        const parts = recValue.split(' ');
        // Return nothing if the format is invalid to prevent errors
        if (parts.length < 2) return '';

        const tier = parts[0].toLowerCase();
        const stars = parseInt(parts[1].charAt(0), 10);

        let starsHtml = '';
        for (let i = 0; i < 5; i++) {
            starsHtml += `<span class="star-icon ${i < stars ? 'active' : ''}">★</span>`;
        }
        recommendationContentHtml = `
            <span class="recommendation-label">${label}</span>
            <div class="recommendation-stars tier-${tier}">${starsHtml}</div>
        `;
    }

    // Combine the content and the tooltip into the final HTML structure
    return `
        <div class="recommendation-block">
            ${recommendationContentHtml}
            <div class="tooltip-text">${tooltipText}</div>
        </div>
    `;
}


// --- CORE FUNCTIONS ---

/**
 * Creates the week-cycle schedule from the master list of champions.
 * @returns {Array<Object>} A list of event objects with calculated week cycles.
 */
function createSchedule() {
    return sortedChampionsList.map((champion, i) => ({
        ...champion,
        startWeek: (i * 2) + 1,
        endWeek: ((i * 2) + 1) + 3,
    }));
}

/**
 * Renders the timeline, highlighting events and applying the staggered layout.
 * @param {Array<Object>} schedule - The schedule array created by createSchedule.
 * @param {number} currentWeek - The calculated current week of the rotation.
 */
function renderTimeline(schedule, currentWeek) {
    if (!DOM.timelineContainer) return;
    
    let timelineHtml = '';
    schedule.forEach((event, index) => {
        const side = index % 2 === 0 ? 'left' : 'right';
        let statusClass = 'is-upcoming';
        
        if (currentWeek >= event.startWeek && currentWeek <= event.endWeek) {
            statusClass = 'is-active';
        } else if (currentWeek > event.endWeek) {
            statusClass = 'is-past';
        }

        let recommendationsHtml = '';
        if (event.id !== 'TBA') {
            recommendationsHtml = `
                <div class="recommendations-container">
                    ${createRecommendationHtml('F2P', event.recF2P)}
                    ${createRecommendationHtml('Min', event.recMin)}
                </div>
            `;
        }

        timelineHtml += `
            <div id="event-${index}" class="timeline-event ${side} ${statusClass}" role="button" tabindex="0">
                <div class="timeline-content">
                    <div class="timeline-main-info">
                        <img src="${event.avatar}" alt="${event.name}" class="timeline-avatar" onerror="this.src='img/champions/avatars/dc_logo.webp'">
                        <div class="timeline-text-content">
                             <h3>${event.name}</h3>
                             <p class="date-range">Weeks ${event.startWeek} &ndash; ${event.endWeek}</p>
                             <span class="duration-tag">4 Week Cycle</span>
                        </div>
                    </div>
                    ${recommendationsHtml}
                </div>
            </div>
        `;
    });
    DOM.timelineContainer.innerHTML = timelineHtml;
    
    positionTimelineEvents();
}

/**
 * Positions the timeline events using absolute positioning for the staggered layout.
 */
function positionTimelineEvents() {
    if (window.innerWidth < 769) {
        DOM.timelineContainer.style.height = '';
        const events = DOM.timelineContainer.querySelectorAll('.timeline-event');
        events.forEach(event => {
            event.style.top = '';
        });
        return; 
    }

    const events = DOM.timelineContainer.querySelectorAll('.timeline-event');
    if (events.length === 0) return;

    const cardHeight = 230; 
    const verticalMargin = 10;
    const stepHeight = (cardHeight / 2) + (verticalMargin / 2);

    let totalHeight = 0;

    events.forEach((event, index) => {
        const topPosition = index * stepHeight;
        event.style.top = `${topPosition}px`;
        totalHeight = topPosition + cardHeight;
    });

    DOM.timelineContainer.style.height = `${totalHeight}px`;
}


/**
 * Fetches data and initializes the calendar page.
 * @param {object} analytics - The Firebase Analytics instance.
 */
async function initializeCalendar(analytics) {
    showTimelineMessage('Loading calendar data...');
    try {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'dc-dark-legion-builder';
        const dataPrefix = `artifacts/${appId}/public/data`;
        const championsRef = collection(db, `${dataPrefix}/champions`);
        const rotationConfigRef = doc(db, `${dataPrefix}/siteConfig/championRotation`);

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
                recF2P: champ.recommendationF2P,
                recMin: champ.recommendationMin
            });
        });

        const rotationOrder = rotationConfigSnap.exists() ? rotationConfigSnap.data().order : [];
        if (rotationOrder && rotationOrder.length > 0) {
            sortedChampionsList = rotationOrder.map(id => {
                if (id === 'TBA') return { id: 'TBA', name: 'To Be Announced', avatar: 'img/champions/avatars/dc_logo.webp' };
                return championsMap.get(id);
            }).filter(Boolean);
        } else {
            sortedChampionsList = [...championsMap.values()].sort((a, b) => a.name.localeCompare(b.name));
        }

        const schedule = createSchedule();

        const rotationStartDate = new Date("2025-06-09T00:00:00Z");
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        const weeksSinceStart = Math.floor((Date.now() - rotationStartDate.getTime()) / msPerWeek);
        const currentWeek = weeksSinceStart + 1;

        renderTimeline(schedule, currentWeek);

        if (analytics) {
            logEvent(analytics, 'page_view', {
                page_title: 'Bleed Calendar',
                page_location: window.location.href,
                page_path: window.location.pathname
            });
        }

        DOM.timelineContainer.addEventListener('click', (e) => {
            const eventElement = e.target.closest('.timeline-event');
            if (eventElement) {
                const navElement = document.querySelector('nav');
                const navHeight = navElement ? navElement.offsetHeight : 0;
                const elementPosition = eventElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.scrollY - navHeight - 16;
                window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
            }
        });

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

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('firebase-ready', () => {
        try {
            const app = getApp();
            db = getFirestore(app);
            const analytics = getAnalytics(app);
            initializeCalendar(analytics); 
            window.addEventListener('resize', positionTimelineEvents); 
        } catch (e) {
            console.error("Calendar: Firebase initialization failed.", e);
            showTimelineMessage("Could not connect to services.");
        }
    }, { once: true });
});