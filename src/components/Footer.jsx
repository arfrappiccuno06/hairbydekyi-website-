import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <h2 className="footer-logo">hairbydekyi</h2>
      <nav className="footer-nav">
        <Link to="/" className="footer-link">Book</Link>
        <Link to="/faq" className="footer-link">FAQ</Link>
        <Link to="/about" className="footer-link">About</Link>
        <Link to="/pricing" className="footer-link">Pricing</Link>
      </nav>
      <p className="footer-copyright">© 2026 hairbydekyi</p>
    </footer>
  );
};

export default Footer;
