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
    setTimeout(() => processedUrls.delete(pdfUrl), 30000);

    logDiagnostic(`🚀 PDF Detected: ${pdfUrl}`);

    let pdfTopic = tabTitle || "Document";
    if (pdfTopic === "Document" || pdfTopic === "PDF") {
      const filename = pdfUrl.split('/').pop().split('?')[0].replace(".pdf", "");
      if (filename.length > 5) pdfTopic = filename;
    }
    pdfTopic = pdfTopic.replace(".pdf", "").split('|')[0].trim();

    chrome.scripting.executeScript({
      target: { tabId: tabId > 0 ? tabId : 0 },
      func: () => document.querySelector('h1, h2, .pdf-title')?.innerText || ""
    }, (results) => {
      if (results?.[0]?.result) pdfTopic = results[0].result.split('|')[0].trim();

      const finalFileName = `${pdfTopic}-${savedChapter}.pdf`.replace(/[\\/:*?"<>|]/g, "").trim();
      logDiagnostic(`Attempting upload: ${finalFileName}`);

      uploadToVercel(pdfUrl, finalFileName);

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Snatching PDF...',
        message: finalFileName,
        priority: 1
      });
    });
  } catch (err) { logDiagnostic(`ERR: ${err.message}`); }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url?.toLowerCase().includes(".pdf") && (changeInfo.status === 'complete' || tab.status === 'complete')) {
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

        // Save to Local History
        chrome.storage.local.get(['uploadHistory'], (hRes) => {
          let history = hRes.uploadHistory || [];
          history.unshift({
            fileName: fileName,
            method: result.method,
            timestamp: result.timestamp,
            chapter: result.chapter
          });
          chrome.storage.local.set({ uploadHistory: history.slice(0, 20) });
        });

        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Cloud Success!',
          message: `Saved to: ${result.chapter} (${result.method})`,
          priority: 2
        });
      } else {
        logDiagnostic(`❌ FAIL: ${result.error}`);
      }
    } catch (error) {
      logDiagnostic(`🚨 FATAL: ${error.message}`);
    }
  });
}
