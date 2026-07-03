import { google } from 'googleapis';

// Cache for schedule data (5 minutes)
let scheduleCache = {
  data: null,
  timestamp: 0,
  ttl: 5 * 60 * 1000 // 5 minutes
};

/**
 * Fetch schedule configuration from Google Sheets
 * @param {GoogleAuth} auth - Google auth instance
 * @returns {Promise<Object>} Schedule data indexed by date/default keys
 */
export async function fetchSchedule(auth) {
  const now = Date.now();

  // Check cache
  if (scheduleCache.data && (now - scheduleCache.timestamp) < scheduleCache.ttl) {
    return scheduleCache.data;
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || '1mNaPRaHr_HwFVY-Szxak-QCZwWDJ-BWO0E4tBc1f-NA';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Schedule!A:P', // All columns (Date through Slot7_End)
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      console.warn('No schedule data found in Google Sheets');
      return {};
    }

    const schedule = parseScheduleData(rows);

    // Update cache
    scheduleCache = {
      data: schedule,
      timestamp: now
    };

    return schedule;
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return {}; // Return empty schedule on error
  }
}

/**
 * Parse schedule rows from Google Sheets into structured data
 * @param {Array} rows - Rows from Google Sheets
 * @returns {Object} Schedule data
 */
function parseScheduleData(rows) {
  const schedule = {};

  // Process each row (skip header row)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const date = row[0]; // Date or DEFAULT_MONDAY, DEFAULT_TUESDAY, etc.

    if (!date) continue;

    const slots = [];

    // Parse slot columns (C through P = Slot1_Start through Slot7_End)
    // C=Slot1_Start, D=Slot1_End, E=Slot2_Start, F=Slot2_End, etc.
    for (let slotNum = 1; slotNum <= 7; slotNum++) {
      const startColIndex = 2 + (slotNum - 1) * 2; // Column C=2, E=4, G=6, etc.
      const endColIndex = startColIndex + 1; // Column D=3, F=5, H=7, etc.

      const startTime = row[startColIndex];
      const endTime = row[endColIndex];

      if (startTime && endTime) {
        slots.push(parseSlot(startTime, endTime));
      }
    }

    schedule[date] = slots;
  }

  return schedule;
}

/**
 * Parse a slot from "HH:MM" format to structured data
 * @param {string} startTime - Start time in HH:MM format
 * @param {string} endTime - End time in HH:MM format
 * @returns {Object} Slot data
 */
function parseSlot(startTime, endTime) {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);

  // Create label in 12-hour format (e.g., "04:00 PM")
  const startLabel = formatTime12Hour(startHour, startMinute);

  return {
    startHour,
    startMinute,
    endHour,
    endMinute,
    label: startLabel,
  };
}

/**
 * Format time in 12-hour format with AM/PM
 * @param {number} hour - Hour (0-23)
 * @param {number} minute - Minute (0-59)
 * @returns {string} Formatted time (e.g., "04:00 PM")
 */
export function formatTime12Hour(hour, minute) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const minuteStr = String(minute).padStart(2, '0');
  return `${String(hour12).padStart(2, '0')}:${minuteStr} ${period}`;
}

/**
 * Get slot configuration for a specific date, falling back to default for day of week
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @param {Object} schedule - Schedule data
 * @returns {Array} Array of slot objects
 */
export function getSlotConfigForDate(dateString, schedule) {
  // Check if there's a custom schedule for this specific date
  if (schedule[dateString]) {
    return schedule[dateString];
  }

  // Fall back to default template for day of week
  const date = new Date(dateString + 'T00:00:00');
  const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday

  const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const defaultKey = `DEFAULT_${dayNames[dayOfWeek]}`;

  return schedule[defaultKey] || [];
}

/**
 * Find a slot's end time by matching the start time
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @param {string} timeString - Time in "HH:MM AM/PM" format (e.g., "04:00 PM")
 * @param {Object} schedule - Schedule data
 * @returns {Object|null} Slot object with startHour, startMinute, endHour, endMinute, or null
 */
export function findSlotByTime(dateString, timeString, schedule) {
  const slots = getSlotConfigForDate(dateString, schedule);

  if (!slots || slots.length === 0) {
    return null;
  }

  // Find slot with matching label
  return slots.find(slot => slot.label === timeString) || null;
}
