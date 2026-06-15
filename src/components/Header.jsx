import React from 'react';
import './Header.css';

const Header = ({ onMenuClick }) => {
  return (
    <header className="header">
      <button className="menu-button" onClick={onMenuClick} aria-label="Menu">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <h1 className="logo">hairbydekyi</h1>
    </header>
  );
};

export default Header;
