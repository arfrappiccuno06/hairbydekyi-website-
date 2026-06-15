// Hardcoded availability data for Stage 1
// Format: { date: 'YYYY-MM-DD', slots: ['HH:MM AM/PM', ...] }

export const mockAvailability = {
  // June 2026
  '2026-06-18': ['09:00 AM', '11:00 AM', '02:00 PM'],
  '2026-06-20': ['10:00 AM', '01:00 PM', '03:00 PM'],
  '2026-06-22': ['09:00 AM', '10:30 AM', '01:00 PM', '02:30 PM', '04:00 PM'],
  '2026-06-25': ['09:00 AM', '12:00 PM', '02:00 PM', '04:00 PM'],
  '2026-06-27': ['10:00 AM', '01:00 PM', '03:30 PM'],
  // July 2026
  '2026-07-02': ['09:00 AM', '11:30 AM', '02:00 PM'],
  '2026-07-06': ['09:30 AM', '12:00 PM', '03:00 PM', '05:00 PM'],
  '2026-07-09': ['10:00 AM', '01:00 PM', '04:00 PM'],
  '2026-07-13': ['09:00 AM', '11:00 AM', '02:30 PM'],
  '2026-07-16': ['10:30 AM', '01:00 PM', '03:00 PM'],
  '2026-07-20': ['09:00 AM', '12:00 PM', '02:00 PM', '04:30 PM'],
};

// Helper function to check if a date has availability
export const hasAvailability = (dateString) => {
  return mockAvailability[dateString] && mockAvailability[dateString].length > 0;
};

// Helper function to get available slots for a date
export const getAvailableSlots = (dateString) => {
  return mockAvailability[dateString] || [];
};
