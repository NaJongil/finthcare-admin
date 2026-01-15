export default async function handler(req, res) {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appTUSvRn9GseZXVk';

    if (!AIRTABLE_API_KEY) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    const { action, tableId, filterByFormula, offset } = req.query;

    if (!action || !tableId) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    try {
        const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`);
        
        if (filterByFormula) {
            url.searchParams.append('filterByFormula', filterByFormula);
        }
        if (offset) {
            url.searchParams.append('offset', offset);
        }

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({ error: errorText });
        }

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        console.error('Airtable API error:', error);
        return res.status(500).json({ error: 'Failed to fetch data' });
    }
}
