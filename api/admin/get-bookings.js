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

    // Fetch all booking data from Form Responses sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Form Responses 1!A:P',
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      return res.status(200).json({ bookings: [] });
    }

    const headers = rows[0];
    const bookings = [];

    // Process each row (skip header)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      // Extract booking data
      // A=Timestamp, B=Name, C=Email, D=Phone, E=Slot1, F=Slot2, G=Slot3
      // H=ServiceDescription, I=ReferencePhotos, J=DepositScreenshot
      // K=Notified, L=Token, M=Status, N=AcceptedSlot, O=CalendarEventId, P=ProcessedTimestamp
      const booking = {
        rowIndex: i + 1, // 1-indexed row number for updates
        timestamp: row[0] || '',
        name: row[1] || '',
        email: row[2] || '',
        phone: row[3] || '',
        slot1: row[4] || '',
        slot2: row[5] || '',
        slot3: row[6] || '',
        serviceDescription: row[7] || '',
        referencePhotos: row[8] || '',
        depositScreenshot: row[9] || '',
        notified: row[10] === 'TRUE',
        token: row[11] || '',
        status: row[12] || '',
        acceptedSlot: row[13] || '',
        calendarEventId: row[14] || '',
        processedTimestamp: row[15] || '',
      };

      bookings.push(booking);
    }

    // Sort by timestamp (most recent first)
    bookings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.status(200).json({ bookings });

  } catch (error) {
    console.error('Error fetching bookings:', error);
    return res.status(500).json({
      error: 'Failed to fetch bookings',
      details: error.message,
    });
  }
}
