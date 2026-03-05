const { Storage } = require('megajs');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // In v1.3.0+, we no longer store history on MEGA.
    // This endpoint now serves as a System Status & Credential Check tool.

    const megaEmail = (process.env.MEGA_EMAIL || "").trim();
    const megaPassword = (process.env.MEGA_PASSWORD || "").trim();
    const megaSession = (process.env.MEGA_SESSION || "").trim();

    const hasSession = megaSession && megaSession !== 'undefined' && megaSession !== 'null';
    const hasCreds = megaEmail && megaEmail !== 'undefined' && megaPassword && megaPassword !== 'undefined';

    const envStatus = {
        MEGA_SESSION: hasSession ? `Found (${megaSession.substring(0, 8)}...)` : 'MISSING',
        MEGA_EMAIL: megaEmail ? 'Found' : 'MISSING',
        MEGA_PASS: megaPassword ? 'Found' : 'MISSING',
        HISTORY_MODE: 'Client-Side (Local Storage)'
    };

    return res.status(200).json({
        status: 'online',
        message: 'History is now managed locally in your extension/dashboard.',
        envStatus: envStatus
    });
};
