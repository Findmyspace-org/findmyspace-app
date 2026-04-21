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
    let redirected = false;
    const currentPath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : pathname;
    const goLogin = () => {
      if (redirected) return;
      redirected = true;
      router.replace(`/login?next=${encodeURIComponent(currentPath)}`);
    };

    async function checkAccess() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (sessionError) {
          setAllowed(false);
          goLogin();
          return;
        }

        if (!session?.user) {
          const {
            data: { user },
            error: userError,
          } = await supabase.auth.getUser();
          if (!mounted) return;
          if (userError || !user) {
            setAllowed(false);
            goLogin();
            return;
          }
        }

        setAllowed(true);
      } catch (error) {
        console.error("RequireAuth check failed:", error);
        if (!mounted) return;
        setAllowed(false);
        goLogin();
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
        goLogin();
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