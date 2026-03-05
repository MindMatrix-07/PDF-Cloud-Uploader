// Check for new URLs every second
setInterval(() => {
  chrome.storage.local.get(['lastUrl'], (result) => {
    if (result.lastUrl) {
      document.getElementById('url').innerText = result.lastUrl;
    }
  });
}, 1000);

// Handle the download button click
document.getElementById('download').addEventListener('click', () => {
  let url = document.getElementById('url').innerText;
  if (url.startsWith('http')) {
    chrome.downloads.download({ url: url });
  } else {
    alert("Please open a PDF on the website first!");
  }
});

// Log viewer logic
const toggleBtn = document.getElementById('toggle-logs');
const logsContainer = document.getElementById('logs-container');
const logsDiv = document.getElementById('logs');

toggleBtn.addEventListener('click', () => {
  const isHidden = logsContainer.style.display === 'none';
  logsContainer.style.display = isHidden ? 'block' : 'none';
  toggleBtn.innerText = isHidden ? 'Hide Debug Logs' : 'Show Debug Logs';
  if (isHidden) refreshLogs();
});

function refreshLogs() {
  chrome.storage.local.get(['diagLogs'], (res) => {
    const logs = res.diagLogs || [];
    logsDiv.innerHTML = logs.length ? logs.join('<br>') : 'No logs yet...';
  });
}

document.getElementById('clear-logs').addEventListener('click', () => {
  chrome.storage.local.set({ diagLogs: [] }, refreshLogs);
});

// Refresh logs periodically if visible
setInterval(() => {
  if (logsContainer.style.display === 'block') refreshLogs();
}, 2000);