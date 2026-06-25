import { useState, useEffect } from 'react';
import './About.css';

const About = () => {
  const fullText = "Hi! I'm Dekyi. I am a recent graduate from Marca College and hold a Hair Styling Diploma. Check out my work on my instagram page @hairbydekyi and book with me :)";
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

  // Function to render text with Instagram link
  const renderText = () => {
    const instagramHandle = '@hairbydekyi';
    const instagramIndex = displayedText.indexOf(instagramHandle);

    if (instagramIndex === -1 || !isTypingComplete) {
      return displayedText;
    }

    const beforeLink = displayedText.substring(0, instagramIndex);
    const afterLink = displayedText.substring(instagramIndex + instagramHandle.length);

    return (
      <>
        {beforeLink}
        <a
          href="https://www.instagram.com/hairbydekyi/"
          target="_blank"
          rel="noopener noreferrer"
          className="instagram-link"
        >
          {instagramHandle}
        </a>
        {afterLink}
      </>
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
