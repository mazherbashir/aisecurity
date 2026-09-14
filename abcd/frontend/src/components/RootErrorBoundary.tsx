import React from 'react';
import { AlertCircle, RefreshCcw, Trash2 } from 'lucide-react';
import { safeStorage } from '../lib/storage';

interface RootErrorBoundaryProps {
  children: React.ReactNode;
}

interface RootErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class RootErrorBoundary extends React.Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = { hasError: false, error: null };
  props!: RootErrorBoundaryProps;

  constructor(props: RootErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[RootErrorBoundary] Caught fatal application crash:', error, errorInfo);
  }

  handleResetAndReload = () => {
    try {
      safeStorage.clearAllStorage(true);
    } catch (e) {
      console.error('Failed to reset storage:', e);
      try {
        localStorage.clear();
      } catch {}
    }
    window.location.reload();
  };

  handleSimpleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050608] flex items-center justify-center p-6 text-white font-sans">
          <div className="max-w-2xl w-full bento-card p-8 border-red-500/30 bg-red-500/5 space-y-6 shadow-2xl rounded-2xl border">
            <div className="flex items-center gap-4 text-red-500">
              <div className="p-3 bg-red-500/20 rounded-xl">
                <AlertCircle size={32} />
              </div>
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight text-white">
                  Application Recovery
                </h2>
                <p className="text-[10px] text-red-400 font-mono tracking-widest uppercase">
                  UNEXPECTED_STATE_ERROR
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              An unexpected error occurred during rendering or data processing. You can reload your session or safely reset cached storage data to restore functionality immediately.
            </p>

            <div className="space-y-2">
              <div className="p-4 bg-black/70 rounded-xl border border-red-500/20 font-mono text-[11px] text-red-400/90 leading-relaxed overflow-auto max-h-40 whitespace-pre-wrap">
                {this.state.error?.message || 'Unknown Application Error'}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleResetAndReload}
                className="py-3.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl transition-all shadow-xl shadow-rose-900/40 text-xs tracking-wider uppercase flex items-center justify-center gap-2"
              >
                <Trash2 size={16} />
                Reset Storage & Reload
              </button>

              <button
                type="button"
                onClick={this.handleSimpleReload}
                className="py-3.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl transition-all shadow-xl shadow-blue-900/40 text-xs tracking-wider uppercase flex items-center justify-center gap-2"
              >
                <RefreshCcw size={16} />
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
