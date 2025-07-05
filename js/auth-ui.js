import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    setPersistence,
    browserLocalPersistence,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const AUTH_TEMPLATE = `
<style>
    /* Import Google Font */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

    :host {
        all: initial; /* Reset host element styles */
        font-family: 'Inter', sans-serif;
    }

    /* Modal styles */
    #auth-modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: rgba(10, 10, 20, 0.6);
        z-index: 9998;
        display: flex;
        justify-content: center;
        align-items: center;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.3s ease, visibility 0.3s ease;
    }

    #auth-modal-backdrop.is-open {
        opacity: 1;
        visibility: visible;
    }

    #auth-form-container {
        width: 380px;
        max-width: calc(100vw - 40px);
        background-color: rgba(17, 24, 39, 0.9);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(59, 130, 246, 0.4);
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        padding: 28px;
        color: #e2e8f0;
        transform: scale(0.95);
        transition: transform 0.3s ease;
    }
    
    #auth-modal-backdrop.is-open #auth-form-container {
        transform: scale(1);
    }

    h3 {
        font-size: 1.6rem;
        font-weight: 700;
        color: #bfdbfe;
        margin-top: 0;
        margin-bottom: 1.5rem;
        text-align: center;
    }
    
    .form-group {
        margin-bottom: 1.2rem;
    }

    label {
        display: block;
        margin-bottom: 0.5rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: #94a3b8;
    }

    input {
        width: 100%;
        background-color: #0d1226;
        border: 1px solid rgba(59, 130, 246, 0.3);
        color: #e2e8f0;
        padding: 0.75rem;
        border-radius: 8px;
        font-size: 1rem;
        font-family: 'Inter', sans-serif;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
        box-sizing: border-box;
    }

    input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
    }
    
    button[type="submit"] {
        width: 100%;
        background-color: #3b82f6;
        color: white;
        padding: 0.8rem 1.5rem;
        border-radius: 8px;
        font-weight: 700;
        border: none;
        cursor: pointer;
        transition: background-color 0.2s ease;
        font-family: 'Inter', sans-serif;
        margin-top: 1rem;
    }

    button[type="submit"]:hover {
        background-color: #2563eb;
    }
    
    button[type="submit"]:disabled {
        background-color: #1e3a8a;
        cursor: not-allowed;
    }

    #auth-error-message, #auth-success-message {
        padding: 0.75rem;
        border-radius: 6px;
        text-align: center;
        font-size: 0.9rem;
        margin-top: 1.5rem;
        display: none;
    }

    #auth-error-message {
        background-color: #4a0404;
        color: #fecaca;
    }

    #auth-success-message {
        background-color: #052e16;
        color: #bbf7d0;
    }
    
    .switch-form-link {
        color: #94a3b8;
        text-decoration: none;
        text-align: center;
        display: block;
        margin-top: 1.5rem;
        font-size: 0.9rem;
    }

    .switch-form-link:hover {
        color: #bfdbfe;
        text-decoration: underline;
    }

    #close-modal-btn {
        position: absolute;
        top: 15px;
        right: 15px;
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 1.5rem;
        cursor: pointer;
        line-height: 1;
    }
    #close-modal-btn:hover {
        color: #e2e8f0;
    }

    .hidden {
        display: none;
    }
</style>

<div id="auth-modal-backdrop">
    <div id="auth-form-container">
        <button id="close-modal-btn" aria-label="Close authentication form">&times;</button>
        
        <form id="login-form">
            <h3>Login</h3>
            <div class="form-group">
                <label for="login-email">Email</label>
                <input type="email" id="login-email" name="email" required>
            </div>
            <div class="form-group">
                <label for="login-password">Password</label>
                <input type="password" id="login-password" name="password" required>
            </div>
            <button type="submit" id="login-submit-btn">Login</button>
            <a href="#" id="goto-reset" class="switch-form-link" style="margin-top: 1rem; margin-bottom: -1rem;">Forgot Password?</a>
            <a href="#" id="goto-signup" class="switch-form-link">Need an account? Sign Up</a>
        </form>

        <form id="signup-form" class="hidden">
            <h3>Create Account</h3>
            <div class="form-group">
                <label for="signup-email">Email</label>
                <input type="email" id="signup-email" name="email" required>
            </div>
            <div class="form-group">
                <label for="signup-password">Password</label>
                <input type="password" id="signup-password" name="password" required>
            </div>
            <button type="submit" id="signup-submit-btn">Sign Up</button>
            <a href="#" id="goto-login" class="switch-form-link">Already have an account? Login</a>
        </form>
        
        <form id="reset-form" class="hidden">
            <h3>Reset Password</h3>
            <div class="form-group">
                <label for="reset-email">Email</label>
                <input type="email" id="reset-email" name="email" required placeholder="Enter your account email">
            </div>
            <button type="submit" id="reset-submit-btn">Send Reset Link</button>
            <a href="#" id="goto-login-from-reset" class="switch-form-link">Back to Login</a>
        </form>

        <div id="auth-error-message"></div>
        <div id="auth-success-message"></div>
    </div>
</div>
`;

class AuthUI extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = AUTH_TEMPLATE;

        this.firebaseConfig = {
            apiKey: "AIzaSyAzSQbS4LtAz20syWI2HREPR7UnYh6ldbI",
            authDomain: "dc-dark-legion-tools.firebaseapp.com",
            projectId: "dc-dark-legion-tools",
            storageBucket: "dc-dark-legion-tools.firebasestorage.app",
            messagingSenderId: "786517074225",
            appId: "1:786517074225:web:9f14dc4dcae0705fcfd010",
            measurementId: "G-FTF00DHGV6"
        };

        this.auth = null;
        this.statusContainerId = this.getAttribute('status-container-id');
    }

    connectedCallback() {
        if (!this.statusContainerId) {
            console.error('AuthUI component requires a "status-container-id" attribute.');
            return;
        }
        this._getElements();
        this.initFirebase();
        this._attachEventListeners();
    }

    initFirebase() {
        try {
            const app = getApps().length === 0 ? initializeApp(this.firebaseConfig) : getApp();
            this.auth = getAuth(app);

            setPersistence(this.auth, browserLocalPersistence)
                .then(() => {
                    onAuthStateChanged(this.auth, user => this._updateAuthState(user));
                    document.dispatchEvent(new CustomEvent('firebase-ready'));
                    window.firebaseReady = true;
                })
                .catch(error => {
                    console.error("Auth persistence error:", error);
                });

        } catch (e) {
            console.error("Auth UI: Firebase initialization failed.", e);
            const container = document.getElementById(this.statusContainerId);
            if (container) {
                container.innerHTML = `<span style="color: #fecaca;">Auth Failed</span>`;
            }
        }
    }

    _getElements() {
        const sRoot = this.shadowRoot;
        this.elements = {
            modalBackdrop: sRoot.getElementById('auth-modal-backdrop'),
            closeModalBtn: sRoot.getElementById('close-modal-btn'),
            
            loginForm: sRoot.getElementById('login-form'),
            signupForm: sRoot.getElementById('signup-form'),
            resetForm: sRoot.getElementById('reset-form'),
            
            loginSubmitBtn: sRoot.getElementById('login-submit-btn'),
            signupSubmitBtn: sRoot.getElementById('signup-submit-btn'),
            resetSubmitBtn: sRoot.getElementById('reset-submit-btn'),

            gotoSignupLink: sRoot.getElementById('goto-signup'),
            gotoLoginLink: sRoot.getElementById('goto-login'),
            gotoResetLink: sRoot.getElementById('goto-reset'),
            gotoLoginFromResetLink: sRoot.getElementById('goto-login-from-reset'),

            errorMessage: sRoot.getElementById('auth-error-message'),
            successMessage: sRoot.getElementById('auth-success-message'),
        };
        this.statusContainer = document.getElementById(this.statusContainerId);
    }

    _attachEventListeners() {
        if (this.statusContainer) {
            this.statusContainer.addEventListener('click', (e) => {
                if (e.target && e.target.id === 'logout-btn') this._handleLogout();
                if (e.target && e.target.id === 'login-btn') this.openModal();
            });
        }

        this.elements.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.elements.modalBackdrop.addEventListener('click', (e) => {
            if (e.target === this.elements.modalBackdrop) this.closeModal();
        });

        this.elements.loginForm.addEventListener('submit', (e) => this._handleLogin(e));
        this.elements.signupForm.addEventListener('submit', (e) => this._handleSignup(e));
        this.elements.resetForm.addEventListener('submit', (e) => this._handlePasswordReset(e));

        this.elements.gotoSignupLink.addEventListener('click', (e) => { e.preventDefault(); this._showView('signup'); });
        this.elements.gotoLoginLink.addEventListener('click', (e) => { e.preventDefault(); this._showView('login'); });
        this.elements.gotoResetLink.addEventListener('click', (e) => { e.preventDefault(); this._showView('reset'); });
        this.elements.gotoLoginFromResetLink.addEventListener('click', (e) => { e.preventDefault(); this._showView('login'); });
    }

    _updateAuthState(user) {
        if (!this.statusContainer) return;

        if (user) {
            this.statusContainer.innerHTML = `
                <div class="flex items-center space-x-4">
                    <button id="logout-btn" class="text-gray-300 hover:bg-slate-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Logout</button>
                </div>
            `;
            this.closeModal();
        } else {
            this.statusContainer.innerHTML = `
                <button id="login-btn" class="text-gray-300 hover:bg-slate-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Login / Sign Up</button>
            `;
        }
    }

    async _handleLogin(e) {
        e.preventDefault();
        this._showMessage(); // Clear messages
        this.elements.loginSubmitBtn.disabled = true;

        const email = this.elements.loginForm.email.value;
        const password = this.elements.loginForm.password.value;

        try {
            await signInWithEmailAndPassword(this.auth, email, password);
        } catch (error) {
            this._showMessage(this._getFriendlyErrorMessage(error.code), 'error');
        } finally {
            this.elements.loginSubmitBtn.disabled = false;
        }
    }

    async _handleSignup(e) {
        e.preventDefault();
        this._showMessage(); // Clear messages
        this.elements.signupSubmitBtn.disabled = true;

        const email = this.elements.signupForm.email.value;
        const password = this.elements.signupForm.password.value;

        try {
            await createUserWithEmailAndPassword(this.auth, email, password);
        } catch (error) {
            this._showMessage(this._getFriendlyErrorMessage(error.code), 'error');
        } finally {
            this.elements.signupSubmitBtn.disabled = false;
        }
    }
    
    async _handlePasswordReset(e) {
        e.preventDefault();
        this._showMessage(); // Clear messages
        this.elements.resetSubmitBtn.disabled = true;

        const email = this.elements.resetForm.email.value;
        
        try {
            await sendPasswordResetEmail(this.auth, email);
            this._showMessage("Password reset link sent! Please check your email inbox.", 'success');
            this.elements.resetForm.reset();
        } catch (error) {
            this._showMessage(this._getFriendlyErrorMessage(error.code), 'error');
        } finally {
            this.elements.resetSubmitBtn.disabled = false;
        }
    }

    async _handleLogout() {
        try {
            await signOut(this.auth);
        } catch (error) {
            console.error("Logout failed:", error);
            // This error is less critical to show in the main UI, but could be dispatched to a notification center
        }
    }

    _showView(viewToShow) {
        this.elements.loginForm.classList.add('hidden');
        this.elements.signupForm.classList.add('hidden');
        this.elements.resetForm.classList.add('hidden');
        this._showMessage(); // Hide all messages

        const viewMap = {
            login: this.elements.loginForm,
            signup: this.elements.signupForm,
            reset: this.elements.resetForm,
        };

        if (viewMap[viewToShow]) {
            viewMap[viewToShow].classList.remove('hidden');
        }
    }
    
    _showMessage(message = '', type = 'error') {
        const errorEl = this.elements.errorMessage;
        const successEl = this.elements.successMessage;

        // Hide both first
        errorEl.style.display = 'none';
        errorEl.textContent = '';
        successEl.style.display = 'none';
        successEl.textContent = '';

        if (message) {
            if (type === 'error') {
                errorEl.textContent = message;
                errorEl.style.display = 'block';
            } else if (type === 'success') {
                successEl.textContent = message;
                successEl.style.display = 'block';
            }
        }
    }

    _getFriendlyErrorMessage(errorCode) {
        switch (errorCode) {
            case 'auth/invalid-email': return 'Please enter a valid email address.';
            case 'auth/user-not-found': return 'No account found with this email.';
            case 'auth/wrong-password': return 'Invalid credentials. Please check your email and password.';
            case 'auth/email-already-in-use': return 'An account with this email already exists.';
            case 'auth/weak-password': return 'Password should be at least 6 characters long.';
            default: return 'An unexpected error occurred. Please try again.';
        }
    }

    openModal() {
        this._showView('login'); // Default to login view when opening
        this.elements.modalBackdrop.classList.add('is-open');
    }

    closeModal() {
        this.elements.modalBackdrop.classList.remove('is-open');
        this._showMessage(); // Clear any lingering messages
    }
}

customElements.define('auth-ui', AuthUI);