import { Link } from 'react-router-dom';
import './MenuPanel.css';

const MenuPanel = ({ isOpen, onClose }) => {
  return (
    <>
      {/* Overlay */}
      {isOpen && <div className="menu-overlay" onClick={onClose} />}

      {/* Menu Panel */}
      <div className={`menu-panel ${isOpen ? 'menu-panel-open' : ''}`}>
        <nav className="menu-nav">
          <Link to="/" className="menu-link" onClick={onClose}>Book</Link>
          <Link to="/about" className="menu-link" onClick={onClose}>About</Link>
          <Link to="/pricing" className="menu-link" onClick={onClose}>Pricing</Link>
          <Link to="/contact" className="menu-link" onClick={onClose}>Contact Me</Link>
        </nav>
      </div>
    </>
  );
};

export default MenuPanel;
