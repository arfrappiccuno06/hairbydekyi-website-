import { google } from 'googleapis';
import { Resend } from 'resend';

export default async function handler(req, res) {
  try {
    // Parse query parameter
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
      ],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1mNaPRaHr_HwFVY-Szxak-QCZwWDJ-BWO0E4tBc1f-NA';

    // Read all rows to find the matching token
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Form Responses 1!A:P',
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
    const status = bookingData[12] || ''; // Column M

    // Idempotency check
    if (status !== 'Pending') {
      return res.status(200).send(`
        <html>
          <body>
            <h1>Booking Already Processed</h1>
            <p>This booking has already been ${status.toLowerCase()}.</p>
            <p><strong>Client:</strong> ${name}</p>
            <p><strong>Status:</strong> ${status}</p>
          </body>
        </html>
      `);
    }

    // Update Sheet: Status=Denied, ProcessedTimestamp
    const rowNumber = matchingRowIndex + 1;
    const now = new Date().toISOString();

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          {
            range: `Form Responses 1!M${rowNumber}`,
            values: [['Denied']],
          },
          {
            range: `Form Responses 1!P${rowNumber}`,
            values: [[now]],
          },
        ],
      },
    });

    // Send polite rejection email to client
    const resend = new Resend(process.env.RESEND_API_KEY);
    const baseUrl = process.env.BASE_URL || 'http://localhost:5173';

    await resend.emails.send({
      from: 'Hair by Dekyi <onboarding@resend.dev>',
      to: email,
      subject: 'Booking Request Update',
      html: `
        <h2>Booking Request Update</h2>
        <p>Hi ${name},</p>
        <p>Thank you for your interest! Unfortunately, none of your requested time slots are available at this time.</p>
        <p>Please visit our website to select new time options:</p>
        <p><a href="${baseUrl}">Book a New Appointment</a></p>
        <p>We apologize for any inconvenience and look forward to serving you soon!</p>
      `,
    });

    // Return confirmation page
    return res.status(200).send(`
      <html>
        <body>
          <h1>Booking Denied</h1>
          <p><strong>Client:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p>A polite rejection email has been sent to the client.</p>
          <p>The booking has been marked as denied in the system.</p>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Error denying booking:', error);
    return res.status(500).send(`
      <html>
        <body>
          <h1>Error</h1>
          <p>Failed to deny booking: ${error.message}</p>
        </body>
      </html>
    `);
  }
}
