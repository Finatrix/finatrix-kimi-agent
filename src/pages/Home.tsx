import LandingNav from '../sections/LandingNav';
import LandingHero from '../sections/LandingHero';
import LandingShowcase from '../sections/LandingShowcase';
import LandingClose from '../sections/LandingClose';
import LandingFooter from '../sections/LandingFooter';

export default function Home() {
  return (
    <div className="relative bg-[#060607]">
      <LandingNav />
      <LandingHero />
      <LandingShowcase />
      <LandingClose />
      <LandingFooter />
    </div>
  );
}
