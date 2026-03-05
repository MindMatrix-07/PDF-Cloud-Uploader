// popup.js (v1.4.0)

// Load Session on start
chrome.storage.local.get(['lastUrl', 'megaSession'], (res) => {
  if (res.lastUrl) document.getElementById('url').innerText = res.lastUrl;
  if (res.megaSession) document.getElementById('session-id').value = res.megaSession;
});

// Periodic update
setInterval(() => {
  chrome.storage.local.get(['lastUrl', 'diagLogs'], (res) => {
    document.getElementById('url').innerText = res.lastUrl || 'No PDF detected.';
    if (document.getElementById('logs-container').style.display === 'block') {
      document.getElementById('logs').innerHTML = (res.diagLogs || []).join('<br>') || 'No logs...';
    }
  });
}, 2000);

// Save Session
document.getElementById('save-session').addEventListener('click', () => {
  const sid = document.getElementById('session-id').value.trim();
  chrome.storage.local.set({ megaSession: sid }, () => {
    alert("Session saved!");
  });
});

// Logs toggle
const toggleBtn = document.getElementById('toggle-logs');
const logsContainer = document.getElementById('logs-container');
toggleBtn.addEventListener('click', () => {
  const isHidden = logsContainer.style.display === 'none';
  logsContainer.style.display = isHidden ? 'block' : 'none';
  toggleBtn.innerText = isHidden ? 'Hide Debug Logs' : 'Show Debug Logs';
});

document.getElementById('clear-logs').addEventListener('click', () => {
  chrome.storage.local.set({ diagLogs: [] });
});