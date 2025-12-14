-- JEE Mock Test Platform - Neon PostgreSQL Schema
-- Run this in Neon SQL Editor after creating your database

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) DEFAULT 'student',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PDFs table
CREATE TABLE IF NOT EXISTS pdfs (
    id SERIAL PRIMARY KEY,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    file_size BIGINT,
    page_count INTEGER DEFAULT 0,
    file_path VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tests table
CREATE TABLE IF NOT EXISTS tests (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    duration INTEGER NOT NULL,
    instructions TEXT,
    total_marks DECIMAL(10,2) DEFAULT 0,
    is_published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crops table
CREATE TABLE IF NOT EXISTS crops (
    id SERIAL PRIMARY KEY,
    pdf_id INTEGER REFERENCES pdfs(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    crop_x INTEGER,
    crop_y INTEGER,
    crop_width INTEGER,
    crop_height INTEGER,
    image_path VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Questions table
CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    crop_id INTEGER REFERENCES crops(id) ON DELETE SET NULL,
    test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
    subject VARCHAR(100) NOT NULL,
    question_type VARCHAR(50) NOT NULL,
    option_a TEXT,
    option_b TEXT,
    option_c TEXT,
    option_d TEXT,
    correct_answer VARCHAR(255) NOT NULL,
    marks DECIMAL(5,2) DEFAULT 4,
    negative_marks DECIMAL(5,2) DEFAULT 1,
    difficulty VARCHAR(20) DEFAULT 'Medium',
    solution TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Percentile mappings table
CREATE TABLE IF NOT EXISTS percentile_mappings (
    id SERIAL PRIMARY KEY,
    test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
    marks_threshold DECIMAL(10,2) NOT NULL,
    percentile DECIMAL(5,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Submissions table
CREATE TABLE IF NOT EXISTS submissions (
    id SERIAL PRIMARY KEY,
    test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'in_progress',
    total_score DECIMAL(10,2) DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    incorrect_count INTEGER DEFAULT 0,
    unattempted_count INTEGER DEFAULT 0,
    accuracy DECIMAL(5,2) DEFAULT 0,
    percentile DECIMAL(5,2) DEFAULT 0,
    rank INTEGER DEFAULT 0,
    total_time INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Responses table
CREATE TABLE IF NOT EXISTS responses (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
    selected_answer VARCHAR(255),
    time_spent INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'not_visited',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(submission_id, question_id)
);

-- Analysis records table
CREATE TABLE IF NOT EXISTS analysis_records (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
    subject VARCHAR(100),
    score DECIMAL(10,2) DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    incorrect_count INTEGER DEFAULT 0,
    time_spent INTEGER DEFAULT 0,
    accuracy DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_questions_test_id ON questions(test_id);
CREATE INDEX IF NOT EXISTS idx_responses_submission_id ON responses(submission_id);
CREATE INDEX IF NOT EXISTS idx_submissions_test_id ON submissions(test_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_crops_pdf_id ON crops(pdf_id);
CREATE INDEX IF NOT EXISTS idx_analysis_submission_id ON analysis_records(submission_id);
CREATE INDEX IF NOT EXISTS idx_percentile_test_id ON percentile_mappings(test_id);

-- Insert default user for testing
INSERT INTO users (name, email, role) 
VALUES ('Test Student', 'student@test.com', 'student')
ON CONFLICT (email) DO NOTHING;

-- Insert a sample test for testing
INSERT INTO tests (name, duration, instructions, is_published) 
VALUES (
    'Sample JEE Mock Test', 
    180, 
    'This is a sample test. Read all questions carefully before answering.', 
    true
)
ON CONFLICT DO NOTHING;
