import { useState } from 'react';
import { Link } from 'react-router';
import { homeExampleFor, marketForHomeExample } from '../shared/homeExample';
import './landing.css';

export default function LandingHero() {
  // Read once, synchronously, in the initialiser — the value cannot change
  // while this page is mounted (the market is chosen inside the tools), and a
  // `useEffect` would paint India's figures first and swap them a frame later,
  // which is a layout-shifting flash on the site's most-visited URL. Reading
  // storage during render is safe here because `marketForHomeExample` is total:
  // it returns the default rather than throwing when storage is unavailable.
  const [example] = useState(() => homeExampleFor(marketForHomeExample()));

  return <section className="fx-home-hero">
    <div className="fx-home-intro">
      <p className="fx-home-kicker">Personal finance, with the workings shown</p>
      <h1>See where your money goes.<br /><span>Decide what comes next.</span></h1>
      <p className="fx-home-lede">Budget, track, plan and understand your money with transparent tools built for India, the US, the UK and the UAE. Review the month, spot repeat payments and compare plans before you commit.</p>
      <div className="fx-home-actions">
        <Link to="/tools/dashboard" className="fx-btn-gold">Open your dashboard <span aria-hidden="true">→</span></Link>
        <Link to="/tools" className="fx-home-text-link">Explore the tools</Link>
      </div>
      <p className="fx-home-caption">Free finance tools. No account needed to start.<br />FinatriX Careers is a separate paid workspace.</p>
    </div>
    <div className="fx-home-preview" aria-label="Illustrative dashboard preview, not your financial data">
      <div className="fx-home-preview-top"><span>Monthly review</span><span>Illustration · {example.currency}</span></div>
      <h2>A month you can account for.</h2>
      <dl className="fx-home-numbers">
        <div><dt>Take-home income</dt><dd>{example.income}</dd></div>
        <div><dt>Recorded spending</dt><dd>{example.spending}</dd></div>
        <div><dt>Set aside</dt><dd>{example.setAside}</dd></div>
        <div className="fx-home-balance"><dt>Still to allocate</dt><dd>{example.left}</dd></div>
      </dl>
      {/* Widths come from the figures above rather than the stylesheet, so the
          bar stays a true picture of them in every market. Decorative: the same
          three numbers are already in the list, named. */}
      <div className="fx-home-allocation" aria-hidden="true">
        <span style={{ width: `${example.bar.spending}%` }} />
        <span style={{ width: `${example.bar.setAside}%` }} />
        <span style={{ width: `${example.bar.left}%` }} />
      </div>
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
