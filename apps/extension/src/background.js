// Background service worker to handle API requests
// This avoids CORS and CSP issues on the content script side

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'FETCH_ANNOTATIONS') {
    fetchAnnotations(request.url)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep the message channel open for async response
  }
  
  if (request.type === 'POST_ANNOTATION') {
    postAnnotation(request.payload)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

const API_BASE_URL = 'http://localhost:8080';

async function fetchAnnotations(url) {
  try {
    // Encode the URL to handle special characters
    const encodedUrl = encodeURIComponent(url);
    const response = await fetch(`${API_BASE_URL}/api/annotations?url=${encodedUrl}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Background fetch error:', error);
    throw error;
  }
}

async function postAnnotation(payload) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Background post error:', error);
    throw error;
  }
}
