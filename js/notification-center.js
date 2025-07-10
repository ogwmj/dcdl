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
            max-width: 380px;
            pointer-events: none;
        }
        .notification-container {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        .notification-banner {
            color: white;
            padding: 1rem;
            border-radius: 0.5rem;
            box-shadow: 0 5px 15px rgba(0,0,0,0.4);
            border: 1px solid rgba(255, 255, 255, 0.1);
            font-weight: 600;
            -webkit-backdrop-filter: blur(5px);
            backdrop-filter: blur(5px);
            pointer-events: auto;
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            opacity: 0;
            transform: translateX(calc(100% + 20px));
            animation: slideIn 0.4s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
        .notification-banner.removing {
            animation: slideOut 0.4s ease-in forwards;
        }
        .message {
            margin-right: 1rem;
            line-height: 1.5;
        }
        .notification-banner.success { background-color: rgba(16, 185, 129, 0.9); }
        .notification-banner.error { background-color: rgba(239, 68, 68, 0.9); }
        .notification-banner.info { background-color: rgba(59, 130, 246, 0.9); }
        .notification-banner.warning { background-color: rgba(245, 158, 11, 0.9); }
        
        .close-btn {
            flex-shrink: 0;
            padding: 0.25rem;
            border-radius: 9999px;
            border: none;
            background-color: transparent;
            cursor: pointer;
            font-size: 1.25rem;
            line-height: 1;
            color: rgba(255, 255, 255, 0.7);
        }
        .close-btn:hover {
            color: #fff;
            background-color: rgba(0,0,0,0.2);
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
                top: auto;
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

        document.addEventListener('show-toast', (e) => {
            const { message, type, duration } = e.detail;
            this.displayTemporaryNotification(message, type, duration);
        });
        document.addEventListener('show-notification', (e) => {
            const { message, type, duration } = e.detail;
            this.displayTemporaryNotification(message, type, duration);
        });
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

        this.removeNotificationElement(notifElement);
        
        try {
            const dismissalRef = doc(this.db, `notifications/${notificationId}/dismissals`, this.userId);
            await setDoc(dismissalRef, { dismissedAt: serverTimestamp() });
        } catch (error) {
            console.error("Error dismissing notification: ", error);
        }
    }

    displayTemporaryNotification(message, type = 'info', duration = 3000) {
        const container = this.shadowRoot.querySelector('.notification-container');
        const notifElement = document.createElement('div');
        const tempId = `temp-notif-${Date.now()}`;

        notifElement.id = tempId;
        notifElement.className = `notification-banner ${type}`;
        notifElement.innerHTML = `<p class="message">${message}</p><button class="close-btn" title="Dismiss">&times;</button>`;
        
        notifElement.querySelector('.close-btn').addEventListener('click', () => {
            this.removeNotificationElement(notifElement);
        });

        container.appendChild(notifElement);

        setTimeout(() => {
            const elToRemove = this.shadowRoot.getElementById(tempId);
            if (elToRemove) {
                this.removeNotificationElement(elToRemove);
            }
        }, duration);
    }

    removeNotificationElement(element) {
        if (!element) return;
        
        element.classList.add('removing');
        element.addEventListener('animationend', () => {
            element.remove();
        });
    }

    clearNotifications() {
        const container = this.shadowRoot.querySelector('.notification-container');
        container.innerHTML = '';
    }
}

customElements.define('notification-center', NotificationCenter);
