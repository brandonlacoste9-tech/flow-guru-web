import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6 font-['Outfit']">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md w-full bg-card border border-border rounded-[2.5rem] p-8 text-center shadow-2xl leather-glow"
          >
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="text-red-500 w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold mb-3 tracking-tight">Something went wrong</h1>
            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
              We encountered an unexpected error. Don't worry, your data is safe.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-4 rounded-2xl font-bold hover:opacity-90 transition-all shadow-lg shadow-primary/20"
            >
              <RotateCcw size={16} />
              Reload Application
            </button>
            <p className="mt-6 text-[10px] text-muted-foreground uppercase tracking-widest font-semibold opacity-50">
              Error ID: {Math.random().toString(36).slice(2, 9)}
            </p>
          </motion.div>
        </div>
      );
    }

    return this.children;
  }
}

export default ErrorBoundary;
