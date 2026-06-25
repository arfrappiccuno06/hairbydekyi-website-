import './Pricing.css';

const Pricing = () => {
  return (
    <div className="pricing-page">
      <div className="pricing-content">
        <h1 className="pricing-title">Pricing</h1>
        <div className="pricing-item">
          <h2 className="service-name">At Home Cut n Style</h2>
          <p className="service-price">$45</p>
        </div>
        <div className="pricing-divider"></div>
        <p className="pricing-footnote">
          A $5 deposit is required to confirm your appointment. Once your time slot is confirmed, you'll receive an email with a form to submit a screenshot of your deposit. No deposit, no appointment.
        </p>
      </div>
    </div>
  );
};

export default Pricing;
