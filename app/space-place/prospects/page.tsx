"use client";
import { crmDb } from "@/lib/space-place/db";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { PIPELINE_STAGE_LABELS } from "@/lib/space-place/constants";
import type { CrmOrganisation } from "@/lib/space-place/types";
import { useSpacePlace } from "../SpacePlaceContext";
import { Card, PageTitle } from "../components/SpacePlaceShell";

export default function ProspectsPage() {
  const { profile } = useSpacePlace();
  const [orgs, setOrgs] = useState<CrmOrganisation[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await crmDb.organisations()
      .select("*")
      .eq("assigned_to", profile.id)
      .order("name");
    setOrgs((data as CrmOrganisation[]) || []);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageTitle title="My Prospects" subtitle="Spaces assigned to you" />
      {orgs.length === 0 ? (
        <p className="text-neutral-500">No assigned prospects yet.</p>
      ) : (
        orgs.map((o) => (
          <Link key={o.id} href={`/space-place/organisations/${o.id}`}>
            <Card className="mb-3">
              <p className="text-lg font-semibold">{o.name}</p>
              <p className="text-sm text-neutral-600">
                {PIPELINE_STAGE_LABELS[o.pipeline_stage]}
              </p>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
