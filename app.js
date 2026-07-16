{
  const MY_SUPABASE_URL = 'https://yjwzkqdutezumggvwqhg.supabase.co';
  const MY_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlqd3prcWR1dGV6dW1nZ3Z3cWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNTkxOTMsImV4cCI6MjA5NjgzNTE5M30.b96l1o62KBYAuOYVdIKfmREc7jxkU26tTyftcR85YZY';

  if (typeof supabase === 'undefined') {
    console.error('Critical Error: the Supabase CDN script failed to load.');
  } else {
    const supabaseClient = supabase.createClient(MY_SUPABASE_URL, MY_SUPABASE_ANON_KEY);
    const BUCKET = 'vault-files';

    // ---------------------------------------------------------------------
    // STATE
    // ---------------------------------------------------------------------
    let cachedFilesArray = [];
    let currentDashboardView = 'active';
    let fileLayoutMode = 'grid';
    let favoritedFilePaths = safeParseJSON(localStorage.getItem('vault_favs'), []);
    let globalChartInstance = null;
    let lastKnownStorageLabel = '0 KB';
    let syncTimerInterval = null;
    let currentDirectoryPath = ''; // '', 'College/', 'College/Projects/'
    let currentUserId = null; // set on login — every storage path is scoped under this

    function safeParseJSON(str, fallback) {
      try { return JSON.parse(str) ?? fallback; } catch { return fallback; }
    }

    // Every real call to Supabase Storage goes through here so no path can
    // accidentally reach across into another user's folder.
    function absPath(relativePath) {
      return `${currentUserId}/${relativePath}`;
    }

    // ---------------------------------------------------------------------
    // TOASTS (replaces alert())
    // ---------------------------------------------------------------------
    function showToast(message, type = 'ok') {
      const stack = document.getElementById('toast-stack');
      if (!stack) return;
      const el = document.createElement('div');
      el.className = `toast${type === 'error' ? ' toast-error' : ''}`;
      el.textContent = message;
      stack.appendChild(el);
      setTimeout(() => {
        el.classList.add('toast-fade');
        setTimeout(() => el.remove(), 250);
      }, 3800);
    }

    // ---------------------------------------------------------------------
    // ACTIVITY LOGGER
    // ---------------------------------------------------------------------
    function pushSystemActivityLog(messageText, logType = 'teal') {
      const loggerList = document.getElementById('activity-logger-list');
      if (!loggerList) return;
      const logItem = document.createElement('div');
      logItem.className = 'activity-log-item';
      logItem.innerHTML = `
        <span class="log-dot dot-${logType}"></span>
        <div class="log-details">
          <p></p>
          <small>Just now</small>
        </div>`;
      logItem.querySelector('p').textContent = messageText; // safe text, no HTML injection
      loggerList.insertBefore(logItem, loggerList.firstChild);
      while (loggerList.children.length > 25) loggerList.removeChild(loggerList.lastChild);
    }

    // ---------------------------------------------------------------------
    // GREETING
    // ---------------------------------------------------------------------
    function greetingPhrase() {
      const h = new Date().getHours();
      if (h < 12) return 'Good morning';
      if (h < 17) return 'Good afternoon';
      return 'Good evening';
    }

    function updateHeaderGreeting(name) {
      const headerGreetEl = document.getElementById('dashboard-greeting-text');
      if (headerGreetEl) headerGreetEl.textContent = `${greetingPhrase()}${name ? ', ' + name : ''}`;
    }

    function updateDashboardGreeting() {
      const titleElement = document.getElementById('current-view-title');
      if (titleElement && currentDashboardView === 'active' && currentDirectoryPath === '') {
        titleElement.innerHTML = `<span class="greet-line">Your vault</span><span class="greet-sub">Everything currently stored, organized and encrypted.</span>`;
      }
    }

    // ---------------------------------------------------------------------
    // LIVE SYNC TIMER (security stat card)
    // ---------------------------------------------------------------------
    function startLiveSyncTimer() {
      if (syncTimerInterval) clearInterval(syncTimerInterval);
      let seconds = 0;
      const card = document.getElementById('security-stat-card');
      if (!card) return;
      const render = () => {
        let displayTime = `${seconds}s ago`;
        if (seconds >= 60) displayTime = `${Math.floor(seconds / 60)}m ago`;
        card.innerHTML = `
          <div class="stat-icon icon-teal">⚿</div>
          <div class="stat-data">
            <h5 class="stat-title">System &amp; security</h5>
            <h3 class="stat-value stat-value-mono">AES‑256</h3>
            <span style="color:var(--text-muted); font-size:11px; font-weight:600;">Synced ${displayTime}</span>
          </div>`;
      };
      render();
      syncTimerInterval = setInterval(() => { seconds++; render(); }, 1000);
    }

    // ---------------------------------------------------------------------
    // BREADCRUMBS
    // ---------------------------------------------------------------------
    function renderBreadcrumbs() {
      const trail = document.getElementById('breadcrumbs-trail');
      if (!trail) return;
      trail.innerHTML = `<span class="breadcrumb-root" id="breadcrumb-root">Root</span>`;

      document.getElementById('breadcrumb-root').addEventListener('click', () => {
        currentDirectoryPath = '';
        loadCloudFiles(false);
      });

      if (currentDirectoryPath === '') return;

      const folders = currentDirectoryPath.split('/').filter(Boolean);
      let runningPath = '';
      folders.forEach((folder) => {
        runningPath += folder + '/';
        const span = document.createElement('span');
        span.className = 'breadcrumb-item';
        span.textContent = folder;
        span.dataset.path = runningPath;
        span.addEventListener('click', function () {
          currentDirectoryPath = this.dataset.path;
          loadCloudFiles(false);
        });
        trail.appendChild(span);
      });
    }

    // ---------------------------------------------------------------------
    // ANALYTICS
    // ---------------------------------------------------------------------
    function calculateAndRenderAnalytics() {
      const totalSpaceEl = document.getElementById('stat-total-space');
      const fileCountEl = document.getElementById('stat-files-count');
      const widgetPercentEl = document.getElementById('widget-percentage');
      const widgetUsedEl = document.getElementById('widget-used-space');
      const widgetFillEl = document.getElementById('widget-progress-fill');
      const chartCanvas = document.getElementById('storageChart');
      if (!totalSpaceEl || !fileCountEl || !chartCanvas) return;

      let totalBytes = 0, activeCount = 0;
      const typeCounts = { Images: 0, Documents: 0, Others: 0 };

      cachedFilesArray.forEach(file => {
        if (file.name.endsWith('.emptyFolderPlaceholder')) return;
        totalBytes += file.metadata?.size || 0;
        if (!file.isTrashFile) activeCount++;
        const ext = file.name.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) typeCounts.Images++;
        else if (['pdf', 'doc', 'docx', 'txt', 'csv', 'xlsx'].includes(ext)) typeCounts.Documents++;
        else typeCounts.Others++;
      });

      const formatBytes = (b) => b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;
      const formattedSize = totalBytes > 0 ? formatBytes(totalBytes) : '0 KB';
      lastKnownStorageLabel = formattedSize;

      totalSpaceEl.textContent = formattedSize;
      fileCountEl.textContent = activeCount;
      if (widgetUsedEl) widgetUsedEl.textContent = formattedSize;

      const allocationLimitBytes = 998 * 1024 * 1024;
      const ratio = ((totalBytes / allocationLimitBytes) * 100).toFixed(2);
      if (widgetPercentEl) widgetPercentEl.textContent = `${ratio}%`;
      if (widgetFillEl) widgetFillEl.style.width = `${Math.max(0.2, ratio)}%`;

      const availableCard = document.querySelectorAll('.stat-card')[2];
      if (availableCard) {
        const freeBytes = allocationLimitBytes - totalBytes;
        const valueEl = availableCard.querySelector('.stat-value');
        if (valueEl) valueEl.textContent = `${(freeBytes / (1024 * 1024)).toFixed(1)} MB`;
      }

      document.getElementById('dist-count-images').textContent = typeCounts.Images;
      document.getElementById('dist-count-docs').textContent = typeCounts.Documents;
      document.getElementById('dist-count-others').textContent = typeCounts.Others;

      if (globalChartInstance) globalChartInstance.destroy();
      globalChartInstance = new Chart(chartCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Images', 'Docs', 'Others'],
          datasets: [{
            data: [typeCounts.Images, typeCounts.Documents, typeCounts.Others],
            backgroundColor: ['#6c93c9', '#4d9a90', '#635f57'],
            borderWidth: 0, hoverOffset: 3
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: true } },
          cutout: '78%'
        }
      });
    }

    // ---------------------------------------------------------------------
    // SETTINGS — appearance preferences (theme / accent / font size)
    // ---------------------------------------------------------------------
    function applyTheme(theme) {
      let resolved = theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
        : theme;
      document.documentElement.setAttribute('data-theme', resolved === 'light' ? 'light' : 'dark');
      localStorage.setItem('vault_theme', theme);
    }
    function applyAccentColor(color) {
      document.documentElement.setAttribute('data-accent', color);
      localStorage.setItem('vault_color', color);
    }
    function applyFontSize(size) {
      document.documentElement.setAttribute('data-font-size', size);
      localStorage.setItem('vault_font_size', size);
    }
    function applyStoredPreferencesOnBoot() {
      applyTheme(localStorage.getItem('vault_theme') || 'dark');
      applyAccentColor(localStorage.getItem('vault_color') || 'blue');
      applyFontSize(localStorage.getItem('vault_font_size') || 'medium');
    }

    // ---------------------------------------------------------------------
    // SETTINGS — one-time event wiring + per-open data refresh
    // ---------------------------------------------------------------------
    let settingsWired = false;

    function wireSettingsPanelOnce() {
      if (settingsWired) return;
      settingsWired = true;

      // Theme
      document.querySelectorAll('#theme-radio-group input[name="theme"]').forEach(radio => {
        radio.addEventListener('change', () => { if (radio.checked) applyTheme(radio.value); });
      });

      // Primary color
      document.querySelectorAll('#color-swatch-row .color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
          document.querySelectorAll('#color-swatch-row .color-swatch').forEach(s => s.classList.remove('active'));
          swatch.classList.add('active');
          applyAccentColor(swatch.dataset.color);
        });
      });

      // Font size
      document.querySelectorAll('#font-size-control button').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#font-size-control button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          applyFontSize(btn.dataset.size);
        });
      });

      // Security: change password
      document.getElementById('change-password-btn')?.addEventListener('click', async () => {
        const newPassword = prompt('Enter a new password (minimum 6 characters):');
        if (!newPassword) return;
        if (newPassword.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
        const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (error) showToast(error.message, 'error');
        else { showToast('Password updated'); pushSystemActivityLog('Password changed', 'teal'); }
      });

      // Security: 2FA (placeholder — honest about current state)
      document.getElementById('toggle-2fa-input')?.addEventListener('change', () => {
        showToast('Two-factor auth needs MFA enrollment turned on in your Supabase project first.');
      });

      // Security: login activity
      document.getElementById('login-activity-btn')?.addEventListener('click', async () => {
        const panel = document.getElementById('login-activity-panel');
        if (!panel) return;
        if (!panel.hidden) { panel.hidden = true; return; }
        const { data } = await supabaseClient.auth.getUser();
        const u = data?.user;
        const fmt = (d) => d ? new Date(d).toLocaleString() : 'Unknown';
        panel.innerHTML = `Last sign-in: <strong>${fmt(u?.last_sign_in_at)}</strong><br>Account created: <strong>${fmt(u?.created_at)}</strong>`;
        panel.hidden = false;
      });

      // Security: active devices (placeholder — honest about current state)
      document.getElementById('active-devices-btn')?.addEventListener('click', () => {
        showToast('Per-device session tracking isn\u2019t enabled on this project yet.');
      });

      // Security: logout everywhere
      document.getElementById('logout-all-btn')?.addEventListener('click', async () => {
        if (!confirm('Sign out of every device and browser where you\u2019re logged in?')) return;
        const { error } = await supabaseClient.auth.signOut({ scope: 'global' });
        if (error) { showToast(error.message, 'error'); return; }
        cachedFilesArray = [];
        currentUserId = null;
        if (syncTimerInterval) clearInterval(syncTimerInterval);
        document.getElementById('dashboard-container').classList.add('dashboard-hidden');
        document.getElementById('auth-container').style.display = 'flex';
        showToast('Signed out everywhere');
      });

      // Profile: avatar upload / remove
      document.getElementById('profile-avatar-wrap')?.addEventListener('click', () => {
        document.getElementById('avatar-file-input')?.click();
      });
      document.getElementById('avatar-file-input')?.addEventListener('change', async function () {
        const file = this.files?.[0];
        this.value = '';
        if (!file) return;
        const { error } = await supabaseClient.storage.from(BUCKET).upload(absPath('profile-avatar'), file, {
          upsert: true, contentType: file.type
        });
        if (error) { showToast(error.message, 'error'); return; }
        showToast('Profile photo updated');
        await refreshAvatarPreview();
      });
      document.getElementById('remove-avatar-btn')?.addEventListener('click', async () => {
        const { error } = await supabaseClient.storage.from(BUCKET).remove([absPath('profile-avatar')]);
        if (error) { showToast(error.message, 'error'); return; }
        resetAvatarToInitials();
        showToast('Profile photo removed');
      });

      // Profile: save changes
      document.getElementById('save-profile-btn')?.addEventListener('click', async function () {
        const saveBtn = this;
        const saveLabel = document.getElementById('save-profile-label');
        const fullName = document.getElementById('profile-full-name').value.trim();
        const phone = document.getElementById('profile-phone').value.trim();
        const username = document.getElementById('profile-username').value.trim();

        saveBtn.disabled = true;
        if (saveLabel) saveLabel.textContent = 'Saving…';

        const { error } = await supabaseClient.auth.updateUser({ data: { full_name: fullName, phone, username } });

        saveBtn.disabled = false;
        if (error) {
          if (saveLabel) saveLabel.textContent = 'Save Changes';
          showToast(error.message, 'error');
          return;
        }

        if (saveLabel) {
          saveLabel.textContent = 'Saved ✓';
          setTimeout(() => { saveLabel.textContent = 'Save Changes'; }, 1800);
        }
        showToast('Profile saved');

        const headerName = document.getElementById('header-profile-name');
        if (headerName) headerName.textContent = fullName || headerName.textContent;
        const displayName = document.getElementById('profile-display-name');
        if (displayName) displayName.textContent = fullName || username || 'Vault Owner';
        const initialsEl = document.getElementById('avatar-initials');
        if (initialsEl && !initialsEl.querySelector('img')) {
          initialsEl.textContent = (fullName || username || '·').slice(0, 2);
        }
      });
    }

    function resetAvatarToInitials() {
      const preview = document.getElementById('profile-avatar-preview');
      const headerAvatar = document.getElementById('avatar-initials');
      const fallbackInitials = (document.getElementById('profile-full-name')?.value || document.getElementById('profile-username')?.value || currentUserId || '·').slice(0, 2);
      if (preview) preview.textContent = fallbackInitials;
      if (headerAvatar) headerAvatar.textContent = fallbackInitials;
    }

    async function refreshAvatarPreview() {
      const preview = document.getElementById('profile-avatar-preview');
      if (!preview) return;
      const signedUrl = await getSignedUrlFor('profile-avatar', 300, true);
      if (signedUrl) {
        preview.innerHTML = `<img src="${signedUrl}" alt="Profile photo">`;
        const headerAvatar = document.getElementById('avatar-initials');
        if (headerAvatar) headerAvatar.innerHTML = `<img src="${signedUrl}" alt="Profile photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      } else {
        resetAvatarToInitials();
      }
    }

    function syncSettingsControlsWithSavedPrefs() {
      const savedTheme = localStorage.getItem('vault_theme') || 'dark';
      const savedColor = localStorage.getItem('vault_color') || 'blue';
      const savedFontSize = localStorage.getItem('vault_font_size') || 'medium';

      const themeRadio = document.querySelector(`#theme-radio-group input[value="${savedTheme}"]`);
      if (themeRadio) themeRadio.checked = true;

      document.querySelectorAll('#color-swatch-row .color-swatch').forEach(s => {
        s.classList.toggle('active', s.dataset.color === savedColor);
      });

      document.querySelectorAll('#font-size-control button').forEach(b => {
        b.classList.toggle('active', b.dataset.size === savedFontSize);
      });
    }

    async function renderSettingsPanel() {
      wireSettingsPanelOnce();
      syncSettingsControlsWithSavedPrefs();

      const tenantIdEl = document.getElementById('tenant-id-display');
      if (tenantIdEl) tenantIdEl.textContent = currentUserId || '—';

      const { data } = await supabaseClient.auth.getUser();
      const u = data?.user;
      if (u) {
        const emailField = document.getElementById('profile-email');
        const nameField = document.getElementById('profile-full-name');
        const phoneField = document.getElementById('profile-phone');
        const usernameField = document.getElementById('profile-username');
        if (emailField) emailField.value = u.email || '';
        if (nameField && !nameField.matches(':focus')) nameField.value = u.user_metadata?.full_name || '';
        if (phoneField && !phoneField.matches(':focus')) phoneField.value = u.user_metadata?.phone || '';
        if (usernameField && !usernameField.matches(':focus')) usernameField.value = u.user_metadata?.username || '';

        const displayName = document.getElementById('profile-display-name');
        if (displayName) displayName.textContent = u.user_metadata?.full_name || u.user_metadata?.username || 'Vault Owner';
        const displayEmail = document.getElementById('profile-display-email');
        if (displayEmail) displayEmail.textContent = u.email || '';

        const memberSinceEl = document.getElementById('account-member-since');
        if (memberSinceEl) {
          memberSinceEl.textContent = u.created_at
            ? new Date(u.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
            : '—';
        }
      }

      const storageUsedEl = document.getElementById('account-storage-used');
      if (storageUsedEl) storageUsedEl.textContent = lastKnownStorageLabel;

      await refreshAvatarPreview();
    }

    // ---------------------------------------------------------------------
    // FILE LOADING & RENDERING
    // ---------------------------------------------------------------------
    async function loadCloudFiles(forceRefresh = false) {
      const filesGrid = document.getElementById('files-grid');
      if (!filesGrid) return;

      if (cachedFilesArray.length === 0 || forceRefresh === true) {
        filesGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">◌</div><h4>Loading your vault…</h4></div>`;

        const { data: rootItems } = await supabaseClient.storage.from(BUCKET).list(currentUserId, { limit: 200 });
        const { data: trashItems } = await supabaseClient.storage.from(BUCKET).list(absPath('trash'), { limit: 200 });

        let gatheredFiles = (rootItems || [])
          .filter(f => f.name !== 'profile-avatar')
          .map(f => ({ ...f, isTrashFile: false }));

        for (const item of rootItems || []) {
          if (item.id === null && item.name !== '.emptyFolderPlaceholder') {
            const { data: nestedSubData } = await supabaseClient.storage.from(BUCKET).list(absPath(item.name), { limit: 200 });
            (nestedSubData || []).forEach(nf => {
              gatheredFiles.push({ ...nf, name: `${item.name}/${nf.name}`, isTrashFile: false });
            });
          }
        }

        const trashFilesNormalized = (trashItems || [])
          .filter(f => f.name !== '.emptyFolderPlaceholder')
          .map(f => ({ ...f, name: `trash/${f.name}`, isTrashFile: true }));

        cachedFilesArray = [...gatheredFiles, ...trashFilesNormalized];
        calculateAndRenderAnalytics();
        startLiveSyncTimer();
      }

      const layoutSplitEl = document.querySelector('.workspace-layout-split');
      const settingsViewEl = document.getElementById('settings-view');

      if (currentDashboardView === 'settings') {
        layoutSplitEl?.classList.add('workspace-panel-hidden');
        settingsViewEl?.classList.remove('workspace-panel-hidden');
        const titleEl = document.getElementById('current-view-title');
        if (titleEl) {
          titleEl.innerHTML = `<span class="greet-line">Settings</span><span class="greet-sub">Manage your account, security, and preferences.</span>`;
        }
        renderSettingsPanel();
        return; // stop here — none of the file-grid/trash/folder filtering below applies to Settings
      }
      layoutSplitEl?.classList.remove('workspace-panel-hidden');
      settingsViewEl?.classList.add('workspace-panel-hidden');

      renderBreadcrumbs();

      const searchInputEl = document.getElementById('search-input');
      const searchQuery = searchInputEl ? searchInputEl.value.toLowerCase() : '';

      filesGrid.innerHTML = '';

      const titleEl = document.getElementById('current-view-title');
      if (titleEl) {
        if (currentDashboardView === 'active' && currentDirectoryPath !== '') {
          titleEl.innerHTML = `<span class="greet-line">📁 <span class="dir-path"></span></span>`;
          titleEl.querySelector('.dir-path').textContent = currentDirectoryPath;
        } else if (currentDashboardView === 'active') {
          updateDashboardGreeting();
        } else {
          const labels = { favorites: 'Favorites', shared: 'Shared with you', trash: 'Trash bin', settings: 'Settings' };
          titleEl.innerHTML = `<span class="greet-line"></span>`;
          titleEl.querySelector('.greet-line').textContent = labels[currentDashboardView] || '';
        }
      }

      let displaySubsets = cachedFilesArray.filter(file => {
        if (currentDashboardView === 'trash') return file.isTrashFile;
        if (currentDashboardView === 'favorites') return !file.isTrashFile && favoritedFilePaths.includes(file.name) && !file.name.endsWith('.emptyFolderPlaceholder');
        if (currentDashboardView === 'shared') return !file.isTrashFile && file.name.includes('share') && !file.name.endsWith('.emptyFolderPlaceholder');
        return !file.isTrashFile;
      });

      if (currentDashboardView === 'active' || currentDashboardView === 'trash') {
        const prefixTarget = currentDashboardView === 'trash' ? 'trash/' + currentDirectoryPath : currentDirectoryPath;
        displaySubsets = displaySubsets.filter(file => {
          if (!file.name.startsWith(prefixTarget)) return false;
          const remainderStr = file.name.substring(prefixTarget.length);
          if (remainderStr === '') return false;
          const firstSlashIdx = remainderStr.indexOf('/');
          if (firstSlashIdx !== -1 && firstSlashIdx !== remainderStr.length - 1) return false;
          return true;
        });
      }

      if (searchQuery) {
        displaySubsets = displaySubsets.filter(file => file.name.toLowerCase().includes(searchQuery));
      }

      filesGrid.className = fileLayoutMode === 'list' ? 'files-grid-canvas list-layout' : 'files-grid-canvas';

      let renderingFolders = [];
      let renderingFiles = [];

      displaySubsets.forEach(item => {
        const targetPrefix = currentDashboardView === 'trash' ? 'trash/' + currentDirectoryPath : currentDirectoryPath;
        const localSegment = item.name.substring(targetPrefix.length);
        if (item.id === null || localSegment.endsWith('/') || item.name.endsWith('.emptyFolderPlaceholder')) {
          const folderLabel = localSegment.replace('/', '').replace('.emptyFolderPlaceholder', '');
          if (folderLabel && !renderingFolders.includes(folderLabel)) renderingFolders.push(folderLabel);
        } else {
          renderingFiles.push(item);
        }
      });

      // ---- render folders ----
      renderingFolders.forEach(folderName => {
        const folderCard = document.createElement('div');
        folderCard.className = 'folder-card';
        folderCard.innerHTML = `
          <div class="folder-card-label"><span class="folder-card-icon">▤</span><span></span></div>
          <span style="font-size:11px; color:var(--text-secondary); font-weight:700;">Folder</span>`;
        folderCard.querySelector('.folder-card-label span:last-child').textContent = folderName;
        folderCard.addEventListener('click', () => {
          currentDirectoryPath += folderName + '/';
          loadCloudFiles(false);
        });
        filesGrid.appendChild(folderCard);
      });

      // ---- render files ----
      renderingFiles.forEach(file => {
        const parts = file.name.split('/');
        const lastPart = parts[parts.length - 1];
        const fileRawTitleCleaned = lastPart.includes('-') ? lastPart.split('-').slice(1).join('-') : lastPart;
        const truncatedDisplayName = fileRawTitleCleaned.length > 20
          ? fileRawTitleCleaned.substring(0, 11) + '…' + fileRawTitleCleaned.substring(fileRawTitleCleaned.length - 6)
          : fileRawTitleCleaned;

        const ext = fileRawTitleCleaned.split('.').pop().toLowerCase();
        let fileIcon = '▤', badgeColor = 'var(--text-muted)';
        if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) { fileIcon = '▧'; badgeColor = 'var(--blue)'; }
        else if (ext === 'pdf') { fileIcon = '▥'; badgeColor = 'var(--danger)'; }
        else if (ext === 'txt') { fileIcon = '▦'; badgeColor = 'var(--teal)'; }
        else if (['zip', 'rar', '7z'].includes(ext)) { fileIcon = '▩'; badgeColor = 'var(--accent)'; }

        const byteWeightSize = file.metadata?.size || 0;
        const sizeStringLabels = byteWeightSize < 1024 * 1024
          ? `${(byteWeightSize / 1024).toFixed(1)} KB`
          : `${(byteWeightSize / (1024 * 1024)).toFixed(1)} MB`;
        const createdCalendarDate = file.created_at
          ? new Date(file.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : 'Today';
        const isFav = favoritedFilePaths.includes(file.name);

        const fileCard = document.createElement('div');
        fileCard.className = 'file-card';

        const actionsWrap = document.createElement('div');
        actionsWrap.className = 'file-actions';

        if (currentDashboardView === 'trash') {
          actionsWrap.innerHTML = `
            <button class="action-btn action-btn-download restore-btn">🔄 Restore</button>
            <button class="action-btn action-btn-trash perm-delete-btn">✕ Delete</button>`;
        } else {
          actionsWrap.innerHTML = `
            <button class="action-btn action-btn-preview preview-btn">Preview</button>
            <button class="action-btn action-btn-download download-btn">Download</button>
            <button class="action-btn action-btn-fav fav-btn ${isFav ? 'favorited' : ''}">${isFav ? '★' : '☆'}</button>
            <button class="action-btn action-btn-trash soft-delete-btn">Delete</button>`;
        }

        fileCard.innerHTML = `
          <div>
            <div class="file-card-top">
              <span class="file-icon">${fileIcon}</span>
              <span class="ext-badge" style="background:${badgeColor};"></span>
            </div>
            <strong class="file-name" title="${fileRawTitleCleaned.replace(/"/g, '&quot;')}"></strong>
            <div class="file-meta"><span>${sizeStringLabels}</span><span>${createdCalendarDate}</span></div>
          </div>`;
        fileCard.querySelector('.ext-badge').textContent = ext.toUpperCase();
        fileCard.querySelector('.file-name').textContent = truncatedDisplayName;
        fileCard.appendChild(actionsWrap);

        // wire actions directly (avoids relying on data-* + querySelectorAll pass)
        const previewBtn = actionsWrap.querySelector('.preview-btn');
        if (previewBtn) previewBtn.addEventListener('click', async () => {
          previewBtn.textContent = '…';
          const signedUrl = await getSignedUrlFor(file.name);
          previewBtn.textContent = 'Preview';
          if (signedUrl) openPreview(signedUrl, fileRawTitleCleaned);
        });

        const downloadBtn = actionsWrap.querySelector('.download-btn');
        if (downloadBtn) downloadBtn.addEventListener('click', async () => {
          downloadBtn.textContent = '…';
          try {
            const signedUrl = await getSignedUrlFor(file.name);
            if (signedUrl) await forceDownload(signedUrl, fileRawTitleCleaned);
          } catch (err) {
            showToast(`Download failed: ${err.message}`, 'error');
          } finally {
            downloadBtn.textContent = 'Download';
          }
        });

        const favBtn = actionsWrap.querySelector('.fav-btn');
        if (favBtn) favBtn.addEventListener('click', () => toggleFavorite(file.name));

        const softDeleteBtn = actionsWrap.querySelector('.soft-delete-btn');
        if (softDeleteBtn) softDeleteBtn.addEventListener('click', () => softDeleteFile(file.name));

        const restoreBtn = actionsWrap.querySelector('.restore-btn');
        if (restoreBtn) restoreBtn.addEventListener('click', () => restoreFile(file.name));

        const permDeleteBtn = actionsWrap.querySelector('.perm-delete-btn');
        if (permDeleteBtn) permDeleteBtn.addEventListener('click', () => permanentlyDeleteFile(file.name));

        filesGrid.appendChild(fileCard);
      });

      // ---- empty state ----
      const emptyStateEl = document.getElementById('empty-state');
      if (emptyStateEl) {
        const isEmpty = renderingFolders.length === 0 && renderingFiles.length === 0;
        emptyStateEl.hidden = !isEmpty;
        if (isEmpty) {
          const title = document.getElementById('empty-state-title');
          const body = document.getElementById('empty-state-body');
          if (searchQuery) {
            title.textContent = 'No matches';
            body.textContent = `Nothing found for "${searchQuery}".`;
          } else if (currentDashboardView === 'trash') {
            title.textContent = 'Trash is empty';
            body.textContent = 'Deleted files will show up here before they\u2019re gone for good.';
          } else if (currentDashboardView === 'favorites') {
            title.textContent = 'No favorites yet';
            body.textContent = 'Star a file to pin it here for quick access.';
          } else if (currentDashboardView === 'shared') {
            title.textContent = 'Nothing shared yet';
            body.textContent = 'Files you share will appear in this view.';
          } else {
            title.textContent = 'This folder is empty';
            body.textContent = 'Drag files in, or use the upload panel to get started.';
          }
        }
      }
    }

    // ---------------------------------------------------------------------
    // SIGNED URLS (bucket is private — every link is short-lived and scoped
    // to the requesting user's own folder)
    // ---------------------------------------------------------------------
    async function getSignedUrlFor(relativeName, expiresInSeconds = 60, silent = false) {
      const { data, error } = await supabaseClient.storage
        .from(BUCKET)
        .createSignedUrl(absPath(relativeName), expiresInSeconds);
      if (error) {
        if (!silent) showToast(`Couldn't generate a link: ${error.message}`, 'error');
        return null;
      }
      return data.signedUrl;
    }

    // The `download` attribute on an <a> is silently ignored by browsers once
    // the URL is cross-origin (which a Supabase signed URL always is) — the
    // browser just navigates to it instead, opening images/PDFs inline rather
    // than saving them. Fetching the bytes ourselves and downloading a local
    // blob: URL (always same-origin) is what actually forces a save-to-disk.
    async function forceDownload(signedUrl, fileName) {
      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const tempLink = document.createElement('a');
      tempLink.href = blobUrl;
      tempLink.download = fileName;
      document.body.appendChild(tempLink);
      tempLink.click();
      tempLink.remove();
      // Give the browser a moment to actually start the save before revoking.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    }

    // ---------------------------------------------------------------------
    // FILE ACTIONS
    // ---------------------------------------------------------------------
    function openPreview(fileUrl, fileName) {
      const modal = document.getElementById('preview-modal');
      const modalContent = document.getElementById('preview-content');
      document.getElementById('preview-title').textContent = fileName;
      modalContent.innerHTML = '';
      const lower = fileName.toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].some(el => lower.endsWith(el))) {
        modalContent.innerHTML = `<img src="${fileUrl}" alt="${fileName.replace(/"/g, '&quot;')}">`;
      } else if (lower.endsWith('.pdf') || lower.endsWith('.txt')) {
        modalContent.innerHTML = `<iframe src="${fileUrl}" title="${fileName.replace(/"/g, '&quot;')}"></iframe>`;
      } else {
        modalContent.innerHTML = `<div class="modal-empty">Preview isn\u2019t available for this file type — use Download instead.</div>`;
      }
      modal.style.display = 'flex';
    }

    function toggleFavorite(path) {
      if (favoritedFilePaths.includes(path)) favoritedFilePaths = favoritedFilePaths.filter(p => p !== path);
      else favoritedFilePaths.push(path);
      localStorage.setItem('vault_favs', JSON.stringify(favoritedFilePaths));
      loadCloudFiles(false);
    }

    async function softDeleteFile(originalName) {
      const nameSegments = originalName.split('/');
      const plainName = nameSegments[nameSegments.length - 1];
      const { error } = await supabaseClient.storage.from(BUCKET).move(absPath(originalName), absPath(`trash/${plainName}`));
      if (!error) {
        pushSystemActivityLog(`Moved to trash: ${plainName.split('-').pop()}`, 'red');
        showToast('Moved to trash');
        loadCloudFiles(true);
      } else {
        showToast(error.message, 'error');
      }
    }

    async function restoreFile(currentName) {
      const restoredName = currentName.replace('trash/', '');
      const { error } = await supabaseClient.storage.from(BUCKET).move(absPath(currentName), absPath(restoredName));
      if (!error) {
        pushSystemActivityLog(`Recovered file: ${restoredName.split('-').pop()}`, 'teal');
        showToast('File restored');
        loadCloudFiles(true);
      } else {
        showToast(error.message, 'error');
      }
    }

    async function permanentlyDeleteFile(targetName) {
      if (!confirm('Delete this file permanently? This cannot be undone.')) return;
      const { error } = await supabaseClient.storage.from(BUCKET).remove([absPath(targetName)]);
      if (!error) {
        pushSystemActivityLog(`Wiped permanently: ${targetName.split('-').pop()}`, 'red');
        showToast('File permanently deleted');
        loadCloudFiles(true);
      } else {
        showToast(error.message, 'error');
      }
    }

    // ---------------------------------------------------------------------
    // UPLOAD (multi-file, shared by click + drag&drop)
    // ---------------------------------------------------------------------
    async function uploadFiles(fileList) {
      const files = Array.from(fileList || []);
      if (files.length === 0) return;

      const uploadIcon = document.getElementById('upload-icon');
      if (uploadIcon) uploadIcon.textContent = '⇅';

      let successCount = 0;
      for (const selectedFile of files) {
        const uniqueFileName = `${currentDirectoryPath}${Date.now()}-${selectedFile.name}`;
        const { error } = await supabaseClient.storage.from(BUCKET).upload(absPath(uniqueFileName), selectedFile);
        if (!error) {
          successCount++;
          pushSystemActivityLog(`Uploaded to ${currentDirectoryPath || 'Root'}: ${selectedFile.name}`, 'brass');
        } else {
          showToast(`${selectedFile.name}: ${error.message}`, 'error');
        }
      }

      if (uploadIcon) uploadIcon.textContent = '⇧';
      if (successCount > 0) {
        showToast(successCount === 1 ? 'File uploaded' : `${successCount} files uploaded`);
        loadCloudFiles(true);
      }
    }

    // ---------------------------------------------------------------------
    // MOBILE SIDEBAR
    // ---------------------------------------------------------------------
    function openSidebar() {
      document.getElementById('app-sidebar')?.classList.add('open');
      document.getElementById('sidebar-scrim')?.classList.add('open');
    }
    function closeSidebar() {
      document.getElementById('app-sidebar')?.classList.remove('open');
      document.getElementById('sidebar-scrim')?.classList.remove('open');
    }
    document.getElementById('sidebar-open')?.addEventListener('click', openSidebar);
    document.getElementById('sidebar-close')?.addEventListener('click', closeSidebar);
    document.getElementById('sidebar-scrim')?.addEventListener('click', closeSidebar);

    // ---------------------------------------------------------------------
    // NAVIGATION
    // ---------------------------------------------------------------------
    function changeDashboardContextView(viewModeString, clickedButtonElement) {
      currentDashboardView = viewModeString;
      currentDirectoryPath = '';
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      if (clickedButtonElement) clickedButtonElement.classList.add('active');
      loadCloudFiles(false);
      closeSidebar();
    }

    const navBindings = [
      ['menu-dashboard', 'active'], ['menu-files', 'active'], ['menu-favorites', 'favorites'],
      ['menu-shared', 'shared'], ['menu-trash', 'trash'], ['menu-settings', 'settings']
    ];
    navBindings.forEach(([id, view]) => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', function () { changeDashboardContextView(view, this); });
    });

    const btnToggleGrid = document.getElementById('toggle-grid-btn');
    const btnToggleList = document.getElementById('toggle-list-btn');
    if (btnToggleGrid) btnToggleGrid.addEventListener('click', function () {
      fileLayoutMode = 'grid'; btnToggleList?.classList.remove('active'); this.classList.add('active'); loadCloudFiles(false);
    });
    if (btnToggleList) btnToggleList.addEventListener('click', function () {
      fileLayoutMode = 'list'; btnToggleGrid?.classList.remove('active'); this.classList.add('active'); loadCloudFiles(false);
    });

    // ---------------------------------------------------------------------
    // CREATE FOLDER
    // ---------------------------------------------------------------------
    document.getElementById('create-folder-btn')?.addEventListener('click', async function () {
      const requestedName = prompt('Name this folder:');
      if (!requestedName) return;
      const cleanFolderPrefix = requestedName.replace(/[^a-zA-Z0-9 _-]/g, '_').trim();
      if (!cleanFolderPrefix) return;
      const fullCloudPlaceholderPath = `${currentDirectoryPath}${cleanFolderPrefix}/.emptyFolderPlaceholder`;
      const blankBlob = new Blob([''], { type: 'text/plain' });
      const { error } = await supabaseClient.storage.from(BUCKET).upload(absPath(fullCloudPlaceholderPath), blankBlob);
      if (error) {
        showToast(`Folder creation failed: ${error.message}`, 'error');
      } else {
        pushSystemActivityLog(`Created folder: ${cleanFolderPrefix}/`, 'brass');
        showToast('Folder created');
        loadCloudFiles(true);
      }
    });

    // ---------------------------------------------------------------------
    // AUTH
    // ---------------------------------------------------------------------
    const authForm = document.getElementById('auth-form');
    const submitBtn = document.getElementById('submit-btn');
    const submitBtnLabel = document.getElementById('submit-btn-label');
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const authError = document.getElementById('auth-error');
    let authMode = 'login';

    function setAuthError(message) {
      if (!authError) return;
      if (message) { authError.textContent = message; authError.hidden = false; }
      else { authError.hidden = true; authError.textContent = ''; }
    }

    tabSignup?.addEventListener('click', function () {
      authMode = 'signup';
      tabLogin?.classList.remove('active'); tabLogin?.setAttribute('aria-selected', 'false');
      this.classList.add('active'); this.setAttribute('aria-selected', 'true');
      if (submitBtnLabel) submitBtnLabel.textContent = 'Create Account';
      setAuthError(null);
    });
    tabLogin?.addEventListener('click', function () {
      authMode = 'login';
      tabSignup?.classList.remove('active'); tabSignup?.setAttribute('aria-selected', 'false');
      this.classList.add('active'); this.setAttribute('aria-selected', 'true');
      if (submitBtnLabel) submitBtnLabel.textContent = 'Unlock Vault';
      setAuthError(null);
    });

    authForm?.addEventListener('submit', async function (event) {
      event.preventDefault();
      setAuthError(null);
      const userEmail = document.getElementById('email').value.trim();
      const userPassword = document.getElementById('password').value;

      if (submitBtn) submitBtn.disabled = true;
      if (submitBtnLabel) submitBtnLabel.textContent = authMode === 'login' ? 'Unlocking…' : 'Creating account…';

      try {
        if (authMode === 'login') {
          const { data, error } = await supabaseClient.auth.signInWithPassword({ email: userEmail, password: userPassword });
          if (error) { setAuthError(error.message); return; }
          currentUserId = data.user.id;
          enterDashboard(userEmail);
        } else {
          const { error } = await supabaseClient.auth.signUp({ email: userEmail, password: userPassword });
          if (error) { setAuthError(error.message); return; }
          showToast('Account created — check your email to confirm.');
          tabLogin?.click();
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (submitBtnLabel) submitBtnLabel.textContent = authMode === 'login' ? 'Unlock Vault' : 'Create Account';
      }
    });

    function enterDashboard(userEmail) {
      document.getElementById('auth-container').style.display = 'none';
      document.getElementById('dashboard-container').classList.remove('dashboard-hidden');
      document.getElementById('user-display-email').textContent = userEmail;
      const initialsEl = document.getElementById('avatar-initials');
      if (initialsEl) initialsEl.textContent = userEmail.slice(0, 2);
      updateHeaderGreeting(userEmail.split('@')[0]);

      const searchInput = document.getElementById('search-input');
      searchInput?.addEventListener('input', () => loadCloudFiles(false));

      pushSystemActivityLog(`Session opened by ${userEmail}`, 'teal');
      loadCloudFiles(true);
    }

    // ---------------------------------------------------------------------
    // UPLOAD WIRING: click-to-browse + FAB + drag & drop
    // ---------------------------------------------------------------------
    const dropZoneClick = document.getElementById('drop-zone-click');
    const fileInput = document.getElementById('file-input');
    const fab = document.getElementById('floating-upload-fab');

    dropZoneClick?.addEventListener('click', () => fileInput.click());
    fab?.addEventListener('click', () => fileInput.click());
    fileInput?.addEventListener('change', function () {
      uploadFiles(fileInput.files);
      fileInput.value = '';
    });

    dropZoneClick?.addEventListener('dragover', (e) => { e.preventDefault(); dropZoneClick.querySelector('.drop-zone')?.classList.add('drag-active'); });
    dropZoneClick?.addEventListener('dragleave', () => dropZoneClick.querySelector('.drop-zone')?.classList.remove('drag-active'));
    dropZoneClick?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZoneClick.querySelector('.drop-zone')?.classList.remove('drag-active');
      uploadFiles(e.dataTransfer.files);
    });

    // Whole-window drag & drop overlay
    const dragOverlay = document.getElementById('global-drag-overlay');
    let dragCounter = 0;
    window.addEventListener('dragenter', (e) => {
      const dashboardVisible = !document.getElementById('dashboard-container').classList.contains('dashboard-hidden');
      if (!dashboardVisible) return;
      e.preventDefault();
      dragCounter++;
      dragOverlay?.classList.remove('drag-overlay-hidden');
      dragOverlay?.classList.add('drag-overlay-visible');
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('dragleave', () => {
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) {
        dragOverlay?.classList.remove('drag-overlay-visible');
        dragOverlay?.classList.add('drag-overlay-hidden');
      }
    });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      dragOverlay?.classList.remove('drag-overlay-visible');
      dragOverlay?.classList.add('drag-overlay-hidden');
      const dashboardVisible = !document.getElementById('dashboard-container').classList.contains('dashboard-hidden');
      if (dashboardVisible && e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
    });

    // ---------------------------------------------------------------------
    // KEYBOARD SHORTCUTS
    // ---------------------------------------------------------------------
    document.addEventListener('keydown', (e) => {
      const isModK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
      if (isModK) {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
      }
      if (e.key === 'Escape') {
        const modal = document.getElementById('preview-modal');
        if (modal && modal.style.display === 'flex') modal.style.display = 'none';
        closeSidebar();
      }
    });

    // ---------------------------------------------------------------------
    // SIGN OUT / MODAL CLOSE
    // ---------------------------------------------------------------------
    document.getElementById('signout-btn')?.addEventListener('click', async function () {
      await supabaseClient.auth.signOut();
      cachedFilesArray = [];
      currentUserId = null;
      if (syncTimerInterval) clearInterval(syncTimerInterval);
      document.getElementById('dashboard-container').classList.add('dashboard-hidden');
      document.getElementById('auth-container').style.display = 'flex';
    });

    document.getElementById('close-modal-btn')?.addEventListener('click', () => {
      document.getElementById('preview-modal').style.display = 'none';
    });
    document.getElementById('preview-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'preview-modal') e.target.style.display = 'none';
    });

    // ---------------------------------------------------------------------
    // INIT
    // ---------------------------------------------------------------------
    applyStoredPreferencesOnBoot();
    updateHeaderGreeting();

    // Resume session automatically if one exists
    supabaseClient.auth.getSession().then(({ data }) => {
      if (data?.session?.user?.email) {
        currentUserId = data.session.user.id;
        enterDashboard(data.session.user.email);
      }
    });
  }
}
