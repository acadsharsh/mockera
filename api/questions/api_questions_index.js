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
          `SELECT q.*, c.image_path FROM questions q
           LEFT JOIN crops c ON q.crop_id = c.id
           WHERE q.test_id = $1 ORDER BY q.id`,
          [testId]
        );
        return res.status(200).json(result);
      }
      
      const result = await query('SELECT * FROM questions ORDER BY id');
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const {
        cropId, testId, subject, questionType, optionA, optionB, optionC, optionD,
        correctAnswer, marks, negativeMarks, difficulty, solution
      } = req.body;

      const result = await query(
        `INSERT INTO questions 
         (crop_id, test_id, subject, question_type, option_a, option_b, option_c, option_d,
          correct_answer, marks, negative_marks, difficulty, solution)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [cropId, testId, subject, questionType, optionA, optionB, optionC, optionD,
         correctAnswer, marks, negativeMarks, difficulty, solution]
      );

      return res.status(201).json(result[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Questions API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
