import { google } from 'googleapis';

// Cache for calendar data (5 minutes)
let cache = {
  data: null,
  timestamp: 0,
  ttl: 5 * 60 * 1000 // 5 minutes
};

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month are required' });
    }

    // Check cache
    const cacheKey = `${year}-${month}`;
    const now = Date.now();
    if (cache.data && cache.key === cacheKey && (now - cache.timestamp) < cache.ttl) {
      return res.status(200).json(cache.data);
    }

    // Authenticate with service account
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8')
    );

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = process.env.GOOGLE_CALENDAR_ID;

    // Get start and end of month
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    // Fetch events (busy times)
    const response = await calendar.events.list({
      calendarId,
      timeMin: startOfMonth.toISOString(),
      timeMax: endOfMonth.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];

    // Generate availability (9 AM - 6 PM, M-F)
    const availability = {};
    const currentDate = new Date(startOfMonth);

    // Get current time in Toronto timezone
    const nowUTC = new Date();

    // Get current Toronto date/time components
    const torontoFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const torontoParts = torontoFormatter.formatToParts(nowUTC);
    const torontoYear = torontoParts.find(p => p.type === 'year').value;
    const torontoMonth = torontoParts.find(p => p.type === 'month').value;
    const torontoDay = torontoParts.find(p => p.type === 'day').value;
    const torontoHour = parseInt(torontoParts.find(p => p.type === 'hour').value);
    const torontoMinute = parseInt(torontoParts.find(p => p.type === 'minute').value);

    const todayString = `${torontoYear}-${torontoMonth}-${torontoDay}`;

    while (currentDate <= endOfMonth) {
      const dayOfWeek = currentDate.getDay();
      const dateString = currentDate.toISOString().split('T')[0];

      // Skip weekends (0 = Sunday, 6 = Saturday)
      // Skip dates in the past (before today)
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && dateString >= todayString) {
        availability[dateString] = generateDailySlots(currentDate, events, dateString === todayString, torontoHour, torontoMinute);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    const result = { availability };

    // Update cache
    cache = {
      data: result,
      key: cacheKey,
      timestamp: now
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error('Calendar API Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch availability',
      message: error.message
    });
  }
}

// Generate time slots for a given day (9 AM - 6 PM, 1.5 hour slots)
function generateDailySlots(date, busyEvents, isToday, currentTorontoHour, currentTorontoMinute) {
  const slots = [];
  const dateString = date.toISOString().split('T')[0];

  // Define slot times (9 AM, 10:30 AM, 12 PM, 1:30 PM, 3 PM, 4:30 PM)
  const slotTimes = [
    { hour: 9, minute: 0, label: '09:00 AM' },
    { hour: 10, minute: 30, label: '10:30 AM' },
    { hour: 12, minute: 0, label: '12:00 PM' },
    { hour: 13, minute: 30, label: '01:30 PM' },
    { hour: 15, minute: 0, label: '03:00 PM' },
    { hour: 16, minute: 30, label: '04:30 PM' },
  ];

  for (const slot of slotTimes) {
    // Create slot time in America/Toronto timezone
    // Format: 2026-06-16T09:00:00-04:00 (EDT) or -05:00 (EST)
    const slotStart = createTorontoDate(dateString, slot.hour, slot.minute);
    const slotEnd = new Date(slotStart.getTime() + 90 * 60 * 1000); // Add 90 minutes

    // Skip past time slots for today
    // Compare hours and minutes directly in Toronto timezone
    if (isToday) {
      const currentTimeInMinutes = currentTorontoHour * 60 + currentTorontoMinute;
      const slotTimeInMinutes = slot.hour * 60 + slot.minute;

      if (slotTimeInMinutes <= currentTimeInMinutes) {
        continue; // Slot has passed
      }
    }

    // Check if slot overlaps with any busy event
    const isAvailable = !busyEvents.some(event => {
      if (!event.start || !event.end) return false;

      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);

      // Slot is unavailable if it overlaps with an event
      return slotStart < eventEnd && slotEnd > eventStart;
    });

    if (isAvailable) {
      slots.push(slot.label);
    }
  }

  return slots;
}

// Create a Date object in America/Toronto timezone
function createTorontoDate(dateString, hour, minute) {
  // Determine if date is in EDT (UTC-4) or EST (UTC-5)
  // EDT: Second Sunday in March to First Sunday in November
  const year = parseInt(dateString.split('-')[0]);
  const month = parseInt(dateString.split('-')[1]);
  const day = parseInt(dateString.split('-')[2]);

  // Simple DST check: March-October use EDT (-04:00), Nov-Feb use EST (-05:00)
  const isDST = month >= 3 && month <= 10;
  const offset = isDST ? '-04:00' : '-05:00';

  // Create ISO string with Toronto timezone
  const isoString = `${dateString}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${offset}`;
  return new Date(isoString);
}
