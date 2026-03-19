"use client";

import { Component, type ReactNode } from "react";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelButton } from "@/components/ui/pixel-button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-[200px] flex items-center justify-center p-6">
          <PixelCard className="max-w-lg w-full p-6 border-[#E05038]">
            <div className="text-center space-y-4">
              <p className="font-[family-name:var(--font-pixel)] text-[10px] text-[#E05038] uppercase tracking-wider">
                SOMETHING WENT WRONG
              </p>
              <p className="text-sm text-muted-foreground font-[family-name:var(--font-pixel-body)]">
                {this.state.error?.message || "An unexpected error occurred"}
              </p>
              <PixelButton
                size="sm"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                TRY AGAIN
              </PixelButton>
            </div>
          </PixelCard>
        </div>
      );
    }

    return this.props.children;
  }
}
