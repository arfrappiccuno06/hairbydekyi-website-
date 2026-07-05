import { useState } from 'react';
import './FAQ.css';

const FAQ = () => {
  const [expandedIndex, setExpandedIndex] = useState(null);

  const faqs = [
    {
      question: "How do I book an appointment?",
      answer: "Select 3 time slot options on my booking page. After submitting, you'll receive an email once I approve one of your slots. You'll then have 24 hours to submit your $5 deposit to confirm your appointment."
    },
    {
      question: "How do deposits work?",
      answer: "A $5 deposit is required to secure your appointment. After your time slot is approved, you'll receive an email with a link to submit a screenshot of your e-transfer deposit. You have 24 hours to submit it, or the slot becomes available again."
    },
    {
      question: "What if I don't submit my deposit within 24 hours?",
      answer: "Your approved time slot will be released and become available for others to book. You'll receive an email notification and can rebook by selecting new time slots on my website."
    },
    {
      question: "How do appointment slots work?",
      answer: "You select 3 preferred time slots when booking. I'll review them and approve one based on availability. This gives you flexibility and increases your chances of getting an appointment that works for you."
    },
    {
      question: "Am I guaranteed an appointment the first time I pick 3 slots?",
      answer: "While not guaranteed, it's very rare that none of your 3 slots work out! I do my best to accommodate at least one of your preferred times. If none are available, you'll be notified and can submit new time options."
    },
    {
      question: "What if I need to cancel my appointment?",
      answer: "You can cancel directly using the link in your confirmation email. Please note that the $5 deposit is non-refundable. When you cancel, the time slot becomes available for others to book immediately. If you have any issues, contact me at hairbydekyi@gmail.com or DM @hairbydekyi on Instagram."
    },
    {
      question: "What if I already sent my deposit but need to rebook or change my appointment time?",
      answer: "Cancel your current appointment using the link in your confirmation email, then rebook with new time slots. When submitting your new booking, attach the same deposit screenshot - you only need to e-transfer once per appointment!"
    },
    {
      question: "Where do appointments take place?",
      answer: "I provide at-home hair services! The location will be confirmed after your appointment is booked."
    },
    {
      question: "What services are offered?",
      answer: "I offer At Home Cut n Style services for $45. Check my Pricing page for more details!"
    },
    {
      question: "How long does an appointment take?",
      answer: "Appointments are typically 90 minutes long, giving me plenty of time to create your perfect look."
    },
    {
      question: "What payment methods are accepted?",
      answer: "For the deposit, I accept e-transfer. For final payment, I accept either e-transfer or cash. You'll receive e-transfer details in your confirmation email."
    }
  ];

  const toggleExpanded = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <div className="faq-page">
      <div className="faq-content">
        <h1 className="faq-title">Frequently Asked Questions</h1>

        <div className="faq-list">
          {faqs.map((faq, index) => (
            <div key={index} className="faq-item" onClick={() => toggleExpanded(index)}>
              <div className="faq-question-wrapper">
                <h3 className="faq-question">{faq.question}</h3>
                <span className="faq-icon">{expandedIndex === index ? '−' : '+'}</span>
              </div>
              {expandedIndex === index && (
                <p className="faq-answer">{faq.answer}</p>
              )}
            </div>
          ))}
        </div>

        <div className="faq-contact">
          <p className="faq-contact-text">
            Still have questions? Reach out to me at{' '}
            <a href="mailto:hairbydekyi@gmail.com" className="faq-link">hairbydekyi@gmail.com</a>
            {' '}or DM me on Instagram{' '}
            <a href="https://www.instagram.com/hairbydekyi/" target="_blank" rel="noopener noreferrer" className="faq-link">@hairbydekyi</a>
            . You can also check out my work on TikTok{' '}
            <a href="https://www.tiktok.com/@hairbydekyi" target="_blank" rel="noopener noreferrer" className="faq-link">@hairbydekyi</a>!
          </p>
        </div>
      </div>
    </div>
  );
};

export default FAQ;
