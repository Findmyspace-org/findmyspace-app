import {
  bookableSpaceError,
  isSpaceBookable,
  type SpaceBookabilityInput,
} from "@/lib/listing-lifecycle";

export { isSpaceBookable, bookableSpaceError };

export type BookableGuardResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

export function assertSpaceBookable(
  input: SpaceBookabilityInput
): BookableGuardResult {
  const message = bookableSpaceError(input);
  if (message) {
    return { ok: false, error: message, status: 400 };
  }
  return { ok: true };
}

export function assertSpaceBookableForPayment(
  input: SpaceBookabilityInput
): BookableGuardResult {
  const message = bookableSpaceError(input);
  if (message) {
    return {
      ok: false,
      error: "Payment is not available because this listing is no longer active.",
      status: 400,
    };
  }
  return { ok: true };
}
