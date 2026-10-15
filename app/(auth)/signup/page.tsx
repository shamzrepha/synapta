"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { BrainCircuit, AlertCircle, ArrowRight, GraduationCap, User } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SignupPage() {
  const { signUpWithEmail, signInWithGoogle, isLoading } = useAuth();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [requestTeacher, setRequestTeacher] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name || !email || !password) {
      setError("Please fill in all required fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setSubmitting(true);
    try {
      await signUpWithEmail(email, password, name, requestTeacher, username.trim() || undefined);
      window.location.assign("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create account";
      if (msg.includes("auth/email-already-in-use")) {
        setError("An account with this email already exists. Please log in instead.");
      } else if (msg.includes("auth/operation-not-allowed")) {
        setError("Email/Password sign-in is not enabled yet in your Firebase project. Please enable it in Firebase Console under Authentication > Sign-in method.");
      } else if (msg.includes("auth/unauthorized-domain")) {
        setError("This domain is not authorized in Firebase Auth. Add sunrootlearn.vercel.app under Firebase Console > Authentication > Settings > Authorized domains.");
      } else if (msg.includes("Cloud Firestore API") || msg.includes("FIRESTORE_DISABLED")) {
        setError("Cloud Firestore is not initialized yet in your Firebase Console. Please go to https://console.firebase.google.com/project/synapta-learning/firestore and click 'Create database'.");
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithGoogle(requestTeacher);
      window.location.assign("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      if (msg.includes("Cloud Firestore API") || msg.includes("FIRESTORE_DISABLED")) {
        setError("Cloud Firestore is not initialized yet in your Firebase Console. Please go to https://console.firebase.google.com/project/synapta-learning/firestore and click 'Create database'.");
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-8 bg-[#F7F6F2] dark:bg-[#0B0F14] text-slate-900 dark:text-slate-100">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 font-bold shadow-sm">
              <BrainCircuit className="h-6 w-6" />
            </div>
            <span className="font-bold text-2xl tracking-tight">Sunroot</span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Join the next generation of adaptive cognitive learning
          </p>
        </div>

        {/* Signup Card */}
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Sign Up</CardTitle>
            <CardDescription>Choose your learning role and credentials</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Role Selection Cards */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Primary Role
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRequestTeacher(false)}
                  className={cn(
                    "flex flex-col items-center p-3 rounded-xl border text-left transition-all",
                    !requestTeacher
                      ? "border-teal-500 bg-teal-500/10 text-teal-900 dark:text-teal-200 ring-2 ring-teal-500/30"
                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400"
                  )}
                >
                  <User className="h-5 w-5 mb-1.5 text-teal-600 dark:text-teal-400" />
                  <span className="text-xs font-bold">Student</span>
                  <span className="text-[10px] opacity-80 text-center">Instant Access</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRequestTeacher(true)}
                  className={cn(
                    "flex flex-col items-center p-3 rounded-xl border text-left transition-all",
                    requestTeacher
                      ? "border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/30"
                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400"
                  )}
                >
                  <GraduationCap className="h-5 w-5 mb-1.5 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-bold">Teacher</span>
                  <span className="text-[10px] opacity-80 text-center">Admin Approval</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Full Name
                </label>
                <Input
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Unique @username
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-mono">@</span>
                  <Input
                    type="text"
                    placeholder="your_handle"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24))}
                    className="pl-7"
                  />
                </div>
                <p className="text-[10px] text-slate-400">Used by friends to search and message you</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Email Address
                </label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <Input
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                isLoading={submitting || isLoading}
              >
                Create Account
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </form>

            <div className="relative flex items-center justify-center py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-800" />
              </div>
              <span className="relative bg-white dark:bg-slate-900 px-3 text-xs uppercase text-slate-400">
                Or continue with
              </span>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleSignup}
              disabled={submitting || isLoading}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  fill="#EA4335"
                />
              </svg>
              Google
            </Button>
          </CardContent>
          <CardFooter className="justify-center border-t border-slate-100 dark:border-slate-800/60 pt-4">
            <p className="text-xs text-slate-500">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-teal-600 dark:text-teal-400 hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
