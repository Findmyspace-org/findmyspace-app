"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type AdvisorReferralQrModalProps = {
  open: boolean;
  onClose: () => void;
  /** Full HTTPS URL encoded in the QR (same as Copy link). */
  referralUrl: string;
  advisorLabel: string;
};

/**
 * Client-side QR from referral URL (same payload as Copy link).
 */
export default function AdvisorReferralQrModal({
  open,
  onClose,
  referralUrl,
  advisorLabel,
}: AdvisorReferralQrModalProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !referralUrl) {
      setDataUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    QRCode.toDataURL(referralUrl, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not generate QR.");
          setDataUrl(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, referralUrl]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
    >
      <div className="max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-lg">
        <h2 id="qr-modal-title" className="mb-1 text-lg font-semibold text-[#192a3a]">
          Referral QR — {advisorLabel}
        </h2>
        <p className="mb-4 text-xs text-gray-600 break-all">{referralUrl}</p>

        {error && (
          <p className="mb-4 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        {dataUrl && (
          <div className="mb-4 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL from qrcode */}
            <img
              src={dataUrl}
              alt=""
              width={280}
              height={280}
              className="rounded-md border border-gray-100"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {dataUrl && (
            <a
              href={dataUrl}
              download={`space-advisor-qr-${advisorLabel.replace(/\s+/g, "-")}.png`}
              className="rounded-md bg-[#192a3a] px-4 py-2 text-sm text-white"
            >
              Download PNG
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
