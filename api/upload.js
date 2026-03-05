const { Storage } = require('megajs');
const axios = require('axios');

module.exports = async (req, res) => {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Get Inputs (Accept dynamic session from body)
  const { pdfUrl, fileName, megaSession: dynamicSession } = req.body;
  if (!pdfUrl || !fileName) return res.status(400).json({ error: 'Missing pdfUrl or fileName' });

  // 2. Get and Clean Env Vars (Credentials stay in Env)
  const megaEmail = (process.env.MEGA_EMAIL || "").trim();
  const megaPassword = (process.env.MEGA_PASSWORD || "").trim();

  // Prioritize dynamic session from request, then fall back to Env (if not disabled)
  const envSession = (process.env.MEGA_SESSION || "").trim();
  const megaSession = (dynamicSession || envSession || "").trim();

  const hasSession = megaSession && megaSession !== 'undefined' && megaSession !== 'null';
  const hasCreds = megaEmail && megaEmail !== 'undefined' && megaPassword && megaPassword !== 'undefined';

  const envStatus = {
    MEGA_SESSION: hasSession ? `Found (${megaSession.substring(0, 8)}...)` : 'MISSING',
    MEGA_EMAIL: megaEmail ? 'Found' : 'MISSING',
    MEGA_PASS: megaPassword ? 'Found' : 'MISSING',
    SESSION_SOURCE: dynamicSession ? 'DASHBOARD/EXTENSION' : 'ENV'
  };

  let storage;
  let authMethod = "NONE";

  async function performLogin() {
    // Phase 1: Try Session
    if (hasSession) {
      try {
        console.log('Trying MEGA_SESSION...');
        authMethod = "SESSION";
        storage = await new Storage({ session: megaSession }).ready;
        if (storage.root) return true;
      } catch (e) {
        console.warn("Session login failed, trying fallback...");
      }
    }

    // Phase 2: Try Credentials Fallback (Env based)
    if (hasCreds) {
      try {
        console.log('Trying MEGA_EMAIL/PASS...');
        authMethod = "CREDENTIALS";
        storage = await new Storage({ email: megaEmail, password: megaPassword, autologin: true }).ready;
        if (storage.root) return true;
      } catch (e) {
        console.error("Credential login failed:", e.message);
      }
    }

    return false;
  }

  try {
    const loginSuccess = await performLogin();
    if (!loginSuccess) {
      return res.status(500).json({
        error: "MEGA Authentication Failed",
        details: "Login rejected by MEGA. Check your Session ID or Credentials.",
        envStatus: envStatus
      });
    }

    // SUCCESS - Proceed with Upload
    const parts = fileName.split('-');
    const chapter = parts.length >= 2
      ? parts.slice(1).join('-').replace(/\.pdf$/i, '').trim()
      : fileName.replace(/\.pdf$/i, '').trim();

    // Find/Create Folder
    let folder = storage.root.children.find(item => item.name === chapter && item.directory);
    if (!folder) folder = await storage.mkdir(chapter);

    // Fetch PDF
    const pdfResponse = await axios({
      method: 'get',
      url: pdfUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://samsung-pre-prod.pw.live/',
        'Accept': 'application/pdf,*/*'
      },
      timeout: 10000
    });

    // Upload
    const uploadStream = folder.upload({
      name: fileName,
      size: pdfResponse.headers['content-length'] ? parseInt(pdfResponse.headers['content-length']) : undefined
    }, pdfResponse.data);

    await uploadStream.complete;

    await uploadStream.complete;

    // --- PUSH SUCCESS TO LIVE RELAY ---
    try {
      await axios.post('https://pdf-cloud-uploader.vercel.app/api/relay', {
        type: 'SUCCESS',
        message: `Uploaded: ${fileName}`,
        detail: `Folder: ${chapter} | Login: ${authMethod}`
      });
    } catch (e) { console.error('Relay fail:', e.message); }

    return res.status(200).json({
      success: true,
      method: authMethod,
      chapter,
      fileName,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    // --- PUSH ERROR TO LIVE RELAY ---
    try {
      await axios.post('https://pdf-cloud-uploader.vercel.app/api/relay', {
        type: 'ERROR',
        message: `Upload Failed: ${fileName || 'Unknown File'}`,
        detail: err.message
      });
    } catch (e) { console.error('Relay fail:', e.message); }

    return res.status(500).json({
      success: false,
      error: err.message,
      authMethod,
      envStatus
    });
  }
};
