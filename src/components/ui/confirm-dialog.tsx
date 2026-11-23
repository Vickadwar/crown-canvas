"use client";

/**
 * @file src/components/ui/confirm-dialog.tsx
 * @description Minimalist Vercel/Linear in-app confirmation modal & React context hook
 * (`useConfirm`) replacing all native browser `window.confirm()` popups across the CMS.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, KeyRound, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const handleResolve = useCallback((result: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOptions(null);
    resolve?.(result);
  }, []);

  useEffect(() => {
    if (!options) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleResolve(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [options, handleResolve]);

  const variant = options?.variant ?? "default";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onClick={() => handleResolve(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5 p-5">
              <div
                className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border ${
                  variant === "danger"
                    ? "border-rose-200 bg-rose-50 text-rose-600"
                    : variant === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-600"
                      : "border-blue-200 bg-blue-50 text-blue-600"
                }`}
              >
                {variant === "danger" ? (
                  <Trash2 className="size-4" />
                ) : variant === "warning" ? (
                  <AlertTriangle className="size-4" />
                ) : (
                  <KeyRound className="size-4" />
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h3
                    id="confirm-dialog-title"
                    className="text-sm font-semibold text-zinc-950"
                  >
                    {options.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleResolve(false)}
                    className="rounded-md p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                    aria-label="Close confirmation"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-zinc-600">
                  {options.description}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/70 px-5 py-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleResolve(false)}
              >
                {options.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={variant === "danger" ? "destructive" : "default"}
                className={
                  variant === "danger"
                    ? "border-rose-600 bg-rose-600 text-white hover:bg-rose-700 hover:text-white"
                    : undefined
                }
                onClick={() => handleResolve(true)}
              >
                {options.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    return async (opts) => Promise.resolve(Boolean(opts));
  }
  return ctx;
}
