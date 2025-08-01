/**
 * @file js/profile/discord-link.js
 * @description Handles the one-time linking of a Discord account via a URL token.
 */
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

const DOM = {
    linkingContainer: document.getElementById('discord-linking-container'),
    linkingStatusText: document.getElementById('discord-linking-status'),
    profileContent: document.getElementById('profile-content'),
    authRequiredMessage: document.getElementById('auth-required-message'),
};

function showNotification(message, type) {
    console.log('showNotification');
    const event = new CustomEvent('show-toast', { detail: { message, type } });
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
                    DOM.linkingStatusText.textContent = '✅ Success! Your Discord account has been linked. This page will now reload.';
                    showNotification('Account linked successfully!', 'success');
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
                DOM.linkingStatusText.innerHTML = `❌ Error: Could not link account.<br><span class="text-sm text-slate-400">${errorMessage}</span>`;
                showNotification(`Error linking account: ${errorMessage}`, 'error');
            }
        } else {
            DOM.linkingStatusText.innerHTML = 'Please log in to the website first, then click the link from Discord again.';
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
        if (DOM.linkingContainer) DOM.linkingContainer.classList.remove('hidden');
        
        finalizeDiscordLink(authToken);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // We need to wait for the main firebase auth to be ready.
    document.addEventListener('firebase-ready', () => {
        handleUrlParameters();
    }, { once: true });
});