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
      const { testId } = req.query;
      
      if (testId) {
        const result = await query(
          'SELECT * FROM percentile_mappings WHERE test_id = $1 ORDER BY marks_threshold DESC',
          [testId]
        );
        return res.status(200).json(result);
      }
      
      return res.status(400).json({ error: 'testId is required' });
    }

    if (req.method === 'POST') {
      const { testId, mappings } = req.body;

      // Delete existing mappings
      await query('DELETE FROM percentile_mappings WHERE test_id = $1', [testId]);

      // Insert new mappings
      for (const mapping of mappings) {
        await query(
          `INSERT INTO percentile_mappings (test_id, marks_threshold, percentile)
           VALUES ($1, $2, $3)`,
          [testId, mapping.marksThreshold, mapping.percentile]
        );
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Percentile mappings API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
