// ── Browser compatibility shim (works in both Chrome and Firefox) ──────────
const _browser = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

const VERCEL_URL = "https://pdf-cloud-uploader.vercel.app/api/upload";
const VERSION = "1.7.0";

let savedChapter = "GENERAL"; // Default fallback

// 1. Listen for the Chapter Name in every URL change
_browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const targetUrl = changeInfo.url || tab.url;
  if (targetUrl && targetUrl.includes("topicName=")) {
    try {
      const urlObj = new URL(targetUrl);
      const topic = urlObj.searchParams.get("topicName");
      if (topic) {
        savedChapter = decodeURIComponent(topic).replace(/\(\d{4}\)/g, "").trim().toUpperCase();
        console.log("Memory Locked On:", savedChapter);
        _browser.storage.local.set({ savedChapter });
      }
    } catch (e) { }
  }
});

// Load saved chapter on startup
_browser.storage.local.get(['savedChapter'], (res) => {
  if (res.savedChapter) savedChapter = res.savedChapter;
});

// Helper to log diagnostics for the user
function logDiagnostic(msg) {
  const time = new Date().toLocaleTimeString();
  const entry = `[${time}] ${msg}`;
  console.log(entry);
  _browser.storage.local.get(['diagLogs'], (res) => {
    let logs = res.diagLogs || [];
    logs.unshift(entry);
    _browser.storage.local.set({ diagLogs: logs.slice(0, 20) });
  });
}

// Cache to prevent duplicate uploads
const processedUrls = new Set();

function processPdf(pdfUrl, tabId, tabTitle) {
  if (!pdfUrl) return;

  // ── CHECK IF EXTENSION IS ENABLED ───────────────────────────────────────
  _browser.storage.local.get(['extensionEnabled'], (res) => {
    if (res.extensionEnabled === false) {
      console.log('[Snatcher] Extension is disabled — skipping PDF.');
      return;
    }

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

    _browser.scripting.executeScript({
      target: { tabId: tabId || 0 },
      func: () => document.querySelector('h1, h2, .pdf-title, .header-title')?.innerText || ""
    }, (results) => {
      if (!_browser.runtime.lastError && results && results[0].result) {
        pdfTopic = results[0].result.split('|')[0].trim();
      }

      const finalFileName = `${pdfTopic}-${savedChapter}.pdf`.replace(/[\\/:*?"<>|]/g, "").trim();
      logDiagnostic(`Naming file: ${finalFileName}`);

      _browser.storage.local.set({ lastUrl: pdfUrl, lastFileName: finalFileName });
      uploadToVercel(pdfUrl, finalFileName);

      _browser.notifications?.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'PDF Snatched!',
        message: `Sending ${finalFileName} to MEGA...`,
        priority: 2
      });
    });
  });
}

// 2a. Navigation-based detection
_browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && tab.url.toLowerCase().includes(".pdf")) {
    if (changeInfo.status === 'complete' || tab.status === 'complete') {
      logDiagnostic(`Tab detection hit: ${tab.url}`);
      processPdf(tab.url, tabId, tab.title);
    }
  }
});

// 2b. Header-based detection (most reliable — catches ALL PDFs)
_browser.webRequest.onHeadersReceived.addListener(
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
  logDiagnostic(`[v${VERSION}] Fetching PDF bytes locally: ${pdfUrl}`);

  _browser.storage.local.get(['megaSession'], async (res) => {
    const sessionToUse = res.megaSession || "";
    try {
      // ── STEP 1: Download PDF in the service worker (has user cookies/session) ──
      const pdfFetch = await fetch(pdfUrl, {
        credentials: 'include',
        headers: {
          'Accept': 'application/pdf,*/*',
          'Referer': 'https://samsung-pre-prod.pw.live/'
        }
      });

      if (!pdfFetch.ok) {
        logDiagnostic(`❌ [v${VERSION}] PDF fetch failed: HTTP ${pdfFetch.status}`);
        return;
      }

      // ── STEP 2: Process PDF Data ──
      const arrayBuffer = await pdfFetch.arrayBuffer();
      const fileSizeKB = (arrayBuffer.byteLength / 1024).toFixed(1);
      logDiagnostic(`✅ [v${VERSION}] PDF downloaded locally: ${fileSizeKB} KB`);

      let payload = { fileName, megaSession: sessionToUse, pdfUrl };

      // Vercel limit is 4.5MB. 2MB raw ≈ 2.7MB base64 (very safe).
      if (arrayBuffer.byteLength > 2 * 1024 * 1024) {
        logDiagnostic(`⚠️ [v${VERSION}] File > 2MB. Switching to URL + Cookies.`);
        const cookies = await _browser.cookies.getAll({ url: pdfUrl });
        payload.cookies = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      } else {
        const uint8 = new Uint8Array(arrayBuffer);
        let binary = '';
        const CHUNK = 8192;
        for (let i = 0; i < uint8.length; i += CHUNK) {
          binary += String.fromCharCode(...uint8.subarray(i, i + CHUNK));
        }
        payload.pdfData = btoa(binary);
      }

      // ── STEP 3: Send to Vercel ──
      const response = await fetch(VERCEL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const text = await response.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        logDiagnostic(`❌ Server Error (Non-JSON): ${text.substring(0, 100)}...`);
        return;
      }

      logDiagnostic(`Server responded success=${result.success}`);

      if (result.success) {
        // Auto-save session token from server (prevents new MEGA IPs on every upload)
        if (result.sessionString && !sessionToUse) {
          _browser.storage.local.set({ megaSession: result.sessionString });
          logDiagnostic(`✅ Session captured & saved (${result.method}). Future uploads will reuse it.`);
        }

        // Save to upload history
        _browser.storage.local.get(['uploadHistory'], (hr) => {
          let history = hr.uploadHistory || [];
          history.unshift({ fileName, method: result.method, timestamp: Date.now(), chapter: result.chapter });
          _browser.storage.local.set({ uploadHistory: history.slice(0, 10) });
        });

        _browser.notifications?.create({
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
