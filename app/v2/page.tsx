import { ArrowRight, Search } from "lucide-react";
import { V2MapMarker } from "@/app/components/v2/V2Brand";
import {
  V2Badge,
  V2Button,
  V2Card,
  V2Container,
  V2IconButton,
  V2Input,
  V2PageHeading,
  V2Section,
} from "@/app/components/v2/V2Primitives";

export default function V2FoundationPreviewPage() {
  return (
    <V2Container>
      <V2Section>
        <V2PageHeading
          eyebrow="Presentation foundation"
          title="A calmer FindMySpace experience."
          description="This protected preview proves that V2 can use its own shell, tokens and brand components while Classic remains the default application."
        />

        <div className="fms-v2-preview-actions">
          <V2Button href="/spaces">
            Open Classic browse
            <ArrowRight className="h-4 w-4" aria-hidden />
          </V2Button>
          <V2Button href="/" variant="secondary">
            Return to Classic
          </V2Button>
        </div>

        <div className="fms-v2-preview-grid">
          <V2Card>
            <V2Badge tone="success">Isolated</V2Badge>
            <h2 className="fms-v2-preview-card-title">
              Presentation only
            </h2>
            <p className="fms-v2-preview-card-copy">
              No booking, payment, pricing, permission, Supabase, finance or
              CRM logic is duplicated in this preview.
            </p>
          </V2Card>

          <V2Card>
            <V2Badge tone="neutral">Foundation</V2Badge>
            <h2 className="fms-v2-preview-card-title">
              Mobile-first primitives
            </h2>
            <p className="fms-v2-preview-card-copy">
              Scoped tokens, restrained surfaces and responsive navigation
              can now support future V2 pages without restyling Classic.
            </p>
          </V2Card>

          <V2Card>
            <div className="fms-v2-marker-demo">
              <V2MapMarker size={56} />
              <div>
                <h2 className="fms-v2-preview-card-title">
                  Official map marker
                </h2>
                <p className="fms-v2-preview-card-copy">
                  V2 references the existing FindMySpace teardrop asset for
                  future map work.
                </p>
              </div>
            </div>
          </V2Card>

          <V2Card>
            <V2Badge tone="brand">Component sample</V2Badge>
            <h2 className="fms-v2-preview-card-title">
              Search-field foundation
            </h2>
            <p className="fms-v2-preview-card-copy">
              This is a visual sample only and does not query or write data.
            </p>
            <div className="mt-4 flex gap-2">
              <V2Input
                aria-label="V2 sample search input"
                placeholder="Where do you need space?"
                readOnly
              />
              <V2IconButton
                type="button"
                aria-label="Sample search button"
                disabled
              >
                <Search className="h-4 w-4" aria-hidden />
              </V2IconButton>
            </div>
          </V2Card>
        </div>
      </V2Section>
    </V2Container>
  );
}
