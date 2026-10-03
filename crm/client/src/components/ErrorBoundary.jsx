import { Component } from 'react';
import ErrorPage from './ui/ErrorPage.jsx';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    // Never the stack trace: that goes to the console, for whoever investigates.
    return <ErrorPage status={500} fullHeight onRetry={() => window.location.reload()} />;
  }
}
