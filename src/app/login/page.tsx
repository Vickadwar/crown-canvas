"use client";

/**
 * @file src/app/login/page.tsx
 * @description Enterprise Supabase Auth sign-in page for Crown Paints CMS administrators.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, LogIn, ArrowLeft } from "lucide-react";
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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) {
      toast.error("Supabase URL/Anon Key not configured in .env.local");
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Signed in to Crown Canvas");
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-white">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <div className="rounded-2xl bg-white px-5 py-2.5 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/media/logo/CrownLogo.png"
              alt="Crown Paints"
              className="h-12 w-auto object-contain"
            />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Crown Canvas</h1>
            <p className="text-xs text-slate-400">
              East Africa Enterprise Signage CMS
            </p>
          </div>
        </div>

        <Card className="border-slate-800 bg-slate-900 text-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lock className="size-4 text-amber-400" />
              Enterprise Sign In
            </CardTitle>
            <CardDescription className="text-slate-400">
              Sign in with your Crown Paints Supabase Auth account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Work Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@crownpaints.co.ke"
                  className="border-slate-700 bg-slate-950"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  className="border-slate-700 bg-slate-950"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 font-bold text-slate-950 hover:bg-amber-400"
              >
                <LogIn className="size-4" />
                {loading ? "Signing In..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
          >
            <ArrowLeft className="size-3.5" />
            Back to CMS
          </Link>
        </div>
      </div>
    </div>
  );
}
