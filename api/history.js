const { Storage } = require('megajs');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();

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
        if (hasSession) {
            try {
                authMethod = "SESSION";
                storage = await new Storage({ session: megaSession }).ready;
                if (storage.root) return true;
            } catch (e) {
                console.warn("Session failed in history check");
            }
        }
        if (hasCreds) {
            try {
                authMethod = "CREDENTIALS";
                storage = await new Storage({ email: megaEmail, password: megaPassword, autologin: true }).ready;
                if (storage.root) return true;
            } catch (e) {
                console.error("Creds failed in history check");
            }
        }
        return false;
    }

    try {
        const loginSuccess = await performLogin();
        if (!loginSuccess) {
            return res.status(500).json({
                error: "MEGA Authentication Failed",
                details: "Both Session and Email/Pass were rejected.",
                envStatus: envStatus
            });
        }

        let historyFile = storage.root.children.find(item => item.name === 'history.json' && !item.directory);
        if (!historyFile) return res.status(200).json([]);
        const data = await historyFile.downloadBuffer();
        return res.status(200).json(JSON.parse(data.toString()));

    } catch (err) {
        return res.status(500).json({
            error: err.message,
            details: "Unexpected failure during history fetch.",
            envStatus: envStatus
        });
    }
};
