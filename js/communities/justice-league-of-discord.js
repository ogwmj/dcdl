/**
 * @file /js/communities/justice-league-of-discord.js
 * @fileoverview Core logic for all the JLoD features.
 * @version 1.0.0
 */

import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs, deleteDoc, query, orderBy, limit, addDoc, serverTimestamp, setDoc, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// --- Global Variables ---
let db, auth, functions;
let currentUserId = null;
let isCurrentUserMember = false;
let communityAdminUid = null;
let ALL_CHAMPIONS_DATA = {};
let ALL_LEGACY_PIECES_DATA = {};
let currentUserRoles = [];
let currentUsername = null;
let LATEST_TIER_LISTS = {};

const COMMUNITY_ID = "justice-league-of-discord";

const CLASS_GROUPS = {
    GROUP_1: { name: 'Physical', classes: ['Warrior', 'Guardian'], icons: ['/img/classes/Warrior.png', '/img/classes/Guardian.png'] },
    GROUP_2: { name: 'Damage', classes: ['Firepower', 'Magical', 'Assassin'], icons: ['/img/classes/Firepower.png', '/img/classes/Magical.png', '/img/classes/Assassin.png'] },
    GROUP_3: { name: 'Support', classes: ['Supporter', 'Intimidator'], icons: ['/img/classes/Supporter.png', '/img/classes/Intimidator.png'] }
};

// --- DOM Elements ---
const DOM = {
    header: document.getElementById('community-header'),
    name: document.getElementById('community-name'),
    description: document.getElementById('community-description'),
    banner: document.querySelector('.community-banner'),
    memberList: document.getElementById('member-list'),
    adminPanel: document.getElementById('admin-panel'),
    addMemberForm: document.getElementById('add-member-form'),
    memberEmailInput: document.getElementById('member-email'),
    tierListContainer: document.getElementById('tier-list-container'),
    createTierListBtn: document.getElementById('create-tierlist-btn'),
    createLegacyTierListBtn: document.getElementById('create-legacy-tierlist-btn'),
    forumContainer: document.getElementById('forum-container'),
    createPostBtn: document.getElementById('create-post-btn'),
    teamContainer: document.getElementById('team-container'),
    createTeamBtn: document.getElementById('create-team-btn'),
    mainView: document.getElementById('main-view'),
    postView: document.getElementById('post-view'),
    teamView: document.getElementById('team-view'),
    tierListModal: {
        backdrop: document.getElementById('tierlist-modal-backdrop'),
        closeBtn: document.getElementById('tierlist-modal-close'),
        cancelBtn: document.getElementById('tierlist-modal-cancel'),
        saveBtn: document.getElementById('tierlist-modal-save'),
        titleInput: document.getElementById('tierlist-title-input'),
        tiersContainer: document.getElementById('tierlist-editor-tiers'),
        championPool: document.getElementById('tierlist-editor-champion-pool'),
    },
    teamBuilderModal: {
        backdrop: document.getElementById('team-builder-modal-backdrop'),
        closeBtn: document.getElementById('team-builder-modal-close'),
        cancelBtn: document.getElementById('team-builder-modal-cancel'),
        saveBtn: document.getElementById('team-builder-modal-save'),
        nameInput: document.getElementById('team-name-input'),
        descriptionTextarea: document.getElementById('team-description-textarea'),
        slots: document.querySelectorAll('.team-slot'),
        championPool: document.getElementById('team-builder-champion-pool'),
    },
    postModal: {
        backdrop: document.getElementById('post-modal-backdrop'),
        closeBtn: document.getElementById('post-modal-close'),
        cancelBtn: document.getElementById('post-modal-cancel'),
        saveBtn: document.getElementById('post-modal-save'),
        form: document.getElementById('post-form'),
        titleInput: document.getElementById('post-title-input'),
        championSelect: document.getElementById('post-champion-select'),
        bodyTextarea: document.getElementById('post-body-textarea'),
    }
};

// --- Confirmation Modal ---
const confirmationModal = {
    backdrop: document.getElementById('confirmation-modal-backdrop'),
    title: document.getElementById('confirmation-modal-title'),
    text: document.getElementById('confirmation-modal-text'),
    confirmBtn: document.getElementById('confirmation-modal-confirm-btn'),
    cancelBtn: document.getElementById('confirmation-modal-cancel-btn'),
    _resolve: null,

    show(text, title = 'Confirm Action') {
        if (!this.backdrop) return Promise.resolve(window.confirm(text)); // Fallback
        this.title.textContent = title;
        this.text.textContent = text;
        this.backdrop.classList.remove('hidden');
        return new Promise(resolve => {
            this._resolve = resolve;
        });
    },

    hide(result) {
        if (!this.backdrop) return;
        this.backdrop.classList.add('hidden');
        if (this._resolve) {
            this._resolve(result);
            this._resolve = null;
        }
    }
};


// --- Helper Functions ---
function dispatchNotification(message, type = 'info', duration = 3000) {
    const event = new CustomEvent('show-notification', {
        detail: { message, type, duration },
        bubbles: true,
        composed: true
    });
    document.dispatchEvent(event);
}

// --- TinyMCE & Sanitization ---
function initTinyMCE(selector) {
    tinymce.init({
        selector: selector,
        plugins: 'lists link image emoticons',
        toolbar: 'undo redo | bold italic underline | bullist numlist | link emoticons',
        menubar: false,
        skin: 'oxide-dark',
        content_css: 'dark',
        height: 300,
        setup: function(editor) {
            editor.on('change', () => editor.save());
        }
    });
}

function getSanitizedEditorContent(editorId) {
    const editor = tinymce.get(editorId);
    if (editor) {
        const rawContent = editor.getContent();
        return DOMPurify.sanitize(rawContent);
    }
    return '';
}

/**
 * Fetches champion data from the main codex for image lookups.
 */
async function cacheAllChampionsData() {
    if (Object.keys(ALL_CHAMPIONS_DATA).length > 0) return;
    try {
        const championsRef = collection(db, 'artifacts/dc-dark-legion-builder/public/data/champions');
        const snapshot = await getDocs(championsRef);
        snapshot.forEach(doc => {
            ALL_CHAMPIONS_DATA[doc.id] = doc.data();
        });
    } catch (error) {
        console.error("Error caching champion data:", error);
    }
}

/**
 * Fetches legacy piece data from Firestore and parses class strings.
 */
async function cacheAllLegacyPiecesData() {
    if (Object.keys(ALL_LEGACY_PIECES_DATA).length > 0) return;
    try {
        const legacyPiecesRef = collection(db, 'artifacts/dc-dark-legion-builder/public/data/legacyPieces');
        const snapshot = await getDocs(legacyPiecesRef);
        snapshot.forEach(doc => {
            const data = doc.data();
            // Parse the comma-delimited string of classes into an array
            if (data.class && typeof data.class === 'string') {
                data.classes = data.class.split(',').map(c => c.trim());
            } else {
                data.classes = [];
            }
            ALL_LEGACY_PIECES_DATA[doc.id] = data;
        });
    } catch (error) {
        console.error("Error caching legacy piece data:", error);
    }
}


/**
 * Fetches the current user's profile data (roles and username).
 */
async function fetchUserProfile(uid) {
    if (!uid) {
        currentUserRoles = [];
        currentUsername = null;
        return;
    }
    try {
        const userDocRef = doc(db, 'artifacts/dc-dark-legion-builder/users', uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            currentUserRoles = data.roles || [];
            currentUsername = data.username || null;
        } else {
            currentUserRoles = [];
            currentUsername = null;
        }
    } catch (error) {
        console.error("Error fetching user profile:", error);
        currentUserRoles = [];
        currentUsername = null;
    }
}


/**
 * Fetches and displays the main community information.
 */
async function loadCommunityInfo() {
    try {
        const communityRef = doc(db, 'communities', COMMUNITY_ID);
        const communitySnap = await getDoc(communityRef);

        if (communitySnap.exists()) {
            const data = communitySnap.data();
            communityAdminUid = data.adminUid;
            DOM.name.textContent = data.name || 'Community Hub';
            DOM.description.textContent = data.description || 'Welcome to the hub.';
            if (data.bannerImageUrl && data.bannerImageUrl != '') {
                DOM.banner.style.backgroundImage = `url('${data.bannerImageUrl}')`;
                DOM.banner.style.display = 'block';
            }
            DOM.header.classList.remove('community-header-loading');
        } else {
            console.error("Community not found in Firestore!");
            DOM.name.textContent = "Community Not Found";
            DOM.description.textContent = "Please check the community ID and configuration.";
        }
    } catch (error)
        {
        console.error("Error loading community info:", error);
    }
}

/**
 * Fetches and renders the list of community members.
 */
async function loadMembers() {
    try {
        const membersRef = collection(db, 'communities', COMMUNITY_ID, 'members');
        const membersSnap = await getDocs(membersRef);
        
        DOM.memberList.innerHTML = '';
        isCurrentUserMember = false;

        if (membersSnap.empty) {
            DOM.memberList.innerHTML = '<p class="text-sm text-gray-400">No members yet.</p>';
            return;
        }

        const members = membersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        members.forEach(member => {
            if (member.id === currentUserId) isCurrentUserMember = true;
            const isAdmin = member.id === communityAdminUid;
            const memberEl = document.createElement('div');
            memberEl.className = 'member-item';
            memberEl.innerHTML = `
                <img src="${member.photoURL || 'https://placehold.co/48x48/1f2937/e2e8f0?text=?'}" alt="${member.displayName}" class="member-avatar">
                <span class="member-name">${member.displayName || 'Unnamed Member'}</span>
                <span class="member-role ${isAdmin ? 'admin' : 'member'}">${isAdmin ? 'Admin' : 'Member'}</span>
                <button class="remove-member-btn" data-uid="${member.id}" title="Remove Member">&times;</button>
            `;
            DOM.memberList.appendChild(memberEl);
        });
    } catch (error) {
        console.error("Error loading members:", error);
        DOM.memberList.innerHTML = '<p class="text-sm text-red-400">Could not load members.</p>';
    }
}

/**
 * Fetches the latest tier list for each type and renders them.
 */
async function loadTierList() {
    DOM.tierListContainer.innerHTML = ''; // Clear existing lists
    LATEST_TIER_LISTS = {}; // Reset global state
    const listTypes = ['champion', 'legacyPiece'];
    let listsFound = 0;

    try {
        const tierListsRef = collection(db, 'communities', COMMUNITY_ID, 'tierLists');
        
        for (const type of listTypes) {
            const q = query(tierListsRef, where("type", "==", type), orderBy("createdAt", "desc"), limit(1));
            const tierListSnap = await getDocs(q);

            if (!tierListSnap.empty) {
                listsFound++;
                const latestDoc = tierListSnap.docs[0];
                const listData = latestDoc.data();
                LATEST_TIER_LISTS[type] = listData;
                renderTierList(listData, latestDoc.id);
            }
        }

        if (listsFound === 0) {
            DOM.tierListContainer.innerHTML = '<div class="placeholder-content"><p>No tier list found for this community yet.</p></div>';
        }

    } catch (error) {
        console.error("Error loading tier lists:", error);
        DOM.tierListContainer.innerHTML = '<div class="placeholder-content"><p class="text-red-400">Could not load tier lists.</p></div>';
    }
}

/**
 * Renders a single tier list HTML and appends it to the container.
 */
function renderTierList(listData, listId) {
    const type = listData.type || 'champion';
    const isChampionList = type === 'champion';
    const tiers = ['S', 'A+', 'A', 'B', 'C', 'D'];

    // --- Render Headers ---
    let groupHeadersHtml = '<div></div>'; 
    Object.values(CLASS_GROUPS).forEach(group => {
        groupHeadersHtml += `<div class="column-header">`;
        group.icons.forEach(iconSrc => {
            groupHeadersHtml += `<img src="${iconSrc}" alt="${group.name}" class="class-icon-header">`;
        });
        groupHeadersHtml += `</div>`;
    });
    const headerHtml = `<div class="tier-column-headers">${groupHeadersHtml}</div>`;

    // --- Render Tier Rows ---
    let tierRowsHtml = '';
    for (const tier of tiers) {
        const tierItems = listData.tiers[tier] || [];
        const groupedItems = { GROUP_1: [], GROUP_2: [], GROUP_3: [] };

        tierItems.forEach(itemId => {
            const itemData = isChampionList ? ALL_CHAMPIONS_DATA[itemId] : ALL_LEGACY_PIECES_DATA[itemId];
            if (itemData) {
                const itemClasses = isChampionList ? [itemData.class] : (itemData.description.split(', ') || []);
                let placed = false;
                for (const itemClass of itemClasses) {
                    for (const [groupKey, groupData] of Object.entries(CLASS_GROUPS)) {
                        if (groupData.classes.includes(itemClass)) {
                            if (!groupedItems[groupKey].includes(itemId)) { // Prevent duplicates
                                groupedItems[groupKey].push(itemId);
                            }
                            placed = true;
                            break; 
                        }
                    }
                    if(placed) break;
                }
                // Fallback for items that don't match any class group
                if (!placed) {
                    groupedItems.GROUP_1.push(itemId);
                }
            }
        });

        let columnsHtml = '';
        let hasConent = false;
        Object.values(groupedItems).forEach(group => {
            columnsHtml += '<div class="tier-content">';
            group.forEach(itemId => {
                const itemData = isChampionList ? ALL_CHAMPIONS_DATA[itemId] : ALL_LEGACY_PIECES_DATA[itemId];
                if (itemData) {
                    hasConent = true;
                    let rarityClass = `rarity-${(itemData.baseRarity || '').toLowerCase().replace(/\s/g, '-')}`;
                    const escapedName = (itemData.name || 'Unknown').replace(/"/g, '&quot;');
                    let imageUrl, cleanName;
                    if (isChampionList) {
                        cleanName = (itemData.name || '').replace(/[^a-zA-Z0-9-]/g, "");
                        imageUrl = `/img/champions/avatars/${cleanName}.webp`;
                    } else {
                        rarityClass = 'rarity-none';
                        cleanName = (itemData.name || '').replace(/[^a-zA-Z0-9]/g, "");
                        imageUrl = itemData.cardImageUrl || `/img/legacy_pieces/${cleanName}.webp`;
                    }
                    columnsHtml += `
                        <div class="item-card ${rarityClass}">
                            <img src="${imageUrl}" alt="${escapedName}" onerror="this.onerror=null;this.src='https://placehold.co/72x72/1f2937/e2e8f0?text=?';">
                        </div>`;
                }
            });
            columnsHtml += '</div>';
        });
        if (hasConent) {
            tierRowsHtml += `<div class="tier-row" data-tier="${tier}"><div class="tier-label">${tier}</div><div class="tier-row-content">${columnsHtml}</div></div>`;
        }
    }

    // --- Common Wrapper HTML ---
    const creationDate = listData.createdAt?.toDate ? listData.createdAt.toDate().toLocaleDateString() : 'a while ago';
    const isCommunityAdmin = currentUserId === communityAdminUid;
    const isAuthor = currentUserId === listData.authorUid;
    const canDelete = currentUserRoles.includes('admin') || isCommunityAdmin || isAuthor;

    const listWrapper = document.createElement('div');
    listWrapper.classList.add('tier-list-instance-wrapper');
    listWrapper.setAttribute('id', type + '-tier-list-instance-wrapper');
    listWrapper.innerHTML = `
        <div class="tier-list-wrapper">
            <header class="tier-list-header">
                <div class="header-title-block">
                    <h1>${listData.title || 'Community Tier List'}</h1>
                    <p>Created by ${listData.authorName || 'A Member'} on ${creationDate}</p>
                </div>
                <div>
                    ${canDelete ? `<button class="delete-tierlist-btn action-button-secondary" data-list-id="${listId}"><i class="fas fa-trash mr-2"></i>Delete</button>` : ''}
                </div>
            </header>
            <div class="tier-grid">
                ${headerHtml}
                ${tierRowsHtml}
            </div>
        </div>
    `;
    DOM.tierListContainer.appendChild(listWrapper);
}


/**
 * Fetches and renders the latest forum posts.
 */
async function loadForumPosts() {
    try {
        const postsRef = collection(db, 'communities', COMMUNITY_ID, 'forumPosts');
        const q = query(postsRef, orderBy("createdAt", "desc"), limit(10));
        const postsSnap = await getDocs(q);

        if (postsSnap.empty) {
            DOM.forumContainer.innerHTML = '<div class="placeholder-content"><p>No forum posts yet. Be the first to create one!</p></div>';
            return;
        }

        DOM.forumContainer.innerHTML = '';
        postsSnap.forEach(doc => {
            const post = doc.data();
            const champData = ALL_CHAMPIONS_DATA[post.championId];
            const cleanName = champData ? (champData.name || '').replace(/[^a-zA-Z0-9-]/g, "") : '';
            const postDate = post.createdAt?.toDate ? post.createdAt.toDate().toLocaleDateString() : 'a while ago';

            const postEl = document.createElement('div');
            postEl.className = 'forum-post-item';
            postEl.dataset.postId = doc.id;
            postEl.innerHTML = `
                <div class="post-champion-avatar">
                    <img src="/img/champions/avatars/${cleanName}.webp" alt="${champData?.name}" onerror="this.onerror=null;this.src='https://placehold.co/56x56/1f2937/e2e8f0?text=?';">
                </div>
                <div class="post-details">
                    <h3 class="post-title">${post.title}</h3>
                    <p class="post-meta">
                        By <span class="author-name">${post.authorName}</span> on ${postDate} &bull; About ${champData?.name || 'Unknown'}
                    </p>
                </div>
            `;
            DOM.forumContainer.appendChild(postEl);
        });
    } catch (error) {
        console.error("Error loading forum posts:", error);
        DOM.forumContainer.innerHTML = '<div class="placeholder-content"><p class="text-red-400">Could not load forum posts.</p></div>';
    }
}

/**
 * Fetches and renders community teams.
 */
async function loadCommunityTeams() {
    try {
        const teamsRef = collection(db, 'communities', COMMUNITY_ID, 'teams');
        const q = query(teamsRef, orderBy("createdAt", "desc"), limit(10));
        const teamsSnap = await getDocs(q);

        if (teamsSnap.empty) {
            DOM.teamContainer.innerHTML = '<div class="placeholder-content md:col-span-2"><p>No teams created yet.</p></div>';
            return;
        }

        DOM.teamContainer.innerHTML = '';
        teamsSnap.forEach(doc => {
            const team = doc.data();
            let championsHtml = '';
            team.championIds.forEach(champId => {
                const champData = ALL_CHAMPIONS_DATA[champId];
                if (champData) {
                    const cleanName = (champData.name || '').replace(/[^a-zA-Z0-9-]/g, "");
                    const championTier = getChampionTier(champId);
                    const tierBadgeHtml = championTier 
                        ? `<div class="tier-rating-badge tier-${championTier.toLowerCase().replace('+', '-plus')}">${championTier}</div>` 
                        : '';

                    championsHtml += `
                        <div class="item-card">
                            <img src="${champData.cardImageUrl}" alt="${champData.name}" onerror="this.onerror=null;this.src='/img/champions/avatars/${cleanName}.webp';">
                            ${tierBadgeHtml}
                        </div>`;
                }
            });

            const teamEl = document.createElement('div');
            teamEl.className = 'team-item';
            teamEl.dataset.teamId = doc.id;
            teamEl.innerHTML = `
                <div class="team-header">
                    <div>
                        <h3 class="team-name">${team.name}</h3>
                        <p class="team-meta">By ${team.authorName}</p>
                    </div>
                </div>
                <div class="team-champions">${championsHtml}</div>
            `;
            DOM.teamContainer.appendChild(teamEl);
        });
    } catch (error) {
        console.error("Error loading teams:", error);
        DOM.teamContainer.innerHTML = '<div class="placeholder-content md:col-span-2"><p class="text-red-400">Could not load teams.</p></div>';
    }
}

/**
 * Shows the single post view and hides the main view.
 * @param {string} postId - The ID of the post to display.
 */
async function showPostView(postId) {
    DOM.mainView.classList.add('hidden');
    DOM.postView.classList.remove('hidden');
    DOM.teamView.classList.add('hidden');
    DOM.postView.innerHTML = '<div class="content-section"><div class="placeholder-content"><p>Loading post...</p></div></div>';

    try {
        history.pushState({ postId: postId }, '', `?postId=${postId}`);

        const postRef = doc(db, 'communities', COMMUNITY_ID, 'forumPosts', postId);
        const postSnap = await getDoc(postRef);

        if (!postSnap.exists()) throw new Error("Post not found");
        
        const post = postSnap.data();
        const champData = ALL_CHAMPIONS_DATA[post.championId];
        const postDate = post.createdAt?.toDate ? post.createdAt.toDate().toLocaleDateString() : 'a while ago';

        const isCommunityAdmin = currentUserId === communityAdminUid;
        const isAuthor = currentUserId === post.authorUid;
        const canDelete = currentUserRoles.includes('admin') || isCommunityAdmin || isAuthor;
        
        const championTier = getChampionTier(post.championId);
        const tierBadgeHtml = championTier 
            ? `<div class="tier-rating-badge tier-${championTier.toLowerCase().replace('+', '-plus')}">${championTier}</div>` 
            : '';

        let postHtml = `
            <div class="content-section">
                <button id="back-to-main-view" class="action-button-secondary mb-6"><i class="fas fa-arrow-left mr-2"></i>Back to Main View</button>
                <header class="single-post-header">
                    <div class="flex justify-between items-start">
                        <div>
                            <h1 class="single-post-title">${post.title} ${tierBadgeHtml}</h1>
                            <p class="single-post-meta">Posted by ${post.authorName} on ${postDate} &bull; About ${champData?.name}</p>
                        </div>
                        <div>
                            ${canDelete ? `<button id="delete-post-btn" class="action-button-secondary" data-post-id="${postId}"><i class="fas fa-trash mr-2"></i>Delete Post</button>` : ''}
                        </div>
                    </div>
                </header>
                <div class="single-post-body">${post.body}</div>
                
                <div id="champion-vote-section-${post.championId}" class="champion-vote-section">
                    <button class="vote-button like" data-vote="like"><i class="fas fa-thumbs-up"></i></button>
                    <span class="vote-count like">0</span>
                    <button class="vote-button dislike" data-vote="dislike"><i class="fas fa-thumbs-down"></i></button>
                    <span class="vote-count dislike">0</span>
                </div>
            </div>
            <div class="content-section comments-section">
                <h2 class="section-title">Comments</h2>
                <div id="comments-list" class="space-y-6"></div>
                <form id="comment-form" class="mt-8 ${currentUserId ? '' : 'hidden'}">
                    <textarea id="comment-textarea" class="admin-input w-full" placeholder="Write a comment..." required></textarea>
                    <button type="submit" class="action-button mt-2">Submit Comment</button>
                </form>
            </div>
        `;
        DOM.postView.innerHTML = postHtml;
        
        await loadComments(postId, 'forumPosts');
        await loadChampionVotes(post.championId);

        DOM.postView.querySelector('#back-to-main-view').addEventListener('click', showMainView);
        DOM.postView.querySelector('#comment-form').addEventListener('submit', (e) => handleSaveComment(e, postId, 'forumPosts'));
        DOM.postView.querySelectorAll('.vote-button').forEach(btn => {
            btn.addEventListener('click', () => handleChampionVote(post.championId, btn.dataset.vote));
        });
        const deleteBtn = DOM.postView.querySelector('#delete-post-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', handleDeletePost);
        }

    } catch (error) {
        console.error("Error showing post view:", error);
        DOM.postView.innerHTML = '<div class="content-section"><p class="text-red-400">Could not load post.</p></div>';
    }
}

/**
 * Shows the single team view.
 * @param {string} teamId - The ID of the team to display.
 */
async function showTeamView(teamId) {
    DOM.mainView.classList.add('hidden');
    DOM.postView.classList.add('hidden');
    DOM.teamView.classList.remove('hidden');
    DOM.teamView.innerHTML = '<div class="content-section"><div class="placeholder-content"><p>Loading team...</p></div></div>';

    try {
        history.pushState({ teamId: teamId }, '', `?teamId=${teamId}`);

        const teamRef = doc(db, 'communities', COMMUNITY_ID, 'teams', teamId);
        const teamSnap = await getDoc(teamRef);

        if (!teamSnap.exists()) throw new Error("Team not found");

        const team = teamSnap.data();
        const teamDate = team.createdAt?.toDate ? team.createdAt.toDate().toLocaleDateString() : 'a while ago';

        const isCommunityAdmin = currentUserId === communityAdminUid;
        const isAuthor = currentUserId === team.authorUid;
        const canDelete = currentUserRoles.includes('admin') || isCommunityAdmin || isAuthor;

        let championsHtml = '';
        team.championIds.forEach(champId => {
            const champData = ALL_CHAMPIONS_DATA[champId];
            if (champData) {
                const championTier = getChampionTier(champId);
                const tierBadgeHtml = championTier 
                    ? `<div class="tier-rating-badge tier-${championTier.toLowerCase().replace('+', '-plus')}">${championTier}</div>` 
                    : '';

                championsHtml += `<div class="item-card"><a href="/codex.html?search=${encodeURIComponent(champData.name)}"><img src="${champData.cardImageUrl}" alt="${champData.name}">${tierBadgeHtml}</a></div>`;
            }
        });

        let teamHtml = `
            <div class="content-section">
                <button id="back-to-main-view" class="action-button-secondary mb-6"><i class="fas fa-arrow-left mr-2"></i>Back to Main View</button>
                <header class="single-post-header">
                     <div class="flex justify-between items-start">
                        <div>
                            <h1 class="single-post-title">${team.name}</h1>
                            <p class="single-post-meta">Created by ${team.authorName} on ${teamDate}</p>
                        </div>
                        <div>
                            ${canDelete ? `<button id="delete-team-btn" class="action-button-secondary" data-team-id="${teamId}"><i class="fas fa-trash mr-2"></i>Delete Team</button>` : ''}
                        </div>
                    </div>
                </header>
                <div class="team-champions mb-4">${championsHtml}</div>
                <div class="single-post-body">${team.description || 'No description provided.'}</div>
                
                <div id="team-vote-section-${teamId}" class="champion-vote-section">
                    <button class="vote-button like" data-vote="like"><i class="fas fa-thumbs-up"></i></button>
                    <span class="vote-count like">0</span>
                    <button class="vote-button dislike" data-vote="dislike"><i class="fas fa-thumbs-down"></i></button>
                    <span class="vote-count dislike">0</span>
                </div>
            </div>
             <div class="content-section comments-section">
                <h2 class="section-title">Comments</h2>
                <div id="comments-list" class="space-y-6"></div>
                <form id="comment-form" class="mt-8 ${currentUserId ? '' : 'hidden'}">
                    <textarea id="comment-textarea" class="admin-input w-full" placeholder="Write a comment..." required></textarea>
                    <button type="submit" class="action-button mt-2">Submit Comment</button>
                </form>
            </div>
        `;
        DOM.teamView.innerHTML = teamHtml;

        await loadComments(teamId, 'teams');
        await loadTeamVotes(teamId);

        DOM.teamView.querySelector('#back-to-main-view').addEventListener('click', showMainView);
        DOM.teamView.querySelector('#comment-form').addEventListener('submit', (e) => handleSaveComment(e, teamId, 'teams'));
        const deleteBtn = DOM.teamView.querySelector('#delete-team-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', handleDeleteTeam);
        }
        DOM.teamView.querySelectorAll('.vote-button').forEach(btn => {
            btn.addEventListener('click', () => handleTeamVote(teamId, btn.dataset.vote));
        });

    } catch (error) {
        console.error("Error showing team view:", error);
        DOM.teamView.innerHTML = '<div class="content-section"><p class="text-red-400">Could not load team.</p></div>';
    }
}


/**
 * Fetches and renders comments for a specific post or team.
 * @param {string} parentId - The ID of the post or team.
 * @param {string} parentCollection - The name of the parent collection ('forumPosts' or 'teams').
 */
async function loadComments(parentId, parentCollection) {
    const view = parentCollection === 'forumPosts' ? DOM.postView : DOM.teamView;
    const commentsList = view.querySelector('#comments-list');
    const commentsRef = collection(db, 'communities', COMMUNITY_ID, parentCollection, parentId, 'comments');
    const q = query(commentsRef, orderBy("createdAt", "asc"));
    const commentsSnap = await getDocs(q);

    if (commentsSnap.empty) {
        commentsList.innerHTML = '<p class="text-gray-400">No comments yet.</p>';
        return;
    }

    commentsList.innerHTML = '';
    commentsSnap.forEach(doc => {
        const comment = doc.data();
        const canDelete = isCurrentUserMember || currentUserId === comment.authorUid;
        const commentDate = comment.createdAt?.toDate ? comment.createdAt.toDate().toLocaleString() : '';

        const commentEl = document.createElement('div');
        commentEl.className = 'comment-item';
        commentEl.innerHTML = `
            <img src="${comment.authorPhotoURL || 'https://placehold.co/40x40/1f2937/e2e8f0?text=?'}" alt="${comment.authorName}" class="comment-avatar">
            <div class="comment-content">
                <div class="comment-header">
                    <span class="comment-author">${comment.authorName}</span>
                    <span class="comment-timestamp">${commentDate}</span>
                    ${canDelete ? `<button class="comment-delete-btn" data-comment-id="${doc.id}"><i class="fas fa-trash"></i></button>` : ''}
                </div>
                <p class="comment-body">${comment.text}</p>
            </div>
        `;
        commentsList.appendChild(commentEl);
    });

    commentsList.querySelectorAll('.comment-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleDeleteComment(e, parentId, btn.dataset.commentId, parentCollection));
    });
}

/**
 * Fetches and displays vote counts for a champion.
 * @param {string} championId - The ID of the champion.
 */
async function loadChampionVotes(championId) {
    const voteSection = document.getElementById(`champion-vote-section-${championId}`);
    if (!voteSection) return;

    const votesRef = collection(db, 'communities', COMMUNITY_ID, 'championVotes', championId, 'votes');
    const votesSnap = await getDocs(votesRef);

    let likes = 0;
    let dislikes = 0;
    let userVote = null;

    votesSnap.forEach(doc => {
        if (doc.data().voteType === 'like') likes++;
        if (doc.data().voteType === 'dislike') dislikes++;
        if (doc.id === currentUserId) userVote = doc.data().voteType;
    });

    voteSection.querySelector('.vote-count.like').textContent = likes;
    voteSection.querySelector('.vote-count.dislike').textContent = dislikes;

    const likeBtn = voteSection.querySelector('.vote-button.like');
    const dislikeBtn = voteSection.querySelector('.vote-button.dislike');
    likeBtn.classList.toggle('active', userVote === 'like');
    dislikeBtn.classList.toggle('active', userVote === 'dislike');
}

/**
 * Fetches and displays vote counts for a team.
 * @param {string} teamId - The ID of the team.
 */
async function loadTeamVotes(teamId) {
    const voteSection = document.getElementById(`team-vote-section-${teamId}`);
    if (!voteSection) return;

    const votesRef = collection(db, 'communities', COMMUNITY_ID, 'teamVotes', teamId, 'votes');
    const votesSnap = await getDocs(votesRef);

    let likes = 0;
    let dislikes = 0;
    let userVote = null;

    votesSnap.forEach(doc => {
        if (doc.data().voteType === 'like') likes++;
        if (doc.data().voteType === 'dislike') dislikes++;
        if (doc.id === currentUserId) userVote = doc.data().voteType;
    });

    voteSection.querySelector('.vote-count.like').textContent = likes;
    voteSection.querySelector('.vote-count.dislike').textContent = dislikes;

    const likeBtn = voteSection.querySelector('.vote-button.like');
    const dislikeBtn = voteSection.querySelector('.vote-button.dislike');
    likeBtn.classList.toggle('active', userVote === 'like');
    dislikeBtn.classList.toggle('active', userVote === 'dislike');
}

/**
 * Looks up a champion's tier from the globally stored champion tier list.
 * @param {string} championId - The ID of the champion to find.
 * @returns {string|null} The tier (e.g., "S", "A+") or null if not found.
 */
function getChampionTier(championId) {
    const championList = LATEST_TIER_LISTS.champion;
    if (!championList || !championList.tiers) {
        return null;
    }
    for (const [tier, championIds] of Object.entries(championList.tiers)) {
        if (championIds.includes(championId)) {
            return tier;
        }
    }
    return null;
}


function showMainView() {
    DOM.postView.classList.add('hidden');
    DOM.teamView.classList.add('hidden');
    DOM.mainView.classList.remove('hidden');

    history.pushState({}, '', window.location.pathname);
}

// --- Modal Management ---
function openTierListModal(type = 'champion') {
    DOM.tierListModal.backdrop.dataset.type = type;
    DOM.tierListModal.championPool.innerHTML = '';
    DOM.tierListModal.tiersContainer.innerHTML = '';
    
    const isChampionList = type === 'champion';

    // 1. Configure Modal Titles
    DOM.tierListModal.backdrop.querySelector('.modal-title').textContent = isChampionList ? 'Create New Champion Tier List' : 'Create New Legacy Tier List';
    DOM.tierListModal.backdrop.querySelector('.palette-title').textContent = isChampionList ? 'Champions' : 'Legacy Pieces';
    
    // 2. Populate the Item Palette
    const dataSource = isChampionList ? ALL_CHAMPIONS_DATA : ALL_LEGACY_PIECES_DATA;
    const sortedItems = Object.entries(dataSource).sort(([,a], [,b]) => a.name.localeCompare(b.name));

    sortedItems.forEach(([id, itemData]) => {
        const cleanName = (itemData.name || '').replace(/[^a-zA-Z0-9-]/g, "");
        let rarityClass = '';
        if (type === 'champion') {
            rarityClass = `rarity-${(itemData.baseRarity || '').toLowerCase().replace(/\s/g, '-')}`;
        } else {
            rarityClass = 'rarity-none';
        }

        const itemEl = document.createElement('div');
        itemEl.className = `item-card ${rarityClass}`;
        itemEl.dataset.id = id;
        itemEl.draggable = true;
        
        if (isChampionList) {
            itemEl.dataset.class = itemData.class || 'Unknown';
            itemEl.innerHTML = `<img src="/img/champions/avatars/${cleanName}.webp" alt="${itemData.name}" onerror="this.onerror=null;this.src='https://placehold.co/72x72/1f2937/e2e8f0?text=?';">`;
        } else {
            // Legacy pieces now have multiple classes, store them in a data attribute
            itemEl.dataset.classes = (itemData.classes || []).join(',');
            const imageUrl = itemData.cardImageUrl || `/img/legacy_pieces/${cleanName}.webp`;
            itemEl.innerHTML = `<img src="${imageUrl}" alt="${itemData.name}" onerror="this.onerror=null;this.src='https://placehold.co/72x72/1f2937/e2e8f0?text=?';">`;
        }
        DOM.tierListModal.championPool.appendChild(itemEl);
    });

    // 3. Build the Tier Editor Structure (now the same for both types)
    const tiers = ['S', 'A+', 'A', 'B', 'C', 'D'];
    tiers.forEach(tier => {
        const tierRow = document.createElement('div');
        tierRow.className = 'editor-tier-row';
        tierRow.innerHTML = `
            <div class="tier-label">${tier}</div>
            <div class="editor-tier-content-wrapper">
                <div class="editor-tier-content" data-tier="${tier}" data-group="GROUP_1"></div>
                <div class="editor-tier-content" data-tier="${tier}" data-group="GROUP_2"></div>
                <div class="editor-tier-content" data-tier="${tier}" data-group="GROUP_3"></div>
            </div>
        `;
        DOM.tierListModal.tiersContainer.appendChild(tierRow);
    });

    DOM.tierListModal.backdrop.classList.remove('hidden');
}


function closeTierListModal() {
    DOM.tierListModal.backdrop.classList.add('hidden');
    DOM.tierListModal.titleInput.value = '';
    delete DOM.tierListModal.backdrop.dataset.type;
}

function openTeamBuilderModal() {
    initTinyMCE('#team-description-textarea');
    DOM.teamBuilderModal.championPool.innerHTML = '';
    const sortedChampions = Object.entries(ALL_CHAMPIONS_DATA).sort(([,a], [,b]) => a.name.localeCompare(b.name));
    
    sortedChampions.forEach(([id, champData]) => {
        const cleanName = (champData.name || '').replace(/[^a-zA-Z0-9-]/g, "");
        const rarityClass = `rarity-${(champData.baseRarity || '').toLowerCase().replace(/\s/g, '-')}`;
        const champEl = document.createElement('div');
        champEl.className = `item-card ${rarityClass}`;
        champEl.dataset.id = id;
        champEl.draggable = true;
        champEl.innerHTML = `<img src="/img/champions/avatars/${cleanName}.webp" alt="${champData.name}" onerror="this.onerror=null;this.src='https://placehold.co/72x72/1f2937/e2e8f0?text=?';">`;
        DOM.teamBuilderModal.championPool.appendChild(champEl);
    });
    DOM.teamBuilderModal.slots.forEach(slot => slot.innerHTML = '');
    DOM.teamBuilderModal.nameInput.value = '';
    DOM.teamBuilderModal.descriptionTextarea.value = '';
    DOM.teamBuilderModal.backdrop.classList.remove('hidden');
}

function closeTeamBuilderModal() {
    tinymce.remove('#team-description-textarea');
    DOM.teamBuilderModal.backdrop.classList.add('hidden');
}

function openCreatePostModal() {
    initTinyMCE('#post-body-textarea');
    DOM.postModal.championSelect.innerHTML = '<option value="" disabled selected>Select a champion...</option>';
    const sortedChampions = Object.entries(ALL_CHAMPIONS_DATA).sort(([,a], [,b]) => a.name.localeCompare(b.name));
    
    sortedChampions.forEach(([id, champ]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = champ.name;
        DOM.postModal.championSelect.appendChild(option);
    });
    DOM.postModal.form.reset();
    DOM.postModal.backdrop.classList.remove('hidden');
}

function closeCreatePostModal() {
    tinymce.remove('#post-body-textarea');
    DOM.postModal.backdrop.classList.add('hidden');
}


// --- Data Saving Handlers ---
async function handleSaveTierList() {
    const title = DOM.tierListModal.titleInput.value.trim();
    if (!title) { 
        dispatchNotification('Please enter a title for the tier list.', 'warning');
        return; 
    }

    const type = DOM.tierListModal.backdrop.dataset.type || 'champion';
    const tiersData = {};

    // Logic is now the same for both types
    DOM.tierListModal.tiersContainer.querySelectorAll('.editor-tier-row').forEach(tierRow => {
        const tier = tierRow.querySelector('.tier-label').textContent;
        let itemIds = [];
        tierRow.querySelectorAll('.editor-tier-content').forEach(groupColumn => {
            const idsInColumn = Array.from(groupColumn.children).map(child => child.dataset.id);
            itemIds = itemIds.concat(idsInColumn);
        });
        tiersData[tier] = itemIds;
    });

    const newTierList = {
        title,
        type: type, // Explicitly save the type
        authorUid: currentUserId,
        authorName: currentUsername || auth.currentUser.displayName || 'A Member',
        createdAt: serverTimestamp(),
        tiers: tiersData,
    };

    try {
        DOM.tierListModal.saveBtn.disabled = true;
        const tierListsRef = collection(db, 'communities', COMMUNITY_ID, 'tierLists');
        await addDoc(tierListsRef, newTierList);
        closeTierListModal();
        await loadTierList();
        dispatchNotification('Tier list saved successfully!', 'success');
    } catch (error) {
        console.error("Error saving tier list: ", error);
        dispatchNotification('Failed to save tier list. Please try again.', 'error');
    } finally {
        DOM.tierListModal.saveBtn.disabled = false;
    }
}

async function handleSaveTeam() {
    const name = DOM.teamBuilderModal.nameInput.value.trim();
    const description = getSanitizedEditorContent('team-description-textarea');
    if (!name) {
        dispatchNotification('Please enter a team name.', 'warning');
        return;
    }

    const championIds = [];
    DOM.teamBuilderModal.slots.forEach(slot => {
        const champCard = slot.querySelector('.item-card');
        if (champCard) {
            championIds.push(champCard.dataset.id);
        }
    });

    if (championIds.length === 0) {
        dispatchNotification('Please add at least one champion to the team.', 'warning');
        return;
    }

    const newTeam = {
        name, description, championIds,
        authorUid: currentUserId,
        authorName: currentUsername || auth.currentUser.displayName || 'A Member',
        createdAt: serverTimestamp(),
    };

    try {
        DOM.teamBuilderModal.saveBtn.disabled = true;
        const teamsRef = collection(db, 'communities', COMMUNITY_ID, 'teams');
        await addDoc(teamsRef, newTeam);
        closeTeamBuilderModal();
        loadCommunityTeams();
        dispatchNotification('Team saved successfully!', 'success');
    } catch (error) {
        console.error("Error saving team:", error);
        dispatchNotification('Failed to save team. Please try again.', 'error');
    } finally {
        DOM.teamBuilderModal.saveBtn.disabled = false;
    }
}

async function handleSaveForumPost(e) {
    e.preventDefault();
    const title = DOM.postModal.titleInput.value.trim();
    const championId = DOM.postModal.championSelect.value;
    const body = getSanitizedEditorContent('post-body-textarea');

    if (!title || !championId || !body) {
        dispatchNotification('Please fill out all fields before publishing.', 'warning');
        return;
    }

    const newPost = {
        title, championId, body,
        authorUid: currentUserId,
        authorName: currentUsername || auth.currentUser.displayName || 'A Member',
        createdAt: serverTimestamp(),
    };

    try {
        DOM.postModal.saveBtn.disabled = true;
        const postsRef = collection(db, 'communities', COMMUNITY_ID, 'forumPosts');
        await addDoc(postsRef, newPost);
        closeCreatePostModal();
        loadForumPosts();
        dispatchNotification('Forum post published!', 'success');
    } catch (error) {
        console.error("Error saving post:", error);
        dispatchNotification('Failed to publish post. Please try again.', 'error');
    } finally {
        DOM.postModal.saveBtn.disabled = false;
    }
}

async function handleSaveComment(e, parentId, parentCollection) {
    e.preventDefault();
    const form = e.currentTarget;
    const textarea = form.querySelector('textarea');
    const text = textarea.value.trim();
    if (!text) return;

    const newComment = {
        text,
        authorUid: currentUserId,
        authorName: currentUsername || auth.currentUser.displayName || 'A Visitor',
        authorPhotoURL: auth.currentUser.photoURL || null,
        createdAt: serverTimestamp(),
    };

    try {
        const commentsRef = collection(db, 'communities', COMMUNITY_ID, parentCollection, parentId, 'comments');
        await addDoc(commentsRef, newComment);
        form.reset();
        if (parentCollection === 'forumPosts') {
            loadComments(parentId, 'forumPosts');
        } else if (parentCollection === 'teams') {
            loadComments(parentId, 'teams');
        }
    } catch (error) {
        console.error("Error saving comment:", error);
        dispatchNotification('Failed to save comment.', 'error');
    }
}

async function handleChampionVote(championId, voteType) {
    if (!currentUserId) {
        dispatchNotification("You must be logged in to vote.", "info");
        return;
    }
    const voteRef = doc(db, 'communities', COMMUNITY_ID, 'championVotes', championId, 'votes', currentUserId);
    try {
        await setDoc(voteRef, { voteType });
        loadChampionVotes(championId);
    } catch (error) {
        console.error("Error casting vote:", error);
        dispatchNotification("Could not save your vote.", "error");
    }
}

async function handleTeamVote(teamId, voteType) {
    if (!currentUserId) {
        dispatchNotification("You must be logged in to vote.", "info");
        return;
    }
    const voteRef = doc(db, 'communities', COMMUNITY_ID, 'teamVotes', teamId, 'votes', currentUserId);
    try {
        await setDoc(voteRef, { voteType });
        loadTeamVotes(teamId);
    } catch (error) {
        console.error("Error casting team vote:", error);
        dispatchNotification("Could not save your vote.", "error");
    }
}


// --- Delete Functions
async function handleDeleteComment(e, parentId, commentId, parentCollection) {
    const confirmed = await confirmationModal.show('Are you sure you want to delete this comment?', 'Delete Comment');
    if (!confirmed) return;

    try {
        const commentRef = doc(db, 'communities', COMMUNITY_ID, parentCollection, parentId, 'comments', commentId);
        await deleteDoc(commentRef);
        if (parentCollection === 'forumPosts') {
            loadComments(parentId, 'forumPosts');
        } else if (parentCollection === 'teams') {
            loadComments(parentId, 'teams');
        }
    } catch (error) {
        console.error("Error deleting comment:", error);
        dispatchNotification('Failed to delete comment.', 'error');
    }
}

async function handleDeletePost(e) {
    const postId = e.currentTarget.dataset.postId;
    if (!postId) return;

    const confirmed = await confirmationModal.show('Are you sure you want to permanently delete this post?', 'Delete Post');
    if (!confirmed) return;

    try {
        const postRef = doc(db, 'communities', COMMUNITY_ID, 'forumPosts', postId);
        await deleteDoc(postRef);
        dispatchNotification('Post deleted successfully.', 'success');
        showMainView();
        loadForumPosts();
    } catch (error) {
        console.error("Error deleting post:", error);
        dispatchNotification('Failed to delete post.', 'error');
    }
}

async function handleDeleteTeam(e) {
    const teamId = e.currentTarget.dataset.teamId;
    if (!teamId) return;

    const confirmed = await confirmationModal.show('Are you sure you want to permanently delete this team?', 'Delete Team');
    if (!confirmed) return;

    try {
        const teamRef = doc(db, 'communities', COMMUNITY_ID, 'teams', teamId);
        await deleteDoc(teamRef);
        dispatchNotification('Team deleted successfully.', 'success');
        showMainView();
        loadCommunityTeams();
    } catch (error) {
        console.error("Error deleting team:", error);
        dispatchNotification('Failed to delete team.', 'error');
    }
}

async function handleDeleteTierList(listId) {
    if (!listId) {
        console.error("Delete button is missing the list ID.");
        return;
    }
    
    const confirmed = await confirmationModal.show('Are you sure you want to permanently delete this tier list?', 'Delete Tier List');
    if (!confirmed) return;

    try {
        const listRef = doc(db, 'communities', COMMUNITY_ID, 'tierLists', listId);
        await deleteDoc(listRef);
        dispatchNotification('Tier list deleted successfully.', 'success');
        loadTierList();
    } catch (error) {
        console.error("Error deleting tier list:", error);
        dispatchNotification('Failed to delete tier list.', 'error');
    }
}

// --- UI & Admin ---
function updateUIVisibility() {
    const isSiteAdmin = currentUserRoles.includes('admin');
    const isCommunityAdmin = currentUserId === communityAdminUid;
    const canManageCommunity = isSiteAdmin || isCommunityAdmin;

    DOM.adminPanel.classList.toggle('hidden', !canManageCommunity);
    document.body.classList.toggle('is-admin', canManageCommunity);

     if (canManageCommunity) {
        DOM.memberList.querySelectorAll('.remove-member-btn').forEach(btn => {
            btn.style.display = (btn.dataset.uid === communityAdminUid) ? 'none' : 'inline-block';
            btn.addEventListener('click', handleRemoveMember);
        });
    }

    const canCreateContent = isCurrentUserMember || isSiteAdmin;
    DOM.createTierListBtn.classList.toggle('hidden', !canCreateContent);
    DOM.createLegacyTierListBtn.classList.toggle('hidden', !canCreateContent);
    DOM.createPostBtn.classList.toggle('hidden', !canCreateContent);
    DOM.createTeamBtn.classList.toggle('hidden', !canCreateContent);
}

async function handleAddMember(e) {
    e.preventDefault();
    const email = DOM.memberEmailInput.value.trim();
    if (!email) return;

    dispatchNotification('Processing request...', 'info');
    try {
        const addCommunityMember = httpsCallable(functions, 'addCommunityMember');
        const result = await addCommunityMember({ email, communityId: COMMUNITY_ID });
        if (result.data.success) {
            dispatchNotification(result.data.message, 'success');
            DOM.addMemberForm.reset();
            loadMembers();
        } else { throw new Error(result.data.message); }
    } catch (error) {
        dispatchNotification(`Error: ${error.message}`, 'error');
    }
}

async function handleRemoveMember(e) {
    const memberUid = e.currentTarget.dataset.uid;
    if (!memberUid) return;

    const confirmed = await confirmationModal.show('Are you sure you want to remove this member?', 'Remove Member');
    if (!confirmed) return;
    
    try {
        await deleteDoc(doc(db, 'communities', COMMUNITY_ID, 'members', memberUid));
        dispatchNotification('Member removed.', 'success');
        loadMembers();
    } catch (error) {
        dispatchNotification('Failed to remove member.', 'error');
    }
}

/**
 * Initializes the page after Firebase is ready.
 */
async function init() {
    await loadCommunityInfo();
    await loadMembers();
    await loadTierList();
    await loadForumPosts();
    await loadCommunityTeams();
    updateUIVisibility();
    
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('postId');
    const teamId = urlParams.get('teamId');

    if (postId) {
        showPostView(postId);
    } else if (teamId) {
        showTeamView(teamId);
    } else {
        showMainView();
    }
}

// --- Drag and Drop Logic ---
document.addEventListener('dragstart', (e) => {
    const draggedCard = e.target.closest('.item-card');
    if (draggedCard) {
        e.dataTransfer.setData('text/plain', draggedCard.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            draggedCard.classList.add('dragging');
        }, 0);
    }
});

document.addEventListener('dragend', (e) => {
    const draggedCard = e.target.closest('.item-card');
    if (draggedCard) {
        draggedCard.classList.remove('dragging');
    }
});

const getDropZone = (target) => target.closest('.editor-tier-row, .palette-pool, .team-slot');

document.addEventListener('dragover', (e) => {
    const zone = getDropZone(e.target);
    if (zone) {
        e.preventDefault();
    }
});

document.addEventListener('dragenter', (e) => {
    const zone = getDropZone(e.target);
    if (zone) {
        zone.classList.add('drag-over');
    }
});

document.addEventListener('dragleave', (e) => {
    const zone = getDropZone(e.target);
    if (zone && !zone.contains(e.relatedTarget)) {
        zone.classList.remove('drag-over');
    }
});

document.addEventListener('drop', (e) => {
    const zone = getDropZone(e.target);
    if (zone) {
        e.preventDefault();
        zone.classList.remove('drag-over');

        const itemId = e.dataTransfer.getData('text/plain');
        const draggedElement = document.querySelector(`.item-card[data-id="${itemId}"].dragging`);

        if (draggedElement) {
            let cardContainer = zone;
            const tierListModal = e.target.closest('#tierlist-modal-backdrop');

            if (tierListModal && zone.matches('.editor-tier-row')) {
                // Unified logic for champions and legacy pieces
                const itemClasses = (draggedElement.dataset.classes || draggedElement.dataset.class || '').split(',');
                let targetGroupKey = null;

                // Find the first matching group for any of the item's classes
                for (const itemClass of itemClasses) {
                    if (itemClass) {
                        for (const [groupKey, groupData] of Object.entries(CLASS_GROUPS)) {
                            if (groupData.classes.includes(itemClass.trim())) {
                                targetGroupKey = groupKey;
                                break;
                            }
                        }
                    }
                    if (targetGroupKey) break;
                }
                
                if (targetGroupKey) {
                    cardContainer = zone.querySelector(`.editor-tier-content[data-group="${targetGroupKey}"]`);
                } else {
                    // Fallback to the first group if no class matches
                    cardContainer = zone.querySelector('.editor-tier-content');
                }
            }
            
            if (cardContainer) {
                if (cardContainer.matches('.team-slot') && cardContainer.children.length > 0) {
                    return; // Don't drop if slot is full
                }
                cardContainer.appendChild(draggedElement);
            }
        }
    }
});


// --- Event Listeners ---
document.addEventListener('firebase-ready', async () => {
    try {
        const app = getApp();
        db = getFirestore(app);
        auth = getAuth(app);
        functions = getFunctions(app);

        await cacheAllChampionsData();
        await cacheAllLegacyPiecesData();

        onAuthStateChanged(auth, async (user) => {
            currentUserId = user ? user.uid : null;
            await fetchUserProfile(currentUserId);
            if (db) {
                init();
            }
        });

    } catch (e) {
        console.error("Community Page: Firebase initialization failed.", e);
        DOM.name.textContent = "Error Loading Page";
    }
}, { once: true });

// Confirmation Modal Listeners
confirmationModal.confirmBtn.addEventListener('click', () => confirmationModal.hide(true));
confirmationModal.cancelBtn.addEventListener('click', () => confirmationModal.hide(false));
confirmationModal.backdrop.addEventListener('click', (e) => {
    if (e.target === confirmationModal.backdrop) confirmationModal.hide(false);
});


DOM.addMemberForm.addEventListener('submit', handleAddMember);
DOM.createTierListBtn.addEventListener('click', () => openTierListModal('champion'));
DOM.createLegacyTierListBtn.addEventListener('click', () => openTierListModal('legacyPiece'));
DOM.tierListModal.closeBtn.addEventListener('click', closeTierListModal);
DOM.tierListModal.cancelBtn.addEventListener('click', closeTierListModal);
DOM.tierListModal.saveBtn.addEventListener('click', handleSaveTierList);
DOM.createPostBtn.addEventListener('click', openCreatePostModal);
DOM.postModal.closeBtn.addEventListener('click', closeCreatePostModal);
DOM.postModal.cancelBtn.addEventListener('click', closeCreatePostModal);
DOM.postModal.form.addEventListener('submit', handleSaveForumPost);

DOM.tierListContainer.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-tierlist-btn');
    if (deleteBtn && deleteBtn.dataset.listId) {
        handleDeleteTierList(deleteBtn.dataset.listId);
    }
});

DOM.forumContainer.addEventListener('click', (e) => {
    const postItem = e.target.closest('.forum-post-item');
    if (postItem && postItem.dataset.postId) {
        showPostView(postItem.dataset.postId);
    }
});
DOM.teamContainer.addEventListener('click', (e) => {
    const teamItem = e.target.closest('.team-item');
    if (teamItem && teamItem.dataset.teamId) {
        showTeamView(teamItem.dataset.teamId);
    }
});
DOM.createTeamBtn.addEventListener('click', openTeamBuilderModal);
DOM.teamBuilderModal.closeBtn.addEventListener('click', closeTeamBuilderModal);
DOM.teamBuilderModal.cancelBtn.addEventListener('click', closeTeamBuilderModal);
DOM.teamBuilderModal.saveBtn.addEventListener('click', handleSaveTeam);
window.addEventListener('popstate', (event) => {
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('postId');
    const teamId = urlParams.get('teamId');

    if (postId) {
        showPostView(postId);
    } else if (teamId) {
        showTeamView(teamId);
    } else {
        showMainView();
    }
});
