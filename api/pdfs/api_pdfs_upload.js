import { put } from '@vercel/blob';
import { query } from '../lib/db.js';
import { v4 as uuidv4 } from 'uuid';

export const config = {
  api: {
    bodyParser: false,
  },
};

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
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Parse multipart form data manually (simplified)
    const boundary = req.headers['content-type'].split('boundary=')[1];
    const parts = parseMultipart(buffer, boundary);

    const filePart = parts.find(p => p.filename);
    const pageCountPart = parts.find(p => p.name === 'pageCount');

    if (!filePart) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filename = uuidv4() + '.pdf';
    
    // Upload to Vercel Blob
    const blob = await put(filename, filePart.data, {
      access: 'public',
      contentType: 'application/pdf',
    });

    // Save to database
    const result = await query(
      `INSERT INTO pdfs (original_name, stored_name, file_size, page_count, file_path)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [filePart.filename, filename, filePart.data.length, parseInt(pageCountPart?.value || '0'), blob.url]
    );

    return res.status(201).json(result[0]);
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
}

function parseMultipart(buffer, boundary) {
  const parts = [];
  const boundaryBuffer = Buffer.from('--' + boundary);
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
        // Remove trailing \r\n--
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
