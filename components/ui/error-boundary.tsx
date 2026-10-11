"use client";

import React, { Component, ReactNode } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "./button";
import { Card, CardContent } from "./card";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary caught an error]:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 my-4">
          <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
            <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-red-900 dark:text-red-200">
                {this.props.fallbackTitle || "This section failed to load"}
              </h3>
              <p className="text-xs text-red-700/80 dark:text-red-400/80 mt-1 max-w-md">
                {this.props.fallbackMessage ||
                  (this.state.error?.message
                    ? `Error: ${this.state.error.message}`
                    : "An unexpected error occurred while rendering this module.")}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30"
              onClick={this.handleRetry}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
