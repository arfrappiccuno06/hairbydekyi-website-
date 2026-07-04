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
  // In admin mode, ALL dates should be clickable (not just ones with slots)
  useEffect(() => {
    const availMap = {};

    // Get current month's date range
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Make all dates in the current month clickable
    const currentDate = new Date(firstDay);
    while (currentDate <= lastDay) {
      const dateString = currentDate.toISOString().split('T')[0];
      // Mark all dates as available (admin can configure any date)
      availMap[dateString] = ['editable'];
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
    // Load existing slots for this date or empty array
    const existingSlots = schedule[date] || [];
    setEditingSlots(existingSlots.map(s => ({ startTime: s.startTime, endTime: s.endTime })));

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

  const cancelBooking = async (booking) => {
    if (!confirm(`Are you sure you want to cancel ${booking.name}'s appointment?`)) {
      return;
    }

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
        }),
      });

      if (response.ok) {
        alert('Booking cancelled and client notified');
        fetchBookings();
      } else {
        alert('Failed to cancel booking');
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

              <div className="bookings-list">
                {bookings.length === 0 && <p className="no-bookings">No bookings found</p>}
                {bookings.map((booking, index) => (
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

                    {booking.status === 'Accepted' && (
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
