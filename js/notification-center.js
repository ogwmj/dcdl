import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, getDoc, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const template = document.createElement('template');
template.innerHTML = `
    <style>
        :host {
            position: fixed;
            top: 1.5rem;
            right: 1.5rem;
            z-index: 1000;
            width: 100%;
            max-width: 420px;
            pointer-events: none;
        }
        .notification-container {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        .notification-banner {
            padding: 1rem;
            border-radius: 0.75rem;
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            background-color: #ffffff;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            border: 1px solid #e2e8f0;
            pointer-events: auto;
            opacity: 0;
            transform: translateX(100%);
            animation: slideIn 0.4s ease-out forwards;
        }
        .notification-banner.removing {
            animation: slideOut 0.4s ease-in forwards;
        }
        .message {
            font-weight: 500;
            line-height: 1.5;
            color: #374151;
            margin-right: 1rem;
        }
        .notification-banner.info .message { color: #4338ca; }
        .notification-banner.success .message { color: #166534; }
        .notification-banner.warning .message { color: #b45309; }
        .close-btn {
            flex-shrink: 0;
            padding: 0.25rem;
            border-radius: 9999px;
            border: none;
            background-color: transparent;
            cursor: pointer;
            font-size: 1.25rem;
            line-height: 1;
            color: #6b7280;
        }
        .close-btn:hover {
            color: #111827;
            background-color: rgba(0,0,0,0.05);
        }
        @keyframes slideIn {
            to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideOut {
            from { opacity: 1; transform: translateX(0); }
            to { opacity: 0; transform: translateX(100%); }
        }
        @media (max-width: 768px) {
            :host {
                left: 1rem;
                right: 1rem;
                bottom: 1rem;
                max-width: calc(100% - 2rem);
            }
        }
    </style>
    <div class="notification-container"></div>
`;

class NotificationCenter extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.appendChild(template.content.cloneNode(true));
        this.db = null;
        this.auth = null;
        this.userId = null;
    }

    connectedCallback() {
        document.addEventListener('firebase-ready', () => {
            const app = getApp();
            this.db = getFirestore(app);
            this.auth = getAuth(app);
            this.initializeAuthObserver();
        }, { once: true });
    }

    initializeAuthObserver() {
        onAuthStateChanged(this.auth, (user) => {
            if (user) {
                this.userId = user.uid;
                this.fetchAndDisplayNotifications();
            } else {
                this.userId = null;
                this.clearNotifications();
            }
        });
    }

async fetchAndDisplayNotifications() {
        if (!this.userId || !this.db) return;
        this.clearNotifications();

        const targetedQuery = query(collection(this.db, 'notifications'),
            where("targetUserId", "==", this.userId),
            where("isActive", "==", true)
        );

        const publicQuery = query(collection(this.db, 'notifications'),
            where("isPublic", "==", true),
            where("isActive", "==", true)
        );

        const [targetedSnapshot, publicSnapshot] = await Promise.all([
            getDocs(targetedQuery),
            getDocs(publicQuery)
        ]);

        const allNotifications = new Map();
        targetedSnapshot.forEach(doc => allNotifications.set(doc.id, { id: doc.id, ...doc.data() }));
        publicSnapshot.forEach(doc => allNotifications.set(doc.id, { id: doc.id, ...doc.data() }));

        for (const notification of allNotifications.values()) {
            const dismissalRef = doc(this.db, `notifications/${notification.id}/dismissals`, this.userId);
            const dismissalSnap = await getDoc(dismissalRef);

            if (!dismissalSnap.exists()) {
                this.displayNotification(notification);
            }
        }
    }

    displayNotification(notification) {
        const container = this.shadowRoot.querySelector('.notification-container');
        const notifElement = document.createElement('div');
        notifElement.id = `notification-${notification.id}`;
        notifElement.className = 'notification-banner';
        if (notification.type) {
            notifElement.classList.add(notification.type);
        }

        notifElement.innerHTML = `<p class="message">${notification.message}</p><button class="close-btn" title="Dismiss">&times;</button>`;
        notifElement.querySelector('.close-btn').addEventListener('click', () => {
            this.dismissNotification(notification.id);
        });

        container.appendChild(notifElement);
    }

    async dismissNotification(notificationId) {
        if (!this.userId || !this.db) return;
        
        const notifElement = this.shadowRoot.getElementById(`notification-${notificationId}`);
        if (!notifElement) return;

        // Add class to trigger removal animation
        notifElement.classList.add('removing');
        
        // Wait for animation to finish before removing from DOM
        notifElement.addEventListener('animationend', () => {
            notifElement.remove();
        });
        
        // Asynchronously update Firestore in the background
        try {
            const dismissalRef = doc(this.db, `notifications/${notificationId}/dismissals`, this.userId);
            await setDoc(dismissalRef, { dismissedAt: serverTimestamp() });
        } catch (error) {
            console.error("Error dismissing notification: ", error);
        }
    }

    clearNotifications() {
        const container = this.shadowRoot.querySelector('.notification-container');
        container.innerHTML = '';
    }
}

customElements.define('notification-center', NotificationCenter);