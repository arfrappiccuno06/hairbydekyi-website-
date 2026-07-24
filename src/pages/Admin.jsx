import { useState, useEffect } from 'react';
import Calendar from '../components/Calendar';
import '../styles/Admin.css';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState('schedule');
  const [schedule, setSchedule] = useState({});
  const [bookings, setBookings] = useState([]);
  const [bookingSearch, setBookingSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingSlots, setEditingSlots] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [availabilityMap, setAvailabilityMap] = useState({});

  // Check authentication on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Load schedule when authenticated
  useEffect(() => {
    if (isAuthenticated && activeTab === 'schedule') {
      fetchSchedule();
    }
  }, [isAuthenticated, activeTab]);

  // Load bookings when switching to bookings tab
  useEffect(() => {
    if (isAuthenticated && activeTab === 'bookings') {
      fetchBookings();
    }
  }, [isAuthenticated, activeTab]);

  // Convert schedule to availability map for calendar
  // In admin mode, ALL FUTURE dates should be clickable (not past dates)
  useEffect(() => {
    const availMap = {};

    // Get current date in Toronto timezone
    const nowUTC = new Date();
    const torontoFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const torontoParts = torontoFormatter.formatToParts(nowUTC);
    const torontoYear = torontoParts.find(p => p.type === 'year').value;
    const torontoMonth = torontoParts.find(p => p.type === 'month').value;
    const torontoDay = torontoParts.find(p => p.type === 'day').value;
    const todayString = `${torontoYear}-${torontoMonth}-${torontoDay}`;

    // Get current month's date range
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Make all FUTURE dates in the current month clickable (no past dates)
    const currentDate = new Date(firstDay);
    while (currentDate <= lastDay) {
      const dateString = currentDate.toISOString().split('T')[0];
      // Only mark dates >= today as available
      if (dateString >= todayString) {
        availMap[dateString] = ['editable'];
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    setAvailabilityMap(availMap);
  }, [schedule, currentMonth]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/admin/auth?action=verify', {
        credentials: 'include',
      });
      const data = await response.json();
      setIsAuthenticated(data.authenticated);
    } catch (error) {
      console.error('Auth check failed:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');

    try {
      const response = await fetch('/api/admin/auth?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        setIsAuthenticated(true);
        setPassword('');
      } else {
        setLoginError('Invalid password');
      }
    } catch (error) {
      setLoginError('Login failed. Please try again.');
      console.error('Login error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth?action=logout', {
        method: 'POST',
        credentials: 'include',
      });
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const fetchSchedule = async () => {
    try {
      const response = await fetch('/api/admin/operations?action=get-schedule', {
        credentials: 'include',
      });
      const data = await response.json();
      setSchedule(data.schedule || {});
    } catch (error) {
      console.error('Error fetching schedule:', error);
    }
  };

  const fetchBookings = async () => {
    try {
      const response = await fetch('/api/admin/operations?action=get-bookings', {
        credentials: 'include',
      });
      const data = await response.json();
      setBookings(data.bookings || []);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    }
  };

  const handleDateSelect = (date) => {
    setSelectedDate(date);

    // Load existing slots for this date, checking both specific date and default day
    let existingSlots = schedule[date] || [];

    // If no specific date config, check for default day template
    if (existingSlots.length === 0) {
      const dateObj = new Date(date + 'T00:00:00');
      const dayOfWeek = dateObj.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
      const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      const defaultKey = `DEFAULT_${dayNames[dayOfWeek]}`;
      existingSlots = schedule[defaultKey] || [];
    }

    // Convert from {startHour, startMinute, endHour, endMinute} to {startTime: "HH:MM", endTime: "HH:MM"}
    const formattedSlots = existingSlots.map(s => ({
      startTime: `${String(s.startHour).padStart(2, '0')}:${String(s.startMinute).padStart(2, '0')}`,
      endTime: `${String(s.endHour).padStart(2, '0')}:${String(s.endMinute).padStart(2, '0')}`
    }));

    setEditingSlots(formattedSlots);

    // Scroll to slot editor on mobile
    setTimeout(() => {
      const editor = document.querySelector('.admin-slot-editor');
      if (editor) {
        editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  };

  const addSlot = () => {
    setEditingSlots([...editingSlots, { startTime: '', endTime: '' }]);
  };

  const removeSlot = (index) => {
    setEditingSlots(editingSlots.filter((_, i) => i !== index));
  };

  const updateSlot = (index, field, value) => {
    const newSlots = [...editingSlots];
    newSlots[index][field] = value;
    setEditingSlots(newSlots);
  };

  const saveSchedule = async () => {
    if (!selectedDate) {
      alert('Please select a date first');
      return;
    }

    // Filter out empty slots
    const validSlots = editingSlots.filter(s => s.startTime && s.endTime);

    try {
      const response = await fetch('/api/admin/operations?action=update-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          date: selectedDate,
          slots: validSlots,
        }),
      });

      if (response.ok) {
        alert('Schedule saved successfully!');
        fetchSchedule();
      } else {
        alert('Failed to save schedule');
      }
    } catch (error) {
      console.error('Error saving schedule:', error);
      alert('Error saving schedule');
    }
  };

  const resetToDefault = async () => {
    if (!selectedDate) {
      alert('Please select a date first');
      return;
    }

    if (!confirm('Reset this date to use the default schedule for this day of the week?')) {
      return;
    }

    try {
      // Save with empty slots array to delete the specific date entry
      const response = await fetch('/api/admin/operations?action=update-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          date: selectedDate,
          slots: [], // Empty = delete row
        }),
      });

      if (response.ok) {
        alert('Reset to default successfully!');
        fetchSchedule();
        setSelectedDate(null); // Deselect date
      } else {
        alert('Failed to reset');
      }
    } catch (error) {
      console.error('Error resetting schedule:', error);
      alert('Error resetting schedule');
    }
  };

  const cancelBooking = async (booking) => {
    if (!confirm(`Are you sure you want to cancel ${booking.name}'s appointment?`)) {
      return;
    }

    const cancellationReason = prompt('Please enter the reason for cancellation:');

    if (!cancellationReason || cancellationReason.trim() === '') {
      alert('Cancellation reason is required');
      return;
    }

    // Ask whether to let others book in this slot
    const letOthersBook = confirm(
      'Do you want to let others book in this time slot?\n\n' +
      'Click OK to DELETE the calendar event and allow rebooking.\n' +
      'Click Cancel to KEEP the event marked as cancelled (slot stays blocked).'
    );

    try {
      const response = await fetch('/api/admin/operations?action=cancel-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          rowIndex: booking.rowIndex,
          calendarEventId: booking.calendarEventId,
          clientEmail: booking.email,
          clientName: booking.name,
          cancellationReason: cancellationReason.trim(),
          deleteCalendarEvent: letOthersBook,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Handle idempotent case (already cancelled)
        if (data.alreadyProcessed) {
          alert(`This booking was already ${data.message}`);
        } else {
          alert('Booking cancelled and client notified');
        }
        fetchBookings();
      } else {
        // Show specific error message from backend
        const errorMsg = data.error || 'Failed to cancel booking';
        alert(errorMsg);
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('Error cancelling booking');
    }
  };

  // Format date for display
  const formatDateDisplay = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    const dayName = DAYS_OF_WEEK[date.getDay()];
    const monthName = MONTHS[date.getMonth()];
    const dayNum = date.getDate();
    return `${dayName}, ${monthName} ${dayNum}`;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="app admin-app">
        <div className="admin-loading">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Login form
  if (!isAuthenticated) {
    return (
      <div className="app admin-app">
        <div className="admin-login-container">
          <div className="admin-login-box">
            <h1>Admin Login</h1>
            <form onSubmit={handleLogin}>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="admin-password-input"
                autoFocus
              />
              {loginError && <p className="admin-error">{loginError}</p>}
              <button type="submit" className="admin-login-button">
                Login
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Filter bookings by name and/or date. Each whitespace-separated term must
  // appear somewhere in the client's name, submitted date, or slot dates, so
  // "sara" matches by name, "june 16" by date, and "sara 16" by both.
  const filteredBookings = bookings.filter((booking) => {
    const query = bookingSearch.trim().toLowerCase();
    if (!query) return true;
    const haystack = [
      booking.name,
      booking.timestamp,
      booking.slot1,
      booking.slot2,
      booking.slot3,
      booking.acceptedSlot,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return query.split(/\s+/).every((term) => haystack.includes(term));
  });

  // Admin Dashboard
  return (
    <div className="app admin-app">
      <main className="main-content admin-content">
        <div className="admin-header-section">
          <h1 className="admin-title">Admin Dashboard</h1>
          <button onClick={handleLogout} className="admin-logout-button">
            Logout
          </button>
        </div>

        <div className="admin-container">
          <div className="admin-tabs">
            <button
              className={`admin-tab ${activeTab === 'schedule' ? 'active' : ''}`}
              onClick={() => setActiveTab('schedule')}
            >
              Manage Schedule
            </button>
            <button
              className={`admin-tab ${activeTab === 'bookings' ? 'active' : ''}`}
              onClick={() => setActiveTab('bookings')}
            >
              View Bookings
            </button>
          </div>

          {activeTab === 'schedule' && (
            <div className="admin-schedule-section">
              <Calendar
                selectedDate={selectedDate}
                onDateSelect={handleDateSelect}
                selectedSlots={[]}
                availability={availabilityMap}
                loading={false}
                error={null}
                currentMonth={currentMonth}
                onMonthChange={setCurrentMonth}
              />

              {selectedDate && (
                <div className="admin-slot-editor">
                  <h2 className="editor-title">Edit Time Slots</h2>
                  <p className="editor-date">{formatDateDisplay(selectedDate)}</p>

                  <div className="slots-list">
                    {editingSlots.length === 0 && (
                      <p className="no-slots-message">No time slots configured for this date. Add some below!</p>
                    )}
                    {editingSlots.map((slot, index) => (
                      <div key={index} className="slot-row">
                        <div className="slot-inputs">
                          <input
                            type="time"
                            value={slot.startTime}
                            onChange={(e) => updateSlot(index, 'startTime', e.target.value)}
                            className="time-input"
                          />
                          <span className="time-separator">to</span>
                          <input
                            type="time"
                            value={slot.endTime}
                            onChange={(e) => updateSlot(index, 'endTime', e.target.value)}
                            className="time-input"
                          />
                        </div>
                        <button
                          onClick={() => removeSlot(index)}
                          className="remove-slot-button"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="editor-actions">
                    <button onClick={addSlot} className="add-slot-button">
                      + Add Time Slot
                    </button>
                    <button onClick={saveSchedule} className="save-button">
                      Save Schedule
                    </button>
                    {schedule[selectedDate] && schedule[selectedDate].length > 0 && (
                      <button onClick={resetToDefault} className="reset-button">
                        Reset to Default
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'bookings' && (
            <div className="admin-bookings-section">
              <div className="bookings-header">
                <h2 className="bookings-title">All Bookings</h2>
                <button onClick={fetchBookings} className="refresh-button">
                  Refresh
                </button>
              </div>

              <input
                type="text"
                className="bookings-search-input"
                placeholder="Search by name or date (e.g. Sara, June 16)"
                value={bookingSearch}
                onChange={(e) => setBookingSearch(e.target.value)}
              />

              <div className="bookings-list">
                {bookings.length === 0 && <p className="no-bookings">No bookings found</p>}
                {bookings.length > 0 && filteredBookings.length === 0 && (
                  <p className="no-bookings">No bookings match your search</p>
                )}
                {filteredBookings.map((booking, index) => (
                  <div key={index} className={`booking-card status-${booking.status.toLowerCase()}`}>
                    <div className="booking-header">
                      <h3 className="booking-name">{booking.name}</h3>
                      <span className={`booking-status status-${booking.status.toLowerCase()}`}>
                        {booking.status || 'Pending'}
                      </span>
                    </div>

                    <div className="booking-details">
                      <p><strong>Email:</strong> {booking.email}</p>
                      <p><strong>Phone:</strong> {booking.phone}</p>
                      <p><strong>Instagram:</strong> {booking.instagramHandle || 'Not provided'}</p>
                      <p><strong>Submitted:</strong> {booking.timestamp}</p>

                      <div className="booking-slots">
                        <p><strong>Slot Options:</strong></p>
                        <ul>
                          {booking.slot1 && <li>{booking.slot1}</li>}
                          {booking.slot2 && <li>{booking.slot2}</li>}
                          {booking.slot3 && <li>{booking.slot3}</li>}
                        </ul>
                      </div>

                      {booking.acceptedSlot && (
                        <p className="accepted-slot"><strong>Accepted Slot:</strong> {booking.acceptedSlot}</p>
                      )}

                      {booking.depositScreenshot && (
                        <p>
                          <strong>Deposit:</strong>{' '}
                          <a href={booking.depositScreenshot} target="_blank" rel="noopener noreferrer" className="deposit-link">
                            View Screenshot
                          </a>
                        </p>
                      )}
                    </div>

                    {['pending_deposit', 'confirmed', 'Accepted'].includes(booking.status) && (
                      <button
                        onClick={() => cancelBooking(booking)}
                        className="cancel-booking-button"
                      >
                        Cancel Appointment
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Admin;
