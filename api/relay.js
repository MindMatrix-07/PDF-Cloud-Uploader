// Vercel Memory Relay (v1.4.0)
// This stores the last 20 events in memory during the function's lifecycle.
let activityFeed = [];

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'POST') {
        const { type, message, detail, timestamp } = req.body;
        if (!type || !message) return res.status(400).json({ error: 'Missing type or message' });

        const event = {
            type, // 'DETECT', 'START', 'SUCCESS', 'ERROR'
            message,
            detail: detail || '',
            timestamp: timestamp || new Date().toISOString()
        };

        activityFeed.unshift(event);
        activityFeed = activityFeed.slice(0, 30); // Keep last 30

        console.log(`Relay Event: [${type}] ${message}`);
        return res.status(200).json({ success: true });
    }

    if (req.method === 'GET') {
        return res.status(200).json(activityFeed);
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
