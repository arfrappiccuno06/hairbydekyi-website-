import { google } from 'googleapis';
import { getSessionFromCookie, verifySessionToken } from '../../utils/auth.js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify admin session
    const cookieHeader = req.headers.cookie;
    const sessionToken = getSessionFromCookie(cookieHeader);

    if (!sessionToken || !verifySessionToken(sessionToken)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get date and slots from request body
    const { date, slots } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    if (!Array.isArray(slots)) {
      return res.status(400).json({ error: 'Slots must be an array' });
    }

    // Validate slots format
    for (const slot of slots) {
      if (!slot.startTime || !slot.endTime) {
        return res.status(400).json({ error: 'Each slot must have startTime and endTime' });
      }
    }

    // Authenticate with Google
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8')
    );

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || '1mNaPRaHr_HwFVY-Szxak-QCZwWDJ-BWO0E4tBc1f-NA';

    // First, read the schedule to find if the date already exists
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Schedule!A:P',
    });

    const rows = response.data.values || [];
    let rowIndex = -1;

    // Find existing row for this date
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === date) {
        rowIndex = i + 1; // +1 because spreadsheet rows are 1-indexed
        break;
      }
    }

    // Prepare row data
    const dayOfWeek = date.startsWith('DEFAULT_') ? date.split('_')[1] : getDayOfWeek(date);
    const rowData = [date, dayOfWeek];

    // Add up to 7 slots (14 columns: start + end for each)
    for (let i = 0; i < 7; i++) {
      if (i < slots.length) {
        rowData.push(slots[i].startTime, slots[i].endTime);
      } else {
        rowData.push('', ''); // Empty cells for unused slots
      }
    }

    if (rowIndex === -1) {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Schedule!A:P',
        valueInputOption: 'RAW',
        requestBody: {
          values: [rowData],
        },
      });
    } else {
      // Update existing row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Schedule!A${rowIndex}:P${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [rowData],
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Schedule updated successfully',
      date,
      slots,
    });

  } catch (error) {
    console.error('Error updating schedule:', error);
    return res.status(500).json({
      error: 'Failed to update schedule',
      details: error.message,
    });
  }
}

// Helper function to get day of week from date string
function getDayOfWeek(dateString) {
  const date = new Date(dateString + 'T00:00:00');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}
