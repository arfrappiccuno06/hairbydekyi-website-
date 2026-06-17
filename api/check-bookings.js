import { google } from 'googleapis';
import { Resend } from 'resend';

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
      ],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1mNaPRaHr_HwFVY-Szxak-QCZwWDJ-BWO0E4tBc1f-NA';

    // Read all form responses (A=Timestamp through K=Notified)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Form Responses 1!A:K',
    });

    const rows = response.data.values;

    if (!rows || rows.length <= 1) {
      return res.status(200).json({ message: 'No new bookings found' });
    }

    // First row is headers
    const headers = rows[0];
    const notifiedColumnIndex = headers.indexOf('Notified');

    // If "Notified" column doesn't exist, we need to add it
    if (notifiedColumnIndex === -1) {
      return res.status(500).json({
        error: 'Please add a "Notified" column to your Google Sheet as the last column'
      });
    }

    // Initialize Resend
    const resend = new Resend(process.env.RESEND_API_KEY);

    let emailsSent = 0;
    const newBookings = [];

    // Process each row (skip header row)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const isNotified = row[notifiedColumnIndex] === 'TRUE';

      // Skip if already notified
      if (isNotified) {
        continue;
      }

      // Extract booking details
      // A=Timestamp, B=Name, C=Email, D=Phone, E=Slot1, F=Slot2, G=Slot3
      const timestamp = row[0] || '';
      const name = row[1] || '';
      const email = row[2] || '';
      const phone = row[3] || '';
      const slot1 = row[4] || '';
      const slot2 = row[5] || '';
      const slot3 = row[6] || '';

      // Create email content
      const emailHtml = `
        <h2>New Booking Request</h2>
        <p><strong>Submitted:</strong> ${timestamp}</p>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>

        <h3>Requested Time Slots:</h3>
        <ul>
          <li>${slot1}</li>
          <li>${slot2}</li>
          <li>${slot3}</li>
        </ul>

        <p><a href="https://docs.google.com/spreadsheets/d/1mNaPRaHr_HwFVY-Szxak-QCZwWDJ-BWO0E4tBc1f-NA/edit">View Google Sheet</a></p>
      `;

      try {
        // Send email via Resend
        await resend.emails.send({
          from: 'Hair by Dekyi <onboarding@resend.dev>', // Will be from Resend's domain
          to: 'hairbydekyi@gmail.com',
          subject: `New Booking Request from ${name}`,
          html: emailHtml,
        });

        // Mark as notified in the sheet
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Form Responses 1!${String.fromCharCode(65 + notifiedColumnIndex)}${i + 1}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [['TRUE']],
          },
        });

        emailsSent++;
        newBookings.push({ name, email, timestamp });

      } catch (emailError) {
        console.error('Failed to send email for row', i, emailError);
        // Continue processing other rows even if one fails
      }
    }

    return res.status(200).json({
      success: true,
      emailsSent,
      newBookings,
    });

  } catch (error) {
    console.error('Error checking bookings:', error);
    return res.status(500).json({
      error: 'Failed to check bookings',
      details: error.message,
    });
  }
}
