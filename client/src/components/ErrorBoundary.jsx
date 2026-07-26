import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('StockSense crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div id="auth">
          <div className="auth-box">
            <div className="auth-card" style={{ textAlign: 'center' }}>
              <div className="auth-h">Something went wrong</div>
              <p className="auth-sub" style={{ marginTop: 8, marginBottom: 20 }}>
                StockSense hit an unexpected error. Your data is safe — refreshing usually fixes this.
              </p>
              <button className="btn-primary" onClick={() => window.location.reload()}>Reload</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
