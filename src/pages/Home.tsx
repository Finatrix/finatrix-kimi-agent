import LandingNav from '../sections/LandingNav';
import LandingHero from '../sections/LandingHero';
import LandingFooter from '../sections/LandingFooter';

export default function Home() {
  return (
    <div className="relative bg-[#070707]">
      <LandingNav />
      <LandingHero />
      <LandingFooter />
    </div>
  );
}
