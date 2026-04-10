"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import SpaceCategoryFields from "@/app/components/SpaceCategoryFields";

const MapPicker = dynamic(() => import("@/app/components/MapPicker"), {
  ssr: false,
});

type SpaceFormProps = {
  onCreated?: () => void | Promise<void>;
};

type InsertedSpace = {
  id: string;
};

type DepositType = "none" | "one_month" | "two_months";

type SpaceInsertPayload = {
  owner_id: string;
  title: string;
  description: string;
  space_type: string;
  booking_unit: string;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  min_booking_hours: number | null;
  min_booking_days: number | null;
  min_booking_months: number | null;
  city: string;
  suburb: string;
  address_line_1: string;
  latitude: number;
  longitude: number;
  status: string;
  verification_status: string;
  ownership_proof_status: string;
  deposit_type: DepositType;
  deposit_months: number;
  monthly_payment_day: number;
};

type SpaceImageInsertRow = {
  space_id: string;
  image_url: string;
  file_path: string;
  sort_order: number;
};

type SpaceAttributeInsertRow = {
  space_id: string;
  attribute_key: string;
  attribute_value: string;
};

type ListingOwnershipInsertRow = {
  space_id: string;
  owner_id: string;
  document_type: string;
  file_url: string;
  file_path: string;
  status: string;
};

export default function SpaceForm({ onCreated }: SpaceFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [suburb, setSuburb] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [spaceType, setSpaceType] = useState("storage");
  const [bookingUnit, setBookingUnit] = useState("day");

  const [pricePerHour, setPricePerHour] = useState("");
  const [pricePerDay, setPricePerDay] = useState("");
  const [pricePerMonth, setPricePerMonth] = useState("");
  const [minBookingHours, setMinBookingHours] = useState("1");
  const [minBookingDays, setMinBookingDays] = useState("1");
  const [minBookingMonths, setMinBookingMonths] = useState("1");

  const [depositType, setDepositType] = useState<DepositType>("none");

  const [latitude, setLatitude] = useState(-33.7342);
  const [longitude, setLongitude] = useState(18.9621);

  const [ownershipProofFile, setOwnershipProofFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [attributes, setAttributes] = useState<Record<string, string[]>>({});

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const imagePreviews = useMemo(() => {
    return imageFiles.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
  }, [imageFiles]);

  function getCommissionRate(unit: string) {
    if (unit === "hour") return 0.20;
    if (unit === "day") return 0.15;
    if (unit === "month") return 0.10;
    return 0.15;
  }

  function addImageFiles(files: FileList | null) {
    if (!files) return;
    setImageFiles((current) => [...current, ...Array.from(files)]);
  }

  function removeImageAt(index: number) {
    setImageFiles((current) => current.filter((_, i) => i !== index));
    setPreviewIndex((current) => {
      if (current === null) return current;
      if (current === index) return null;
      if (current > index) return current - 1;
      return current;
    });
  }

  function moveImage(index: number, direction: -1 | 1) {
    setImageFiles((current) => {
      const next = [...current];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return current;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });

    setPreviewIndex((current) => {
      if (current === null) return current;
      if (current === index) return index + direction;
      if (current === index + direction) return index;
      return current;
    });
  }

  function calculatePayoutBreakdown(price: number) {
    const rate = getCommissionRate(bookingUnit);
    const paymentFee = price * 0.035;
    const commission = price * rate;
    const vatOnCommission = commission * 0.16;
    const payout = price - paymentFee - commission - vatOnCommission;

    return {
      paymentFee,
      commission,
      vatOnCommission,
      payout,
    };
  }

  async function reverseGeocode(lat: number, lng: number) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
      );

      const data = await res.json();
      const addr = data.address || {};

      const roadName = addr.road || addr.residential || addr.pedestrian || "";
      const line1 = [addr.house_number, roadName].filter(Boolean).join(" ");

      setAddressLine1((current) => {
        if (!current) return line1;

        const hasNumber = /\d/.test(current);

        if (hasNumber && roadName) {
          const number = current.match(/\d+[A-Za-z-]*/)?.[0] || "";
          return `${number} ${roadName}`.trim();
        }

        return current;
      });

      setSuburb(
        addr.suburb ||
        addr.neighbourhood ||
        addr.city_district ||
        addr.township ||
        ""
      );

      setCity(addr.city || addr.town || addr.village || "");
    } catch (error) {
      console.error("Reverse geocoding failed", error);
    }
  }

  async function searchAddressOnMap() {
    try {
      const query = [addressLine1, suburb, city].filter(Boolean).join(", ");

      if (!query) {
        setMessage("Please enter an address, suburb, or city first.");
        return;
      }

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
          query
        )}&limit=1`
      );

      const data = await res.json();

      if (!data || data.length === 0) {
        setMessage("Address not found. Try a more specific search.");
        return;
      }

      const result = data[0];
      const lat = Number(result.lat);
      const lng = Number(result.lon);

      setLatitude(lat);
      setLongitude(lng);
      await reverseGeocode(lat, lng);
      setMessage("Address found on map.");
    } catch (error) {
      console.error("Address search failed", error);
      setMessage("Could not search for the address.");
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setMessage("Geolocation is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setLatitude(lat);
        setLongitude(lng);
        await reverseGeocode(lat, lng);
        setMessage("Location found.");
      },
      () => {
        setMessage("Location access was denied or unavailable.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }

  async function uploadPrivateFile(
    bucket: string,
    ownerId: string,
    file: File,
    folder: string
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("You must be logged in to upload files.");
    }

    if (user.id !== ownerId) {
      throw new Error("You can only upload files for your own account.");
    }

    const fileExt = file.name.split(".").pop() || "bin";
    const safeFolder = folder.replace(/[^a-zA-Z0-9-_]/g, "-");
    const filePath = `${ownerId}/${safeFolder}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

    return {
      filePath,
      fileUrl: data.publicUrl,
    };
  }

  async function handleCreateSpace(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    if (!ownershipProofFile) {
      setMessage("Please upload proof of ownership for this space.");
      setLoading(false);
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("You need to log in first.");
        setLoading(false);
        return;
      }

      const parsedMonthlyPaymentDay = 1;

      const depositMonths =
        depositType === "one_month" ? 1 : depositType === "two_months" ? 2 : 0;

      if (bookingUnit === "hour") {
        if (!pricePerHour || Number(pricePerHour) <= 0) {
          setMessage("Please enter a valid hourly price.");
          setLoading(false);
          return;
        }

        if (Number(minBookingHours || 0) < 1) {
          setMessage("Minimum booking hours must be at least 1.");
          setLoading(false);
          return;
        }
      }

      if (bookingUnit === "day") {
        if (!pricePerDay || Number(pricePerDay) <= 0) {
          setMessage("Please enter a valid daily price.");
          setLoading(false);
          return;
        }

        if (Number(minBookingDays || 0) < 1) {
          setMessage("Minimum booking days must be at least 1.");
          setLoading(false);
          return;
        }
      }

      if (bookingUnit === "month") {
        if (parsedMonthlyPaymentDay < 1 || parsedMonthlyPaymentDay > 28) {
          setMessage("Monthly payment day must be between 1 and 28.");
          setLoading(false);
          return;
        }

        if (!pricePerMonth || Number(pricePerMonth) <= 0) {
          setMessage("Please enter a valid monthly price.");
          setLoading(false);
          return;
        }

        if (Number(minBookingMonths || 0) < 1) {
          setMessage("Minimum booking months must be at least 1.");
          setLoading(false);
          return;
        }
      }

      const spacePayload: SpaceInsertPayload = {
        owner_id: user.id,
        title,
        description,
        space_type: spaceType,
        booking_unit: bookingUnit,
        price_per_hour:
          bookingUnit === "hour" && pricePerHour ? Number(pricePerHour) : null,
        price_per_day:
          bookingUnit === "day" && pricePerDay ? Number(pricePerDay) : null,
        price_per_month:
          bookingUnit === "month" && pricePerMonth ? Number(pricePerMonth) : null,
        min_booking_hours:
          bookingUnit === "hour" ? Number(minBookingHours || 1) : null,
        min_booking_days:
          bookingUnit === "day" ? Number(minBookingDays || 1) : null,
        min_booking_months:
          bookingUnit === "month" ? Number(minBookingMonths || 1) : null,
        city,
        suburb,
        address_line_1: addressLine1,
        latitude,
        longitude,
        status: "pending",
        verification_status: "pending",
        ownership_proof_status: "pending",
        deposit_type: bookingUnit === "month" ? depositType : "none",
        deposit_months: bookingUnit === "month" ? depositMonths : 0,
        monthly_payment_day: bookingUnit === "month" ? parsedMonthlyPaymentDay : 1,
      };

      const { data, error: spaceError } = await supabase
        .from("spaces")
        .insert([spacePayload] as any)
        .select("id")
        .single();

      const insertedSpace = data as InsertedSpace | null;

      if (spaceError || !insertedSpace) {
        setMessage(spaceError?.message || "Could not create listing.");
        setLoading(false);
        return;
      }

      if (imageFiles.length > 0) {
        const imageRows: SpaceImageInsertRow[] = [];

        for (let i = 0; i < imageFiles.length; i++) {
          const file = imageFiles[i];
          const fileExt = file.name.split(".").pop();
          const fileName = `${user.id}/${insertedSpace.id}-${Date.now()}-${i}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from("space-images")
            .upload(fileName, file, {
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) {
            setMessage(`Image upload failed: ${uploadError.message}`);
            setLoading(false);
            return;
          }

          const { data: publicUrlData } = supabase.storage
            .from("space-images")
            .getPublicUrl(fileName);

          imageRows.push({
            space_id: insertedSpace.id,
            image_url: publicUrlData.publicUrl,
            file_path: fileName,
            sort_order: i,
          });
        }

        const { error: imageInsertError } = await supabase
          .from("space_images")
          .insert(imageRows as any);

        if (imageInsertError) {
          setMessage(`Saving images failed: ${imageInsertError.message}`);
          setLoading(false);
          return;
        }
      }

      const attributeRows: SpaceAttributeInsertRow[] = Object.entries(attributes).flatMap(
        ([attributeKey, values]) =>
          values.map((value) => ({
            space_id: insertedSpace.id,
            attribute_key: attributeKey,
            attribute_value: value,
          }))
      );

      if (attributeRows.length > 0) {
        const { error: attributesError } = await supabase
          .from("space_attributes")
          .insert(attributeRows as any);

        if (attributesError) {
          setMessage(`Saving category details failed: ${attributesError.message}`);
          setLoading(false);
          return;
        }
      }

      const uploadedOwnership = await uploadPrivateFile(
        "listing-ownership",
        user.id,
        ownershipProofFile,
        `ownership-${insertedSpace.id}`
      );

      const ownershipRow: ListingOwnershipInsertRow = {
        space_id: insertedSpace.id,
        owner_id: user.id,
        document_type: "ownership_proof",
        file_url: uploadedOwnership.fileUrl,
        file_path: uploadedOwnership.filePath,
        status: "pending",
      };

      const { error: ownershipInsertError } = await supabase
        .from("listing_ownership_documents")
        .insert(ownershipRow as any);

      if (ownershipInsertError) {
        setMessage(`Saving ownership proof failed: ${ownershipInsertError.message}`);
        setLoading(false);
        return;
      }
      await fetch("/api/notifications/listing-event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          spaceId: insertedSpace.id,
          eventType: "listing_submitted",
        }),
      });

      setSubmitted(true);
      setMessage("Listing submitted - Pending approval by admin.");
      setLoading(false);

      await new Promise((resolve) => setTimeout(resolve, 1200));

      if (onCreated) {
        await onCreated();
        return;
      }

      router.push("/dashboard/listings?created=pending");
      router.refresh();
    } catch (error) {
      console.error(error);
      setSubmitted(false);
      setMessage("Something went wrong while creating the space.");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleCreateSpace}
      className="space-y-8 rounded-md border border-gray-200 bg-white p-8 shadow-sm"
    >
      <div className="rounded-md border border-gray-200 bg-gray-50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="mb-2 text-2xl font-semibold text-[#192a3a]">
              Create your listing
            </h2>
            <p className="text-sm text-gray-600">
              You can create your listing now. It will stay pending until identity,
              bank, and ownership proof are approved.
            </p>
          </div>

          <Link
            href="/dashboard/verification?step=overview"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm"
          >
            Back to host dashboard
          </Link>
        </div>
      </div>

      <section className="rounded-md border border-gray-200 p-6">
        <h3 className="mb-2 text-xl font-semibold text-[#192a3a]">
          1. Listing details
        </h3>
        <p className="mb-6 text-sm text-gray-600">
          Add the main information people need to understand your space.
        </p>

        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Secure parking bay in Paarl"
              required
              className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Covered parking with remote access"
              rows={4}
              className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Space type</label>
            <select
              value={spaceType}
              onChange={(e) => {
                setSpaceType(e.target.value);
                setAttributes({});
              }}
              className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
            >
              <option value="storage">Storage</option>
              <option value="parking">Parking</option>
              <option value="office">Office</option>
              <option value="garage">Garage</option>
              <option value="workspace">Workspace</option>
              <option value="other">Other</option>
            </select>
          </div>

          <SpaceCategoryFields
            spaceType={spaceType}
            attributes={attributes}
            setAttributes={setAttributes}
          />
        </div>
      </section>

      <section className="rounded-md border border-gray-200 p-6">
        <h3 className="mb-2 text-xl font-semibold text-[#192a3a]">
          2. Pricing
        </h3>
        <p className="mb-6 text-sm text-gray-600">
          Set how people can book your space and what they will pay.
        </p>

        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium">Booking unit</label>
            <select
              value={bookingUnit}
              onChange={(e) => setBookingUnit(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
            >
              <option value="hour">By hour</option>
              <option value="day">By day</option>
              <option value="month">By month</option>
            </select>
          </div>

          {bookingUnit === "hour" && (
            <div>
              <label className="mb-2 block text-sm font-medium">Price per hour</label>
              <input
                type="number"
                value={pricePerHour}
                onChange={(e) => setPricePerHour(e.target.value)}
                placeholder="50"
                className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
              />

              {pricePerHour && Number(pricePerHour) > 0 && (() => {
                const breakdown = calculatePayoutBreakdown(Number(pricePerHour));

                return (
                  <div className="mt-3 rounded-md border border-gray-200 bg-[#f8fafb] p-4 text-sm text-gray-700">
                    <p className="font-semibold text-[#192a3a]">Estimated payout breakdown</p>
                    <div className="mt-2 space-y-1 text-sm">
                      <p>Customer price: R{Number(pricePerHour).toFixed(2)}</p>
                      <p>Payment fee (3.5%): -R{breakdown.paymentFee.toFixed(2)}</p>
                      <p>Platform commission ({(getCommissionRate(bookingUnit) * 100).toFixed(0)}%): -R{breakdown.commission.toFixed(2)}</p>
                      <p>VAT on commission (16%): -R{breakdown.vatOnCommission.toFixed(2)}</p>
                      <p className="pt-2 font-semibold text-[#192a3a]">
                        You will receive approximately R{breakdown.payout.toFixed(2)}
                      </p>
                    </div>
                  </div>
                );
              })()}
              <div className="mt-4">
                <label className="mb-2 block text-sm font-medium">Minimum booking hours</label>
                <input
                  type="number"
                  min="1"
                  value={minBookingHours}
                  onChange={(e) => setMinBookingHours(e.target.value)}
                  placeholder="1"
                  className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
                />
                <p className="mt-2 text-sm text-gray-600">
                  Renters must book at least this many hours.
                </p>
              </div>
            </div>
          )}

          {bookingUnit === "day" && (
            <div>
              <label className="mb-2 block text-sm font-medium">Price per day</label>
              <input
                type="number"
                value={pricePerDay}
                onChange={(e) => setPricePerDay(e.target.value)}
                placeholder="150"
                className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
              />

              {pricePerDay && Number(pricePerDay) > 0 && (() => {
                const breakdown = calculatePayoutBreakdown(Number(pricePerDay));

                return (
                  <div className="mt-3 rounded-md border border-gray-200 bg-[#f8fafb] p-4 text-sm text-gray-700">
                    <p className="font-semibold text-[#192a3a]">Estimated payout breakdown</p>
                    <div className="mt-2 space-y-1 text-sm">
                      <p>Customer price: R{Number(pricePerDay).toFixed(2)}</p>
                      <p>Payment fee (3.5%): -R{breakdown.paymentFee.toFixed(2)}</p>
                      <p>Platform commission ({(getCommissionRate(bookingUnit) * 100).toFixed(0)}%): -R{breakdown.commission.toFixed(2)}</p>
                      <p>VAT on commission (16%): -R{breakdown.vatOnCommission.toFixed(2)}</p>
                      <p className="pt-2 font-semibold text-[#192a3a]">
                        You will receive approximately R{breakdown.payout.toFixed(2)}
                      </p>
                    </div>
                  </div>
                );
              })()}
              <div className="mt-4">
                <label className="mb-2 block text-sm font-medium">Minimum booking days</label>
                <input
                  type="number"
                  min="1"
                  value={minBookingDays}
                  onChange={(e) => setMinBookingDays(e.target.value)}
                  placeholder="1"
                  className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
                />
                <p className="mt-2 text-sm text-gray-600">
                  Renters must book at least this many days.
                </p>
              </div>
            </div>
          )}

          {bookingUnit === "month" && (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium">Price per month</label>
                <input
                  type="number"
                  value={pricePerMonth}
                  onChange={(e) => setPricePerMonth(e.target.value)}
                  placeholder="2500"
                  className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
                />

                {pricePerMonth && Number(pricePerMonth) > 0 && (() => {
                  const breakdown = calculatePayoutBreakdown(Number(pricePerMonth));

                  return (
                    <div className="mt-3 rounded-md border border-gray-200 bg-[#f8fafb] p-4 text-sm text-gray-700">
                      <p className="font-semibold text-[#192a3a]">Estimated payout breakdown</p>
                      <div className="mt-2 space-y-1 text-sm">
                        <p>Customer price: R{Number(pricePerMonth).toFixed(2)}</p>
                        <p>Payment fee (3.5%): -R{breakdown.paymentFee.toFixed(2)}</p>
                        <p>Platform commission ({(getCommissionRate(bookingUnit) * 100).toFixed(0)}%): -R{breakdown.commission.toFixed(2)}</p>
                        <p>VAT on commission (16%): -R{breakdown.vatOnCommission.toFixed(2)}</p>
                        <p className="pt-2 font-semibold text-[#192a3a]">
                          You will receive approximately R{breakdown.payout.toFixed(2)} per month
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Minimum booking months</label>
                <input
                  type="number"
                  min="1"
                  value={minBookingMonths}
                  onChange={(e) => setMinBookingMonths(e.target.value)}
                  placeholder="1"
                  className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
                />
                <p className="mt-2 text-sm text-gray-600">
                  Renters must book at least this many months.
                </p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Deposit type</label>
                <select
                  value={depositType}
                  onChange={(e) =>
                    setDepositType(e.target.value as DepositType)
                  }
                  className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
                >
                  <option value="none">No deposit</option>
                  <option value="one_month">1 month deposit</option>
                  <option value="two_months">2 months deposit</option>
                </select>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="rounded-md border border-gray-200 p-6">
        <h3 className="mb-2 text-xl font-semibold text-[#192a3a]">
          3. Location
        </h3>
        <p className="mb-6 text-sm text-gray-600">
          Add the address and pin the exact location on the map.
        </p>

        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium">Address line 1</label>
            <input
              type="text"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              placeholder="7 Eerste Laan"
              className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Suburb</label>
            <input
              type="text"
              value={suburb}
              onChange={(e) => setSuburb(e.target.value)}
              placeholder="Hoog en Droog"
              className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Paarl"
              className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={searchAddressOnMap}
              className="rounded-md border border-gray-300 px-4 py-3 text-sm"
            >
              Find address on map
            </button>

            <button
              type="button"
              onClick={useMyLocation}
              className="rounded-md border border-gray-300 px-4 py-3 text-sm"
            >
              Use current location
            </button>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Pin your space on the map
            </label>
            <MapPicker
              latitude={latitude}
              longitude={longitude}
              onChange={async (lat, lng) => {
                setLatitude(lat);
                setLongitude(lng);
                await reverseGeocode(lat, lng);
              }}
            />
            <p className="mt-2 text-sm text-gray-600">
              Selected position: {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-gray-200 p-6">
        <h3 className="mb-2 text-xl font-semibold text-[#192a3a]">
          4. Images
        </h3>
        <p className="mb-6 text-sm text-gray-600">
          Upload clear images so renters can understand the space properly.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">Upload images</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => addImageFiles(e.target.files)}
              className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
            />
            <p className="mt-2 text-sm text-gray-600">
              {imageFiles.length} image{imageFiles.length === 1 ? "" : "s"} selected
            </p>
          </div>

          {imagePreviews.length > 0 && (
            <div className="space-y-3 rounded-md border border-gray-200 bg-[#f8fafb] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[#192a3a]">Manage uploaded images</p>
                <label className="rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a] cursor-pointer hover:bg-white">
                  Add another picture
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => addImageFiles(e.target.files)}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {imagePreviews.map((item, index) => (
                  <div
                    key={`${item.file.name}-${index}`}
                    className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewIndex(index)}
                      className="block w-full"
                    >
                      <Image
                        src={item.url}
                        alt={`Listing image ${index + 1}`}
                        width={400}
                        height={260}
                        className="h-40 w-full object-cover"
                        unoptimized
                      />
                    </button>

                    <div className="space-y-2 p-3">
                      <p className="truncate text-sm text-gray-700">{item.file.name}</p>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => moveImage(index, -1)}
                          disabled={index === 0}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-[#192a3a] disabled:opacity-40"
                        >
                          Move left
                        </button>

                        <button
                          type="button"
                          onClick={() => moveImage(index, 1)}
                          disabled={index === imagePreviews.length - 1}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-[#192a3a] disabled:opacity-40"
                        >
                          Move right
                        </button>

                        <button
                          type="button"
                          onClick={() => removeImageAt(index)}
                          className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-md border border-gray-200 p-6">
        <h3 className="mb-2 text-xl font-semibold text-[#192a3a]">
          5. Proof you own or control this space
        </h3>
        <p className="mb-6 text-sm text-gray-600">
          This is specific to this listing. Your space will only go live once this
          ownership proof has been reviewed.
        </p>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Proof of ownership for this space
          </label>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setOwnershipProofFile(e.target.files?.[0] || null)}
            className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
          />
          <p className="mt-2 text-sm text-gray-600">
            {ownershipProofFile
              ? ownershipProofFile.name
              : "Upload a document proving ownership of this specific space."}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-[#192a3a] px-6 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "Submitting listing..." : "Submit listing for review"}
        </button>

        <Link
          href="/dashboard/verification?step=overview"
          className="rounded-md border border-gray-300 px-6 py-3 text-sm"
        >
          Back to host dashboard
        </Link>
      </div>

      {message && (
        <div
          className={`rounded-md p-3 text-sm ${
            submitted
              ? "border border-green-200 bg-green-50 text-green-900"
              : "border border-gray-200 bg-gray-50 text-gray-800"
          }`}
        >
          {message}
        </div>
      )}
      {previewIndex !== null && imagePreviews[previewIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <button
            type="button"
            onClick={() => setPreviewIndex(null)}
            className="absolute inset-0 cursor-default"
            aria-label="Close image preview"
          />

          <div className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Image preview
                </p>
                <h3 className="mt-1 text-lg font-semibold text-[#192a3a]">
                  {imagePreviews[previewIndex].file.name}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setPreviewIndex(null)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a]"
              >
                Close
              </button>
            </div>

            <div className="p-4">
              <Image
                src={imagePreviews[previewIndex].url}
                alt={`Preview ${previewIndex + 1}`}
                width={1400}
                height={900}
                className="max-h-[72vh] w-full object-contain"
                unoptimized
              />
            </div>
          </div>
        </div>
      )}
    </form>
  );
}