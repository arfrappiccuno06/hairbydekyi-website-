import { google } from 'googleapis';
import { Resend } from 'resend';
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

  } catch (error) {
    console.error('Error cancelling booking:', error);
    return res.status(500).json({
      error: 'Failed to cancel booking',
      details: error.message,
    });
  }
}
