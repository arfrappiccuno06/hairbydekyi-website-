import './Header.css';

const Header = ({ onMenuClick, showMenu }) => {
  return (
    <header className="header">
      <button
        className={`menu-button ${showMenu ? 'menu-open' : ''}`}
        onClick={onMenuClick}
        aria-label="Menu"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line className="menu-line top" x1="3" y1="6" x2="21" y2="6" />
          <line className="menu-line middle" x1="3" y1="12" x2="21" y2="12" />
          <line className="menu-line bottom" x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <h1 className="logo">hairbydekyi</h1>
    </header>
  );
};

export default Header;
