/**
 * @file js/profile/ui.js
 * @description Handles UI and logic for the user profile page, including username and password changes.
 */

import { getAuth, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

// --- DOM ELEMENT REFERENCES ---
const DOM = {
    profileContent: document.getElementById('profile-content'),
    authRequiredMessage: document.getElementById('auth-required-message'),
    passwordChangeContainer: document.getElementById('password-change-container'),
    nonEmailProviderMessage: document.getElementById('non-email-provider-message'),
    profileUpdateForm: document.getElementById('profile-update-form'),
    usernameInput: document.getElementById('username-input'),
    userEmailDisplay: document.getElementById('user-email-display'),
    usernameDisplay: document.getElementById('username-display'),
    currentPasswordInput: document.getElementById('current-password'),
    newPasswordInput: document.getElementById('new-password'),
    confirmPasswordInput: document.getElementById('confirm-password'),
    updateBtnText: document.getElementById('update-btn-text'),
    updateSpinner: document.getElementById('update-spinner'),
};

let auth, db;
// The App ID is needed to construct the correct Firestore path.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'dc-dark-legion-builder';

/**
 * @function showNotification
 * @description A helper to dispatch toast notifications.
 */
function showNotification(message, type) {
    const event = new CustomEvent('show-toast', { detail: { message, type } });
    document.dispatchEvent(event);
}

/**
 * @function handleProfileUpdate
 * @description Handles submission for updating username and/or password.
 */
async function handleProfileUpdate(e) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    DOM.updateBtnText.classList.add('hidden');
    DOM.updateSpinner.classList.remove('hidden');
    e.target.querySelector('button[type="submit"]').disabled = true;

    const newUsername = DOM.usernameInput.value.trim();
    const currentPassword = DOM.currentPasswordInput.value;
    const newPassword = DOM.newPasswordInput.value;
    
    let usernameUpdated = false;
    let passwordUpdated = false;
    let errorOccurred = false;

    // Task 1: Update Username if it has changed
    if (newUsername && newUsername !== DOM.usernameDisplay.textContent) {
        try {
            const userProfileRef = doc(db, "artifacts", appId, "users", user.uid);
            await setDoc(userProfileRef, { username: newUsername }, { merge: true });
            DOM.usernameDisplay.textContent = newUsername;
            usernameUpdated = true;
        } catch (error) {
            console.error("Username update error:", error);
            showNotification("Failed to update username.", "error");
            errorOccurred = true;
        }
    }

    // Task 2: Update Password if password fields are filled
    if (newPassword && !errorOccurred) {
        const confirmPassword = DOM.confirmPasswordInput.value;
        if (!currentPassword) {
            showNotification("Please enter your current password to set a new one.", "error");
            errorOccurred = true;
        } else if (newPassword !== confirmPassword) {
            showNotification("New passwords do not match.", "error");
            errorOccurred = true;
        } else if (newPassword.length < 6) {
            showNotification("New password must be at least 6 characters long.", "error");
            errorOccurred = true;
        } else {
            try {
                const credential = EmailAuthProvider.credential(user.email, currentPassword);
                await reauthenticateWithCredential(user, credential);
                await updatePassword(user, newPassword);
                passwordUpdated = true;
            } catch (error) {
                console.error("Password update error:", error);
                let errorMessage = "Failed to update password. Please check your current password.";
                if (error.code === 'auth/wrong-password') errorMessage = "The current password you entered is incorrect.";
                showNotification(errorMessage, "error");
                errorOccurred = true;
            }
        }
    }
    
    // Final Notification Logic
    if (!errorOccurred) {
        if (usernameUpdated && passwordUpdated) {
            showNotification("Profile and password updated successfully!", "success");
            DOM.profileUpdateForm.reset();
            DOM.usernameInput.value = newUsername;
        } else if (usernameUpdated) {
            showNotification("Username updated successfully!", "success");
        } else if (passwordUpdated) {
            showNotification("Password updated successfully!", "success");
            DOM.profileUpdateForm.reset();
            DOM.usernameInput.value = newUsername;
        } else {
            showNotification("No changes were made.", "info");
        }
    }

    // Reset UI state
    DOM.updateBtnText.classList.remove('hidden');
    DOM.updateSpinner.classList.add('hidden');
    e.target.querySelector('button[type="submit"]').disabled = false;
}

/**
 * @function setupPageForUser
 * @description Configures the page based on the user's authentication state and provider.
 * This version specifically blocks anonymous users.
 */
async function setupPageForUser(user) {
    // Check if user exists AND is not anonymous.
    if (user && !user.isAnonymous) {
        DOM.authRequiredMessage.classList.add('hidden');
        DOM.profileContent.classList.remove('hidden');
        DOM.userEmailDisplay.textContent = user.email;

        try {
            const userProfileRef = doc(db, "artifacts", appId, "users", user.uid);
            const docSnap = await getDoc(userProfileRef);
            if (docSnap.exists() && docSnap.data().username) {
                const username = docSnap.data().username;
                DOM.usernameDisplay.textContent = username;
                DOM.usernameInput.value = username;
            } else {
                DOM.usernameDisplay.textContent = "Not set";
            }
        } catch (error) {
            console.error("Error fetching user profile:", error);
            DOM.usernameDisplay.textContent = "Could not load";
        }

        const isEmailProvider = user.providerData.some(p => p.providerId === EmailAuthProvider.PROVIDER_ID);
        if (isEmailProvider) {
            DOM.passwordChangeContainer.parentElement.classList.remove('hidden');
            DOM.nonEmailProviderMessage.classList.add('hidden');
        } else {
            DOM.passwordChangeContainer.parentElement.classList.add('hidden');
            DOM.nonEmailProviderMessage.classList.remove('hidden');
        }
    } else {
        // User is either logged out or is anonymous.
        DOM.profileContent.classList.add('hidden');
        DOM.authRequiredMessage.classList.remove('hidden');
        
        // Customize message based on whether user is anonymous or just logged out.
        const messageElement = DOM.authRequiredMessage.querySelector('p');
        if (user && user.isAnonymous) {
            messageElement.textContent = "A full account is required to access this page. Please log in or sign up.";
        } else {
            messageElement.textContent = "Please log in to view your profile.";
        }
    }
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('firebase-ready', () => {
        try {
            const app = getApp();
            auth = getAuth(app);
            db = getFirestore(app);

            if (DOM.profileUpdateForm) {
                DOM.profileUpdateForm.addEventListener('submit', handleProfileUpdate);
            } else {
                console.error("Profile update form not found on the page.");
            }
    
            onAuthStateChanged(auth, (user) => {
                setupPageForUser(user);
            });
            
        } catch (e) {
            console.error("Profile Page: Firebase initialization failed.", e);
            if(DOM.authRequiredMessage) {
                DOM.authRequiredMessage.textContent = "Could not connect to authentication service.";
                DOM.authRequiredMessage.classList.remove('hidden');
            }
        }
    }, { once: true });
});
