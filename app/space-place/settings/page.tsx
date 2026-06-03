"use client";

import { getCrmCaptureEmail } from "@/lib/space-place/crm-email";
import { Card, PageTitle } from "../components/SpacePlaceShell";

export default function SpacePlaceSettingsPage() {
  const captureEmail = getCrmCaptureEmail();

  return (
    <div>
      <PageTitle title="Integrations" subtitle="Coming soon" />

      <Card className="mb-4">
        <h3 className="text-lg font-semibold">Email logging</h3>
        <p className="mt-2 text-sm text-neutral-600">
          Use <strong>Email</strong> on any CRM contact to open your mail client with BCC to{" "}
          <strong>{captureEmail}</strong> and a subject tag{" "}
          <code className="text-xs">[CRM:contact-id]</code> for automatic linking when inbox
          import is enabled.
        </p>
      </Card>

      <Card>
        <h3 className="text-lg font-semibold">WhatsApp</h3>
        <p className="mt-2 text-sm text-neutral-600">
          WhatsApp Business API logging will connect here. For now, use manual
          logging or Quick Update from any screen.
        </p>
      </Card>
    </div>
  );
}
