import AuthForm from "@/app/components/AuthForm";

export default function AuthPage() {
  return (
    <main className="min-h-screen bg-white px-6 py-10 text-black">
      <div className="mx-auto max-w-md">
        <h1 className="mb-2 text-4xl font-bold">Account</h1>
        <p className="mb-8 text-gray-600">
          Sign up or log in to manage your spaces.
        </p>

        <div className="rounded-2xl border border-gray-300 p-8 shadow-sm">
          <AuthForm mode="login" />
        </div>
      </div>
    </main>
  );
}