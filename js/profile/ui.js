/**
 * @file js/profile/ui.js
 * @description Handles UI and logic for the user profile page, including username and password changes.
 */

import { getAuth, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getStorage, ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- DOM ELEMENT REFERENCES ---
const DOM = {
    profileContent: document.getElementById('profile-content'),
    authRequiredMessage: document.getElementById('auth-required-message'),
    passwordChangeContainer: document.getElementById('password-change-container'),
    nonEmailProviderMessage: document.getElementById('non-email-provider-message'),
    profileUpdateForm: document.getElementById('profile-update-form'),
    creatorUpdateForm: document.getElementById('creator-update-form'),
    usernameInput: document.getElementById('username-input'),
    userEmailDisplay: document.getElementById('user-email-display'),
    usernameDisplay: document.getElementById('username-display'),
    userRolesContainer: document.getElementById('user-roles-container'),
    currentPasswordInput: document.getElementById('current-password'),
    newPasswordInput: document.getElementById('new-password'),
    confirmPasswordInput: document.getElementById('confirm-password'),
    updateBtnText: document.getElementById('update-btn-text'),
    updateSpinner: document.getElementById('update-spinner'),
    accountTabsNav: document.getElementById('account-tabs-nav'),
    accountTabsContent: document.getElementById('account-tabs-content'),
    creatorLogoInput: document.getElementById('creator-logo-input'),
    creatorLogoPreview: document.getElementById('creator-logo-preview'),
    creatorDescriptionInput: document.getElementById('creator-description-input'),
    creatorYoutubeInput: document.getElementById('creator-youtube-input'),
    creatorTwitchInput: document.getElementById('creator-twitch-input'),
    creatorTiktokInput: document.getElementById('creator-tiktok-input'),
    creatorXInput: document.getElementById('creator-x-input'),
    creatorDiscordInput: document.getElementById('creator-discord-input'),
    creatorInstagramInput: document.getElementById('creator-instagram-input'),
    creatorUpdateBtnText: document.getElementById('creator-update-btn-text'),
    creatorUpdateSpinner: document.getElementById('creator-update-spinner'),
};

let auth, db, storage;
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
 * @function handleLogoSelection
 * @description Handles the file input change to read the image and generate a Base64 preview.
 */
function handleLogoSelection(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showNotification('Please select an image file (PNG, JPG, GIF).', 'error');
        event.target.value = ''; // Reset the input
        return;
    }
    if (file.size > 1 * 1024 * 1024) { // 1MB size limit
        showNotification('Image size must be less than 1MB.', 'error');
        event.target.value = ''; // Reset the input
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        DOM.creatorLogoPreview.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

/**
 * @function handleCreatorProfileUpdate
 * @description Handles submission for updating creator-specific information.
 */
async function handleCreatorProfileUpdate(e) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    DOM.creatorUpdateBtnText.classList.add('hidden');
    DOM.creatorUpdateSpinner.classList.remove('hidden');
    e.target.querySelector('button[type="submit"]').disabled = true;

    try {
        let logoUrl = DOM.creatorLogoPreview.src;
        const isNewLogo = logoUrl.startsWith('data:image');

        if (isNewLogo) {
            // A new logo was selected. Upload it to the *temporary* path to be moderated.
            const tempStoragePath = `temp_uploads/${user.uid}/logo.png`;
            const storageRef = ref(storage, tempStoragePath);
            const base64String = logoUrl.split(',')[1];
            
            await uploadString(storageRef, base64String, 'base64');
            // The Cloud Function will handle moving it and updating Firestore.
        }

        // Save the other text-based profile info immediately.
        const creatorProfileData = {
            description: DOM.creatorDescriptionInput.value.trim(),
            socials: {
                youtube: DOM.creatorYoutubeInput.value.trim(),
                twitch: DOM.creatorTwitchInput.value.trim(),
                tiktok: DOM.creatorTiktokInput.value.trim(),
                x: DOM.creatorXInput.value.trim(),
                discord: DOM.creatorDiscordInput.value.trim(),
                instagram: DOM.creatorInstagramInput.value.trim(),
            }
        };

        Object.keys(creatorProfileData.socials).forEach(key => {
            if (!creatorProfileData.socials[key]) delete creatorProfileData.socials[key];
        });

        const userProfileRef = doc(db, "artifacts", appId, "users", user.uid);
        // Note: We are NOT saving the logo URL here anymore.
        await setDoc(userProfileRef, { creatorProfile: creatorProfileData }, { merge: true });

        showNotification("Profile info saved! Your new logo is being processed and will appear shortly.", "success");

    } catch (error) {
        console.error("Creator profile update error:", error);
        showNotification("Failed to update creator profile.", "error");
    } finally {
        DOM.creatorUpdateBtnText.classList.remove('hidden');
        DOM.creatorUpdateSpinner.classList.add('hidden');
        e.target.querySelector('button[type="submit"]').disabled = false;
    }
}


/**
 * @function populateCreatorForm
 * @description Fills the creator form with data from Firestore.
 */
function populateCreatorForm(creatorProfile) {
    if (!creatorProfile) return;

    const placeholderSrc = 'https://via.placeholder.com/96';
    DOM.creatorLogoPreview.src = creatorProfile.logo || placeholderSrc;
    DOM.creatorDescriptionInput.value = creatorProfile.description || '';

    if (creatorProfile.socials) {
        DOM.creatorYoutubeInput.value = creatorProfile.socials.youtube || '';
        DOM.creatorTwitchInput.value = creatorProfile.socials.twitch || '';
        DOM.creatorTiktokInput.value = creatorProfile.socials.tiktok || '';
        DOM.creatorXInput.value = creatorProfile.socials.x || '';
        DOM.creatorDiscordInput.value = creatorProfile.socials.discord || '';
        DOM.creatorInstagramInput.value = creatorProfile.socials.instagram || '';
    }
}

/**
 * @function renderRoleBadges
 * @description Renders badges for the user's roles, or a default 'Member' badge.
 */
function renderRoleBadges(roles = []) {
    if (!DOM.userRolesContainer) return;
    DOM.userRolesContainer.innerHTML = ''; // Clear existing badges

    if (roles && roles.length > 0) {
        roles.forEach(role => {
            const badge = document.createElement('span');
            badge.className = `role-badge role-${role.toLowerCase()}`;
            badge.textContent = role;
            DOM.userRolesContainer.appendChild(badge);
        });
    } else {
        const badge = document.createElement('span');
        badge.className = 'role-badge role-member';
        badge.textContent = 'Member';
        DOM.userRolesContainer.appendChild(badge);
    }
}

/**
 * @function setupAccountTabs
 * @description Creates and manages the visibility of account management tabs based on user roles.
 */
function setupAccountTabs(roles = []) {
    if (!DOM.accountTabsNav || !DOM.accountTabsContent) return;

    const availableRoles = new Set(['Member', ...roles]);
    DOM.accountTabsNav.innerHTML = ''; 

    const allPanels = DOM.accountTabsContent.querySelectorAll('.tab-panel');

    availableRoles.forEach(role => {
        const panelId = `${role.toLowerCase()}-panel`;
        const panel = document.getElementById(panelId);
        
        if (panel) {
            const button = document.createElement('button');
            button.className = 'tab-button';
            button.textContent = role;
            button.dataset.targetPanel = panelId;
            DOM.accountTabsNav.appendChild(button);
        }
    });

    const tabButtons = DOM.accountTabsNav.querySelectorAll('.tab-button');

    DOM.accountTabsNav.addEventListener('click', (e) => {
        if (e.target.matches('.tab-button')) {
            const targetPanelId = e.target.dataset.targetPanel;
            
            tabButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');

            allPanels.forEach(panel => panel.classList.add('hidden'));

            const targetPanel = document.getElementById(targetPanelId);
            if (targetPanel) {
                targetPanel.classList.remove('hidden');
            }
        }
    });

    if (tabButtons.length > 0) {
        tabButtons[0].click();
    }
}

/**
 * @function setupPageForUser
 * @description Configures the page based on the user's authentication state and provider.
 */
async function setupPageForUser(user) {
    if (user && !user.isAnonymous) {
        DOM.authRequiredMessage.classList.add('hidden');
        DOM.profileContent.classList.remove('hidden');
        DOM.userEmailDisplay.textContent = user.email;

        try {
            const userProfileRef = doc(db, "artifacts", appId, "users", user.uid);
            const docSnap = await getDoc(userProfileRef);
            if (docSnap.exists() && docSnap.data()) {
                const userData = docSnap.data();
                const username = userData.username;
                DOM.usernameDisplay.textContent = username || "Not set";
                DOM.usernameInput.value = username || "";
                renderRoleBadges(userData.roles);
                setupAccountTabs(userData.roles);
                populateCreatorForm(userData.creatorProfile);
            } else {
                DOM.usernameDisplay.textContent = "Not set";
                renderRoleBadges([]);
                setupAccountTabs([]);
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
        DOM.profileContent.classList.add('hidden');
        DOM.authRequiredMessage.classList.remove('hidden');
        
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
            storage = getStorage(app); // Initialize Cloud Storage

            if (DOM.profileUpdateForm) {
                DOM.profileUpdateForm.addEventListener('submit', handleProfileUpdate);
            }
            if (DOM.creatorUpdateForm) {
                DOM.creatorUpdateForm.addEventListener('submit', handleCreatorProfileUpdate);
            }
            if (DOM.creatorLogoInput) {
                DOM.creatorLogoInput.addEventListener('change', handleLogoSelection);
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