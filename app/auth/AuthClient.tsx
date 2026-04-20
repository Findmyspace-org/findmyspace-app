"use client";

import { useSearchParams } from "next/navigation";
import AuthForm from "@/app/components/AuthForm";

export default function AuthClient() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  return <AuthForm mode="login" nextPathOverride={next || undefined} />;
}
