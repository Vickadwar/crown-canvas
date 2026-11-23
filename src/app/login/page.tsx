"use client";

/**
 * @file src/app/login/page.tsx
 * @description Universal minimalist white-label sign-in page with forced temporary/expired
 * password routing, suspension detection, first-time Super Admin /setup discovery, and
 * zero-email administrator reset guidance.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showResetHelp, setShowResetHelp] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(() => {
    if (urlError === "suspended") {
      return "Your account has been suspended. Please contact your administrator.";
    }
    if (urlError === "no_role") {
      return "Your account does not have an assigned role yet. Ask an administrator to assign access.";
    }
    return null;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/auth/bootstrap", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { needsSetup?: boolean };
        if (active && json.needsSetup) {
          setNeedsSetup(true);
        }
      } catch {
        // Non-blocking check
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setErrorBanner(null);

    if (!isSupabaseConfigured()) {
      setErrorBanner(
        "Authentication service is not configured in environment variables."
      );
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        setErrorBanner(
          error.message.toLowerCase().includes("banned")
            ? "Your account has been suspended. Please contact your administrator."
            : "Invalid email or password. Please check your credentials and try again."
        );
        return;
      }

      // Inspect DB account status, forced temp-password change, and expiry policy
      const sessionRes = await fetch("/api/auth/session", {
        cache: "no-store",
      });
      if (sessionRes.ok) {
        const session = (await sessionRes.json()) as {
          isActive?: boolean;
          mustChangePassword?: boolean;
          passwordExpired?: boolean;
          enforceAuth?: boolean;
          scopes?: unknown[];
        };

        if (session.isActive === false) {
          await supabase.auth.signOut();
          setErrorBanner(
            "Your account has been suspended. Please contact your administrator."
          );
          return;
        }

        if (session.mustChangePassword) {
          toast.info("Please replace your temporary password to continue.");
          router.push("/change-password?reason=temporary");
          router.refresh();
          return;
        }

        if (session.passwordExpired) {
          toast.info("Your password has expired. Please set a new password.");
          router.push("/change-password?reason=expired");
          router.refresh();
          return;
        }

        if (
          session.enforceAuth &&
          Array.isArray(session.scopes) &&
          session.scopes.length === 0
        ) {
          setErrorBanner(
            "Your account is signed in, but no role has been assigned yet. Contact your administrator."
          );
          return;
        }
      }

      toast.success("Signed in to Crown Canvas");
      const safeTarget =
        nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
      router.push(safeTarget);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#fafafa] p-6 text-zinc-950">
      <div className="w-full max-w-md space-y-5">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/media/logo/CrownLogo.png"
            alt="Crown Paints"
            className="h-12 w-auto object-contain"
          />
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-950">
              Crown Canvas
            </h1>
            <p className="text-xs text-zinc-500">
              Enterprise Digital Signage Platform
            </p>
          </div>
        </div>

        {needsSetup && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 text-xs text-blue-950">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="size-4 shrink-0 text-blue-600" />
              <div>
                <p className="font-semibold">First-time setup available</p>
                <p className="text-blue-800/80">
                  No administrator accounts exist yet. Create your initial Super Admin.
                </p>
              </div>
            </div>
            <Link href="/setup">
              <Button size="xs" variant="default">
                Setup
              </Button>
            </Link>
          </div>
        )}

        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="size-4 text-blue-600" />
              Sign In
            </CardTitle>
            <CardDescription>
              Enter your work email and password (or temporary password issued by your administrator).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorBanner && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{errorBanner}</span>
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Work Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    suppressHydrationWarning
                    onClick={() => setShowResetHelp((v) => !v)}
                    className="text-[11px] font-medium text-blue-600 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="pr-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    suppressHydrationWarning
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-2 text-zinc-400 hover:text-zinc-700"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {showResetHelp && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                  <p className="flex items-center gap-1.5 font-semibold text-zinc-900">
                    <KeyRound className="size-3.5 text-blue-600" />
                    Need a password reset?
                  </p>
                  <p className="mt-1">
                    Contact your Crown Canvas administrator. They will issue a one-time
                    temporary password from <strong>Team &amp; Access</strong>, and you will be
                    prompted to set your own new password as soon as you sign in.
                  </p>
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                <LogIn className="size-4" />
                {loading ? "Signing In..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-4 text-xs text-zinc-500">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 hover:text-zinc-950"
          >
            <ArrowLeft className="size-3.5" />
            Back to CMS
          </Link>
          <span>•</span>
          <Link href="/player" className="hover:text-zinc-950">
            Open Screen Player
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#fafafa] text-xs text-zinc-500">
          Loading sign in...
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
