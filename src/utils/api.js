// API utility for calling backend endpoints

const API_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:5173/api'  // Local development
  : '/api';  // Production (Vercel)

export async function fetchAvailability(year, month) {
  try {
    const response = await fetch(`${API_BASE_URL}/availability?year=${year}&month=${month}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    console.error('Failed to fetch availability:', error);
    return { data: null, error: error.message };
  }
}
