import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs, deleteDoc, query, orderBy, limit, addDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// --- Global Variables ---
let db, auth, functions;
let currentUserId = null;
let isCurrentUserMember = false;
let communityAdminUid = null;
let ALL_CHAMPIONS_DATA = {};
let currentUserRoles = [];
let currentUsername = null;

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
    adminMessage: document.getElementById('admin-message'),
    tierListContainer: document.getElementById('tier-list-container'),
    createTierListBtn: document.getElementById('create-tierlist-btn'),
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

// --- TinyMCE & Sanitization ---

/**
 * Initializes a TinyMCE editor on a given selector.
 * @param {string} selector - The CSS selector for the textarea.
 */
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
            editor.on('change', function(e) {
                editor.save(); // Keep the underlying textarea updated
            });
        }
    });
}

/**
 * Safely gets and sanitizes content from a TinyMCE editor.
 * @param {string} editorId - The ID of the textarea element.
 * @returns {string} Sanitized HTML content.
 */
function getSanitizedEditorContent(editorId) {
    const editor = tinymce.get(editorId);
    if (editor) {
        const rawContent = editor.getContent();
        // Sanitize the HTML to prevent XSS attacks
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
 * Fetches the current user's profile data (roles and username).
 * @param {string} uid - The user's Firebase UID.
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
            if (data.bannerImageUrl) {
                DOM.banner.style.backgroundImage = `url('${data.bannerImageUrl}')`;
            }
            DOM.header.classList.remove('community-header-loading');
        } else {
            console.error("Community not found in Firestore!");
            DOM.name.textContent = "Community Not Found";
            DOM.description.textContent = "Please check the community ID and configuration.";
        }
    } catch (error) {
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
 * Fetches the latest tier list and renders it.
 */
async function loadTierList() {
    try {
        const tierListsRef = collection(db, 'communities', COMMUNITY_ID, 'tierLists');
        const q = query(tierListsRef, orderBy("createdAt", "desc"), limit(1));
        const tierListSnap = await getDocs(q);

        if (tierListSnap.empty) {
            DOM.tierListContainer.innerHTML = '<div class="placeholder-content"><p>No tier list found for this community yet.</p></div>';
            return;
        }

        const latestTierListDoc = tierListSnap.docs[0];
        renderTierList(latestTierListDoc.data(), latestTierListDoc.id);

    } catch (error) {
        console.error("Error loading tier list:", error);
        DOM.tierListContainer.innerHTML = '<div class="placeholder-content"><p class="text-red-400">Could not load tier list.</p></div>';
    }
}

/**
 * Renders the tier list HTML based on data from Firestore.
 */
function renderTierList(listData, listId) {
    const tiers = ['S', 'A+', 'A', 'B', 'C', 'D'];
    let tierRowsHtml = '';

    let groupHeadersHtml = '<div></div>'; 
    Object.values(CLASS_GROUPS).forEach(group => {
        groupHeadersHtml += `<div class="column-header">`;
        group.icons.forEach(iconSrc => {
            groupHeadersHtml += `<img src="${iconSrc}" alt="${group.name}" class="class-icon-header">`;
        });
        groupHeadersHtml += `</div>`;
    });

    for (const tier of tiers) {
        const tierItems = listData.tiers[tier] || [];
        
        const groupedChamps = { GROUP_1: [], GROUP_2: [], GROUP_3: [] };

        tierItems.forEach(itemId => {
            const champData = ALL_CHAMPIONS_DATA[itemId];
            if (champData) {
                for (const [groupKey, groupData] of Object.entries(CLASS_GROUPS)) {
                    if (groupData.classes.includes(champData.class)) {
                        groupedChamps[groupKey].push(itemId);
                        break;
                    }
                }
            }
        });

        let columnsHtml = '';
        Object.values(groupedChamps).forEach(group => {
            columnsHtml += '<div class="tier-content">';
            group.forEach(itemId => {
                const champData = ALL_CHAMPIONS_DATA[itemId];
                if (champData) {
                    const cleanName = (champData.name || '').replace(/[^a-zA-Z0-9-]/g, "");
                    const rarityClass = `rarity-${(champData.baseRarity || '').toLowerCase().replace(/\s/g, '-')}`;
                    const escapedName = (champData.name || 'Unknown').replace(/"/g, '&quot;');
                    columnsHtml += `
                        <div class="item-card ${rarityClass}">
                            <img src="/img/champions/avatars/${cleanName}.webp" alt="${escapedName}" onerror="this.onerror=null;this.src='https://placehold.co/72x72/1f2937/e2e8f0?text=?';">
                        </div>`;
                }
            });
            columnsHtml += '</div>';
        });

        tierRowsHtml += `<div class="tier-row" data-tier="${tier}"><div class="tier-label">${tier}</div><div class="tier-row-content">${columnsHtml}</div></div>`;
    }

    const creationDate = listData.createdAt?.toDate ? listData.createdAt.toDate().toLocaleDateString() : 'a while ago';
    const isCommunityAdmin = currentUserId === communityAdminUid;
    const isAuthor = currentUserId === listData.authorUid;
    const canDelete = currentUserRoles.includes('admin') || isCommunityAdmin || isAuthor;


    DOM.tierListContainer.innerHTML = `
        <div class="tier-list-wrapper">
            <header class="tier-list-header">
                <div class="header-title-block">
                    <h1>${listData.title || 'Community Tier List'}</h1>
                    <p>Created by ${listData.authorName || 'A Member'} on ${creationDate}</p>
                </div>
                <div>
                    ${canDelete ? `<button id="delete-tierlist-btn" class="action-button-secondary" data-list-id="${listId}"><i class="fas fa-trash mr-2"></i>Delete</button>` : ''}
                </div>
            </header>
            <div class="tier-grid">
                <div class="tier-column-headers">
                    ${groupHeadersHtml}
                </div>
                ${tierRowsHtml}
            </div>
        </div>
    `;

    const deleteBtn = document.getElementById('delete-tierlist-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', handleDeleteTierList);
    }
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
                    championsHtml += `
                        <div class="item-card">
                            <img src="${champData.cardImageUrl}" alt="${champData.name}" onerror="this.onerror=null;this.src='/img/champions/avatars/${cleanName}.webp';">
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
        const postRef = doc(db, 'communities', COMMUNITY_ID, 'forumPosts', postId);
        const postSnap = await getDoc(postRef);

        if (!postSnap.exists()) throw new Error("Post not found");
        
        const post = postSnap.data();
        const champData = ALL_CHAMPIONS_DATA[post.championId];
        const postDate = post.createdAt?.toDate ? post.createdAt.toDate().toLocaleDateString() : 'a while ago';

        const isCommunityAdmin = currentUserId === communityAdminUid;
        const isAuthor = currentUserId === post.authorUid;
        const canDelete = currentUserRoles.includes('admin') || isCommunityAdmin || isAuthor;

        let postHtml = `
            <div class="content-section">
                <button id="back-to-main-view" class="action-button-secondary mb-6"><i class="fas fa-arrow-left mr-2"></i>Back to Main View</button>
                <header class="single-post-header">
                    <div class="flex justify-between items-start">
                        <div>
                            <h1 class="single-post-title">${post.title}</h1>
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
                championsHtml += `<div class="item-card"><a href="/codex.html?search=${encodeURIComponent(champData.name)}"><img src="${champData.cardImageUrl}" alt="${champData.name}"></a></div>`;
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


function showMainView() {
    DOM.postView.classList.add('hidden');
    DOM.teamView.classList.add('hidden');
    DOM.mainView.classList.remove('hidden');
}

// --- Modal Management ---
function openTierListModal() {
    initTinyMCE('#team-description-textarea');
    DOM.tierListModal.championPool.innerHTML = '';
    Object.entries(ALL_CHAMPIONS_DATA).forEach(([id, champData]) => {
        const cleanName = (champData.name || '').replace(/[^a-zA-Z0-9-]/g, "");
        const rarityClass = `rarity-${(champData.baseRarity || '').toLowerCase().replace(/\s/g, '-')}`;
        const champEl = document.createElement('div');
        champEl.className = `item-card ${rarityClass}`;
        champEl.dataset.id = id;
        champEl.dataset.class = champData.class || 'Unknown';
        champEl.draggable = true;
        champEl.innerHTML = `<img src="/img/champions/avatars/${cleanName}.webp" alt="${champData.name}" onerror="this.onerror=null;this.src='https://placehold.co/72x72/1f2937/e2e8f0?text=?';">`;
        DOM.tierListModal.championPool.appendChild(champEl);
    });

    DOM.tierListModal.tiersContainer.innerHTML = '';
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
    tinymce.remove('#team-description-textarea');
    DOM.tierListModal.backdrop.classList.add('hidden');
    DOM.tierListModal.titleInput.value = '';
}

function openTeamBuilderModal() {
    initTinyMCE('#team-description-textarea');
    DOM.teamBuilderModal.championPool.innerHTML = '';
     Object.entries(ALL_CHAMPIONS_DATA).forEach(([id, champData]) => {
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
    if (!title) { alert('Please enter a title.'); return; }

    const tiersData = {};
    DOM.tierListModal.tiersContainer.querySelectorAll('.editor-tier-row').forEach(tierRow => {
        const tier = tierRow.querySelector('.tier-label').textContent;
        let championIds = [];
        tierRow.querySelectorAll('.editor-tier-content').forEach(groupColumn => {
            const idsInColumn = Array.from(groupColumn.children).map(child => child.dataset.id);
            championIds = championIds.concat(idsInColumn);
        });
        tiersData[tier] = championIds;
    });

    const newTierList = {
        title, type: 'champion', authorUid: currentUserId,
        authorName: currentUsername || auth.currentUser.displayName || 'A Member',
        createdAt: serverTimestamp(), tiers: tiersData,
    };

    try {
        DOM.tierListModal.saveBtn.disabled = true;
        const tierListsRef = collection(db, 'communities', COMMUNITY_ID, 'tierLists');
        await addDoc(tierListsRef, newTierList);
        closeTierListModal();
        loadTierList();
        alert('Tier list saved!');
    } catch (error) {
        console.error("Error saving tier list: ", error);
        alert('Failed to save tier list.');
    } finally {
        DOM.tierListModal.saveBtn.disabled = false;
    }
}

async function handleSaveTeam() {
    const name = DOM.teamBuilderModal.nameInput.value.trim();
    const description = getSanitizedEditorContent('team-description-textarea');
    if (!name) {
        alert('Please enter a team name.');
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
        alert('Please add at least one champion to the team.');
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
        alert('Team saved successfully!');
    } catch (error) {
        console.error("Error saving team:", error);
        alert('Failed to save team.');
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
        alert('Please fill out all fields.');
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
        alert('Forum post published!');
    } catch (error) {
        console.error("Error saving post:", error);
        alert('Failed to publish post.');
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
        alert('Failed to save comment.');
    }
}

async function handleChampionVote(championId, voteType) {
    if (!currentUserId) {
        alert("You must be logged in to vote.");
        return;
    }
    const voteRef = doc(db, 'communities', COMMUNITY_ID, 'championVotes', championId, 'votes', currentUserId);
    try {
        await setDoc(voteRef, { voteType });
        loadChampionVotes(championId);
    } catch (error) {
        console.error("Error casting vote:", error);
        alert("Could not save your vote.");
    }
}

/**
 * Handles saving a vote for a team.
 * @param {string} teamId - The ID of the team.
 * @param {string} voteType - 'like' or 'dislike'.
 */
async function handleTeamVote(teamId, voteType) {
    if (!currentUserId) {
        alert("You must be logged in to vote.");
        return;
    }
    const voteRef = doc(db, 'communities', COMMUNITY_ID, 'teamVotes', teamId, 'votes', currentUserId);
    try {
        await setDoc(voteRef, { voteType });
        loadTeamVotes(teamId); // Refresh vote counts
    } catch (error) {
        console.error("Error casting team vote:", error);
        alert("Could not save your vote.");
    }
}


// --- Delete Functions
async function handleDeleteComment(e, parentId, commentId, parentCollection) {
    if (!confirm('Are you sure you want to delete this comment?')) return;
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
        alert('Failed to delete comment.');
    }
}

async function handleDeletePost(e) {
    const postId = e.currentTarget.dataset.postId;
    if (!postId || !confirm('Are you sure you want to permanently delete this post?')) return;

    try {
        const postRef = doc(db, 'communities', COMMUNITY_ID, 'forumPosts', postId);
        await deleteDoc(postRef);
        alert('Post deleted successfully.');
        showMainView();
        loadForumPosts();
    } catch (error) {
        console.error("Error deleting post:", error);
        alert('Failed to delete post.');
    }
}

async function handleDeleteTeam(e) {
    const teamId = e.currentTarget.dataset.teamId;
    if (!teamId || !confirm('Are you sure you want to permanently delete this team?')) return;

    try {
        const teamRef = doc(db, 'communities', COMMUNITY_ID, 'teams', teamId);
        await deleteDoc(teamRef);
        alert('Team deleted successfully.');
        showMainView();
        loadCommunityTeams();
    } catch (error) {
        console.error("Error deleting team:", error);
        alert('Failed to delete team.');
    }
}

async function handleDeleteTierList(e) {
    if (!confirm('Are you sure you want to permanently delete this tier list?')) return;

    const listId = e.currentTarget.dataset.listId;
    if (!listId) {
        console.error("Delete button is missing the list ID.");
        return;
    }

    try {
        const listRef = doc(db, 'communities', COMMUNITY_ID, 'tierLists', listId);
        await deleteDoc(listRef);
        alert('Tier list deleted successfully.');
        loadTierList();
    } catch (error) {
        console.error("Error deleting tier list:", error);
        alert('Failed to delete tier list.');
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
    DOM.createPostBtn.classList.toggle('hidden', !canCreateContent);
    DOM.createTeamBtn.classList.toggle('hidden', !canCreateContent);
}

async function handleAddMember(e) {
    e.preventDefault();
    const email = DOM.memberEmailInput.value.trim();
    if (!email) return;

    DOM.adminMessage.textContent = 'Processing...';
    try {
        const addCommunityMember = httpsCallable(functions, 'addCommunityMember');
        const result = await addCommunityMember({ email, communityId: COMMUNITY_ID });
        if (result.data.success) {
            DOM.adminMessage.textContent = result.data.message;
            DOM.addMemberForm.reset();
            loadMembers();
        } else { throw new Error(result.data.message); }
    } catch (error) {
        DOM.adminMessage.textContent = `Error: ${error.message}`;
    }
}

async function handleRemoveMember(e) {
    const memberUid = e.currentTarget.dataset.uid;
    if (!memberUid || !confirm('Are you sure?')) return;
    
    try {
        await deleteDoc(doc(db, 'communities', COMMUNITY_ID, 'members', memberUid));
        alert('Member removed.');
        loadMembers();
    } catch (error) {
        alert('Failed to remove member.');
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
}

// --- Drag and Drop Logic (User Provided) ---
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

        const championId = e.dataTransfer.getData('text/plain');
        const draggedElement = document.querySelector(`.item-card[data-id="${championId}"]`);

        if (draggedElement) {
            let cardContainer = zone;
            if (zone.matches('.editor-tier-row')) {
                const championClass = draggedElement.dataset.class;
                let targetGroupKey = null;
                for (const [groupKey, groupData] of Object.entries(CLASS_GROUPS)) {
                    if (groupData.classes.includes(championClass)) {
                        targetGroupKey = groupKey;
                        break;
                    }
                }
                if(targetGroupKey) {
                    cardContainer = zone.querySelector(`.editor-tier-content[data-group="${targetGroupKey}"]`);
                } else {
                    cardContainer = null; // Invalid class for any group
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

DOM.addMemberForm.addEventListener('submit', handleAddMember);
DOM.createTierListBtn.addEventListener('click', openTierListModal);
DOM.tierListModal.closeBtn.addEventListener('click', closeTierListModal);
DOM.tierListModal.cancelBtn.addEventListener('click', closeTierListModal);
DOM.tierListModal.saveBtn.addEventListener('click', handleSaveTierList);
DOM.createPostBtn.addEventListener('click', openCreatePostModal);
DOM.postModal.closeBtn.addEventListener('click', closeCreatePostModal);
DOM.postModal.cancelBtn.addEventListener('click', closeCreatePostModal);
DOM.postModal.form.addEventListener('submit', handleSaveForumPost);
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
