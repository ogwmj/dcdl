/**
 * @file js/profile/discord-link.js
 * @description Handles the one-time linking of a Discord account via a URL token.
 */
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

const DOM = {
    profileContent: document.getElementById('profile-content'),
    authRequiredMessage: document.getElementById('auth-required-message'),
};

function showNotification(message, type) {
    const duration = 20000;
    const event = new CustomEvent('show-toast', { detail: { message, type, duration } });
    document.dispatchEvent(event);
}

/**
 * @function finalizeDiscordLink
 * @description Calls the Firebase Cloud Function to link the accounts.
 */
async function finalizeDiscordLink(token) {
    const auth = getAuth();

    onAuthStateChanged(auth, async (user) => {
        if (user && !user.isAnonymous) {
            try {
                const functions = getFunctions(getApp());
                const linkAccount = httpsCallable(functions, 'linkDiscordAccount');
                const result = await linkAccount({ token: token });

                if (result.data.success) {
                    showNotification('Account linked successfully! Reloading profile.', 'success');
                    setTimeout(() => {
                        window.history.replaceState({}, document.title, window.location.pathname);
                        window.location.reload();
                    }, 2000);
                } else {
                    throw new Error(result.data.error || 'An unknown error occurred.');
                }
            } catch (error) {
                console.error("Error linking Discord account:", error);
                const errorMessage = error.message || "The link may be invalid or expired. Please try again.";
                showNotification(`Error linking account: ${errorMessage}`, 'error');
            }
        } else {
            showNotification('You must be logged in to link your account.', 'info');
        }
    });
}

/**
 * @function handleUrlParameters
 * @description Checks for the auth_token and initiates the linking process.
 */
function handleUrlParameters() {
    const params = new URLSearchParams(window.location.search);
    const authToken = params.get('auth_token');
    
    if (authToken) {
        // A token is present, so we show the linking UI.
        if (DOM.profileContent) DOM.profileContent.classList.add('hidden');
        if (DOM.authRequiredMessage) DOM.authRequiredMessage.classList.add('hidden');
        
        finalizeDiscordLink(authToken);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // We need to wait for the main firebase auth to be ready.
    document.addEventListener('firebase-ready', () => {
        handleUrlParameters();
    }, { once: true });
});