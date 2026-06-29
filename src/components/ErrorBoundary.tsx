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
        <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F0] flex flex-col items-center justify-center px-6 text-center">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#D4AF37] mb-4">
            Something broke
          </span>
          <h1 className="text-[32px] sm:text-[44px] font-medium tracking-[-0.02em] leading-tight">
            A small glitch on our end
          </h1>
          <p className="mt-4 max-w-[440px] text-[15px] text-[#8A8A8A] leading-relaxed">
            The page hit an unexpected error. Your saved data is safe. Try reloading.
          </p>
          <button
            onClick={this.handleReload}
            className="mt-8 font-mono text-[12px] uppercase tracking-[0.08em] text-[#0A0A0A] bg-[#D4AF37] hover:bg-[#F1C40F] px-5 py-3 transition-colors"
          >
            Reload FinatriX
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
