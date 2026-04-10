"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";

type OwnerVerificationDocument = {
  id: string;
  document_type: string;
  file_url: string | null;
  file_path?: string | null;
  status: string | null;
};

type OwnerBankDetails = {
  id: string;
  account_holder_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_type: string | null;
  branch_code: string | null;
  proof_of_bank_url: string | null;
  proof_of_bank_path?: string | null;
  status: string | null;
};

type ProfileVerificationRow = {
  owner_verification_status: string | null;
  bank_verification_status: string | null;
};

type ListingProofRow = {
  id: string;
  title: string | null;
  ownership_proof_url: string | null;
  ownership_proof_path: string | null;
  ownership_proof_status: string | null;
};

type OwnershipDocumentQueryRow = {
  space_id: string | null;
  file_url: string | null;
  file_path: string | null;
  status: string | null;
};

type OwnerVerificationInsertRow = {
  owner_id: string;
  document_type: string;
  file_url: string;
  file_path: string;
  status: string;
};

type OwnerBankDetailsInsertRow = {
  owner_id: string;
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  account_type: string;
  branch_code: string;
  proof_of_bank_url: string | null;
  proof_of_bank_path: string | null;
  status: string;
};

type OwnerBankDetailsUpdateRow = {
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  account_type: string;
  branch_code: string;
  proof_of_bank_url: string | null;
  status: string;
  proof_of_bank_path?: string;
};

type WorkflowStatus = "Missing" | "Uploaded" | "Verified" | "Rejected";

type WorkflowRow = {
  key: string;
  label: string;
  requirement: "Identity" | "Bank" | "Listings";
  fileUrl?: string | null;
  filePath?: string | null;
  status: WorkflowStatus;
  actionText: string;
  actionHref?: string;
};

type VerificationStepKey = "identity" | "bank" | "overview" | "list-space";

const VERIFICATION_STEPS: {
  key: VerificationStepKey;
  number: number;
  title: string;
  subtitle: string;
  href: string;
}[] = [
    {
      key: "identity",
      number: 1,
      title: "Identity",
      subtitle: "Who you are",
      href: "/dashboard/verification?step=identity",
    },
    {
      key: "bank",
      number: 2,
      title: "Bank",
      subtitle: "Show me the money",
      href: "/dashboard/verification?step=bank",
    },
    {
      key: "overview",
      number: 3,
      title: "Host Admin",
      subtitle: "Manage verification & documents",
      href: "/dashboard/verification?step=overview",
    },
    {
      key: "list-space",
      number: 4,
      title: "List your space",
      subtitle: "Create your first listing now",
      href: "/dashboard/new-space",
    },
  ];

const SOUTH_AFRICAN_BANKS = [
  "Absa Bank",
  "African Bank",
  "Albaraka Bank",
  "Bank Zero",
  "Bidvest Bank",
  "Capitec Bank",
  "Discovery Bank",
  "First National Bank (FNB) / FirstRand Bank",
  "Grindrod Bank",
  "Habib Bank",
  "HBZ Bank",
  "Investec Bank",
  "Nedbank",
  "Sasfin Bank",
  "Standard Bank",
  "TymeBank",
  "Other",
] as const;

const ACCOUNT_TYPES = ["Cheque", "Credit", "Savings"] as const;

function mapStatus(
  hasFile: boolean,
  status: string | null | undefined
): WorkflowStatus {
  if (!hasFile) return "Missing";
  if (status === "verified") return "Verified";
  if (status === "rejected") return "Rejected";
  return "Uploaded";
}

export default function VerificationPage() {
  const searchParams = useSearchParams();
  const step = searchParams.get("step") || "identity";
  const currentStep: VerificationStepKey =
    step === "bank" ? "bank" : step === "overview" ? "overview" : "identity";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [ownerVerificationStatus, setOwnerVerificationStatus] =
    useState("pending");
  const [bankVerificationStatus, setBankVerificationStatus] =
    useState("pending");

  const [existingDocs, setExistingDocs] = useState<OwnerVerificationDocument[]>(
    []
  );
  const [existingBankDetails, setExistingBankDetails] =
    useState<OwnerBankDetails | null>(null);
  const [listingProofs, setListingProofs] = useState<ListingProofRow[]>([]);

  const [idFrontFile, setIdFrontFile] = useState<File | null>(null);
  const [idBackFile, setIdBackFile] = useState<File | null>(null);
  const [bankProofFile, setBankProofFile] = useState<File | null>(null);

  const [accountHolderName, setAccountHolderName] = useState("");
  const [bankName, setBankName] = useState("");
  const [customBankName, setCustomBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState("");
  const [branchCode, setBranchCode] = useState("");

  useEffect(() => {
    loadVerificationData();
  }, []);

  async function fetchOwnershipDocs(listingIds: string[]) {
    const { data, error } = await (supabase
      .from("listing_ownership_documents") as any)
      .select("space_id, file_url, file_path, status")
      .in("space_id", listingIds)
      .order("id", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data || []) as OwnershipDocumentQueryRow[];
  }

  async function loadVerificationData() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Please log in first.");
      setLoading(false);
      return;
    }

    const { data: rawProfileData, error: profileError } = await (supabase
      .from("profiles") as any)
      .select("owner_verification_status, bank_verification_status")
      .eq("id", user.id)
      .single();

    const profileData = rawProfileData as ProfileVerificationRow | null;

    if (profileError) {
      setMessage(profileError.message);
      setLoading(false);
      return;
    }

    setOwnerVerificationStatus(
      profileData?.owner_verification_status || "pending"
    );
    setBankVerificationStatus(
      profileData?.bank_verification_status || "pending"
    );

    const { data: docsData, error: docsError } = await (supabase
      .from("owner_verification_documents") as any)
      .select("id, document_type, file_url, file_path, status")
      .eq("owner_id", user.id)
      .order("id", { ascending: false });

    if (docsError) {
      setMessage(docsError.message);
      setLoading(false);
      return;
    }

    setExistingDocs((docsData || []) as OwnerVerificationDocument[]);

    const { data: bankData, error: bankError } = await (supabase
      .from("owner_bank_details") as any)
      .select(
        "id, account_holder_name, bank_name, account_number, account_type, branch_code, proof_of_bank_url, proof_of_bank_path, status"
      )
      .eq("owner_id", user.id)
      .maybeSingle();

    if (bankError) {
      setMessage(bankError.message);
      setLoading(false);
      return;
    }

    if (bankData) {
      const typedBankData = bankData as OwnerBankDetails;
      setExistingBankDetails(typedBankData);
      setAccountHolderName(typedBankData.account_holder_name || "");
      const savedBankName = typedBankData.bank_name || "";
      if (savedBankName && SOUTH_AFRICAN_BANKS.includes(savedBankName as (typeof SOUTH_AFRICAN_BANKS)[number])) {
        setBankName(savedBankName);
        setCustomBankName("");
      } else if (savedBankName) {
        setBankName("Other");
        setCustomBankName(savedBankName);
      } else {
        setBankName("");
        setCustomBankName("");
      }
      setAccountNumber(typedBankData.account_number || "");
      setAccountType(typedBankData.account_type || "");
      setBranchCode(typedBankData.branch_code || "");
    } else {
      setExistingBankDetails(null);
      setAccountHolderName("");
      setCustomBankName("");
      setBankName("");
      setAccountNumber("");
      setAccountType("");
      setBranchCode("");
    }

    const { data: rawSpaces, error: spacesError } = await (supabase
      .from("spaces") as any)
      .select("id, title")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (spacesError) {
      setMessage(spacesError.message);
      setLoading(false);
      return;
    }

    const ownerSpaces = (rawSpaces || []) as {
      id: string;
      title: string | null;
    }[];
    const listingIds = ownerSpaces.map((space) => space.id);

    let listingProofRows: ListingProofRow[] = [];

    if (listingIds.length > 0) {
      try {
        const ownershipDocs = await fetchOwnershipDocs(listingIds);

        listingProofRows = ownerSpaces.map((space) => {
          const doc = ownershipDocs.find((item) => item.space_id === space.id);
          return {
            id: space.id,
            title: space.title,
            ownership_proof_url: doc?.file_url || null,
            ownership_proof_path: doc?.file_path || null,
            ownership_proof_status: doc?.status || null,
          };
        });
      } catch (error) {
        console.error("Ownership document lookup failed:", error);
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load ownership documents."
        );
        listingProofRows = ownerSpaces.map((space) => ({
          id: space.id,
          title: space.title,
          ownership_proof_url: null,
          ownership_proof_path: null,
          ownership_proof_status: null,
        }));
      }
    }

    setListingProofs(listingProofRows);
    setLoading(false);
  }

  async function uploadPrivateFile(
    bucket: string,
    ownerId: string,
    file: File,
    folder: string
  ) {
    const fileExt = file.name.split(".").pop() || "bin";
    const filePath = `${ownerId}/${folder}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const signedUrlResponse = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, 60 * 60);

    if (signedUrlResponse.error) {
      throw new Error(signedUrlResponse.error.message);
    }

    const signedUrl = signedUrlResponse.data?.signedUrl;

    if (!signedUrl) {
      throw new Error("Could not create signed URL.");
    }

    return {
      filePath,
      fileUrl: signedUrl,
    };
  }

  async function handleSaveIdentity(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("Please log in first.");
        setSaving(false);
        return;
      }

      const docsToInsert: OwnerVerificationInsertRow[] = [];

      if (idFrontFile) {
        const uploaded = await uploadPrivateFile(
          "owner-verification",
          user.id,
          idFrontFile,
          "id-front"
        );

        docsToInsert.push({
          owner_id: user.id,
          document_type: "id_front",
          file_url: uploaded.fileUrl,
          file_path: uploaded.filePath,
          status: "pending",
        });
      }

      if (idBackFile) {
        const uploaded = await uploadPrivateFile(
          "owner-verification",
          user.id,
          idBackFile,
          "id-back"
        );

        docsToInsert.push({
          owner_id: user.id,
          document_type: "id_back",
          file_url: uploaded.fileUrl,
          file_path: uploaded.filePath,
          status: "pending",
        });
      }

      if (docsToInsert.length > 0) {
        const { error: docsInsertError } = await (supabase
          .from("owner_verification_documents") as any)
          .insert(docsToInsert);

        if (docsInsertError) {
          throw new Error(docsInsertError.message);
        }
      }

      const { error: profileUpdateError } = await (supabase.from("profiles") as any)
        .update({
          is_host: true,
          owner_verification_status: "pending",
        })
        .eq("id", user.id);

      if (profileUpdateError) {
        throw new Error(profileUpdateError.message);
      }

      setMessage("Identity documents saved. Continue to bank details.");
      setIdFrontFile(null);
      setIdBackFile(null);
      await loadVerificationData();
      window.location.href = "/dashboard/verification?step=bank";
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong while saving identity documents."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveBank(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("Please log in first.");
        setSaving(false);
        return;
      }

      let uploadedBankProofUrl =
        existingBankDetails?.proof_of_bank_url || null;
      let uploadedBankProofPath: string | null =
        existingBankDetails?.proof_of_bank_path || null;

      if (!accountHolderName.trim()) {
        throw new Error("Please enter the account holder name.");
      }

      if (!bankName) {
        throw new Error("Please select a bank.");
      }

      if (bankName === "Other" && !customBankName.trim()) {
        throw new Error("Please enter the bank name.");
      }

      if (!accountNumber.trim()) {
        throw new Error("Please enter the account number.");
      }

      if (!accountType) {
        throw new Error("Please select the account type.");
      }

      if (!branchCode.trim()) {
        throw new Error("Please enter the branch code.");
      }

      if (bankProofFile) {
        const uploaded = await uploadPrivateFile(
          "bank-proofs",
          user.id,
          bankProofFile,
          "bank-proof"
        );

        uploadedBankProofUrl = uploaded.fileUrl;
        uploadedBankProofPath = uploaded.filePath;
      }

      const finalBankName = bankName === "Other" ? customBankName.trim() : bankName;

      if (existingBankDetails?.id) {
        const updateRow: OwnerBankDetailsUpdateRow = {
          account_holder_name: accountHolderName,
          bank_name: finalBankName,
          account_number: accountNumber,
          account_type: accountType,
          branch_code: branchCode,
          proof_of_bank_url: uploadedBankProofUrl,
          status: "pending",
          ...(uploadedBankProofPath
            ? { proof_of_bank_path: uploadedBankProofPath }
            : {}),
        };

        const { error: bankUpdateError } = await (supabase
          .from("owner_bank_details") as any)
          .update(updateRow)
          .eq("id", existingBankDetails.id);

        if (bankUpdateError) {
          throw new Error(bankUpdateError.message);
        }
      } else {
        const insertRow: OwnerBankDetailsInsertRow = {
          owner_id: user.id,
          account_holder_name: accountHolderName,
          bank_name: finalBankName,
          account_number: accountNumber,
          account_type: accountType,
          branch_code: branchCode,
          proof_of_bank_url: uploadedBankProofUrl,
          proof_of_bank_path: uploadedBankProofPath,
          status: "pending",
        };

        const { error: bankInsertError } = await (supabase
          .from("owner_bank_details") as any)
          .insert(insertRow);

        if (bankInsertError) {
          throw new Error(bankInsertError.message);
        }
      }

      const { error: profileUpdateError } = await (supabase.from("profiles") as any)
        .update({
          is_host: true,
          bank_verification_status: "pending",
        })
        .eq("id", user.id);

      if (profileUpdateError) {
        throw new Error(profileUpdateError.message);
      }

      setMessage("Bank details saved. Go to your host dashboard.");
      setBankProofFile(null);
      await loadVerificationData();
      window.location.href = "/dashboard/verification?step=overview";
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong while saving bank details."
      );
    } finally {
      setSaving(false);
    }
  }

  async function buildViewUrl(
    bucket: "owner-verification" | "bank-proofs" | "listing-ownership",
    filePath?: string | null,
    fallbackUrl?: string | null
  ) {
    if (filePath) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(filePath, 60 * 60);

      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }
    }

    return fallbackUrl || null;
  }

  async function handleViewDocument(row: WorkflowRow) {
    let url: string | null = null;

    if (row.key === "id_front" || row.key === "id_back") {
      url = await buildViewUrl("owner-verification", row.filePath, row.fileUrl);
    } else if (row.key === "bank_proof") {
      url = await buildViewUrl("bank-proofs", row.filePath, row.fileUrl);
    } else if (row.key.startsWith("listing_")) {
      url = await buildViewUrl("listing-ownership", row.filePath, row.fileUrl);
    }

    if (!url) {
      setMessage("Could not open this document.");
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  function badgeClass(status: WorkflowStatus) {
    if (status === "Verified") return "bg-green-100 text-green-800";
    if (status === "Rejected") return "bg-red-100 text-red-800";
    if (status === "Uploaded") return "bg-blue-100 text-blue-800";
    return "bg-yellow-100 text-yellow-800";
  }

  const workflowRows = useMemo<WorkflowRow[]>(() => {
    const idFrontDoc = existingDocs.find((doc) => doc.document_type === "id_front");
    const idBackDoc = existingDocs.find((doc) => doc.document_type === "id_back");

    const bankDetailsComplete = !!(
      existingBankDetails?.account_holder_name &&
      existingBankDetails?.bank_name &&
      existingBankDetails?.account_number &&
      existingBankDetails?.account_type &&
      existingBankDetails?.branch_code
    );

    const baseRows: WorkflowRow[] = [
      {
        key: "id_front",
        label: "ID front",
        requirement: "Identity",
        fileUrl: idFrontDoc?.file_url || null,
        filePath: idFrontDoc?.file_path || null,
        status: mapStatus(
          !!idFrontDoc?.file_url || !!idFrontDoc?.file_path,
          idFrontDoc?.status
        ),
        actionText:
          idFrontDoc?.file_url || idFrontDoc?.file_path
            ? "View / replace"
            : "Upload",
        actionHref: "/dashboard/verification?step=identity",
      },
      {
        key: "id_back",
        label: "ID back",
        requirement: "Identity",
        fileUrl: idBackDoc?.file_url || null,
        filePath: idBackDoc?.file_path || null,
        status: mapStatus(
          !!idBackDoc?.file_url || !!idBackDoc?.file_path,
          idBackDoc?.status
        ),
        actionText:
          idBackDoc?.file_url || idBackDoc?.file_path
            ? "View / replace"
            : "Upload",
        actionHref: "/dashboard/verification?step=identity",
      },
      {
        key: "bank_details",
        label: "Bank details",
        requirement: "Bank",
        status: bankDetailsComplete ? "Uploaded" : "Missing",
        actionText: bankDetailsComplete ? "Edit" : "Complete",
        actionHref: "/dashboard/verification?step=bank",
      },
      {
        key: "bank_proof",
        label: "Proof of bank",
        requirement: "Bank",
        fileUrl: existingBankDetails?.proof_of_bank_url || null,
        filePath: existingBankDetails?.proof_of_bank_path || null,
        status: mapStatus(
          !!existingBankDetails?.proof_of_bank_url ||
          !!existingBankDetails?.proof_of_bank_path,
          existingBankDetails?.status
        ),
        actionText:
          existingBankDetails?.proof_of_bank_url ||
            existingBankDetails?.proof_of_bank_path
            ? "View / replace"
            : "Upload",
        actionHref: "/dashboard/verification?step=bank",
      },
    ];

    const listingRows: WorkflowRow[] = listingProofs.map((listing) => ({
      key: `listing_${listing.id}`,
      label: listing.title
        ? `${listing.title} ownership proof`
        : `Listing ${listing.id} ownership proof`,
      requirement: "Listings",
      fileUrl: listing.ownership_proof_url || null,
      filePath: listing.ownership_proof_path || null,
      status: mapStatus(
        !!listing.ownership_proof_url || !!listing.ownership_proof_path,
        listing.ownership_proof_status
      ),
      actionText: "Go to listing",
      actionHref: "/dashboard/listings",
    }));

    return [...baseRows, ...listingRows];
  }, [existingDocs, existingBankDetails, listingProofs]);

  function getStepState(stepKey: VerificationStepKey) {
    const stepOrder: VerificationStepKey[] = [
      "identity",
      "bank",
      "overview",
      "list-space",
    ];

    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(stepKey);

    if (stepKey === "list-space") {
      if (currentStep === "overview") {
        return "ready" as const;
      }

      if (stepIndex < currentIndex) return "complete" as const;
      return "upcoming" as const;
    }

    if (stepKey === currentStep) return "active" as const;
    if (stepIndex < currentIndex) return "complete" as const;
    return "upcoming" as const;
  }

  function getStepClasses(state: "active" | "complete" | "upcoming" | "ready") {
    if (state === "active") {
      return {
        card: "border-[#192a3a] bg-[#192a3a] text-white",
        badge: "bg-white/15 text-white",
        title: "text-white",
        subtitle: "text-gray-200",
      };
    }

    if (state === "complete") {
      return {
        card: "border-[#192a3a] bg-blue-50 text-[#192a3a]",
        badge: "bg-[#192a3a] text-white",
        title: "text-[#192a3a]",
        subtitle: "text-gray-600",
      };
    }

    if (state === "ready") {
      return {
        card: "border-blue-200 bg-blue-50 text-[#192a3a]",
        badge: "bg-[#192a3a] text-white",
        title: "text-[#192a3a]",
        subtitle: "text-gray-600",
      };
    }

    return {
      card: "border-gray-200 bg-white text-[#192a3a]",
      badge: "bg-gray-100 text-gray-600",
      title: "text-[#192a3a]",
      subtitle: "text-gray-500",
    };
  }

  function renderStepHeader() {
    if (step === "identity") {
      return {
        title: "Step 1 - Who you are",
        subtitle:
          "Upload your ID document front and back so we can verify you as a host.",
      };
    }

    if (step === "bank") {
      return {
        title: "Step 2 - Show me the money",
        subtitle:
          "Add your bank details and proof of bank account so payouts can be set up.",
      };
    }

    return {
      title: "Step 3 - Host Admin",
      subtitle:
        "Track your host onboarding progress, manage uploaded documents, and see what is still needed before your listing can go live.",
    };
  }

  const header = renderStepHeader();


  return (
    <RequireAuth>
      <main className="min-h-screen bg-white px-6 py-10 text-[#192a3a]">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8">
            <h1 className="mb-2 text-4xl font-bold">{header.title}</h1>
            <p className="text-gray-600">{header.subtitle}</p>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-4">
            {VERIFICATION_STEPS.map((item) => {
              const state = getStepState(item.key);
              const styles = getStepClasses(state);
              const isListSpace = item.key === "list-space";

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`rounded-xl border p-5 shadow-sm transition-colors ${styles.card} hover:opacity-95`}
                >
                  <div
                    className={`mb-3 inline-flex h-8 min-w-8 items-center justify-center rounded-full px-3 text-sm font-semibold ${styles.badge}`}
                  >
                    {item.number}
                  </div>
                  <h2 className={`mb-2 text-lg font-semibold ${styles.title}`}>
                    {item.title}
                  </h2>
                  <p className={`text-sm ${styles.subtitle}`}>{item.subtitle}</p>
                  {isListSpace && (
                    <p className="mt-3 text-xs text-gray-500">
                      Your listing will stay pending until identity, bank, and ownership proof are approved.
                    </p>
                  )}
                </Link>
              );
            })}
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">Owner verification overall</p>
              <div className="mt-3">
                <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                  {ownerVerificationStatus}
                </span>
              </div>
            </div>

            <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">Bank verification overall</p>
              <div className="mt-3">
                <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                  {bankVerificationStatus}
                </span>
              </div>
            </div>
          </div>

          {message && (
            <div className="mb-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800">
              {message}
            </div>
          )}

          {loading ? (
            <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
              Loading verification details...
            </div>
          ) : (
            <>
              {step === "identity" && (
                <form
                  onSubmit={handleSaveIdentity}
                  className="mb-8 space-y-8 rounded-md border border-gray-200 bg-white p-8 shadow-sm"
                >
                  <section>
                    <h2 className="mb-4 text-2xl font-semibold">Identity documents</h2>

                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          ID document front
                        </label>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => setIdFrontFile(e.target.files?.[0] || null)}
                          className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
                        />
                        <p className="mt-2 text-sm text-gray-500">
                          {idFrontFile
                            ? idFrontFile.name
                            : existingDocs.find((doc) => doc.document_type === "id_front")
                              ? "Already uploaded"
                              : "Not uploaded yet"}
                        </p>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          ID document back
                        </label>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => setIdBackFile(e.target.files?.[0] || null)}
                          className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
                        />
                        <p className="mt-2 text-sm text-gray-500">
                          {idBackFile
                            ? idBackFile.name
                            : existingDocs.find((doc) => doc.document_type === "id_back")
                              ? "Already uploaded"
                              : "Not uploaded yet"}
                        </p>
                      </div>
                    </div>
                  </section>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-md bg-[#192a3a] px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {saving ? "Saving..." : "Save and continue to bank"}
                    </button>

                    <Link
                      href="/dashboard/verification?step=overview"
                      className="rounded-md border border-gray-300 px-5 py-3 text-sm"
                    >
                      Back to host dashboard
                    </Link>
                  </div>
                </form>
              )}

              {step === "bank" && (
                <form
                  onSubmit={handleSaveBank}
                  className="mb-8 space-y-8 rounded-md border border-gray-200 bg-white p-8 shadow-sm"
                >
                  <section>
                    <h2 className="mb-4 text-2xl font-semibold">Bank details</h2>

                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Account holder name
                        </label>
                        <input
                          type="text"
                          value={accountHolderName}
                          onChange={(e) => setAccountHolderName(e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Bank
                        </label>
                        <select
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                          className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 outline-none"
                        >
                          <option value="">Select bank</option>
                          {SOUTH_AFRICAN_BANKS.map((bank) => (
                            <option key={bank} value={bank}>
                              {bank}
                            </option>
                          ))}
                        </select>

                        {bankName === "Other" && (
                          <input
                            type="text"
                            value={customBankName}
                            onChange={(e) => setCustomBankName(e.target.value)}
                            placeholder="Enter bank name"
                            className="mt-3 w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
                          />
                        )}
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Account number
                        </label>
                        <input
                          type="text"
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Account type
                        </label>
                        <select
                          value={accountType}
                          onChange={(e) => setAccountType(e.target.value)}
                          className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 outline-none"
                        >
                          <option value="">Select account type</option>
                          {ACCOUNT_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Branch code
                        </label>
                        <input
                          type="text"
                          value={branchCode}
                          onChange={(e) => setBranchCode(e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Proof of bank account
                        </label>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => setBankProofFile(e.target.files?.[0] || null)}
                          className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none"
                        />
                        <p className="mt-2 text-sm text-gray-500">
                          {bankProofFile
                            ? bankProofFile.name
                            : existingBankDetails?.proof_of_bank_url ||
                              existingBankDetails?.proof_of_bank_path
                              ? "Already uploaded"
                              : "Not uploaded yet"}
                        </p>
                      </div>
                    </div>
                  </section>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-md bg-[#192a3a] px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {saving ? "Saving..." : "Save and go to host dashboard"}
                    </button>

                    <Link
                      href="/dashboard/verification?step=identity"
                      className="rounded-md border border-gray-300 px-5 py-3 text-sm"
                    >
                      Back to identity
                    </Link>
                  </div>
                </form>
              )}

              {step === "overview" && (
                <div className="rounded-md border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-200 px-6 py-4">
                    <h2 className="text-2xl font-semibold">Host Admin</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      Review your uploaded documents, track approvals, and see what still needs attention. You can create a listing now and it will go live once identity, bank, and ownership proof are approved.
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50 text-left text-sm text-gray-600">
                          <th className="px-6 py-4 font-medium">Requirement</th>
                          <th className="px-6 py-4 font-medium">Status</th>
                          <th className="px-6 py-4 font-medium">Action</th>
                          <th className="px-6 py-4 font-medium">View</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workflowRows.map((row) => (
                          <tr key={row.key} className="border-b border-gray-200 text-sm">
                            <td className="px-6 py-4">
                              <div className="font-medium">{row.label}</div>
                              <div className="mt-1 text-xs text-gray-500">
                                {row.requirement}
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${badgeClass(
                                  row.status
                                )}`}
                              >
                                {row.status}
                              </span>
                            </td>

                            <td className="px-6 py-4">
                              {row.actionHref ? (
                                <Link
                                  href={row.actionHref}
                                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                                >
                                  {row.actionText}
                                </Link>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>

                            <td className="px-6 py-4">
                              {row.fileUrl || row.filePath ? (
                                <button
                                  type="button"
                                  onClick={() => handleViewDocument(row)}
                                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                                >
                                  View
                                </button>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap gap-3 border-t border-gray-200 px-6 py-4">
                    <Link
                      href="/dashboard/new-space"
                      className="rounded-md bg-[#192a3a] px-5 py-3 text-sm font-medium text-white"
                    >
                      List your space
                    </Link>

                    <p className="self-center text-sm text-gray-500">
                      You can create a listing now. It will go live once identity, bank, and ownership proof are approved.
                    </p>

                    <Link
                      href="/dashboard/listings"
                      className="rounded-md border border-gray-300 px-5 py-3 text-sm"
                    >
                      Go to my listings
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </RequireAuth>
  );
}