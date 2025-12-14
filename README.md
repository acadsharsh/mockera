# JEE Mock Test Platform

A production-grade JEE Mock Test Platform with PDF upload, manual question cropping, test creation, and detailed analysis.

## Features

### Creator Portal
- **PDF Upload**: Upload question paper PDFs with progress tracking
- **PDF Cropper**: Canvas-based manual cropping with zoom and navigation
- **Question Editor**: Two-column layout with image preview and form
- **Test Settings**: Create tests with duration, instructions, and percentile mapping

### Student Portal
- **Test List**: Table view of available tests
- **Attempt Test**: Exam-like interface with timer, question palette, and navigation
- **Results**: Card-based summary with score, accuracy, rank, and percentile
- **Analysis Dashboard**: 7-section detailed analysis with sidebar navigation

## Tech Stack

- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **PDF Rendering**: PDF.js
- **File Upload**: Multer

## Prerequisites

- Node.js 16+ 
- PostgreSQL 12+
- npm or yarn

## Installation

### 1. Clone and Install Dependencies

```bash
npm install
```

### 2. Database Setup

Create the database:
```bash
psql -U postgres -c "CREATE DATABASE jee_mock_test;"
```

Run the schema:
```bash
psql -U postgres -d jee_mock_test -f schema.sql
```

### 3. Configure Environment (Optional)

Create a `.env` file or set environment variables:

```env
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_NAME=jee_mock_test
DB_PORT=5432
PORT=3000
```

### 4. Start the Server

```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

### 5. Open in Browser

Navigate to `http://localhost:3000`

## Project Structure

```
├── index.html           # Home page with navigation
├── upload-pdf.html      # PDF upload page
├── pdf-cropper.html     # PDF viewer with cropping tools
├── question-editor.html # Question details form
├── test-settings.html   # Test configuration
├── test-list.html       # Student test list
├── attempt-test.html    # Exam interface
├── result.html          # Test results
├── analysis.html        # Detailed analysis dashboard
├── server.js            # Express backend
├── schema.sql           # PostgreSQL schema
├── package.json         # Node dependencies
└── uploads/             # Uploaded files (auto-created)
    ├── pdfs/            # Original PDFs
    └── crops/           # Cropped question images
```

## Database Schema

### Tables

- **users** - Student and creator accounts
- **pdfs** - Uploaded PDF metadata
- **tests** - Test configuration
- **crops** - Cropped question images
- **questions** - Question details and answers
- **percentile_mappings** - Score to percentile mapping
- **submissions** - Test attempts
- **responses** - Student answers
- **analysis_records** - Subject-wise analysis data

## API Endpoints

### PDFs
- `POST /api/pdfs/upload` - Upload PDF
- `GET /api/pdfs` - List all PDFs
- `GET /api/pdfs/:id` - Get PDF details

### Crops
- `POST /api/crops/upload` - Save cropped image
- `GET /api/crops/pdf/:pdfId` - Get crops for PDF

### Questions
- `POST /api/questions` - Create question
- `GET /api/questions/test/:testId` - Get test questions
- `PUT /api/questions/:id` - Update question

### Tests
- `POST /api/tests` - Create test
- `GET /api/tests` - List all tests
- `PUT /api/tests/:id` - Update test

### Submissions
- `POST /api/submissions/start` - Start test attempt
- `POST /api/responses` - Save response
- `POST /api/submissions/:id/submit` - Submit test
- `GET /api/submissions/:id` - Get result

### Analysis
- `GET /api/analysis/:submissionId` - Get detailed analysis

## Usage Guide

### Creating a Test

1. **Upload PDF**: Go to Upload PDF page and upload a question paper
2. **Crop Questions**: Use the PDF Cropper to select and crop individual questions
3. **Add Details**: Fill in subject, type, options, and correct answers
4. **Configure Test**: Set test name, duration, and percentile mapping
5. **Publish**: Save and publish the test

### Taking a Test

1. **Select Test**: Choose from available tests
2. **Start**: Read instructions and begin
3. **Answer**: Navigate between questions using palette or buttons
4. **Submit**: Review and submit the test
5. **View Results**: See score and detailed analysis

## Page Layouts

### Exam Interface (attempt-test.html)
- Fixed top bar with test name and timer
- Left column: Question image and options
- Right column: Question palette (color-coded)
- Fixed bottom bar with action buttons

### Analysis Dashboard (analysis.html)
- Left sidebar with section links
- Main content area with cards and tables
- Sections: Overview, Subject, Attempt, Time, Difficulty, Questions, Mistakes

## Color Coding (Question Palette)

- **Grey**: Not visited
- **Red**: Visited, not answered
- **Green**: Answered
- **Purple**: Marked for review

## Notes

- Card-based UI is used only in Result and Analysis pages
- All other pages use plain, functional layouts
- No animations or gamification elements
- Focus on readability and exam-focused design

## Troubleshooting

### Database Connection Error
- Ensure PostgreSQL is running
- Check database credentials
- Verify database exists

### PDF Loading Issues
- Ensure PDF is valid
- Check file size (max 50MB)
- Verify uploads directory exists

### Crops Not Saving
- Check uploads/crops directory permissions
- Verify server is running

## License

MIT
