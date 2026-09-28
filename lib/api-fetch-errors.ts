export function parseApiFetchError(
  res: Response,
  raw: string,
  json: Record<string, unknown>
): string {
  const jsonError =
    (typeof json.error === "string" && json.error) ||
    (typeof json.message === "string" && json.message) ||
    null;

  if (jsonError) {
    if (
      /duplicate key|violates unique constraint|commercial_terms_scope_effective_uidx|sqlstate/i.test(
        jsonError
      )
    ) {
      return "A commercial arrangement already starts on this effective date. Choose a later effective date to create a new version.";
    }
    return jsonError;
  }

  const contentType = res.headers.get("content-type") || "";
  const looksLikeHtml =
    contentType.includes("text/html") ||
    raw.trimStart().startsWith("<!DOCTYPE") ||
    raw.includes("__next_error__");

  if (looksLikeHtml) {
    if (res.status >= 500) {
      return "The server encountered an error. Please try again in a moment.";
    }
    return `Request failed (${res.status}).`;
  }

  if (res.status === 413) {
    return "Upload too large.";
  }

  if (res.status === 401) {
    return "Not signed in. Sign in again.";
  }

  if (res.status === 403) {
    return "Access denied.";
  }

  return res.statusText
    ? `${res.statusText} (${res.status})`
    : `Request failed (${res.status}).`;
}
