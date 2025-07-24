/**
 * @file js/bot/ui.js
 * @fileoverview Handles UI interactions, event listeners, and data flow
 * @version 1.0.0
 */

import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

// #region --- DATA & STATE ---

let analytics;

// #region --- DOM ELEMENT REFERENCES ---

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('firebase-ready', async () => {
        try {
            const app = getApp();
            analytics = getAnalytics(app);
            
            logEvent(analytics, 'page_view', {
                page_title: document.title,
                page_location: location.href,
                page_path: location.pathname
            });
        } catch(e) {
            console.error("Firebase could not be initialized in bot-ui:", e);
        }
    }, { once: true });
});