import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import { v4 as uuidv4 } from 'uuid';

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

// CORS headers
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Parse multipart form data
function parseMultipart(buffer, boundary) {
  const parts = [];
  const str = buffer.toString('binary');
  const sections = str.split('--' + boundary);

  for (const section of sections) {
    if (section.trim() === '' || section.trim() === '--') continue;

    const headerEnd = section.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const headers = section.substring(0, headerEnd);
    const body = section.substring(headerEnd + 4);

    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]+)"/);

    if (nameMatch) {
      const part = { name: nameMatch[1] };
      
      if (filenameMatch) {
        part.filename = filenameMatch[1];
        let dataEnd = body.lastIndexOf('\r\n');
        part.data = Buffer.from(body.substring(0, dataEnd), 'binary');
      } else {
        part.value = body.trim().replace(/\r\n$/, '');
      }
      
      parts.push(part);
    }
  }

  return parts;
}

// Route handlers
const handlers = {
  // PDFs
  'GET /pdfs': async (req, res) => {
    const result = await query('SELECT * FROM pdfs ORDER BY created_at DESC');
    return res.status(200).json(result);
  },

  'GET /pdfs/:id': async (req, res, params) => {
    const result = await query('SELECT * FROM pdfs WHERE id = $1', [params.id]);
    if (result.length === 0) return res.status(404).json({ error: 'PDF not found' });
    return res.status(200).json(result[0]);
  },

  'POST /pdfs/upload': async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const boundary = req.headers['content-type'].split('boundary=')[1];
    const parts = parseMultipart(buffer, boundary);

    const filePart = parts.find(p => p.filename);
    const pageCountPart = parts.find(p => p.name === 'pageCount');

    if (!filePart) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filename = uuidv4() + '.pdf';
    
    const blob = await put(filename, filePart.data, {
      access: 'public',
      contentType: 'application/pdf',
    });

    const result = await query(
      `INSERT INTO pdfs (original_name, stored_name, file_size, page_count, file_path)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [filePart.filename, filename, filePart.data.length, parseInt(pageCountPart?.value || '0'), blob.url]
    );

    return res.status(201).json(result[0]);
  },

  // Crops
  'GET /crops': async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pdfId = url.searchParams.get('pdfId');
    
    let result;
    if (pdfId) {
      result = await query('SELECT * FROM crops WHERE pdf_id = $1 ORDER BY created_at', [pdfId]);
    } else {
      result = await query('SELECT * FROM crops ORDER BY created_at DESC');
    }
    return res.status(200).json(result);
  },

  'GET /crops/:id': async (req, res, params) => {
    const result = await query('SELECT * FROM crops WHERE id = $1', [params.id]);
    if (result.length === 0) return res.status(404).json({ error: 'Crop not found' });
    return res.status(200).json(result[0]);
  },

  'POST /crops': async (req, res) => {
    const { imageData, pdfId, pageNumber, cropData } = req.body;

    const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const filename = uuidv4() + '.png';

    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: 'image/png',
    });

    const result = await query(
      `INSERT INTO crops (pdf_id, page_number, crop_x, crop_y, crop_width, crop_height, image_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [pdfId, pageNumber, cropData.x, cropData.y, cropData.width, cropData.height, blob.url]
    );

    return res.status(201).json(result[0]);
  },

  // Tests
  'GET /tests': async (req, res) => {
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
  },

  'GET /tests/:id': async (req, res, params) => {
    const result = await query('SELECT * FROM tests WHERE id = $1', [params.id]);
    if (result.length === 0) return res.status(404).json({ error: 'Test not found' });
    return res.status(200).json(result[0]);
  },

  'POST /tests': async (req, res) => {
    const { name, duration, instructions, totalMarks } = req.body;
    const result = await query(
      `INSERT INTO tests (name, duration, instructions, total_marks)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, duration, instructions, totalMarks || 0]
    );
    return res.status(201).json(result[0]);
  },

  'PUT /tests/:id': async (req, res, params) => {
    const { name, duration, instructions, isPublished } = req.body;
    const result = await query(
      `UPDATE tests SET name = $1, duration = $2, instructions = $3, 
       is_published = $4, updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [name, duration, instructions, isPublished, params.id]
    );
    return res.status(200).json(result[0]);
  },

  // Questions
  'GET /questions': async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const testId = url.searchParams.get('testId');
    
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
  },

  'GET /questions/:id': async (req, res, params) => {
    const result = await query(
      `SELECT q.*, c.image_path FROM questions q
       LEFT JOIN crops c ON q.crop_id = c.id
       WHERE q.id = $1`,
      [params.id]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Question not found' });
    return res.status(200).json(result[0]);
  },

  'POST /questions': async (req, res) => {
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
  },

  'PUT /questions/:id': async (req, res, params) => {
    const {
      subject, questionType, optionA, optionB, optionC, optionD,
      correctAnswer, marks, negativeMarks, difficulty, solution
    } = req.body;

    const result = await query(
      `UPDATE questions SET
       subject = $1, question_type = $2, option_a = $3, option_b = $4,
       option_c = $5, option_d = $6, correct_answer = $7, marks = $8,
       negative_marks = $9, difficulty = $10, solution = $11, updated_at = NOW()
       WHERE id = $12 RETURNING *`,
      [subject, questionType, optionA, optionB, optionC, optionD,
       correctAnswer, marks, negativeMarks, difficulty, solution, params.id]
    );

    return res.status(200).json(result[0]);
  },

  // Submissions
  'POST /submissions': async (req, res) => {
    const { testId, userId } = req.body;
    const result = await query(
      `INSERT INTO submissions (test_id, user_id, started_at, status)
       VALUES ($1, $2, NOW(), 'in_progress') RETURNING *`,
      [testId, userId || 1]
    );
    return res.status(201).json(result[0]);
  },

  'GET /submissions/:id': async (req, res, params) => {
    const result = await query(
      `SELECT s.*, t.name as test_name, t.duration 
       FROM submissions s
       JOIN tests t ON s.test_id = t.id
       WHERE s.id = $1`,
      [params.id]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Submission not found' });
    return res.status(200).json(result[0]);
  },

  'POST /submissions/submit': async (req, res) => {
    const { submissionId } = req.body;

    const submissionResult = await query('SELECT * FROM submissions WHERE id = $1', [submissionId]);
    const submission = submissionResult[0];

    if (!submission) return res.status(404).json({ error: 'Submission not found' });

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

    return res.status(200).json(updateResult[0]);
  },

  // Responses
  'GET /responses': async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const submissionId = url.searchParams.get('submissionId');
    
    if (submissionId) {
      const result = await query('SELECT * FROM responses WHERE submission_id = $1', [submissionId]);
      return res.status(200).json(result);
    }
    return res.status(400).json({ error: 'submissionId is required' });
  },

  'POST /responses': async (req, res) => {
    const { submissionId, questionId, selectedAnswer, timeSpent, status } = req.body;

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
  },

  // Percentile Mappings
  'GET /percentile-mappings': async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const testId = url.searchParams.get('testId');
    
    if (testId) {
      const result = await query(
        'SELECT * FROM percentile_mappings WHERE test_id = $1 ORDER BY marks_threshold DESC',
        [testId]
      );
      return res.status(200).json(result);
    }
    return res.status(400).json({ error: 'testId is required' });
  },

  'POST /percentile-mappings': async (req, res) => {
    const { testId, mappings } = req.body;

    await query('DELETE FROM percentile_mappings WHERE test_id = $1', [testId]);

    for (const mapping of mappings) {
      await query(
        `INSERT INTO percentile_mappings (test_id, marks_threshold, percentile)
         VALUES ($1, $2, $3)`,
        [testId, mapping.marksThreshold, mapping.percentile]
      );
    }

    return res.status(200).json({ success: true });
  },

  // Analysis
  'GET /analysis/:id': async (req, res, params) => {
    const submissionId = params.id;

    const submissionResult = await query(
      `SELECT s.*, t.name as test_name FROM submissions s
       JOIN tests t ON s.test_id = t.id WHERE s.id = $1`,
      [submissionId]
    );
    
    if (submissionResult.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
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

    return res.status(200).json({ submission, subjectAnalysis, questions });
  },
};

// Route matcher
function matchRoute(method, path) {
  const routeKey = `${method} ${path}`;
  
  // Exact match
  if (handlers[routeKey]) {
    return { handler: handlers[routeKey], params: {} };
  }
  
  // Pattern match
  for (const [pattern, handler] of Object.entries(handlers)) {
    const [routeMethod, routePath] = pattern.split(' ');
    if (routeMethod !== method) continue;
    
    const routeParts = routePath.split('/');
    const pathParts = path.split('/');
    
    if (routeParts.length !== pathParts.length) continue;
    
    const params = {};
    let match = true;
    
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        params[routeParts[i].slice(1)] = pathParts[i];
      } else if (routeParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }
    
    if (match) {
      return { handler, params };
    }
  }
  
  return null;
}

// Main handler
export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Parse path from URL
    const url = new URL(req.url, `http://${req.headers.host}`);
    let path = url.pathname.replace('/api', '');
    if (path === '') path = '/';

    // Parse JSON body for POST/PUT
    if ((req.method === 'POST' || req.method === 'PUT') && 
        req.headers['content-type']?.includes('application/json')) {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();
      req.body = body ? JSON.parse(body) : {};
    }

    // Find and execute handler
    const match = matchRoute(req.method, path);
    
    if (match) {
      return await match.handler(req, res, match.params);
    }

    return res.status(404).json({ error: 'Not found', path, method: req.method });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
