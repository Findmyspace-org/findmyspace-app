export const UI_VERSION_QUERY_PARAM = "ui" as const;

export const UI_VERSIONS = ["classic", "v2"] as const;

export type UiVersion = (typeof UI_VERSIONS)[number];

export const DEFAULT_UI_VERSION: UiVersion = "classic";
export const V2_PREVIEW_PATH = "/v2";
export const V2_PREVIEW_HREF = `${V2_PREVIEW_PATH}?${UI_VERSION_QUERY_PARAM}=v2`;
export const CLASSIC_HOME_HREF = "/";

/**
 * A URL value can request the V2 presentation, but it never grants access.
 * The V2 preview gate separately verifies the existing platform-admin session.
 */
export function parseUiVersion(
  value: string | null | undefined
): UiVersion {
  return value === "v2" ? "v2" : DEFAULT_UI_VERSION;
}
