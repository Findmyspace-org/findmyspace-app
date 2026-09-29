export const UI_VERSION_QUERY_PARAM = "ui" as const;

export const UI_VERSIONS = ["classic", "v2"] as const;

export type UiVersion = (typeof UI_VERSIONS)[number];

export const DEFAULT_UI_VERSION: UiVersion = "classic";
export const V2_PREVIEW_PATH = "/v2";
export const V2_PREVIEW_HREF = `${V2_PREVIEW_PATH}?${UI_VERSION_QUERY_PARAM}=v2`;
export const V2_BROWSE_PATH = "/v2/spaces";
export const V2_BROWSE_HREF = `${V2_BROWSE_PATH}?${UI_VERSION_QUERY_PARAM}=v2`;
export const CLASSIC_HOME_HREF = "/";

export function buildV2Href(
  pathname: string,
  values?: Record<string, string | null | undefined>
): string {
  const params = new URLSearchParams();
  params.set(UI_VERSION_QUERY_PARAM, "v2");

  for (const [key, value] of Object.entries(values || {})) {
    if (value) params.set(key, value);
  }

  return `${pathname}?${params.toString()}`;
}

export function buildV2SpaceHref(spaceId: string): string {
  return buildV2Href(`/v2/spaces/${spaceId}`);
}

export function buildV2BookHref(spaceId: string): string {
  return buildV2Href(`/v2/spaces/${spaceId}/book`);
}

/**
 * A URL value can request the V2 presentation, but it never grants access.
 * The V2 preview gate separately verifies the existing platform-admin session.
 */
export function parseUiVersion(
  value: string | null | undefined
): UiVersion {
  return value === "v2" ? "v2" : DEFAULT_UI_VERSION;
}
