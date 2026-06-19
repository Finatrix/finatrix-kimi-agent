import { useEffect, useRef } from 'react';
import Lenis from '@studio-freight/lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import Navigation from '../sections/Navigation';
import Hero from '../sections/Hero';
import Ticker from '../sections/Ticker';
import About from '../sections/About';
import Infrastructure from '../sections/Infrastructure';
import Capabilities from '../sections/Capabilities';
import Footer from '../sections/Footer';

gsap.registerPlugin(ScrollTrigger);

export default function Home() {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.05,
      smoothWheel: true,
    });
    lenisRef.current = lenis;

    // Sync Lenis with GSAP ScrollTrigger
    lenis.on('scroll', ScrollTrigger.update);

    gsap.ticker.add((time) => {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenis.destroy();
      gsap.ticker.remove(lenis.raf as any);
    };
  }, []);

  return (
    <div className="relative">
      <Navigation />
      <Hero />
      <Ticker />
      <About />
      <Infrastructure />
      <Capabilities />
      <Footer />
    </div>
  );
}
