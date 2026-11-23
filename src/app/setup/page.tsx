"use client";

/**
 * @file src/app/setup/page.tsx
 * @description First-time Super Admin onboarding page. Automatically redirects to /login
 * once at least one user exists in the database.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
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
import {
  DEFAULT_PASSWORD_POLICY,
  validatePasswordPolicy,
  type PasswordPolicyConfig,
} from "@/lib/permissions";

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [policy, setPolicy] = useState<PasswordPolicyConfig>(DEFAULT_PASSWORD_POLICY);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/auth/bootstrap", { cache: "no-store" });
        const json = (await res.json()) as {
          needsSetup?: boolean;
          policy?: PasswordPolicyConfig;
        };
        if (!active) return;
        if (json.policy) setPolicy(json.policy);
        if (!json.needsSetup) {
          router.replace("/login");
          return;
        }
        setNeedsSetup(true);
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  const validation = validatePasswordPolicy(password, policy);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    if (!validation.valid) {
      toast.error(validation.errors[0]);
      return;
    }
    if (!passwordsMatch) {
      toast.error("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Could not create Super Admin account");
        return;
      }

      if (isSupabaseConfigured()) {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
      }

      toast.success("Super Admin account created — welcome to Crown Canvas!");
      router.push("/");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (checking || !needsSetup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa] text-xs text-zinc-500">
        Checking workspace setup status...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#fafafa] p-6 text-zinc-950">
      <div className="w-full max-w-md space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/media/logo/CrownLogo.png"
            alt="Crown Paints"
            className="h-12 w-auto object-contain"
          />
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-950">
              Initial Administrator Setup
            </h1>
            <p className="text-xs text-zinc-500">
              Create your first Super Admin account. This page locks permanently afterward.
            </p>
          </div>
        </div>

        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-violet-600" />
              Create Super Admin
            </CardTitle>
            <CardDescription>
              Full platform access to create roles, provision team accounts, and configure password expiry.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSetup} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Work Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
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

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              {/* Policy Checklist */}
              <div className="space-y-1 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[11px]">
                <PolicyRow
                  ok={password.length >= policy.minPasswordLength}
                  label={`At least ${policy.minPasswordLength} characters`}
                />
                {policy.requireUppercase && (
                  <PolicyRow
                    ok={/[A-Z]/.test(password)}
                    label="Includes an uppercase letter (A-Z)"
                  />
                )}
                <PolicyRow
                  ok={/[a-z]/.test(password)}
                  label="Includes a lowercase letter (a-z)"
                />
                {policy.requireNumber && (
                  <PolicyRow
                    ok={/[0-9]/.test(password)}
                    label="Includes a number (0-9)"
                  />
                )}
                <PolicyRow ok={passwordsMatch} label="Passwords match" />
              </div>

              <Button
                type="submit"
                disabled={submitting || !validation.valid || !passwordsMatch}
                className="w-full"
              >
                <ShieldCheck className="size-4" />
                {submitting ? "Creating Super Admin..." : "Create Super Admin & Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center text-xs text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-blue-600 hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

function PolicyRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={`flex items-center gap-1.5 ${
        ok ? "text-emerald-700" : "text-zinc-500"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="size-3.5 text-emerald-600" />
      ) : (
        <Circle className="size-3.5 text-zinc-300" />
      )}
      <span>{label}</span>
    </div>
  );
}
