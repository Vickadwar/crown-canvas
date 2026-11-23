"use client";

/**
 * @file src/components/player/player-error-boundary.tsx
 * @description Self-healing React Error Boundary for unattended Smart TV browsers.
 * If an older TV browser encounters an unexpected runtime error, it displays a clean
 * recovery card and automatically reloads `/player` after 10 seconds instead of
 * leaving the showroom screen blank.
 */

import React from "react";
import { RefreshCw } from "lucide-react";

interface PlayerErrorBoundaryState {
  hasError: boolean;
  countdown: number;
}

export class PlayerErrorBoundary extends React.Component<
  { children: React.ReactNode },
  PlayerErrorBoundaryState
> {
  private reloadTimer: ReturnType<typeof setInterval> | null = null;

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, countdown: 10 };
  }

  static getDerivedStateFromError(): PlayerErrorBoundaryState {
    return { hasError: true, countdown: 10 };
  }

  componentDidCatch() {
    if (this.reloadTimer) clearInterval(this.reloadTimer);
    this.reloadTimer = setInterval(() => {
      this.setState((prev) => {
        if (prev.countdown <= 1) {
          if (this.reloadTimer) clearInterval(this.reloadTimer);
          if (typeof window !== "undefined") {
            window.location.reload();
          }
          return { hasError: true, countdown: 0 };
        }
        return { hasError: true, countdown: prev.countdown - 1 };
      });
    }, 1000);
  }

  componentWillUnmount() {
    if (this.reloadTimer) clearInterval(this.reloadTimer);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#09090b] p-8 text-center text-white select-none">
          <div className="max-w-md rounded-3xl border border-white/15 bg-white/5 p-8 shadow-2xl">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-300">
              <RefreshCw className="size-6 animate-spin" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              Recovering Display Player
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Restarting automatically in{" "}
              <span className="font-mono font-bold text-white">
                {this.state.countdown}s
              </span>{" "}
              to resume your playlist.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-semibold text-zinc-950 transition hover:bg-zinc-200"
            >
              <RefreshCw className="size-3.5" />
              Reload Now
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
