/* =====================================================================
   auth.js — Client-side auth: JWT storage, login/logout UI
   ===================================================================== */

(function () {
  window.AE = window.AE || {};
  const TOKEN_KEY = 'ae_token';

  // ── Token helpers ──────────────────────────────────────────────────
  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  // ── API fetch with auth header ──────────────────────────────────────
  async function apiFetch(url, options = {}) {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (options.body instanceof FormData) {
      delete headers['Content-Type']; // Let browser set multipart boundary
    }
    const res = await fetch(url, { ...options, headers });
    return res;
  }

  // ── Current user ────────────────────────────────────────────────────
  let currentUser = null;

  async function loadCurrentUser() {
    const token = getToken();
    if (!token) return null;
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        return currentUser;
      }
    } catch (e) { /* silent */ }
    clearToken();
    currentUser = null;
    return null;
  }

  function getCurrentUser() {
    return currentUser;
  }

  function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  // ── Update account button ────────────────────────────────────────────
  function updateAccountBtn(user) {
    const btn = document.getElementById('account-btn');
    if (!btn) return;
    if (user) {
      btn.textContent = getInitials(user.name);
      btn.classList.add('logged-in');
      btn.title = user.name;
    } else {
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
      btn.classList.remove('logged-in');
      btn.title = 'Sign in';
    }
  }

  // ── Account Panel ────────────────────────────────────────────────────
  function renderAccountPanel(user) {
    const panel = document.getElementById('account-panel');
    if (!panel) return;

    if (user) {
      panel.innerHTML = `
        <div class="account-panel-header">
          <h3>Account</h3>
          <p>Signed in to AuditEase</p>
        </div>
        <div class="account-panel-body">
          <div class="account-panel-user">
            <div class="account-panel-avatar">${getInitials(user.name)}</div>
            <div class="account-panel-user-info">
              <h4>${escapeHtml(user.name)}</h4>
              <p>@${escapeHtml(user.username)}</p>
            </div>
          </div>
          <button class="btn btn-ghost w-full" id="signout-btn" style="justify-content:center;">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      `;
      document.getElementById('signout-btn').addEventListener('click', handleSignOut);
    } else {
      panel.innerHTML = `
        <div class="account-panel-header">
          <h3>Sign In</h3>
          <p>Access AuditEase</p>
        </div>
        <div class="account-panel-body">
          <div class="form-group">
            <label for="login-username">Username</label>
            <input type="text" id="login-username" placeholder="Enter your username" autocomplete="username" />
          </div>
          <div class="form-group">
            <label for="login-password">Password</label>
            <input type="password" id="login-password" placeholder="Enter your password" autocomplete="current-password" />
          </div>
          <p class="login-error" id="login-error"></p>
          <button class="btn btn-primary" id="login-btn" style="width:100%;justify-content:center;">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            Sign In
          </button>
        </div>
      `;
      const loginBtn = document.getElementById('login-btn');
      const pwInput = document.getElementById('login-password');
      loginBtn.addEventListener('click', handleLogin);
      pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
      document.getElementById('login-username').addEventListener('keydown', e => { if (e.key === 'Enter') pwInput.focus(); });
    }
  }

  async function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    if (!username || !password) {
      errEl.textContent = 'Please enter username and password';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in…';
    errEl.textContent = '';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        currentUser = data.user;
        updateAccountUI(currentUser);
      } else {
        errEl.textContent = data.error || 'Login failed';
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    } catch (e) {
      errEl.textContent = 'Connection error. Please try again.';
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  }

  async function handleSignOut() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) { /* silent */ }
    clearToken();
    currentUser = null;
    updateAccountUI(null);
  }

  // ── Panel visibility ─────────────────────────────────────────────────
  function openAccountPanel() {
    const panel = document.getElementById('account-panel');
    if (!panel) {
      console.error('[AuditEase] openAccountPanel: #account-panel not found in DOM');
      return;
    }

    // Force show using inline style — overrides any CSS class hiding
    panel.style.setProperty('display', 'block', 'important');
    panel.style.setProperty('visibility', 'visible', 'important');
    panel.style.setProperty('opacity', '1', 'important');
    panel.style.setProperty('z-index', '9999', 'important');

    // Also remove any hiding classes just in case
    panel.classList.remove('hidden');
    panel.classList.add('visible');

    // Focus username input for immediate typing
    setTimeout(() => {
      const input = document.getElementById('login-username');
      if (input) input.focus();
    }, 50);

    console.log('[AuditEase] Account panel opened');
  }

  function closeAccountPanel() {
    const panel = document.getElementById('account-panel');
    if (!panel) return;
    panel.style.removeProperty('display');
    panel.style.removeProperty('visibility');
    panel.style.removeProperty('opacity');
    panel.classList.add('hidden');
    panel.classList.remove('visible');
  }

  function toggleAccountPanel() {
    const panel = document.getElementById('account-panel');
    if (panel) {
      if (panel.classList.contains('hidden') || panel.style.display === 'none') {
        openAccountPanel();
      } else {
        closeAccountPanel();
      }
    }
  }

  // ── Escape helper ────────────────────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Auth guard (for protected pages) ────────────────────────────────
  function showAuthGuard() {
    // Dim the page content
    const contentBody = document.querySelector('.page-body') 
      || document.getElementById('dashboard-body')
      || document.getElementById('vault-body')
      || document.getElementById('archives-body');

    if (contentBody) {
      contentBody.style.filter = 'blur(4px)';
      contentBody.style.pointerEvents = 'none';
    }

    // Remove existing overlay if any
    const existing = document.getElementById('auth-guard-overlay');
    if (existing) existing.remove();

    let pageName = 'the dashboard';
    if (window.location.pathname.includes('vault')) {
      pageName = 'the document vault';
    } else if (window.location.pathname.includes('archives')) {
      pageName = 'the archives';
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'auth-guard-overlay';
    overlay.innerHTML = `
      <div id="auth-guard-box">
        <div id="auth-guard-icon">🔒</div>
        <h2 id="auth-guard-title">Sign in to continue</h2>
        <p id="auth-guard-subtitle">You need to be signed in to view ${pageName}.</p>
        <button type="button" id="auth-guard-signin-btn">Sign In</button>
      </div>
    `;
    document.body.appendChild(overlay);

    // Attach button listener — with safety check for topbar panel and debugging logs
    const guardBtn = document.getElementById('auth-guard-signin-btn');
    if (guardBtn) {
      guardBtn.addEventListener('click', () => {
        console.log('[AuditEase] Auth guard Sign In button clicked');
        console.log('[AuditEase] account-panel in DOM:', !!document.getElementById('account-panel'));
        const panel = document.getElementById('account-panel');
        if (panel) {
          openAccountPanel();
        } else {
          // Topbar not ready yet — wait and retry once
          console.warn('[AuditEase] account-panel not in DOM yet, retrying in 300ms');
          setTimeout(() => {
            const retryPanel = document.getElementById('account-panel');
            if (retryPanel) {
              openAccountPanel();
            } else {
              console.error('[AuditEase] account-panel still not found. Check topbar is loaded on this page.');
            }
          }, 300);
        }
      });
    } else {
      console.error('[AuditEase] auth-guard-signin-btn not found after overlay injection');
    }
  }

  // ── updateAccountUI ──────────────────────────────────────────────────
  function updateAccountUI(user, skipGuard = false) {
    updateAccountBtn(user);
    closeAccountPanel();
    renderAccountPanel(user);

    if (user) {
      // Remove auth guard overlay if present
      const overlay = document.getElementById('auth-guard-overlay');
      if (overlay) overlay.remove();

      // Restore blurred content
      const contentBody = document.querySelector('.page-body') 
        || document.getElementById('dashboard-body')
        || document.getElementById('vault-body')
        || document.getElementById('archives-body');

      if (contentBody) {
        contentBody.style.filter = '';
        contentBody.style.pointerEvents = '';
      }
    } else {
      // Show auth guard if page is protected and we don't want to skip it
      const isProtected = document.body.dataset.protected === 'true';
      if (isProtected && !skipGuard) {
        showAuthGuard();
      }
    }

    if (typeof window.onAuthChange === 'function') {
      window.onAuthChange(user);
    }
  }

  // ── initAuthUI — called by topbar.js AFTER topbar HTML is injected ──────
  // This must NOT run in DOMContentLoaded because #account-btn and
  // #account-panel don't exist until initTopbar() injects the topbar HTML.
  async function initAuthUI() {
    const accountBtn = document.getElementById('account-btn');
    if (accountBtn) {
      accountBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAccountPanel();
      });
    } else {
      console.error('[AuditEase] #account-btn not found — topbar may not have been injected yet');
    }

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('account-panel');
      const btn = document.getElementById('account-btn');
      if (panel && (!panel.classList.contains('hidden') || panel.style.display !== 'none')) {
        if (!panel.contains(e.target) && e.target !== btn) {
          closeAccountPanel();
        }
      }
    });

    const user = await loadCurrentUser();
    updateAccountUI(user, true);
  }

  // ── Exports ───────────────────────────────────────────────────────────
  window.AE.getToken = getToken;
  window.AE.apiFetch = apiFetch;
  window.AE.getCurrentUser = getCurrentUser;
  window.AE.loadCurrentUser = loadCurrentUser;
  window.AE.escapeHtml = escapeHtml;
  window.AE.updateAccountBtn = updateAccountBtn;
  window.AE.renderAccountPanel = renderAccountPanel;
  window.AE.initAuthUI = initAuthUI;  // Called by topbar.js after HTML injection
  window.AE.openAccountPanel = openAccountPanel;
  window.AE.closeAccountPanel = closeAccountPanel;
  window.AE.showAuthGuard = showAuthGuard;
  window.openAccountPanel = openAccountPanel;
})();
