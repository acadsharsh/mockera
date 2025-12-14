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
      const { submissionId } = req.query;
      
      if (submissionId) {
        const result = await query(
          'SELECT * FROM responses WHERE submission_id = $1',
          [submissionId]
        );
        return res.status(200).json(result);
      }
      
      return res.status(400).json({ error: 'submissionId is required' });
    }

    if (req.method === 'POST') {
      const { submissionId, questionId, selectedAnswer, timeSpent, status } = req.body;

      // Check if response exists
      const existing = await query(
        'SELECT id FROM responses WHERE submission_id = $1 AND question_id = $2',
        [submissionId, questionId]
      );

      let result;
      if (existing.length > 0) {
        result = await query(
          `UPDATE responses SET selected_answer = $1, time_spent = $2, status = $3, updated_at = NOW()
           WHERE submission_id = $4 AND question_id = $5 RETURNING *`,
          [selectedAnswer, timeSpent, status, submissionId, questionId]
        );
      } else {
        result = await query(
          `INSERT INTO responses (submission_id, question_id, selected_answer, time_spent, status)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [submissionId, questionId, selectedAnswer, timeSpent, status]
        );
      }

      return res.status(200).json(result[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Responses API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
