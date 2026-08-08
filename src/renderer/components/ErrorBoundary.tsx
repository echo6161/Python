import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';

import { rendererLogger } from '../logger';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    rendererLogger.error('Renderer error boundary caught an error', error, {
      componentStack: info.componentStack ?? '',
    });
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-8 text-zinc-900">
          <section className="w-full max-w-md border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <TriangleAlert aria-hidden="true" className="mx-auto mb-4 size-8 text-amber-600" />
            <h1 className="text-xl font-semibold">PaperMind could not render this view</h1>
            <p className="mt-2 text-sm text-zinc-600">The error was recorded locally.</p>
            <button
              className="mx-auto mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              type="button"
              onClick={() => window.location.reload()}
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              Reload
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
