import { Component, ErrorInfo, ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faArrowsRotate } from '@fortawesome/free-solid-svg-icons';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="investigation-error-banner" role="alert" style={{ margin: '1rem', padding: '1.5rem' }}>
          <div className="error-icon" style={{ fontSize: '2rem', color: '#DC2626' }}>
            <FontAwesomeIcon icon={faTriangleExclamation} />
          </div>
          <div className="error-content" style={{ flex: 1 }}>
            <div className="error-title" style={{ fontSize: '1rem', fontWeight: 800, color: '#991B1B', marginBottom: '0.4rem' }}>
              {this.props.fallbackTitle || 'Decision Support Temporarily Unavailable'}
            </div>
            <div className="error-message" style={{ fontSize: '0.84rem', color: '#4B5563', marginBottom: '1rem' }}>
              {this.props.fallbackMessage || this.state.error?.message || 'An unexpected rendering error occurred while assembling decision support data.'}
            </div>
            <button
              type="button"
              className="btn-retry"
              onClick={this.handleReset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: '#2F8F46',
                color: '#FFFFFF',
                border: 'none',
                padding: '0.6rem 1.1rem',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              <FontAwesomeIcon icon={faArrowsRotate} /> Retry Decision Support
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
