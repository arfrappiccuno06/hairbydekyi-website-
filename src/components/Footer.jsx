import React from 'react';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <h2 className="footer-logo">hairbydekyi</h2>
      <nav className="footer-nav">
        <a href="#book" className="footer-link">Book</a>
        <a href="#faq" className="footer-link">FAQ</a>
        <a href="#about" className="footer-link">About</a>
        <a href="#pricing" className="footer-link">Pricing</a>
      </nav>
      <p className="footer-copyright">© 2026 hairbydekyi</p>
    </footer>
  );
};

export default Footer;
