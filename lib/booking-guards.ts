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

/**
 * Do not use for PayFast initiate.
 * Existing booking payment must not re-run current-space new-booking
 * eligibility (`is_bookable` / live). PayFast uses
 * `validateBookingForPayFastInitiate` instead.
 */
export function assertSpaceBookableForPayment(
  input: SpaceBookabilityInput
): BookableGuardResult {
  void input;
  return { ok: true };
}
