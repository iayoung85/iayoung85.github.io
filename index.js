// BACKEND_URL is now defined in config.js and auto-detects environment

// Global variables
let authToken = localStorage.getItem('authToken');
let refreshToken = localStorage.getItem('refreshToken');
let currentUser = null;
try {
  currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
} catch (e) {
  console.error('Error parsing currentUser from localStorage', e);
  localStorage.removeItem('currentUser');
}
let idleTimeout;
let tempLoginCreds = null; // For 2FA login flow
let pageHiddenTime = null; // Track when page was hidden

// Idle timeout settings (30 minutes of inactivity)
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds

// Show appropriate view on page load
$(document).ready(async function() {
  console.log('Index page ready, waiting for backend URL...');
  try {
    await window.BACKEND_URL_PROMISE;
    console.log('Backend URL resolved:', window.BACKEND_URL);
    
    if (authToken && currentUser) {
      console.log('Auth token and user found, showing dashboard');
      showDashboard();
    } else {
      console.log('No auth token or user, showing login');
      showLogin();
    }
  } catch (e) {
    console.error('Error in initialization:', e);
    // Fallback to login if something goes wrong
    showLogin();
  }
});

function showLogin() {
  $('#login-view').removeClass('hidden');
  $('#register-view').addClass('hidden');
  $('#dashboard-view').addClass('hidden');
  $('#forgot-password-view').addClass('hidden');
  $('#two-factor-view').addClass('hidden');
  clearMessages();
}

async function showRegister() {
  try {
    // Check if registration is enabled
    const response = await fetch(`${BACKEND_URL}/api/registration-status`);
    if (response.ok) {
      const data = await response.json();
      if (!data.enabled) {
        alert('Sorry, registration is currently disabled.');
        return;
      }
    }
  } catch (error) {
    console.error('Error checking registration status:', error);
    // If we can't check status, we might want to fail safe or let them try (and fail at submit)
    // Given the requirement, let's fail safe if we can't verify it's enabled.
    alert('Unable to verify registration status. Please try again later.');
    return;
  }

  $('#login-view').addClass('hidden');
  $('#register-view').removeClass('hidden');
  $('#dashboard-view').addClass('hidden');
  $('#forgot-password-view').addClass('hidden');
  $('#two-factor-view').addClass('hidden');
  clearMessages();
}

function showDashboard() {
  $('#login-view').addClass('hidden');
  $('#register-view').addClass('hidden');
  $('#dashboard-view').removeClass('hidden');
  $('#forgot-password-view').addClass('hidden');
  $('#two-factor-view').addClass('hidden');
  $('#user-email').text(currentUser.email);
  $('#user-name').text(`${currentUser.first_name || ''} ${currentUser.last_name || ''}`);
  clearMessages();
  
  // Load connected banks
  loadConnectedBanks();
  
  // Update 2FA UI
  update2FAUI();
  
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

function showForgotPassword() {
  $('#login-view').addClass('hidden');
  $('#register-view').addClass('hidden');
  $('#dashboard-view').addClass('hidden');
  $('#forgot-password-view').removeClass('hidden');
  $('#two-factor-view').addClass('hidden');
  clearMessages();
}

function showTwoFactorLogin() {
  $('#login-view').addClass('hidden');
  $('#register-view').addClass('hidden');
  $('#dashboard-view').addClass('hidden');
  $('#forgot-password-view').addClass('hidden');
  $('#two-factor-view').removeClass('hidden');
  clearMessages();
  $('#two-factor-code').focus();
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
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    $('#connections-list').html(`<p style="color: #c33;">Error loading connected banks: ${error.message}</p>`);
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
      
      // Update refresh token if provided (Sliding Window)
      if (data.refresh_token) {
        refreshToken = data.refresh_token;
        localStorage.setItem('refreshToken', refreshToken);
      }
      
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
  
  // Handle page visibility changes (phone locked, browser tab hidden, etc.)
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

function handleVisibilityChange() {
  if (document.hidden) {
    // Page is now hidden (phone locked, tab switched, etc.)
    // Record the time and clear the timeout to save resources
    pageHiddenTime = Date.now();
    if (idleTimeout) {
      clearTimeout(idleTimeout);
      idleTimeout = null;
    }
  } else {
    // Page is now visible again
    if (pageHiddenTime && authToken && currentUser) {
      const timeHidden = Date.now() - pageHiddenTime;
      
      if (timeHidden >= IDLE_TIMEOUT) {
        // User was away for longer than idle timeout - log them out
        logout();
        alert('You have been logged out due to inactivity for security reasons.');
      } else {
        // User returned within timeout period - restart the timer
        pageHiddenTime = null;
        resetIdleTimeout();
      }
    } else if (authToken && currentUser) {
      // Page became visible but no hidden time was recorded - just reset
      resetIdleTimeout();
    }
  }
}

// Login form handler
$('#login-form').on('submit', async function(e) {
  e.preventDefault();
  const email = $('#login-email').val();
  const password = $('#login-password').val();
  
  try {
    console.log(`Attempting login for email: ${email} at ${BACKEND_URL}/api/login`);
    const response = await fetch(`${BACKEND_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      if (data.require_2fa) {
        // 2FA required - store credentials temporarily
        tempLoginCreds = { email, password };
        showTwoFactorLogin();
      } else {
        // Normal login success
        authToken = data.access_token;
        currentUser = data.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('refreshToken', data.refresh_token);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showDashboard();
      }
    } else {
      if (data.email_not_verified) {
        showMessage('login-message', `
          ${data.error}
          <div style="margin-top: 10px;">
            <button type="button" class="btn-link" onclick="resendVerification('${email}')" style="color: #667eea; text-decoration: underline; border: none; background: none; cursor: pointer; padding: 0;">
              Resend Verification Email
            </button>
          </div>
        `, 'error');
      } else {
        showMessage('login-message', data.error || 'Login failed', 'error');
      }
    }
  } catch (error) {
    console.error('Login error:', error);
    showMessage('login-message', 'Connection error: ' + error.message, 'error');
  }
});

// Resend verification email
async function resendVerification(email) {
  try {
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = 'Sending...';
    btn.disabled = true;
    
    const frontendUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
    
    const response = await fetch(`${BACKEND_URL}/api/resend_verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email,
        frontend_url: frontendUrl
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showMessage('login-message', 'Verification email sent! Please check your inbox.', 'success');
    } else {
      showMessage('login-message', data.error || 'Failed to send email', 'error');
    }
  } catch (error) {
    showMessage('login-message', 'Connection error: ' + error.message, 'error');
  }
}

// 2FA Login form handler
$('#two-factor-form').on('submit', async function(e) {
  e.preventDefault();
  const code = $('#two-factor-code').val();
  
  if (!tempLoginCreds) {
    showLogin();
    return;
  }
  
  try {
    // Call login endpoint again with credentials AND 2FA code
    const response = await fetch(`${BACKEND_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email: tempLoginCreds.email, 
        password: tempLoginCreds.password,
        totp_code: code 
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      authToken = data.access_token;
      currentUser = data.user;
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('refreshToken', data.refresh_token);
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      tempLoginCreds = null; // Clear temp credentials
      showDashboard();
    } else {
      showMessage('two-factor-message', data.error || 'Verification failed', 'error');
    }
  } catch (error) {
    showMessage('two-factor-message', 'Connection error: ' + error.message, 'error');
  }
});

// Forgot Password form handler
$('#forgot-form').on('submit', async function(e) {
  e.preventDefault();
  const email = $('#forgot-email').val();
  const btn = $(this).find('button[type="submit"]');
  
  btn.prop('disabled', true).text('Sending...');
  
  try {
    const frontendUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));

    const response = await fetch(`${BACKEND_URL}/api/forgot_password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email,
        frontend_url: frontendUrl
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      $('#forgot-password-view').html(`
        <h1>Check Your Email</h1>
        <p class="subtitle">We've sent a password reset link to ${email}</p>
        <div class="message success">Please check your inbox and spam folder.</div>
        <button class="btn btn-primary" onclick="showLogin()">Back to Login</button>
      `);
    } else {
      showMessage('forgot-message', data.error || 'Request failed', 'error');
      btn.prop('disabled', false).text('Send Reset Link');
    }
  } catch (error) {
    showMessage('forgot-message', 'Connection error: ' + error.message, 'error');
    btn.prop('disabled', false).text('Send Reset Link');
  }
});

// Register form handler
$('#register-form').on('submit', async function(e) {
  e.preventDefault();
  const firstName = $('#register-firstname').val();
  const lastName = $('#register-lastname').val();
  const email = $('#register-email').val();
  const password = $('#register-password').val();
  
  // Check password strength
  const strength = zxcvbn(password);
  if (strength.score < 3) {
    showMessage('register-message', 'Password is too weak. Please make it stronger.', 'error');
    return;
  }
  
  try {
    // Get current base URL (e.g., http://localhost:5501/iayoung85.github.io or https://bank.isaacyoung.com)
    // We remove the filename (index.html) to get the base path
    const frontendUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));

    const response = await fetch(`${BACKEND_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        frontend_url: frontendUrl
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Registration successful - show message and switch to login
      showMessage('register-message', 'Registration successful! Please check your email to verify your account.', 'success');
      setTimeout(() => {
        showLogin();
        showMessage('login-message', 'Please check your email to verify your account before logging in.', 'success');
      }, 3000);
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
async function fetchLinkToken(itemId = null) {
  let url = `${BACKEND_URL}/api/create_link_token`;
  // Add query parameter if itemId is provided
  if (itemId) {
    url += `?item_id=${encodeURIComponent(itemId)}`;
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
    const errorText = await response.text();
    console.error('Failed to fetch items:', errorText);
    throw new Error(`Failed to fetch items: ${response.status} ${response.statusText}`);
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
    const linkToken = await fetchLinkToken(null);
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
    const linkToken = await fetchLinkToken(itemId);
    const handler = Plaid.create({
      token: linkToken,
      onSuccess: async (public_token, metadata) => {
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

// 2FA Setup Functions
function update2FAUI() {
  if (currentUser && currentUser.is_2fa_enabled) {
    $('#2fa-status-text').text('Enabled').css('color', '#28a745');
    $('#enable-2fa-btn').addClass('hidden');
    $('#disable-2fa-btn').removeClass('hidden');
  } else {
    $('#2fa-status-text').text('Disabled').css('color', '#666');
    $('#enable-2fa-btn').removeClass('hidden');
    $('#disable-2fa-btn').addClass('hidden');
  }
  $('#2fa-setup-area').addClass('hidden');
}

async function start2FASetup() {
  try {
    const response = await authenticatedFetch(`${BACKEND_URL}/api/setup_2fa`, {
      method: 'POST'
    });
    
    const data = await response.json();
    
    if (response.ok) {
      $('#2fa-setup-area').removeClass('hidden');
      $('#qr-code-container').html(`<img src="data:image/png;base64,${data.qr_code}" alt="2FA QR Code" style="max-width: 200px; border: 1px solid #ddd; padding: 10px;">`);
      $('#secret-key-display').text(data.secret);
      $('#setup-2fa-message').html('');
      $('#setup-2fa-code').val('').focus();
    } else {
      alert('Failed to start 2FA setup: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    alert('Connection error: ' + error.message);
  }
}

function cancel2FASetup() {
  $('#2fa-setup-area').addClass('hidden');
  $('#setup-2fa-message').html('');
}

$('#verify-2fa-setup-form').on('submit', async function(e) {
  e.preventDefault();
  const code = $('#setup-2fa-code').val();
  
  try {
    const response = await authenticatedFetch(`${BACKEND_URL}/api/verify_2fa_setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      currentUser.is_2fa_enabled = true;
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      update2FAUI();
      alert('Two-Factor Authentication has been enabled successfully!');
    } else {
      $('#setup-2fa-message').html(`<div class="message error">${data.error || 'Verification failed'}</div>`);
    }
  } catch (error) {
    $('#setup-2fa-message').html(`<div class="message error">Connection error: ${error.message}</div>`);
  }
});

async function disable2FA() {
  if (!confirm('Are you sure you want to disable Two-Factor Authentication? This will make your account less secure.')) {
    return;
  }
  
  try {
    const response = await authenticatedFetch(`${BACKEND_URL}/api/disable_2fa`, {
      method: 'POST'
    });
    
    if (response.ok) {
      currentUser.is_2fa_enabled = false;
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      update2FAUI();
      alert('Two-Factor Authentication has been disabled.');
    } else {
      const data = await response.json();
      alert('Failed to disable 2FA: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    alert('Connection error: ' + error.message);
  }
}