import { google } from 'googleapis';
import { getSessionFromCookie, verifySessionToken } from '../../utils/auth.js';
import { sendEmail } from '../../utils/email.js';

export default async function handler(req, res) {
  const { action } = req.query;

  if (!action) {
    return res.status(400).json({ error: 'Action parameter is required' });
  }

  // Skip auth for token-based actions (uses token-based auth instead)
  if (action !== 'cancel-with-token' && action !== 'client-cancel') {
    // Verify admin session for all other operations
    const cookieHeader = req.headers.cookie;
    const sessionToken = getSessionFromCookie(cookieHeader);

    if (!sessionToken || !verifySessionToken(sessionToken)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
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
      case 'cancel-with-token':
        return await cancelWithToken(req, res);
      case 'client-cancel':
        return await clientCancel(req, res);
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
        // Parse "HH:MM" format into hour/minute components
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);

        // Create label in 12-hour format
        const period = startHour >= 12 ? 'PM' : 'AM';
        const hour12 = startHour === 0 ? 12 : startHour > 12 ? startHour - 12 : startHour;
        const label = `${String(hour12).padStart(2, '0')}:${String(startMinute).padStart(2, '0')} ${period}`;

        slots.push({
          startHour,
          startMinute,
          endHour,
          endMinute,
          label,
        });
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

  // Fetch all booking data from Booking Form sheet
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Booking Form!A:T',
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
      depositToken: row[16] || '',
      depositDeadline: row[17] || '',
      depositReceivedTimestamp: row[18] || '',
      depositScreenshotUrl: row[19] || '',
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
  const { rowIndex, calendarEventId, clientEmail, clientName, cancellationReason, deleteCalendarEvent } = req.body;

  if (!rowIndex || !clientEmail || !clientName || !cancellationReason) {
    return res.status(400).json({
      error: 'rowIndex, clientEmail, clientName, and cancellationReason are required'
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

  // EDGE CASE 1: Read current status to check if already cancelled (idempotency)
  const currentStatusResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `Booking Form!M${rowIndex}`, // Column M = Status
  });

  const currentStatus = currentStatusResponse.data.values?.[0]?.[0] || '';

  // If already cancelled or denied, return early (idempotent)
  if (currentStatus === 'Cancelled' || currentStatus === 'Denied') {
    return res.status(200).json({
      success: true,
      message: `Booking already ${currentStatus.toLowerCase()}`,
      alreadyProcessed: true,
    });
  }

  // Check if status is cancellable
  const cancellableStatuses = ['pending_deposit', 'confirmed', 'Accepted'];
  if (!cancellableStatuses.includes(currentStatus)) {
    return res.status(400).json({
      error: `Cannot cancel booking with status: ${currentStatus}`,
      currentStatus,
    });
  }

  // EDGE CASE 2: Delete or update the Calendar event based on user choice
  if (calendarEventId) {
    try {
      // Check if event exists first
      await calendar.events.get({
        calendarId,
        eventId: calendarEventId,
      });

      if (deleteCalendarEvent) {
        // DELETE the event to allow others to book this slot
        await calendar.events.delete({
          calendarId,
          eventId: calendarEventId,
        });
        console.log(`Calendar event ${calendarEventId} deleted to allow rebooking`);
      } else {
        // PATCH the event to mark as cancelled but keep slot blocked
        await calendar.events.patch({
          calendarId,
          eventId: calendarEventId,
          requestBody: {
            summary: '[CANCELLED] Hair Appointment',
            description: `This appointment was cancelled by the stylist.\n\nClient: ${clientName}\n\nReason: ${cancellationReason}`,
          },
        });
        console.log(`Calendar event ${calendarEventId} marked as cancelled`);
      }
    } catch (calError) {
      // EDGE CASE 3: Calendar event doesn't exist or can't be updated/deleted
      if (calError.code === 404) {
        console.warn(`Calendar event ${calendarEventId} not found, continuing with sheet update`);
      } else {
        console.error('Error updating/deleting calendar event:', calError);
      }
      // Continue even if calendar operation fails
    }
  }

  // Update the Google Sheet status to "Cancelled"
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Booking Form!M${rowIndex}`, // Column M = Status
    valueInputOption: 'RAW',
    requestBody: {
      values: [['Cancelled']],
    },
  });

  // Send cancellation email to client (self-healing via Email Queue)
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #8B6D7B;">Appointment Cancellation</h2>

      <p>Hi ${clientName},</p>

      <p>We're reaching out with some unfortunate news. We sincerely apologize, but we need to cancel your upcoming hair appointment.</p>

      <p><strong>Reason:</strong> ${cancellationReason}</p>

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
    await sendEmail(auth, {
      from: 'Hair by Dekyi <noreply@hairbydekyi.com>',
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

async function cancelWithToken(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send(`
      <html>
        <body>
          <h1>Invalid Request</h1>
          <p>Missing token parameter.</p>
        </body>
      </html>
    `);
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

  // Read all rows to find the matching token
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Booking Form!A:T',
  });

  const rows = response.data.values;
  if (!rows || rows.length <= 1) {
    return res.status(404).send(`
      <html>
        <body>
          <h1>Booking Not Found</h1>
          <p>No booking found with this token.</p>
        </body>
      </html>
    `);
  }

  // Find the row with matching deposit token (Column Q = index 16)
  let matchingRowIndex = -1;
  let bookingData = null;

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][16] === token) {
      matchingRowIndex = i;
      bookingData = rows[i];
      break;
    }
  }

  if (!bookingData) {
    return res.status(404).send(`
      <html>
        <body>
          <h1>Booking Not Found</h1>
          <p>Invalid or expired token.</p>
        </body>
      </html>
    `);
  }

  const name = bookingData[1] || '';
  const email = bookingData[2] || '';
  const status = bookingData[12] || '';
  const calendarEventId = bookingData[14] || '';

  // EDGE CASE 1: Check if already cancelled (idempotency)
  if (status === 'Cancelled' || status === 'Denied') {
    return res.status(200).send(`
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
            h1 { color: #8B6D7B; }
          </style>
        </head>
        <body>
          <h1>Booking Already ${status}</h1>
          <p>This appointment has already been ${status.toLowerCase()}.</p>
          <p><strong>Client:</strong> ${name}</p>
        </body>
      </html>
    `);
  }

  // Check if status is cancellable
  const cancellableStatuses = ['pending_deposit', 'confirmed', 'Accepted'];
  if (!cancellableStatuses.includes(status)) {
    return res.status(400).send(`
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
            }
            h1 { color: #8B6D7B; }
          </style>
        </head>
        <body>
          <h1>Cannot Cancel Booking</h1>
          <p>This booking cannot be cancelled because it has status: ${status}</p>
          <p><strong>Client:</strong> ${name}</p>
        </body>
      </html>
    `);
  }

  // Handle GET request - show form
  if (req.method === 'GET') {
    return res.status(200).send(`
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
            }
            h1 { color: #8B6D7B; }
            .form-group {
              margin: 20px 0;
            }
            label {
              display: block;
              margin-bottom: 8px;
              font-weight: bold;
            }
            textarea {
              width: 100%;
              min-height: 100px;
              padding: 10px;
              border: 1px solid #ddd;
              border-radius: 4px;
              font-family: Arial, sans-serif;
              font-size: 14px;
            }
            .radio-group {
              margin: 15px 0;
            }
            .radio-option {
              margin: 10px 0;
              padding: 12px;
              border: 2px solid #ddd;
              border-radius: 6px;
              cursor: pointer;
              transition: all 0.2s;
            }
            .radio-option:hover {
              border-color: #8B6D7B;
              background-color: #f9f9f9;
            }
            .radio-option input[type="radio"] {
              margin-right: 10px;
            }
            .radio-option label {
              cursor: pointer;
              margin: 0;
              font-weight: normal;
            }
            .radio-description {
              margin-left: 28px;
              color: #666;
              font-size: 13px;
            }
            button {
              background-color: #8B6D7B;
              color: white;
              padding: 12px 24px;
              border: none;
              border-radius: 6px;
              font-size: 16px;
              cursor: pointer;
              font-weight: bold;
            }
            button:hover {
              background-color: #6d5560;
            }
            .info {
              background-color: #f5f5f5;
              padding: 15px;
              border-radius: 6px;
              margin-bottom: 20px;
            }
          </style>
        </head>
        <body>
          <h1>Cancel Appointment</h1>

          <div class="info">
            <p><strong>Client:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Status:</strong> ${status}</p>
          </div>

          <form method="POST">
            <input type="hidden" name="token" value="${token}">
            <div class="form-group">
              <label for="reason">Cancellation Reason:</label>
              <textarea
                id="reason"
                name="cancellationReason"
                required
                placeholder="Enter the reason for cancelling this appointment..."
              ></textarea>
            </div>

            <div class="form-group">
              <label>What should happen to this time slot?</label>
              <div class="radio-group">
                <div class="radio-option">
                  <input type="radio" id="delete" name="slotAvailability" value="delete" checked>
                  <label for="delete">Let others book in this slot</label>
                  <div class="radio-description">Calendar event will be deleted, slot becomes available</div>
                </div>
                <div class="radio-option">
                  <input type="radio" id="keep" name="slotAvailability" value="keep">
                  <label for="keep">Keep slot blocked</label>
                  <div class="radio-description">Calendar event marked as cancelled, slot stays unavailable</div>
                </div>
              </div>
            </div>

            <button type="submit">Cancel Appointment</button>
          </form>
        </body>
      </html>
    `);
  }

  // Handle POST request - process cancellation
  if (req.method === 'POST') {
    let body = '';

    await new Promise((resolve) => {
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', resolve);
    });

    const params = new URLSearchParams(body);
    const cancellationReason = params.get('cancellationReason');
    const slotAvailability = params.get('slotAvailability'); // 'delete' or 'keep'

    if (!cancellationReason || cancellationReason.trim() === '') {
      return res.status(400).send(`
        <html>
          <body>
            <h1>Error</h1>
            <p>Cancellation reason is required.</p>
            <a href="?token=${token}">Go back</a>
          </body>
        </html>
      `);
    }

    const rowNumber = matchingRowIndex + 1;
    const deleteCalendarEvent = slotAvailability === 'delete';

    // EDGE CASE 4: Re-check status in case of race condition (double-click, multiple tabs)
    const currentStatusResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `Booking Form!M${rowNumber}`, // Column M = Status
    });

    const currentStatus = currentStatusResponse.data.values?.[0]?.[0] || '';

    // If already cancelled or denied, return early (race condition prevented)
    if (currentStatus === 'Cancelled' || currentStatus === 'Denied') {
      return res.status(200).send(`
        <html>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                max-width: 600px;
                margin: 50px auto;
                padding: 20px;
                text-align: center;
              }
              h1 { color: #8B6D7B; }
            </style>
          </head>
          <body>
            <h1>Booking Already ${currentStatus}</h1>
            <p>This appointment has already been ${currentStatus.toLowerCase()}.</p>
            <p><strong>Client:</strong> ${name}</p>
          </body>
        </html>
      `);
    }

    // EDGE CASE 2: Delete or update the Calendar event based on user choice
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    if (calendarEventId) {
      try {
        // Check if event exists first
        await calendar.events.get({
          calendarId,
          eventId: calendarEventId,
        });

        if (deleteCalendarEvent) {
          // DELETE the event to allow others to book this slot
          await calendar.events.delete({
            calendarId,
            eventId: calendarEventId,
          });
          console.log(`Calendar event ${calendarEventId} deleted to allow rebooking`);
        } else {
          // PATCH the event to mark as cancelled but keep slot blocked
          await calendar.events.patch({
            calendarId,
            eventId: calendarEventId,
            requestBody: {
              summary: '[CANCELLED] Hair Appointment',
              description: `This appointment was cancelled by the stylist.\n\nClient: ${name}\n\nReason: ${cancellationReason}`,
            },
          });
          console.log(`Calendar event ${calendarEventId} marked as cancelled`);
        }
      } catch (calError) {
        // EDGE CASE 3: Calendar event doesn't exist or can't be updated/deleted
        if (calError.code === 404) {
          console.warn(`Calendar event ${calendarEventId} not found, continuing with sheet update`);
        } else {
          console.error('Error updating/deleting calendar event:', calError);
        }
        // Continue even if calendar operation fails
      }
    }

    // Update the Google Sheet status to "Cancelled"
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Booking Form!M${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Cancelled']],
      },
    });

    // Send cancellation email to client (self-healing via Email Queue)
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #8B6D7B;">Appointment Cancellation</h2>

        <p>Hi ${name},</p>

        <p>We're reaching out with some unfortunate news. We sincerely apologize, but we need to cancel your upcoming hair appointment.</p>

        <p><strong>Reason:</strong> ${cancellationReason}</p>

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
      await sendEmail(auth, {
        from: 'Hair by Dekyi <noreply@hairbydekyi.com>',
        to: email,
        subject: 'Appointment Cancellation - We\'re Sorry',
        html: emailHtml,
      });
    } catch (emailError) {
      console.error('Error sending cancellation email:', emailError);
    }

    return res.status(200).send(`
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
            h1 { color: #A8BDA8; }
            .success { color: #6d5560; }
          </style>
        </head>
        <body>
          <h1>✓ Appointment Cancelled</h1>
          <p class="success">The appointment for ${name} has been cancelled and they have been notified via email.</p>
          <p>Reason: ${cancellationReason}</p>
        </body>
      </html>
    `);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function clientCancel(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send(`
      <html>
        <body>
          <h1>Invalid Request</h1>
          <p>Missing token parameter.</p>
        </body>
      </html>
    `);
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

  // Read all rows to find the matching deposit token
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Booking Form!A:T',
  });

  const rows = response.data.values;
  if (!rows || rows.length <= 1) {
    return res.status(404).send(`
      <html>
        <body>
          <h1>Booking Not Found</h1>
          <p>No booking found with this token.</p>
        </body>
      </html>
    `);
  }

  // Find the row with matching deposit token (Column Q = index 16)
  let matchingRowIndex = -1;
  let bookingData = null;

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][16] === token) {
      matchingRowIndex = i;
      bookingData = rows[i];
      break;
    }
  }

  if (!bookingData) {
    return res.status(404).send(`
      <html>
        <body>
          <h1>Booking Not Found</h1>
          <p>Invalid or expired token.</p>
        </body>
      </html>
    `);
  }

  const name = bookingData[1] || '';
  const email = bookingData[2] || '';
  const phone = bookingData[3] || '';
  const status = bookingData[12] || '';
  const acceptedSlot = bookingData[13] || '';
  const calendarEventId = bookingData[14] || '';

  // Get the actual slot time (not "Slot 1")
  const slots = [
    bookingData[4] || '',
    bookingData[5] || '',
    bookingData[6] || '',
  ];
  const slotNumber = parseInt(acceptedSlot.replace('Slot ', '')) - 1;
  const selectedSlot = slots[slotNumber] || acceptedSlot;

  // Check if already cancelled (idempotency)
  if (status === 'Cancelled' || status === 'Denied') {
    return res.status(200).send(`
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
            h1 { color: #8B6D7B; }
          </style>
        </head>
        <body>
          <h1>Appointment Already Cancelled</h1>
          <p>This appointment has already been cancelled.</p>
          <p><strong>Client:</strong> ${name}</p>
        </body>
      </html>
    `);
  }

  // Check if status is cancellable
  const cancellableStatuses = ['pending_deposit', 'confirmed', 'Accepted'];
  if (!cancellableStatuses.includes(status)) {
    return res.status(400).send(`
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
            }
            h1 { color: #8B6D7B; }
          </style>
        </head>
        <body>
          <h1>Cannot Cancel Booking</h1>
          <p>This booking cannot be cancelled because it has status: ${status}</p>
          <p>Please contact us directly at hairbydekyi@gmail.com</p>
        </body>
      </html>
    `);
  }

  // Handle GET request - show confirmation form
  if (req.method === 'GET') {
    return res.status(200).send(`
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            html, body {
              background-color: #F5F1ED;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              color: #5A4A41;
              margin: 0;
              padding: 40px 20px;
              min-height: 100vh;
              box-sizing: border-box;
              line-height: 1.6;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background-color: #FEFCFA;
              border: 1px solid #E8DFD8;
              border-radius: 12px;
              padding: 32px;
              box-shadow: 0 4px 24px rgba(122, 106, 97, 0.10);
            }
            h1 {
              font-family: Georgia, 'Times New Roman', serif;
              color: #8B6D7B;
              font-size: 1.8rem;
              margin: 0 0 20px;
            }
            .warning {
              background-color: #F8D7DA;
              border: 1px solid #E4B7BC;
              color: #5A4A41;
              padding: 16px 18px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .warning p { margin: 0 0 8px; }
            .warning p:last-child { margin-bottom: 0; }
            .form-group {
              margin: 24px 0;
            }
            label {
              display: block;
              margin-bottom: 8px;
              font-weight: 600;
              color: #7A6A61;
            }
            textarea {
              width: 100%;
              min-height: 100px;
              padding: 12px;
              border: 1px solid #E8DFD8;
              border-radius: 8px;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              font-size: 14px;
              color: #5A4A41;
              background-color: #FFFFFF;
              box-sizing: border-box;
              resize: vertical;
            }
            textarea:focus {
              outline: none;
              border-color: #8B6D7B;
            }
            button {
              background-color: #8B6D7B;
              color: #FFFFFF;
              padding: 14px 28px;
              border: none;
              border-radius: 8px;
              font-size: 16px;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              cursor: pointer;
              font-weight: 600;
              width: 100%;
            }
            button:hover {
              background-color: #785d69;
            }
            .back-link {
              text-align: center;
              margin-top: 24px;
            }
            .back-link a {
              color: #8B6D7B;
              text-decoration: none;
              font-weight: 500;
            }
            .back-link a:hover {
              text-decoration: underline;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Cancel Your Appointment</h1>

            <div class="warning">
              <p><strong>⚠️ Are you sure you want to cancel?</strong></p>
              <p>This action cannot be undone. Your $5 deposit is non-refundable.</p>
              <p><strong>Note:</strong> If you're cancelling to reschedule, your $5 deposit can be used again when you rebook. It's only non-refundable if you're cancelling without rebooking.</p>
            </div>

            <form method="POST">
              <input type="hidden" name="token" value="${token}">
              <div class="form-group">
                <label for="reason">Please tell us why you're cancelling (optional):</label>
                <textarea
                  id="reason"
                  name="cancellationReason"
                  placeholder="We'd appreciate knowing why you need to cancel..."
                ></textarea>
              </div>
              <button type="submit">Yes, Cancel My Appointment</button>
            </form>

            <p class="back-link">
              <a href="https://www.hairbydekyi.com">← Back to website</a>
            </p>
          </div>
        </body>
      </html>
    `);
  }

  // Handle POST request - process cancellation
  if (req.method === 'POST') {
    let body = '';

    await new Promise((resolve) => {
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', resolve);
    });

    const params = new URLSearchParams(body);
    const cancellationReason = params.get('cancellationReason') || 'No reason provided';

    const rowNumber = matchingRowIndex + 1;

    // Re-check status in case of race condition
    const currentStatusResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `Booking Form!M${rowNumber}`,
    });

    const currentStatus = currentStatusResponse.data.values?.[0]?.[0] || '';

    if (currentStatus === 'Cancelled' || currentStatus === 'Denied') {
      return res.status(200).send(`
        <html>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                max-width: 600px;
                margin: 50px auto;
                padding: 20px;
                text-align: center;
              }
              h1 { color: #8B6D7B; }
            </style>
          </head>
          <body>
            <h1>Already Cancelled</h1>
            <p>This appointment has already been cancelled.</p>
          </body>
        </html>
      `);
    }

    // ALWAYS DELETE the calendar event for client cancellations
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    if (calendarEventId) {
      try {
        await calendar.events.delete({
          calendarId,
          eventId: calendarEventId,
        });
        console.log(`Calendar event ${calendarEventId} deleted (client cancellation)`);
      } catch (calError) {
        if (calError.code === 404) {
          console.warn(`Calendar event ${calendarEventId} not found`);
        } else {
          console.error('Error deleting calendar event:', calError);
        }
      }
    }

    // Update the Google Sheet status to "Cancelled"
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Booking Form!M${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Cancelled']],
      },
    });

    // Send notification email to DEKYI (self-healing via Email Queue)
    await sendEmail(auth, {
      from: 'Hair by Dekyi <noreply@hairbydekyi.com>',
      to: 'hairbydekyi@gmail.com',
      subject: `Client Cancellation: ${name} - ${selectedSlot}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2c2c2c;">
          <h2 style="color: #c9302c; margin-bottom: 20px;">Client Cancelled Appointment</h2>

          <p style="color: #2c2c2c; line-height: 1.6;">${name} has cancelled their upcoming appointment.</p>

          <h3 style="color: #7a5566; margin-top: 25px; margin-bottom: 10px;">Appointment Details:</h3>
          <ul style="color: #2c2c2c; line-height: 1.8;">
            <li><strong>Client:</strong> ${name}</li>
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Phone:</strong> ${phone}</li>
            <li><strong>Date & Time:</strong> ${selectedSlot}</li>
          </ul>

          <h3 style="color: #7a5566; margin-top: 25px; margin-bottom: 10px;">Cancellation Details:</h3>
          <p style="color: #2c2c2c; line-height: 1.6;"><strong>Reason:</strong> ${cancellationReason}</p>
          <p style="color: #2c2c2c; line-height: 1.6;"><strong>Cancelled at:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/Toronto' })}</p>

          <hr style="border: none; border-top: 1px solid #cccccc; margin: 30px 0;">

          <p style="font-size: 12px; color: #666666; line-height: 1.5;">
            The calendar event has been deleted and this time slot is now available for others to book.
          </p>
        </div>
      `,
    });

    // Send confirmation email to client
    await sendEmail(auth, {
      from: 'Hair by Dekyi <noreply@hairbydekyi.com>',
      to: email,
      subject: 'Appointment Cancelled',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2c2c2c;">
          <h2 style="color: #7a5566; margin-bottom: 20px;">Appointment Cancelled</h2>

          <p style="color: #2c2c2c; line-height: 1.6;">Hi ${name},</p>

          <p style="color: #2c2c2c; line-height: 1.6;">Your appointment for <strong>${selectedSlot}</strong> has been cancelled as requested.</p>

          <p style="color: #2c2c2c; line-height: 1.6;">We're sorry we won't be seeing you this time! If you'd like to reschedule in the future, you're always welcome to book again at <a href="https://www.hairbydekyi.com" style="color: #7a5566; text-decoration: underline;">www.hairbydekyi.com</a></p>

          <p style="color: #2c2c2c; line-height: 1.6;">If you have any questions, feel free to reach out to us at <a href="mailto:hairbydekyi@gmail.com" style="color: #7a5566; text-decoration: underline;">hairbydekyi@gmail.com</a> or DM <a href="https://www.instagram.com/hairbydekyi/" style="color: #7a5566; text-decoration: underline;">@hairbydekyi</a> on Instagram.</p>

          <p style="margin-top: 30px; color: #2c2c2c; line-height: 1.6;">
            Take care,<br>
            <strong>Dekyi</strong><br>
            Hair by Dekyi
          </p>
        </div>
      `,
    });

    return res.status(200).send(`
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            html, body {
              background-color: #F5F1ED;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              color: #5A4A41;
              margin: 0;
              padding: 40px 20px;
              min-height: 100vh;
              box-sizing: border-box;
              line-height: 1.6;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background-color: #FEFCFA;
              border: 1px solid #E8DFD8;
              border-radius: 12px;
              padding: 40px 32px;
              box-shadow: 0 4px 24px rgba(122, 106, 97, 0.10);
              text-align: center;
            }
            h1 {
              font-family: Georgia, 'Times New Roman', serif;
              color: #A8BDA8;
              font-size: 1.8rem;
              margin: 0 0 16px;
            }
            .success { color: #7A6A61; }
            .back-link a {
              color: #8B6D7B;
              font-weight: 600;
              text-decoration: none;
            }
            .back-link a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✓ Appointment Cancelled</h1>
            <p class="success">Your appointment has been cancelled.</p>
            <p>You should receive a confirmation email shortly.</p>
            <p class="back-link" style="margin-top: 30px;">
              <a href="https://www.hairbydekyi.com">← Back to website</a>
            </p>
          </div>
        </body>
      </html>
    `);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
