export default function PaymentCancelPage() {
  return (
    <main className="min-h-screen bg-white px-6 py-10 text-[#192a3a]">
      <div className="mx-auto max-w-2xl rounded-md border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-3xl font-bold">Payment cancelled</h1>
        <p className="text-sm text-gray-600">
          Your booking is still waiting for payment.
        </p>
      </div>
    </main>
  );
}