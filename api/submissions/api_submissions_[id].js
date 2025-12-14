import { query } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      const result = await query(
        `SELECT s.*, t.name as test_name, t.duration 
         FROM submissions s
         JOIN tests t ON s.test_id = t.id
         WHERE s.id = $1`,
        [id]
      );
      
      if (result.length === 0) {
        return res.status(404).json({ error: 'Submission not found' });
      }
      
      return res.status(200).json(result[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Submission API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
