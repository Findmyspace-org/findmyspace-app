"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import AuthForm from "@/app/components/AuthForm";

type Props = {
  open: boolean;
  mode: "login" | "signup";
  nextPath: string;
  onClose: () => void;
  onSwitchMode: (mode: "login" | "signup") => void;
};

export default function AuthModal({
  open,
  mode,
  nextPath,
  onClose,
  onSwitchMode,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-[10000] w-full max-w-md rounded-md bg-white shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-lg text-gray-500 hover:text-black"
          aria-label="Close"
        >
          ✕
        </button>

        <div className="p-6">
          <AuthForm
            mode={mode}
            hideFooterLinks
            nextPathOverride={nextPath}
            isModal
            onSignupSuccess={() => onSwitchMode("login")}
          />

          <div className="mt-4 text-center text-sm text-gray-600">
            {mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => onSwitchMode("login")}
                  className="font-medium text-[#192a3a] underline"
                >
                  Log in
                </button>
              </>
            ) : (
              <>
                Need an account?{" "}
                <button
                  type="button"
                  onClick={() => onSwitchMode("signup")}
                  className="font-medium text-[#192a3a] underline"
                >
                  Sign up
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}