import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../lib/errorReporting';
import { isChunkLoadError, reloadIfBuildIsStale } from '../lib/chunkRecovery';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  /**
   * Set when the error was a part of the app failing to load rather than a bug
   * in a page. `checking` while it is being established whether a newer build
   * explains it (nothing is shown: the page may be about to reload); `failed`
   * once it is known that a reload will not help.
   */
  chunk: 'none' | 'checking' | 'failed';
}

/**
 * Catches render-time errors anywhere in the tree and shows a graceful fallback
 * instead of a blank white screen. Saved data is unaffected.
 *
 * A chunk that failed to load is handled apart from a real crash (see
 * lib/chunkRecovery.ts). It is not a glitch on our end and "go to the home
 * page" is the wrong cure: the page reloads itself where it stands when a
 * newer build is the reason, and otherwise says what actually happened —
 * usually no connection — and offers to try the same page again.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, chunk: 'none' };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, chunk: isChunkLoadError(error) ? 'checking' : 'none' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log for debugging (dev console only).
    console.error('Unhandled UI error:', error, info);
    // Privacy-first telemetry: error TYPE + route only, never message/stack.
    reportError(isChunkLoadError(error) ? 'ChunkLoadError' : error.name, 'boundary');
    // Reload onto the newer build if there is one. If there is not, a reload
    // would change nothing, so say what happened instead.
    if (isChunkLoadError(error)) {
      void reloadIfBuildIsStale().then((reloading) => {
        if (!reloading) this.setState({ chunk: 'failed' });
      });
    }
  }

  private handleReload = () => {
    this.setState({ hasError: false, chunk: 'none' });
    window.location.assign('/');
  };

  /** Try the page the user was actually on, rather than sending them home. */
  private handleRetryHere = () => {
    window.location.reload();
  };

  render() {
    // Finding out whether a newer build explains it, or already reloading onto
    // one: show nothing rather than flash an error at someone who did nothing
    // wrong and whose page may be about to be replaced.
    if (this.state.hasError && this.state.chunk === 'checking') return null;
    if (this.state.hasError && this.state.chunk === 'failed') {
      return (
        <div role="alert" aria-live="assertive" className="relative min-h-[100dvh] overflow-hidden bg-surface-base text-ink flex flex-col items-center justify-center px-6 text-center">
          <span className="relative font-mono text-[11px] uppercase tracking-[0.18em] text-accent-text mb-4">
            Couldn&rsquo;t load
          </span>
          <h1 className="relative text-[32px] sm:text-[44px] font-medium tracking-[-0.02em] leading-tight">
            This page didn&rsquo;t finish loading
          </h1>
          <p className="relative mt-4 max-w-[440px] text-[15px] text-ink-2 leading-relaxed">
            Part of FinatriX could not be downloaded. That usually means the connection dropped. Your saved data is safe. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={this.handleRetryHere}
            className="relative mt-8 text-[14px] text-[#0A0A0A] bg-[#D4AF37] hover:bg-[#F1C40F] px-5 py-3 rounded-full transition-colors font-medium"
          >
            Try again
          </button>
        </div>
      );
    }
    if (this.state.hasError) {
      return (
        <div role="alert" aria-live="assertive" className="relative min-h-[100dvh] overflow-hidden bg-surface-base text-ink flex flex-col items-center justify-center px-6 text-center">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px] opacity-[0.16]" style={{ background: 'radial-gradient(circle, #E6C766 0%, #9c7a26 40%, transparent 70%)' }} />
          <span className="relative font-mono text-[11px] uppercase tracking-[0.18em] text-accent-text mb-4">
            Something broke
          </span>
          <h1 className="relative text-[32px] sm:text-[44px] font-medium tracking-[-0.02em] leading-tight">
            A small glitch on our end
          </h1>
          <p className="relative mt-4 max-w-[440px] text-[15px] text-ink-2 leading-relaxed">
            The page hit an unexpected error. Your saved data is safe. Try reloading.
          </p>
          <button
            onClick={this.handleReload}
            className="relative mt-8 text-[14px] text-[#0A0A0A] bg-[#D4AF37] hover:bg-[#F1C40F] px-5 py-3 rounded-full transition-colors font-medium"
          >
            Reload FinatriX
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
