import React from 'react';
import './TimeSlotPicker.css';
import { getAvailableSlots } from '../data/mockAvailability';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const TimeSlotPicker = ({ selectedDate, selectedSlots, onSlotToggle }) => {
  if (!selectedDate) {
    return null;
  }

  const slots = getAvailableSlots(selectedDate);

  if (slots.length === 0) {
    return null;
  }

  // Format the date for display
  const date = new Date(selectedDate + 'T00:00:00');
  const dayName = DAYS_OF_WEEK[date.getDay()];
  const monthName = MONTHS[date.getMonth()];
  const dayNum = date.getDate();
  const formattedDate = `${dayName}, ${monthName} ${dayNum}`;

  const isSlotSelected = (time) => {
    return selectedSlots.some(slot => slot.date === selectedDate && slot.time === time);
  };

  const handleSlotClick = (time) => {
    onSlotToggle(selectedDate, time);
  };

  return (
    <div className="timeslot-card">
      <h2 className="timeslot-title">Available Times</h2>
      <p className="timeslot-date">{formattedDate}</p>

      <div className="timeslot-grid">
        {slots.map((time) => (
          <button
            key={time}
            className={`timeslot-button ${isSlotSelected(time) ? 'selected' : ''}`}
            onClick={() => handleSlotClick(time)}
          >
            {time}
          </button>
        ))}
      </div>
    </div>
  );
};

export default TimeSlotPicker;
