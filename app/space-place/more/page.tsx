"use client";

import Link from "next/link";
import { useSpacePlace } from "../SpacePlaceContext";
import { Card, PageTitle } from "../components/SpacePlaceShell";
import { SPACER_INVITE_DISCLAIMER } from "@/lib/space-place/access";

const LINK_CLASS =
  "flex min-h-[52px] items-center rounded-2xl border border-neutral-200 bg-white px-5 text-lg font-semibold shadow-sm active:bg-neutral-50";

export default function MorePage() {
  const { isAdmin } = useSpacePlace();

  return (
    <div>
      <PageTitle
        title="More"
        subtitle={isAdmin ? "Team, tasks, and settings" : "Your work and settings"}
      />

      <div className="grid gap-3">
        {isAdmin ? (
          <>
            <Link href="/space-place/team" className={LINK_CLASS}>
              Team
            </Link>
            <Link href="/space-place/team/invite" className={LINK_CLASS}>
              Invite Spacer
            </Link>
          </>
        ) : (
          <>
            <Link href="/space-place/spaces" className={LINK_CLASS}>
              My Spaces
            </Link>
            <Link href="/space-place/tasks" className={LINK_CLASS}>
              My Tasks
            </Link>
          </>
        )}

        {isAdmin ? (
          <Link href="/space-place/tasks" className={LINK_CLASS}>
            Tasks
          </Link>
        ) : null}

        <Link href="/space-place/dashboard" className={LINK_CLASS}>
          {isAdmin ? "Dashboard" : "My dashboard"}
        </Link>

        <Link href="/space-place/activity" className={LINK_CLASS}>
          Activity
        </Link>

        <Link href="/space-place/contacts" className={LINK_CLASS}>
          Contacts
        </Link>

        <Link href="/space-place/settings" className={LINK_CLASS}>
          Settings
        </Link>

        <Link href="/" className={`${LINK_CLASS} text-neutral-600`}>
          Back to FindMySpace
        </Link>
      </div>

      <Card className="mt-6">
        <p className="text-sm text-neutral-600">{SPACER_INVITE_DISCLAIMER}</p>
      </Card>
    </div>
  );
}
