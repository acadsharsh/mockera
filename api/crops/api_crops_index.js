import { put } from '@vercel/blob';
import { query } from '../lib/db.js';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const { pdfId } = req.query;
      
      let result;
      if (pdfId) {
        result = await query(
          'SELECT * FROM crops WHERE pdf_id = $1 ORDER BY created_at',
          [pdfId]
        );
      } else {
        result = await query('SELECT * FROM crops ORDER BY created_at DESC');
      }
      
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const { imageData, pdfId, pageNumber, cropData } = req.body;

      // Convert base64 to buffer
      const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      const filename = uuidv4() + '.png';

      // Upload to Vercel Blob
      const blob = await put(filename, buffer, {
        access: 'public',
        contentType: 'image/png',
      });

      // Save to database
      const result = await query(
        `INSERT INTO crops (pdf_id, page_number, crop_x, crop_y, crop_width, crop_height, image_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [pdfId, pageNumber, cropData.x, cropData.y, cropData.width, cropData.height, blob.url]
      );

      return res.status(201).json(result[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Crops API error:', error);
    return res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
}
