import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { buttonClass } from '../components/ui';

/** Last line of defence for errors thrown outside the router (providers, shell). */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="container" style={{ paddingBlock: '4rem', textAlign: 'center' }}>
        <h1>Something went wrong</h1>
        <p style={{ margin: '1rem 0 2rem', color: 'var(--ink-muted)' }}>An unexpected error occurred. Reloading usually fixes it.</p>
        <button type="button" className={buttonClass()} onClick={() => window.location.reload()}>Reload the page</button>
      </div>
    );
  }
}
