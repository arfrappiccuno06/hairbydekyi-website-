import React from 'react';
import './SelectionSummary.css';

const SelectionSummary = ({ selectedSlots, onConfirm }) => {
  const isConfirmEnabled = selectedSlots.length >= 3;

  const formatSlotDisplay = (slot) => {
    const date = new Date(slot.date + 'T00:00:00');
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day} at ${slot.time}`;
  };

  return (
    <div className="selection-summary">
      <div className="summary-header">
        <h3 className="summary-title">Selected Time Slots</h3>
        <span className={`slot-counter ${isConfirmEnabled ? 'complete' : ''}`}>
          {selectedSlots.length} of 3 minimum
        </span>
      </div>

      {selectedSlots.length > 0 && (
        <div className="selected-slots-list">
          {selectedSlots.map((slot, index) => (
            <div key={`${slot.date}-${slot.time}`} className="selected-slot-item">
              <span className="slot-number">{index + 1}.</span>
              <span className="slot-details">{formatSlotDisplay(slot)}</span>
            </div>
          ))}
        </div>
      )}

      {selectedSlots.length < 3 && (
        <p className="selection-hint">
          Please select at least 3 time slot options to continue. You can choose slots from different days.
        </p>
      )}

      <button
        className="confirm-button"
        onClick={onConfirm}
        disabled={!isConfirmEnabled}
      >
        Confirm Appointment
      </button>
    </div>
  );
};

export default SelectionSummary;
