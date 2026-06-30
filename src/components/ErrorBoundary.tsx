import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/**
 * Catches render-time errors anywhere in the tree and shows a graceful fallback
 * instead of a blank white screen. Saved data is unaffected.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log for debugging; replace with a real logging service if desired.
    console.error('Unhandled UI error:', error, info);
  }

  private handleReload = () => {
    this.setState({ hasError: false });
    window.location.assign('/');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="relative min-h-screen overflow-hidden bg-[#060607] text-[#F5F5F0] flex flex-col items-center justify-center px-6 text-center">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px] opacity-[0.16]" style={{ background: 'radial-gradient(circle, #E6C766 0%, #9c7a26 40%, transparent 70%)' }} />
          <span className="relative font-mono text-[11px] uppercase tracking-[0.18em] text-[#D4AF37] mb-4">
            Something broke
          </span>
          <h1 className="relative text-[32px] sm:text-[44px] font-medium tracking-[-0.02em] leading-tight">
            A small glitch on our end
          </h1>
          <p className="relative mt-4 max-w-[440px] text-[15px] text-[#8A8A8A] leading-relaxed">
            The page hit an unexpected error. Your saved data is safe. Try reloading.
          </p>
          <button
            onClick={this.handleReload}
            className="relative mt-8 font-mono text-[12px] uppercase tracking-[0.08em] text-[#0A0A0A] bg-[#D4AF37] hover:bg-[#F1C40F] px-5 py-3 rounded-full transition-colors"
          >
            Reload FinatriX
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
