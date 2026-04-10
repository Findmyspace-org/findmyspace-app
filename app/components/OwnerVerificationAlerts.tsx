"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type SpaceRow = {
  id: string;
  title: string | null;
  ownership_proof_status: string | null;
  status: string | null;
};

type ProfileRow = {
  owner_verification_status: string | null;
  bank_verification_status: string | null;
};

type DocumentRow = {
  document_type: string;
};

export default function OwnerVerificationAlerts() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [bankProofExists, setBankProofExists] = useState(false);

  useEffect(() => {
    loadAlerts();

    const handleFocus = () => {
      loadAlerts();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadAlerts();
      }
    };

    const interval = window.setInterval(() => {
      loadAlerts();
    }, 10000);

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  async function loadAlerts() {
    setLoading(true);
    setMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      // PROFILE
      const { data: rawProfile, error: profileError } = await supabase
        .from("profiles")
        .select("owner_verification_status, bank_verification_status")
        .eq("id", user.id)
        .single();

      if (profileError) {
        setMessage(profileError.message);
        setLoading(false);
        return;
      }

      setProfile(rawProfile as ProfileRow);

      // SPACES
      const { data: rawSpaces, error: spacesError } = await supabase
        .from("spaces")
        .select("id, title, ownership_proof_status, status")
        .eq("owner_id", user.id);

      if (spacesError) {
        setMessage(spacesError.message);
        setLoading(false);
        return;
      }

      setSpaces((rawSpaces || []) as SpaceRow[]);

      // DOCUMENTS
      const { data: docs } = await supabase
        .from("owner_verification_documents")
        .select("document_type")
        .eq("owner_id", user.id);

      setDocuments((docs || []) as DocumentRow[]);

      // BANK
      const { data: rawBank } = await (supabase
        .from("owner_bank_details") as any)
        .select("proof_of_bank_url")
        .eq("owner_id", user.id)
        .maybeSingle();

      const bank = rawBank as { proof_of_bank_url: string | null } | null;

      setBankProofExists(!!bank?.proof_of_bank_url);

      setLoading(false);
    } catch {
      setMessage("Could not load verification alerts.");
      setLoading(false);
    }
  }

  const alerts = useMemo(() => {
    const items: { text: string; href: string }[] = [];

    if (!profile) return items;

    const docTypes = documents.map((d) => d.document_type);

    const hasIdFront = docTypes.includes("id_front");
    const hasIdBack = docTypes.includes("id_back");

    // ---------- OWNER VERIFICATION ----------
    if (!hasIdFront || !hasIdBack) {
      items.push({
        text: "Upload your ID documents (front and back).",
        href: "/dashboard/verification",
      });
    } else if (profile.owner_verification_status === "pending") {
      items.push({
        text: "Your identity verification is pending approval.",
        href: "/dashboard/verification",
      });
    } else if (profile.owner_verification_status === "rejected") {
      items.push({
        text: "Your identity verification was rejected. Please re-upload.",
        href: "/dashboard/verification",
      });
    }

    // ---------- BANK VERIFICATION ----------
    if (!bankProofExists) {
      items.push({
        text: "Upload your bank proof to receive payments.",
        href: "/dashboard/verification",
      });
    } else if (profile.bank_verification_status === "pending") {
      items.push({
        text: "Your bank verification is pending approval.",
        href: "/dashboard/verification",
      });
    } else if (profile.bank_verification_status === "rejected") {
      items.push({
        text: "Your bank verification was rejected. Please update details.",
        href: "/dashboard/verification",
      });
    }

    // ---------- SPACE OWNERSHIP ----------
    const spacesMissingProof = spaces.filter(
      (space) =>
        (space.status || "pending") !== "deleted" &&
        (space.ownership_proof_status || "pending") !== "verified"
    );

    if (spacesMissingProof.length > 0) {
      items.push({
        text: `${spacesMissingProof.length} listing${spacesMissingProof.length === 1 ? "" : "s"
          } need ownership proof approval.`,
        href: "/dashboard/listings",
      });
    }

    return items;
  }, [profile, spaces, documents, bankProofExists]);

  if (loading) return null;

  return (
    <div className="space-y-3">
      {message && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800">
          {message}
        </div>
      )}

      {alerts.map((alert, index) => (
        <div
          key={`${alert.href}-${index}`}
          className="rounded-2xl border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <span>{alert.text}</span>
            <Link
              href={alert.href}
              className="rounded-lg border border-yellow-400 bg-white px-4 py-2 text-sm"
            >
              Fix
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}