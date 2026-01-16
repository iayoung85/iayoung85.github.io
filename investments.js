// BACKEND_URL is defined in config.js

let holdingsData = [];
let accountStatus = [];
let investmentAccounts = [];
let currentUser = null;
let authToken = localStorage.getItem('authToken');
let refreshToken = localStorage.getItem('refreshToken');

// Auth Check
if (!authToken) {
  window.location.href = 'index.html';
}

try {
  currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
} catch (e) {
  console.error('Error parsing user', e);
}

$(document).ready(async function() {
  await window.BACKEND_URL_PROMISE;
  
  // Load accounts first so selections exist
  await loadAccounts();
  await loadSettings();
  await loadHoldings();

  // Wire optional field changes to re-render
  $(document).on('change', '.field-checkbox', function() {
    renderTable();
  });
  // Account selection changes
  $(document).on('change', '.account-checkbox', function() {
    renderTable();
  });
  // Bank-level checkbox toggle
  $(document).on('change', '.bank-checkbox', function() {
    const bank = $(this).data('bank');
    toggleBank(bank, $(this).prop('checked'));
  });
});

// --- API Calls ---

async function authenticatedFetch(url, options = {}) {
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  const response = await fetch(url, { ...options, headers });
  
  if (response.status === 401) {
    // Try refresh
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${authToken}`;
      return fetch(url, { ...options, headers });
    } else {
      window.location.href = 'index.html';
      throw new Error('Session expired');
    }
  }
  
  return response;
}

async function refreshAccessToken() {
  if (!refreshToken) return false;
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (response.ok) {
      const data = await response.json();
      authToken = data.access_token;
      localStorage.setItem('authToken', authToken);
      return true;
    }
  } catch (e) { console.error(e); }
  return false;
}

// --- Accounts (selection similar to transactions) ---
async function loadAccounts() {
  const container = $('#account-selector');
  container.html('<div class="status-message info">Loading accounts...</div>');
  try {
    const response = await authenticatedFetch(`${BACKEND_URL}/api/investments/accounts/all`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    investmentAccounts = data.accounts || [];
    renderAccountSelector();
    // Auto-select all active/available accounts
    selectAllAccounts();
  } catch (error) {
    container.html(`<div class="error">Error loading accounts: ${error.message}</div>`);
  }
}

function renderAccountSelector() {
  const container = $('#account-selector');
  if (!investmentAccounts || investmentAccounts.length === 0) {
    container.html('<div class="empty-state">No investment accounts found. Connect or activate investments in dashboard.</div>');
    return;
  }

  // Group accounts by institution
  const grouped = {};
  investmentAccounts.forEach(acc => {
    const key = acc.institution_name || 'Unknown Institution';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(acc);
  });

  let html = '';
  Object.keys(grouped).forEach(bank => {
    const accounts = grouped[bank];
    const allDisabled = accounts.every(a => a.status !== 'active');
    const bankStatusBadge = bankStatusLabel(accounts[0]);
    const bankItemId = accounts[0].plaid_item_id;
    const bankCanActivate = accounts.some(a => a.status === 'available');
    const activateBtn = bankCanActivate ? `<button class="activate-btn" onclick="syncItem('${bankItemId}', true)">Activate & Sync</button>` : '';

    html += `
      <div class="account-group">
        <div style="display: flex; align-items: center; margin-bottom: 5px; gap: 8px; flex-wrap: wrap;">
          <label style="display: flex; align-items: center; gap: 6px;">
            <input type="checkbox" class="bank-checkbox" data-bank="${bank}" ${allDisabled ? 'disabled' : ''}>
            <strong>${bank}</strong>
          </label>
          ${bankStatusBadge}
          ${activateBtn}
        </div>
    `;

    accounts.forEach(acc => {
      const disabled = acc.status !== 'active';
      const displayName = `${acc.account_name || 'Account'}${acc.mask ? ' ...' + acc.mask : ''}`;
      const statusBadge = accountStatusLabel(acc.status);
      html += `
        <div class="account-item">
          <div style="display: flex; align-items: center; gap: 8px;">
            <label style="display: flex; align-items: center; gap: 6px;">
              <input type="checkbox" class="account-checkbox" data-bank="${bank}" data-account-id="${acc.plaid_account_id}" ${disabled ? 'disabled' : ''}>
              ${displayName}
            </label>
            ${statusBadge}
          </div>
        </div>
      `;
    });

    html += '</div>';
  });

  container.html(html);
}

function bankStatusLabel(acc) {
  if (!acc) return '';
  if (acc.status === 'active') return '<span class="status-badge status-active">Active</span>';
  if (acc.status === 'available') return '<span class="status-badge status-inactive">Available (Not Active)</span>';
  return '<span class="status-badge status-inactive">Inactive</span>';
}

function accountStatusLabel(status) {
  if (status === 'active') return '<span class="status-badge status-active">Active</span>';
  if (status === 'available') return '<span class="status-badge status-inactive">Available (Not Active)</span>';
  return '<span class="status-badge status-inactive">Inactive</span>';
}

function getSelectedAccounts() {
  const selected = [];
  $('.account-checkbox:checked').each(function() {
    selected.push($(this).data('account-id'));
  });
  return selected;
}

function selectAllAccounts() {
  $('.account-checkbox:not(:disabled)').prop('checked', true);
  $('.bank-checkbox:not(:disabled)').prop('checked', true);
  renderTable();
}

function deselectAllAccounts() {
  $('.account-checkbox').prop('checked', false);
  $('.bank-checkbox').prop('checked', false);
  renderTable();
}

function toggleBank(bank, isChecked) {
  const accountCheckboxes = $(`.account-checkbox[data-bank="${bank}"]:not(:disabled)`);
  accountCheckboxes.prop('checked', isChecked);
  renderTable();
}

async function refreshAccounts() {
  try {
    showMessage('Refreshing accounts...', 'info');
    await loadAccounts();
    // Keep existing holdings in memory; optionally reload to reflect new activations
    await loadHoldings();
    showMessage('Accounts refreshed successfully', 'success');
  } catch (error) {
    console.error('refreshAccounts error:', error);
    showMessage(`Failed to refresh accounts: ${error.message}`, 'error');
  }
}

async function loadAccountStatus() {
  $('#account-status-list').html('Loading...');
  try {
    const response = await authenticatedFetch(`${BACKEND_URL}/api/investments/accounts_status`);
    const data = await response.json();
    accountStatus = data.items;
    renderAccountStatus();
  } catch (error) {
    $('#account-status-list').html(`<div class="error">Error loading status: ${error.message}</div>`);
  }
}

async function loadHoldings() {
  $('#table-container').html('<div class="empty-state">Loading holdings...</div>');
  try {
    const response = await authenticatedFetch(`${BACKEND_URL}/api/investments/holdings`);
    const data = await response.json();
    holdingsData = data.items; // Array of item objects with holdings
    renderTable();
  } catch (error) {
    $('#table-container').html(`<div class="error">Error loading holdings: ${error.message}</div>`);
  }
}

async function syncItem(itemId, activate = false) {
  try {
    if (activate && !confirm('Activating investments for this bank may incur additional fees. Do you want to proceed?')) {
        return;
    }

    const btn = $(`button[data-item="${itemId}"]`);
    const originalText = btn.text();
    btn.prop('disabled', true).text(activate ? 'Activating...' : 'Syncing...');
    
    const response = await authenticatedFetch(`${BACKEND_URL}/api/investments/sync`, {
      method: 'POST',
      body: JSON.stringify({ 
          item_id: itemId,
          activate: activate
      })
    });
    
    if (response.ok) {
      // Refresh data
      await loadAccountStatus();
      await loadHoldings();
      showMessage(activate ? 'Activated successfully' : 'Synced successfully', 'success');
    } else {
      const err = await response.json();
      alert('Sync failed: ' + err.error);
    }
    
    btn.prop('disabled', false).text(originalText);
  } catch (error) {
    alert('Sync error: ' + error.message);
  }
}

async function syncAllHoldings() {
  const activeItems = accountStatus.filter(i => i.status === 'active');
  if (activeItems.length === 0) {
    alert('No active investment accounts found.');
    return;
  }
  
  if (!confirm(`Syncing ${activeItems.length} accounts. This may take a moment.`)) return;
  
  let successCount = 0;
  for (const item of activeItems) {
    try {
      await authenticatedFetch(`${BACKEND_URL}/api/investments/sync`, {
        method: 'POST',
        body: JSON.stringify({ item_id: item.plaid_item_id })
      });
      successCount++;
    } catch (e) {
      console.error(`Failed to sync ${item.institution_name}`, e);
    }
  }
  
  await loadHoldings();
  showMessage(`Synced ${successCount}/${activeItems.length} accounts`, 'success');
}

async function loadSettings() {
  try {
    const response = await authenticatedFetch(`${BACKEND_URL}/api/investments/settings`);
    if (response.ok) {
      const settings = await response.json();
      // Apply settings (checkboxes)
      if (settings.optional_fields) {
        const fields = settings.optional_fields;
        $('.field-checkbox').each(function() {
          $(this).prop('checked', fields.includes($(this).val()));
        });
        // Re-render if data exists
        if (holdingsData.length > 0) renderTable();
      }
    }
  } catch (e) { console.error(e); }
}

async function saveSettings() {
  const optionalFields = [];
  $('.field-checkbox:checked').each(function() {
    optionalFields.push($(this).val());
  });
  
  try {
    await authenticatedFetch(`${BACKEND_URL}/api/investments/settings`, {
      method: 'POST',
      body: JSON.stringify({ optional_fields: optionalFields })
    });
    showMessage('Settings saved', 'success');
    renderTable(); // Re-render to show/hide columns
  } catch (e) {
    alert('Failed to save settings');
  }
}

// --- Rendering ---

function renderAccountStatus() {
  const container = $('#account-status-list');
  if (accountStatus.length === 0) {
    container.html('<div class="empty-state">No bank accounts connected.</div>');
    return;
  }
  
  let html = '';
  accountStatus.forEach(item => {
    let actionHtml = '';
    let statusClass = 'status-inactive';
    let statusText = 'No Investment Accounts. If you believe there is an investment account associated with this bank, please try refreshing the connection from the dashboard and be sure to select the investment accounts to authorize sharing.';
    let unsuportedStatusText = 'Investments Not Supported by Institution. This institution does not support investment account access via Plaid even if you selected investment accounts during linking.';
    if (item.status === 'active') {
      statusClass = 'status-active';
      statusText = 'Active';
      actionHtml = `<span style="font-size: 11px; color: #666;">Last synced: ${formatDate(item.last_updated)}</span>`;
    } else if (item.status === 'available') {
      statusClass = 'status-inactive';
      statusText = 'Available (Not Active)';
      actionHtml = `<button class="activate-btn" data-item="${item.plaid_item_id}" onclick="syncItem('${item.plaid_item_id}', true)">Activate & Sync</button>`;
    } else if (item.status === 'unsupported_by_institution') {
      statusClass = 'status-unsupported';
      statusText = unsuportedStatusText;
      actionHtml = `<span style="font-size: 11px; color: #666;">Please contact support if you believe this is an error.</span>`;
    }
    
    html += `
      <div class="account-status-item">
        <div>
          <strong>${item.institution_name}</strong>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        <div>${actionHtml}</div>
      </div>
    `;
  });
  
  container.html(html);
}

function renderTable() {
  const container = $('#table-container');
  
  const selectedAccounts = getSelectedAccounts();
  // If nothing selected, show hint
  if (selectedAccounts.length === 0) {
    container.html('<div class="empty-state">Select at least one investment account to view holdings.</div>');
    return;
  }

  // Filter holdings by selected accounts
  const filteredHoldings = holdingsData.filter(item => 
    !item.plaid_account_id || selectedAccounts.includes(item.plaid_account_id)
  );

  // Flatten and Group Holdings
  const groupedHoldings = {}; // Key: ticker_symbol or name
  
  filteredHoldings.forEach(item => {
    if (!item || !item.holdings || !item.securities) return;
    
    item.holdings.forEach(holding => {
      // Find security info
      const security = item.securities.find(s => s.security_id === holding.security_id);
      if (!security) return;

      const price = derivePrice(security, holding);
      
      const key = security.ticker_symbol || security.name;
      if (!groupedHoldings[key]) {
        groupedHoldings[key] = {
          ticker: security.ticker_symbol,
          name: security.name,
          type: security.type,
          price: price,
          total_quantity: 0,
          total_value: 0,
          total_cost: 0,
          holdings: []
        };
      } else if (!groupedHoldings[key].price && price) {
        groupedHoldings[key].price = price;
      }
      
      const quantity = holding.quantity;
      const value = price > 0 ? (quantity * price) : (holding.institution_value || 0); // Display-only
      
      groupedHoldings[key].total_quantity += quantity;
      groupedHoldings[key].total_value += value;
      
      // Find account name (payload is per-account; fallback to embedded account)
      const accountName = (item.account && item.account.name) || (item.account && item.account.official_name) || 'Unknown Account';
      
      groupedHoldings[key].holdings.push({
        bank: item.institution_name,
        account: accountName,
        quantity: quantity,
        value: value,
        price: price
      });
    });
  });
  
  if (Object.keys(groupedHoldings).length === 0) {
    container.html('<div class="empty-state">No holdings found for selected accounts. Sync or adjust selections.</div>');
    return;
  }
  
  // Build Table
  const optionalFields = [];
  $('.field-checkbox:checked').each(function() { optionalFields.push($(this).val()); });
  // Do not show cost basis column anywhere
  const filteredOptional = optionalFields.filter(f => f !== 'cost_basis');
  
  let tableHtml = `
    <table class="transactions-table">
      <thead>
        <tr>
          <th style="width: 30px;"></th>
          <th>Ticker</th>
          <th>Name</th>
          <th>Price</th>
          <th>Total Qty</th>
          <th>Total Value</th>
          ${filteredOptional.map(f => `<th>${formatFieldName(f)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
  `;
  
  Object.values(groupedHoldings).forEach((group, index) => {
    const hasMultiple = group.holdings.length > 0; // Always true if it exists
    
    tableHtml += `
      <tr class="holding-group-header" onclick="toggleGroup('group-${index}', this)">
        <td><span class="expand-icon">▶</span></td>
        <td>${group.ticker || '-'}</td>
        <td>${group.name}</td>
        <td>${formatCurrency(group.price)}</td>
        <td>${group.total_quantity.toFixed(4)}</td>
        <td>${formatCurrency(group.total_value)}</td>
        ${filteredOptional.map(f => `<td>-</td>`).join('')}
      </tr>
    `;
    
    // Detail Rows
    group.holdings.forEach(h => {
      tableHtml += `
        <tr class="holding-detail-row group-${index}">
          <td></td>
          <td colspan="2" style="font-style: italic;">${h.bank} - ${h.account}</td>
          <td>${formatCurrency(h.price)}</td>
          <td>${h.quantity.toFixed(4)}</td>
          <td>${formatCurrency(h.value)}</td>
          ${filteredOptional.map(f => `<td>${formatOptionalField(h, f)}</td>`).join('')}
        </tr>
      `;
    });
  });
  
  tableHtml += '</tbody></table>';
  container.html(tableHtml);
}

// --- Helpers ---

function toggleGroup(groupId, headerRow) {
  $(`.${groupId}`).toggleClass('expanded');
  $(headerRow).toggleClass('expanded');
}

// Price fallback helper: prefer security prices; fall back to holding prices or implied from institution_value
function derivePrice(security, holding) {
  const candidates = [
    security.close_price,
    security.price,
    security.institution_price,
    holding.institution_price,
    holding.price
  ];
  let price = candidates.find(v => v !== null && v !== undefined && Number.isFinite(v) && v > 0);
  if (!price && holding.institution_value && holding.quantity) {
    price = holding.quantity !== 0 ? (holding.institution_value / holding.quantity) : 0;
  }
  return price || 0;
}

function toggleConfig() {
  const content = document.getElementById('config-content');
  const icon = document.getElementById('toggle-icon');
  
  if (content.style.display === 'none' || !content.style.display) {
    content.style.display = 'block';
    icon.textContent = '▲';
  } else {
    content.style.display = 'none';
    icon.textContent = '▼';
  }
}

function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(isoString) {
  if (!isoString) return 'Never';
  return new Date(isoString).toLocaleString();
}

function formatFieldName(field) {
  return field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatOptionalField(holding, field) {
  if (field === 'iso_currency_code') return holding.iso_currency_code || 'USD';
  if (field === 'cost_basis') return formatCurrency(holding.cost_basis);
  if (field === 'institution_value') return formatCurrency(holding.value);
  return holding[field] || '-';
}

function showMessage(msg, type) {
  const el = $('#status-message');
  el.html(`<div class="message ${type}">${msg}</div>`);
  setTimeout(() => el.html(''), 5000);
}

// Export functions (Simplified)
function exportJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(holdingsData));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", "holdings.json");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

function copyCSV() {
  // Implement CSV generation logic here if needed
  alert('CSV Copy not implemented yet');
}

function downloadCSV() {
  // Implement CSV generation logic here if needed
  alert('CSV Download not implemented yet');
}


// Helper to exchange token
async function exchangePublicToken(public_token) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/connections/set_access_token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({ public_token: public_token })
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to exchange token');
        }
        return data;
    } catch (error) {
        console.error('Error exchanging token:', error);
        alert('Failed to connect bank: ' + error.message);
    }
}
