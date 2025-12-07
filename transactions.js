// BACKEND_URL is now defined in config.js and auto-detects environment

let accounts = [];
let transactions = [];
let synced = false;

// Check authentication
let token = localStorage.getItem('authToken');
let refreshToken = localStorage.getItem('refreshToken');
let idleTimeout;
// Idle timeout settings (30 minutes of inactivity)
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
console.log('Token check:', token ? 'Token found' : 'No token found');

if (!token) {
  console.log('No token, redirecting to index.html');
  alert('Please log in first');
  window.location.href = 'index.html';
}

async function refreshAccessToken() {
  if (!refreshToken) {
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
      token = data.access_token;
      localStorage.setItem('authToken', token);
      resetIdleTimeout();
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
    return false;
  }
  
}

async function authenticatedFetch(url, options = {}) {
  // Add authorization header
  const headers = {
    'Authorization': `Bearer ${token}`,
    ...options.headers
  };
  
  const response = await fetch(url, { ...options, headers });
  
  // If we get a 401, try to refresh the token
  if (response.status === 401) {
    console.log('Access token expired, attempting refresh...');
    const refreshed = await refreshAccessToken();
    
    if (refreshed) {
      // Retry the request with new token
      headers['Authorization'] = `Bearer ${token}`;
      return fetch(url, { ...options, headers });
    }
    
    // If refresh failed, redirect to login
    alert('Session expired. Please log in again.');
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
  }
  
  return response;
}


function resetIdleTimeout() {
  // Clear existing timeout
  if (idleTimeout) {
    clearTimeout(idleTimeout);
  }
  
  // Only set idle timeout if user is logged in
  if (token && currentUser) {
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



function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('currentUser');
  token = null;
  refreshToken = null;
  currentUser = null;
  window.location.href = 'index.html';
}

// Initialize
$(document).ready(async function() {
  await window.BACKEND_URL_PROMISE;
  console.log('Page loaded, initializing...');
  loadAccounts();
  setDefaultDates();
  resetIdleTimeout();
  setupActivityListeners();
  loadSettings(); // Load saved settings
  
  // Add event listener for optional fields
  $(document).on('change', '.field-checkbox', function() {
    renderTransactionTable();
  });

  // Add event listener for start date validation
  $('#start-date').on('blur', function() {
    if (!this.value) return;
    
    // Parse input as local date to avoid UTC issues
    const parts = this.value.split('-');
    const startDate = new Date(parts[0], parts[1] - 1, parts[2]);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const limitDate = new Date(today);
    limitDate.setDate(today.getDate() - 90);
    
    if (startDate < limitDate) {
      // Format limitDate as YYYY-MM-DD in local time
      const year = limitDate.getFullYear();
      const month = String(limitDate.getMonth() + 1).padStart(2, '0');
      const day = String(limitDate.getDate()).padStart(2, '0');
      
      // Format for display (MM/DD/YYYY)
      const displayDate = `${month}/${day}/${year}`;
      
      this.value = `${year}-${month}-${day}`;
      
      // Highlight input
      $(this).css('border', '2px solid #ffc107');
      $(this).css('background-color', '#fff3cd');
      
      // Show warning status
      showStatus(`${displayDate} is the earliest valid start date`, 'warning');
      
      // Remove highlight after 3 seconds
      setTimeout(() => {
        $(this).css('border', '');
        $(this).css('background-color', '');
      }, 3000);
    }
  });
});

function setDefaultDates() {
  const end = new Date();
  const start = new Date();
  let today = new Date();
  if (today.getDate() === 1) {
    // If today is first of month, set start date to first of previous month instead of first of current month
    start.setMonth(start.getMonth() - 1);
  }
  else {
    start.setDate(1); // Default to first of the month
  }
  
  // Helper to format date as YYYY-MM-DD in local time
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  document.getElementById('start-date').value = formatDate(start);
  document.getElementById('end-date').value = formatDate(end);
}

function setMonthToDate() {
  const end = new Date();
  const start = new Date();
  start.setDate(1); // First of the current month
  
  // Helper to format date as YYYY-MM-DD in local time
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  document.getElementById('start-date').value = formatDate(start);
  document.getElementById('end-date').value = formatDate(end);
}

function setLastMonth() {
  const now = new Date();
  // Get first day of previous month
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // Get last day of previous month (day 0 of current month)
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  
  // Helper to format date as YYYY-MM-DD in local time
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  document.getElementById('start-date').value = formatDate(start);
  document.getElementById('end-date').value = formatDate(end);
}

function toggleConfig() {
  const content = document.getElementById('config-content');
  const icon = document.getElementById('toggle-icon');
  content.classList.toggle('open');
  icon.textContent = content.classList.contains('open') ? '▲' : '▼';
}

async function refreshAccounts() {
  try {
    showStatus('Syncing accounts from Plaid...', 'info');
    const response = await fetch(`${BACKEND_URL}/api/accounts`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to refresh accounts');
    }
    
    await loadAccounts();
    showStatus('Accounts refreshed successfully', 'success');
    setTimeout(() => clearStatus(), 2000);
  } catch (error) {
    console.error('refreshAccounts error:', error);
    showStatus(`Failed to refresh accounts: ${error.message}`, 'error');
  }
}

function selectAllAccounts() {
  // Select all account checkboxes
  document.querySelectorAll('.account-checkbox').forEach(checkbox => {
    checkbox.checked = true;
  });
  renderTransactionTable();
}

function deselectAllAccounts() {
  // Deselect all account checkboxes
  document.querySelectorAll('.account-checkbox').forEach(checkbox => {
    checkbox.checked = false;
  });
  renderTransactionTable();
}

async function loadAccounts() {
  try {
    console.log('=== loadAccounts() START ===');
    console.log('Token:', token);
    console.log('BACKEND_URL:', BACKEND_URL);
    
    showStatus('Loading accounts...', 'info');
    
    // Use new endpoint that gets all accounts including disconnected ones
    const url = `${BACKEND_URL}/api/accounts/all?t=${Date.now()}`;
    console.log('Fetch URL:', url);
    console.log('Fetch options:', {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache',
      headers: {
        'Authorization': `Bearer ${token ? token.substring(0, 20) + '...' : 'NULL'}`
      }
    });
    
    console.log('About to call fetch...');
    const response = await authenticatedFetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache'
    });
    
    console.log('Fetch completed!');
    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);
    console.log('Response headers:', response.headers);
    
    const data = await response.json();
    console.log('Response data:', data);
    console.log('=== loadAccounts() END ===');
    
    if (data.error) {
      showStatus(`Error: ${data.error}`, 'error');
      return;
    }
    
    accounts = data.accounts || [];
    // Filter out investment accounts as they are not supported
    accounts = accounts.filter(acc => acc.account_type !== 'investment');
    console.log('Accounts loaded:', accounts.length);
    console.log('Account details:', accounts.map(a => `${a.institution_name} - ${a.account_name} (${a.account_type})`));
    renderAccountSelector();
    
    // By default, select all accounts after loading
    selectAllAccounts()
    
    showStatus('Accounts loaded successfully', 'success');
    setTimeout(() => clearStatus(), 2000);
    
  } catch (error) {
    console.error('loadAccounts error:', error);
    showStatus(`Failed to load accounts: ${error.message}`, 'error');
  }
}

function renderAccountSelector() {
  const container = document.getElementById('account-selector');
  
  if (accounts.length === 0) {
    container.innerHTML = '<p>No accounts found. Please connect a bank first.</p>';
    return;
  }
  
  // Group by institution
  const grouped = {};
  accounts.forEach(acc => {
    const institutionKey = acc.institution_name;
    if (!grouped[institutionKey]) {
      grouped[institutionKey] = {
        name: acc.institution_name,
        accounts: []
      };
    }
    grouped[institutionKey].accounts.push(acc);
  });
  
  let html = '';
  Object.keys(grouped).forEach(key => {
    const group = grouped[key];
    
    html += `
      <div class="account-group">
        <label>
          <input type="checkbox" class="bank-checkbox" data-bank="${key}" 
                 onchange="toggleBank('${key}')">
          <strong>${group.name}</strong>
        </label>
    `;
    
    group.accounts.forEach(acc => {
      const displayName = acc.custom_name || `${acc.account_name} (${acc.account_subtype || acc.account_type})${acc.mask ? ' ...' + acc.mask : ''}`;
      
      html += `
        <div class="account-item">
          <div style="display: flex; align-items: center;">
            <button class="secondary" style="padding: 2px 6px; font-size: 10px; margin-right: 8px;" 
                    onclick="promptRename('${acc.plaid_account_id}', '${(acc.custom_name || '').replace(/'/g, "\\'")}')">
              Rename
            </button>
            <label style="flex-grow: 1;">
              <input type="checkbox" class="account-checkbox" 
                     data-bank="${key}"
                     data-account-id="${acc.plaid_account_id}">
              ${displayName}
            </label>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
  });
  
  container.innerHTML = html;
}

function toggleBank(institution) {
  const bankCheckbox = $(`.bank-checkbox[data-bank="${institution}"]`);
  const accountCheckboxes = $(`.account-checkbox[data-bank="${institution}"]`);
  accountCheckboxes.prop('checked', bankCheckbox.prop('checked'));
}

async function syncTransactions() {
  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;
  const selectedAccounts = getSelectedAccounts();
  
  if (!startDate || !endDate) {
    showStatus('Please select a date range', 'error');
    return;
  }
  
  if (selectedAccounts.length === 0) {
    showStatus('Please select at least one account', 'error');
    return;
  }
  
  // Validate date range
  const start = new Date(startDate);
  const end = new Date(endDate);
  const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  
  if (daysDiff < 1 || daysDiff > 90) {
    showStatus('Date range must be between 1 and 90 days', 'error');
    return;
  }
  
  try {
    showStatus('Syncing transactions from Plaid...', 'info');
    
    const response = await authenticatedFetch(`${BACKEND_URL}/api/sync_transactions`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        start_date: startDate,
        end_date: endDate,
        account_ids: selectedAccounts
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      showStatus(`Error: ${data.error}`, 'error');
      return;
    }
    
    let successMsg = `Synced ${data.synced_count || 0} transactions (${data.new_count || 0} new, ${data.updated_count || 0} updated) from ${selectedAccounts.length} active account(s)`;
    showStatus(successMsg, 'success');
    synced = true;
    document.getElementById('load-btn').disabled = false;
    
  } catch (error) {
    showStatus(`Sync failed: ${error.message}`, 'error');
  }
}

async function loadTransactions() {
  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;
  const selectedAccounts = getSelectedAccounts();
  const timezone = document.getElementById('timezone').value;
  
  try {
    showStatus('Loading transactions...', 'info');
    
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      timezone: timezone
    });
    
    selectedAccounts.forEach(id => {
      params.append('account_ids[]', id);
    });
    
    const response = await authenticatedFetch(`${BACKEND_URL}/api/transactions?${params}`, {
      method: 'GET',
      mode: 'cors'
    });
    
    const data = await response.json();
    
    if (data.error) {
      showStatus(`Error: ${data.error}`, 'error');
      return;
    }
    
    transactions = data.transactions || [];
    renderTransactionTable();
    showStatus(`Loaded ${transactions.length} transactions`, 'success');
    setTimeout(() => clearStatus(), 2000);
    
  } catch (error) {
    showStatus(`Load failed: ${error.message}`, 'error');
  }
}

function renderTransactionTable() {
  const container = document.getElementById('table-container');
  
  if (transactions.length === 0) {
    container.innerHTML = '<div class="empty-state">No transactions found for the selected criteria.</div>';
    document.getElementById('export-buttons').classList.add('hidden');
    return;
  }

  // Get selected optional fields
  const optionalFields = [];
  $('.field-checkbox:checked').each(function() {
    optionalFields.push($(this).val());
  });
  
  let html = '<table><thead><tr>';
  html += '<th>Date</th>';
  html += '<th>Bank/Account</th>';
  html += '<th>Description</th>';
  html += '<th>Amount</th>';
  
  // Add optional headers
  if (optionalFields.includes('merchant_name')) html += '<th>Merchant</th>';
  if (optionalFields.includes('category')) html += '<th>Category</th>';
  if (optionalFields.includes('payment_channel')) html += '<th>Channel</th>';
  if (optionalFields.includes('pending')) html += '<th>Pending</th>';
  if (optionalFields.includes('check_number')) html += '<th>Check #</th>';
  if (optionalFields.includes('original_description')) html += '<th>Original Desc</th>';
  if (optionalFields.includes('authorized_date')) html += '<th>Auth Date</th>';
  if (optionalFields.includes('authorized_datetime')) html += '<th>Auth Time</th>';

  html += '</tr></thead><tbody>';
  
  transactions.forEach(txn => {
    // Parse the date string properly
    const dateObj = new Date(txn.date);
    // Format as MM/DD/YYYY using UTC to prevent timezone shifts
    const dateStr = dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'UTC'
    });
    
    const amount = new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: txn.iso_currency_code || 'USD' 
    }).format(txn.amount);
    
    html += '<tr>';
    html += `<td>${dateStr}</td>`;
    html += `<td>${txn.bank_account}</td>`;
    html += `<td>${txn.name || ''}</td>`;
    html += `<td>${amount}</td>`;

    // Add optional cells
    if (optionalFields.includes('merchant_name')) html += `<td>${txn.merchant_name || ''}</td>`;
    if (optionalFields.includes('category')) {
        let cat = txn.category;
        // Handle PostgreSQL array string format if necessary, or JSON array
        if (typeof cat === 'string' && cat.startsWith('{')) {
            // Simple cleanup for {Category,Subcategory} format
            cat = cat.replace(/^{|}$/g, '').replace(/,/g, ', ');
        } else if (Array.isArray(cat)) {
            cat = cat.join(', ');
        }
        html += `<td>${cat || ''}</td>`;
    }
    if (optionalFields.includes('payment_channel')) html += `<td>${txn.payment_channel || ''}</td>`;
    if (optionalFields.includes('pending')) html += `<td>${txn.pending ? 'Yes' : 'No'}</td>`;
    if (optionalFields.includes('check_number')) html += `<td>${txn.check_number || ''}</td>`;
    if (optionalFields.includes('original_description')) html += `<td>${txn.original_description || ''}</td>`;
    if (optionalFields.includes('authorized_date')) html += `<td>${txn.authorized_date || ''}</td>`;
    if (optionalFields.includes('authorized_datetime')) {
        let authTime = '';
        if (txn.authorized_datetime) {
            const dt = new Date(txn.authorized_datetime);
            authTime = dt.toLocaleString('en-US', {
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit',
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
            });
        }
        html += `<td>${authTime}</td>`;
    }

    html += '</tr>';
  });
  
  html += '</tbody></table>';
  container.innerHTML = html;
  document.getElementById('export-buttons').classList.remove('hidden');
}

function getSelectedAccounts() {
  const selected = [];
  $('.account-checkbox:checked').each(function() {
    selected.push($(this).data('account-id'));
  });
  return selected;
}

function exportJSON() {
  const dataStr = JSON.stringify(transactions, null, 2);
  const dataBlob = new Blob([dataStr], {type: 'application/json'});
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `transactions_${getDateRange()}.json`;
  link.click();
}

function copyCSV() {
  const csv = generateCSV();
  navigator.clipboard.writeText(csv).then(() => {
    showStatus('CSV copied to clipboard!', 'success');
    setTimeout(() => clearStatus(), 2000);
  }).catch(err => {
    showStatus('Failed to copy to clipboard', 'error');
  });
}

function downloadCSV() {
  const csv = generateCSV();
  const dataBlob = new Blob([csv], {type: 'text/csv'});
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `transactions_${getDateRange()}.csv`;
  link.click();
}

function generateCSV() {
  // Get selected optional fields
  const optionalFields = [];
  $('.field-checkbox:checked').each(function() {
    optionalFields.push($(this).val());
  });

  let csv = 'Date,Bank/Account,Description,Amount';
  
  // Add optional headers
  if (optionalFields.includes('merchant_name')) csv += ',Merchant';
  if (optionalFields.includes('category')) csv += ',Category';
  if (optionalFields.includes('payment_channel')) csv += ',Channel';
  if (optionalFields.includes('pending')) csv += ',Pending';
  if (optionalFields.includes('check_number')) csv += ',Check #';
  if (optionalFields.includes('original_description')) csv += ',Original Desc';
  if (optionalFields.includes('authorized_date')) csv += ',Auth Date';
  if (optionalFields.includes('authorized_datetime')) csv += ',Auth Time';
  
  csv += '\n';

  transactions.forEach(txn => {
    const dateObj = new Date(txn.date);
    const dateStr = dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'UTC'
    });
    const amount = txn.amount;
    const name = (txn.name || '').replace(/"/g, '""');
    
    csv += `"${dateStr}","${txn.bank_account}","${name}",${amount}`;
    
    // Add optional fields
    if (optionalFields.includes('merchant_name')) csv += `,"${(txn.merchant_name || '').replace(/"/g, '""')}"`;
    if (optionalFields.includes('category')) {
        let cat = txn.category;
        if (typeof cat === 'string' && cat.startsWith('{')) {
            cat = cat.replace(/^{|}$/g, '').replace(/,/g, ', ');
        } else if (Array.isArray(cat)) {
            cat = cat.join(', ');
        }
        csv += `,"${(cat || '').replace(/"/g, '""')}"`;
    }
    if (optionalFields.includes('payment_channel')) csv += `,"${(txn.payment_channel || '').replace(/"/g, '""')}"`;
    if (optionalFields.includes('pending')) csv += `,${txn.pending ? 'Yes' : 'No'}`;
    if (optionalFields.includes('check_number')) csv += `,"${(txn.check_number || '').replace(/"/g, '""')}"`;
    if (optionalFields.includes('original_description')) csv += `,"${(txn.original_description || '').replace(/"/g, '""')}"`;
    if (optionalFields.includes('authorized_date')) csv += `,"${(txn.authorized_date || '').replace(/"/g, '""')}"`;
    if (optionalFields.includes('authorized_datetime')) {
        let authTime = '';
        if (txn.authorized_datetime) {
            const dt = new Date(txn.authorized_datetime);
            authTime = dt.toLocaleString('en-US', {
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit',
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
            });
        }
        csv += `,"${authTime}"`;
    }
    
    csv += '\n';
  });
  return csv;
}

function getDateRange() {
  const start = document.getElementById('start-date').value;
  const end = document.getElementById('end-date').value;
  return `${start}_to_${end}`;
}

function showStatus(message, type) {
  const statusDiv = document.getElementById('status-message');
  statusDiv.className = `status-message ${type}`;
  statusDiv.textContent = message;
  statusDiv.style.display = 'block';
}

function clearStatus() {
  const statusDiv = document.getElementById('status-message');
  statusDiv.style.display = 'none';
}

async function promptRename(accountId, currentCustomName) {
  const newName = prompt('Enter a custom name for this account (leave empty to reset):', currentCustomName);
  
  if (newName === null) return; // User cancelled
  
  try {
    showStatus('Updating account name...', 'info');
    
    const response = await authenticatedFetch(`${BACKEND_URL}/api/accounts/rename`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        plaid_account_id: accountId,
        custom_name: newName.trim() || null
      })
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to rename account');
    }
    
    showStatus('Account renamed successfully', 'success');
    setTimeout(() => clearStatus(), 2000);
    
    // Refresh accounts list
    loadAccounts();
    
  } catch (error) {
    console.error('Rename error:', error);
    showStatus(`Failed to rename account: ${error.message}`, 'error');
  }
}

async function saveSettings() {
  try {
    showStatus('Saving settings...', 'info');
    
    const optionalFields = [];
    $('.field-checkbox:checked').each(function() {
      optionalFields.push($(this).val());
    });
    const timezone = document.getElementById('timezone').value;
    
    // We don't have a UI for field order yet, so we'll just use a default or current order
    // For now, let's just save what we have
    const settings = {
      optional_fields: optionalFields,
      field_order: ['datetime', 'bank_account', 'name', 'amount', ...optionalFields],
      timezone: timezone
    };
    
    console.log('Saving settings:', settings);
    
    const response = await authenticatedFetch(`${BACKEND_URL}/api/transaction_viewer_settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settings)
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to save settings');
    }
    
    showStatus('Settings saved successfully', 'success');
    setTimeout(() => clearStatus(), 2000);
    
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus(`Failed to save settings: ${error.message}`, 'error');
  }
}

async function loadSettings() {
  try {
    console.log('Loading settings...');
    const response = await authenticatedFetch(`${BACKEND_URL}/api/transaction_viewer_settings`, {
      method: 'GET'
    });
    
    if (!response.ok) {
      throw new Error('Failed to load settings');
    }
    
    const settings = await response.json();
    console.log('Loaded settings:', settings);
    
    // Apply settings
    if (settings.timezone) {
      document.getElementById('timezone').value = settings.timezone;
    }
    
    if (settings.optional_fields && Array.isArray(settings.optional_fields)) {
      // Uncheck all first
      $('.field-checkbox').prop('checked', false);
      
      // Check saved fields
      settings.optional_fields.forEach(field => {
        $(`.field-checkbox[value="${field}"]`).prop('checked', true);
      });
    }
    
    // Note: Account selection is not something that needs to be memorized. just load accounts and select all by default
    
    $('.account-checkbox').prop('checked', true);
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}