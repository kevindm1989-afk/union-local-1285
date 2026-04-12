import { Component, ReactNode } from "react";

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

const isDev = import.meta.env.DEV;

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Unhandled render error:", error);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
          <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
          {isDev && this.state.error && (
            <div className="mb-4 w-full max-w-lg text-left">
              <p className="text-sm font-semibold text-destructive mb-1">
                {this.state.error.name}: {this.state.error.message}
              </p>
              {this.state.error.stack && (
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap text-left text-muted-foreground max-h-48 overflow-y-auto">
                  {this.state.error.stack}
                </pre>
              )}
            </div>
          )}
          {!isDev && (
            <p className="text-muted-foreground mb-4">
              Please refresh the page. If the problem persists contact your administrator.
            </p>
          )}
          <p className="text-xs text-muted-foreground mb-4">
            Error: {this.state.error?.message ?? "Unknown error"}
          </p>
          <button
            className="px-4 py-2 bg-primary text-primary-foreground rounded"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
