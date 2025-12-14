import { query } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      const result = await query('SELECT * FROM tests WHERE id = $1', [id]);
      
      if (result.length === 0) {
        return res.status(404).json({ error: 'Test not found' });
      }
      
      return res.status(200).json(result[0]);
    }

    if (req.method === 'PUT') {
      const { name, duration, instructions, isPublished } = req.body;

      const result = await query(
        `UPDATE tests SET name = $1, duration = $2, instructions = $3, 
         is_published = $4, updated_at = NOW()
         WHERE id = $5 RETURNING *`,
        [name, duration, instructions, isPublished, id]
      );

      return res.status(200).json(result[0]);
    }

    if (req.method === 'DELETE') {
      await query('DELETE FROM tests WHERE id = $1', [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Test API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
