import { useState, useEffect } from 'react';
import './App.css';
import Header from './components/Header';
import Calendar from './components/Calendar';
import TimeSlotPicker from './components/TimeSlotPicker';
import SelectionSummary from './components/SelectionSummary';
import Footer from './components/Footer';
import { fetchAvailability } from './utils/api';

function App() {
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [showMenu, setShowMenu] = useState(false);
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
    const slotKey = `${date}-${time}`;
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
      // Stage 1: Just show an alert
      // Later stages will redirect to Google Form
      alert(`Booking confirmed with ${selectedSlots.length} time slot options!\n\nIn Stage 3, this will redirect to the Google Form.`);
      console.log('Selected slots:', selectedSlots);
    }
  };

  const handleMenuClick = () => {
    setShowMenu(!showMenu);
    // Stage 1: Menu functionality will be added in Stage 6
    alert('Menu navigation will be added in Stage 6');
  };

  return (
    <div className="app" style={{ backgroundImage: 'url(/hairbydekyibg1.jpg)' }}>
      <Header onMenuClick={handleMenuClick} />

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

      <Footer />
    </div>
  );
}

export default App;
