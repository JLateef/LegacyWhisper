export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.VOCAL_BRIDGE_API_KEY;
  const agentId = process.env.VOCAL_BRIDGE_AGENT_ID;

  if (!apiKey) {
    return res.status(500).json({ error: 'VOCAL_BRIDGE_API_KEY not configured' });
  }

  try {
    const response = await fetch('https://vocalbridgeai.com/api/v1/token', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        ...(agentId && { 'X-Agent-Id': agentId }),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...req.body,
        participant_name: req.body?.participant_name || 'Interviewee',
      }),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
