import { query } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      const { testId, userId } = req.body;

      const result = await query(
        `INSERT INTO submissions (test_id, user_id, started_at, status)
         VALUES ($1, $2, NOW(), 'in_progress') RETURNING *`,
        [testId, userId || 1]
      );

      return res.status(201).json(result[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Submissions API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
