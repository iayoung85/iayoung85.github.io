// Account Settings Page Logic
// BACKEND_URL is defined in config.js

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

// Initialize on page load
$(document).ready(async function() {
  console.log('Account page ready, waiting for backend URL...');
  try {
    await window.BACKEND_URL_PROMISE;
    console.log('Backend URL resolved:', window.BACKEND_URL);
    
    // Check for email verification/rejection tokens in URL
    const urlParams = new URLSearchParams(window.location.search);
    const verifyToken = urlParams.get('verify_email_change');
    const rejectToken = urlParams.get('reject_email_change');
    
    if (verifyToken) {
      await handleEmailVerification(verifyToken);
      return;
    }
    
    if (rejectToken) {
      await handleEmailRejection(rejectToken);
      return;
    }
    
    // Check authentication
    if (!authToken || !currentUser) {
      window.location.href = 'index.html';
      return;
    }

    // Initialize page
    initializePage();
  } catch (e) {
    console.error('Error in initialization:', e);
    window.location.href = 'index.html';
  }
});

// ============================================
// INITIALIZATION
// ============================================

function initializePage() {
  setupSettingsMenu();
  setupActivityListeners();
  loadProfileDetails();
}

// ============================================
// SETTINGS MENU (Content Switching)
// ============================================

function setupSettingsMenu() {
  $('.settings-link').on('click', function(e) {
    e.preventDefault();
    const section = $(this).data('section');
    
    // Update menu
    $('.settings-link').removeClass('active');
    $(this).addClass('active');

    // Update content
    $('.settings-panel').removeClass('active').addClass('hidden');
    $(`#${section}`).removeClass('hidden').addClass('active');

    // Load content for section
    loadSectionContent(section);

    // Scroll to top
    window.scrollTo(0, 0);
  });
}

function loadSectionContent(section) {
  console.log(`Loading section: ${section}`);
  
  switch(section) {
    case 'profile':
      loadProfileDetails();
      break;
    case 'password':
      loadPasswordChangeForm();
      break;
    case 'subscription':
      loadSubscriptionDetails();
      break;
    case 'tokens':
      loadTokenWallet();
      break;
    case 'deletion':
      loadAccountDeletionForm();
      break;
  }
}

// ============================================
// SECTION: PROFILE DETAILS
// ============================================

async function loadProfileDetails() {
  const container = $('#profile-content');
  container.html('<div class="loading">Loading profile details...</div>');

  try {
    const response = await authenticatedFetch(`${BACKEND_URL}/api/profile-info`);
    const data = await response.json();

    if (!response.ok) {
      container.html(`<div class="message error">${data.error || 'Failed to load profile'}</div>`);
      return;
    }

    const html = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Personal Information</h3>
        </div>
        <div class="form-group">
          <label>First Name</label>
          <input type="text" id="profile-first-name" value="${escapeHtml(data.first_name || '')}" disabled>
        </div>
        <div class="form-group">
          <label>Last Name</label>
          <input type="text" id="profile-last-name" value="${escapeHtml(data.last_name || '')}" disabled>
        </div>
        <div class="flex-group">
          <button class="btn btn-primary" onclick="editProfileMode()">Edit Details</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Email Address</h3>
        </div>
        <div class="form-group">
          <label>Current Email</label>
          <input type="email" id="profile-email" value="${escapeHtml(data.email)}" disabled>
        </div>
        <p class="text-muted">To change your email, click below. You'll need to verify the new email address.</p>
        <div class="flex-group">
          <button class="btn btn-primary" onclick="changeEmailMode()">Change Email</button>
        </div>
      </div>

      <div id="profile-message"></div>
    `;

    container.html(html);
  } catch (error) {
    console.error('Error loading profile:', error);
    container.html(`<div class="message error">Connection error: ${error.message}</div>`);
  }
}

function editProfileMode() {
  const firstName = $('#profile-first-name').val();
  const lastName = $('#profile-last-name').val();

  const html = `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Edit Personal Information</h3>
      </div>
      <form id="edit-profile-form">
        <div class="form-group">
          <label for="edit-first-name">First Name</label>
          <input type="text" id="edit-first-name" value="${escapeHtml(firstName)}" required>
        </div>
        <div class="form-group">
          <label for="edit-last-name">Last Name</label>
          <input type="text" id="edit-last-name" value="${escapeHtml(lastName)}" required>
        </div>
        <div class="flex-group">
          <button type="submit" class="btn btn-primary">Save Changes</button>
          <button type="button" class="btn btn-secondary" onclick="loadProfileDetails()">Cancel</button>
        </div>
      </form>
      <div id="edit-profile-message"></div>
    </div>
  `;

  $('#profile-content').html(html);

  $('#edit-profile-form').on('submit', async function(e) {
    e.preventDefault();
    await updateProfileInfo();
  });
}

async function updateProfileInfo() {
  const firstName = $('#edit-first-name').val().trim();
  const lastName = $('#edit-last-name').val().trim();

  try {
    const response = await authenticatedFetch(`${BACKEND_URL}/api/update-profile-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: firstName, last_name: lastName })
    });

    const data = await response.json();

    if (response.ok) {
      // Update stored user data
      currentUser.first_name = firstName;
      currentUser.last_name = lastName;
      localStorage.setItem('currentUser', JSON.stringify(currentUser));

      showMessage('edit-profile-message', '✓ Profile updated successfully!', 'success');
      setTimeout(() => loadProfileDetails(), 1500);
    } else {
      showMessage('edit-profile-message', data.error || 'Failed to update profile', 'error');
    }
  } catch (error) {
    console.error('Error updating profile:', error);
    showMessage('edit-profile-message', `Connection error: ${error.message}`, 'error');
  }
}

function changeEmailMode() {
  const currentEmail = $('#profile-email').val();

  const html = `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Change Email Address</h3>
      </div>
      <p class="text-muted">A verification link will be sent to your new email. You must verify it to complete the change.</p>
      <form id="change-email-form">
        <div class="form-group">
          <label>Current Email</label>
          <input type="email" value="${escapeHtml(currentEmail)}" disabled>
        </div>
        <div class="form-group">
          <label for="new-email">New Email Address</label>
          <input type="email" id="new-email" required>
        </div>
        <div class="form-group">
          <label for="email-2fa">2FA Code (if enabled)</label>
          <input type="text" id="email-2fa" placeholder="6-digit code" pattern="[0-9]*" inputmode="numeric" maxlength="6">
        </div>
        <div class="flex-group">
          <button type="submit" class="btn btn-primary">Request Email Change</button>
          <button type="button" class="btn btn-secondary" onclick="loadProfileDetails()">Cancel</button>
        </div>
      </form>
      <div id="change-email-message"></div>
    </div>
  `;

  $('#profile-content').html(html);

  $('#change-email-form').on('submit', async function(e) {
    e.preventDefault();
    await requestEmailChange();
  });
}

async function requestEmailChange() {
  const newEmail = $('#new-email').val().trim();
  const twoFACode = $('#email-2fa').val().trim();

  if (!newEmail) {
    showMessage('change-email-message', 'Please enter a new email address', 'error');
    return;
  }

  try {
    const response = await authenticatedFetch(`${BACKEND_URL}/api/change-email-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        new_email: newEmail,
        twofa_code: twoFACode,
        frontend_url: window.location.origin,
        account_path: window.location.pathname
      })
    });

    const data = await response.json();

    if (response.ok) {
      showMessage('change-email-message', '✓ Verification emails have been sent to both addresses. Please check your inbox.', 'success');
      setTimeout(() => loadProfileDetails(), 3000);
    } else {
      showMessage('change-email-message', data.error || 'Failed to request email change', 'error');
    }
  } catch (error) {
    console.error('Error requesting email change:', error);
    showMessage('change-email-message', `Connection error: ${error.message}`, 'error');
  }
}

// ============================================
// SECTION: CHANGE PASSWORD
// ============================================

function loadPasswordChangeForm() {
  const container = $('#password-content');

  const html = `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Update Your Password</h3>
      </div>
      <p class="text-muted">For security, you'll need to enter your 2FA code if you have it enabled.</p>
      <form id="password-change-form">
        <div class="form-group">
          <label for="current-password">Current Password</label>
          <input type="password" id="current-password" required>
        </div>
        <div class="form-group">
          <label for="new-password">New Password</label>
          <input type="password" id="new-password" required>
          <div class="password-strength" id="password-strength" style="margin-top: 8px; font-size: 12px;"></div>
        </div>
        <div class="form-group">
          <label for="confirm-password">Confirm Password</label>
          <input type="password" id="confirm-password" required>
        </div>
        <div class="form-group">
          <label for="password-2fa">2FA Code (if enabled)</label>
          <input type="text" id="password-2fa" placeholder="6-digit code" pattern="[0-9]*" inputmode="numeric" maxlength="6">
        </div>
        <div class="flex-group">
          <button type="submit" class="btn btn-primary">Change Password</button>
          <button type="button" class="btn btn-secondary" onclick="loadPasswordChangeForm()">Cancel</button>
        </div>
      </form>
      <div id="password-change-message"></div>
    </div>
  `;

  container.html(html);

  $('#password-change-form').on('submit', async function(e) {
    e.preventDefault();
    await changePassword();
  });

  // Password strength indicator
  $('#new-password').on('input', function() {
    checkPasswordStrength($(this).val());
  });
}

function checkPasswordStrength(password) {
  const strength = calculatePasswordStrength(password);
  const indicator = $('#password-strength');

  let text = '';
  let color = '';

  if (password.length === 0) {
    indicator.html('');
    return;
  }

  if (strength < 2) {
    text = 'Weak - Add uppercase, numbers, or symbols';
    color = '#dc3545';
  } else if (strength < 3) {
    text = 'Fair - Could be stronger';
    color = '#ffc107';
  } else if (strength < 4) {
    text = 'Good password';
    color = '#28a745';
  } else {
    text = 'Strong password';
    color = '#20c997';
  }

  indicator.html(`<span style="color: ${color};">${text}</span>`);
}

function calculatePasswordStrength(password) {
  let strength = 0;
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[^a-zA-Z\d]/.test(password)) strength++;
  return strength;
}

async function changePassword() {
  const currentPassword = $('#current-password').val();
  const newPassword = $('#new-password').val();
  const confirmPassword = $('#confirm-password').val();
  const twoFACode = $('#password-2fa').val().trim();

  if (newPassword !== confirmPassword) {
    showMessage('password-change-message', 'Passwords do not match', 'error');
    return;
  }

  if (newPassword.length < 8) {
    showMessage('password-change-message', 'Password must be at least 8 characters', 'error');
    return;
  }

  try {
    const response = await authenticatedFetch(`${BACKEND_URL}/api/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        twofa_code: twoFACode
      })
    });

    const data = await response.json();

    if (response.ok) {
      showMessage('password-change-message', '✓ Password changed successfully! You will be logged out and need to login with your new password.', 'success');
      setTimeout(() => {
        logout();
      }, 2000);
    } else {
      showMessage('password-change-message', data.error || 'Failed to change password', 'error');
    }
  } catch (error) {
    console.error('Error changing password:', error);
    showMessage('password-change-message', `Connection error: ${error.message}`, 'error');
  }
}

// ============================================
// SECTION: MANAGE SUBSCRIPTION (Framework)
// ============================================

function loadSubscriptionDetails() {
  const container = $('#subscription-content');
  container.html('<div class="loading">Loading subscription details...</div>');

  // Mock data for Phase 1
  const html = `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Current Subscription Status</h3>
      </div>
      <p><strong>Status:</strong> <span style="color: #28a745;">Active</span></p>
      <p><strong>Renewal Date:</strong> 2025-01-20</p>
      <p><strong>Billing Period:</strong> 2024-12-20 to 2025-01-19</p>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Your Selected Bank Connections</h3>
      </div>
      <div class="form-group">
        <label for="transaction-tokens">Transaction-Based Bank Connections</label>
        <input type="number" id="transaction-tokens" value="4" min="0" disabled>
        <p class="text-muted">@ \$0.30/month each</p>
      </div>
      <div class="form-group">
        <label for="investment-tokens">Investment-Based Bank Connections</label>
        <input type="number" id="investment-tokens" value="2" min="0" disabled>
        <p class="text-muted">@ \$0.18/month each</p>
      </div>
      <button class="btn btn-primary" onclick="editSubscriptionMode()">Change for Next Month</button>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Monthly Pricing Breakdown</h3>
      </div>
      <table style="width: 100%; font-size: 14px;">
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 8px 0;">Plaid Transaction Fees (4 × \$0.30)</td>
          <td style="text-align: right; padding: 8px 0;">\$1.20</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 8px 0;">Plaid Investment Fees (2 × \$0.18)</td>
          <td style="text-align: right; padding: 8px 0;">\$0.36</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 8px 0;">Server Fee</td>
          <td style="text-align: right; padding: 8px 0;">\$0.50</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 8px 0;">Stripe Processing Fee</td>
          <td style="text-align: right; padding: 8px 0;">\$0.30</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>App Fee</strong></td>
          <td style="text-align: right; padding: 8px 0;"><strong>\$0.50</strong></td>
        </tr>
        <tr style="background: #f0f0f0; font-weight: 600; border-radius: 4px;">
          <td style="padding: 12px 8px;"><strong>Total Monthly Cost</strong></td>
          <td style="text-align: right; padding: 12px 8px;"><strong>\$2.86</strong></td>
        </tr>
      </table>
    </div>

    <div class="card" style="background: #ffeaa7; border-color: #ffd93d;">
      <p class="text-muted" style="color: #d68f00; margin: 0;">
        <strong>Note:</strong> Subscriptions cannot be cancelled. To stop all charges, you must delete your account. However, you can adjust the number of bank connections you pay for each month.
      </p>
    </div>

    <div id="subscription-message"></div>
  `;

  container.html(html);
}

function editSubscriptionMode() {
  const html = `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Adjust Subscription for Next Month</h3>
      </div>
      <form id="subscription-form">
        <div class="form-group">
          <label for="edit-transaction-tokens">Transaction-Based Bank Connections</label>
          <input type="number" id="edit-transaction-tokens" value="4" min="0" required>
          <p class="text-muted">@ \$0.30/month each</p>
        </div>
        <div class="form-group">
          <label for="edit-investment-tokens">Investment-Based Bank Connections</label>
          <input type="number" id="edit-investment-tokens" value="2" min="0" required>
          <p class="text-muted">@ \$0.18/month each</p>
        </div>
        <div class="flex-group">
          <button type="submit" class="btn btn-primary">Calculate New Total</button>
          <button type="button" class="btn btn-secondary" onclick="loadSubscriptionDetails()">Cancel</button>
        </div>
      </form>
      <div id="subscription-edit-message"></div>
    </div>
  `;

  $('#subscription-content').html(html);

  $('#subscription-form').on('submit', function(e) {
    e.preventDefault();
    calculateNewSubscriptionTotal();
  });
}

function calculateNewSubscriptionTotal() {
  const transactionTokens = parseInt($('#edit-transaction-tokens').val()) || 0;
  const investmentTokens = parseInt($('#edit-investment-tokens').val()) || 0;

  const transactionCost = transactionTokens * 0.30;
  const investmentCost = investmentTokens * 0.18;
  const serverFee = 0.50;
  const stripeFee = 0.30;
  const appFee = 0.50;
  const total = transactionCost + investmentCost + serverFee + stripeFee + appFee;

  const summary = `
    <div class="card" style="margin-top: 20px;">
      <div class="card-header">
        <h3 class="card-title">Next Month's Estimated Total</h3>
      </div>
      <table style="width: 100%; font-size: 14px;">
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 8px 0;">Plaid Transaction Fees (${transactionTokens} × \$0.30)</td>
          <td style="text-align: right; padding: 8px 0;">\$${transactionCost.toFixed(2)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 8px 0;">Plaid Investment Fees (${investmentTokens} × \$0.18)</td>
          <td style="text-align: right; padding: 8px 0;">\$${investmentCost.toFixed(2)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 8px 0;">Server Fee</td>
          <td style="text-align: right; padding: 8px 0;">\$${serverFee.toFixed(2)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 8px 0;">Stripe Processing Fee</td>
          <td style="text-align: right; padding: 8px 0;">\$${stripeFee.toFixed(2)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 8px 0;">App Fee</td>
          <td style="text-align: right; padding: 8px 0;">\$${appFee.toFixed(2)}</td>
        </tr>
        <tr style="background: #f0f0f0; font-weight: 600;">
          <td style="padding: 12px 8px;"><strong>Total Monthly Cost</strong></td>
          <td style="text-align: right; padding: 12px 8px;"><strong>\$${total.toFixed(2)}</strong></td>
        </tr>
      </table>
      <div class="flex-group" style="margin-top: 20px;">
        <button type="button" class="btn btn-primary" onclick="confirmSubscriptionUpdate(${transactionTokens}, ${investmentTokens})">Confirm Changes</button>
        <button type="button" class="btn btn-secondary" onclick="loadSubscriptionDetails()">Cancel</button>
      </div>
    </div>
  `;

  $('#subscription-edit-message').html(summary);
}

function confirmSubscriptionUpdate(transactionTokens, investmentTokens) {
  showMessage('subscription-edit-message', '✓ Subscription updated for next month!', 'success');
  setTimeout(() => loadSubscriptionDetails(), 1500);
}

// ============================================
// SECTION: TOKEN WALLET
// ============================================

function loadTokenWallet() {
  const container = $('#tokens-content');
  container.html('<div class="loading">Loading token wallet...</div>');

  // Mock data for Phase 1
  const html = `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Current Token Balance</h3>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
        <div style="background: #f0f0f0; padding: 15px; border-radius: 6px; text-align: center;">
          <div style="font-size: 32px; font-weight: 600; color: #182742;">4</div>
          <div style="color: #666; font-size: 12px;">Transaction Tokens</div>
          <p class="text-muted" style="font-size: 11px; margin-top: 5px;">Each connection costs \$0.30/mo</p>
        </div>
        <div style="background: #f0f0f0; padding: 15px; border-radius: 6px; text-align: center;">
          <div style="font-size: 32px; font-weight: 600; color: #182742;">2</div>
          <div style="color: #666; font-size: 12px;">Investment Tokens</div>
          <p class="text-muted" style="font-size: 11px; margin-top: 5px;">Each connection costs \$0.18/mo</p>
        </div>
        <div style="background: #f0f0f0; padding: 15px; border-radius: 6px; text-align: center;">
          <div style="font-size: 32px; font-weight: 600; color: #182742;">1</div>
          <div style="color: #666; font-size: 12px;">Swap Tokens</div>
          <p class="text-muted" style="font-size: 11px; margin-top: 5px;">Swap banks within month</p>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Token Usage History</h3>
      </div>
      <div style="overflow-x: auto;">
        <table style="width: 100%; font-size: 13px;">
          <thead>
            <tr style="border-bottom: 2px solid #e0e0e0;">
              <th style="text-align: left; padding: 10px 0;">Date</th>
              <th style="text-align: left; padding: 10px 0;">Token Type</th>
              <th style="text-align: left; padding: 10px 0;">Action</th>
              <th style="text-align: left; padding: 10px 0;">Reason</th>
              <th style="text-align: right; padding: 10px 0;">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 10px 0;">2025-12-20</td>
              <td style="padding: 10px 0;"><span style="background: #e3f2fd; color: #1976d2; padding: 2px 6px; border-radius: 3px; font-size: 11px;">Transaction</span></td>
              <td style="padding: 10px 0;">Consumed</td>
              <td style="padding: 10px 0;">Bank connection added</td>
              <td style="text-align: right; padding: 10px 0;"><strong>3</strong></td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 10px 0;">2025-12-01</td>
              <td style="padding: 10px 0;"><span style="background: #f0f0f0; color: #666; padding: 2px 6px; border-radius: 3px; font-size: 11px;">Transaction</span></td>
              <td style="padding: 10px 0;">Refilled</td>
              <td style="padding: 10px 0;">Monthly refill</td>
              <td style="text-align: right; padding: 10px 0;"><strong>4</strong></td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 10px 0;">2025-11-20</td>
              <td style="padding: 10px 0;"><span style="background: #fff3e0; color: #e65100; padding: 2px 6px; border-radius: 3px; font-size: 11px;">Investment</span></td>
              <td style="padding: 10px 0;">Consumed</td>
              <td style="padding: 10px 0;">Investment account added</td>
              <td style="text-align: right; padding: 10px 0;"><strong>1</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="background: #efe; border-color: #cfc;">
      <p class="text-muted" style="color: #3c3; margin: 0;">
        <strong>Next Refill:</strong> Your tokens will be refilled on 2025-01-20 based on your subscription. You'll receive 4 transaction tokens, 2 investment tokens, and 1 swap token.
      </p>
    </div>
  `;

  container.html(html);
}

// ============================================
// SECTION: ACCOUNT DELETION
// ============================================

function loadAccountDeletionForm() {
  const container = $('#deletion-content');

  const html = `
    <div class="card" style="background: #fdf2f2; border-color: #fcc;">
      <div style="display: flex; gap: 10px; align-items: flex-start;">
        <div style="font-size: 24px;">⚠️</div>
        <div>
          <p style="margin: 0; margin-bottom: 5px;"><strong>This action cannot be undone</strong></p>
          <p style="margin: 0; color: #666; font-size: 13px;">Deleting your account will:</p>
          <ul style="margin: 10px 0 0 0; padding-left: 20px; font-size: 13px; color: #666;">
            <li>Permanently delete all your account data</li>
            <li>Disconnect all bank connections</li>
            <li>Cancel your subscription at the end of the current billing month</li>
            <li>Remove all stored transactions and investment data</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Request Account Deletion</h3>
      </div>
      <p class="text-muted">Your account will be scheduled for deletion at the end of your current billing period. You'll receive a confirmation email with a link you must click to proceed.</p>
      <form id="deletion-form">
        <div class="form-group">
          <label for="deletion-2fa">2FA Code (if enabled)</label>
          <input type="text" id="deletion-2fa" placeholder="6-digit code" pattern="[0-9]*" inputmode="numeric" maxlength="6">
        </div>
        <div class="flex-group">
          <button type="submit" class="btn btn-danger">Request Account Deletion</button>
          <button type="button" class="btn btn-secondary" onclick="$('#deletion-content').html('<div class=\\\"message\\\">Deletion cancelled.</div>'); loadAccountDeletionForm();">Cancel</button>
        </div>
      </form>
      <div id="deletion-message"></div>
    </div>
  `;

  container.html(html);

  $('#deletion-form').on('submit', async function(e) {
    e.preventDefault();
    await requestAccountDeletion();
  });
}

async function requestAccountDeletion() {
  const twoFACode = $('#deletion-2fa').val().trim();

  if (!confirm('Are you absolutely sure? This will delete your account and all associated data at the end of the billing month. This cannot be undone.')) {
    return;
  }

  try {
    const response = await authenticatedFetch(`${BACKEND_URL}/api/request-account-deletion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twofa_code: twoFACode })
    });

    const data = await response.json();

    if (response.ok) {
      showMessage('deletion-message', '✓ Deletion confirmation email sent! Check your inbox and click the link to confirm.', 'success');
      setTimeout(() => {
        loadAccountDeletionForm();
      }, 3000);
    } else {
      showMessage('deletion-message', data.error || 'Failed to request deletion', 'error');
    }
  } catch (error) {
    console.error('Error requesting deletion:', error);
    showMessage('deletion-message', `Connection error: ${error.message}`, 'error');
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function showMessage(elementId, message, type) {
  $(`#${elementId}`).html(`<div class="message ${type}">${message}</div>`);
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

async function refreshAccessToken() {
  if (!refreshToken) {
    logout();
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

      if (data.refresh_token) {
        refreshToken = data.refresh_token;
        localStorage.setItem('refreshToken', refreshToken);
      }

      return true;
    } else {
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
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    ...options.headers
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();

    if (refreshed) {
      headers['Authorization'] = `Bearer ${authToken}`;
      return fetch(url, { ...options, headers });
    }
  }

  return response;
}

function setupActivityListeners() {
  // Placeholder for activity listeners if needed
}

function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('currentUser');
  authToken = null;
  refreshToken = null;
  currentUser = null;
  window.location.href = 'index.html';
}

// ============================================
// EMAIL VERIFICATION HANDLERS
// ============================================

async function handleEmailVerification(token) {
  const container = document.body;
  container.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px;">
      <div style="background: white; border-radius: 12px; padding: 40px; max-width: 500px; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
        <h2 style="color: #182742; margin-bottom: 20px;">Verifying Email...</h2>
        <div class="loading">Please wait while we verify your new email address</div>
      </div>
    </div>
  `;

  try {
    const response = await fetch(`${BACKEND_URL}/api/verify-email-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const data = await response.json();

    if (response.ok) {
      container.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px;">
          <div style="background: white; border-radius: 12px; padding: 40px; max-width: 500px; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
            <h2 style="color: #28a745; margin-bottom: 20px;">✓ Email Verified Successfully!</h2>
            <p style="color: #666; margin-bottom: 20px;">${data.message}</p>
            <p style="color: #666; margin-bottom: 30px;">You will be redirected to the login page in 3 seconds...</p>
            <a href="index.html" class="btn btn-primary" style="text-decoration: none; display: inline-block;">Go to Login Now</a>
          </div>
        </div>
      `;
      setTimeout(() => {
        // Logout and redirect to login
        localStorage.clear();
        window.location.href = 'index.html';
      }, 3000);
    } else {
      container.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px;">
          <div style="background: white; border-radius: 12px; padding: 40px; max-width: 500px; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
            <h2 style="color: #dc3545; margin-bottom: 20px;">❌ Verification Failed</h2>
            <p style="color: #666; margin-bottom: 20px;">${data.error || 'The verification link is invalid or has expired.'}</p>
            <a href="index.html" class="btn btn-primary" style="text-decoration: none; display: inline-block;">Go to Login</a>
          </div>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error verifying email:', error);
    container.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px;">
        <div style="background: white; border-radius: 12px; padding: 40px; max-width: 500px; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
          <h2 style="color: #dc3545; margin-bottom: 20px;">❌ Connection Error</h2>
          <p style="color: #666; margin-bottom: 20px;">Unable to verify email. Please try again later.</p>
          <a href="index.html" class="btn btn-primary" style="text-decoration: none; display: inline-block;">Go to Login</a>
        </div>
      </div>
    `;
  }
}

async function handleEmailRejection(token) {
  const container = document.body;
  container.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px;">
      <div style="background: white; border-radius: 12px; padding: 40px; max-width: 500px; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
        <h2 style="color: #182742; margin-bottom: 20px;">Processing Security Request...</h2>
        <div class="loading">Please wait while we secure your account</div>
      </div>
    </div>
  `;

  try {
    const response = await fetch(`${BACKEND_URL}/api/reject-email-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const data = await response.json();

    if (response.ok) {
      container.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px;">
          <div style="background: white; border-radius: 12px; padding: 40px; max-width: 500px; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
            <h2 style="color: #dc3545; margin-bottom: 20px;">🔒 Account Locked for Security</h2>
            <p style="color: #666; margin-bottom: 15px;">${data.message}</p>
            <p style="color: #666; margin-bottom: 20px;">We've sent a password reset link to your email. Please check your inbox to reset your password and unlock your account.</p>
            <a href="index.html" class="btn btn-primary" style="text-decoration: none; display: inline-block;">Go to Login</a>
          </div>
        </div>
      `;
      // Clear any stored auth tokens
      localStorage.clear();
    } else {
      container.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px;">
          <div style="background: white; border-radius: 12px; padding: 40px; max-width: 500px; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
            <h2 style="color: #dc3545; margin-bottom: 20px;">❌ Error</h2>
            <p style="color: #666; margin-bottom: 20px;">${data.error || 'The security link is invalid or has expired.'}</p>
            <a href="index.html" class="btn btn-primary" style="text-decoration: none; display: inline-block;">Go to Login</a>
          </div>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error rejecting email change:', error);
    container.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px;">
        <div style="background: white; border-radius: 12px; padding: 40px; max-width: 500px; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
          <h2 style="color: #dc3545; margin-bottom: 20px;">❌ Connection Error</h2>
          <p style="color: #666; margin-bottom: 20px;">Unable to process your request. Please try again later.</p>
          <a href="index.html" class="btn btn-primary" style="text-decoration: none; display: inline-block;">Go to Login</a>
        </div>
      </div>
    `;
  }
}
