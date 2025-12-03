// const BACKEND_URL = 'https://pythonplaidbackend-production.up.railway.app'; // Production backend
const BACKEND_URL = 'http://127.0.0.1:3000'; // Local backend for development

// Global variables
let authToken = localStorage.getItem('authToken');
let refreshToken = localStorage.getItem('refreshToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
let idleTimeout;

// Idle timeout settings (30 minutes of inactivity)
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds

// Show appropriate view on page load
$(document).ready(function() {
  if (authToken && currentUser) {
    showDashboard();
  } else {
    showLogin();
  }
});

function showLogin() {
  $('#login-view').removeClass('hidden');
  $('#register-view').addClass('hidden');
  $('#dashboard-view').addClass('hidden');
  clearMessages();
}

function showRegister() {
  $('#login-view').addClass('hidden');
  $('#register-view').removeClass('hidden');
  $('#dashboard-view').addClass('hidden');
  clearMessages();
}

function showDashboard() {
  $('#login-view').addClass('hidden');
  $('#register-view').addClass('hidden');
  $('#dashboard-view').removeClass('hidden');
  $('#user-email').text(currentUser.email);
  $('#user-name').text(`${currentUser.first_name || ''} ${currentUser.last_name || ''}`);
  clearMessages();
  
  // Load connected banks
  loadConnectedBanks();
  
  // Check approval status
  if (currentUser.approved === false) {
    $('#approval-message').show();
    $('#link-button').prop('disabled', true);
    $('#link-button').css('opacity', '0.5');
    $('#link-button').css('cursor', 'not-allowed');
    $('#unlink-button').prop('disabled', true);
    $('#unlink-button').css('opacity', '0.5');
    $('#unlink-button').css('cursor', 'not-allowed');
  } else {
    $('#approval-message').hide();
    $('#link-button').prop('disabled', false);
    $('#link-button').css('opacity', '1');
    $('#link-button').css('cursor', 'pointer');
    $('#unlink-button').prop('disabled', false);
    $('#unlink-button').css('opacity', '1');
    $('#unlink-button').css('cursor', 'pointer');
  }
  
  // Setup security features for logged-in users
  setupActivityListeners();
  resetIdleTimeout();
}

async function loadConnectedBanks() {
  try {
    const items = await getUserItems();
    const connectionsList = $('#connections-list');
    
    if (items.length === 0) {
      connectionsList.html('<p style="color: #666; font-style: italic; margin-bottom: 8px">No connected banks yet. Click "Connect New Bank" to get started.</p>');
      return;
    }
    
    let html = '<ul style="list-style: none; padding: 0; margin: 0;">';
    items.forEach(item => {
      const instName = item.institution_name || 'Unknown Bank';
      const itemId = item.plaid_item_id;
      html += `
        <li style="
          margin-bottom: 8px; 
          padding: 12px 16px; 
          background: linear-gradient(135deg, #f0f4ff 0%, #e8f2ff 100%);
          border: 1px solid #667eea20;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight: 500;
          color: #333;
          box-shadow: 0 2px 4px rgba(102, 126, 234, 0.1);
          transition: transform 0.2s, box-shadow 0.2s;
        "
        onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 8px rgba(102, 126, 234, 0.15)';"
        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(102, 126, 234, 0.1)';">
          <div style="display: flex; align-items: center;">
            <span style="font-size: 18px; margin-right: 12px;">🏦</span>
            <span>${instName}</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <button 
              onclick="reconnectBank('${itemId}', '${instName.replace(/'/g, "\\'")}')"
              style="
                background: #28a745;
                color: white;
                border: none;
                border-radius: 50%;
                width: 28px;
                height: 28px;
                font-size: 20px;
                font-weight: normal;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s, transform 0.1s;
                padding: 0;
                line-height: 1;
              "
              onmouseover="this.style.background='#218838'; this.style.transform='scale(1.1)';"
              onmouseout="this.style.background='#28a745'; this.style.transform='scale(1)';"
              title="Reconnect/Update ${instName}"
            >↻</button>
            <button 
              onclick="disconnectBank('${itemId}', '${instName.replace(/'/g, "\\'")}')"
              style="
                background: #dc3545;
                color: white;
                border: none;
                border-radius: 50%;
                width: 28px;
                height: 28px;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s, transform 0.1s;
                padding: 0;
                line-height: 1;
              "
              onmouseover="this.style.background='#c82333'; this.style.transform='scale(1.1)';"
              onmouseout="this.style.background='#dc3545'; this.style.transform='scale(1)';"
              title="Disconnect ${instName}"
            >✕</button>
          </div>
        </li>`;
    });
    html += '</ul>';
    
    connectionsList.html(html);
  } catch (error) {
    console.error('Error loading connected banks:', error);
    $('#connections-list').html('<p style="color: #c33;">Error loading connected banks. Please try again.</p>');
  }
}

function clearMessages() {
  $('#login-message, #register-message, #dashboard-message').html('');
}

function showMessage(containerId, message, type) {
  $(`#${containerId}`).html(`<div class="message ${type}">${message}</div>`);
}

function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('currentUser');
  authToken = null;
  refreshToken = null;
  currentUser = null;
  showLogin();
}

async function refreshAccessToken() {
  if (!refreshToken) {
    logout(); // No refresh token, force logout
    return false;
  }
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    
    if (response.ok) {
      const data = await response.json();
      authToken = data.access_token;
      localStorage.setItem('authToken', authToken);
      resetIdleTimeout(); // Reset idle timer after successful refresh
      return true;
    } else {
      // Refresh token expired or invalid
      logout();
      return false;
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
    logout();
    return false;
  }
}

async function authenticatedFetch(url, options = {}) {
  // Add authorization header
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    ...options.headers
  };
  
  const response = await fetch(url, { ...options, headers });
  
  // If we get a 401, try to refresh the token
  if (response.status === 401) {
    console.log('Access token expired, attempting refresh...');
    const refreshed = await refreshAccessToken();
    
    if (refreshed) {
      // Retry the request with new token
      headers['Authorization'] = `Bearer ${authToken}`;
      return fetch(url, { ...options, headers });
    }
  }
  
  return response;
}

function resetIdleTimeout() {
  // Clear existing timeout
  if (idleTimeout) {
    clearTimeout(idleTimeout);
  }
  
  // Only set idle timeout if user is logged in
  if (authToken && currentUser) {
    idleTimeout = setTimeout(() => {
      console.log('Idle timeout reached - logging out for security');
      logout();
      alert('You have been logged out due to inactivity for security reasons.');
    }, IDLE_TIMEOUT);
  }
}

function setupActivityListeners() {
  // List of events that indicate user activity
  const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
  
  events.forEach(event => {
    document.addEventListener(event, resetIdleTimeout, true);
  });
}

// Login form handler
$('#login-form').on('submit', async function(e) {
  e.preventDefault();
  const email = $('#login-email').val();
  const password = $('#login-password').val();
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      authToken = data.access_token;
      currentUser = data.user;
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('refreshToken', data.refresh_token);
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      showDashboard();
    } else {
      showMessage('login-message', data.error || 'Login failed', 'error');
    }
  } catch (error) {
    showMessage('login-message', 'Connection error: ' + error.message, 'error');
  }
});

// Register form handler
$('#register-form').on('submit', async function(e) {
  e.preventDefault();
  const firstName = $('#register-firstname').val();
  const lastName = $('#register-lastname').val();
  const email = $('#register-email').val();
  const password = $('#register-password').val();
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        first_name: firstName,
        last_name: lastName
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      authToken = data.access_token;
      currentUser = data.user;
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('refreshToken', data.refresh_token);
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      showDashboard();
    } else {
      showMessage('register-message', data.error || 'Registration failed', 'error');
    }
  } catch (error) {
    showMessage('register-message', 'Connection error: ' + error.message, 'error');
  }
});

// Test connection button
$('#test-connection').on('click', async function() {
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    const data = await response.json();
    
    if (data.status === 'ok') {
      showMessage('dashboard-message', '✓ Backend connected successfully!', 'success');
    } else {
      showMessage('dashboard-message', '⚠ Unexpected response from backend', 'error');
    }
  } catch (error) {
    showMessage('dashboard-message', '✗ Connection failed: ' + error.message, 'error');
  }
});

// Plaid integration functions
async function fetchLinkToken(itemId = null, mode = 'standard') {
  let url = `${BACKEND_URL}/api/create_link_token?mode=${mode}`;
  if (itemId) {
    url += `&item_id=${encodeURIComponent(itemId)}`;
  }
  
  const response = await authenticatedFetch(url);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create link token');
  }
  
  const data = await response.json();
  return data.link_token;
}

async function getUserItems() {
  const response = await authenticatedFetch(`${BACKEND_URL}/api/items`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch items');
  }
  
  const data = await response.json();
  return data.items || [];
}

async function exchangePublicToken(public_token) {
  const response = await authenticatedFetch(`${BACKEND_URL}/api/set_access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ public_token: public_token })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Failed to connect bank');
  }
  
  return data;
}

// Connect bank account button
$('#link-button').on('click', async function() {
  if (!authToken) {
    showMessage('dashboard-message', 'Please login first', 'error');
    return;
  }
  
  try {
    // Always add new bank - use the green refresh button to update existing banks
    const isInvestment = $('#investment-mode').is(':checked');
    const mode = isInvestment ? 'investment' : 'standard';
    
    const linkToken = await fetchLinkToken(null, mode);
    const handler = Plaid.create({
      token: linkToken,
      onSuccess: async (public_token, metadata) => {
        try {
          // New connection - exchange token
          await exchangePublicToken(public_token);
          showMessage('dashboard-message', '✓ Bank connected successfully!', 'success');
          // Refresh connected banks list
          loadConnectedBanks();
        } catch (error) {
          showMessage('dashboard-message', 'Error: ' + error.message, 'error');
        }
      },
      onLoad: () => {
        // Link is ready
      },
      onExit: (err, metadata) => {
        if (err != null) {
          console.error('Plaid Link Error:', err);
          showMessage('dashboard-message', 'Connection cancelled or failed', 'error');
        }
      },
      onEvent: (eventName, metadata) => {
        console.log('Plaid Event:', eventName);
      }
    });
    handler.open();
  } catch (error) {
    showMessage('dashboard-message', 'Error: ' + error.message, 'error');
  }
});

// Reconnect/update bank function
async function reconnectBank(itemId, bankName) {
  if (!authToken) {
    showMessage('dashboard-message', 'Please login first', 'error');
    return;
  }
  
  try {
    // For reconnection, we always use standard mode (user can use "Connect New Bank" for investment accounts)
    const linkToken = await fetchLinkToken(itemId, 'standard');
    const handler = Plaid.create({
      token: linkToken,
      onSuccess: async (public_token, metadata) => {
        console.log('Update mode metadata:', metadata);  // ADD THIS
        console.log('Accounts in metadata:', metadata.accounts);  // AND THIS
  
        try {
          // Update mode - refresh accounts from Plaid (user may have changed account selection)
          const response = await authenticatedFetch(`${BACKEND_URL}/api/refresh_item_accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_id: itemId })
          });
          
          if (response.ok) {
            const data = await response.json();
            let message = `✓ ${bankName} reconnected successfully!`;
            
            if (data.accounts_added > 0 || data.accounts_removed > 0) {
              const changes = [];
              if (data.accounts_added > 0) changes.push(`${data.accounts_added} account(s) added`);
              if (data.accounts_removed > 0) changes.push(`${data.accounts_removed} account(s) removed`);
              message += ` (${changes.join(', ')})`;
            }
            
            showMessage('dashboard-message', message, 'success');
          } else {
            showMessage('dashboard-message', `✓ ${bankName} reconnected, but failed to refresh accounts`, 'success');
          }
          
          // Refresh connected banks list
          loadConnectedBanks();
        } catch (error) {
          showMessage('dashboard-message', 'Error: ' + error.message, 'error');
        }
      },
      onLoad: () => {
        // Link is ready
      },
      onExit: (err, metadata) => {
        if (err != null) {
          console.error('Plaid Link Error:', err);
          showMessage('dashboard-message', 'Reconnection cancelled or failed', 'error');
        }
      },
      onEvent: (eventName, metadata) => {
        console.log('Plaid Event:', eventName);
      }
    });
    handler.open();
  } catch (error) {
    showMessage('dashboard-message', 'Error: ' + error.message, 'error');
  }
}

// Disconnect individual bank function
async function disconnectBank(itemId, bankName) {
  if (!authToken) {
    showMessage('dashboard-message', 'Please login first', 'error');
    return;
  }
  
  // Confirm before disconnecting
  if (!confirm(`⚠️ WARNING: Disconnect ${bankName}?\n\nIf you're having connection issues or need to update your credentials, use "Connect New Bank" instead and select this bank to reconnect.\n\nDisconnecting and then reconnecting as a NEW bank will incur additional Plaid fees.\n\nAre you sure you want to permanently disconnect ${bankName}?`)) {
    return;
  }
  
  try {
    const response = await authenticatedFetch(`${BACKEND_URL}/api/remove_item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showMessage('dashboard-message', '✓ Bank disconnected successfully!', 'success');
      // Refresh connected banks list
      loadConnectedBanks();
    } else {
      showMessage('dashboard-message', 'Error: ' + (data.error || 'Failed to disconnect bank'), 'error');
    }
  } catch (error) {
    showMessage('dashboard-message', 'Error: ' + error.message, 'error');
  }
}

// Handle OAuth redirect
(async function handleOauthReturn() {
  if (!window.location.href.includes('?oauth_state_id=')) return;
  if (!authToken) return;
  
  try {
    const linkToken = await fetchLinkToken();
    const handler = Plaid.create({
      token: linkToken,
      receivedRedirectUri: window.location.href,
      onSuccess: async (public_token, metadata) => {
        try {
          await exchangePublicToken(public_token);
          showMessage('dashboard-message', '✓ Bank connected successfully!', 'success');
        } catch (error) {
          showMessage('dashboard-message', 'Error: ' + error.message, 'error');
        }
      },
      onLoad: () => {},
      onExit: (err, metadata) => {
        if (err != null) console.error('OAuth Error:', err);
      },
      onEvent: (eventName, metadata) => {
        console.log('Event:', eventName);
      }
    });
    handler.open();
  } catch (err) {
    console.error('Error handling OAuth redirect:', err);
  }
})();