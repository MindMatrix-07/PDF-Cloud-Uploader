const VERCEL_URL = "https://pdf-cloud-uploader.vercel.app/api/upload"; // REPLACE WITH YOUR VERCEL URL

let savedChapter = "GENERAL"; // Default fallback

// Load saved chapter from storage on startup
chrome.storage.local.get(['savedChapter'], (res) => {
  if (res.savedChapter) {
    savedChapter = res.savedChapter;
    console.log("Restored Chapter Memory:", savedChapter);
  }
});

// 1. Listen for the Chapter Name in every URL change
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const targetUrl = changeInfo.url || tab.url;
  if (targetUrl && targetUrl.includes("topicName=")) {
    try {
      const urlObj = new URL(targetUrl);
      const topic = urlObj.searchParams.get("topicName");
      if (topic) {
        // Clean the name: Remove (2026), replace %20 with space
        savedChapter = decodeURIComponent(topic).replace(/\(\d{4}\)/g, "").trim().toUpperCase();
        chrome.storage.local.set({ savedChapter: savedChapter });
        console.log("Memory Locked On:", savedChapter);
      }
    } catch (e) { }
  }
});

// Helper to log diagnostics for the user
function logDiagnostic(msg) {
  const time = new Date().toLocaleTimeString();
  const entry = `[${time}] ${msg}`;
  console.log(entry);
  chrome.storage.local.get(['diagLogs'], (res) => {
    let logs = res.diagLogs || [];
    logs.unshift(entry);
    chrome.storage.local.set({ diagLogs: logs.slice(0, 20) });
  });
}

// Cache to prevent duplicate uploads
const processedUrls = new Set();

function processPdf(pdfUrl, tabId, tabTitle) {
  try {
    if (!pdfUrl) return;

    // SUPPORT FOR WRAPPERS (e.g., PW viewer)
    try {
      const urlObj = new URL(pdfUrl);
      const nestedUrl = urlObj.searchParams.get('pdf_url') || urlObj.searchParams.get('file') || urlObj.searchParams.get('url');
      if (nestedUrl && nestedUrl.toLowerCase().includes('.pdf')) {
        logDiagnostic(`Extracted nested PDF: ${nestedUrl}`);
        pdfUrl = nestedUrl;
      }
    } catch (e) { }

    // Check if we already processed this URL recently to avoid duplicates
    if (processedUrls.has(pdfUrl)) return;
    processedUrls.add(pdfUrl);
    setTimeout(() => processedUrls.delete(pdfUrl), 30000); // 30s cooldown

    logDiagnostic(`🚀 PDF Detected: ${pdfUrl}`);

    // Try to get title from tab title first
    let pdfTopic = tabTitle || "Document";
    if (pdfTopic === "Document" || pdfTopic === "PDF" || pdfTopic === "PDF-Document") {
      try {
        const filename = pdfUrl.split('/').pop().split('?')[0].replace(".pdf", "");
        if (filename && filename.length > 5) pdfTopic = filename;
      } catch (e) { }
    }
    pdfTopic = pdfTopic.replace(".pdf", "").split('|')[0].trim();

    chrome.scripting.executeScript({
      target: { tabId: tabId > 0 ? tabId : 0 },
      func: () => document.querySelector('h1, h2, .pdf-title, .header-title')?.innerText || ""
    }, (results) => {
      if (chrome.runtime.lastError) {
        logDiagnostic(`Scripting Note: Using tab/URL title (page restricted)`);
      } else if (results && results[0].result) {
        pdfTopic = results[0].result.split('|')[0].trim();
        logDiagnostic(`Extracted Topic: ${pdfTopic}`);
      }

      const finalFileName = `${pdfTopic}-${savedChapter}.pdf`.replace(/[\\/:*?"<>|]/g, "").trim();
      logDiagnostic(`FINAL NAME: ${finalFileName}`);

      chrome.storage.local.set({ lastUrl: pdfUrl, lastFileName: finalFileName });
      uploadToVercel(pdfUrl, finalFileName);

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'PDF Snatched!',
        message: `Sending ${finalFileName} to MEGA...`,
        priority: 2
      });
    });
  } catch (err) {
    logDiagnostic(`INTERNAL ERR: ${err.message}`);
  }
}

// 2a. Navigation-based detection
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && tab.url.toLowerCase().includes(".pdf")) {
    if (changeInfo.status === 'complete' || tab.status === 'complete') {
      logDiagnostic(`Tab detection hit: ${tab.url}`);
      processPdf(tab.url, tabId, tab.title);
    }
  }
});

// 2b. Header-based detection
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.type === 'main_frame' || details.type === 'sub_frame') {
      const contentType = details.responseHeaders.find(h => h.name.toLowerCase() === 'content-type')?.value || "";
      if (contentType.toLowerCase().includes('application/pdf') || details.url.toLowerCase().includes(".pdf")) {
        logDiagnostic(`Header detection hit: ${details.url} (${contentType})`);
        processPdf(details.url, details.tabId, "PDF-Document");
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

async function uploadToVercel(pdfUrl, fileName) {
  logDiagnostic(`Contacting server: ${VERCEL_URL}`);
  try {
    const response = await fetch(VERCEL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfUrl, fileName })
    });

    const result = await response.json();
    logDiagnostic(`Server responded success=${result.success}`);

    if (result.success) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'MEGA Upload Done!',
        message: `Saved to: ${result.chapter}`,
        priority: 2
      });
    } else {
      logDiagnostic(`ERR: ${result.error}`);
    }
  } catch (error) {
    logDiagnostic(`FATAL: ${error.message}`);
  }
}
