import { query } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const result = await query(`
        SELECT t.*, 
               COUNT(q.id) as question_count,
               COALESCE(SUM(q.marks), 0) as total_marks
        FROM tests t
        LEFT JOIN questions q ON t.id = q.test_id
        GROUP BY t.id
        ORDER BY t.created_at DESC
      `);
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const { name, duration, instructions, totalMarks } = req.body;

      const result = await query(
        `INSERT INTO tests (name, duration, instructions, total_marks)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, duration, instructions, totalMarks || 0]
      );

      return res.status(201).json(result[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Tests API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
