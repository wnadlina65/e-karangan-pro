/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
  }

  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    const { children } = this.props;
    if (this.state.hasError) {
      let errorMessage = 'Sesuatu yang tidak kena telah berlaku.';
      
      try {
        if (this.state.error) {
          const errorData = JSON.parse(this.state.error.message);
          if (errorData.error && errorData.error.includes('insufficient permissions')) {
            errorMessage = 'Ralat Kebenaran: Anda tidak mempunyai akses ke data ini.';
          }
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
          <div className="bg-slate-900 border border-red-500/30 p-8 rounded-3xl max-w-md shadow-2xl">
            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span className="text-3xl text-red-500">⚠️</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-4">Oops! Ralat Berlaku</h1>
            <p className="text-slate-400 mb-8">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-emerald-500 text-white py-3 rounded-xl font-bold hover:bg-emerald-600 transition-colors"
            >
              Muat Semula Laman
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}
