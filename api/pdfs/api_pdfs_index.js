import { query } from '../lib/db.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const result = await query('SELECT * FROM pdfs ORDER BY created_at DESC');
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const { originalName, storedName, fileSize, pageCount, filePath } = req.body;

      const result = await query(
        `INSERT INTO pdfs (original_name, stored_name, file_size, page_count, file_path)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [originalName, storedName, fileSize, pageCount, filePath]
      );

      return res.status(201).json(result[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('PDFs API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
