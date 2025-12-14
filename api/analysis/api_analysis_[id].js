import { query } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id: submissionId } = req.query;

  try {
    // Get submission
    const submissionResult = await query(
      `SELECT s.*, t.name as test_name FROM submissions s
       JOIN tests t ON s.test_id = t.id WHERE s.id = $1`,
      [submissionId]
    );
    
    if (submissionResult.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    
    const submission = submissionResult[0];

    // Get subject-wise analysis
    const subjectAnalysis = await query(
      'SELECT * FROM analysis_records WHERE submission_id = $1',
      [submissionId]
    );

    // Get questions with responses
    const questions = await query(
      `SELECT q.*, r.selected_answer, r.time_spent, r.status as response_status,
              c.image_path
       FROM questions q
       LEFT JOIN responses r ON q.id = r.question_id AND r.submission_id = $1
       LEFT JOIN crops c ON q.crop_id = c.id
       WHERE q.test_id = $2
       ORDER BY q.id`,
      [submissionId, submission.test_id]
    );

    return res.status(200).json({
      submission,
      subjectAnalysis,
      questions
    });
  } catch (error) {
    console.error('Analysis API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
