const { neon } = require('@neondatabase/serverless');

// Database connection
function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return neon(process.env.DATABASE_URL);
}

async function query(sql, params = []) {
  const db = getDb();
  return await db(sql, params);
}

// Helper to parse path and extract params
function parsePath(path) {
  const parts = path.split('/').filter(Boolean);
  return parts;
}

// Main handler
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const path = event.path.replace('/.netlify/functions/api', '').replace('/api', '');
    const method = event.httpMethod;
    const parts = parsePath(path);
    const body = event.body ? JSON.parse(event.body) : {};

    let result;

    // ============ PDFs ============
    if (parts[0] === 'pdfs') {
      if (method === 'GET' && parts.length === 1) {
        // GET /api/pdfs - List all PDFs
        result = await query('SELECT * FROM pdfs ORDER BY created_at DESC');
        return { statusCode: 200, headers, body: JSON.stringify(result) };
      }
      
      if (method === 'GET' && parts.length === 2) {
        // GET /api/pdfs/:id
        result = await query('SELECT * FROM pdfs WHERE id = $1', [parts[1]]);
        if (result.length === 0) {
          return { statusCode: 404, headers, body: JSON.stringify({ error: 'PDF not found' }) };
        }
        return { statusCode: 200, headers, body: JSON.stringify(result[0]) };
      }

      if (method === 'POST' && parts[1] === 'upload') {
        // POST /api/pdfs/upload - For Netlify, we'll use base64 upload
        const { fileName, fileData, pageCount } = body;
        
        // Store base64 data directly (for small files) or use external storage
        const storedName = `${Date.now()}-${fileName}`;
        
        result = await query(
          `INSERT INTO pdfs (original_name, stored_name, file_size, page_count, file_path)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [fileName, storedName, fileData ? fileData.length : 0, pageCount || 0, fileData]
        );
        return { statusCode: 201, headers, body: JSON.stringify(result[0]) };
      }
    }

    // ============ Crops ============
    if (parts[0] === 'crops') {
      if (method === 'GET' && parts.length === 1) {
        const pdfId = event.queryStringParameters?.pdfId;
        if (pdfId) {
          result = await query('SELECT * FROM crops WHERE pdf_id = $1 ORDER BY created_at', [pdfId]);
        } else {
          result = await query('SELECT * FROM crops ORDER BY created_at DESC');
        }
        return { statusCode: 200, headers, body: JSON.stringify(result) };
      }

      if (method === 'GET' && parts.length === 2) {
        result = await query('SELECT * FROM crops WHERE id = $1', [parts[1]]);
        if (result.length === 0) {
          return { statusCode: 404, headers, body: JSON.stringify({ error: 'Crop not found' }) };
        }
        return { statusCode: 200, headers, body: JSON.stringify(result[0]) };
      }

      if (method === 'POST' && parts.length === 1) {
        const { imageData, pdfId, pageNumber, cropData } = body;
        
        result = await query(
          `INSERT INTO crops (pdf_id, page_number, crop_x, crop_y, crop_width, crop_height, image_path)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [pdfId, pageNumber, cropData.x, cropData.y, cropData.width, cropData.height, imageData]
        );
        return { statusCode: 201, headers, body: JSON.stringify(result[0]) };
      }
    }

    // ============ Tests ============
    if (parts[0] === 'tests') {
      if (method === 'GET' && parts.length === 1) {
        result = await query(`
          SELECT t.*, 
                 COUNT(q.id)::int as question_count,
                 COALESCE(SUM(q.marks), 0)::float as total_marks
          FROM tests t
          LEFT JOIN questions q ON t.id = q.test_id
          GROUP BY t.id
          ORDER BY t.created_at DESC
        `);
        return { statusCode: 200, headers, body: JSON.stringify(result) };
      }

      if (method === 'GET' && parts.length === 2) {
        result = await query('SELECT * FROM tests WHERE id = $1', [parts[1]]);
        if (result.length === 0) {
          return { statusCode: 404, headers, body: JSON.stringify({ error: 'Test not found' }) };
        }
        return { statusCode: 200, headers, body: JSON.stringify(result[0]) };
      }

      if (method === 'POST' && parts.length === 1) {
        const { name, duration, instructions, totalMarks } = body;
        result = await query(
          `INSERT INTO tests (name, duration, instructions, total_marks)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [name, duration, instructions, totalMarks || 0]
        );
        return { statusCode: 201, headers, body: JSON.stringify(result[0]) };
      }

      if (method === 'PUT' && parts.length === 2) {
        const { name, duration, instructions, isPublished } = body;
        result = await query(
          `UPDATE tests SET name = $1, duration = $2, instructions = $3, 
           is_published = $4, updated_at = NOW()
           WHERE id = $5 RETURNING *`,
          [name, duration, instructions, isPublished, parts[1]]
        );
        return { statusCode: 200, headers, body: JSON.stringify(result[0]) };
      }
    }

    // ============ Questions ============
    if (parts[0] === 'questions') {
      if (method === 'GET' && parts.length === 1) {
        const testId = event.queryStringParameters?.testId;
        if (testId) {
          result = await query(
            `SELECT q.*, c.image_path FROM questions q
             LEFT JOIN crops c ON q.crop_id = c.id
             WHERE q.test_id = $1 ORDER BY q.id`,
            [testId]
          );
        } else {
          result = await query('SELECT * FROM questions ORDER BY id');
        }
        return { statusCode: 200, headers, body: JSON.stringify(result) };
      }

      if (method === 'GET' && parts.length === 2) {
        result = await query(
          `SELECT q.*, c.image_path FROM questions q
           LEFT JOIN crops c ON q.crop_id = c.id
           WHERE q.id = $1`,
          [parts[1]]
        );
        if (result.length === 0) {
          return { statusCode: 404, headers, body: JSON.stringify({ error: 'Question not found' }) };
        }
        return { statusCode: 200, headers, body: JSON.stringify(result[0]) };
      }

      if (method === 'POST' && parts.length === 1) {
        const {
          cropId, testId, subject, questionType, optionA, optionB, optionC, optionD,
          correctAnswer, marks, negativeMarks, difficulty, solution
        } = body;

        result = await query(
          `INSERT INTO questions 
           (crop_id, test_id, subject, question_type, option_a, option_b, option_c, option_d,
            correct_answer, marks, negative_marks, difficulty, solution)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
          [cropId, testId, subject, questionType, optionA, optionB, optionC, optionD,
           correctAnswer, marks, negativeMarks, difficulty, solution]
        );
        return { statusCode: 201, headers, body: JSON.stringify(result[0]) };
      }

      if (method === 'PUT' && parts.length === 2) {
        const {
          subject, questionType, optionA, optionB, optionC, optionD,
          correctAnswer, marks, negativeMarks, difficulty, solution
        } = body;

        result = await query(
          `UPDATE questions SET
           subject = $1, question_type = $2, option_a = $3, option_b = $4,
           option_c = $5, option_d = $6, correct_answer = $7, marks = $8,
           negative_marks = $9, difficulty = $10, solution = $11, updated_at = NOW()
           WHERE id = $12 RETURNING *`,
          [subject, questionType, optionA, optionB, optionC, optionD,
           correctAnswer, marks, negativeMarks, difficulty, solution, parts[1]]
        );
        return { statusCode: 200, headers, body: JSON.stringify(result[0]) };
      }
    }

    // ============ Submissions ============
    if (parts[0] === 'submissions') {
      if (method === 'POST' && parts.length === 1) {
        const { testId, userId } = body;
        result = await query(
          `INSERT INTO submissions (test_id, user_id, started_at, status)
           VALUES ($1, $2, NOW(), 'in_progress') RETURNING *`,
          [testId, userId || 1]
        );
        return { statusCode: 201, headers, body: JSON.stringify(result[0]) };
      }

      if (method === 'GET' && parts.length === 2) {
        result = await query(
          `SELECT s.*, t.name as test_name, t.duration 
           FROM submissions s
           JOIN tests t ON s.test_id = t.id
           WHERE s.id = $1`,
          [parts[1]]
        );
        if (result.length === 0) {
          return { statusCode: 404, headers, body: JSON.stringify({ error: 'Submission not found' }) };
        }
        return { statusCode: 200, headers, body: JSON.stringify(result[0]) };
      }

      if (method === 'POST' && parts[1] === 'submit') {
        const { submissionId } = body;

        const submissionResult = await query('SELECT * FROM submissions WHERE id = $1', [submissionId]);
        const submission = submissionResult[0];

        if (!submission) {
          return { statusCode: 404, headers, body: JSON.stringify({ error: 'Submission not found' }) };
        }

        const questions = await query('SELECT * FROM questions WHERE test_id = $1', [submission.test_id]);
        const responses = await query('SELECT * FROM responses WHERE submission_id = $1', [submissionId]);

        let totalScore = 0, correct = 0, incorrect = 0, unattempted = 0, totalTime = 0;

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

          if (response) totalTime += response.time_spent || 0;
        }

        const accuracy = (correct + incorrect) > 0 ? (correct / (correct + incorrect)) * 100 : 0;

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

        const rankResult = await query(
          `SELECT COUNT(*) + 1 as rank FROM submissions 
           WHERE test_id = $1 AND status = 'completed' AND total_score > $2`,
          [submission.test_id, totalScore]
        );
        const rank = parseInt(rankResult[0].rank);

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
          let subjectScore = 0, subjectCorrect = 0, subjectIncorrect = 0, subjectTime = 0;

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

        return { statusCode: 200, headers, body: JSON.stringify(updateResult[0]) };
      }
    }

    // ============ Responses ============
    if (parts[0] === 'responses') {
      if (method === 'GET') {
        const submissionId = event.queryStringParameters?.submissionId;
        if (submissionId) {
          result = await query('SELECT * FROM responses WHERE submission_id = $1', [submissionId]);
          return { statusCode: 200, headers, body: JSON.stringify(result) };
        }
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'submissionId is required' }) };
      }

      if (method === 'POST') {
        const { submissionId, questionId, selectedAnswer, timeSpent, status } = body;

        const existing = await query(
          'SELECT id FROM responses WHERE submission_id = $1 AND question_id = $2',
          [submissionId, questionId]
        );

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
        return { statusCode: 200, headers, body: JSON.stringify(result[0]) };
      }
    }

    // ============ Percentile Mappings ============
    if (parts[0] === 'percentile-mappings') {
      if (method === 'GET') {
        const testId = event.queryStringParameters?.testId;
        if (testId) {
          result = await query(
            'SELECT * FROM percentile_mappings WHERE test_id = $1 ORDER BY marks_threshold DESC',
            [testId]
          );
          return { statusCode: 200, headers, body: JSON.stringify(result) };
        }
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'testId is required' }) };
      }

      if (method === 'POST') {
        const { testId, mappings } = body;
        await query('DELETE FROM percentile_mappings WHERE test_id = $1', [testId]);

        for (const mapping of mappings) {
          await query(
            `INSERT INTO percentile_mappings (test_id, marks_threshold, percentile)
             VALUES ($1, $2, $3)`,
            [testId, mapping.marksThreshold, mapping.percentile]
          );
        }
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }
    }

    // ============ Analysis ============
    if (parts[0] === 'analysis' && parts.length === 2) {
      const submissionId = parts[1];

      const submissionResult = await query(
        `SELECT s.*, t.name as test_name FROM submissions s
         JOIN tests t ON s.test_id = t.id WHERE s.id = $1`,
        [submissionId]
      );
      
      if (submissionResult.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Submission not found' }) };
      }
      
      const submission = submissionResult[0];

      const subjectAnalysis = await query(
        'SELECT * FROM analysis_records WHERE submission_id = $1',
        [submissionId]
      );

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

      return { 
        statusCode: 200, 
        headers, 
        body: JSON.stringify({ submission, subjectAnalysis, questions }) 
      };
    }

    // ============ Health Check ============
    if (parts[0] === 'health' || parts.length === 0) {
      return { 
        statusCode: 200, 
        headers, 
        body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }) 
      };
    }

    // Not found
    return { 
      statusCode: 404, 
      headers, 
      body: JSON.stringify({ error: 'Not found', path, method }) 
    };

  } catch (error) {
    console.error('API Error:', error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: 'Internal server error', message: error.message }) 
    };
  }
};
