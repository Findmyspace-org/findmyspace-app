import { NextResponse } from "next/server";
import { OrganisationCommercialError } from "@/lib/organisation-commercial-error";

export function organisationCommercialErrorResponse(error: unknown): NextResponse {
  if (error instanceof OrganisationCommercialError) {
    return NextResponse.json(
      { error: error.message, code: error.code ?? null },
      { status: error.status }
    );
  }
  const message = error instanceof Error ? error.message : "Request failed.";
  return NextResponse.json({ error: message }, { status: 500 });
}
