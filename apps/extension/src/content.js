console.log('Commi Extension: Content Script Loaded (Version 3)');

// Configuration
const POLL_INTERVAL = 5000; // 5 seconds

// State
let currentVideoId = null;
let isSidebarVisible = true;
let pollIntervalId = null;

// --- DOM Manipulation ---

function createSidebar() {
  if (document.getElementById('commi-sidebar')) return;

  const sidebar = document.createElement('div');
  sidebar.id = 'commi-sidebar';
  sidebar.innerHTML = `
    <div id="commi-header">
      <h2>Commi Comments</h2>
      <div class="commi-header-actions">
        <button id="commi-reload-btn" title="Reload Comments">↻</button>
        <button id="commi-toggle-btn">×</button>
      </div>
    </div>
    <div id="commi-comments-list">
      <div style="text-align: center; color: #aaa; margin-top: 20px;">Loading comments...</div>
    </div>
    <div id="commi-input-area">
      <textarea id="commi-comment-input" placeholder="Add a comment..."></textarea>
      <button id="commi-submit-btn">Comment</button>
    </div>
  `;

  document.body.appendChild(sidebar);

  // Event Listeners
  document.getElementById('commi-toggle-btn').addEventListener('click', toggleSidebar);
  document.getElementById('commi-reload-btn').addEventListener('click', () => {
    const list = document.getElementById('commi-comments-list');
    if (list) list.innerHTML = '<div style="text-align: center; color: #aaa; margin-top: 20px;">Reloading...</div>';
    fetchComments();
  });
  document.getElementById('commi-submit-btn').addEventListener('click', handleSubmitComment);
  
  // Floating toggle button
  const floatingBtn = document.createElement('button');
  floatingBtn.id = 'commi-floating-toggle';
  floatingBtn.innerHTML = '💬';
  floatingBtn.title = 'Toggle Commi Comments';
  floatingBtn.style.display = 'none'; // Hidden initially if sidebar is open
  floatingBtn.addEventListener('click', toggleSidebar);
  document.body.appendChild(floatingBtn);

  updateSidebarVisibility();
}

function toggleSidebar() {
  isSidebarVisible = !isSidebarVisible;
  updateSidebarVisibility();
}

function updateSidebarVisibility() {
  const sidebar = document.getElementById('commi-sidebar');
  const floatingBtn = document.getElementById('commi-floating-toggle');
  
  if (isSidebarVisible) {
    sidebar.classList.remove('hidden');
    floatingBtn.style.display = 'none';
  } else {
    sidebar.classList.add('hidden');
    floatingBtn.style.display = 'flex';
  }
}

function renderComments(comments) {
  const list = document.getElementById('commi-comments-list');
  if (!list) return;

  if (comments.length === 0) {
    list.innerHTML = '<div style="text-align: center; color: #aaa; margin-top: 20px;">No comments yet. Be the first!</div>';
    return;
  }

  // Simple diffing: clear and rebuild for now (optimization: append only new ones)
  // For a smoother experience, we should check IDs, but this is MVP.
  list.innerHTML = comments.map(comment => `
    <div class="commi-comment">
      <div class="commi-comment-author">${escapeHtml(comment.author || 'Anonymous')}</div>
      <div class="commi-comment-text">${escapeHtml(comment.text)}</div>
      <div class="commi-comment-time">${new Date(comment.timestamp).toLocaleTimeString()}</div>
    </div>
  `).join('');
  
  // Scroll to bottom if it's the first load or user was at bottom? 
  // For now, let's just keep position unless it's first load.
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Logic & API ---

function getVideoId() {
  const urlParams = new URLSearchParams(globalThis.location.search);
  return urlParams.get('v');
}

async function fetchComments() {
  if (!currentVideoId) return;

  try {
    const response = await chrome.runtime.sendMessage({ 
      type: 'FETCH_COMMENTS', 
      videoId: currentVideoId 
    });
    
    if (response.success) {
      renderComments(response.data);
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('[Commi] Error fetching comments:', error);
    const list = document.getElementById('commi-comments-list');
    if(list) list.innerHTML = '<div style="color: red; text-align: center;">Error loading comments.</div>';
  }
}

async function handleSubmitComment() {
  const input = document.getElementById('commi-comment-input');
  const text = input.value.trim();
  if (!text || !currentVideoId) return;

  const btn = document.getElementById('commi-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Posting...';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'POST_COMMENT',
      payload: { videoId: currentVideoId, text, author: 'You' }
    });

    if (response.success) {
      input.value = '';
      fetchComments(); // Refresh list
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('[Commi] Error posting comment:', error);
    alert('Failed to post comment');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Comment';
  }
}

function startCommi() {
 const newVideoId = getVideoId();
  
  if (newVideoId && newVideoId !== currentVideoId) {
    currentVideoId = newVideoId;
    console.log('[Commi] Video detected:', currentVideoId);
    
    createSidebar();
    fetchComments();
    
    // Start polling
    if (pollIntervalId) clearInterval(pollIntervalId);
    pollIntervalId = setInterval(fetchComments, POLL_INTERVAL);
  } else if (!newVideoId) {
    // Not a video page, maybe hide sidebar?
    currentVideoId = null;
    const sidebar = document.getElementById('commi-sidebar');
    if (sidebar) sidebar.style.display = 'none';
    if (pollIntervalId) clearInterval(pollIntervalId);
  } else {
    // Same video, ensure sidebar is visible if it was hidden by navigation logic
    const sidebar = document.getElementById('commi-sidebar');
    if (sidebar) sidebar.style.display = 'flex';
  }
}

// YouTube is an SPA, so we need to listen for navigation events.
// The 'yt-navigate-finish' event is specific to YouTube's Polymer app, 
// but standard history API monitoring is safer.
let lastUrl = location.href; 
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    startCommi();
  }
}).observe(document, {subtree: true, childList: true});

// Initial run
startCommi();
