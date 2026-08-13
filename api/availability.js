import { google } from 'googleapis';
import { fetchSchedule, getSlotConfigForDate } from '../utils/schedule.js';
import { rateLimit, toIntInRange } from '../utils/security.js';

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

  // Throttle abusive clients (in-memory, best-effort — see utils/security.js).
  // CORS headers are already set above, so the 429 is readable by the browser.
  if (!rateLimit(req, res, { name: 'availability', limit: 60, windowMs: 60 * 60 * 1000 })) return;

  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month are required' });
    }

    // Validate year/month are integers in a sane range BEFORE any date math or
    // Google API calls. Reject malformed input with a generic message.
    const yearNum = toIntInRange(year, 2020, 2100);
    const monthNum = toIntInRange(month, 1, 12);
    if (yearNum === null || monthNum === null) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    // Check cache (normalized numeric key so "09" and "9" don't split the cache)
    const cacheKey = `${yearNum}-${monthNum}`;
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
      scopes: [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/spreadsheets.readonly'
      ],
    });

    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = process.env.GOOGLE_CALENDAR_ID;

    // Get start and end of month
    const startOfMonth = new Date(yearNum, monthNum - 1, 1);
    const endOfMonth = new Date(yearNum, monthNum, 0, 23, 59, 59);

    // Fetch schedule (Google Sheets) and events (Google Calendar) in parallel.
    // Neither depends on the other's result, so running them concurrently
    // overlaps the two network round-trips instead of waiting sequentially.
    const [schedule, response] = await Promise.all([
      fetchSchedule(auth),
      calendar.events.list({
        calendarId,
        timeMin: startOfMonth.toISOString(),
        timeMax: endOfMonth.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      }),
    ]);

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
      const dateString = currentDate.toISOString().split('T')[0];

      // Skip dates in the past (before today)
      if (dateString >= todayString) {
        const slots = generateDailySlots(currentDate, events, torontoHour, torontoMinute, dateString === todayString, schedule);
        // Only add to availability if there are slots configured for this day
        if (slots && slots.length > 0) {
          availability[dateString] = slots;
        }
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
      error: 'Failed to fetch availability'
    });
  }
}

// Generate time slots for a given day based on Schedule sheet
function generateDailySlots(date, busyEvents, currentTorontoHour, currentTorontoMinute, isToday, schedule) {
  const slots = [];
  const dateString = date.toISOString().split('T')[0];

  // Get slot configuration for this specific date or fall back to default for day of week
  const daySlots = getSlotConfigForDate(dateString, schedule);

  if (!daySlots || daySlots.length === 0) {
    // No slots configured for this day
    return [];
  }

  for (const slot of daySlots) {
    // Create slot time in America/Toronto timezone
    const slotStart = createTorontoDate(dateString, slot.startHour, slot.startMinute);
    const slotEnd = createTorontoDate(dateString, slot.endHour, slot.endMinute);

    // Skip past time slots for today
    // Compare hours and minutes directly in Toronto timezone
    if (isToday) {
      const currentTimeInMinutes = currentTorontoHour * 60 + currentTorontoMinute;
      const slotTimeInMinutes = slot.startHour * 60 + slot.startMinute;

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

