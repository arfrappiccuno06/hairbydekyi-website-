import { useState, useEffect } from 'react';
import './About.css';

const About = () => {
  const fullText = "Hi! I'm Dekyi. I am a recent graduate from Marca College and hold a Hair Styling Diploma. Check out my work on my Instagram or TikTok and book with me :)";
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTypingComplete, setIsTypingComplete] = useState(false);

  useEffect(() => {
    if (currentIndex < fullText.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(prev => prev + fullText[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, 35); // Speed of typing in milliseconds

      return () => clearTimeout(timeout);
    } else {
      setIsTypingComplete(true);
    }
  }, [currentIndex, fullText]);

  // Function to render text with Instagram and TikTok links
  const renderText = () => {
    // While the typewriter effect is still running, show plain text
    if (!isTypingComplete) {
      return displayedText;
    }

    const links = {
      Instagram: 'https://www.instagram.com/hairbydekyi/',
      TikTok: 'https://www.tiktok.com/@hairbydekyi',
    };

    // Split on the link words and turn matches into anchors
    const parts = displayedText.split(/(Instagram|TikTok)/);

    return parts.map((part, index) =>
      links[part] ? (
        <a
          key={index}
          href={links[part]}
          target="_blank"
          rel="noopener noreferrer"
          className="instagram-link"
        >
          {part}
        </a>
      ) : (
        part
      )
    );
  };

  return (
    <div className="about-page">
      <div className="about-content">
        <p className="about-text">
          {renderText()}
          {!isTypingComplete && <span className="typing-cursor">|</span>}
        </p>
      </div>
    </div>
  );
};

export default About;
