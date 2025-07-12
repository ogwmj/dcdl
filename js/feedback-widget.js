import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const WIDGET_TEMPLATE = `
<style>
    /* Import Google Font directly into the Shadow DOM */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

    :host {
        all: initial; /* Resets everything to initial values */
    }
    
    #feedback-widget-container {
        position: fixed;
        bottom: 100px;
        right: 20px;
        z-index: 8888;
        font-family: 'Inter', sans-serif;
    }

    #feedback-toggle-button {
        background-color: #3b82f6;
        color: white;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        border: none;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        box-shadow: 0 5px 15px rgba(59, 130, 246, 0.4);
        transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
        z-index: 1;
    }

    #feedback-toggle-button:hover {
        transform: scale(1.1);
        box-shadow: 0 8px 25px rgba(59, 130, 246, 0.5);
    }

    #feedback-toggle-button .icon {
        width: 28px;
        height: 28px;
        transition: opacity 0.3s ease, transform 0.3s ease;
        position: absolute;
    }
    
    #feedback-icon-close {
        opacity: 0;
        transform: rotate(-90deg);
    }

    #feedback-form-container {
        position: absolute;
        bottom: 85px;
        right: 0;
        width: 350px;
        max-width: calc(100vw - 40px);
        background-color: rgba(17, 24, 39, 0.9);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(59, 130, 246, 0.4);
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        padding: 24px;
        color: #e2e8f0;
        opacity: 0;
        visibility: hidden;
        transform: translateY(20px) scale(0.95);
        transform-origin: bottom right;
        transition: opacity 0.3s ease, transform 0.3s ease, visibility 0.3s;
    }

    /* State for when the form is open */
    #feedback-widget-container.is-open #feedback-form-container {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
    }

    #feedback-widget-container.is-open #feedback-icon-open {
       opacity: 0;
       transform: rotate(90deg);
    }
    
    #feedback-widget-container.is-open #feedback-icon-close {
       opacity: 1;
       transform: rotate(0deg);
    }

    h3 {
        font-size: 1.5rem;
        font-weight: 700;
        color: #bfdbfe;
        margin-top: 0;
        margin-bottom: 1.5rem;
        text-align: center;
    }

    .feedback-form-group {
        margin-bottom: 1rem;
    }

    label {
        display: block;
        margin-bottom: 0.5rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: #94a3b8;
    }

    input, select, textarea {
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

    input:focus, select:focus, textarea:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
    }

    textarea {
        resize: vertical;
    }

    button {
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
    }

    button:hover {
        background-color: #2563eb;
    }
    
    button:disabled {
        background-color: #1e3a8a;
        cursor: not-allowed;
        opacity: 0.7;
    }

    #feedback-thank-you {
        text-align: center;
        padding: 2rem 1rem;
    }
    
    #feedback-thank-you p {
        margin-top: 0.5rem;
        color: #d1d5db;
    }

    #feedback-error-message {
        background-color: #4a0404;
        color: #fecaca;
        padding: 0.75rem;
        border-radius: 6px;
        text-align: center;
        font-size: 0.9rem;
        margin-top: 1rem;
        display: none;
    }
</style>
<div id="feedback-widget-container">
    <div id="feedback-form-container">
        <form id="feedback-form" novalidate>
            <h3>Provide Feedback</h3>
            <div id="feedback-fields">
                <div class="feedback-form-group">
                    <label for="feedback-type">Feedback Type</label>
                    <select id="feedback-type" name="type" required>
                        <option value="" disabled selected>Select an option...</option>
                        <option value="suggestion">Suggestion / Feature Request</option>
                        <option value="bug">Bug Report</option>
                        <option value="ui_ux">UI/UX Comment</option>
                        <option value="creator_submission">Become a Creator</option>
                        <option value="general">General Feedback</option>
                    </select>
                </div>
                <div class="feedback-form-group">
                    <label for="feedback-message">Message</label>
                    <textarea id="feedback-message" name="message" rows="4" required placeholder="Tell us what you think..."></textarea>
                </div>
                <div class="feedback-form-group">
                    <label for="feedback-discord">Discord Name (Optional)</label>
                    <input type="text" id="feedback-discord" name="discord" placeholder="So we can DM if needed">
                </div>
                <button type="submit" id="feedback-submit-btn">Submit Feedback</button>
                <div id="feedback-error-message"></div>
            </div>
            <div id="feedback-thank-you" style="display: none;">
                <h3>Thank You!</h3>
                <p>Your feedback is valuable to us.</p>
            </div>
        </form>
    </div>
    <button id="feedback-toggle-button" aria-label="Toggle feedback form">
        <svg id="feedback-icon-open" class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
        </svg>
        <svg id="feedback-icon-close" class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
    </button>
</div>
`;

class FeedbackWidget extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = WIDGET_TEMPLATE;
        
        this.firebaseConfig = {
            apiKey: "AIzaSyAzSQbS4LtAz20syWI2HREPR7UnYh6ldbI",
            authDomain: "dc-dark-legion-tools.firebaseapp.com",
            projectId: "dc-dark-legion-tools",
            storageBucket: "dc-dark-legion-tools.firebasestorage.app",
            messagingSenderId: "786517074225",
            appId: "1:786517074225:web:9f14dc4dcae0705fcfd010",
            measurementId: "G-FTF00DHGV6"
        };
        
        this.db = null;
        this.auth = null;
    }

    connectedCallback() {
        document.addEventListener('firebase-ready', () => {
            this.initFirebase();
        }, { once: true });

        this.elements = this.getElements();
        this.attachEventListeners();
        document.addEventListener('open-creator-application', () => this.openForCreatorApplication());
    }

    openForCreatorApplication() {
        const feedbackTypeSelect = this.shadowRoot.getElementById('feedback-type');
        if (feedbackTypeSelect) {
            feedbackTypeSelect.value = 'creator_submission';
        }

        if (!this.elements.container.classList.contains('is-open')) {
            this.toggleForm();
        }
    }

    initFirebase() {
        try {
            const app = getApp(); 
            this.db = getFirestore(app);
            this.auth = getAuth(app);
        } catch (e) {
            console.error("Feedback Widget: Firebase initialization failed.", e);
        }
    }
    
    getElements() {
        const sRoot = this.shadowRoot;
        return {
            container: sRoot.getElementById('feedback-widget-container'),
            toggleButton: sRoot.getElementById('feedback-toggle-button'),
            form: sRoot.getElementById('feedback-form'),
            submitButton: sRoot.getElementById('feedback-submit-btn'),
            feedbackFields: sRoot.getElementById('feedback-fields'),
            thankYouMessage: sRoot.getElementById('feedback-thank-you'),
            errorMessage: sRoot.getElementById('feedback-error-message'),
        };
    }

    attachEventListeners() {
        this.elements.toggleButton.addEventListener('click', () => this.toggleForm());
        this.elements.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    toggleForm() {
        this.elements.container.classList.toggle('is-open');
    }

    displayError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorMessage.style.display = 'block';
    }

    hideError() {
        this.elements.errorMessage.style.display = 'none';
    }

    async handleSubmit(e) {
        e.preventDefault();
        this.hideError();

        const formData = new FormData(this.elements.form);
        const type = formData.get('type');
        const message = formData.get('message').trim();

        if (!type || !message) {
            let errorMessages = [];
            if (!type) {
                errorMessages.push("Feedback type is required.");
            }
            if (!message) {
                errorMessages.push("Message is required.");
            }
            this.displayError(errorMessages.join(' '));
            return;
        }

        if (!this.db || !this.auth.currentUser) {
            this.displayError('Feedback service not connected.');
            return;
        }

        this.elements.submitButton.disabled = true;
        this.elements.submitButton.textContent = 'Submitting...';

        const feedbackData = {
            type: type,
            message: message,
            discordName: formData.get('discord') || '',
            url: window.location.href,
            userAgent: navigator.userAgent,
            userId: this.auth.currentUser.uid,
            createdAt: serverTimestamp(),
        };

        try {
            await addDoc(collection(this.db, "feedback"), feedbackData);
            this.showSuccess();
        } catch (error) {
            console.error("Error adding document to Firestore: ", error);
            this.displayError('Failed to submit feedback.');
            this.elements.submitButton.disabled = false;
            this.elements.submitButton.textContent = 'Submit Feedback';
        }
    }

    showSuccess() {
        this.elements.feedbackFields.style.display = 'none';
        this.elements.thankYouMessage.style.display = 'block';

        setTimeout(() => {
            this.toggleForm();
            setTimeout(() => {
                this.elements.form.reset();
                this.elements.feedbackFields.style.display = 'block';
                this.elements.thankYouMessage.style.display = 'none';
                this.elements.submitButton.disabled = false;
                this.elements.submitButton.textContent = 'Submit Feedback';
            }, 400); 
        }, 3000);
    }
}

customElements.define('feedback-widget', FeedbackWidget);
