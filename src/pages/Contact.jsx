import './Contact.css';

const Contact = () => {
  return (
    <div className="contact-page">
      <div className="contact-content">
        <h1 className="contact-title">Contact Me</h1>

        <div className="contact-item">
          <h2 className="contact-label">Email</h2>
          <a href="mailto:hairbydekyi@gmail.com" className="contact-link">
            hairbydekyi@gmail.com
          </a>
        </div>

        <div className="contact-item">
          <h2 className="contact-label">Instagram</h2>
          <a
            href="https://www.instagram.com/hairbydekyi/"
            target="_blank"
            rel="noopener noreferrer"
            className="contact-link"
          >
            @hairbydekyi
          </a>
        </div>

      </div>
    </div>
  );
};

export default Contact;
