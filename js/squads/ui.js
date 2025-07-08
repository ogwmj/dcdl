/**
 * @file js/squads/ui.js
 * @description Handles UI interactions and analytics for the squad page.
 */

// Import Firebase functions
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

let analytics;

/**
 * @function getSquadNameFromDOM
 * @description Retrieves the squad name from a data attribute on the main element.
 * @returns {string} The name of the squad or a default value.
 */
function getSquadNameFromDOM() {
    const mainElement = document.querySelector('main[data-squad-name]');
    return mainElement ? mainElement.dataset.squadName : "Unknown Squad";
}

/**
 * @function initializeAnalytics
 * @description Initializes Firebase Analytics and logs the initial page view.
 */
function initializeAnalytics() {
    try {
        const app = getApp();
        analytics = getAnalytics(app);

        // Log the initial page view event
        logEvent(analytics, 'page_view', {
            page_title: document.title,
            page_location: location.href,
            page_path: location.pathname,
            squad_name: getSquadNameFromDOM()
        });

    } catch (e) {
        console.error("Firebase Analytics initialization failed on Squad page:", e);
    }
}

/**
 * @function setupSkillTabs
 * @description Sets up the click listeners for the interactive skill tabs.
 */
function setupSkillTabs() {
    const skillContainers = document.querySelectorAll('.skill-tabs-container');
    const squadName = getSquadNameFromDOM();
    
    skillContainers.forEach(container => {
        const championCard = container.closest('.champion-role-card');
        if (!championCard) return;

        const championName = championCard.querySelector('.champion-role-title').innerText.split(':').pop().trim();
        const tabs = container.querySelectorAll('.skill-tab-btn');
        const contents = container.querySelectorAll('.skill-tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Deactivate all tabs and content within this specific container
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));

                // Activate the clicked tab and its corresponding content
                tab.classList.add('active');
                const skillId = tab.dataset.skill;
                const contentToShow = container.querySelector(`#${skillId}`);
                if (contentToShow) {
                    contentToShow.classList.add('active');
                }

                // Log the custom event to Analytics if it has been initialized
                if (analytics) {
                    logEvent(analytics, 'select_skill_tab', {
                        squad_name: squadName,
                        champion_name: championName,
                        skill_name: tab.innerText.trim()
                    });
                }
            });
        });
    });
}

// --- INITIALIZATION ---

// Set up the UI interactions as soon as the DOM is ready.
document.addEventListener('DOMContentLoaded', setupSkillTabs);

// Wait for the `firebase-ready` event from auth-ui.js before initializing analytics.
document.addEventListener('firebase-ready', initializeAnalytics, { once: true });
