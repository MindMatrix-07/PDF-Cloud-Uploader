const VERCEL_URL = "https://pdf-cloud-uploader.vercel.app/api/upload";

let savedChapter = "GENERAL";

// Startup Data Load
chrome.storage.local.get(['savedChapter'], (res) => {
  if (res.savedChapter) savedChapter = res.savedChapter;
});

// Chapter Discovery from PW/Xylem URL
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const targetUrl = changeInfo.url || tab.url;
  if (targetUrl && targetUrl.includes("topicName=")) {
    try {
      const urlObj = new URL(targetUrl);
      const topic = urlObj.searchParams.get("topicName");
      if (topic) {
        savedChapter = decodeURIComponent(topic).replace(/\(\d{4}\)/g, "").trim().toUpperCase();
        chrome.storage.local.set({ savedChapter });
      }
    } catch (e) { }
  }
});

// Logging
function logDiagnostic(msg) {
  const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
  chrome.storage.local.get(['diagLogs'], (res) => {
    const logs = [entry, ...(res.diagLogs || [])].slice(0, 20);
    chrome.storage.local.set({ diagLogs: logs });
  });
}

// Simple in-memory dedup (no async locks)
const processedUrls = new Set();

function processPdf(pdfUrl, tabId, tabTitle) {
  try {
    if (!pdfUrl) return;

    // Unwrap nested pdf_url param
    try {
      const u = new URL(pdfUrl);
      const nested = u.searchParams.get('pdf_url') || u.searchParams.get('file');
      if (nested && nested.toLowerCase().includes('.pdf')) pdfUrl = nested;
    } catch (e) { }

    if (processedUrls.has(pdfUrl)) return;
    processedUrls.add(pdfUrl);
    setTimeout(() => processedUrls.delete(pdfUrl), 20000);

    logDiagnostic(`🚀 PDF Detected: ${pdfUrl.split('/').pop().split('?')[0]}`);

    // Build topic from tab title
    let pdfTopic = (tabTitle || "").replace(".pdf", "").split('|')[0].trim() || "Document";

    // Try to enrich topic name from page, then upload
    if (tabId > 0) {
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => document.querySelector('h1, h2, .pdf-title, .title')?.innerText?.trim() || ""
      }, (results) => {
        const pageTitle = results?.[0]?.result;
        if (pageTitle) pdfTopic = pageTitle.split('|')[0].trim();
        doUpload(pdfUrl, pdfTopic);
      });
    } else {
      doUpload(pdfUrl, pdfTopic);
    }

  } catch (err) {
    logDiagnostic(`ERR: ${err.message}`);
  }
}

function doUpload(pdfUrl, pdfTopic) {
  const finalFileName = `${pdfTopic}-${savedChapter}.pdf`.replace(/[\\/:*?"<>|]/g, "").trim();
  logDiagnostic(`Uploading: ${finalFileName}`);

  chrome.notifications?.create({
    type: 'basic', iconUrl: 'icon.png',
    title: 'Snatching PDF...', message: finalFileName, priority: 1
  });

  chrome.storage.local.get(['megaSession'], async (res) => {
    const sessionToUse = res.megaSession || "";
    try {
      const response = await fetch(VERCEL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfUrl, fileName: finalFileName, megaSession: sessionToUse })
      });
      const result = await response.json();
      if (result.success) {
        logDiagnostic(`✅ SUCCESS: ${result.chapter}`);
        chrome.notifications?.create({
          type: 'basic', iconUrl: 'icon.png',
          title: 'Cloud Success!', message: `Saved to: ${result.chapter}`, priority: 2
        });
      } else {
        logDiagnostic(`❌ FAIL: ${result.error}`);
      }
    } catch (error) {
      logDiagnostic(`🚨 FATAL: ${error.message}`);
    }
  });
}

// Trigger 1: Tab URL contains .pdf
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.url) return;
  const url = tab.url.toLowerCase();
  if (url.includes('.pdf') || url.includes('/pdf-viewer') || url.includes('/pdf_viewer')) {
    if (changeInfo.status === 'complete' || changeInfo.status === 'loading') {
      processPdf(tab.url, tabId, tab.title);
    }
  }
});

// Trigger 2: Response Content-Type is application/pdf (catches ALL PDFs regardless of URL)
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.type === 'main_frame' || details.type === 'sub_frame') {
      const ct = details.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type')?.value || "";
      if (ct.includes('application/pdf')) {
        processPdf(details.url, details.tabId, "PDF-Document");
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);
