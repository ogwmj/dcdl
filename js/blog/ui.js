/**
 * @file js/blog.js
 * @description Handles all UI interactions, rendering, and data management for the blog.
 */

// --- MODULES & GLOBALS ---
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, startAfter, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- CONFIG & SETUP ---
const POSTS_PER_PAGE = 10;
let db, analytics, auth, currentUser, userRoles = [], currentUsername, creatorProfile;
let lastVisiblePost = null;
let ALL_SQUADS = [];
let ALL_CHAMPIONS = [];
let isEditMode = false;
let currentEditingPostId = null;

// --- DOM ELEMENTS ---
const listContainer = document.getElementById('blog-list-container');
const detailContainer = document.getElementById('blog-detail-container');
const createPostModal = document.getElementById('create-post-modal');
const filterControls = document.getElementById('filter-controls');
const listViewHeader = document.getElementById('list-view-header');

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('firebase-ready', async () => {
        try {
            const app = getApp();
            db = getFirestore(app);
            analytics = getAnalytics(app);
            auth = getAuth(app);
            await fetchAuxiliaryData();
        } catch (e) {
            console.error("Blog UI: Failed to get Firebase services.", e);
            return;
        }

        onAuthStateChanged(auth, async (user) => {
            currentUser = user;
            if (user && !user.isAnonymous) {
                const userDocRef = doc(db, "artifacts/dc-dark-legion-builder/users", user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    userRoles = userData.roles || [];
                    currentUsername = userData.username || 'Anonymous';
                    creatorProfile = userData.creatorProfile || {};
                } else {
                    userRoles = []; currentUsername = 'Anonymous';
                }
            } else {
                userRoles = []; currentUsername = '';
            }
            await main();
        });

        setupModalListeners();
    });
});

async function fetchAuxiliaryData() {
    try {
        const squadsCollection = collection(db, 'artifacts/dc-dark-legion-builder/public/data/squads');
        const championsCollection = collection(db, 'artifacts/dc-dark-legion-builder/public/data/champions');
        
        const [squadsSnapshot, championsSnapshot] = await Promise.all([
            getDocs(query(squadsCollection, where("isActive", "==", true))),
            getDocs(championsCollection)
        ]);

        ALL_SQUADS = squadsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        ALL_CHAMPIONS = championsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    } catch (error) {
        console.error("Error fetching auxiliary data:", error);
    }
}

function setupModalListeners() {
    document.getElementById('create-post-btn-container').addEventListener('click', (e) => {
        if (e.target.id === 'open-create-modal-btn') openCreateModal();
    });
    document.getElementById('close-modal-btn').addEventListener('click', closeCreateModal);
    document.getElementById('cancel-create-btn').addEventListener('click', closeCreateModal);
    document.getElementById('submit-create-btn').addEventListener('click', handleCreatePostSubmit);

    const squadSelect = document.getElementById('squad-select');
    const champSelect = document.getElementById('champion-select');
    const insertSquadBtn = document.getElementById('insert-squad-placeholder');
    const insertChampBtn = document.getElementById('insert-champion-placeholder');

    squadSelect.addEventListener('change', () => {
        insertSquadBtn.disabled = !squadSelect.value;
    });
    champSelect.addEventListener('change', () => {
        insertChampBtn.disabled = !champSelect.value;
    });

    insertSquadBtn.addEventListener('click', () => {
        if (tinymce.activeEditor) {
            tinymce.activeEditor.execCommand('mceInsertContent', false, '<p>[FEATURED_SQUAD]</p>');
        }
    });
    insertChampBtn.addEventListener('click', () => {
        if (tinymce.activeEditor) {
            tinymce.activeEditor.execCommand('mceInsertContent', false, '<p>[FEATURED_CHAMPION]</p>');
        }
    });
}

// --- ROUTING & MAIN LOGIC ---
async function main() {
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('id');

    if (postId) {
        filterControls.style.display = 'none';
        listViewHeader.style.display = 'none';
        listContainer.style.display = 'none';
        detailContainer.style.display = 'block';
        await renderDetailView(postId);
    } else {
        filterControls.style.display = 'block';
        listViewHeader.style.display = 'block';
        listContainer.style.display = 'block';
        detailContainer.style.display = 'none';
        renderListView();
    }
}

window.addEventListener('popstate', main);


// --- VIEW RENDERING ---

async function renderListView() {
    const createBtnContainer = document.getElementById('create-post-btn-container');
    if (userRoles.includes('creator')) {
        createBtnContainer.innerHTML = `<button id="open-create-modal-btn" class="btn-primary text-sm">Create New Post</button>`;
    } else {
        createBtnContainer.innerHTML = '';
    }

    const postsCollection = collection(db, 'blogPosts');
    const q = query(postsCollection, orderBy('createdAt', 'desc'), limit(POSTS_PER_PAGE));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        listContainer.innerHTML = `<div class="text-center py-16"><p class="text-xl text-slate-400">No blog posts found.</p></div>`;
        return;
    }

    // Store the last document for the next page
    lastVisiblePost = querySnapshot.docs[querySnapshot.docs.length - 1];

    const postCards = querySnapshot.docs.map(doc => {
        const post = doc.data();
        return `
            <a href="?id=${doc.id}" class="blog-post-card">
                <div>
                    <h3>${post.title}</h3>
                    <p class="post-excerpt mt-2">${post.shortDescription}</p>
                </div>
                <div class="post-footer">
                    <span>By <span class="font-semibold text-blue-300">${post.creatorUsername || 'Anonymous'}</span></span>
                    <span>${post.commentCount || 0} Comments</span>
                </div>
            </a>
        `;
    }).join('');

    listContainer.innerHTML = `<div id="post-cards-grid" class="grid grid-cols-1 md:grid-cols-2 gap-6">${postCards}</div>`;
    
    if (querySnapshot.docs.length === POSTS_PER_PAGE) {
        const loadMoreContainer = document.createElement('div');
        loadMoreContainer.className = 'text-center mt-12';
        loadMoreContainer.innerHTML = `<button id="load-more-btn" class="btn-primary">Load More Posts</button>`;
        listContainer.appendChild(loadMoreContainer);
        document.getElementById('load-more-btn').addEventListener('click', loadMorePosts);
    }
}

// Function to handle pagination
async function loadMorePosts() {
    const loadMoreBtn = document.getElementById('load-more-btn');
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Loading...';

    const postsCollection = collection(db, 'blogPosts');
    const q = query(postsCollection, 
        orderBy('createdAt', 'desc'), 
        startAfter(lastVisiblePost), 
        limit(POSTS_PER_PAGE)
    );
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        loadMoreBtn.parentElement.remove(); // No more posts, remove the button
        return;
    }

    lastVisiblePost = querySnapshot.docs[querySnapshot.docs.length - 1];

    const postCards = querySnapshot.docs.map(doc => {
        const post = doc.data();
        return `
            <a href="?id=${doc.id}" class="blog-post-card">
                <div>
                    <h3>${post.title}</h3>
                    <p class="post-excerpt mt-2">${post.shortDescription}</p>
                </div>
                <div class="post-footer">
                    <span>By <span class="font-semibold text-blue-300">${post.creatorUsername || 'Anonymous'}</span></span>
                    <span>${post.commentCount || 0} Comments</span>
                </div>
            </a>
        `;
    }).join('');

    document.getElementById('post-cards-grid').insertAdjacentHTML('beforeend', postCards);

    if (querySnapshot.docs.length < POSTS_PER_PAGE) {
        loadMoreBtn.parentElement.remove(); // This was the last page
    } else {
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = 'Load More Posts';
    }
}

// In ui.js

async function renderDetailView(postId) {
    const postDocRef = doc(db, 'blogPosts', postId);
    const postSnap = await getDoc(postDocRef);
    const post = postSnap.data();
    const postDate = post.createdAt?.toDate().toLocaleDateString() || 'A long time ago...';
    
    let adminControls = '';
    if (currentUser && (post.creatorId === currentUser.uid || userRoles.includes('admin'))) {
        adminControls = `
            <div class="my-6 p-4 bg-slate-900/50 rounded-lg flex gap-4 justify-center items-center">
                ${post.creatorId === currentUser.uid ? '<button id="edit-post-btn" class="btn-primary">Edit Post</button>' : ''}
                <button id="delete-post-btn" class="btn-danger">Delete Post</button>
            </div>
        `;
    }

    let squadHtml = '';
    if (post.highlightedSquadId) {
        const squad = ALL_SQUADS.find(s => s.id === post.highlightedSquadId);
        if (squad) {
             const memberImages = squad.members.map(member => {
                const champion = ALL_CHAMPIONS.find(c => c.id === member.dbChampionId);
                const imageUrl = champion?.cardImageUrl || '/img/champions/cards/default.png';
                return `<img src="${imageUrl}" alt="${champion?.name || 'Champion'}" class="squad-character-art" onerror="this.onerror=null;this.src='/img/champions/cards/default.png';">`;
            }).join('');
            squadHtml = `
                <a href="/squads.html?id=${squad.id}" class="embedded-squad-banner">
                    <div class="embedded-squad-banner-header">
                        <h4>Featured Squad: ${squad.name}</h4>
                        <p>${squad.shortDescription}</p>
                    </div>
                    <div class="squad-character-art-container">${memberImages}</div>
                </a>`;
        }
    }
    
    let championHtml = '';
    if (post.highlightedChampionId) {
        const champion = ALL_CHAMPIONS.find(c => c.id === post.highlightedChampionId);
        if (champion) {
            championHtml = `
                <div class="embedded-champion-card">
                    <img 
                        src="${champion.cardImageUrl}" 
                        class="featured-champion-image" 
                        alt="Featured Champion: ${champion.name}" 
                        onerror="this.onerror=null;this.src='/img/champions/cards/default.png';"
                    >
                </div>
            `;
        }
    }
    
    let sanitizedContent = DOMPurify.sanitize(post.longDescription, {ADD_TAGS: ["iframe"], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling']});

    sanitizedContent = sanitizedContent.replace(/\[FEATURED_SQUAD\]/g, squadHtml);
    sanitizedContent = sanitizedContent.replace(/\[FEATURED_CHAMPION\]/g, championHtml);

    detailContainer.innerHTML = `
        <header class="py-8 text-center">
            <h1 class="text-5xl font-extrabold mb-4 glowing-text text-white">${post.title}</h1>
            <p class="text-xl text-blue-200">By ${post.creatorUsername} on ${postDate}</p>
        </header>
        ${adminControls}
        <div class="blog-post-content prose lg:prose-xl max-w-none mb-10">${sanitizedContent}</div>
        <div id="comments-section"></div>

        <div class="text-center my-12">
            <a href="/blog.html" class="btn-secondary">&larr; Back to All Posts</a>
        </div>
    `;
    
    if (currentUser && (post.creatorId === currentUser.uid || userRoles.includes('admin'))) {
        if (document.getElementById('edit-post-btn')) {
            document.getElementById('edit-post-btn').addEventListener('click', () => openEditModal(postId, post));
        }
        document.getElementById('delete-post-btn').addEventListener('click', () => handleDeletePost(postId));
    }

    await renderComments(postId, post);
}

async function renderComments(postId, post) {
    const commentsContainerEl = document.getElementById('comments-section');
    if (!commentsContainerEl) {
        return; // Stop execution if the main container is missing
    }

    let formHtml = `<p class="text-center text-slate-400">You must be logged in to leave a comment.</p>`;
    if (currentUser && !currentUser.isAnonymous) {
        formHtml = `
            <form id="comment-form" class="mb-8">
                <h4 class="text-xl font-bold mb-4">Leave a Comment</h4>
                <textarea id="comment-text" required placeholder="Share your thoughts..."></textarea>
                <div class="text-right mt-4">
                    <button type="submit" class="btn-primary">Submit Comment</button>
                </div>
            </form>
        `;
    }

    const commentsCollection = collection(db, 'blogPosts', postId, 'comments');
    const q = query(commentsCollection, orderBy('createdAt', 'asc'));
    const commentsSnapshot = await getDocs(q);
    
    const commentsHtml = commentsSnapshot.docs.map(doc => {
        const comment = doc.data();

        const commentDate = comment.createdAt && typeof comment.createdAt.toDate === 'function' 
            ? comment.createdAt.toDate().toLocaleString() 
            : 'Just now';
        
        let deleteBtn = '';
        if (currentUser && (comment.authorId === currentUser.uid || post.creatorId === currentUser.uid || userRoles.includes('admin'))) {
            deleteBtn = `<button class="delete-comment-btn" data-comment-id="${doc.id}" title="Delete comment"><i class="fas fa-trash"></i></button>`;
        }

        return `
            <div class="comment">
                <img src="${comment.authorAvatar || '/img/champions/avatars/dc_logo.webp'}" alt="${comment.authorName}" class="comment-author-avatar">
                <div class="comment-body">
                    <div class="comment-header">
                        <span class="comment-author-name">${comment.authorName}</span>
                        <div class="flex items-center gap-4">
                            <span class="comment-date">${commentDate}</span>
                            <div class="comment-actions">${deleteBtn}</div>
                        </div>
                    </div>
                    <p class="comment-text">${comment.text}</p>
                </div>
            </div>
        `;
    }).join('');
    
    commentsContainerEl.innerHTML = `
        <h3 class="guide-section-title">Comments (${commentsSnapshot.size})</h3>
        <div class="comments-container">
            ${formHtml}
            <div id="comments-list">${commentsHtml || '<p class="text-slate-400 p-4">Be the first to comment!</p>'}</div>
        </div>
    `;

    if (currentUser && !currentUser.isAnonymous) {
        document.getElementById('comment-form').addEventListener('submit', (e) => handleCommentSubmit(e, postId));
    }
    
    document.querySelectorAll('.delete-comment-btn').forEach(btn => {
        btn.addEventListener('click', () => handleDeleteComment(postId, btn.dataset.commentId));
    });
}

// --- FORM & MODAL HANDLING ---

function initWysiwygEditor(initialContent = '') {
    tinymce.remove('textarea#post-long-desc');
    tinymce.init({
        selector: 'textarea#post-long-desc',
        plugins: 'lists link image media table code help wordcount',
        toolbar: 'undo redo | blocks | bold italic | alignleft aligncenter alignright | bullist numlist | link image media | code | help',
        skin: 'oxide-dark',
        content_css: 'dark',
        height: 400,
        setup: editor => {
            editor.on('init', () => editor.setContent(initialContent));
        }
    });
}

function populateModalSelectors(selectedSquad = '', selectedChampion = '') {
    const squadSelect = document.getElementById('squad-select');
    const championSelect = document.getElementById('champion-select');
    
    let squadOptions = '<option value="">-- None --</option>';
    ALL_SQUADS.sort((a,b) => a.name.localeCompare(b.name)).forEach(s => {
        squadOptions += `<option value="${s.id}" ${s.id === selectedSquad ? 'selected' : ''}>${s.name}</option>`;
    });
    squadSelect.innerHTML = squadOptions;

    let championOptions = '<option value="">-- None --</option>';
    ALL_CHAMPIONS.sort((a,b) => a.name.localeCompare(b.name)).forEach(c => {
        championOptions += `<option value="${c.id}" ${c.id === selectedChampion ? 'selected' : ''}>${c.name}</option>`;
    });
    championSelect.innerHTML = championOptions;
}

function openCreateModal() {
    isEditMode = false;
    currentEditingPostId = null;
    createPostModal.querySelector('h2').textContent = 'Create New Post';
    createPostModal.querySelector('#submit-create-btn').textContent = 'Create Post';
    document.getElementById('create-post-form').reset();
    
    populateModalSelectors();
    initWysiwygEditor();
    
    createPostModal.classList.remove('hidden');
    createPostModal.classList.add('flex');
}

function openEditModal(postId, postData) {
    isEditMode = true;
    currentEditingPostId = postId;
    createPostModal.querySelector('h2').textContent = 'Edit Post';
    createPostModal.querySelector('#submit-create-btn').textContent = 'Update Post';
    
    document.getElementById('post-title').value = postData.title;
    document.getElementById('post-short-desc').value = postData.shortDescription;
    
    populateModalSelectors(postData.highlightedSquadId, postData.highlightedChampionId);
    initWysiwygEditor(postData.longDescription);
    
    createPostModal.classList.remove('hidden');
    createPostModal.classList.add('flex');
}

function closeCreateModal() {
    tinymce.remove('textarea#post-long-desc');
    createPostModal.classList.add('hidden');
    createPostModal.classList.remove('flex');
}

async function handleCreatePostSubmit(e) {
    e.preventDefault();
    const form = document.getElementById('create-post-form');
    const title = form.querySelector('#post-title').value.trim();
    const shortDescription = form.querySelector('#post-short-desc').value.trim();
    const longDescription = tinymce.get('post-long-desc').getContent();
    const highlightedSquadId = form.querySelector('#squad-select').value;
    const highlightedChampionId = form.querySelector('#champion-select').value;

    if (!title || !shortDescription || !longDescription) {
        showNotification("Title, Short Description, and Content are required.", "error");
        return;
    }

    const postData = {
        title,
        shortDescription,
        longDescription, // This will be sanitized on render, not on save
        highlightedSquadId: highlightedSquadId || null,
        highlightedChampionId: highlightedChampionId || null,
        updatedAt: serverTimestamp()
    };

    try {
        if (isEditMode) {
            const postDocRef = doc(db, 'blogPosts', currentEditingPostId);
            await updateDoc(postDocRef, postData);
            showNotification('Post updated successfully!', 'success');
        } else {
            postData.creatorId = currentUser.uid;
            postData.creatorUsername = currentUsername;
            postData.createdAt = serverTimestamp();
            postData.commentCount = 0;
            const postsCollection = collection(db, 'blogPosts');
            await addDoc(postsCollection, postData);
            showNotification('Post created successfully!', 'success');
        }
        closeCreateModal();
        setTimeout(() => location.reload(), 1000);
    } catch (error) {
        console.error("Error saving post:", error);
        showNotification('Failed to save post.', 'error');
    }
}

async function handleDeletePost(postId) {
    if (!confirm("Are you sure you want to PERMANENTLY delete this post? This action cannot be undone and will delete all associated comments.")) {
        return;
    }

    try {
        const postDocRef = doc(db, 'blogPosts', postId);
        await deleteDoc(postDocRef);
        showNotification("Post deleted successfully. You will be redirected.", "success");
        setTimeout(() => {
            window.location.href = '/blog.html';
        }, 2000);
    } catch (error) {
        console.error("Error deleting post: ", error);
        showNotification("Failed to delete post.", "error");
    }
}

async function handleCommentSubmit(e, postId) {
    e.preventDefault();
    const text = document.getElementById('comment-text').value.trim();
    if (!text) return;

    const commentData = {
        text,
        authorId: currentUser.uid,
        authorName: currentUsername,
        authorAvatar: creatorProfile.logo || '/img/champions/avatars/dc_logo.webp',
        createdAt: serverTimestamp()
    };

    try {
        // The client's only job is to create the comment document.
        const commentsCollection = collection(db, 'blogPosts', postId, 'comments');
        await addDoc(commentsCollection, commentData);

        // The Cloud Function will handle the counter. The client just needs to re-render.
        await renderComments(postId);
        showNotification("Comment added successfully!", "success");

    } catch (dbError) {
        showNotification("Failed to add comment. Check permissions.", "error");
    }
}

async function handleDeleteComment(postId, commentId) {
    if (!confirm("Are you sure you want to delete this comment? This action cannot be undone.")) {
        return;
    }

    try {
        // The client's only job is to delete the comment document.
        const commentDocRef = doc(db, 'blogPosts', postId, 'comments', commentId);
        await deleteDoc(commentDocRef);
        
        // The Cloud Function will handle the counter. The client just needs to re-render.
        await renderComments(postId);
        showNotification("Comment deleted.", "success");

    } catch (dbError) {
        showNotification("Failed to delete comment.", "error");
    }
}

// --- HELPERS ---
function showNotification(message, type = 'info') {
    const event = new CustomEvent('show-toast', { detail: { message, type } });
    document.dispatchEvent(event);
}