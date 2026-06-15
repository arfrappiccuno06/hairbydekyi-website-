import React from 'react';
import './Calendar.css';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const Calendar = ({ selectedDate, onDateSelect, selectedSlots, availability, loading, error, currentMonth, onMonthChange }) => {

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek };
  };

  const formatDate = (year, month, day) => {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentMonth);
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const prevMonth = () => {
    onMonthChange(new Date(year, month - 1));
  };

  const nextMonth = () => {
    onMonthChange(new Date(year, month + 1));
  };

  const hasAvailability = (dateString) => {
    return availability[dateString] && availability[dateString].length > 0;
  };

  const handleDayClick = (day) => {
    const dateString = formatDate(year, month, day);
    if (hasAvailability(dateString)) {
      onDateSelect(dateString);
    }
  };

  const isDaySelected = (day) => {
    const dateString = formatDate(year, month, day);
    return selectedDate === dateString;
  };

  const isDayPartiallySelected = (day) => {
    const dateString = formatDate(year, month, day);
    return selectedSlots.some(slot => slot.date === dateString);
  };

  const renderCalendarDays = () => {
    const days = [];

    // Empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }

    // Actual days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateString = formatDate(year, month, day);
      const isAvailable = hasAvailability(dateString);
      const isSelected = isDaySelected(day);
      const isPartiallySelected = isDayPartiallySelected(day);

      days.push(
        <button
          key={day}
          className={`calendar-day ${isAvailable ? 'available' : ''} ${isSelected ? 'selected' : ''} ${isPartiallySelected && !isSelected ? 'partially-selected' : ''}`}
          onClick={() => handleDayClick(day)}
          disabled={!isAvailable}
        >
          {day}
        </button>
      );
    }

    return days;
  };

  // Error state
  if (error) {
    return (
      <div className="calendar-card calendar-error">
        <p className="error-title">Unable to load availability</p>
        <p className="error-message">Please DM us on Instagram @hairbydekyi to book your appointment</p>
      </div>
    );
  }

  return (
    <div className="calendar-card">
      <div className="calendar-header">
        <h2 className="calendar-month">
          {MONTHS[month]} {year}
        </h2>
        <div className="calendar-nav">
          <button onClick={prevMonth} aria-label="Previous month" className="nav-button">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button onClick={nextMonth} aria-label="Next month" className="nav-button">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="calendar-loading">
          <p>Loading availability...</p>
        </div>
      ) : (
        <>
          <div className="calendar-grid">
            {DAYS.map(day => (
              <div key={day} className="calendar-weekday">
                {day}
              </div>
            ))}
            {renderCalendarDays()}
          </div>

          <div className="calendar-legend">
            <div className="legend-item">
              <span className="legend-indicator available"></span>
              <span className="legend-label">Available</span>
            </div>
            <div className="legend-item">
              <span className="legend-indicator selected"></span>
              <span className="legend-label">Selected</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Calendar;
