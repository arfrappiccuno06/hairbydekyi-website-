import { google } from 'googleapis';
import { getSessionFromCookie, verifySessionToken } from '../../utils/auth.js';

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify admin session
    const cookieHeader = req.headers.cookie;
    const sessionToken = getSessionFromCookie(cookieHeader);

    if (!sessionToken || !verifySessionToken(sessionToken)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get optional date range parameters
    const { startDate, endDate } = req.query;

    // Authenticate with Google
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8')
    );

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || '1mNaPRaHr_HwFVY-Szxak-QCZwWDJ-BWO0E4tBc1f-NA';

    // Fetch all schedule data from Schedule sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Schedule!A:P',
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      return res.status(200).json({ schedule: {} });
    }

    // Parse the schedule
    const schedule = {};
    const headers = rows[0];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const date = row[0];

      if (!date) continue;

      const slots = [];

      // Parse slot columns (C through P = Slot1_Start through Slot7_End)
      for (let slotNum = 1; slotNum <= 7; slotNum++) {
        const startColIndex = 2 + (slotNum - 1) * 2;
        const endColIndex = startColIndex + 1;

        const startTime = row[startColIndex];
        const endTime = row[endColIndex];

        if (startTime && endTime) {
          slots.push({ startTime, endTime });
        }
      }

      schedule[date] = slots;
    }

    return res.status(200).json({ schedule });

  } catch (error) {
    console.error('Error fetching schedule:', error);
    return res.status(500).json({
      error: 'Failed to fetch schedule',
      details: error.message,
    });
  }
}
