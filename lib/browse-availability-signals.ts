import type { AppliedWhen } from "@/lib/browse-when-filter";

export type SpaceAvailabilityInput = {
  id: string;
  booking_unit: string | null;
  min_booking_hours: number | null;
  min_booking_days: number | null;
  min_booking_months: number | null;
};

export type AvailabilitySignal =
  | "high_availability"
  | "limited_availability"
  | "strong_match"
  | "monthly_friendly"
  | "weekend_friendly"
  | "weekday_friendly";

export type BrowsePanelSignal = {
  signal: AvailabilitySignal;
  text: string;
  suggestion?: string;
};

export type CardAvailabilityHint = {
  signal: AvailabilitySignal;
  text: string;
};

function countCompatible(
  spaces: SpaceAvailabilityInput[],
  unit: "hour" | "day" | "month"
): number {
  return spaces.filter((s) => s.booking_unit === unit).length;
}

function hasDateWindow(when: AppliedWhen | null): boolean {
  return Boolean(when?.startDate || when?.endDate || when?.datePreset);
}

export function getPanelAvailabilitySignal(args: {
  allSpaces: SpaceAvailabilityInput[];
  filteredSpaces: SpaceAvailabilityInput[];
  when: AppliedWhen | null;
}): BrowsePanelSignal | null {
  const { allSpaces, filteredSpaces, when } = args;
  if (allSpaces.length < 8) return null;

  const ratio = filteredSpaces.length / allSpaces.length;
  const hasWindow = hasDateWindow(when);

  if (hasWindow && ratio <= 0.25) {
    let suggestion = "Try expanding your date range";
    if (when?.datePreset === "weekend") suggestion = "Better availability next week";
    if (when?.datePreset === "nextweek")
      suggestion = "More options are usually available on weekdays";
    return {
      signal: "limited_availability",
      text: "Fewer spaces available for your selected dates",
      suggestion,
    };
  }

  if (when?.datePreset === "weekend" && ratio <= 0.45) {
    return {
      signal: "limited_availability",
      text: "Limited availability this weekend",
      suggestion: "Better availability next week",
    };
  }

  if (when?.datePreset === "nextweek" || when?.datePreset === "today") {
    if (ratio >= 0.55) {
      return {
        signal: "high_availability",
        text: "High availability this week",
      };
    }
  }

  if (!when && ratio >= 0.65) {
    return {
      signal: "high_availability",
      text: "High availability this week",
    };
  }

  if (when?.unit === "month") {
    const monthlyShare = countCompatible(filteredSpaces, "month") / Math.max(filteredSpaces.length, 1);
    if (monthlyShare >= 0.5) {
      return {
        signal: "monthly_friendly",
        text: "Best availability for monthly bookings",
      };
    }
  }

  if (when?.datePreset === "weekend") {
    return {
      signal: "weekend_friendly",
      text: "Weekend availability varies by listing type",
    };
  }

  if (when?.datePreset === "nextweek") {
    return {
      signal: "weekday_friendly",
      text: "Best availability on weekdays",
    };
  }

  return null;
}

export function getCardAvailabilityHint(args: {
  space: SpaceAvailabilityInput;
  when: AppliedWhen | null;
}): CardAvailabilityHint | null {
  const { space, when } = args;
  if (!when) return null;

  if (when.unit === "month" && space.booking_unit === "month") {
    return { signal: "monthly_friendly", text: "Best for monthly bookings" };
  }

  if (when.datePreset === "weekend" && space.booking_unit === "day") {
    return { signal: "weekend_friendly", text: "Good match for this weekend" };
  }

  if (when.datePreset === "nextweek" && space.booking_unit === "day") {
    return { signal: "weekday_friendly", text: "Good weekday availability" };
  }

  if (space.booking_unit === when.unit) {
    return { signal: "strong_match", text: "Available for your dates" };
  }

  return null;
}

