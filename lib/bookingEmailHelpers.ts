export function formatBookingRangeForEmail(booking: {
  booking_unit: string | null;
  start_at: string;
  end_at: string;
}) {
  const start = new Date(booking.start_at);
  const end = new Date(booking.end_at);

  if (booking.booking_unit === "hour") {
    return `${start.toLocaleDateString()} ${start.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })} - ${end.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  if (booking.booking_unit === "month") {
    const displayEnd = new Date(end);
    displayEnd.setMonth(displayEnd.getMonth() - 1);

    return `${start.toLocaleDateString([], {
      year: "numeric",
      month: "long",
    })} - ${displayEnd.toLocaleDateString([], {
      year: "numeric",
      month: "long",
    })}`;
  }

  const displayEnd = new Date(end);
  displayEnd.setDate(displayEnd.getDate() - 1);

  return `${start.toLocaleDateString()} - ${displayEnd.toLocaleDateString()}`;
}

export function getDisplayName(profile?: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
} | null) {
  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || profile?.email || "User";
}