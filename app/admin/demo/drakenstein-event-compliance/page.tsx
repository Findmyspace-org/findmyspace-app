"use client";

import { hasAdminUiAccess } from "@/lib/client-admin-access";
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileUp,
  MapPin,
  Users,
  X,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const WIZARD_STEPS = [
  "Event details",
  "Requirements",
  "Documents",
  "Declaration",
] as const;

type WizardStep = (typeof WIZARD_STEPS)[number];

const EVENT_TYPES = [
  "Sports",
  "Concert",
  "Market",
  "Wedding",
  "Corporate",
  "School Event",
  "Religious Event",
  "Film Shoot",
  "Other",
] as const;

type EventType = (typeof EVENT_TYPES)[number];

type RequirementKey =
  | "foodVendors"
  | "lpGas"
  | "alcohol"
  | "publicLiabilityInsurance"
  | "temporaryStructures"
  | "amplifiedSound"
  | "fireworks"
  | "trafficControl"
  | "securityServices"
  | "medicalSupport";

type RequirementConfig = {
  key: RequirementKey;
  label: string;
  helper?: string;
};

const REQUIREMENTS: RequirementConfig[] = [
  { key: "foodVendors", label: "Food vendors / catering" },
  {
    key: "lpGas",
    label: "LP gas usage",
    helper: "Details and safety documentation may be required.",
  },
  {
    key: "alcohol",
    label: "Alcohol sales or consumption",
    helper: "Liquor licence may be required.",
  },
  { key: "publicLiabilityInsurance", label: "Public liability insurance" },
  {
    key: "temporaryStructures",
    label: "Temporary structures",
    helper: "Tent, stage or stand approval may be required.",
  },
  {
    key: "amplifiedSound",
    label: "Live music / DJ / amplified sound",
    helper: "Noise exemption may be required.",
  },
  { key: "fireworks", label: "Fireworks / pyrotechnics" },
  {
    key: "trafficControl",
    label: "Road closure or traffic control required",
    helper: "Traffic management plan may be required.",
  },
  { key: "securityServices", label: "Security services required" },
  { key: "medicalSupport", label: "Medical support required" },
];

type DocumentKey =
  | "publicLiabilityInsurance"
  | "sitePlan"
  | "safetyPlan"
  | "securityPlan"
  | "medicalPlan"
  | "wasteManagementPlan"
  | "trafficManagementPlan"
  | "liquorLicence"
  | "noiseExemption"
  | "vendorList"
  | "propertyOwnerConsent"
  | "temporaryStructurePlan"
  | "fireProtectionPlan";

type DocumentConfig = {
  key: DocumentKey;
  name: string;
  description: string;
  alwaysRequired?: boolean;
  requiredWhen?: RequirementKey;
};

const DOCUMENTS: DocumentConfig[] = [
  {
    key: "publicLiabilityInsurance",
    name: "Public liability insurance",
    description: "Certificate of insurance covering the event period.",
    alwaysRequired: true,
  },
  {
    key: "sitePlan",
    name: "Site plan / layout plan",
    description: "Scaled layout showing stages, seating, exits and services.",
    alwaysRequired: true,
  },
  {
    key: "safetyPlan",
    name: "Safety or disaster management plan",
    description: "Emergency procedures, evacuation routes and incident contacts.",
    alwaysRequired: true,
  },
  {
    key: "securityPlan",
    name: "Security plan",
    description: "Staffing levels, access control and crowd management.",
    requiredWhen: "securityServices",
  },
  {
    key: "medicalPlan",
    name: "Medical plan",
    description: "First-aid coverage and ambulance arrangements.",
    requiredWhen: "medicalSupport",
  },
  {
    key: "wasteManagementPlan",
    name: "Waste management plan",
    description: "Bins, collection schedule and cleanup responsibilities.",
    alwaysRequired: true,
  },
  {
    key: "trafficManagementPlan",
    name: "Traffic management plan",
    description: "Road closures, signage and traffic officer deployment.",
    requiredWhen: "trafficControl",
  },
  {
    key: "liquorLicence",
    name: "Liquor licence",
    description: "Valid liquor licence or temporary event permit.",
    requiredWhen: "alcohol",
  },
  {
    key: "noiseExemption",
    name: "Noise exemption",
    description: "Municipal noise exemption or sound level compliance proof.",
    requiredWhen: "amplifiedSound",
  },
  {
    key: "vendorList",
    name: "Vendor list and compliance certificates",
    description: "Registered vendors with health and safety certificates.",
    requiredWhen: "foodVendors",
  },
  {
    key: "propertyOwnerConsent",
    name: "Property owner consent",
    description: "Written consent from the venue owner or authorised representative.",
    alwaysRequired: true,
  },
  {
    key: "temporaryStructurePlan",
    name: "Temporary structure plan",
    description: "Engineering or approval documentation for tents and stages.",
    requiredWhen: "temporaryStructures",
  },
  {
    key: "fireProtectionPlan",
    name: "Fire protection plan",
    description: "Fire safety measures for pyrotechnics or high-risk activities.",
    requiredWhen: "fireworks",
  },
];

type EventDetailsState = {
  eventName: string;
  eventType: EventType | "";
  description: string;
  setupDate: string;
  strikeDate: string;
  startTime: string;
  endTime: string;
  expectedParticipants: string;
  expectedSpectators: string;
};

type RequirementsState = Record<RequirementKey, boolean>;

type UploadedDocumentsState = Partial<Record<DocumentKey, string>>;

type DeclarationState = {
  fullName: string;
  idNumber: string;
  designation: string;
  organisationName: string;
  mobileNumber: string;
  email: string;
  confirmInformation: boolean;
  confirmProvisional: boolean;
  confirmFinalApproval: boolean;
};

const INITIAL_EVENT_DETAILS: EventDetailsState = {
  eventName: "Community Awards Evening",
  eventType: "Corporate",
  description:
    "Annual community awards ceremony with seated dinner, presentations and live entertainment.",
  setupDate: "2026-09-17",
  strikeDate: "2026-09-19",
  startTime: "17:00",
  endTime: "22:00",
  expectedParticipants: "80",
  expectedSpectators: "270",
};

const INITIAL_REQUIREMENTS: RequirementsState = {
  foodVendors: true,
  lpGas: false,
  alcohol: true,
  publicLiabilityInsurance: true,
  temporaryStructures: true,
  amplifiedSound: true,
  fireworks: false,
  trafficControl: false,
  securityServices: true,
  medicalSupport: true,
};

const INITIAL_DECLARATION: DeclarationState = {
  fullName: "",
  idNumber: "",
  designation: "",
  organisationName: "Drakenstein Community Foundation",
  mobileNumber: "",
  email: "",
  confirmInformation: false,
  confirmProvisional: false,
  confirmFinalApproval: false,
};

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "required" | "optional" | "missing" | "uploaded" | "status";
}) {
  const classes: Record<typeof tone, string> = {
    required: "bg-amber-50 text-amber-800 ring-amber-200",
    optional: "bg-slate-100 text-slate-600 ring-slate-200",
    missing: "bg-red-50 text-red-700 ring-red-200",
    uploaded: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    status: "bg-sky-50 text-sky-800 ring-sky-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${classes[tone]}`}
    >
      {children}
    </span>
  );
}

function YesNoToggle({
  value,
  onChange,
  label,
  helper,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
  helper?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{label}</p>
          {value && helper ? (
            <p className="mt-1 text-xs text-amber-700">{helper}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 rounded-lg border border-gray-200 p-0.5">
          <button
            type="button"
            onClick={() => onChange(false)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              !value
                ? "bg-[#0f2740] text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            No
          </button>
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              value
                ? "bg-[#0f2740] text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            Yes
          </button>
        </div>
      </div>
    </div>
  );
}

function ProgressIndicator({
  currentStep,
  submitted,
}: {
  currentStep: number;
  submitted: boolean;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {WIZARD_STEPS.map((step, index) => {
        const complete = submitted || index < currentStep;
        const active = !submitted && index === currentStep;

        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-medium ${
                active
                  ? "bg-[#0f2740] text-white"
                  : complete
                    ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                    : "bg-gray-100 text-gray-500"
              }`}
            >
              <span className="text-xs">{index + 1}</span>
              <span>{step}</span>
            </span>
            {index < WIZARD_STEPS.length - 1 ? (
              <ChevronRight className="h-4 w-4 text-gray-300" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
      Demo only
    </span>
  );
}

function DrakensteinEventComplianceContent() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [eventDetails, setEventDetails] =
    useState<EventDetailsState>(INITIAL_EVENT_DETAILS);
  const [requirements, setRequirements] =
    useState<RequirementsState>(INITIAL_REQUIREMENTS);
  const [uploadedDocuments, setUploadedDocuments] =
    useState<UploadedDocumentsState>({});
  const [declaration, setDeclaration] =
    useState<DeclarationState>(INITIAL_DECLARATION);
  const fileInputRefs = useRef<Partial<Record<DocumentKey, HTMLInputElement>>>(
    {}
  );

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      setRole((profile as { role?: string } | null)?.role ?? null);
      setLoading(false);
    }
    void init();
  }, []);

  const documentStatus = useMemo(() => {
    return DOCUMENTS.map((doc) => {
      const required =
        doc.alwaysRequired ||
        (doc.requiredWhen ? requirements[doc.requiredWhen] : false);
      const uploaded = Boolean(uploadedDocuments[doc.key]);
      return { ...doc, required, uploaded };
    });
  }, [requirements, uploadedDocuments]);

  const missingRequiredDocuments = documentStatus.filter(
    (doc) => doc.required && !doc.uploaded
  ).length;

  function openModal() {
    setModalOpen(true);
    setSubmitted(false);
    setCurrentStep(0);
  }

  function closeModal() {
    setModalOpen(false);
    setSubmitted(false);
    setCurrentStep(0);
  }

  function handleFakeUpload(key: DocumentKey, file: File | undefined) {
    if (!file) return;
    setUploadedDocuments((prev) => ({ ...prev, [key]: file.name }));
  }

  function canAdvanceFromStep(step: number): boolean {
    if (step === 0) {
      return (
        eventDetails.eventName.trim() !== "" &&
        eventDetails.eventType !== "" &&
        eventDetails.setupDate !== "" &&
        eventDetails.strikeDate !== "" &&
        eventDetails.startTime !== "" &&
        eventDetails.endTime !== "" &&
        eventDetails.expectedParticipants.trim() !== "" &&
        eventDetails.expectedSpectators.trim() !== ""
      );
    }
    if (step === 2) {
      return missingRequiredDocuments === 0;
    }
    if (step === 3) {
      return (
        declaration.fullName.trim() !== "" &&
        declaration.idNumber.trim() !== "" &&
        declaration.designation.trim() !== "" &&
        declaration.organisationName.trim() !== "" &&
        declaration.mobileNumber.trim() !== "" &&
        declaration.email.trim() !== "" &&
        declaration.confirmInformation &&
        declaration.confirmProvisional &&
        declaration.confirmFinalApproval
      );
    }
    return true;
  }

  function goNext() {
    if (!canAdvanceFromStep(currentStep)) return;
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep((step) => step + 1);
    }
  }

  function goBack() {
    if (currentStep > 0) setCurrentStep((step) => step - 1);
  }

  function handleSubmit() {
    if (!canAdvanceFromStep(3)) return;
    setSubmitted(true);
  }

  if (loading) {
    return <main className="p-8 text-gray-600">Loading…</main>;
  }

  if (!hasAdminUiAccess(role)) {
    return (
      <main className="p-8">
        <p className="text-red-600">Access denied.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <DemoBadge />
          <p className="text-sm text-gray-500">
            Prototype for Drakenstein Municipality — no data is saved.
          </p>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900">
          Drakenstein Event Compliance Pack
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Demo workflow after a venue booking has been provisionally approved.
        </p>

        <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Booking summary
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Provisionally approved venue booking
              </p>
            </div>
            <Badge tone="status">Provisionally approved</Badge>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Venue
                </dt>
                <dd className="mt-1 text-sm font-medium text-gray-900">
                  Paarl Town Hall
                </dd>
              </div>
            </div>

            <div className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Event
                </dt>
                <dd className="mt-1 text-sm font-medium text-gray-900">
                  Community Awards Evening
                </dd>
              </div>
            </div>

            <div className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Date
                </dt>
                <dd className="mt-1 text-sm font-medium text-gray-900">
                  18 September 2026
                </dd>
              </div>
            </div>

            <div className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Time
                </dt>
                <dd className="mt-1 text-sm font-medium text-gray-900">
                  17:00 – 22:00
                </dd>
              </div>
            </div>

            <div className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4 sm:col-span-2">
              <Users className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Estimated attendance
                </dt>
                <dd className="mt-1 text-sm font-medium text-gray-900">350</dd>
              </div>
            </div>
          </dl>

          <button
            type="button"
            onClick={openModal}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#0f2740] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
          >
            Open compliance pack
          </button>
        </section>
      </div>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="compliance-modal-title"
        >
          <div className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="shrink-0 border-b border-gray-200 px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 pr-2">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <DemoBadge />
                    {submitted ? (
                      <Badge tone="uploaded">Submitted</Badge>
                    ) : (
                      <Badge tone="status">In progress</Badge>
                    )}
                  </div>
                  <h2
                    id="compliance-modal-title"
                    className="text-xl font-semibold text-gray-900"
                  >
                    {submitted
                      ? "Compliance pack submitted"
                      : "Complete event compliance requirements"}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {submitted
                      ? "Your event compliance pack has been submitted for review."
                      : "This information is required before the event can receive final approval."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {!submitted ? (
                <div className="mt-4 overflow-x-auto pb-1">
                  <ProgressIndicator
                    currentStep={currentStep}
                    submitted={submitted}
                  />
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-5 py-5 sm:px-6">
              {submitted ? (
                <div className="mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-gray-900">
                    Compliance pack submitted
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600">
                    Your event compliance pack has been submitted for review. The
                    venue remains provisionally approved until all required
                    documents and municipal approvals have been verified.
                  </p>
                  <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      disabled
                      title="Coming soon"
                      className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-medium text-gray-400"
                    >
                      <Download className="h-4 w-4" />
                      Download application pack
                      <span className="text-xs">(coming soon)</span>
                    </button>
                  </div>
                </div>
              ) : currentStep === 0 ? (
                <div className="mx-auto max-w-3xl space-y-5">
                  <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900">
                      Event details
                    </h3>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-sm font-medium text-gray-700">
                          Event name
                        </span>
                        <input
                          type="text"
                          value={eventDetails.eventName}
                          onChange={(e) =>
                            setEventDetails((prev) => ({
                              ...prev,
                              eventName: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
                        />
                      </label>

                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-sm font-medium text-gray-700">
                          Event type
                        </span>
                        <select
                          value={eventDetails.eventType}
                          onChange={(e) =>
                            setEventDetails((prev) => ({
                              ...prev,
                              eventType: e.target.value as EventType | "",
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
                        >
                          <option value="">Select event type</option>
                          {EVENT_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-sm font-medium text-gray-700">
                          Brief event description
                        </span>
                        <textarea
                          rows={4}
                          value={eventDetails.description}
                          onChange={(e) =>
                            setEventDetails((prev) => ({
                              ...prev,
                              description: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">
                          Setup date
                        </span>
                        <input
                          type="date"
                          value={eventDetails.setupDate}
                          onChange={(e) =>
                            setEventDetails((prev) => ({
                              ...prev,
                              setupDate: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">
                          Strike down date
                        </span>
                        <input
                          type="date"
                          value={eventDetails.strikeDate}
                          onChange={(e) =>
                            setEventDetails((prev) => ({
                              ...prev,
                              strikeDate: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">
                          Event start time
                        </span>
                        <input
                          type="time"
                          value={eventDetails.startTime}
                          onChange={(e) =>
                            setEventDetails((prev) => ({
                              ...prev,
                              startTime: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">
                          Event end time
                        </span>
                        <input
                          type="time"
                          value={eventDetails.endTime}
                          onChange={(e) =>
                            setEventDetails((prev) => ({
                              ...prev,
                              endTime: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">
                          Expected participants
                        </span>
                        <input
                          type="number"
                          min={0}
                          value={eventDetails.expectedParticipants}
                          onChange={(e) =>
                            setEventDetails((prev) => ({
                              ...prev,
                              expectedParticipants: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">
                          Expected spectators
                        </span>
                        <input
                          type="number"
                          min={0}
                          value={eventDetails.expectedSpectators}
                          onChange={(e) =>
                            setEventDetails((prev) => ({
                              ...prev,
                              expectedSpectators: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
                        />
                      </label>
                    </div>
                  </section>
                </div>
              ) : currentStep === 1 ? (
                <div className="mx-auto max-w-3xl space-y-3">
                  <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900">
                      Event requirements
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">
                      Indicate which activities apply to this event. Additional
                      documentation may be required.
                    </p>
                    <div className="mt-4 space-y-3">
                      {REQUIREMENTS.map((item) => (
                        <YesNoToggle
                          key={item.key}
                          label={item.label}
                          helper={item.helper}
                          value={requirements[item.key]}
                          onChange={(next) =>
                            setRequirements((prev) => ({
                              ...prev,
                              [item.key]: next,
                            }))
                          }
                        />
                      ))}
                    </div>
                  </section>
                </div>
              ) : currentStep === 2 ? (
                <div className="mx-auto max-w-4xl space-y-4">
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">
                          Required documents
                        </h3>
                        <p className="mt-1 text-sm text-gray-600">
                          Upload supporting documents. Files are stored locally in
                          this demo only.
                        </p>
                      </div>
                      {missingRequiredDocuments > 0 ? (
                        <Badge tone="missing">
                          {missingRequiredDocuments} missing
                        </Badge>
                      ) : (
                        <Badge tone="uploaded">All required uploaded</Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {documentStatus.map((doc) => (
                      <div
                        key={doc.key}
                        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h4 className="text-sm font-semibold text-gray-900">
                            {doc.name}
                          </h4>
                          {doc.uploaded ? (
                            <Badge tone="uploaded">Uploaded</Badge>
                          ) : doc.required ? (
                            <Badge tone="required">Required</Badge>
                          ) : (
                            <Badge tone="optional">Optional</Badge>
                          )}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-gray-600">
                          {doc.description}
                        </p>

                        {doc.uploaded ? (
                          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                            {uploadedDocuments[doc.key]}
                          </div>
                        ) : doc.required ? (
                          <div className="mt-4">
                            <Badge tone="missing">Missing</Badge>
                          </div>
                        ) : null}

                        <input
                          ref={(node) => {
                            fileInputRefs.current[doc.key] = node ?? undefined;
                          }}
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            handleFakeUpload(
                              doc.key,
                              e.target.files?.[0]
                            );
                            e.target.value = "";
                          }}
                        />

                        <button
                          type="button"
                          onClick={() => fileInputRefs.current[doc.key]?.click()}
                          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <FileUp className="h-4 w-4" />
                          Upload file
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-3xl">
                  <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900">
                      Declaration
                    </h3>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-sm font-medium text-gray-700">
                          Responsible person full name
                        </span>
                        <input
                          type="text"
                          value={declaration.fullName}
                          onChange={(e) =>
                            setDeclaration((prev) => ({
                              ...prev,
                              fullName: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">
                          ID number
                        </span>
                        <input
                          type="text"
                          value={declaration.idNumber}
                          onChange={(e) =>
                            setDeclaration((prev) => ({
                              ...prev,
                              idNumber: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">
                          Capacity / designation
                        </span>
                        <input
                          type="text"
                          value={declaration.designation}
                          onChange={(e) =>
                            setDeclaration((prev) => ({
                              ...prev,
                              designation: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
                        />
                      </label>

                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-sm font-medium text-gray-700">
                          Organisation name
                        </span>
                        <input
                          type="text"
                          value={declaration.organisationName}
                          onChange={(e) =>
                            setDeclaration((prev) => ({
                              ...prev,
                              organisationName: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">
                          Mobile number
                        </span>
                        <input
                          type="tel"
                          value={declaration.mobileNumber}
                          onChange={(e) =>
                            setDeclaration((prev) => ({
                              ...prev,
                              mobileNumber: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">
                          Email address
                        </span>
                        <input
                          type="email"
                          value={declaration.email}
                          onChange={(e) =>
                            setDeclaration((prev) => ({
                              ...prev,
                              email: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
                        />
                      </label>
                    </div>

                    <div className="mt-6 space-y-3 border-t border-gray-100 pt-5">
                      {[
                        {
                          key: "confirmInformation" as const,
                          label:
                            "I confirm that the information supplied is correct.",
                        },
                        {
                          key: "confirmProvisional" as const,
                          label:
                            "I understand that provisional venue approval does not mean the event permit has been approved.",
                        },
                        {
                          key: "confirmFinalApproval" as const,
                          label:
                            "I understand that the event may only proceed once final approval is issued.",
                        },
                      ].map((item) => (
                        <label
                          key={item.key}
                          className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4"
                        >
                          <input
                            type="checkbox"
                            checked={declaration[item.key]}
                            onChange={(e) =>
                              setDeclaration((prev) => ({
                                ...prev,
                                [item.key]: e.target.checked,
                              }))
                            }
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#0f2740] focus:ring-[#0f2740]"
                          />
                          <span className="text-sm text-gray-700">
                            {item.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </div>

            {!submitted ? (
              <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-gray-500">
                    Step {currentStep + 1} of {WIZARD_STEPS.length}:{" "}
                    {WIZARD_STEPS[currentStep]}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {currentStep > 0 ? (
                      <button
                        type="button"
                        onClick={goBack}
                        className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Back
                      </button>
                    ) : null}
                    {currentStep < WIZARD_STEPS.length - 1 ? (
                      <button
                        type="button"
                        onClick={goNext}
                        disabled={!canAdvanceFromStep(currentStep)}
                        className="rounded-xl bg-[#0f2740] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Continue
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canAdvanceFromStep(3)}
                        className="rounded-xl bg-[#0f2740] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Submit compliance pack
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default function DrakensteinEventCompliancePage() {
  return (
    <Suspense fallback={<main className="p-8 text-gray-600">Loading…</main>}>
      <DrakensteinEventComplianceContent />
    </Suspense>
  );
}
