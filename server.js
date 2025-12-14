const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));
app.use('/uploads', express.static('uploads'));

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}
if (!fs.existsSync('uploads/pdfs')) {
    fs.mkdirSync('uploads/pdfs');
}
if (!fs.existsSync('uploads/crops')) {
    fs.mkdirSync('uploads/crops');
}

// PostgreSQL connection
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'jee_mock_test',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('Database connected:', res.rows[0].now);
    }
});

// Multer configuration for PDF uploads
const pdfStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/pdfs');
    },
    filename: (req, file, cb) => {
        const uniqueName = uuidv4() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const pdfUpload = multer({
    storage: pdfStorage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    },
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Multer configuration for cropped images
const cropStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/crops');
    },
    filename: (req, file, cb) => {
        const uniqueName = uuidv4() + '.png';
        cb(null, uniqueName);
    }
});

const cropUpload = multer({ storage: cropStorage });

// ============ API ROUTES ============

// --- PDF Upload ---
app.post('/api/pdfs/upload', pdfUpload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { originalname, filename, size } = req.file;
        const pageCount = req.body.pageCount || 0;

        const result = await pool.query(
            `INSERT INTO pdfs (original_name, stored_name, file_size, page_count, file_path)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [originalname, filename, size, pageCount, `/uploads/pdfs/${filename}`]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('PDF upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// Get all PDFs
app.get('/api/pdfs', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM pdfs ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch PDFs' });
    }
});

// Get single PDF
app.get('/api/pdfs/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM pdfs WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'PDF not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch PDF' });
    }
});

// --- Crop Upload ---
app.post('/api/crops/upload', async (req, res) => {
    try {
        const { imageData, pdfId, pageNumber, cropData } = req.body;
        
        // Convert base64 to file
        const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
        const filename = uuidv4() + '.png';
        const filepath = path.join('uploads/crops', filename);
        
        fs.writeFileSync(filepath, base64Data, 'base64');

        const result = await pool.query(
            `INSERT INTO crops (pdf_id, page_number, crop_x, crop_y, crop_width, crop_height, image_path)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [pdfId, pageNumber, cropData.x, cropData.y, cropData.width, cropData.height, `/uploads/crops/${filename}`]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Crop upload error:', error);
        res.status(500).json({ error: 'Crop upload failed' });
    }
});

// Get crops for PDF
app.get('/api/crops/pdf/:pdfId', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM crops WHERE pdf_id = $1 ORDER BY created_at',
            [req.params.pdfId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch crops' });
    }
});

// Get single crop
app.get('/api/crops/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM crops WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Crop not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch crop' });
    }
});

// --- Questions ---
app.post('/api/questions', async (req, res) => {
    try {
        const {
            cropId, testId, subject, questionType, optionA, optionB, optionC, optionD,
            correctAnswer, marks, negativeMarks, difficulty, solution
        } = req.body;

        const result = await pool.query(
            `INSERT INTO questions 
             (crop_id, test_id, subject, question_type, option_a, option_b, option_c, option_d,
              correct_answer, marks, negative_marks, difficulty, solution)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
            [cropId, testId, subject, questionType, optionA, optionB, optionC, optionD,
             correctAnswer, marks, negativeMarks, difficulty, solution]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Question create error:', error);
        res.status(500).json({ error: 'Failed to create question' });
    }
});

// Get questions for test
app.get('/api/questions/test/:testId', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT q.*, c.image_path FROM questions q
             LEFT JOIN crops c ON q.crop_id = c.id
             WHERE q.test_id = $1 ORDER BY q.id`,
            [req.params.testId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch questions' });
    }
});

// Get single question
app.get('/api/questions/:id', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT q.*, c.image_path FROM questions q
             LEFT JOIN crops c ON q.crop_id = c.id
             WHERE q.id = $1`,
            [req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Question not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch question' });
    }
});

// Update question
app.put('/api/questions/:id', async (req, res) => {
    try {
        const {
            subject, questionType, optionA, optionB, optionC, optionD,
            correctAnswer, marks, negativeMarks, difficulty, solution
        } = req.body;

        const result = await pool.query(
            `UPDATE questions SET
             subject = $1, question_type = $2, option_a = $3, option_b = $4,
             option_c = $5, option_d = $6, correct_answer = $7, marks = $8,
             negative_marks = $9, difficulty = $10, solution = $11, updated_at = NOW()
             WHERE id = $12 RETURNING *`,
            [subject, questionType, optionA, optionB, optionC, optionD,
             correctAnswer, marks, negativeMarks, difficulty, solution, req.params.id]
        );

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update question' });
    }
});

// --- Tests ---
app.post('/api/tests', async (req, res) => {
    try {
        const { name, duration, instructions, totalMarks } = req.body;

        const result = await pool.query(
            `INSERT INTO tests (name, duration, instructions, total_marks)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [name, duration, instructions, totalMarks || 0]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Test create error:', error);
        res.status(500).json({ error: 'Failed to create test' });
    }
});

// Get all tests
app.get('/api/tests', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.*, 
                   COUNT(q.id) as question_count,
                   COALESCE(SUM(q.marks), 0) as total_marks
            FROM tests t
            LEFT JOIN questions q ON t.id = q.test_id
            GROUP BY t.id
            ORDER BY t.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tests' });
    }
});

// Get single test
app.get('/api/tests/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tests WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Test not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch test' });
    }
});

// Update test
app.put('/api/tests/:id', async (req, res) => {
    try {
        const { name, duration, instructions, isPublished } = req.body;

        const result = await pool.query(
            `UPDATE tests SET name = $1, duration = $2, instructions = $3, 
             is_published = $4, updated_at = NOW()
             WHERE id = $5 RETURNING *`,
            [name, duration, instructions, isPublished, req.params.id]
        );

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update test' });
    }
});

// --- Percentile Mappings ---
app.post('/api/percentile-mappings', async (req, res) => {
    try {
        const { testId, mappings } = req.body;

        // Delete existing mappings
        await pool.query('DELETE FROM percentile_mappings WHERE test_id = $1', [testId]);

        // Insert new mappings
        for (const mapping of mappings) {
            await pool.query(
                `INSERT INTO percentile_mappings (test_id, marks_threshold, percentile)
                 VALUES ($1, $2, $3)`,
                [testId, mapping.marksThreshold, mapping.percentile]
            );
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Percentile mapping error:', error);
        res.status(500).json({ error: 'Failed to save percentile mappings' });
    }
});

// Get percentile mappings for test
app.get('/api/percentile-mappings/:testId', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM percentile_mappings WHERE test_id = $1 ORDER BY marks_threshold DESC',
            [req.params.testId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch percentile mappings' });
    }
});

// --- Submissions ---
app.post('/api/submissions/start', async (req, res) => {
    try {
        const { testId, userId } = req.body;

        const result = await pool.query(
            `INSERT INTO submissions (test_id, user_id, started_at, status)
             VALUES ($1, $2, NOW(), 'in_progress') RETURNING *`,
            [testId, userId || 1]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Start submission error:', error);
        res.status(500).json({ error: 'Failed to start test' });
    }
});

// Save response
app.post('/api/responses', async (req, res) => {
    try {
        const { submissionId, questionId, selectedAnswer, timeSpent, status } = req.body;

        // Check if response exists
        const existing = await pool.query(
            'SELECT id FROM responses WHERE submission_id = $1 AND question_id = $2',
            [submissionId, questionId]
        );

        let result;
        if (existing.rows.length > 0) {
            result = await pool.query(
                `UPDATE responses SET selected_answer = $1, time_spent = $2, status = $3, updated_at = NOW()
                 WHERE submission_id = $4 AND question_id = $5 RETURNING *`,
                [selectedAnswer, timeSpent, status, submissionId, questionId]
            );
        } else {
            result = await pool.query(
                `INSERT INTO responses (submission_id, question_id, selected_answer, time_spent, status)
                 VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [submissionId, questionId, selectedAnswer, timeSpent, status]
            );
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Save response error:', error);
        res.status(500).json({ error: 'Failed to save response' });
    }
});

// Get responses for submission
app.get('/api/responses/:submissionId', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM responses WHERE submission_id = $1',
            [req.params.submissionId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch responses' });
    }
});

// Submit test
app.post('/api/submissions/:id/submit', async (req, res) => {
    try {
        const submissionId = req.params.id;

        // Get submission
        const submissionResult = await pool.query(
            'SELECT * FROM submissions WHERE id = $1',
            [submissionId]
        );
        const submission = submissionResult.rows[0];

        // Get all questions for the test
        const questionsResult = await pool.query(
            'SELECT * FROM questions WHERE test_id = $1',
            [submission.test_id]
        );
        const questions = questionsResult.rows;

        // Get all responses
        const responsesResult = await pool.query(
            'SELECT * FROM responses WHERE submission_id = $1',
            [submissionId]
        );
        const responses = responsesResult.rows;

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
        const mappingsResult = await pool.query(
            'SELECT * FROM percentile_mappings WHERE test_id = $1 ORDER BY marks_threshold DESC',
            [submission.test_id]
        );
        
        let percentile = 0;
        for (const mapping of mappingsResult.rows) {
            if (totalScore >= mapping.marks_threshold) {
                percentile = mapping.percentile;
                break;
            }
        }

        // Calculate rank (simplified - based on existing submissions)
        const rankResult = await pool.query(
            `SELECT COUNT(*) + 1 as rank FROM submissions 
             WHERE test_id = $1 AND status = 'completed' AND total_score > $2`,
            [submission.test_id, totalScore]
        );
        const rank = parseInt(rankResult.rows[0].rank);

        // Update submission
        const updateResult = await pool.query(
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

            await pool.query(
                `INSERT INTO analysis_records 
                 (submission_id, subject, score, correct_count, incorrect_count, time_spent, accuracy)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [submissionId, subject, subjectScore, subjectCorrect, subjectIncorrect, subjectTime,
                 (subjectCorrect + subjectIncorrect) > 0 ? (subjectCorrect / (subjectCorrect + subjectIncorrect)) * 100 : 0]
            );
        }

        res.json(updateResult.rows[0]);
    } catch (error) {
        console.error('Submit test error:', error);
        res.status(500).json({ error: 'Failed to submit test' });
    }
});

// Get submission result
app.get('/api/submissions/:id', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT s.*, t.name as test_name, t.duration 
             FROM submissions s
             JOIN tests t ON s.test_id = t.id
             WHERE s.id = $1`,
            [req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Submission not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch submission' });
    }
});

// Get analysis for submission
app.get('/api/analysis/:submissionId', async (req, res) => {
    try {
        const submissionId = req.params.submissionId;

        // Get submission
        const submissionResult = await pool.query(
            `SELECT s.*, t.name as test_name FROM submissions s
             JOIN tests t ON s.test_id = t.id WHERE s.id = $1`,
            [submissionId]
        );
        const submission = submissionResult.rows[0];

        // Get subject-wise analysis
        const subjectResult = await pool.query(
            'SELECT * FROM analysis_records WHERE submission_id = $1',
            [submissionId]
        );

        // Get questions with responses
        const questionsResult = await pool.query(
            `SELECT q.*, r.selected_answer, r.time_spent, r.status as response_status,
                    c.image_path
             FROM questions q
             LEFT JOIN responses r ON q.id = r.question_id AND r.submission_id = $1
             LEFT JOIN crops c ON q.crop_id = c.id
             WHERE q.test_id = $2
             ORDER BY q.id`,
            [submissionId, submission.test_id]
        );

        res.json({
            submission,
            subjectAnalysis: subjectResult.rows,
            questions: questionsResult.rows
        });
    } catch (error) {
        console.error('Get analysis error:', error);
        res.status(500).json({ error: 'Failed to fetch analysis' });
    }
});

// --- Users (simplified) ---
app.post('/api/users', async (req, res) => {
    try {
        const { name, email } = req.body;
        const result = await pool.query(
            'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
            [name, email]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create user' });
    }
});

app.get('/api/users/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
