// Background service worker to handle API requests
// This avoids CORS and CSP issues on the content script side

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'FETCH_ANNOTATIONS') {
    fetchAnnotations(request.url)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.type === 'POST_ANNOTATION') {
    postAnnotation(request.payload)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'LOGIN') {
    login(request.username, request.password)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'REGISTER') {
    register(request.username, request.email, request.password)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'GET_USER') {
    getUser()
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

const API_BASE_URL = 'http://localhost:8080';

async function getToken() {
  const result = await chrome.storage.local.get(['access_token']);
  return result.access_token;
}

async function fetchAnnotations(url) {
  try {
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
    const token = await getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/annotations`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    
    if (response.status === 401) {
      throw new Error("Unauthorized. Please log in.");
    }
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Background post error:', error);
    throw error;
  }
}

async function login(username, password) {
  const formData = new FormData();
  formData.append('grant_type', 'password');
  formData.append('username', username);
  formData.append('password', password);

  const response = await fetch(`${API_BASE_URL}/oauth/token`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Login failed');
  }

  const data = await response.json();
  await chrome.storage.local.set({ access_token: data.access_token });
  return data;
}

async function register(username, email, password) {
  const response = await fetch(`${API_BASE_URL}/api/v1/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Registration failed');
  }

  const data = await response.json();
  await chrome.storage.local.set({ access_token: data.access_token });
  return data;
}

async function getUser() {
  const token = await getToken();
  if (!token) return null;

  const response = await fetch(`${API_BASE_URL}/api/v1/accounts/verify_credentials`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    // Token invalid
    await chrome.storage.local.remove(['access_token']);
    return null;
  }

  return await response.json();
}
