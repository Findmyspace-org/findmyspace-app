"use client";

import Link from "next/link";
import { useSpacePlace } from "../SpacePlaceContext";
import { Card, PageTitle } from "../components/SpacePlaceShell";

const LINK_CLASS =
  "flex min-h-[52px] items-center rounded-2xl border border-neutral-200 bg-white px-5 text-lg font-semibold shadow-sm";

export default function MorePage() {
  const { isAdmin } = useSpacePlace();

  return (
    <div>
      <PageTitle title="More" subtitle="Contacts, reports & settings" />

      <div className="grid gap-3">
        <Link href="/space-place/contacts" className={LINK_CLASS}>
          Contacts
        </Link>
        <Link href="/space-place/dashboard" className={LINK_CLASS}>
          {isAdmin ? "Admin dashboard" : "My dashboard"}
        </Link>
        {isAdmin ? (
          <>
            <Link href="/space-place/tasks" className={LINK_CLASS}>
              All tasks
            </Link>
            <Link href="/space-place/pipeline" className={LINK_CLASS}>
              Pipeline
            </Link>
          </>
        ) : (
          <Link href="/space-place/pipeline" className={LINK_CLASS}>
            My pipeline
          </Link>
        )}
        <Link href="/space-place/settings" className={LINK_CLASS}>
          Integrations
        </Link>
        <Link href="/" className={`${LINK_CLASS} text-neutral-600`}>
          Back to FindMySpace
        </Link>
      </div>

      <Card className="mt-6">
        <p className="text-sm text-neutral-600">
          The Space Place helps you build relationships with new spaces — fast
          logging, clear pipeline, and team visibility.
        </p>
      </Card>
    </div>
  );
}
