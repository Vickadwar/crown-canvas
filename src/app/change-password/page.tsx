"use client";

/**
 * @file src/app/change-password/page.tsx
 * @description Mandatory & self-service password change gate supporting:
 * 1) First-login / admin-reset temporary password replacement
 * 2) Expired password renewal per organization expiry policy
 * 3) Voluntary current-password-verified self-service password update
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
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

interface SessionProbe {
  authenticated: boolean;
  email: string | null;
  fullName: string | null;
  mustChangePassword?: boolean;
  passwordExpired?: boolean;
  passwordPolicy?: PasswordPolicyConfig;
}

function ChangePasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reasonParam = searchParams.get("reason");

  const [session, setSession] = useState<SessionProbe | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!res.ok) {
          router.replace("/login");
          return;
        }
        const json = (await res.json()) as SessionProbe;
        if (!active) return;
        if (!json.authenticated) {
          router.replace("/login");
          return;
        }
        setSession(json);
      } finally {
        if (active) setLoadingSession(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  const policy = session?.passwordPolicy ?? DEFAULT_PASSWORD_POLICY;
  const isForcedTemp =
    Boolean(session?.mustChangePassword) || reasonParam === "temporary";
  const isForcedExpired =
    !isForcedTemp &&
    (Boolean(session?.passwordExpired) || reasonParam === "expired");
  const isMandatory = isForcedTemp || isForcedExpired;

  const validation = validatePasswordPolicy(
    newPassword,
    policy,
    currentPassword || undefined
  );
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!validation.valid) {
      setErrorMsg(validation.errors[0]);
      return;
    }
    if (!passwordsMatch) {
      setErrorMsg("New password and confirmation do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(json.error || "Failed to update password");
        return;
      }

      toast.success("Password updated successfully!");
      router.push("/");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    if (isSupabaseConfigured()) {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    }
    router.push("/login");
  }

  if (loadingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa] text-xs text-zinc-500">
        Verifying session...
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
            className="h-11 w-auto object-contain"
          />
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-950">
              {isForcedTemp
                ? "Set Your New Password"
                : isForcedExpired
                  ? "Password Expired"
                  : "Change Password"}
            </h1>
            <p className="text-xs text-zinc-500">
              Signed in as <strong className="text-zinc-700">{session?.email}</strong>
            </p>
          </div>
        </div>

        {isForcedTemp && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">Temporary password detected</p>
              <p className="mt-0.5 text-amber-800">
                For security, please enter your temporary password and choose a personal
                password before accessing the CMS.
              </p>
            </div>
          </div>
        )}

        {isForcedExpired && (
          <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-xs text-blue-950">
            <Clock className="mt-0.5 size-4 shrink-0 text-blue-600" />
            <div>
              <p className="font-semibold">
                Password reached {policy.passwordExpiryDays}-day expiry policy
              </p>
              <p className="mt-0.5 text-blue-800">
                Verify your current password and set a new password to continue using Crown Canvas.
              </p>
            </div>
          </div>
        )}

        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="size-4 text-blue-600" />
              Update Credentials
            </CardTitle>
            <CardDescription>
              {isForcedTemp
                ? "Enter the temporary password you just signed in with, followed by your new password."
                : "Enter your current password to verify your identity, then choose a new password."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMsg && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">
                  {isForcedTemp ? "Current (Temporary) Password" : "Current Password"}
                </Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showPasswords ? "text" : "password"}
                    autoComplete="current-password"
                    className="pr-9"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    suppressHydrationWarning
                    onClick={() => setShowPasswords((v) => !v)}
                    className="absolute right-2.5 top-2 text-zinc-400 hover:text-zinc-700"
                    aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
                  >
                    {showPasswords ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type={showPasswords ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPasswords ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[11px]">
                <CheckRow
                  ok={newPassword.length >= policy.minPasswordLength}
                  label={`At least ${policy.minPasswordLength} characters`}
                />
                {policy.requireUppercase && (
                  <CheckRow
                    ok={/[A-Z]/.test(newPassword)}
                    label="Includes an uppercase letter (A-Z)"
                  />
                )}
                <CheckRow
                  ok={/[a-z]/.test(newPassword)}
                  label="Includes a lowercase letter (a-z)"
                />
                {policy.requireNumber && (
                  <CheckRow
                    ok={/[0-9]/.test(newPassword)}
                    label="Includes a number (0-9)"
                  />
                )}
                <CheckRow
                  ok={
                    newPassword.length > 0 &&
                    (!currentPassword || newPassword !== currentPassword)
                  }
                  label="Different from current password"
                />
                <CheckRow ok={passwordsMatch} label="Confirmation matches" />
              </div>

              <Button
                type="submit"
                disabled={
                  submitting ||
                  !currentPassword ||
                  !validation.valid ||
                  !passwordsMatch
                }
                className="w-full"
              >
                <KeyRound className="size-4" />
                {submitting ? "Updating Password..." : "Save New Password & Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-4 text-xs text-zinc-500">
          {!isMandatory && (
            <>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 hover:text-zinc-950"
              >
                <ArrowLeft className="size-3.5" />
                Back to CMS
              </Link>
              <span>•</span>
            </>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 hover:text-zinc-950"
          >
            <LogOut className="size-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
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

export default function ChangePasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#fafafa] text-xs text-zinc-500">
          Loading password update...
        </div>
      }
    >
      <ChangePasswordContent />
    </Suspense>
  );
}
