/**
 * @file js/profile/ui.js
 * @description Handles UI and logic for the user profile page, including the embedded auth form.
 */

import { getAuth, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getStorage, ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- DOM ELEMENT REFERENCES ---
const DOM = {
    profileContent: document.getElementById('profile-content'),
    // --- EMBEDDED AUTH FORM ELEMENTS ---
    embeddedAuthContainer: document.getElementById('embedded-auth-container'),
    authTabs: document.getElementById('auth-tabs'),
    embeddedLoginForm: document.getElementById('embedded-login-form'),
    embeddedRegisterForm: document.getElementById('embedded-register-form'),
    authErrorMessage: document.getElementById('auth-error-message'),
    forgotPasswordLink: document.getElementById('forgot-password-link'),
    // --- EXISTING PROFILE ELEMENTS ---
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
    ingameNameInput: document.getElementById('ingame-name-input'),
    earthIdInput: document.getElementById('earth-id-input'),
    allowDiscordMessagesInput: document.getElementById('allow-discord-messages-input'),
};

let auth, db, storage;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'dc-dark-legion-builder';

function showNotification(message, type) {
    const event = new CustomEvent('show-toast', { detail: { message, type } });
    document.dispatchEvent(event);
}

// --- EMBEDDED AUTH LOGIC ---
function handleAuthError(error) {
    let message = 'An unknown error occurred.';
    switch (error.code) {
        case 'auth/invalid-email': message = 'Please enter a valid email address.'; break;
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
        case 'auth/wrong-password': message = 'Invalid email or password.'; break;
        case 'auth/email-already-in-use': message = 'An account with this email already exists.'; break;
        case 'auth/weak-password': message = 'Password must be at least 6 characters long.'; break;
        default: console.error("Authentication error:", error);
    }
    DOM.authErrorMessage.textContent = message;
}

async function handleEmbeddedLogin(e) {
    e.preventDefault();
    DOM.authErrorMessage.textContent = '';
    const email = DOM.embeddedLoginForm.querySelector('#embedded-login-email').value;
    const password = DOM.embeddedLoginForm.querySelector('#embedded-login-password').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        handleAuthError(error);
    }
}

async function handleEmbeddedRegister(e) {
    e.preventDefault();
    DOM.authErrorMessage.textContent = '';
    const email = DOM.embeddedRegisterForm.querySelector('#embedded-register-email').value;
    const password = DOM.embeddedRegisterForm.querySelector('#embedded-register-password').value;
    const confirmPassword = DOM.embeddedRegisterForm.querySelector('#embedded-register-confirm-password').value;

    if (password !== confirmPassword) {
        DOM.authErrorMessage.textContent = "Passwords do not match.";
        return;
    }
    try {
        await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
        handleAuthError(error);
    }
}

async function handleForgotPassword() {
    DOM.authErrorMessage.textContent = '';
    const email = DOM.embeddedLoginForm.querySelector('#embedded-login-email').value;
    if (!email) {
        DOM.authErrorMessage.textContent = "Please enter your email address above to reset your password.";
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        showNotification(`Password reset email sent to ${email}.`, "success");
    } catch (error) {
        handleAuthError(error);
    }
}

// --- ORIGINAL PROFILE LOGIC ---
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

    const gameProfileData = {
        inGameName: DOM.ingameNameInput.value.trim(),
        earthId: DOM.earthIdInput.value ? parseInt(DOM.earthIdInput.value, 10) : null,
        allowDiscordMessages: DOM.allowDiscordMessagesInput.checked,
    };
    
    let usernameUpdated = false;
    let passwordUpdated = false;
    let gameProfileUpdated = false;
    let errorOccurred = false;

    const profileDataToUpdate = {};

    if (newUsername && newUsername !== DOM.usernameInput.dataset.initialValue) {
        profileDataToUpdate.username = newUsername;
        usernameUpdated = true;
    }

    const initialGameProfile = JSON.parse(DOM.profileUpdateForm.dataset.initialGameProfile || '{}');
    if (JSON.stringify(gameProfileData) !== JSON.stringify(initialGameProfile)) {
        profileDataToUpdate.gameProfile = gameProfileData;
        gameProfileUpdated = true;
    }

    if (Object.keys(profileDataToUpdate).length > 0) {
        try {
            const userProfileRef = doc(db, "artifacts", appId, "users", user.uid);
            await setDoc(userProfileRef, profileDataToUpdate, { merge: true });
            if (usernameUpdated) DOM.usernameInput.dataset.initialValue = newUsername;
            if (gameProfileUpdated) DOM.profileUpdateForm.dataset.initialGameProfile = JSON.stringify(gameProfileData);
        } catch (error) {
            console.error("Profile data update error:", error);
            showNotification("Failed to update profile data.", "error");
            errorOccurred = true;
        }
    }

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
    
    if (!errorOccurred) {
        const updatedItems = [
            usernameUpdated ? 'Username' : null,
            gameProfileUpdated ? 'Game Details' : null,
            passwordUpdated ? 'Password' : null,
        ].filter(Boolean);

        if (updatedItems.length > 0) {
            showNotification(`${updatedItems.join(' & ')} updated successfully!`, "success");
            if (passwordUpdated) DOM.profileUpdateForm.reset();
            DOM.usernameInput.value = DOM.usernameInput.dataset.initialValue;
            const currentGameProfile = JSON.parse(DOM.profileUpdateForm.dataset.initialGameProfile);
            DOM.ingameNameInput.value = currentGameProfile.inGameName || '';
            DOM.earthIdInput.value = currentGameProfile.earthId || '';
            DOM.allowDiscordMessagesInput.checked = currentGameProfile.allowDiscordMessages || false;
        } else {
            showNotification("No changes were made.", "info");
        }
    }

    DOM.updateBtnText.classList.remove('hidden');
    DOM.updateSpinner.classList.add('hidden');
    e.target.querySelector('button[type="submit"]').disabled = false;
}

function handleLogoSelection(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showNotification('Please select an image file (PNG, JPG, GIF).', 'error');
        event.target.value = '';
        return;
    }
    if (file.size > 1 * 1024 * 1024) {
        showNotification('Image size must be less than 1MB.', 'error');
        event.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => { DOM.creatorLogoPreview.src = e.target.result; };
    reader.readAsDataURL(file);
}

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
            const tempStoragePath = `temp_uploads/${user.uid}/logo.png`;
            const storageRef = ref(storage, tempStoragePath);
            const base64String = logoUrl.split(',')[1];
            await uploadString(storageRef, base64String, 'base64');
        }

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

function renderRoleBadges(roles = []) {
    if (!DOM.userRolesContainer) return;
    DOM.userRolesContainer.innerHTML = '';

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
            if (targetPanel) targetPanel.classList.remove('hidden');
        }
    });
    if (tabButtons.length > 0) tabButtons[0].click();
}

/**
 * @function setupPageForUser
 * @description Configures the page based on the user's authentication state.
 */
async function setupPageForUser(user) {
    if (user && !user.isAnonymous) {
        // --- LOGGED-IN STATE ---
        DOM.embeddedAuthContainer.classList.add('hidden');
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
                DOM.usernameInput.dataset.initialValue = username || "";
                renderRoleBadges(userData.roles);
                setupAccountTabs(userData.roles);
                populateCreatorForm(userData.creatorProfile);
                const gameProfile = userData.gameProfile || {};
                DOM.ingameNameInput.value = gameProfile.inGameName || '';
                DOM.earthIdInput.value = gameProfile.earthId || '';
                DOM.allowDiscordMessagesInput.checked = gameProfile.allowDiscordMessages === true;
                DOM.profileUpdateForm.dataset.initialGameProfile = JSON.stringify(gameProfile);
            } else {
                DOM.usernameDisplay.textContent = "Not set";
                DOM.usernameInput.dataset.initialValue = "";
                DOM.profileUpdateForm.dataset.initialGameProfile = JSON.stringify({});
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
        // --- LOGGED-OUT STATE ---
        DOM.profileContent.classList.add('hidden');
        DOM.embeddedAuthContainer.classList.remove('hidden');
    }
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('firebase-ready', () => {
        try {
            const app = getApp();
            auth = getAuth(app);
            db = getFirestore(app);
            storage = getStorage(app);

            // --- EMBEDDED AUTH EVENT LISTENERS ---
            DOM.embeddedLoginForm.addEventListener('submit', handleEmbeddedLogin);
            DOM.embeddedRegisterForm.addEventListener('submit', handleEmbeddedRegister);
            DOM.forgotPasswordLink.addEventListener('click', (e) => {
                e.preventDefault();
                handleForgotPassword();
            });
            DOM.authTabs.addEventListener('click', (e) => {
                if (e.target.matches('[data-auth-tab]')) {
                    DOM.authErrorMessage.textContent = '';
                    const targetTab = e.target.dataset.authTab;
                    DOM.authTabs.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                    e.target.classList.add('active');
                    if (targetTab === 'login') {
                        DOM.embeddedLoginForm.classList.remove('hidden');
                        DOM.embeddedRegisterForm.classList.add('hidden');
                    } else {
                        DOM.embeddedLoginForm.classList.add('hidden');
                        DOM.embeddedRegisterForm.classList.remove('hidden');
                    }
                }
            });

            // --- PROFILE FORM EVENT LISTENERS ---
            if (DOM.profileUpdateForm) DOM.profileUpdateForm.addEventListener('submit', handleProfileUpdate);
            if (DOM.creatorUpdateForm) DOM.creatorUpdateForm.addEventListener('submit', handleCreatorProfileUpdate);
            if (DOM.creatorLogoInput) DOM.creatorLogoInput.addEventListener('change', handleLogoSelection);
    
            onAuthStateChanged(auth, (user) => {
                setupPageForUser(user);
            });
            
        } catch (e) {
            console.error("Profile Page: Firebase initialization failed.", e);
        }
    }, { once: true });
});