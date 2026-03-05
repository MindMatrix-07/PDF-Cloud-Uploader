const { Storage } = require('megajs');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Clean environment variables
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

    if (!hasSession && !hasCreds) {
        return res.status(500).json({
            error: 'MEGA Environment Error',
            details: 'Check Vercel Environment Variables.',
            envStatus: envStatus
        });
    }

    try {
        const storageOptions = hasSession
            ? { session: megaSession, autologin: true }
            : { email: megaEmail, password: megaPassword, autologin: true };

        const storage = await new Storage(storageOptions).ready;

        let historyFile = storage.root.children.find(item => item.name === 'history.json' && !item.directory);

        if (!historyFile) {
            return res.status(200).json([]);
        }

        const data = await historyFile.downloadBuffer();
        const history = JSON.parse(data.toString());

        return res.status(200).json(history);
    } catch (error) {
        console.error('History fetch error:', error);
        let errorMsg = error.message;
        if (error.message.includes('Authentication failed')) {
            errorMsg = "MEGA Authentication failed. Check your MEGA_SESSION or Credentials.";
        }
        return res.status(500).json({ error: 'Failed to fetch history', details: errorMsg });
    }
};
