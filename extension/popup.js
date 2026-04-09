// ── Browser compatibility shim ────────────────────────────────────────────
const _browser = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

// ── Toggle (Enable/Disable Extension) ────────────────────────────────────
const toggle = document.getElementById('enabled-toggle');
const toggleLabel = document.getElementById('toggle-label');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const disabledHint = document.getElementById('disabled-hint');

function applyToggleState(enabled) {
  toggle.checked = enabled;

  if (enabled) {
    toggleLabel.innerHTML = '<strong>ON</strong>Active';
    toggleLabel.className = 'toggle-label';
    statusDot.className = 'status-dot active';
    statusText.textContent = 'Watching for PDFs...';
    disabledHint.style.display = 'none';
  } else {
    toggleLabel.innerHTML = '<strong>OFF</strong>Paused';
    toggleLabel.className = 'toggle-label off';
    statusDot.className = 'status-dot inactive';
    statusText.textContent = 'Extension is paused.';
    disabledHint.style.display = 'block';
  }
}

// Load initial toggle state
_browser.storage.local.get(['extensionEnabled'], (res) => {
  // Default to enabled if not set
  const enabled = res.extensionEnabled !== false;
  applyToggleState(enabled);
});

// Save toggle state on change
toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  _browser.storage.local.set({ extensionEnabled: enabled });
  applyToggleState(enabled);
});

// ── Load stored data on startup ───────────────────────────────────────────
_browser.storage.local.get(['lastUrl', 'megaSession', 'uploadHistory', 'savedChapter'], (res) => {
  if (res.lastUrl) {
    const urlEl = document.getElementById('url');
    urlEl.innerText = res.lastUrl;
    urlEl.className = 'url-box has-url';
  }
  if (res.megaSession) document.getElementById('session-id').value = res.megaSession;
  if (res.savedChapter) renderChapterChip(res.savedChapter);
  refreshHistory(res.uploadHistory || []);
});

// ── Periodic refresh ──────────────────────────────────────────────────────
setInterval(() => {
  _browser.storage.local.get(['lastUrl', 'uploadHistory', 'diagLogs', 'savedChapter'], (res) => {
    const urlEl = document.getElementById('url');
    if (res.lastUrl) {
      urlEl.innerText = res.lastUrl;
      urlEl.className = 'url-box has-url';
    } else {
      urlEl.innerText = 'Open a PDF on the website first...';
      urlEl.className = 'url-box';
    }

    if (res.savedChapter) renderChapterChip(res.savedChapter);
    refreshHistory(res.uploadHistory || []);

    if (document.getElementById('logs-container').style.display === 'block') {
      document.getElementById('logs').innerHTML =
        (res.diagLogs || []).join('<br>') || 'No logs...';
    }
  });
}, 2000);

// ── Chapter Chip ─────────────────────────────────────────────────────────
function renderChapterChip(chapter) {
  const container = document.getElementById('chapter-chip-container');
  if (!chapter || chapter === 'GENERAL') {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `<div class="chapter-chip">📁 ${chapter}</div>`;
}

// ── History Display ───────────────────────────────────────────────────────
function refreshHistory(history) {
  const list = document.getElementById('history-list');
  if (!history || history.length === 0) {
    list.innerHTML = '<span style="font-size:10px; color: var(--text-dim);">No uploads yet...</span>';
    return;
  }

  list.innerHTML = history.map(item => `
    <div class="history-item">
      <div class="history-file" title="${item.fileName}">${item.fileName}</div>
      <div class="history-meta">
        Method: <span class="${item.method === 'SESSION' ? 'method-session' : 'method-url'}">${item.method}</span>
        · ${new Date(item.timestamp).toLocaleTimeString()}
      </div>
    </div>
  `).join('');
}

// ── Session Management ────────────────────────────────────────────────────
document.getElementById('save-session').addEventListener('click', () => {
  const sid = document.getElementById('session-id').value.trim();
  _browser.storage.local.set({ megaSession: sid }, () => {
    const btn = document.getElementById('save-session');
    btn.textContent = '✅ Saved!';
    setTimeout(() => { btn.textContent = '💾 Save Session'; }, 2000);
  });
});

// ── Download Button ───────────────────────────────────────────────────────
document.getElementById('download').addEventListener('click', () => {
  let url = document.getElementById('url').innerText;
  if (url.startsWith('http')) {
    _browser.downloads.download({ url });
  } else {
    alert('Please open a PDF on the website first!');
  }
});

// ── Logs Toggle ───────────────────────────────────────────────────────────
const toggleLogsBtn = document.getElementById('toggle-logs');
const logsContainer = document.getElementById('logs-container');

toggleLogsBtn.addEventListener('click', () => {
  const isHidden = logsContainer.style.display === 'none';
  logsContainer.style.display = isHidden ? 'block' : 'none';
  toggleLogsBtn.textContent = isHidden ? '🔍 Hide Debug Logs' : '🔍 Show Debug Logs';
});

document.getElementById('clear-logs').addEventListener('click', () => {
  _browser.storage.local.set({ diagLogs: [] });
  document.getElementById('logs').innerHTML = 'Logs cleared.';
});