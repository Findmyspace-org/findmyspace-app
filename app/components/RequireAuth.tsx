"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type RequireAuthProps = {
  children: React.ReactNode;
};

export default function RequireAuth({ children }: RequireAuthProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (!mounted) return;

        if (error || !user) {
          setAllowed(false);
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }

        setAllowed(true);
      } catch (error) {
        console.error("RequireAuth check failed:", error);
        if (!mounted) return;
        setAllowed(false);
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      } finally {
        if (mounted) {
          setChecking(false);
        }
      }
    }

    checkAccess();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      if (session?.user) {
        setAllowed(true);
        setChecking(false);
      } else {
        setAllowed(false);
        setChecking(false);
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, pathname]);

  if (checking) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-4xl rounded-2xl border border-gray-300 p-6 text-sm text-gray-600 shadow-sm">
          Checking access...
        </div>
      </main>
    );
  }

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}