const VERCEL_URL = "https://pdf-cloud-uploader.vercel.app/api/upload";

let savedChapter = "GENERAL"; // Default fallback

// 1. Listen for the Chapter Name in every URL change
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const targetUrl = changeInfo.url || tab.url;
  if (targetUrl && targetUrl.includes("topicName=")) {
    try {
      const urlObj = new URL(targetUrl);
      const topic = urlObj.searchParams.get("topicName");
      if (topic) {
        savedChapter = decodeURIComponent(topic).replace(/\(\d{4}\)/g, "").trim().toUpperCase();
        console.log("Memory Locked On:", savedChapter);
        chrome.storage.local.set({ savedChapter });
      }
    } catch (e) { }
  }
});

// Load saved chapter on startup
chrome.storage.local.get(['savedChapter'], (res) => {
  if (res.savedChapter) savedChapter = res.savedChapter;
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
  if (!pdfUrl) return;

  // SUPPORT FOR WRAPPERS (e.g., PW viewer, Xylem)
  // If URL is a wrapper, extract the actual PDF link from parameters
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
  pdfTopic = pdfTopic.replace(".pdf", "").split('|')[0].trim();

  chrome.scripting.executeScript({
    target: { tabId: tabId || 0 },
    func: () => document.querySelector('h1, h2, .pdf-title, .header-title')?.innerText || ""
  }, (results) => {
    if (!chrome.runtime.lastError && results && results[0].result) {
      pdfTopic = results[0].result.split('|')[0].trim();
    }

    const finalFileName = `${pdfTopic}-${savedChapter}.pdf`.replace(/[\\/:*?"<>|]/g, "").trim();
    logDiagnostic(`Naming file: ${finalFileName}`);

    chrome.storage.local.set({ lastUrl: pdfUrl, lastFileName: finalFileName });
    uploadToVercel(pdfUrl, finalFileName);

    chrome.notifications?.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'PDF Snatched!',
      message: `Sending ${finalFileName} to MEGA...`,
      priority: 2
    });
  });
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

// 2b. Header-based detection (most reliable — catches ALL PDFs)
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.type === 'main_frame' || details.type === 'sub_frame') {
      const contentType = details.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type')?.value || "";
      // Check BOTH content-type AND URL — catches PDFs even when server doesn't set headers correctly
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

  chrome.storage.local.get(['megaSession'], async (res) => {
    const sessionToUse = res.megaSession || "";
    try {
      const response = await fetch(VERCEL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfUrl, fileName, megaSession: sessionToUse })
      });

      const result = await response.json();
      logDiagnostic(`Server responded success=${result.success}`);

      if (result.success) {
        // Auto-save session token from server (prevents new MEGA IPs on every upload)
        if (result.sessionString && !sessionToUse) {
          chrome.storage.local.set({ megaSession: result.sessionString });
          logDiagnostic(`✅ Session captured & saved (${result.method}). Future uploads will reuse it.`);
        }

        chrome.notifications?.create({
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
  });
}
