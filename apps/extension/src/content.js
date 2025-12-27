console.log('Commi Extension: Content Script Loaded (ActivityPub Edition)');

// Configuration
const POLL_INTERVAL = 5000; // 5 seconds

// State
let currentUrl = null;
let isSidebarVisible = true;
let pollIntervalId = null;

// --- DOM Manipulation ---

function createSidebar() {
  if (document.getElementById('commi-sidebar')) return;

  const sidebar = document.createElement('div');
  sidebar.id = 'commi-sidebar';
  sidebar.innerHTML = `
    <div id="commi-header">
      <h2>Commi Annotations</h2>
      <div class="commi-header-actions">
        <button id="commi-reload-btn" title="Reload"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>
        <button id="commi-toggle-btn"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
      </div>
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

function renderAnnotations(annotations) {
  const list = document.getElementById('commi-comments-list');
  if (!list) return;

  if (annotations.length === 0) {
    list.innerHTML = '<div style="text-align: center; color: #aaa; margin-top: 20px;">No annotations yet. Be the first!</div>';
    return;
  }

  list.innerHTML = annotations.map(note => {
    let contextHtml = '';
    if (note.target && note.target.selector) {
      const s = note.target.selector;
      if (s.type === 'TextQuoteSelector') {
        contextHtml = `<div class="commi-context-quote">"${escapeHtml(s.exact)}"</div>`;
      } else if (s.type === 'TimestampSelector') {
        contextHtml = `<div class="commi-context-time"><svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 0 24 24" width="14" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M0 0h24v24H0z" fill="none"/><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg> ${s.start}</div>`;
      }
    }

    const isReply = !!note.inReplyTo;
    const replyStyle = isReply ? 'margin-left: 20px; border-left: 2px solid #eee; padding-left: 10px;' : '';
    const replyLabel = isReply ? '<div style="font-size: 0.7em; color: #888; margin-bottom: 2px;">↳ Reply</div>' : '';

    return `
    <div class="commi-comment" style="${replyStyle}">
      ${replyLabel}
      <div class="commi-comment-author">${escapeHtml(note.attributedTo || 'Anonymous')}</div>
      ${contextHtml}
      <div class="commi-comment-text">${escapeHtml(note.content)}</div>
      <div class="commi-comment-time">${new Date(note.published).toLocaleTimeString()}</div>
    </div>
  `}).join('');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Logic & API ---

let currentSelector = null;

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
    currentSelector = null;
    preview.style.display = 'none';
    alert('No text selected or video playing.');
  }
}

async function fetchAnnotations() {
  if (!currentUrl) return;

  try {
    const response = await chrome.runtime.sendMessage({ 
      type: 'FETCH_ANNOTATIONS', 
      url: currentUrl 
    });
    
    if (response.success) {
      renderAnnotations(response.data);
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('[Commi] Error fetching annotations:', error);
    const list = document.getElementById('commi-comments-list');
    if(list) list.innerHTML = '<div style="color: red; text-align: center;">Error loading annotations.</div>';
  }
}

async function handleSubmitAnnotation() {
  const input = document.getElementById('commi-comment-input');
  const text = input.value.trim();
  if (!text || !currentUrl) return;

  const btn = document.getElementById('commi-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Posting...';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'POST_ANNOTATION',
      payload: { 
        content: text, 
        target: {
          href: currentUrl,
          selector: currentSelector
        },
        author: 'me' // In real app, this comes from auth
      }
    });

    if (response.success) {
      input.value = '';
      currentSelector = null;
      document.getElementById('commi-context-preview').style.display = 'none';
      fetchAnnotations(); 
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('[Commi] Error posting annotation:', error);
    alert('Failed to post annotation');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Post';
  }
}

function startCommi() {
  // For this extension, we treat the whole URL as the target
  // But we strip query params if it's not a video? 
  // For YouTube, we want the video ID.
  // Let's just use the full URL for now as the "Target"
  currentUrl = location.href;
  
  console.log('[Commi] URL detected:', currentUrl);
  
  createSidebar();
  fetchAnnotations();
  
  if (pollIntervalId) clearInterval(pollIntervalId);
  pollIntervalId = setInterval(fetchAnnotations, POLL_INTERVAL);
}

// SPA Navigation
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
