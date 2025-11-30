// const BACKEND_URL = 'https://pythonplaidbackend-production.up.railway.app';
const BACKEND_URL = 'http://localhost:3000';
let accounts = [];
let transactions = [];
let synced = false;

// Check authentication
const token = localStorage.getItem('authToken');
console.log('Token check:', token ? 'Token found' : 'No token found');

if (!token) {
  console.log('No token, redirecting to index.html');
  alert('Please log in first');
  window.location.href = 'index.html';
}

// Initialize
$(document).ready(function() {
  console.log('Page loaded, initializing...');
  loadAccounts();
  setDefaultDates();
  
  // Add event listener for optional fields
  $(document).on('change', '.field-checkbox', function() {
    renderTransactionTable();
  });
});

function setDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(1); // Default to first of the month
  
  document.getElementById('start-date').value = start.toISOString().split('T')[0];
  document.getElementById('end-date').value = end.toISOString().split('T')[0];
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
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache',
      headers: {
        'Authorization': `Bearer ${token}`
      }
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
    console.log('Accounts loaded:', accounts.length);
    console.log('Account details:', accounts.map(a => `${a.institution_name} - ${a.account_name} (${a.account_type}) ${a.is_disconnected ? '[DISCONNECTED]' : ''}`));
    renderAccountSelector();
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
    const institutionKey = acc.institution_name + (acc.is_disconnected ? '_disconnected' : '_active');
    if (!grouped[institutionKey]) {
      grouped[institutionKey] = {
        name: acc.institution_name,
        isDisconnected: acc.is_disconnected,
        accounts: []
      };
    }
    grouped[institutionKey].accounts.push(acc);
  });
  
  let html = '';
  Object.keys(grouped).forEach(key => {
    const group = grouped[key];
    const disconnectedClass = group.isDisconnected ? 'disconnected-group' : '';
    const disconnectedBadge = group.isDisconnected ? '<span class="disconnected-badge">DISCONNECTED</span>' : '';
    
    html += `
      <div class="account-group ${disconnectedClass}">
        <label>
          <input type="checkbox" class="bank-checkbox" data-bank="${key}" 
                 onchange="toggleBank('${key}')">
          <strong>${group.name}</strong>${disconnectedBadge}
        </label>
    `;
    
    group.accounts.forEach(acc => {
      const displayName = acc.custom_name || `${acc.account_name} (${acc.account_subtype || acc.account_type})${acc.mask ? ' ...' + acc.mask : ''}`;
      const accountClass = acc.is_disconnected ? 'disconnected-account' : '';
      const warningText = acc.is_disconnected ? ' ⚠️ No new transactions will sync' : '';
      
      html += `
        <div class="account-item ${accountClass}">
          <div style="display: flex; align-items: center;">
            <button class="secondary" style="padding: 2px 6px; font-size: 10px; margin-right: 8px;" 
                    onclick="promptRename('${acc.plaid_account_id}', '${(acc.custom_name || '').replace(/'/g, "\\'")}')">
              Rename
            </button>
            <label style="flex-grow: 1;">
              <input type="checkbox" class="account-checkbox" 
                     data-bank="${key}"
                     data-account-id="${acc.plaid_account_id}"
                     data-disconnected="${acc.is_disconnected}">
              ${displayName}${warningText}
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
  
  // Check if any selected accounts are disconnected
  const disconnectedSelected = [];
  const activeAccounts = [];
  
  $('.account-checkbox:checked').each(function() {
    const accountId = $(this).data('account-id');
    const isDisconnected = $(this).data('disconnected');
    
    if (isDisconnected === true || isDisconnected === 'true') {
      disconnectedSelected.push(accountId);
    } else {
      activeAccounts.push(accountId);
    }
  });
  
  // Validate date range
  const start = new Date(startDate);
  const end = new Date(endDate);
  const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  
  if (daysDiff < 1 || daysDiff > 60) {
    showStatus('Date range must be between 1 and 60 days', 'error');
    return;
  }
  
  // If only disconnected accounts selected, skip sync and go straight to load
  if (activeAccounts.length === 0 && disconnectedSelected.length > 0) {
    showStatus(`⚠️ Selected ${disconnectedSelected.length} disconnected account(s). These accounts are no longer connected to Plaid. You can view existing historical transactions, but cannot sync new ones.`, 'warning');
    synced = true;
    document.getElementById('load-btn').disabled = false;
    return;
  }
  
  try {
    let statusMsg = 'Syncing transactions from Plaid...';
    if (disconnectedSelected.length > 0) {
      statusMsg += ` (Skipping ${disconnectedSelected.length} disconnected account(s))`;
    }
    showStatus(statusMsg, 'info');
    
    const response = await fetch(`${BACKEND_URL}/api/sync_transactions`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        start_date: startDate,
        end_date: endDate,
        account_ids: activeAccounts  // Only send active accounts for syncing
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      showStatus(`Error: ${data.error}`, 'error');
      return;
    }
    
    let successMsg = `Synced ${data.synced_count || 0} transactions (${data.new_count || 0} new, ${data.updated_count || 0} updated) from ${activeAccounts.length} active account(s)`;
    if (disconnectedSelected.length > 0) {
      successMsg += `. ${disconnectedSelected.length} disconnected account(s) were skipped - their historical transactions remain available.`;
    }
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
    
    const response = await fetch(`${BACKEND_URL}/api/transactions?${params}`, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Authorization': `Bearer ${token}`
      }
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
    
    const response = await fetch(`${BACKEND_URL}/api/accounts/rename`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
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