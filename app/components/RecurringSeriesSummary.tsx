"use client";

export type RecurringSeriesSession = {
  date: string;
  startLabel: string;
  endLabel: string;
  excluded: boolean;
};

export default function RecurringSeriesSummary({
  renterName,
  pattern,
  firstSession,
  lastSession,
  sessionCount,
  hoursPerSession,
  hourlyRate,
  rentalSubtotal,
  feeAmount,
  hostPayout,
  sessions,
}: {
  renterName: string;
  pattern: string;
  firstSession: string;
  lastSession: string;
  sessionCount: number;
  hoursPerSession: number;
  hourlyRate: number;
  rentalSubtotal: number;
  feeAmount: number | null;
  hostPayout: number | null;
  sessions: RecurringSeriesSession[];
}) {
  const excluded = sessions.filter((session) => session.excluded);
  const money = (amount: number) => `R${amount.toFixed(2)}`;

  return (
    <section className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-800">
      <h3 className="text-base font-semibold text-[#192a3a]">Recurring booking request</h3>
      <p className="mt-2">
        <span className="font-medium text-[#192a3a]">Requester:</span> {renterName}
      </p>
      <p>
        <span className="font-medium text-[#192a3a]">Booking type:</span> Recurring sessions
      </p>
      <p>
        <span className="font-medium text-[#192a3a]">Pattern:</span> {pattern}
      </p>
      <p>
        <span className="font-medium text-[#192a3a]">First session:</span> {firstSession}
      </p>
      <p>
        <span className="font-medium text-[#192a3a]">Last session:</span> {lastSession}
      </p>
      <p>
        <span className="font-medium text-[#192a3a]">Sessions:</span> {sessionCount}
      </p>
      <p>
        <span className="font-medium text-[#192a3a]">Hourly price:</span> {money(hourlyRate)} · {hoursPerSession} hours each
      </p>
      <p>
        <span className="font-medium text-[#192a3a]">Rental subtotal:</span> {money(rentalSubtotal)}
      </p>
      <p>
        <span className="font-medium text-[#192a3a]">FindMySpace fee:</span>{" "}
        {feeAmount == null ? "Calculated from the saved commercial terms" : `${money(feeAmount)} deducted from the host payout`}
      </p>
      <p>
        <span className="font-medium text-[#192a3a]">Host payout:</span>{" "}
        {hostPayout == null ? "Calculated when the request is created" : money(hostPayout)}
      </p>
      <p className="text-base font-semibold text-[#192a3a]">Renter pays {money(rentalSubtotal)} in one payment.</p>
      {excluded.length > 0 ? (
        <p className="mt-2">
          <span className="font-medium text-[#192a3a]">Excluded dates:</span>{" "}
          {excluded.map((session) => session.date).join(", ")}
        </p>
      ) : null}
      <details className="mt-3" open>
        <summary className="cursor-pointer font-medium text-[#192a3a]">
          {sessions.length} generated sessions
        </summary>
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {sessions.map((session) => (
            <li key={session.date}>
              {session.date} {session.startLabel}–{session.endLabel}
              {session.excluded ? " · excluded" : ""}
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-3 text-xs text-gray-600">
        Approve or decline the whole request. One decision reserves every included session.
      </p>
    </section>
  );
}
