import { google } from 'googleapis';
import { Resend } from 'resend';
import { fetchSchedule, findSlotByTime } from '../utils/schedule.js';

export default async function handler(req, res) {
  try {
    // Decode the service account credentials
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8')
    );

    // Authenticate with Google
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

    // Fetch schedule for slot duration lookup
    const schedule = await fetchSchedule(auth);

    // Read Deposits Form tab (A=Timestamp, B=Screenshot, C=Token, D=Email)
    const depositsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Deposits Form!A:D',
    });

    const depositRows = depositsResponse.data.values;

    if (!depositRows || depositRows.length <= 1) {
      return res.status(200).json({ message: 'No deposits found' });
    }

    // Read Booking Form tab to match deposits
    const bookingsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Booking Form!A:T',
    });

    const bookingRows = bookingsResponse.data.values;

    if (!bookingRows || bookingRows.length <= 1) {
      return res.status(200).json({ message: 'No bookings found' });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    let depositsProcessed = 0;
    const processedDeposits = [];

    // Process each deposit row (skip header)
    for (let i = 1; i < depositRows.length; i++) {
      const depositRow = depositRows[i];
      const depositTimestamp = depositRow[0] || '';
      const depositScreenshot = depositRow[1] || '';
      const depositToken = depositRow[2] || '';
      const depositEmail = depositRow[3] || '';

      if (!depositToken) {
        continue; // Skip rows without token
      }

      // Find matching booking by deposit_token (Column Q = index 16)
      let matchingBookingIndex = -1;
      let matchingBooking = null;

      for (let j = 1; j < bookingRows.length; j++) {
        const bookingDepositToken = bookingRows[j][16] || ''; // Column Q
        if (bookingDepositToken === depositToken) {
          matchingBookingIndex = j;
          matchingBooking = bookingRows[j];
          break;
        }
      }

      if (!matchingBooking) {
        console.log(`No matching booking found for deposit token: ${depositToken}`);
        continue;
      }

      // Check if deposit already processed
      const depositReceivedTimestamp = matchingBooking[18] || ''; // Column S
      if (depositReceivedTimestamp) {
        continue; // Already processed
      }

      // Extract booking details
      const name = matchingBooking[1] || '';
      const email = matchingBooking[2] || '';
      const phone = matchingBooking[3] || '';
      const acceptedSlot = matchingBooking[13] || ''; // Column N
      const tempEventId = matchingBooking[14] || ''; // Column O
      const depositDeadline = matchingBooking[17] || ''; // Column R
      const serviceDescription = matchingBooking[7] || '';
      const referencePhotos = matchingBooking[8] || '';

      // Check if deadline has passed
      const now = new Date();
      const deadline = new Date(depositDeadline);

      if (now > deadline) {
        console.log(`Deposit received after deadline for ${email}`);
        // Could send a "too late" email here if desired
        continue;
      }

      // Get the accepted slot details to parse for calendar event
      const slots = [
        matchingBooking[4] || '',
        matchingBooking[5] || '',
        matchingBooking[6] || '',
      ];

      const slotNumber = parseInt(acceptedSlot.replace('Slot ', '')) - 1;
      const selectedSlot = slots[slotNumber];

      const slotParsed = parseSlotString(selectedSlot, schedule);
      if (!slotParsed) {
        console.error(`Could not parse slot: ${selectedSlot}`);
        continue;
      }

      const { startDateTime, endDateTime } = slotParsed;
      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

      try {
        // Delete temporary calendar event
        if (tempEventId) {
          await calendar.events.delete({
            calendarId,
            eventId: tempEventId,
          });
        }

        // Create PERMANENT calendar event
        const permanentEvent = {
          summary: `Hair Appointment - ${name}`,
          description: [
            `Client: ${name}`,
            `Email: ${email}`,
            `Phone: ${phone}`,
            `\nService Description: ${serviceDescription}`,
            `\nReference Photos: ${referencePhotos || 'NOT PROVIDED'}`,
            `\nDeposit Screenshot: ${depositScreenshot}`,
            `\nDeposit Received: ${depositTimestamp}`,
          ].join('\n'),
          start: {
            dateTime: startDateTime,
            timeZone: 'America/Toronto',
          },
          end: {
            dateTime: endDateTime,
            timeZone: 'America/Toronto',
          },
          colorId: '10', // Green color for confirmed
        };

        const createdEvent = await calendar.events.insert({
          calendarId,
          requestBody: permanentEvent,
        });

        const permanentEventId = createdEvent.data.id;

        // Update Booking Form: Status=confirmed, CalendarEventId=permanent, deposit_received_timestamp, deposit_screenshot_url
        const bookingRowNumber = matchingBookingIndex + 1;

        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: 'RAW',
            data: [
              {
                range: `Booking Form!M${bookingRowNumber}`, // Status
                values: [['confirmed']],
              },
              {
                range: `Booking Form!O${bookingRowNumber}`, // CalendarEventId (permanent)
                values: [[permanentEventId]],
              },
              {
                range: `Booking Form!S${bookingRowNumber}`, // deposit_received_timestamp
                values: [[now.toISOString()]],
              },
              {
                range: `Booking Form!T${bookingRowNumber}`, // deposit_screenshot_url
                values: [[depositScreenshot]],
              },
            ],
          },
        });

        // Send confirmation email to client
        await resend.emails.send({
          from: 'Hair by Dekyi <noreply@hairbydekyi.com>',
          to: email,
          subject: 'Appointment confirmed! See you soon',
          html: `
            <h2>Appointment Confirmed!</h2>
            <p>Hi ${name},</p>
            <p>Your deposit has been received and your appointment is now confirmed!</p>

            <h3>Appointment Details:</h3>
            <p><strong>Date & Time:</strong> ${selectedSlot}</p>
            <p><strong>Location:</strong> 3073 Parkerhill Rd, Mississauga, ON L5B 1V6</p>
            <p><strong>Service:</strong> At Home Cut n Style ($45)</p>
            <p><strong>Deposit:</strong> $5 received</p>

            <p>We look forward to seeing you!</p>

            <p>If you need to make any changes, please contact us directly at hairbydekyi@gmail.com or DM @hairbydekyi on Instagram.</p>

            <p>- Dekyi</p>
          `,
        });

        // Send notification email to DEKYI
        const calendarLink = `https://calendar.google.com/calendar/u/0/r/week`;
        const adminLink = `https://www.hairbydekyi.com/admin`;

        await resend.emails.send({
          from: 'Hair by Dekyi <noreply@hairbydekyi.com>',
          to: 'hairbydekyi@gmail.com',
          subject: `Appointment Confirmed: ${name} - ${selectedSlot}`,
          html: `
            <h2 style="color: #A8BDA8;">Appointment Confirmed!</h2>

            <p>A client has submitted their deposit and their appointment is now confirmed.</p>

            <h3 style="color: #8B6D7B;">Appointment Details:</h3>
            <ul>
              <li><strong>Client:</strong> ${name}</li>
              <li><strong>Email:</strong> ${email}</li>
              <li><strong>Phone:</strong> ${phone}</li>
              <li><strong>Date & Time:</strong> ${selectedSlot}</li>
              <li><strong>Status:</strong> Confirmed</li>
            </ul>

            <h3 style="color: #8B6D7B;">Service Details:</h3>
            <p><strong>Description:</strong> ${serviceDescription || 'Not provided'}</p>
            ${referencePhotos ? `<p><strong>Reference Photos:</strong> <a href="${referencePhotos}" style="color: #8B6D7B;">View Photos</a></p>` : ''}

            <h3 style="color: #8B6D7B;">Deposit Information:</h3>
            <ul>
              <li><strong>Deposit Screenshot:</strong> <a href="${depositScreenshot}" style="color: #8B6D7B;">View Screenshot</a></li>
              <li><strong>Submitted:</strong> ${depositTimestamp}</li>
            </ul>

            <p style="margin-top: 30px;">
              <a href="${calendarLink}" style="display: inline-block; padding: 12px 24px; background-color: #8B6D7B; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 10px;">View Calendar</a>
              <a href="${adminLink}" style="display: inline-block; padding: 12px 24px; background-color: #A8BDA8; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Manage Bookings</a>
            </p>

            <hr style="border: none; border-top: 1px solid #E8DFD8; margin: 30px 0;">

            <p style="font-size: 12px; color: #7A6A61;">
              The temporary hold has been replaced with a permanent confirmed appointment on your calendar. You can view all bookings and cancel if needed from the admin panel.
            </p>
          `,
        });

        depositsProcessed++;
        processedDeposits.push({
          name,
          email,
          slot: selectedSlot,
          depositTimestamp,
        });

      } catch (error) {
        console.error(`Error processing deposit for ${email}:`, error);
        continue;
      }
    }

    return res.status(200).json({
      success: true,
      depositsProcessed,
      processedDeposits,
    });

  } catch (error) {
    console.error('Error checking deposits:', error);
    return res.status(500).json({
      error: 'Failed to check deposits',
      details: error.message,
    });
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
