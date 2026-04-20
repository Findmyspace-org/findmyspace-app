import { Suspense } from "react";
import AuthForm from "@/app/components/AuthForm";

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-white px-6 py-10 text-black">
      <div className="mx-auto max-w-xl">
        <Suspense fallback={<div className="text-sm text-gray-600">Loading...</div>}>
          <AuthForm mode="signup" />
        </Suspense>
      </div>
    </main>
  );
}