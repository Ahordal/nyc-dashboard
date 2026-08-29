// ErrorBoundary.tsx
//
// Catches render/lifecycle errors in a subtree so one failure doesn't
// blank the whole dashboard. Used at the app root (main.tsx) and around
// each lazy-loaded panel in dashboard.tsx, so e.g. a chart chunk that
// fails to download leaves the map and the rest of the page usable.
//
// Error boundaries still have to be class components in React 19 - there
// is no hook equivalent.

import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
  // What to render in place of the subtree once it has thrown.
  fallback: ReactNode;
  // Tag for the console.error, so a swallowed error still names the
  // subtree it came from.
  context?: string;
  // When this value changes after an error, the boundary clears itself
  // and re-renders its children. Key it to something that represents
  // "the input changed" (e.g. the selected restaurant) so a panel that
  // choked on one record recovers when the user moves on, without a
  // full page reload.
  resetKey?: unknown;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const tag = this.props.context ? ` (${this.props.context})` : "";
    console.error(
      `ErrorBoundary${tag}: caught render error`,
      error,
      info.componentStack,
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (
      this.state.error !== null &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ error: null });
    }
  }

  render() {
    return this.state.error !== null
      ? this.props.fallback
      : this.props.children;
  }
}
