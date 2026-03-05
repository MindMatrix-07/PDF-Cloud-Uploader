const VERCEL_URL = "https://pdf-cloud-uploader.vercel.app/api/upload";
const RELAY_URL = "https://pdf-cloud-uploader.vercel.app/api/relay";

let savedChapter = "GENERAL";

// Startup Data Load
chrome.storage.local.get(['savedChapter'], (res) => {
  if (res.savedChapter) savedChapter = res.savedChapter;
});

// Listener for Chapter Discovery
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const targetUrl = changeInfo.url || tab.url;
  // PW Pattern
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
  // Xylem/Generic Breadcrumb Pattern
  if (targetUrl && (targetUrl.includes("/library/") || targetUrl.includes("/courses/"))) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => document.querySelector('.breadcrumb, [class*="breadcrumb"], .course-title')?.innerText || ""
    }, (results) => {
      if (results?.[0]?.result) {
        savedChapter = results[0].result.split('>').pop().trim().toUpperCase();
        chrome.storage.local.set({ savedChapter: savedChapter });
      }
    });
  }
});

// Centralized relay logging (Pushes to Website)
async function relayLog(type, message, detail = "") {
  // 1. Local logging
  const time = new Date().toLocaleTimeString();
  const entry = `[${time}] ${message}`;
  chrome.storage.local.get(['diagLogs'], (res) => {
    let logs = res.diagLogs || [];
    logs.unshift(entry);
    chrome.storage.local.set({ diagLogs: logs.slice(0, 20) });
  });

  // 2. Remote relay (to Website)
  try {
    fetch(RELAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, message, detail })
    }).catch(() => { });
  } catch (e) { }
}

function logDiagnostic(msg) {
  relayLog('INFO', msg);
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

    relayLog('DETECT', `Page detected: ${pdfUrl.split('/').pop().split('?')[0]}`);

    let pdfTopic = tabTitle || "Document";

    // Support for extraction from DOM (for custom viewers like Xylem)
    if (tabId && tabId > 0) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          const links = Array.from(document.querySelectorAll('a, iframe, embed, object'));
          const pdfLink = links.find(el => (el.href || el.src || el.data)?.toLowerCase().includes('.pdf'))?.href ||
            links.find(el => (el.href || el.src || el.data)?.toLowerCase().includes('.pdf'))?.src ||
            links.find(el => (el.href || el.src || el.data)?.toLowerCase().includes('.pdf'))?.data || "";
          const title = document.querySelector('h1, h2, .pdf-title, .title, .breadcrumb-item.active, [class*="breadcrumb"]')?.innerText || "";
          return { pdfLink, title };
        }
      }, (results) => {
        const { pdfLink, title } = results?.[0]?.result || {};

        if (pdfLink && pdfLink.toLowerCase().includes('.pdf')) {
          relayLog('DETECT', `Hidden PDF Found: ${pdfLink.split('/').pop()}`);
          pdfUrl = pdfLink;
        }

        if (title) pdfTopic = title.split('|')[0].split('>').pop().trim();
        startUpload(pdfUrl, pdfTopic);
      });
    } else {
      startUpload(pdfUrl, pdfTopic);
    }
  } catch (err) { relayLog('ERROR', `Detection Error: ${err.message}`); }
}

function startUpload(pdfUrl, pdfTopic) {
  const finalFileName = `${pdfTopic}-${savedChapter}.pdf`.replace(/[\\/:*?"<>|]/g, "").trim();
  relayLog('START', `Starting upload: ${finalFileName}`, `From: ${pdfUrl}`);

  uploadToVercel(pdfUrl, finalFileName);

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Snatching PDF...',
    message: finalFileName,
    priority: 1
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const isPdfUrl = tab.url?.toLowerCase().includes(".pdf");
  const isPdfViewer = tab.url?.toLowerCase().includes("/pdf-viewer") || tab.url?.toLowerCase().includes("/pdf_viewer");

  if ((isPdfUrl || isPdfViewer) && (changeInfo.status === 'complete' || tab.status === 'complete')) {
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
        relayLog('SUCCESS', `Upload finished: ${fileName}`, `Method: ${result.method}`);

        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Cloud Success!',
          message: `Saved to: ${result.chapter} (${result.method})`,
          priority: 2
        });
      } else {
        relayLog('ERROR', `Server ERR: ${result.error}`);
      }
    } catch (error) {
      relayLog('ERROR', `Network FATAL: ${error.message}`);
    }
  });
}
