import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    setPersistence,
    browserLocalPersistence
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

    #auth-error-message {
        background-color: #4a0404;
        color: #fecaca;
        padding: 0.75rem;
        border-radius: 6px;
        text-align: center;
        font-size: 0.9rem;
        margin-top: 1.5rem;
        display: none; /* Hidden by default */
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
        
        <div id="auth-error-message"></div>
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
        // NEW: Get the ID of the container from the component's attribute
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
            // REMOVED: statusContainer is no longer in the shadow DOM
            modalBackdrop: sRoot.getElementById('auth-modal-backdrop'),
            closeModalBtn: sRoot.getElementById('close-modal-btn'),
            loginForm: sRoot.getElementById('login-form'),
            signupForm: sRoot.getElementById('signup-form'),
            loginSubmitBtn: sRoot.getElementById('login-submit-btn'),
            signupSubmitBtn: sRoot.getElementById('signup-submit-btn'),
            gotoSignupLink: sRoot.getElementById('goto-signup'),
            gotoLoginLink: sRoot.getElementById('goto-login'),
            errorMessage: sRoot.getElementById('auth-error-message'),
        };
        // NEW: Get a reference to the external container on the main page
        this.statusContainer = document.getElementById(this.statusContainerId);
    }

    _attachEventListeners() {
        // NEW: Attach listener to the external container
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

        this.elements.gotoSignupLink.addEventListener('click', (e) => {
            e.preventDefault();
            this._toggleForms();
        });
        this.elements.gotoLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            this._toggleForms();
        });
    }

    _updateAuthState(user) {
        if (!this.statusContainer) return;

        if (user) {
            // User is signed in.
            // Generate HTML with Tailwind classes that match your other nav items.
            // We use flex to keep the email and logout button on the same line for desktop.
            this.statusContainer.innerHTML = `
                <div class="flex items-center space-x-4">
                    <button id="logout-btn" class="text-gray-300 hover:bg-slate-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Logout</button>
                </div>
            `;
            this.closeModal();
        } else {
            // User is signed out.
            // This button gets the same classes as your other nav links.
            this.statusContainer.innerHTML = `
                <button id="login-btn" class="text-gray-300 hover:bg-slate-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Login / Sign Up</button>
            `;
        }
    }

    // ... The rest of the functions (_handleLogin, _handleSignup, _handleLogout, etc.) remain unchanged ...
    async _handleLogin(e) {
        e.preventDefault();
        this._showError('', false);
        this.elements.loginSubmitBtn.disabled = true;

        const email = this.elements.loginForm.email.value;
        const password = this.elements.loginForm.password.value;

        try {
            await signInWithEmailAndPassword(this.auth, email, password);
        } catch (error) {
            this._showError(this._getFriendlyErrorMessage(error.code));
        } finally {
            this.elements.loginSubmitBtn.disabled = false;
        }
    }

    async _handleSignup(e) {
        e.preventDefault();
        this._showError('', false);
        this.elements.signupSubmitBtn.disabled = true;

        const email = this.elements.signupForm.email.value;
        const password = this.elements.signupForm.password.value;

        try {
            await createUserWithEmailAndPassword(this.auth, email, password);
        } catch (error) {
            this._showError(this._getFriendlyErrorMessage(error.code));
        } finally {
            this.elements.signupSubmitBtn.disabled = false;
        }
    }

    async _handleLogout() {
        try {
            await signOut(this.auth);
        } catch (error) {
            console.error("Logout failed:", error);
            this._showError("Could not log out. Please try again.");
        }
    }

    _toggleForms() {
        this.elements.loginForm.classList.toggle('hidden');
        this.elements.signupForm.classList.toggle('hidden');
        this._showError('', false);
    }

    _showError(message, show = true) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorMessage.style.display = show ? 'block' : 'none';
    }

    _getFriendlyErrorMessage(errorCode) {
        switch (errorCode) {
            case 'auth/invalid-email': return 'Please enter a valid email address.';
            case 'auth/user-not-found':
            case 'auth/wrong-password': return 'Invalid credentials. Please check your email and password.';
            case 'auth/email-already-in-use': return 'An account with this email already exists.';
            case 'auth/weak-password': return 'Password should be at least 6 characters long.';
            default: return 'An unexpected error occurred. Please try again.';
        }
    }

    openModal() {
        this.elements.modalBackdrop.classList.add('is-open');
    }

    closeModal() {
        this.elements.modalBackdrop.classList.remove('is-open');
        this._showError('', false);
    }
}

customElements.define('auth-ui', AuthUI);
