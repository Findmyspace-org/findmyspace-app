"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/space-place/constants";
import { FIELD_CLASS, LABEL_CLASS } from "@/lib/space-place/form-ui";
import { ORGANISATION_TYPES } from "@/lib/space-place/organisation-types";
import type { CrmProfile } from "@/lib/space-place/types";
import { useSpacePlace } from "../../SpacePlaceContext";
import { PageTitle, PrimaryButton } from "../../components/SpacePlaceShell";
import { SpacerSelect } from "../../components/SpacerSelect";

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export default function NewSpacePage() {
  const router = useRouter();
  const { isAdmin, profile } = useSpacePlace();

  const [spacers, setSpacers] = useState<CrmProfile[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>("prospect");
  const [assignedTo, setAssignedTo] = useState(profile?.id || "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [opportunitySize, setOpportunitySize] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadSpacers = useCallback(async () => {
    const { crmDb } = await import("@/lib/space-place/db");
    const { data } = await crmDb.profiles().select("*").eq("active", true);
    setSpacers((data as CrmProfile[]) || []);
  }, []);

  useEffect(() => {
    if (!isAdmin && profile) {
      setAssignedTo(profile.id);
    }
    if (isAdmin) {
      void loadSpacers();
    }
  }, [isAdmin, profile, loadSpacers]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setMessage("Space / organisation name is required.");
      return;
    }

    setSaving(true);
    setMessage(null);

    const token = await getAccessToken();
    if (!token) {
      setMessage("Please sign in again.");
      setSaving(false);
      return;
    }

    const res = await fetch("/api/space-place/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: name.trim(),
        type: type || null,
        pipeline_stage: pipelineStage,
        assigned_to: assignedTo || null,
        website: website.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        lead_source: leadSource.trim() || null,
        opportunity_size: opportunitySize.trim() || null,
        contact: {
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          role: role.trim() || null,
          phone: phone.trim() || null,
          whatsapp: whatsapp.trim() || null,
          email: email.trim() || null,
        },
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setMessage(data.error || "Could not save space.");
      return;
    }

    router.push(`/space-place/organisations/${data.organisationId}`);
  }

  return (
    <form onSubmit={save} className="space-y-4 pb-6">
      <Link
        href="/space-place/add"
        className="text-sm font-semibold text-[#c1121f]"
      >
        ← Back to Add
      </Link>

      <PageTitle
        title="Add Space"
        subtitle="Create a new organisation and main contact"
      />

      <label className="block">
        <span className={LABEL_CLASS}>Space / Organisation name</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={FIELD_CLASS}
          placeholder="Vrymansfontein"
        />
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>Organisation type</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={FIELD_CLASS}
        >
          <option value="">Select type</option>
          {ORGANISATION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>Pipeline stage</span>
        <select
          value={pipelineStage}
          onChange={(e) => setPipelineStage(e.target.value as PipelineStage)}
          className={FIELD_CLASS}
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {PIPELINE_STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      {isAdmin ? (
        <label className="block">
          <span className={LABEL_CLASS}>Assigned Spacer</span>
          <SpacerSelect
            value={assignedTo}
            onChange={setAssignedTo}
            spacers={spacers}
          />
        </label>
      ) : (
        <p className="text-sm text-neutral-600">
          Assigned to you ({profile?.full_name || profile?.email})
        </p>
      )}

      <h3 className="pt-2 text-sm font-bold uppercase tracking-wide text-neutral-500">
        Main contact
      </h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL_CLASS}>First name</span>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Last name</span>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={FIELD_CLASS}
          />
        </label>
      </div>

      <label className="block">
        <span className={LABEL_CLASS}>Contact role</span>
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={FIELD_CLASS}
          placeholder="Facilities manager"
        />
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>Cell phone</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>WhatsApp number</span>
        <input
          type="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>Website</span>
        <input
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className={FIELD_CLASS}
          placeholder="https://"
        />
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>Address</span>
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={2}
          className={FIELD_CLASS}
        />
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={FIELD_CLASS}
        />
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>
          Estimated spaces / opportunity size{" "}
          <span className="font-normal text-neutral-500">(optional)</span>
        </span>
        <input
          value={opportunitySize}
          onChange={(e) => setOpportunitySize(e.target.value)}
          className={FIELD_CLASS}
          placeholder="e.g. 12 storage units"
        />
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>
          Lead source <span className="font-normal text-neutral-500">(optional)</span>
        </span>
        <input
          value={leadSource}
          onChange={(e) => setLeadSource(e.target.value)}
          className={FIELD_CLASS}
          placeholder="Referral, cold call, event…"
        />
      </label>

      {message ? <p className="text-sm text-red-600">{message}</p> : null}

      <PrimaryButton type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save space"}
      </PrimaryButton>
    </form>
  );
}
