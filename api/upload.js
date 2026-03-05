const { Storage } = require('megajs');
const axios = require('axios');

module.exports = async (req, res) => {
  // CORS configuration for the Chrome extension
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { pdfUrl, fileName } = req.body;

  if (!pdfUrl || !fileName) {
    return res.status(400).json({ error: 'Missing pdfUrl or fileName' });
  }

  console.log(`Processing: ${fileName} from ${pdfUrl}`);

  // Parse "Topic-Chapter.pdf"
  let chapter = 'General';
  // Attempt to split by "-"
  const parts = fileName.split('-');
  if (parts.length >= 2) {
    // Take the part after the first hyphen as the chapter
    // and remove the .pdf extension
    chapter = parts.slice(1).join('-').replace(/\.pdf$/i, '').trim();
  } else {
    // If no hyphen, use the whole name minus .pdf as a fallback
    chapter = fileName.replace(/\.pdf$/i, '').trim();
  }

  console.log(`Extracted Chapter: ${chapter}`);

  // Clean environment variables (handle 'undefined' strings from Vercel)
  const megaEmail = (process.env.MEGA_EMAIL || "").trim();
  const megaPassword = (process.env.MEGA_PASSWORD || "").trim();
  const megaSession = (process.env.MEGA_SESSION || "").trim();

  // Robust check for truly empty values
  const hasSession = megaSession && megaSession !== 'undefined' && megaSession !== 'null';
  const hasCreds = megaEmail && megaEmail !== 'undefined' && megaPassword && megaPassword !== 'undefined';

  if (!hasSession && !hasCreds) {
    console.error('Environment Error: No valid MEGA credentials or session found.');
    return res.status(500).json({
      error: 'MEGA Environment Error',
      details: 'MEGA_SESSION or MEGA_EMAIL/PASSWORD is missing in Vercel. Please check your Environment Variables.'
    });
  }

  try {
    let storageOptions;
    if (hasSession) {
      console.log('Attempting login via MEGA_SESSION');
      storageOptions = { session: megaSession, autologin: true };
    } else {
      console.log('Attempting login via MEGA_EMAIL');
      storageOptions = { email: megaEmail, password: megaPassword, autologin: true };
    }

    const storage = await new Storage(storageOptions).ready;
    console.log('Login successful');

    // Find if the folder already exists
    let folder = storage.root.children.find(
      (item) => item.name === chapter && item.directory
    );

    if (!folder) {
      console.log(`Creating folder: ${chapter}`);
      folder = await storage.mkdir(chapter);
    }

    // Fetch the PDF from the URL
    console.log(`Fetching PDF from ${pdfUrl}`);
    const response = await axios({
      method: 'get',
      url: pdfUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://samsung-pre-prod.pw.live/',
        'Accept': 'application/pdf,*/*'
      },
      timeout: 10000 // 10s timeout
    });

    // Upload to MEGA folder
    console.log(`Uploading ${fileName} to folder ${chapter}`);
    const uploadStream = folder.upload({
      name: fileName,
      size: response.headers['content-length'] ? parseInt(response.headers['content-length']) : undefined
    }, response.data);

    await uploadStream.complete;

    // --- Update History Log ---
    try {
      let historyFile = storage.root.children.find(item => item.name === 'history.json' && !item.directory);
      let history = [];
      if (historyFile) {
        const data = await historyFile.downloadBuffer();
        history = JSON.parse(data.toString());
      }

      // Keep only last 20 entries
      history.unshift({
        fileName,
        chapter,
        timestamp: new Date().toISOString(),
        status: 'Success'
      });
      history = history.slice(0, 20);

      // Delete old history file if it exists to overwrite
      if (historyFile) await historyFile.delete();

      await storage.root.upload('history.json', JSON.stringify(history)).complete;
      console.log('History updated');
    } catch (hError) {
      console.error('History update failed:', hError);
    }
    // --------------------------

    console.log('Upload successful');
    return res.status(200).json({
      success: true,
      message: 'PDF uploaded to MEGA successfully',
      chapter,
      fileName
    });

  } catch (error) {
    console.error('Detailed Upload Error:', error);
    let errorMessage = 'Upload failed';
    if (error.response) {
      errorMessage = `Server responded with ${error.response.status}: ${error.response.statusText}`;
    } else if (error.request) {
      errorMessage = 'No response received from the PDF host';
    } else {
      errorMessage = error.message;
    }

    return res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.stack
    });
  }
};
