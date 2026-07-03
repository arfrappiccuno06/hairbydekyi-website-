import { useState, useEffect } from 'react';
import '../styles/Admin.css';

function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' or 'bookings'
  const [schedule, setSchedule] = useState({});
  const [bookings, setBookings] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [editingSlots, setEditingSlots] = useState([]);

  // Check authentication on mount
  useEffect(() => {
    checkAuth();
  }, []);

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
        fetchSchedule();
        fetchBookings();
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
    // Load existing slots for this date or default template
    const existingSlots = schedule[date] || [];
    setEditingSlots(existingSlots.map(s => ({ startTime: s.startTime, endTime: s.endTime })));
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

  // Loading state
  if (isLoading) {
    return (
      <div className="admin-loading">
        <p>Loading...</p>
      </div>
    );
  }

  // Login form
  if (!isAuthenticated) {
    return (
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
    );
  }

  // Admin Dashboard
  return (
    <div className="admin-container">
      <header className="admin-header">
        <h1>Admin Dashboard</h1>
        <button onClick={handleLogout} className="admin-logout-button">
          Logout
        </button>
      </header>

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
          <h2>Schedule Manager</h2>

          <div className="admin-date-input">
            <label>
              Select Date (or DEFAULT_MONDAY, DEFAULT_SUNDAY, etc.):
              <input
                type="text"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                placeholder="YYYY-MM-DD or DEFAULT_MONDAY"
                className="admin-input"
              />
            </label>
            <button onClick={() => handleDateSelect(selectedDate)} className="admin-button">
              Load Date
            </button>
          </div>

          {selectedDate && (
            <div className="admin-slots-editor">
              <h3>Editing: {selectedDate}</h3>

              {editingSlots.map((slot, index) => (
                <div key={index} className="admin-slot-row">
                  <input
                    type="time"
                    value={slot.startTime}
                    onChange={(e) => updateSlot(index, 'startTime', e.target.value)}
                    className="admin-time-input"
                  />
                  <span>to</span>
                  <input
                    type="time"
                    value={slot.endTime}
                    onChange={(e) => updateSlot(index, 'endTime', e.target.value)}
                    className="admin-time-input"
                  />
                  <button
                    onClick={() => removeSlot(index)}
                    className="admin-remove-button"
                  >
                    Remove
                  </button>
                </div>
              ))}

              <div className="admin-actions">
                <button onClick={addSlot} className="admin-button">
                  Add Slot
                </button>
                <button onClick={saveSchedule} className="admin-save-button">
                  Save Schedule
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'bookings' && (
        <div className="admin-bookings-section">
          <h2>All Bookings</h2>
          <button onClick={fetchBookings} className="admin-refresh-button">
            Refresh
          </button>

          <div className="admin-bookings-list">
            {bookings.length === 0 && <p>No bookings found</p>}
            {bookings.map((booking, index) => (
              <div key={index} className={`admin-booking-card status-${booking.status.toLowerCase()}`}>
                <div className="booking-header">
                  <h3>{booking.name}</h3>
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
                    <p><strong>Accepted Slot:</strong> {booking.acceptedSlot}</p>
                  )}

                  {booking.depositScreenshot && (
                    <p>
                      <strong>Deposit:</strong>{' '}
                      <a href={booking.depositScreenshot} target="_blank" rel="noopener noreferrer">
                        View Screenshot
                      </a>
                    </p>
                  )}
                </div>

                {booking.status === 'Accepted' && (
                  <button
                    onClick={() => cancelBooking(booking)}
                    className="admin-cancel-button"
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
  );
}

export default Admin;
