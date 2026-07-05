import { google } from 'googleapis';
import { Resend } from 'resend';
import { fetchSchedule, findSlotByTime } from '../utils/schedule.js';
import { generateToken } from '../utils/tokens.js';

export default async function handler(req, res) {
  try {
    // Parse query parameters
    const { token, slot } = req.query;

    if (!token || slot === undefined) {
      return res.status(400).send(`
        <html>
          <body>
            <h1>Invalid Request</h1>
            <p>Missing token or slot parameter.</p>
          </body>
        </html>
      `);
    }

    const slotIndex = parseInt(slot, 10);
    if (![0, 1, 2].includes(slotIndex)) {
      return res.status(400).send(`
        <html>
          <body>
            <h1>Invalid Slot</h1>
            <p>Slot must be 0, 1, or 2.</p>
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
    const spreadsheetId = '1mNaPRaHr_HwFVY-Szxak-QCZwWDJ-BWO0E4tBc1f-NA';

    // Fetch schedule configuration for dynamic slot durations
    const schedule = await fetchSchedule(auth);

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

    // Find the row with matching token (Column L = index 11)
    let matchingRowIndex = -1;
    let bookingData = null;

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][11] === token) {
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

    // Extract booking details
    const name = bookingData[1] || '';
    const email = bookingData[2] || '';
    const phone = bookingData[3] || '';
    const slots = [
      bookingData[4] || '', // Slot 1
      bookingData[5] || '', // Slot 2
      bookingData[6] || '', // Slot 3
    ];
    const serviceDescription = bookingData[7] || ''; // Column H
    const referencePhotos = bookingData[8] || ''; // Column I
    const status = bookingData[12] || ''; // Column M

    // Idempotency check
    if (status !== 'pending_acceptance') {
      return res.status(200).send(`
        <html>
          <body>
            <h1>Booking Already Processed</h1>
            <p>This booking has already been ${status.toLowerCase().replace('_', ' ')}.</p>
            <p><strong>Client:</strong> ${name}</p>
            <p><strong>Status:</strong> ${status}</p>
          </body>
        </html>
      `);
    }

    // Get the selected slot
    const selectedSlot = slots[slotIndex];
    if (!selectedSlot) {
      return res.status(400).send(`
        <html>
          <body>
            <h1>Invalid Slot</h1>
            <p>The selected slot is empty.</p>
          </body>
        </html>
      `);
    }

    // Parse slot string to extract date and time
    // Expected format: "Monday, June 16 at 09:00 AM" or similar
    const slotParsed = parseSlotString(selectedSlot, schedule);
    if (!slotParsed) {
      return res.status(400).send(`
        <html>
          <body>
            <h1>Error</h1>
            <p>Could not parse slot time: ${selectedSlot}</p>
          </body>
        </html>
      `);
    }

    const { startDateTime, endDateTime } = slotParsed;

    // Race condition check: Verify slot is still available in Calendar
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: startDateTime,
        timeMax: endDateTime,
        timeZone: 'America/Toronto',
        items: [{ id: calendarId }],
      },
    });

    const busySlots = freeBusy.data.calendars[calendarId].busy || [];
    const isSlotTaken = busySlots.length > 0;

    if (isSlotTaken) {
      // Slot is already booked - show error with alternative slots
      const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
      const alternativeLinks = [];

      for (let i = 0; i < 3; i++) {
        if (i !== slotIndex && slots[i]) {
          alternativeLinks.push(`
            <p><strong>Slot ${i + 1}:</strong> ${slots[i]}<br>
            <a href="${baseUrl}/api/accept-booking?token=${token}&slot=${i}">Accept Slot ${i + 1}</a></p>
          `);
        }
      }

      // Update status to Conflict
      const rowNumber = matchingRowIndex + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Booking Form!M${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Conflict']],
        },
      });

      return res.status(409).send(`
        <html>
          <body>
            <h1>Slot Already Booked</h1>
            <p>Unfortunately, this time slot was just booked by someone else.</p>
            ${alternativeLinks.length > 0 ? `
              <h2>Try one of these alternative slots:</h2>
              ${alternativeLinks.join('')}
            ` : '<p>No alternative slots available. Please contact the client.</p>'}
          </body>
        </html>
      `);
    }

    // Create TEMPORARY Calendar event (24-hour hold)
    const descriptionParts = [
      `TEMPORARY HOLD - PENDING DEPOSIT`,
      `Client: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      `\nService Description: ${serviceDescription}`,
      `\nReference Photos: ${referencePhotos || 'NOT PROVIDED'}`,
      `\nDeposit deadline: 24 hours from acceptance`,
    ];

    const tempEvent = {
      summary: `HOLD: ${name}`,
      description: descriptionParts.join('\n'),
      start: {
        dateTime: startDateTime,
        timeZone: 'America/Toronto',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/Toronto',
      },
      colorId: '11', // Red color to indicate it's temporary
    };

    const createdTempEvent = await calendar.events.insert({
      calendarId,
      requestBody: tempEvent,
    });

    const tempEventId = createdTempEvent.data.id;

    // Generate deposit token
    const depositToken = generateToken();

    // Calculate deposit deadline (24 hours from now)
    const now = new Date();
    const depositDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Get deposit form entry ID from env (you'll need to add this)
    const depositFormUrl = process.env.DEPOSIT_FORM_URL || 'https://docs.google.com/forms/d/e/YOUR_FORM_ID/viewform';
    const depositTokenEntryId = process.env.DEPOSIT_TOKEN_ENTRY_ID || '123456789';

    // Create pre-filled deposit form link
    const depositFormLink = `${depositFormUrl}?entry.${depositTokenEntryId}=${depositToken}`;

    // Update Sheet: Status=pending_deposit, AcceptedSlot, CalendarEventId (temp), ProcessedTimestamp (accept time), deposit_token, deposit_deadline
    const rowNumber = matchingRowIndex + 1;

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          {
            range: `Booking Form!M${rowNumber}`, // Status
            values: [['pending_deposit']],
          },
          {
            range: `Booking Form!N${rowNumber}`, // AcceptedSlot
            values: [[`Slot ${slotIndex + 1}`]],
          },
          {
            range: `Booking Form!O${rowNumber}`, // CalendarEventId (temp)
            values: [[tempEventId]],
          },
          {
            range: `Booking Form!P${rowNumber}`, // ProcessedTimestamp (accept time)
            values: [[now.toISOString()]],
          },
          {
            range: `Booking Form!Q${rowNumber}`, // deposit_token
            values: [[depositToken]],
          },
          {
            range: `Booking Form!R${rowNumber}`, // deposit_deadline
            values: [[depositDeadline.toISOString()]],
          },
        ],
      },
    });

    // Send deposit request email to CLIENT
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: 'Hair by Dekyi <noreply@hairbydekyi.com>',
      to: email,
      subject: 'Your appointment request has been approved!',
      html: `
        <h2>Great news, ${name}!</h2>
        <p>Your requested time slot for <strong>${selectedSlot}</strong> has been approved.</p>

        <h3>Next Step: Submit Your Deposit</h3>
        <p>To secure your appointment, please submit your $5 deposit within 24 hours:</p>
        <p><a href="${depositFormLink}" style="display: inline-block; padding: 12px 24px; background-color: #A8BDA8; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Submit Deposit Screenshot</a></p>

        <p style="font-size: 0.875rem; color: #7A6A61; margin-top: 8px;">
          Button not working? <a href="${depositFormLink}" style="color: #8B6D7B; text-decoration: underline;">Click here to submit your deposit</a>
        </p>

        <p><strong>Important:</strong> If we don't receive your deposit within 24 hours, this time slot will become available for others to book.</p>

        <p><strong>Deadline:</strong> ${depositDeadline.toLocaleString('en-US', { timeZone: 'America/Toronto', dateStyle: 'full', timeStyle: 'short' })}</p>

        <p style="font-size: 0.875rem; color: #7A6A61; margin-top: 16px;">
          If it's been more than 24 hours, you'll need to rebook at <a href="https://www.hairbydekyi.com" style="color: #8B6D7B; text-decoration: underline;">hairbydekyi.com</a>
        </p>
      `,
    });

    // Return success page
    return res.status(200).send(`
      <html>
        <body>
          <h1>Booking Accepted!</h1>
          <p><strong>Client:</strong> ${name}</p>
          <p><strong>Approved Time:</strong> ${selectedSlot}</p>
          <p><strong>Status:</strong> Pending deposit (24-hour hold created)</p>
          <p>An email has been sent to ${email} with instructions to submit the deposit.</p>
          <p>The calendar has been temporarily blocked until deposit is received or 24 hours expire.</p>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Error accepting booking:', error);
    return res.status(500).send(`
      <html>
        <body>
          <h1>Error</h1>
          <p>Failed to accept booking: ${error.message}</p>
        </body>
      </html>
    `);
  }
}

/**
 * Parse slot string like "Monday, June 16 at 09:00 AM" into ISO datetime
 * Returns { startDateTime: ISO string, endDateTime: ISO string (from Schedule) }
 */
function parseSlotString(slotString, schedule) {
  try {
    // Extract date and time parts
    // Expected format: "Monday, June 16 at 09:00 AM"
    const match = slotString.match(/(\w+,\s+\w+\s+\d+)\s+at\s+(\d+:\d+\s+[AP]M)/i);

    if (!match) {
      return null;
    }

    const dateStr = match[1]; // "Monday, June 16"
    const timeStr = match[2]; // "09:00 AM"

    // Parse date to get YYYY-MM-DD format (but NOT as a Date object yet)
    const currentYear = new Date().getFullYear();
    const tempFullDateStr = `${dateStr}, ${currentYear}`;
    const tempDate = new Date(tempFullDateStr);

    if (isNaN(tempDate.getTime())) {
      return null;
    }

    // Get date in YYYY-MM-DD format
    const year = tempDate.getFullYear();
    const month = String(tempDate.getMonth() + 1).padStart(2, '0');
    const day = String(tempDate.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;

    // Parse time string to get hour and minute
    const timeMatch = timeStr.match(/(\d+):(\d+)\s+([AP]M)/i);
    if (!timeMatch) {
      return null;
    }

    let hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    const period = timeMatch[3].toUpperCase();

    // Convert to 24-hour format
    if (period === 'PM' && hour !== 12) {
      hour += 12;
    } else if (period === 'AM' && hour === 12) {
      hour = 0;
    }

    // Look up slot configuration from Schedule to get actual end time
    const slotConfig = findSlotByTime(dateString, timeStr, schedule);

    if (!slotConfig) {
      console.warn(`Slot not found in schedule for ${dateString} at ${timeStr}, using 90min default`);
      // Fallback to 90 minutes if slot not found in schedule
      const startDateTime = createTorontoDateTime(dateString, hour, minute);
      const endDateTime = createTorontoDateTime(dateString, hour, minute + 90);
      return {
        startDateTime,
        endDateTime,
      };
    }

    // Create start and end datetimes in Toronto timezone
    const startDateTime = createTorontoDateTime(dateString, hour, minute);
    const endDateTime = createTorontoDateTime(dateString, slotConfig.endHour, slotConfig.endMinute);

    return {
      startDateTime,
      endDateTime,
    };
  } catch (error) {
    console.error('Error parsing slot string:', error);
    return null;
  }
}

/**
 * Create an ISO datetime string in America/Toronto timezone
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @param {number} hour - Hour (0-23)
 * @param {number} minute - Minute (0-59)
 * @returns {string} ISO datetime string with Toronto timezone offset
 */
function createTorontoDateTime(dateString, hour, minute) {
  const [year, month] = dateString.split('-').map(Number);

  // Simple DST check: March-October use EDT (-04:00), Nov-Feb use EST (-05:00)
  const isDST = month >= 3 && month <= 10;
  const offset = isDST ? '-04:00' : '-05:00';

  // Handle minute overflow (e.g., minute = 150 = 2 hours 30 minutes)
  const totalMinutes = hour * 60 + minute;
  const finalHour = Math.floor(totalMinutes / 60) % 24;
  const finalMinute = totalMinutes % 60;

  // Create ISO string with Toronto timezone offset
  const isoString = `${dateString}T${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}:00${offset}`;
  return isoString;
}
