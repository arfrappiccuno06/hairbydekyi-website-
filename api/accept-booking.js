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
      // Slot is already booked - figure out which of the OTHER requested slots
      // are still genuinely free (don't just blindly offer the links).
      const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
      const availableAlternatives = [];

      for (let i = 0; i < 3; i++) {
        if (i === slotIndex || !slots[i]) continue;

        const altParsed = parseSlotString(slots[i], schedule);
        if (!altParsed) continue;

        const altFreeBusy = await calendar.freebusy.query({
          requestBody: {
            timeMin: altParsed.startDateTime,
            timeMax: altParsed.endDateTime,
            timeZone: 'America/Toronto',
            items: [{ id: calendarId }],
          },
        });

        const altBusy = altFreeBusy.data.calendars[calendarId].busy || [];
        if (altBusy.length === 0) {
          availableAlternatives.push({ index: i, slot: slots[i] });
        }
      }

      // If at least one other slot is still free, offer it. Keep the status as
      // 'pending_acceptance' so the alternative Accept links below still pass
      // the idempotency check and can be accepted.
      if (availableAlternatives.length > 0) {
        const alternativeLinks = availableAlternatives.map(({ index, slot }) => `
          <p><strong>Slot ${index + 1}:</strong> ${slot}<br>
          <a href="${baseUrl}/api/accept-booking?token=${token}&slot=${index}">Accept Slot ${index + 1}</a></p>
        `);

        return res.status(409).send(`
          <html>
            <body>
              <h1>Slot Already Booked</h1>
              <p>Unfortunately, this time slot was just booked by someone else.</p>
              <h2>These alternative slots are still available:</h2>
              ${alternativeLinks.join('')}
            </body>
          </html>
        `);
      }

      // None of the three slots are available. Mark the row as Conflict and
      // automatically email the client asking them to rebook.
      const rowNumber = matchingRowIndex + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Booking Form!M${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Conflict']],
        },
      });

      let clientNotified = false;
      if (email && email.trim() !== '') {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const rebookResponse = await resend.emails.send({
            from: 'Hair by Dekyi <noreply@hairbydekyi.com>',
            to: email,
            subject: 'Please Rebook - Your Requested Times Are No Longer Available',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2c2c2c;">
                <h2 style="color: #7a5566; margin-bottom: 20px;">Hi ${name},</h2>
                <p style="color: #2c2c2c; line-height: 1.6;">Thank you so much for your booking request. Unfortunately, all three of the time slots you selected have since been booked by other clients and are no longer available.</p>
                <p style="color: #2c2c2c; line-height: 1.6;">We'd still love to get you in! Please head back to our booking page to choose new times that work for you:</p>
                <p><a href="https://www.hairbydekyi.com" style="display: inline-block; padding: 12px 24px; background-color: #8a9d8a; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Rebook Your Appointment</a></p>
                <p style="font-size: 0.875rem; color: #666666; margin-top: 8px; line-height: 1.5;">
                  Button not working? Visit <a href="https://www.hairbydekyi.com" style="color: #7a5566; text-decoration: underline;">hairbydekyi.com</a>
                </p>
                <p style="color: #2c2c2c; line-height: 1.6; margin-top: 20px;">We apologize for the inconvenience and hope to see you soon!</p>
              </div>
            `,
          });

          if (rebookResponse.error) {
            throw new Error(rebookResponse.error.message);
          }
          clientNotified = true;
          console.log(`✓ Rebook email sent successfully to ${email}`);
        } catch (rebookError) {
          console.error('Failed to send rebook email to client:', rebookError);
        }
      }

      return res.status(409).send(`
        <html>
          <body>
            <h1>No Slots Available</h1>
            ${clientNotified
              ? `<p>None of the three slots are available, client has been contacted to rebook.</p>`
              : `<p>None of the three slots are available. We could not automatically email the client${email ? ` (${email})` : ' (no email on file)'} &mdash; please contact them directly to rebook.</p>`}
            <p><strong>Client:</strong> ${name}</p>
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

    // Client-side cancellation link (same format as the confirmation email)
    const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
    const clientCancelLink = `${baseUrl}/api/admin/operations?action=client-cancel&token=${depositToken}`;

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

    // Validate email address before sending
    if (!email || email.trim() === '') {
      console.error('Cannot send deposit email: Client email is empty or missing');
      return res.status(500).send(`
        <html>
          <body>
            <h1>Error: No Email Address</h1>
            <p>The booking was accepted but the client's email address is missing.</p>
            <p><strong>Client:</strong> ${name}</p>
            <p>Please contact the client directly to request their deposit.</p>
          </body>
        </html>
      `);
    }

    // Send deposit request email to CLIENT
    const resend = new Resend(process.env.RESEND_API_KEY);

    try {
      const emailResponse = await resend.emails.send({
        from: 'Hair by Dekyi <noreply@hairbydekyi.com>',
        to: email,
        subject: 'Submit Your Deposit in 24 hrs - Appointment Approved',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2c2c2c;">
            <h2 style="color: #8a9d8a; margin-bottom: 20px;">Great news, ${name}!</h2>
            <p style="color: #2c2c2c; line-height: 1.6;">Your requested time slot for <strong>${selectedSlot}</strong> has been approved.</p>

            <h3 style="color: #7a5566; margin-top: 25px; margin-bottom: 10px;">Next Step: Submit Your Deposit</h3>
            <p style="color: #2c2c2c; line-height: 1.6;">To secure your appointment, please submit your $5 deposit within 24 hours:</p>
            <p><a href="${depositFormLink}" style="display: inline-block; padding: 12px 24px; background-color: #8a9d8a; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Submit Deposit Screenshot</a></p>

            <p style="font-size: 0.875rem; color: #666666; margin-top: 8px; line-height: 1.5;">
              Button not working? <a href="${depositFormLink}" style="color: #7a5566; text-decoration: underline;">Click here to submit your deposit</a>
            </p>

            <p style="color: #2c2c2c; line-height: 1.6; margin-top: 20px;"><strong>Important:</strong> If we don't receive your deposit within 24 hours, this time slot will become available for others to book.</p>

            <p style="color: #2c2c2c; line-height: 1.6;"><strong>Deadline:</strong> ${depositDeadline.toLocaleString('en-US', { timeZone: 'America/Toronto', dateStyle: 'full', timeStyle: 'short' })}</p>

            <hr style="border: none; border-top: 1px solid #e0d8d2; margin: 28px 0;">

            <p style="color: #2c2c2c; line-height: 1.6;">If the above time no longer works for you, please be kind to others and cancel using the button below, then rebook at <a href="https://www.hairbydekyi.com" style="color: #7a5566; text-decoration: underline;">hairbydekyi.com</a> with time slots that work for you.</p>
            <p><a href="${clientCancelLink}" style="display: inline-block; padding: 12px 24px; background-color: #d9534f; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Cancel Appointment</a></p>

            <p style="font-size: 0.875rem; color: #666666; margin-top: 16px; line-height: 1.5;">
              If it's been more than 24 hours, you'll need to rebook at <a href="https://www.hairbydekyi.com" style="color: #7a5566; text-decoration: underline;">hairbydekyi.com</a>
            </p>
          </div>
        `,
      });

      // Check if Resend returned an error
      if (emailResponse.error) {
        console.error('Resend API error when sending deposit email:', emailResponse.error);
        throw new Error(`Resend API error: ${emailResponse.error.message}`);
      }

      console.log(`✓ Deposit email sent successfully to ${email}, message ID: ${emailResponse.data?.id}`);
    } catch (emailError) {
      console.error('Failed to send deposit email to client:', emailError);
      return res.status(500).send(`
        <html>
          <body>
            <h1>Email Send Failed</h1>
            <p>The booking was accepted and the calendar hold was created, but we failed to send the deposit request email.</p>
            <p><strong>Client:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Error:</strong> ${emailError.message}</p>
            <p style="margin-top: 20px; color: #d9534f;"><strong>ACTION REQUIRED:</strong> Please contact the client directly to request their deposit. The calendar hold will expire in 24 hours if not received.</p>
          </body>
        </html>
      `);
    }

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
 * Find the nth occurrence of a weekday in a month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {number} n - Which occurrence (1 = first, 2 = second, etc.)
 * @param {number} weekday - Day of week (0 = Sunday, 6 = Saturday)
 * @returns {Date} Date object for the nth weekday
 */
function getNthWeekday(year, month, n, weekday) {
  const firstDay = new Date(year, month - 1, 1);
  const firstWeekday = 1 + ((weekday - firstDay.getDay() + 7) % 7);
  return new Date(year, month - 1, firstWeekday + (n - 1) * 7);
}

/**
 * Create an ISO datetime string in America/Toronto timezone
 * Properly handles DST transitions (2nd Sunday in March, 1st Sunday in November)
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @param {number} hour - Hour (0-23)
 * @param {number} minute - Minute (0-59)
 * @returns {string} ISO datetime string with Toronto timezone offset
 */
function createTorontoDateTime(dateString, hour, minute) {
  const [year, month, day] = dateString.split('-').map(Number);

  // DST transitions in America/Toronto:
  // Starts: 2nd Sunday in March at 2:00 AM → EDT (-04:00)
  // Ends: 1st Sunday in November at 2:00 AM → EST (-05:00)
  const dstStart = getNthWeekday(year, 3, 2, 0); // 2nd Sunday in March
  const dstEnd = getNthWeekday(year, 11, 1, 0); // 1st Sunday in November

  const currentDate = new Date(year, month - 1, day);
  const isDST = currentDate >= dstStart && currentDate < dstEnd;
  const offset = isDST ? '-04:00' : '-05:00';

  // Handle minute overflow (e.g., minute = 150 = 2 hours 30 minutes)
  const totalMinutes = hour * 60 + minute;
  const finalHour = Math.floor(totalMinutes / 60) % 24;
  const finalMinute = totalMinutes % 60;

  // Create ISO string with Toronto timezone offset
  const isoString = `${dateString}T${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}:00${offset}`;
  return isoString;
}
