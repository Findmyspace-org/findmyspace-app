"use client";

import { useState } from "react";
import {
  Building2,
  CheckSquare,
  MessageSquare,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { PageTitle } from "../components/SpacePlaceShell";
import { AddActionCard } from "../components/AddActionCard";
import { SmartCaptureModal } from "../components/SmartCaptureButton";

export default function AddPage() {
  const [smartCaptureOpen, setSmartCaptureOpen] = useState(false);

  return (
    <div>
      <PageTitle title="Add" subtitle="Capture work or create a new space" />

      <div className="grid gap-3">
        <AddActionCard
          title="Smart Capture"
          description="Type or paste a natural-language update and let AI create the space, contact, engagement and task."
          icon={Sparkles}
          accent
          onClick={() => setSmartCaptureOpen(true)}
        />
        <AddActionCard
          href="/space-place/spaces/new"
          title="Add Space Manually"
          description="Add a new organisation/space and contact person manually."
          icon={Building2}
        />
        <AddActionCard
          href="/space-place/contacts/new"
          title="Add Contact"
          description="Add a contact to an existing space."
          icon={UserPlus}
        />
        <AddActionCard
          href="/space-place/add/log"
          title="Log Interaction"
          description="Log a call, WhatsApp, email, meeting or note."
          icon={MessageSquare}
        />
        <AddActionCard
          href="/space-place/tasks/new"
          title="Add Task"
          description="Create a follow-up task for yourself or assign it to a Spacer."
          icon={CheckSquare}
        />
      </div>

      <SmartCaptureModal
        open={smartCaptureOpen}
        onClose={() => setSmartCaptureOpen(false)}
      />
    </div>
  );
}
