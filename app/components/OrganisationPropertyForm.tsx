"use client";

import { FormEvent, useState } from "react";
import { ZA_PROVINCES } from "@/lib/za-provinces";

export type OrganisationPropertyFormValues = {
  name: string;
  description: string;
  address_line1: string;
  suburb: string;
  city: string;
  province: string;
  postal_code: string;
};

const FIELD_CLASS =
  "w-full rounded-lg border border-[#d4dbe2] px-3 py-2 text-sm outline-none focus:border-[#0c1d2f] focus:ring-1 focus:ring-[#0c1d2f]";

export function OrganisationPropertyForm({
  organisationName,
  initial,
  submitLabel,
  saving,
  message,
  onSubmit,
}: {
  organisationName: string | null;
  initial: OrganisationPropertyFormValues;
  submitLabel: string;
  saving: boolean;
  message: string;
  onSubmit: (values: OrganisationPropertyFormValues) => void | Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [addressLine1, setAddressLine1] = useState(initial.address_line1);
  const [suburb, setSuburb] = useState(initial.suburb);
  const [city, setCity] = useState(initial.city);
  const [province, setProvince] = useState(initial.province);
  const [postalCode, setPostalCode] = useState(initial.postal_code);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({
      name,
      description,
      address_line1: addressLine1,
      suburb,
      city,
      province,
      postal_code: postalCode,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {organisationName ? (
        <p className="text-sm text-gray-600">
          Organisation:{" "}
          <span className="font-medium text-[#0c1d2f]">{organisationName}</span>
        </p>
      ) : null}

      {message ? (
        <p className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
          {message}
        </p>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-[#0c1d2f]">
          Property name
        </span>
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={FIELD_CLASS}
          placeholder="Main Campus"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-[#0c1d2f]">
          Description
        </span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={`${FIELD_CLASS} min-h-[88px]`}
          placeholder="Optional notes about this venue"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-[#0c1d2f]">Address</span>
        <input
          value={addressLine1}
          onChange={(event) => setAddressLine1(event.target.value)}
          className={FIELD_CLASS}
          placeholder="Street address"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[#0c1d2f]">Suburb</span>
          <input
            value={suburb}
            onChange={(event) => setSuburb(event.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[#0c1d2f]">City</span>
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[#0c1d2f]">Province</span>
          <select
            value={province}
            onChange={(event) => setProvince(event.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">Select province</option>
            {ZA_PROVINCES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[#0c1d2f]">
            Postal code
          </span>
          <input
            value={postalCode}
            onChange={(event) => setPostalCode(event.target.value)}
            className={FIELD_CLASS}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center justify-center rounded-md bg-[#0c1d2f] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {saving ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
