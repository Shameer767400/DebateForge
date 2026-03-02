import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={styles.root}>
        <div style={styles.card}>
          <div style={styles.icon}>⚠️</div>
          <h1 style={styles.title}>Something went wrong</h1>
          <p style={styles.desc}>
            An unexpected error occurred. Don't worry — your data is safe.
          </p>
          {this.state.error && (
            <pre style={styles.detail}>
              {this.state.error.message || String(this.state.error)}
            </pre>
          )}
          <div style={styles.btns}>
            <button style={styles.primaryBtn} onClick={this.handleReload}>
              Reload Page
            </button>
            <button style={styles.secondaryBtn} onClick={this.handleGoHome}>
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at top, #181826 0%, #050508 60%)',
    fontFamily: 'var(--font-ui)',
    padding: '24px',
  },
  card: {
    maxWidth: '440px',
    width: '100%',
    textAlign: 'center',
    padding: '48px 32px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  icon: {
    fontSize: '3rem',
    marginBottom: '16px',
  },
  title: {
    margin: '0 0 8px',
    fontSize: '1.4rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  desc: {
    margin: '0 0 20px',
    fontSize: '0.88rem',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },
  detail: {
    margin: '0 0 20px',
    padding: '10px 14px',
    fontSize: '0.74rem',
    color: '#ff4d6a',
    background: 'rgba(255, 77, 106, 0.06)',
    border: '1px solid rgba(255, 77, 106, 0.18)',
    borderRadius: '8px',
    textAlign: 'left',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '120px',
    overflowY: 'auto',
  },
  btns: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  primaryBtn: {
    padding: '11px 24px',
    fontSize: '0.88rem',
    fontWeight: 600,
    color: '#000',
    background: 'linear-gradient(135deg, var(--accent-user), var(--accent-blue))',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '11px 24px',
    fontSize: '0.88rem',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    cursor: 'pointer',
  },
};

export default ErrorBoundary;
