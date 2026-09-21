import { NextResponse } from "next/server";
import { OrganisationAccessError } from "@/lib/access/organisation-access-server";

export function organisationAccessErrorResponse(error: unknown): NextResponse {
  if (error instanceof OrganisationAccessError) {
    return NextResponse.json(
      { error: error.message, code: error.code ?? null },
      { status: error.status }
    );
  }
  const message = error instanceof Error ? error.message : "Request failed.";
  return NextResponse.json({ error: message }, { status: 500 });
}
