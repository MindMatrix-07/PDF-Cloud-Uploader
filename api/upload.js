const { Storage } = require('mega-js');
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

  const megaEmail = process.env.MEGA_EMAIL;
  const megaPassword = process.env.MEGA_PASSWORD;

  if (!megaEmail || !megaPassword) {
    return res.status(500).json({ error: 'Server environment (MEGA credentials) is not set' });
  }

  try {
    const storage = await new Storage({
      email: megaEmail,
      password: megaPassword,
      autologin: true
    }).ready;

    console.log('Logged into MEGA');

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
    });

    // Upload to MEGA folder
    console.log(`Uploading ${fileName} to folder ${chapter}`);
    const uploadStream = folder.upload({
      name: fileName,
      size: response.headers['content-length'] ? parseInt(response.headers['content-length']) : undefined
    }, response.data);

    await uploadStream.complete;
    
    console.log('Upload successful');
    return res.status(200).json({
      success: true,
      message: 'PDF uploaded to MEGA successfully',
      chapter,
      fileName
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({
      success: false,
      error: 'Upload failed',
      details: error.message
    });
  }
};
