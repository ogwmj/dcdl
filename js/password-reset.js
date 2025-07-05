import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    verifyPasswordResetCode,
    confirmPasswordReset
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    // Firebase configuration
    const firebaseConfig = {
        apiKey: "AIzaSyAzSQbS4LtAz20syWI2HREPR7UnYh6ldbI",
        authDomain: "dc-dark-legion-tools.firebaseapp.com",
        projectId: "dc-dark-legion-tools",
        storageBucket: "dc-dark-legion-tools.firebasestorage.app",
        messagingSenderId: "786517074225",
        appId: "1:786517074225:web:9f14dc4dcae0705fcfd010",
        measurementId: "G-FTF00DHGV6"
    };

    // DOM Elements
    const views = {
        verifying: document.getElementById('verifying-view'),
        resetForm: document.getElementById('reset-form'),
        message: document.getElementById('message-view')
    };
    const userEmailEl = document.getElementById('user-email');
    const resetSubmitBtn = document.getElementById('reset-submit-btn');
    const newPasswordEl = document.getElementById('new-password');
    const confirmPasswordEl = document.getElementById('confirm-password');
    const messageArea = document.getElementById('message-area');
    const messageTitle = document.getElementById('message-title');
    const actionLink = document.getElementById('action-link');

    let auth;
    let oobCode = null;

    /**
     * Shows a specific view and hides others.
     * @param {string} viewName - The name of the view to show ('verifying', 'resetForm', 'message').
     */
    const showView = (viewName) => {
        Object.keys(views).forEach(key => {
            views[key].classList.add('hidden');
        });
        if (views[viewName]) {
            views[viewName].classList.remove('hidden');
        }
    };

    /**
     * Displays a success or error message to the user.
     * @param {string} title - The title for the message view.
     * @param {string} message - The message content.
     * @param {'success'|'error'} type - The type of message.
     * @param {string} linkText - The text for the action link.
     */
    const showMessage = (title, message, type, linkText) => {
        messageTitle.textContent = title;
        messageArea.textContent = message;
        messageArea.className = type; // 'success' or 'error'
        messageArea.style.display = 'block';
        actionLink.textContent = linkText;
        showView('message');
    };

    /**
     * Initializes Firebase and starts the password reset process.
     */
    const init = () => {
        try {
            const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
            auth = getAuth(app);
            
            // Get the out-of-band code from the URL.
            const params = new URLSearchParams(window.location.search);
            oobCode = params.get('oobCode');

            if (!oobCode) {
                showMessage(
                    'Invalid Link', 
                    'The password reset link is missing or invalid. Please request a new one.', 
                    'error',
                    'Request a new reset link'
                );
                return;
            }

            // Verify the code.
            handleVerifyCode(oobCode);

        } catch (e) {
            console.error("Firebase initialization failed:", e);
            showMessage('System Error', 'Could not connect to authentication services. Please try again later.', 'error', 'Return to Homepage');
        }
    };

    /**
     * Verifies the password reset code with Firebase.
     * @param {string} code - The out-of-band code from the URL.
     */
    const handleVerifyCode = async (code) => {
        try {
            const email = await verifyPasswordResetCode(auth, code);
            userEmailEl.textContent = email;
            showView('resetForm');
        } catch (error) {
            console.error("Error verifying reset code:", error);
            showMessage(
                'Link Expired or Invalid', 
                'This password reset link is either invalid or has expired. Please request a new one.', 
                'error',
                'Request a new reset link'
            );
        }
    };

    /**
     * Handles the submission of the new password form.
     * @param {Event} e - The form submission event.
     */
    const handlePasswordReset = async (e) => {
        e.preventDefault();
        messageArea.style.display = 'none'; // Hide previous messages

        const newPassword = newPasswordEl.value;
        const confirmPassword = confirmPasswordEl.value;

        if (newPassword.length < 6) {
            alert('Password must be at least 6 characters long.');
            return;
        }

        if (newPassword !== confirmPassword) {
            alert('Passwords do not match.');
            return;
        }

        resetSubmitBtn.disabled = true;
        resetSubmitBtn.textContent = 'Saving...';

        try {
            await confirmPasswordReset(auth, oobCode, newPassword);
            showMessage(
                'Success!', 
                'Your password has been changed successfully.', 
                'success',
                'Proceed to Login'
            );
        } catch (error) {
            console.error("Error confirming password reset:", error);
            showMessage(
                'Error', 
                'Could not reset password. The link may have expired. Please try again.', 
                'error',
                'Request a new reset link'
            );
        } finally {
            resetSubmitBtn.disabled = false;
            resetSubmitBtn.textContent = 'Save New Password';
        }
    };

    // Attach event listener to the form
    views.resetForm.addEventListener('submit', handlePasswordReset);

    // Start the process
    init();
});
