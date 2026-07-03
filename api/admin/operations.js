import { google } from 'googleapis';
import { Resend } from 'resend';
import { getSessionFromCookie, verifySessionToken } from '../../utils/auth.js';

export default async function handler(req, res) {
  const { action } = req.query;

  if (!action) {
    return res.status(400).json({ error: 'Action parameter is required' });
  }

  // Verify admin session for all operations
  const cookieHeader = req.headers.cookie;
  const sessionToken = getSessionFromCookie(cookieHeader);

  if (!sessionToken || !verifySessionToken(sessionToken)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    switch (action) {
      case 'get-schedule':
        return await getSchedule(req, res);
      case 'update-schedule':
        return await updateSchedule(req, res);
      case 'get-bookings':
        return await getBookings(req, res);
      case 'cancel-booking':
        return await cancelBooking(req, res);
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Admin operations error:', error);
    return res.status(500).json({
      error: 'Operation failed',
      details: error.message,
    });
  }
}

async function getSchedule(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
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
}

async function updateSchedule(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
}

async function getBookings(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
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

  const bookings = [];

  // Process each row (skip header)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    // Extract booking data
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
}

async function cancelBooking(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get booking details from request body
  const { rowIndex, calendarEventId, clientEmail, clientName } = req.body;

  if (!rowIndex || !clientEmail || !clientName) {
    return res.status(400).json({
      error: 'rowIndex, clientEmail, and clientName are required'
    });
  }

  // Authenticate with Google
  const credentials = JSON.parse(
    Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8')
  );

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/calendar',
    ],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const calendar = google.calendar({ version: 'v3', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || '1mNaPRaHr_HwFVY-Szxak-QCZwWDJ-BWO0E4tBc1f-NA';
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

  // Update the Calendar event (mark as cancelled but keep it)
  if (calendarEventId) {
    try {
      await calendar.events.patch({
        calendarId,
        eventId: calendarEventId,
        requestBody: {
          summary: '[CANCELLED] Hair Appointment',
          description: `This appointment was cancelled by the stylist.\n\nClient: ${clientName}`,
        },
      });
    } catch (calError) {
      console.error('Error updating calendar event:', calError);
      // Continue even if calendar update fails
    }
  }

  // Update the Google Sheet status to "Cancelled"
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Form Responses 1!M${rowIndex}`, // Column M = Status
    valueInputOption: 'RAW',
    requestBody: {
      values: [['Cancelled']],
    },
  });

  // Send cancellation email to client
  const resend = new Resend(process.env.RESEND_API_KEY);

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #8B6D7B;">Appointment Cancellation</h2>

      <p>Hi ${clientName},</p>

      <p>We're reaching out with some unfortunate news. We sincerely apologize, but we need to cancel your upcoming hair appointment.</p>

      <p>We understand how disappointing this can be, especially when you've been looking forward to your appointment. Please know this decision wasn't made lightly.</p>

      <h3 style="color: #A8BDA8;">What's Next?</h3>

      <p>We'd love to reschedule with you at a time that works better. You have two options:</p>

      <ul>
        <li><strong>Book online:</strong> Visit <a href="https://www.hairbydekyi.com" style="color: #8B6D7B;">www.hairbydekyi.com</a> to see our available time slots</li>
        <li><strong>Message us on Instagram:</strong> <a href="https://instagram.com/hairbydekyi" style="color: #8B6D7B;">@hairbydekyi</a> - we're happy to help you find the perfect time</li>
      </ul>

      <p>Again, we deeply apologize for any inconvenience this may have caused. We truly value you as a client and hope to see you soon!</p>

      <p style="margin-top: 30px;">
        Warmly,<br>
        <strong>Dekyi</strong><br>
        Hair by Dekyi
      </p>

      <hr style="border: none; border-top: 1px solid #E8DFD8; margin: 30px 0;">

      <p style="font-size: 12px; color: #7A6A61;">
        If you have any questions or concerns, please don't hesitate to reach out via Instagram DM.
      </p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: 'Hair by Dekyi <onboarding@resend.dev>',
      to: clientEmail,
      subject: 'Appointment Cancellation - We\'re Sorry',
      html: emailHtml,
    });
  } catch (emailError) {
    console.error('Error sending cancellation email:', emailError);
    // Return success even if email fails, since Sheet was updated
    return res.status(200).json({
      success: true,
      message: 'Booking cancelled but email failed to send',
      emailError: emailError.message,
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Booking cancelled and client notified',
  });
}

// Helper function to get day of week from date string
function getDayOfWeek(dateString) {
  const date = new Date(dateString + 'T00:00:00');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}
