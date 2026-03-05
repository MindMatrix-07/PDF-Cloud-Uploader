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

  const { pdfUrl, fileName } = req.body;
  if (!pdfUrl || !fileName) return res.status(400).json({ error: 'Missing pdfUrl or fileName' });

  const megaEmail = (process.env.MEGA_EMAIL || "").trim();
  const megaPassword = (process.env.MEGA_PASSWORD || "").trim();
  const megaSession = (process.env.MEGA_SESSION || "").trim();

  const hasSession = megaSession && megaSession !== 'undefined' && megaSession !== 'null';
  const hasCreds = megaEmail && megaEmail !== 'undefined' && megaPassword && megaPassword !== 'undefined';

  const envStatus = {
    MEGA_SESSION: hasSession ? `Found (${megaSession.substring(0, 8)}...)` : 'MISSING',
    MEGA_EMAIL: megaEmail ? 'Found' : 'MISSING',
    MEGA_PASS: megaPassword ? 'Found' : 'MISSING'
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

    // Phase 2: Try Credentials Fallback
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
        details: "Both Session ID and Email/Pass were rejected by MEGA.",
        envStatus: envStatus
      });
    }

    // SUCCESS - Proceed with Upload
    const parts = fileName.split('-');
    const chapter = parts.length >= 2
      ? parts.slice(1).join('-').replace(/\.pdf$/i, '').trim()
      : fileName.replace(/\.pdf$/i, '').trim();

    let folder = storage.root.children.find(item => item.name === chapter && item.directory);
    if (!folder) folder = await storage.mkdir(chapter);

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

    const uploadStream = folder.upload({
      name: fileName,
      size: pdfResponse.headers['content-length'] ? parseInt(pdfResponse.headers['content-length']) : undefined
    }, pdfResponse.data);

    await uploadStream.complete;

    try {
      let historyFile = storage.root.children.find(item => item.name === 'history.json' && !item.directory);
      let history = historyFile ? JSON.parse((await historyFile.downloadBuffer()).toString()) : [];
      history.unshift({ fileName, chapter, timestamp: new Date().toISOString(), status: 'Success' });
      if (historyFile) await historyFile.delete();
      await storage.root.upload('history.json', JSON.stringify(history.slice(0, 20))).complete;
    } catch (hErr) { console.error('History update failed', hErr); }

    return res.status(200).json({ success: true, method: authMethod, chapter, fileName });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
      authMethod,
      envStatus
    });
  }
};
