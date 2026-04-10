export default function TermsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12 text-[#192a3a]">
      <h1 className="mb-6 text-3xl font-semibold">Terms & Conditions</h1>

      <p className="mb-6 text-sm text-gray-600">
        Last updated: {new Date().toLocaleDateString()}
      </p>

      {/* INTRO */}
      <section className="mb-8 space-y-3 text-sm text-gray-700">
        <p>
          Welcome to FindMySpace. By using this platform, you agree to the
          following Terms & Conditions. These terms govern your use of the
          platform, including listing spaces, making bookings, and interacting
          with other users.
        </p>

        <p>
          FindMySpace acts as a marketplace connecting space owners and renters.
          We are not the owner, operator, or manager of any listed space.
        </p>
      </section>

      {/* USERS */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">1. User Responsibilities</h2>
        <ul className="list-disc pl-5 text-sm text-gray-700 space-y-2">
          <li>Provide accurate and truthful information</li>
          <li>Use the platform in good faith</li>
          <li>Comply with all applicable laws and regulations</li>
          <li>Not misuse, abuse, or attempt to bypass the platform</li>
        </ul>
      </section>

      {/* BOOKINGS */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">2. Booking Terms</h2>
        <p className="text-sm text-gray-700 mb-2">
          All bookings are requests and must be approved by the space owner.
        </p>

        <ul className="list-disc pl-5 text-sm text-gray-700 space-y-2">
          <li>Bookings are only confirmed once accepted and paid</li>
          <li>Prices are set by the space owner</li>
          <li>Users are responsible for reviewing listing details before booking</li>
        </ul>
      </section>

      {/* CANCELLATION */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">3. Cancellation Policy</h2>

        <ul className="list-disc pl-5 text-sm text-gray-700 space-y-2">
          <li>
            <strong>Hourly bookings:</strong> Full refund if cancelled more than
            24 hours before start time. No refund within 24 hours.
          </li>
          <li>
            <strong>Daily bookings:</strong> No refund if cancelled within 7 days
            of the start date.
          </li>
          <li>
            <strong>Monthly bookings:</strong> No refund after the start date.
            Deposits may apply and are non-refundable.
          </li>
        </ul>

        <p className="mt-3 text-xs text-gray-500">
          Refunds, if applicable, will be processed according to payment provider timelines.
        </p>
      </section>

      {/* FEES */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">4. Fees & Payments</h2>

        <ul className="list-disc pl-5 text-sm text-gray-700 space-y-2">
          <li>A platform commission is deducted from each booking</li>
          <li>A payment processing fee of approximately 3.5% applies</li>
          <li>VAT (if applicable) may be deducted</li>
          <li>
            Owners will receive the net payout after all applicable fees and deductions
          </li>
        </ul>

        <p className="mt-3 text-sm text-gray-700">
          A breakdown of fees is shown during listing and booking.
        </p>
      </section>

      {/* LIABILITY */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">5. Liability</h2>

        <p className="text-sm text-gray-700">
          FindMySpace is not responsible for:
        </p>

        <ul className="list-disc pl-5 text-sm text-gray-700 space-y-2 mt-2">
          <li>Damage, loss, or theft</li>
          <li>Disputes between users</li>
          <li>Accuracy of listings</li>
          <li>Conduct of users</li>
        </ul>

        <p className="mt-3 text-sm text-gray-700">
          Users agree to use the platform at their own risk.
        </p>
      </section>

      {/* PLATFORM ROLE */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">6. Platform Role</h2>

        <p className="text-sm text-gray-700">
          FindMySpace operates solely as a marketplace. We do not own, manage,
          or control any listed space and are not a party to agreements between
          renters and owners.
        </p>
      </section>

      {/* TERMINATION */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">7. Account Termination</h2>

        <p className="text-sm text-gray-700">
          We reserve the right to suspend or terminate accounts that violate
          these Terms or misuse the platform.
        </p>
      </section>

      {/* CHANGES */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">8. Changes to Terms</h2>

        <p className="text-sm text-gray-700">
          These Terms may be updated from time to time. Continued use of the
          platform constitutes acceptance of any changes.
        </p>
      </section>

      {/* CONTACT */}
      <section>
        <h2 className="mb-3 text-xl font-semibold">9. Contact</h2>

        <p className="text-sm text-gray-700">
          For any questions regarding these Terms, please contact us at:
        </p>

        <p className="mt-2 text-sm font-medium text-[#192a3a]">
          support@findmyspace.co.za
        </p>
      </section>
    </main>
  );
}