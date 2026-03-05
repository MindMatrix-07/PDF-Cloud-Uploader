const VERCEL_URL = "https://pdf-cloud-uploader.vercel.app/api/upload";

let savedChapter = "GENERAL";

// Startup Data Load
chrome.storage.local.get(['savedChapter'], (res) => {
  if (res.savedChapter) savedChapter = res.savedChapter;
});

// Listener for Chapter Discovery
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const targetUrl = changeInfo.url || tab.url;
  if (targetUrl && targetUrl.includes("topicName=")) {
    try {
      const urlObj = new URL(targetUrl);
      const topic = urlObj.searchParams.get("topicName");
      if (topic) {
        savedChapter = decodeURIComponent(topic).replace(/\(\d{4}\)/g, "").trim().toUpperCase();
        chrome.storage.local.set({ savedChapter: savedChapter });
      }
    } catch (e) { }
  }
});

// User-facing logging
function logDiagnostic(msg) {
  const time = new Date().toLocaleTimeString();
  const entry = `[${time}] ${msg}`;
  chrome.storage.local.get(['diagLogs'], (res) => {
    let logs = res.diagLogs || [];
    logs.unshift(entry);
    chrome.storage.local.set({ diagLogs: logs.slice(0, 20) });
  });
}

const processedUrls = new Set();

function processPdf(pdfUrl, tabId, tabTitle) {
  try {
    if (!pdfUrl || processedUrls.has(pdfUrl)) return;

    // Support for PDF Wrappers
    try {
      const urlObj = new URL(pdfUrl);
      const nestedUrl = urlObj.searchParams.get('pdf_url') || urlObj.searchParams.get('file');
      if (nestedUrl && nestedUrl.toLowerCase().includes('.pdf')) pdfUrl = nestedUrl;
    } catch (e) { }

    processedUrls.add(pdfUrl);
    setTimeout(() => processedUrls.delete(pdfUrl), 15000); // Shorter lock

    logDiagnostic(`🚀 PDF Detected: ${pdfUrl.split('/').pop().split('?')[0]}`);

    let pdfTopic = tabTitle || "Document";
    if (pdfTopic === "Document" || pdfTopic === "PDF") {
      const filename = pdfUrl.split('/').pop().split('?')[0].replace(".pdf", "");
      if (filename.length > 5) pdfTopic = filename;
    }
    pdfTopic = pdfTopic.replace(".pdf", "").split('|')[0].trim();

    // Instant Upload Triggers - Don't wait for script if tab is not readable
    if (tabId && tabId > 0 && !pdfUrl.includes('chrome-extension://')) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => document.querySelector('h1, h2, .pdf-title, .title, .breadcrumb-item.active')?.innerText || ""
      }, (results) => {
        if (results?.[0]?.result) pdfTopic = results[0].result.split('|')[0].trim();
        startUpload(pdfUrl, pdfTopic);
      });

      // Fallback timer if script hangs or doesn't return
      setTimeout(() => {
        if (processedUrls.has(pdfUrl)) { // Still same session
          startUpload(pdfUrl, pdfTopic);
        }
      }, 1500);
    } else {
      startUpload(pdfUrl, pdfTopic);
    }
  } catch (err) { logDiagnostic(`ERR: ${err.message}`); }
}

function startUpload(pdfUrl, pdfTopic) {
  // Check if already uploaded (prevent duplicate from fallback)
  const lockKey = `uploading_${pdfUrl}`;
  chrome.storage.local.get([lockKey], (res) => {
    if (res[lockKey]) return;
    chrome.storage.local.set({ [lockKey]: true });
    setTimeout(() => chrome.storage.local.remove(lockKey), 10000);

    const finalFileName = `${pdfTopic}-${savedChapter}.pdf`.replace(/[\\/:*?"<>|]/g, "").trim();
    logDiagnostic(`Attempting upload: ${finalFileName}`);

    uploadToVercel(pdfUrl, finalFileName);

    showNotification('Snatching PDF...', finalFileName);
  });
}

function showNotification(title, message) {
  chrome.notifications?.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: title,
    message: message,
    priority: 1
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = tab.url?.toLowerCase() || "";
  if (url.includes(".pdf") || url.includes("/pdf-viewer") || url.includes("/pdf_viewer")) {
    processPdf(tab.url, tabId, tab.title);
  }
});

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.type === 'main_frame' || details.type === 'sub_frame') {
      const contentType = details.responseHeaders.find(h => h.name.toLowerCase() === 'content-type')?.value || "";
      if (contentType.toLowerCase().includes('application/pdf')) {
        processPdf(details.url, details.tabId, "PDF-Document");
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

async function uploadToVercel(pdfUrl, fileName) {
  chrome.storage.local.get(['megaSession'], async (res) => {
    const sessionToUse = res.megaSession || "";

    try {
      const response = await fetch(VERCEL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfUrl, fileName, megaSession: sessionToUse })
      });

      const result = await response.json();

      if (result.success) {
        logDiagnostic(`✅ SUCCESS: ${result.method} login`);
        showNotification('Cloud Success!', `Saved to: ${result.chapter}`);
      } else {
        logDiagnostic(`❌ FAIL: ${result.error}`);
      }
    } catch (error) {
      logDiagnostic(`🚨 FATAL: ${error.message}`);
    }
  });
}
