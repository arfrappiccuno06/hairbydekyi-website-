import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import Header from './components/Header';
import MenuPanel from './components/MenuPanel';
import Footer from './components/Footer';
import BookingPage from './pages/BookingPage';
import About from './pages/About';
import Pricing from './pages/Pricing';
import Contact from './pages/Contact';

function App() {
  const [showMenu, setShowMenu] = useState(false);

  const handleMenuClick = () => {
    setShowMenu(!showMenu);
  };

  const handleMenuClose = () => {
    setShowMenu(false);
  };

  return (
    <Router>
      <div className="app" style={{ backgroundImage: 'url(/hairbydekyibg1.jpg)' }}>
        <Header onMenuClick={handleMenuClick} showMenu={showMenu} />
        <MenuPanel isOpen={showMenu} onClose={handleMenuClose} />

        <Routes>
          <Route path="/" element={<BookingPage />} />
          <Route path="/about" element={<About />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/contact" element={<Contact />} />
        </Routes>

        <Footer />
      </div>
    </Router>
  );
}

export default App;
