"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { CLASSIC_HOME_HREF } from "@/lib/v2/ui-version";
import { V2Logo } from "./V2Brand";
import {
  V2DesktopNavigation,
  V2MobileNavigation,
} from "./V2Navigation";
import { V2Badge, V2Container } from "./V2Primitives";
import { useV2PreviewIdentity } from "./V2PreviewGate";

export default function V2Shell({ children }: { children: ReactNode }) {
  const identity = useV2PreviewIdentity();

  return (
    <div className="fms-v2-root">
      <header className="fms-v2-header">
        <V2Container className="fms-v2-header-inner">
          <Link
            href="/v2?ui=v2"
            className="fms-v2-logo-link"
            aria-label="FindMySpace V2 preview home"
          >
            <V2Logo className="fms-v2-logo" priority />
          </Link>

          <V2DesktopNavigation />

          <div className="fms-v2-header-actions">
            <span className="fms-v2-account-label">
              {identity.email || "Super Admin"}
            </span>
            <V2Badge tone="brand">V2 preview</V2Badge>
            <Link
              href={CLASSIC_HOME_HREF}
              className="fms-v2-exit-link"
              aria-label="Exit V2 preview and return to Classic"
            >
              <ArrowLeft aria-hidden />
              <span>Classic</span>
            </Link>
          </div>
        </V2Container>
      </header>

      <main className="fms-v2-main">{children}</main>

      <footer className="fms-v2-footer">
        <V2Container className="fms-v2-footer-inner">
          <div>
            <V2Logo className="fms-v2-footer-logo" />
            <p>Find the right space, in the right place.</p>
          </div>
          <nav aria-label="V2 footer navigation">
            <Link href="/spaces">Browse</Link>
            <Link href="/list-your-space">List your space</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </V2Container>
      </footer>

      <V2MobileNavigation />
    </div>
  );
}
