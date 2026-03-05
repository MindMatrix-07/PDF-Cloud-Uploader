// popup.js

// Load stored values on open
chrome.storage.local.get(['lastUrl', 'megaSession', 'extensionEnabled'], (res) => {
  if (res.lastUrl) document.getElementById('url').innerText = res.lastUrl;
  if (res.megaSession) document.getElementById('session-id').value = res.megaSession;

  // Toggle defaults to ON (true) if never set
  const enabled = res.extensionEnabled !== false;
  document.getElementById('ext-toggle').checked = enabled;
  document.getElementById('toggle-label').textContent = enabled ? 'ON' : 'OFF';
});

// Toggle — enable/disable the whole extension
document.getElementById('ext-toggle').addEventListener('change', (e) => {
  const enabled = e.target.checked;
  chrome.storage.local.set({ extensionEnabled: enabled });
  document.getElementById('toggle-label').textContent = enabled ? 'ON' : 'OFF';
});

// Refresh last URL every 2s
setInterval(() => {
  chrome.storage.local.get(['lastUrl'], (res) => {
    document.getElementById('url').innerText = res.lastUrl || 'No PDF detected.';
  });
}, 2000);

// Save Session
document.getElementById('save-session').addEventListener('click', () => {
  const sid = document.getElementById('session-id').value.trim();
  chrome.storage.local.set({ megaSession: sid }, () => alert("Session saved!"));
});

// Debug Logs Toggle
const toggleBtn = document.getElementById('toggle-logs');
const logsContainer = document.getElementById('logs-container');
toggleBtn.addEventListener('click', () => {
  const hidden = logsContainer.style.display === 'none';
  logsContainer.style.display = hidden ? 'block' : 'none';
  toggleBtn.textContent = hidden ? 'Hide Debug Logs' : 'Show Debug Logs';
  if (hidden) {
    chrome.storage.local.get(['diagLogs'], (res) => {
      document.getElementById('logs').innerHTML = (res.diagLogs || []).join('<br>') || 'No logs...';
    });
  }
});

document.getElementById('clear-logs').addEventListener('click', () => {
  chrome.storage.local.set({ diagLogs: [] });
  document.getElementById('logs').innerHTML = 'Cleared.';
});