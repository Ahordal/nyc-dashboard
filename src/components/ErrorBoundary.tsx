// ErrorBoundary.tsx
//
// Catches render/lifecycle errors in a subtree, so one failure doesn't
// blank the dashboard. Wraps the app root and each lazy panel, so e.g. a
// failed chart leaves the map usable.
//
// Must be a class component — React 19 has no hook equivalent for error boundaries.

import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
  // What to render in place of the subtree once it has thrown.
  fallback: ReactNode;
  // Tags the console.error, so a swallowed error still names its subtree.
  context?: string;
  // Clears the boundary when this changes after an error. Key it to "the
  // input changed" (selected restaurant) so panels recover without a reload.
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
