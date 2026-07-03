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
          A $5 deposit is required to confirm your appointment. After your time slot is approved, you'll receive an email with a link to submit your deposit screenshot. You have 24 hours to submit, or the slot will become available again.
        </p>
      </div>
    </div>
  );
};

export default Pricing;
