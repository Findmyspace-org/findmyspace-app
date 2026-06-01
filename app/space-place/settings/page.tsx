"use client";

import { Card, PageTitle } from "../components/SpacePlaceShell";

export default function SpacePlaceSettingsPage() {
  return (
    <div>
      <PageTitle title="Integrations" subtitle="Coming soon" />

      <Card className="mb-4">
        <h3 className="text-lg font-semibold">Email logging</h3>
        <p className="mt-2 text-sm text-neutral-600">
          BCC <strong>crm@findmyspace.co.za</strong> on outreach emails to
          automatically log engagements. This integration is not active yet.
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
