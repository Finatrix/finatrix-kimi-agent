import { Link } from 'react-router';
import './landing.css';

export default function LandingHero() {
  return <section className="fx-home-hero">
    <div className="fx-home-intro">
      <p className="fx-home-kicker">Personal finance, with the workings shown</p>
      <h1>See where your money goes.<br /><span>Decide what comes next.</span></h1>
      <p className="fx-home-lede">Bring your budget, spending and goals into one dashboard. Review the month, spot repeat payments and compare plans before you commit.</p>
      <div className="fx-home-actions">
        <Link to="/tools/dashboard" className="fx-btn-gold">Open your dashboard <span aria-hidden="true">→</span></Link>
        <Link to="/welcome" className="fx-home-text-link">Walk me through setup</Link>
      </div>
      <p className="fx-home-caption">Free finance tools. No account needed to start.<br />FinatriX Careers is a separate paid workspace.</p>
    </div>
    <div className="fx-home-preview" aria-label="Illustrative dashboard preview, not your financial data">
      <div className="fx-home-preview-top"><span>Monthly review</span><span>Illustration · INR</span></div>
      <h2>A month you can account for.</h2>
      <dl className="fx-home-numbers"><div><dt>Take-home income</dt><dd>₹80,000</dd></div><div><dt>Recorded spending</dt><dd>₹36,500</dd></div><div><dt>Set aside</dt><dd>₹16,000</dd></div><div className="fx-home-balance"><dt>Still to allocate</dt><dd>₹27,500</dd></div></dl>
      <div className="fx-home-allocation" aria-hidden="true"><span /><span /><span /></div>
      <div className="fx-home-example-note"><span>One thing for next month</span><p>Review the subscriptions I no longer use. Put the difference toward my emergency fund.</p></div>
      <p className="fx-home-caption">Example figures. Your dashboard starts with your own records.</p>
    </div>
    <div className="fx-home-foundations">
      <div><strong>Start with the everyday</strong><p>Income, bills and a plan for the month.</p></div>
      <div><strong>Understand the assumptions</strong><p>India, US, UK and UAE market settings.</p></div>
      <div><strong>Keep control of your data</strong><p>Local guest records, optional account sync.</p></div>
    </div>
  </section>;
}
