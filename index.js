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
      html += `
        <li style="
          margin-bottom: 8px; 
          padding: 12px 16px; 
          background: linear-gradient(135deg, #f0f4ff 0%, #e8f2ff 100%);
          border: 1px solid #667eea20;
          border-radius: 8px;
          display: flex;
          align-items: center;
          font-weight: 500;
          color: #333;
          box-shadow: 0 2px 4px rgba(102, 126, 234, 0.1);
          transition: transform 0.2s, box-shadow 0.2s;
        "
        onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 8px rgba(102, 126, 234, 0.15)';"
        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(102, 126, 234, 0.1)';">
          <span style="font-size: 18px; margin-right: 12px;">🏦</span>
          <span>${instName}</span>
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
    // Check for existing items
    const existingItems = await getUserItems();
    
    let selectedItemId = null;
    
    // If user has existing items, ask if they want to update or add new
    if (existingItems.length > 0) {
      const action = confirm(
        `You have ${existingItems.length} bank(s) connected.\n\n` +
        `Click OK to RECONNECT/UPDATE an existing bank.\n` +
        `Click Cancel to ADD A NEW bank.`
      );
      
      if (action) {
        // Show list of existing items to update
        let itemList = 'Which bank do you want to reconnect?\n\n';
        existingItems.forEach((item, idx) => {
          const instName = item.institution_name || item.institution_id || 'Unknown Bank';
          const status = item.status || 'unknown';
          itemList += `${idx + 1}. ${instName} (${status})\n`;
        });
        
        // Build valid options text
        const validOptions = existingItems.map((_, idx) => idx + 1).join(', ');
        itemList += `\nEnter ${validOptions} to select a bank, or click Cancel to add a new bank instead.`;
        
        let choice = null;
        let validInput = false;
        
        while (!validInput) {
          const input = prompt(itemList);
          
          if (input === null) {
            // User clicked Cancel
            break;
          }
          
          const num = parseInt(input);
          if (!isNaN(num) && num >= 1 && num <= existingItems.length) {
            choice = input;
            validInput = true;
          } else {
            alert(`Invalid input. Please enter a number between 1 and ${existingItems.length}.`);
          }
        }
        
        if (choice) {
          const index = parseInt(choice) - 1;
          selectedItemId = existingItems[index].plaid_item_id;
        }
      }
    }
    
    const isInvestment = $('#investment-mode').is(':checked');
    const mode = isInvestment ? 'investment' : 'standard';
    
    const linkToken = await fetchLinkToken(selectedItemId, mode);
    const handler = Plaid.create({
      token: linkToken,
      onSuccess: async (public_token, metadata) => {
        try {
          if (selectedItemId) {
            // Update mode - just show success, don't exchange token again
            showMessage('dashboard-message', '✓ Bank reconnected successfully!', 'success');
          } else {
            // New connection - exchange token
            await exchangePublicToken(public_token);
            showMessage('dashboard-message', '✓ Bank connected successfully!', 'success');
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

// Disconnect bank button
$('#unlink-button').on('click', async function() {
  if (!authToken) {
    showMessage('dashboard-message', 'Please login first', 'error');
    return;
  }
  
  try {
    const items = await getUserItems();
    console.log('User items:', items);
    console.log('plaid item id of first item:', items.length > 0 ? items[0].plaid_item_id : 'No items');
    if (items.length === 0) {
      showMessage('dashboard-message', 'No connected banks to disconnect', 'error');
      return;
    }
    
    let itemList = 'Select a bank to disconnect:\n\n';
    items.forEach((item, idx) => {
      const instName = item.institution_name || item.institution_id || 'Unknown Bank';
      itemList += `${idx + 1}. ${instName}\n`;
    });
    
    const validOptions = items.map((_, idx) => idx + 1).join(', ');
    itemList += `\nEnter ${validOptions} to select a bank to disconnect.`;
    
    let choice = null;
    let validInput = false;
    
    while (!validInput) {
      const input = prompt(itemList);
      
      if (input === null) {
        // User clicked Cancel
        return;
      }
      
      const num = parseInt(input);
      if (!isNaN(num) && num >= 1 && num <= items.length) {
        choice = input;
        validInput = true;
      } else {
        alert(`Invalid input. Please enter a number between 1 and ${items.length}.`);
      }
    }
    
    const index = parseInt(choice) - 1;
    const itemIdToRemove = items[index].plaid_item_id;
    console.log('Removing item ID:', itemIdToRemove);
    // Call backend to remove item
    const response = await authenticatedFetch(`${BACKEND_URL}/api/remove_item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemIdToRemove })
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
});

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