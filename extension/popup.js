// Load existing data on startup
chrome.storage.local.get(['lastUrl', 'megaSession', 'uploadHistory'], (res) => {
  if (res.lastUrl) document.getElementById('url').innerText = res.lastUrl;
  if (res.megaSession) document.getElementById('session-id').value = res.megaSession;
  refreshHistory(res.uploadHistory || []);
});

// Periodic refresh for active elements
setInterval(() => {
  chrome.storage.local.get(['lastUrl', 'uploadHistory', 'diagLogs'], (res) => {
    document.getElementById('url').innerText = res.lastUrl || 'Open a PDF...';
    refreshHistory(res.uploadHistory || []);
    if (document.getElementById('logs-container').style.display === 'block') {
      document.getElementById('logs').innerHTML = (res.diagLogs || []).join('<br>') || 'No logs...';
    }
  });
}, 2000);

// Session Management
document.getElementById('save-session').addEventListener('click', () => {
  const sid = document.getElementById('session-id').value.trim();
  chrome.storage.local.set({ megaSession: sid }, () => {
    alert("Session saved! It will be used for next uploads.");
  });
});

// History Display
function refreshHistory(history) {
  const list = document.getElementById('history-list');
  if (!history || history.length === 0) {
    list.innerHTML = '<span style="color: #888;">No recent uploads.</span>';
    return;
  }

  list.innerHTML = history.map(item => `
    <div style="border-bottom: 1px solid #eee; padding: 4px 0;">
      <div style="font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.fileName}</div>
      <div style="font-size: 9px; color: #666;">
        Method: <span style="color: ${item.method === 'SESSION' ? 'green' : 'blue'}">${item.method}</span> | ${new Date(item.timestamp).toLocaleTimeString()}
      </div>
    </div>
  `).join('');
}

// Download Button
document.getElementById('download').addEventListener('click', () => {
  let url = document.getElementById('url').innerText;
  if (url.startsWith('http')) {
    chrome.downloads.download({ url: url });
  } else {
    alert("Please open a PDF first!");
  }
});

// Logs Toggle
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