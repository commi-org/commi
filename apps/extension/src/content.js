console.log('Commi Extension: Content Script Loaded (ActivityPub Edition)');

// Configuration
const POLL_INTERVAL = 5000; // 5 seconds

// State
let currentUrl = null;
let isSidebarVisible = true;
let pollIntervalId = null;
let currentUser = null;

// --- DOM Manipulation ---

function createSidebar() {
  if (document.getElementById('commi-sidebar')) return;

  const sidebar = document.createElement('div');
  sidebar.id = 'commi-sidebar';
  sidebar.innerHTML = `
    <div id="commi-header">
      <h2>Commi Annotations</h2>
      <div class="commi-header-actions">
        <button id="commi-auth-btn" title="Login/Register" style="margin-right: 5px;"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></button>
        <button id="commi-reload-btn" title="Reload"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>
        <button id="commi-toggle-btn"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
      </div>
    </div>
    <div id="commi-auth-panel" style="display: none; padding: 10px; background: #f9f9f9; border-bottom: 1px solid #eee;">
      <!-- Auth Form Injected Here -->
    </div>
    <div id="commi-comments-list">
      <div style="text-align: center; color: #aaa; margin-top: 20px;">Loading annotations...</div>
    </div>
    <div id="commi-input-area">
      <div id="commi-context-preview" style="font-size: 0.8em; color: #666; margin-bottom: 5px; display: none;"></div>
      <textarea id="commi-comment-input" placeholder="Add an annotation..."></textarea>
      <div style="display: flex; justify-content: space-between; margin-top: 5px;">
        <button id="commi-attach-btn" title="Attach Context (Selection/Time)" style="display: flex; align-items: center;"><svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 24 24" width="18" fill="currentColor" style="margin-right: 4px;"><path d="M0 0h24v24H0z" fill="none"/><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg> Attach Context</button>
        <button id="commi-submit-btn">Post</button>
      </div>
    </div>
  `;

  document.body.appendChild(sidebar);

  // Event Listeners
  document.getElementById('commi-toggle-btn').addEventListener('click', toggleSidebar);
  document.getElementById('commi-reload-btn').addEventListener('click', () => {
    const list = document.getElementById('commi-comments-list');
    if (list) list.innerHTML = '<div style="text-align: center; color: #aaa; margin-top: 20px;">Reloading...</div>';
    fetchAnnotations();
  });
  document.getElementById('commi-auth-btn').addEventListener('click', toggleAuthPanel);
  document.getElementById('commi-submit-btn').addEventListener('click', handleSubmitAnnotation);
  document.getElementById('commi-attach-btn').addEventListener('click', handleAttachContext);
  
  // Floating toggle button
  const floatingBtn = document.createElement('button');
  floatingBtn.id = 'commi-floating-toggle';
  floatingBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>';
  floatingBtn.title = 'Toggle Commi';
  floatingBtn.style.display = 'none'; 
  floatingBtn.addEventListener('click', toggleSidebar);
  document.body.appendChild(floatingBtn);

  updateSidebarVisibility();
  checkLoginStatus();
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

function toggleAuthPanel() {
  const panel = document.getElementById('commi-auth-panel');
  if (panel.style.display === 'none') {
    renderAuthForm();
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
}

function renderAuthForm() {
  const panel = document.getElementById('commi-auth-panel');
  if (currentUser) {
    panel.innerHTML = `
      <div style="margin-bottom: 10px;">Logged in as <strong>${escapeHtml(currentUser.username)}</strong></div>
      <button id="commi-logout-btn" style="width: 100%; background: #f44336; color: white; border: none; padding: 8px; cursor: pointer;">Logout</button>
    `;
    document.getElementById('commi-logout-btn').addEventListener('click', handleLogout);
  } else {
    panel.innerHTML = `
      <div style="margin-bottom: 10px; font-weight: bold;">Login / Register</div>
      <input type="text" id="commi-auth-username" placeholder="Username" style="width: 100%; margin-bottom: 5px; padding: 5px;">
      <input type="email" id="commi-auth-email" placeholder="Email (Register only)" style="width: 100%; margin-bottom: 5px; padding: 5px;">
      <input type="password" id="commi-auth-password" placeholder="Password" style="width: 100%; margin-bottom: 5px; padding: 5px;">
      <div style="display: flex; gap: 5px;">
        <button id="commi-login-btn" style="flex: 1; background: #2196f3; color: white; border: none; padding: 8px; cursor: pointer;">Login</button>
        <button id="commi-register-btn" style="flex: 1; background: #4caf50; color: white; border: none; padding: 8px; cursor: pointer;">Register</button>
      </div>
      <div id="commi-auth-error" style="color: red; font-size: 0.8em; margin-top: 5px;"></div>
    `;
    document.getElementById('commi-login-btn').addEventListener('click', handleLogin);
    document.getElementById('commi-register-btn').addEventListener('click', handleRegister);
  }
}

async function checkLoginStatus() {
  try {
    const response = await sendMessageSafe({ type: 'GET_USER' });
    if (response.success && response.data) {
      currentUser = response.data;
      document.getElementById('commi-auth-btn').style.color = '#4caf50'; // Green if logged in
    } else {
      currentUser = null;
      document.getElementById('commi-auth-btn').style.color = 'inherit';
    }
  } catch (e) {
    console.error("Auth check failed", e);
  }
}

async function handleLogin() {
  const username = document.getElementById('commi-auth-username').value;
  const password = document.getElementById('commi-auth-password').value;
  const errorDiv = document.getElementById('commi-auth-error');
  
  errorDiv.textContent = '';
  if (!username || !password) {
    errorDiv.textContent = 'Username and password required';
    return;
  }

  try {
    const response = await sendMessageSafe({ 
      type: 'LOGIN', 
      username, 
      password 
    });
    
    if (response.success) {
      await checkLoginStatus();
      toggleAuthPanel();
    } else {
      errorDiv.textContent = response.error;
    }
  } catch (e) {
    errorDiv.textContent = e.message;
  }
}

async function handleRegister() {
  const username = document.getElementById('commi-auth-username').value;
  const email = document.getElementById('commi-auth-email').value;
  const password = document.getElementById('commi-auth-password').value;
  const errorDiv = document.getElementById('commi-auth-error');
  
  errorDiv.textContent = '';
  if (!username || !email || !password) {
    errorDiv.textContent = 'All fields required';
    return;
  }

  try {
    const response = await sendMessageSafe({ 
      type: 'REGISTER', 
      username, 
      email, 
      password 
    });
    
    if (response.success) {
      await checkLoginStatus();
      toggleAuthPanel();
    } else {
      errorDiv.textContent = response.error;
    }
  } catch (e) {
    errorDiv.textContent = e.message;
  }
}

async function handleLogout() {
  alert("Logout not fully implemented. Please clear extension data.");
}

function renderAnnotations(annotations) {
  const list = document.getElementById('commi-comments-list');
  if (!list) return;

  if (annotations.length === 0) {
    list.innerHTML = '<div style="text-align: center; color: #aaa; margin-top: 20px;">No annotations yet. Be the first!</div>';
    return;
  }

  // 1. Build a map of all notes by ID for easy lookup
  const noteMap = new Map();
  annotations.forEach(note => noteMap.set(note.id, note));

  // 2. Group replies by their parent ID
  const repliesMap = new Map();
  const rootNotes = [];

  annotations.forEach(note => {
    if (note.inReplyTo && noteMap.has(note.inReplyTo)) {
      if (!repliesMap.has(note.inReplyTo)) {
        repliesMap.set(note.inReplyTo, []);
      }
      repliesMap.get(note.inReplyTo).push(note);
    } else {
      rootNotes.push(note);
    }
  });

  // Sort roots by date (newest first)
  rootNotes.sort((a, b) => new Date(b.published) - new Date(a.published));

  // 3. Recursive render function
  function renderNote(note, depth = 0) {
    let contextHtml = '';
    if (note.target && note.target.selector) {
      const s = note.target.selector;
      if (s.type === 'TextQuoteSelector') {
        contextHtml = `<div class="commi-context-quote">"${escapeHtml(s.exact)}"</div>`;
      } else if (s.type === 'TimestampSelector') {
        contextHtml = `<div class="commi-context-time"><svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 0 24 24" width="14" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M0 0h24v24H0z" fill="none"/><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg> ${s.start}</div>`;
      }
    }

    const isReply = depth > 0;
    const replyStyle = isReply ? `margin-left: ${depth * 20}px; border-left: 2px solid #eee; padding-left: 10px;` : '';
    const replyLabel = isReply ? '<div style="font-size: 0.7em; color: #888; margin-bottom: 2px;">↳ Reply</div>' : '';

    let html = `
    <div class="commi-comment" style="${replyStyle}">
      ${replyLabel}
      <div class="commi-comment-author">${escapeHtml(note.attributedTo || 'Anonymous')}</div>
      ${contextHtml}
      <div class="commi-comment-text">${escapeHtml(note.content)}</div>
      <div class="commi-comment-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px;">
        <div class="commi-comment-time" style="font-size: 0.8em; color: #aaa;">${new Date(note.published).toLocaleTimeString()}</div>
        <button class="commi-reply-btn" data-id="${note.id}" style="background: none; border: none; color: #2196f3; cursor: pointer; font-size: 0.8em;">Reply</button>
      </div>
    </div>
    `;

    // Render children
    if (repliesMap.has(note.id)) {
      const children = repliesMap.get(note.id);
      // Sort children oldest first (conversation flow)
      children.sort((a, b) => new Date(a.published) - new Date(b.published));
      children.forEach(child => {
        html += renderNote(child, depth + 1);
      });
    }

    return html;
  }

  list.innerHTML = rootNotes.map(note => renderNote(note)).join('');

  // Attach event listeners to reply buttons
  list.querySelectorAll('.commi-reply-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      console.log('Reply clicked for ID:', id);
      handleReply(id);
    });
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Logic & API ---

let currentSelector = null;
let replyToId = null;

function getSelector() {
  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 0) {
    return {
      type: 'TextQuoteSelector',
      exact: selection.toString().trim()
    };
  }
  
  const video = document.querySelector('video');
  if (video && !video.paused) {
    return {
      type: 'TimestampSelector',
      start: `PT${Math.floor(video.currentTime)}S`
    };
  }
  
  return null;
}

function handleAttachContext() {
  const selector = getSelector();
  const preview = document.getElementById('commi-context-preview');
  
  if (selector) {
    currentSelector = selector;
    preview.style.display = 'block';
    if (selector.type === 'TextQuoteSelector') {
      preview.textContent = `Selected: "${selector.exact.substring(0, 30)}..."`;
    } else {
      preview.textContent = `Timestamp: ${selector.start}`;
    }
  } else {
    alert('Select text or play a video to attach context.');
  }
}

function handleReply(id) {
  replyToId = id;
  const preview = document.getElementById('commi-context-preview');
  preview.style.display = 'block';
  preview.innerHTML = `Replying to annotation... <button id="commi-cancel-reply" style="font-size: 0.8em; margin-left: 5px;">Cancel</button>`;
  
  document.getElementById('commi-cancel-reply').addEventListener('click', () => {
    replyToId = null;
    preview.style.display = 'none';
    preview.textContent = '';
  });
  
  document.getElementById('commi-comment-input').focus();
}

async function handleSubmitAnnotation() {
  if (!currentUser) {
    alert("Please login to post annotations.");
    toggleAuthPanel();
    return;
  }

  const input = document.getElementById('commi-comment-input');
  const content = input.value.trim();
  
  if (!content) return;

  const payload = {
    content,
    inReplyTo: replyToId,
    target: {
      href: currentUrl,
      selector: currentSelector
    }
  };

  try {
    const response = await sendMessageSafe({ 
      type: 'POST_ANNOTATION', 
      payload 
    });

    if (response.success) {
      input.value = '';
      currentSelector = null;
      replyToId = null;
      document.getElementById('commi-context-preview').style.display = 'none';
      fetchAnnotations(); // Refresh list
    } else {
      alert('Failed to post: ' + response.error);
    }
  } catch (error) {
    console.error('Error posting annotation:', error);
    alert('Error posting annotation');
  }
}

function handleContextInvalidated() {
  if (pollIntervalId) clearInterval(pollIntervalId);
  const list = document.getElementById('commi-comments-list');
  if (list) {
    list.innerHTML = `
      <div style="text-align: center; color: #f44336; margin-top: 20px; padding: 10px;">
        <strong>Extension Updated</strong><br>
        Please refresh this page to reconnect Commi.
        <button id="commi-refresh-btn" style="margin-top: 10px; padding: 5px 10px; cursor: pointer;">Refresh Page</button>
      </div>
    `;
    const btn = document.getElementById('commi-refresh-btn');
    if(btn) btn.addEventListener('click', () => window.location.reload());
  }
}

async function sendMessageSafe(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (error.message && error.message.includes('Extension context invalidated')) {
      handleContextInvalidated();
      throw new Error('Extension context invalidated');
    }
    throw error;
  }
}

async function fetchAnnotations() {
  if (!currentUrl) return;
  
  try {
    const response = await sendMessageSafe({ 
      type: 'FETCH_ANNOTATIONS', 
      url: currentUrl 
    });

    if (response.success) {
      renderAnnotations(response.data);
    } else {
      console.error('Failed to fetch annotations:', response.error);
    }
  } catch (error) {
    if (error.message !== 'Extension context invalidated') {
      console.error('Error fetching annotations:', error);
    }
  }
}

// --- Initialization ---

function init() {
  // Check if we are on a valid page (e.g. YouTube)
  // For prototype, we run everywhere but only show if user toggles or if we detect content
  // But manifest limits to specific sites or all_urls.
  
  currentUrl = window.location.href;
  
  // Poll for URL changes (SPA navigation)
  setInterval(() => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      fetchAnnotations();
    }
  }, 1000);

  createSidebar();
  fetchAnnotations();

  // Poll for new annotations
  pollIntervalId = setInterval(fetchAnnotations, POLL_INTERVAL);
}

// Run
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
