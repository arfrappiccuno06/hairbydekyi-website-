import { useState, useEffect } from 'react';
import Calendar from '../components/Calendar';
import TimeSlotPicker from '../components/TimeSlotPicker';
import SelectionSummary from '../components/SelectionSummary';
import { fetchAvailability } from '../utils/api';

const BookingPage = () => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [availability, setAvailability] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Fetch availability data when month changes
  useEffect(() => {
    const loadAvailability = async () => {
      setLoading(true);
      setError(null);

      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth() + 1;

      const { data, error: apiError } = await fetchAvailability(year, month);

      if (apiError) {
        setError(apiError);
        setLoading(false);
        return;
      }

      setAvailability(data.availability || {});
      setLoading(false);
    };

    loadAvailability();
  }, [currentMonth]);

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    // Scroll to time slots on mobile
    setTimeout(() => {
      const timeslotCard = document.querySelector('.timeslot-card');
      if (timeslotCard) {
        timeslotCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  };

  const handleSlotToggle = (date, time) => {
    const existingIndex = selectedSlots.findIndex(
      slot => slot.date === date && slot.time === time
    );

    if (existingIndex >= 0) {
      // Remove slot
      setSelectedSlots(selectedSlots.filter((_, index) => index !== existingIndex));
    } else {
      // Add slot
      setSelectedSlots([...selectedSlots, { date, time }]);
    }
  };

  const handleConfirm = () => {
    if (selectedSlots.length >= 3) {
      // Format slots for Google Form
      const formattedSlots = selectedSlots.slice(0, 3).map(slot => {
        const date = new Date(slot.date + 'T00:00:00');
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

        const dayName = dayNames[date.getDay()];
        const monthName = monthNames[date.getMonth()];
        const dayNum = date.getDate();

        return `${dayName}, ${monthName} ${dayNum} at ${slot.time}`;
      });

      // Build Google Form URL with pre-filled slots
      const baseUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSdgsujnW4UAL6WX_ajlHDQWAgVyf-kpQXg_OfAII_Wxovy6Bg/viewform';
      const params = new URLSearchParams({
        'usp': 'pp_url',
        'entry.2028055511': formattedSlots[0] || '',
        'entry.635753266': formattedSlots[1] || '',
        'entry.726002966': formattedSlots[2] || ''
      });

      // Redirect to Google Form
      window.location.href = `${baseUrl}?${params.toString()}`;
    }
  };

  return (
    <main className="main-content">
      <div className="hero-section">
        <h1 className="hero-title">Book an appointment below:</h1>
      </div>

      <div className="booking-container">
        <Calendar
          selectedDate={selectedDate}
          onDateSelect={handleDateSelect}
          selectedSlots={selectedSlots}
          availability={availability}
          loading={loading}
          error={error}
          currentMonth={currentMonth}
          onMonthChange={setCurrentMonth}
        />

        {selectedDate && (
          <TimeSlotPicker
            selectedDate={selectedDate}
            selectedSlots={selectedSlots}
            onSlotToggle={handleSlotToggle}
            availability={availability}
          />
        )}

        {selectedSlots.length > 0 && (
          <SelectionSummary
            selectedSlots={selectedSlots}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </main>
  );
};

export default BookingPage;
