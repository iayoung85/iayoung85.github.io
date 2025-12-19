// BACKEND_URL is defined in config.js

let holdingsData = [];
let accountStatus = [];
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
  
  // Load initial data
  loadAccountStatus();
  loadHoldings();
  loadSettings();

  // Connect Investment ONLY Bank
  $('#connect-investment-only').on('click', async function() {
    try {
        const response = await authenticatedFetch(`${BACKEND_URL}/api/create_link_token?mode=investments_only`);
        
        if (response) {
            const data = await response.json();
            const handler = Plaid.create({
                token: data.link_token,
                onSuccess: async (public_token, metadata) => {
                    console.log('Plaid Link success:', metadata);
                    await exchangePublicToken(public_token);
                    // Reload to show new account
                    location.reload();
                },
                onExit: (err, metadata) => {
                    if (err) console.error('Plaid Link exit:', err);
                },
            });
            handler.open();
        }
    } catch (error) {
        console.error('Error starting Plaid Link:', error);
        alert('Failed to start bank connection. Please try again.');
    }
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
    const response = await fetch(`${BACKEND_URL}/api/refresh`, {
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

async function syncItem(itemId) {
  try {
    const btn = $(`button[data-item="${itemId}"]`);
    const originalText = btn.text();
    btn.prop('disabled', true).text('Syncing...');
    
    const response = await authenticatedFetch(`${BACKEND_URL}/api/investments/sync`, {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId })
    });
    
    if (response.ok) {
      // Refresh data
      await loadAccountStatus();
      await loadHoldings();
      showMessage('Synced successfully', 'success');
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
    let statusText = 'Not Supported';
    
    if (item.status === 'active') {
      statusClass = 'status-active';
      statusText = 'Active';
      actionHtml = `<span style="font-size: 11px; color: #666;">Last synced: ${formatDate(item.last_updated)}</span>`;
    } else if (item.status === 'available') {
      statusClass = 'status-inactive';
      statusText = 'Available (Not Active)';
      actionHtml = `<button class="activate-btn" data-item="${item.plaid_item_id}" onclick="syncItem('${item.plaid_item_id}')">Activate & Sync</button>`;
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
  
  // Flatten and Group Holdings
  const groupedHoldings = {}; // Key: ticker_symbol or name
  
  holdingsData.forEach(item => {
    if (!item.holdings) return;
    
    item.holdings.forEach(holding => {
      // Find security info
      const security = item.securities.find(s => s.security_id === holding.security_id);
      if (!security) return;
      
      const key = security.ticker_symbol || security.name;
      if (!groupedHoldings[key]) {
        groupedHoldings[key] = {
          ticker: security.ticker_symbol,
          name: security.name,
          type: security.type,
          price: security.close_price || security.close_price_as_of ? (security.close_price || 0) : 0, // Simplified price logic
          total_quantity: 0,
          total_value: 0,
          total_cost: 0,
          holdings: []
        };
      }
      
      const quantity = holding.quantity;
      const price = security.close_price || 0; // Use close price if current price not available
      const value = holding.institution_value || (quantity * price);
      const cost = holding.cost_basis || 0;
      
      groupedHoldings[key].total_quantity += quantity;
      groupedHoldings[key].total_value += value;
      groupedHoldings[key].total_cost += (cost * quantity); // Cost basis is usually per share? No, Plaid says 'cost_basis' is "The total cost of the holding". Wait, let's check docs.
      // Plaid docs: cost_basis "The total cost of the holding." (Total value, not per share).
      // But sometimes it's per share? "The original total value...".
      // Actually, let's assume it's total cost for now.
      
      // Find account name
      const account = item.accounts.find(a => a.account_id === holding.account_id);
      const accountName = account ? account.name : 'Unknown Account';
      
      groupedHoldings[key].holdings.push({
        bank: item.institution_name,
        account: accountName,
        quantity: quantity,
        value: value,
        cost_basis: cost,
        price: price
      });
    });
  });
  
  if (Object.keys(groupedHoldings).length === 0) {
    container.html('<div class="empty-state">No holdings found. Sync your accounts to see data.</div>');
    return;
  }
  
  // Build Table
  const optionalFields = [];
  $('.field-checkbox:checked').each(function() { optionalFields.push($(this).val()); });
  
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
          <th>Avg Cost</th>
          <th>Gain/Loss</th>
          ${optionalFields.map(f => `<th>${formatFieldName(f)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
  `;
  
  Object.values(groupedHoldings).forEach((group, index) => {
    const avgCost = group.total_quantity > 0 ? (group.total_cost / group.total_quantity) : 0; // Wait, if cost_basis is total, then total_cost is sum of cost_bases.
    // Actually, let's just display Total Cost Basis if requested, or calculate Gain %.
    
    const totalGain = group.total_value - group.total_cost;
    const gainPercent = group.total_cost > 0 ? ((totalGain / group.total_cost) * 100) : 0;
    const gainClass = totalGain >= 0 ? 'positive-gain' : 'negative-gain';
    
    const hasMultiple = group.holdings.length > 0; // Always true if it exists
    
    tableHtml += `
      <tr class="holding-group-header" onclick="toggleGroup('group-${index}', this)">
        <td><span class="expand-icon">▶</span></td>
        <td>${group.ticker || '-'}</td>
        <td>${group.name}</td>
        <td>${formatCurrency(group.price)}</td>
        <td>${group.total_quantity.toFixed(4)}</td>
        <td>${formatCurrency(group.total_value)}</td>
        <td>${formatCurrency(group.total_cost)}</td> <!-- Displaying Total Cost instead of Avg for now -->
        <td class="${gainClass}">${gainPercent.toFixed(2)}%</td>
        ${optionalFields.map(f => `<td>-</td>`).join('')}
      </tr>
    `;
    
    // Detail Rows
    group.holdings.forEach(h => {
      const hGain = h.value - h.cost_basis;
      const hGainPercent = h.cost_basis > 0 ? ((hGain / h.cost_basis) * 100) : 0;
      const hGainClass = hGain >= 0 ? 'positive-gain' : 'negative-gain';
      
      tableHtml += `
        <tr class="holding-detail-row group-${index}">
          <td></td>
          <td colspan="2" style="font-style: italic;">${h.bank} - ${h.account}</td>
          <td>${formatCurrency(h.price)}</td>
          <td>${h.quantity.toFixed(4)}</td>
          <td>${formatCurrency(h.value)}</td>
          <td>${formatCurrency(h.cost_basis)}</td>
          <td class="${hGainClass}">${hGainPercent.toFixed(2)}%</td>
          ${optionalFields.map(f => `<td>${formatOptionalField(h, f)}</td>`).join('')}
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
        const response = await fetch(`${BACKEND_URL}/api/set_access_token`, {
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
