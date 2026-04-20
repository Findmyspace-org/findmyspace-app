"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getPendingAdvisorCode, setPendingAdvisorCode } from "@/lib/advisor-code";

type AuthFormProps = {
  mode: "login" | "signup";
  hideFooterLinks?: boolean;
  nextPathOverride?: string;
  isModal?: boolean;
  onSignupSuccess?: () => void;
};

export default function AuthForm({
  mode,
  hideFooterLinks = false,
  nextPathOverride,
  isModal = false,
  onSignupSuccess,
}: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";

  const nextPath = nextPathOverride || searchParams.get("next") || "/dashboard";

  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;
  const signupHref = `/signup?next=${encodeURIComponent(nextPath)}`;

  async function claimPendingAdvisor(accessToken: string) {
    const code = getPendingAdvisorCode();
    if (!code) return;
    try {
      const res = await fetch("/api/advisor/claim-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        setPendingAdvisorCode(null);
      }
    } catch {
      /* non-fatal */
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (isSignup) {
        const cleanFirstName = firstName.trim() || null;
        const cleanLastName = lastName.trim() || null;
        const cleanPhone = phone.trim() || null;

        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: cleanFirstName,
              last_name: cleanLastName,
              phone: cleanPhone,
            },
          },
        });

        if (error) {
          setMessage(error.message);
          setLoading(false);
          return;
        }

        const signedUpUser = signUpData?.user ?? null;

        if (signedUpUser?.id) {
          const cleanEmail = email.trim() || null;
          const cleanFullName = [cleanFirstName, cleanLastName]
            .filter(Boolean)
            .join(" ")
            .trim() || null;

          const { error: profileError } = await supabase.from("profiles").upsert(
            {
              id: signedUpUser.id,
              first_name: cleanFirstName,
              last_name: cleanLastName,
              full_name: cleanFullName,
              email: cleanEmail,
              phone: cleanPhone,
            } as any,
            { onConflict: "id" }
          );

          if (profileError) {
            setMessage(profileError.message);
            setLoading(false);
            return;
          }

          const { data: sess } = await supabase.auth.getSession();
          if (sess?.session?.access_token) {
            await claimPendingAdvisor(sess.session.access_token);
          }
        }

        setLoading(false);

        if (isModal) {
          setFirstName("");
          setLastName("");
          setPhone("");
          setEmail("");
          setPassword("");
          setMessage("Account created. Please log in.");
          onSignupSuccess?.();
          return;
        }

        setFirstName("");
        setLastName("");
        setPhone("");
        setEmail("");
        setPassword("");
        router.push(`/login?next=${encodeURIComponent(nextPath)}`);
        router.refresh();
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const { data: sessAfter } = await supabase.auth.getSession();
      if (sessAfter?.session?.access_token) {
        await claimPendingAdvisor(sessAfter.session.access_token);
      }

      window.location.replace(nextPath);
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-md border border-gray-200 bg-white p-8 shadow-sm">
      <h1 className="mb-2 text-3xl font-bold text-[#192a3a]">
        {isSignup ? "Create account" : "Log in"}
      </h1>

      <p className="mb-6 text-sm text-gray-600">
        {isSignup
          ? "Create your FindMySpace account to list or book spaces."
          : "Log in to manage listings and bookings."}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {isSignup && (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium">First name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none focus:border-[#192a3a]"
                placeholder="Your first name"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Surname</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none focus:border-[#192a3a]"
                placeholder="Your surname"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Phone number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none focus:border-[#192a3a]"
                placeholder="Your phone number"
                required
              />
            </div>
          </>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none focus:border-[#192a3a]"
            placeholder="you@example.com"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none focus:border-[#192a3a]"
            placeholder="Enter password"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-[#192a3a] px-4 py-3 text-white disabled:opacity-60"
        >
          {loading
            ? isSignup
              ? "Creating account..."
              : "Logging in..."
            : isSignup
            ? "Create account"
            : "Log in"}
        </button>
      </form>

      {message && (
        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
          {message}
        </div>
      )}

      {!hideFooterLinks && (
        <div className="mt-6 text-sm text-gray-600">
          {isSignup ? (
            <p>
              Already have an account?{" "}
              <Link href={loginHref} className="font-medium text-[#192a3a] underline">
                Log in
              </Link>
            </p>
          ) : (
            <p>
              Need an account?{" "}
              <Link href={signupHref} className="font-medium text-[#192a3a] underline">
                Sign up
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}