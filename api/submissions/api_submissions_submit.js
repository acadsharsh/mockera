import { query } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { submissionId } = req.body;

    // Get submission
    const submissionResult = await query(
      'SELECT * FROM submissions WHERE id = $1',
      [submissionId]
    );
    const submission = submissionResult[0];

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Get all questions for the test
    const questions = await query(
      'SELECT * FROM questions WHERE test_id = $1',
      [submission.test_id]
    );

    // Get all responses
    const responses = await query(
      'SELECT * FROM responses WHERE submission_id = $1',
      [submissionId]
    );

    // Calculate score
    let totalScore = 0;
    let correct = 0;
    let incorrect = 0;
    let unattempted = 0;
    let totalTime = 0;

    for (const question of questions) {
      const response = responses.find(r => r.question_id === question.id);
      
      if (!response || response.status === 'not_visited' || response.status === 'not_answered') {
        unattempted++;
      } else if (response.selected_answer === question.correct_answer) {
        correct++;
        totalScore += parseFloat(question.marks);
      } else {
        incorrect++;
        totalScore -= parseFloat(question.negative_marks);
      }

      if (response) {
        totalTime += response.time_spent || 0;
      }
    }

    const accuracy = (correct + incorrect) > 0 ? (correct / (correct + incorrect)) * 100 : 0;

    // Get percentile
    const mappings = await query(
      'SELECT * FROM percentile_mappings WHERE test_id = $1 ORDER BY marks_threshold DESC',
      [submission.test_id]
    );
    
    let percentile = 0;
    for (const mapping of mappings) {
      if (totalScore >= mapping.marks_threshold) {
        percentile = mapping.percentile;
        break;
      }
    }

    // Calculate rank
    const rankResult = await query(
      `SELECT COUNT(*) + 1 as rank FROM submissions 
       WHERE test_id = $1 AND status = 'completed' AND total_score > $2`,
      [submission.test_id, totalScore]
    );
    const rank = parseInt(rankResult[0].rank);

    // Update submission
    const updateResult = await query(
      `UPDATE submissions SET 
       status = 'completed', completed_at = NOW(), total_score = $1,
       correct_count = $2, incorrect_count = $3, unattempted_count = $4,
       accuracy = $5, percentile = $6, rank = $7, total_time = $8
       WHERE id = $9 RETURNING *`,
      [totalScore, correct, incorrect, unattempted, accuracy, percentile, rank, totalTime, submissionId]
    );

    // Create analysis records
    const subjects = [...new Set(questions.map(q => q.subject))];
    for (const subject of subjects) {
      const subjectQuestions = questions.filter(q => q.subject === subject);
      let subjectScore = 0;
      let subjectCorrect = 0;
      let subjectIncorrect = 0;
      let subjectTime = 0;

      for (const question of subjectQuestions) {
        const response = responses.find(r => r.question_id === question.id);
        if (response && response.status === 'answered') {
          subjectTime += response.time_spent || 0;
          if (response.selected_answer === question.correct_answer) {
            subjectCorrect++;
            subjectScore += parseFloat(question.marks);
          } else {
            subjectIncorrect++;
            subjectScore -= parseFloat(question.negative_marks);
          }
        }
      }

      await query(
        `INSERT INTO analysis_records 
         (submission_id, subject, score, correct_count, incorrect_count, time_spent, accuracy)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [submissionId, subject, subjectScore, subjectCorrect, subjectIncorrect, subjectTime,
         (subjectCorrect + subjectIncorrect) > 0 ? (subjectCorrect / (subjectCorrect + subjectIncorrect)) * 100 : 0]
      );
    }

    return res.status(200).json(updateResult[0]);
  } catch (error) {
    console.error('Submit test error:', error);
    return res.status(500).json({ error: 'Failed to submit test: ' + error.message });
  }
}
