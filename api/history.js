// api/history.js (v1.4.0)
// This endpoint now simply forwards to the relay to provide the "Live Info" to the dashboard.
const axios = require('axios');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // Fetch the activity feed from our relay
        const response = await axios.get('https://pdf-cloud-uploader.vercel.app/api/relay');

        return res.status(200).json({
            status: 'online',
            activity: response.data,
            envStatus: {
                MEGA_SESSION: (process.env.MEGA_SESSION) ? "Found" : "MISSING",
                MEGA_EMAIL: (process.env.MEGA_EMAIL) ? "Found" : "MISSING"
            }
        });
    } catch (err) {
        return res.status(500).json({
            error: 'Failed to fetch live activity',
            details: err.message
        });
    }
};
