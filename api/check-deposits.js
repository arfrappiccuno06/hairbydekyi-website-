import { google } from 'googleapis';
import { fetchSchedule, parseSlotString } from '../utils/schedule.js';
import { sendEmail } from '../utils/email.js';
import { requireCron } from '../utils/security.js';

export default async function handler(req, res) {
  // Cron-only endpoint: reject callers without the shared CRON_SECRET.
  if (!requireCron(req, res)) return;

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
      range: 'Booking Form!A:Z',
    });

    const bookingRows = bookingsResponse.data.values;

    if (!bookingRows || bookingRows.length <= 1) {
      return res.status(200).json({ message: 'No bookings found' });
    }

    // Find the Instagram column by its header name instead of a hardcoded index,
    // so the email keeps working even if the Google Form shifts the column.
    const bookingHeaders = bookingRows[0] || [];
    const instagramColIndex = bookingHeaders.findIndex(
      (h) => String(h || '').toLowerCase().includes('instagram')
    );

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
      const instagramHandle = (instagramColIndex >= 0 ? matchingBooking[instagramColIndex] : '') || '';

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
            `Instagram: ${instagramHandle || 'Not provided'}`,
            `\nService Description: ${serviceDescription}`,
            `\nReference Photos: ${referencePhotos || 'NOT PROVIDED'}`,
            `\nDeposit Screenshot: ${depositScreenshot}`,
            `\nDeposit Received: ${depositTimestamp}`,
            `\nNeed to cancel this appointment? Click here: ${process.env.BASE_URL || 'https://www.hairbydekyi.com'}/api/admin/operations?action=cancel-with-token&token=${depositToken}`,
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

        // Reflect the just-written timestamp in the in-memory copy so a second
        // deposit row for the SAME booking in this same cron run is recognized
        // as already processed (bookingRows was read once at the start, so
        // otherwise the guard above would see a stale empty value).
        matchingBooking[18] = now.toISOString(); // Column S = deposit_received_timestamp

        // Define base URL first (needed for both client and admin emails)
        const baseUrl = process.env.BASE_URL || 'https://www.hairbydekyi.com';

        // Validate client email address
        if (!email || email.trim() === '') {
          console.error(`Cannot send confirmation email: Client email is empty for deposit token ${depositToken}`);
          // Continue to admin email - don't skip admin notification
        } else {
          // Send confirmation email to client
          const clientCancelLink = `${baseUrl}/api/admin/operations?action=client-cancel&token=${depositToken}`;

          try {
            const clientEmailResponse = await sendEmail(auth, {
              from: 'Hair by Dekyi <noreply@hairbydekyi.com>',
              to: email,
              subject: 'Appointment confirmed! See you soon',
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2c2c2c;">
                  <h2 style="color: #8a9d8a; margin-bottom: 20px;">Appointment Confirmed!</h2>
                  <p style="color: #2c2c2c; line-height: 1.6;">Hi ${name},</p>
                  <p style="color: #2c2c2c; line-height: 1.6;">Your deposit has been received and your appointment is now confirmed!</p>

                  <h3 style="color: #7a5566; margin-top: 25px; margin-bottom: 10px;">Appointment Details:</h3>
                  <p style="color: #2c2c2c; line-height: 1.6;"><strong>Date & Time:</strong> ${selectedSlot}</p>
                  <p style="color: #2c2c2c; line-height: 1.6;"><strong>Location:</strong> 3023 Parkerhill Rd, Mississauga, ON L5B 4B3</p>
                  <p style="color: #2c2c2c; line-height: 1.6;"><strong>Service:</strong> At Home Cut n Style ($50)</p>
                  <p style="color: #2c2c2c; line-height: 1.6;"><strong>Deposit:</strong> $5 received</p>

                  <p style="color: #2c2c2c; line-height: 1.6;">Hi love!! Make sure to come in with washed clean hair (double shampoo and scrubbing the scalp is a must) before you come:3 also just a heads up since I just starting out I'm doing the cut in my dads workshop LOL😭 there's also visitor parking as soon as you arrive you should see it! As soon as you arrive in the lobby just text me and I'll come get you:3 Also payment is taken in cash:3 I also don't allow any guests just a btw!!</p>

                  <p style="margin-top: 30px; color: #2c2c2c; line-height: 1.6;">We look forward to seeing you!</p>

                  <p style="color: #2c2c2c; line-height: 1.6;">If you need to make any changes, please contact us directly at <a href="mailto:hairbydekyi@gmail.com" style="color: #7a5566; text-decoration: underline;">hairbydekyi@gmail.com</a> or DM <a href="https://www.instagram.com/hairbydekyi/" style="color: #7a5566; text-decoration: underline;">@hairbydekyi</a> on Instagram.</p>

                  <p style="margin-top: 30px; color: #2c2c2c; line-height: 1.6;">
                    Take care,<br>
                    <strong>Dekyi</strong><br>
                    Hair by Dekyi
                  </p>

                  <hr style="border: none; border-top: 1px solid #cccccc; margin: 30px 0;">

                  <p style="text-align: center; margin-bottom: 10px;">
                    <a href="${clientCancelLink}" style="display: inline-block; padding: 12px 24px; background-color: #d9534f; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Cancel Appointment</a>
                  </p>

                  <p style="font-size: 11px; color: #666666; text-align: center; line-height: 1.5;">
                    Please note: Your $5 deposit is non-refundable
                  </p>
                </div>
              `,
            });

            // Check if Resend returned an error
            if (clientEmailResponse.error) {
              console.error('Resend API error when sending client confirmation email:', clientEmailResponse.error);
            } else {
              console.log(`✓ Client confirmation email sent successfully to ${email}, message ID: ${clientEmailResponse.data?.id}`);
            }
          } catch (clientEmailError) {
            console.error(`Failed to send confirmation email to client ${email}:`, clientEmailError);
            // Don't throw - continue to admin email
          }
        }

        // Send notification email to DEKYI
        const calendarLink = `https://calendar.google.com/calendar/u/0/r/week`;
        const adminLink = `https://www.hairbydekyi.com/admin`;
        const cancelLink = `${baseUrl}/api/admin/operations?action=cancel-with-token&token=${depositToken}`;

        try {
          const adminEmailResponse = await sendEmail(auth, {
            from: 'Hair by Dekyi <noreply@hairbydekyi.com>',
            to: 'hairbydekyi@gmail.com',
            subject: `Appointment Confirmed: ${name} - ${selectedSlot}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2c2c2c;">
                <h2 style="color: #8a9d8a; margin-bottom: 20px;">Appointment Confirmed!</h2>

                <p style="color: #2c2c2c; line-height: 1.6;">A client has submitted their deposit and their appointment is now confirmed.</p>

                <h3 style="color: #7a5566; margin-top: 25px; margin-bottom: 10px;">Appointment Details:</h3>
                <ul style="color: #2c2c2c; line-height: 1.8;">
                  <li><strong>Client:</strong> ${name}</li>
                  <li><strong>Email:</strong> ${email}</li>
                  <li><strong>Phone:</strong> ${phone}</li>
                  <li><strong>Instagram:</strong> ${instagramHandle || 'Not provided'}</li>
                  <li><strong>Date & Time:</strong> ${selectedSlot}</li>
                  <li><strong>Status:</strong> Confirmed</li>
                </ul>

                <h3 style="color: #7a5566; margin-top: 25px; margin-bottom: 10px;">Service Details:</h3>
                <p style="color: #2c2c2c; line-height: 1.6;"><strong>Description:</strong> ${serviceDescription || 'Not provided'}</p>
                ${referencePhotos ? `<p style="color: #2c2c2c; line-height: 1.6;"><strong>Reference Photos:</strong> <a href="${referencePhotos}" style="color: #7a5566; text-decoration: underline;">View Photos</a></p>` : ''}

                <h3 style="color: #7a5566; margin-top: 25px; margin-bottom: 10px;">Deposit Information:</h3>
                <ul style="color: #2c2c2c; line-height: 1.8;">
                  <li><strong>Deposit Screenshot:</strong> <a href="${depositScreenshot}" style="color: #7a5566; text-decoration: underline;">View Screenshot</a></li>
                  <li><strong>Submitted:</strong> ${depositTimestamp}</li>
                </ul>

                <p style="margin-top: 30px;">
                  <a href="${calendarLink}" style="display: inline-block; padding: 12px 24px; background-color: #7a5566; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 10px; margin-bottom: 10px;">View Calendar</a>
                  <a href="${adminLink}" style="display: inline-block; padding: 12px 24px; background-color: #8a9d8a; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-bottom: 10px;">Manage Bookings</a>
                </p>

                <p style="margin-top: 20px;">
                  <a href="${cancelLink}" style="display: inline-block; padding: 12px 24px; background-color: #d9534f; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Cancel Appointment</a>
                </p>

                <hr style="border: none; border-top: 1px solid #cccccc; margin: 30px 0;">

                <p style="font-size: 12px; color: #666666; line-height: 1.5;">
                  The temporary hold has been replaced with a permanent confirmed appointment on your calendar. You can view all bookings and cancel if needed from the admin panel or using the Cancel Appointment button above.
                </p>
              </div>
            `,
          });

          // Check if Resend returned an error
          if (adminEmailResponse.error) {
            console.error('Resend API error when sending admin notification email:', adminEmailResponse.error);
          } else {
            console.log(`✓ Admin notification email sent successfully to hairbydekyi@gmail.com, message ID: ${adminEmailResponse.data?.id}`);
          }
        } catch (adminEmailError) {
          console.error('Failed to send admin notification email:', adminEmailError);
          // Don't throw - the deposit was already processed successfully
        }

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
    });
  }
}

// Slot parsing + Toronto-timezone helpers live in utils/schedule.js
// (parseSlotString), shared with accept-booking.js and admin/operations.js.
