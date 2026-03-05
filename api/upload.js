const { Storage } = require('megajs');
const axios = require('axios');

// In-memory log store (resets on cold start, but keeps logs within a warm instance)
const uploadLog = [];
function addLog(entry) {
  uploadLog.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (uploadLog.length > 50) uploadLog.pop();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: return upload log for dashboard
  if (req.method === 'GET') {
    return res.status(200).json({ logs: uploadLog });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pdfUrl, fileName, megaSession: dynamicSession } = req.body;
  if (!pdfUrl || !fileName) return res.status(400).json({ error: 'Missing pdfUrl or fileName' });

  const megaEmail = (process.env.MEGA_EMAIL || "").trim();
  const megaPassword = (process.env.MEGA_PASSWORD || "").trim();
  const envSession = (process.env.MEGA_SESSION || "").trim();
  const megaSession = (dynamicSession || envSession || "").trim();

  const hasSession = megaSession && megaSession !== 'undefined' && megaSession !== 'null';
  const hasCreds = megaEmail && megaEmail !== 'undefined' && megaPassword && megaPassword !== 'undefined';

  const envStatus = {
    MEGA_SESSION: hasSession ? `Found (${megaSession.substring(0, 8)}...)` : 'MISSING',
    MEGA_EMAIL: megaEmail ? 'Found' : 'MISSING',
    MEGA_PASS: megaPassword ? 'Found' : 'MISSING',
    SESSION_SOURCE: dynamicSession ? 'EXTENSION' : 'ENV'
  };

  let storage;
  let authMethod = "NONE";
  let sessionString = null; // Will hold the reusable session token

  async function performLogin() {
    // Phase 1: Try Session (reuses existing MEGA session — no new login)
    if (hasSession) {
      try {
        authMethod = "SESSION";
        storage = await new Storage({ session: megaSession }).ready;
        if (storage.root) return true;
      } catch (e) {
        console.warn("Session login failed, trying credentials...");
      }
    }

    // Phase 2: Try Credentials Fallback — and capture the session for reuse
    if (hasCreds) {
      try {
        authMethod = "CREDENTIALS";
        storage = await new Storage({ email: megaEmail, password: megaPassword, autologin: true }).ready;
        if (storage.root) {
          // Capture session string so it can be saved client-side and reused (avoids new IPs each time)
          try { sessionString = storage.session?.toString() || null; } catch (e) { }
          return true;
        }
      } catch (e) {
        console.error("Credential login failed:", e.message);
      }
    }

    return false;
  }

  try {
    const loginSuccess = await performLogin();
    if (!loginSuccess) {
      const logEntry = { type: 'ERROR', fileName, message: 'MEGA Authentication Failed', authMethod, envStatus };
      addLog(logEntry);
      return res.status(500).json({ error: "MEGA Authentication Failed", envStatus });
    }

    const parts = fileName.split('-');
    const chapter = parts.length >= 2
      ? parts.slice(1).join('-').replace(/\.pdf$/i, '').trim()
      : fileName.replace(/\.pdf$/i, '').trim();

    let folder = storage.root.children.find(item => item.name === chapter && item.directory);
    if (!folder) folder = await storage.mkdir(chapter);

    const pdfResponse = await axios({
      method: 'get', url: pdfUrl, responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://samsung-pre-prod.pw.live/',
        'Accept': 'application/pdf,*/*'
      },
      timeout: 15000
    });

    const uploadStream = folder.upload({
      name: fileName,
      size: pdfResponse.headers['content-length'] ? parseInt(pdfResponse.headers['content-length']) : undefined,
      allowUploadBuffering: true
    }, pdfResponse.data);

    await uploadStream.complete;

    const successEntry = { type: 'SUCCESS', fileName, chapter, method: authMethod, envStatus };
    addLog(successEntry);

    return res.status(200).json({
      success: true,
      method: authMethod,
      chapter,
      fileName,
      timestamp: new Date().toISOString(),
      // Return session string to extension — it can save this and reuse it, preventing new IPs
      sessionString: sessionString
    });

  } catch (err) {
    const errorEntry = { type: 'ERROR', fileName, message: err.message, authMethod, envStatus };
    addLog(errorEntry);
    return res.status(500).json({ success: false, error: err.message, authMethod, envStatus });
  }
};
