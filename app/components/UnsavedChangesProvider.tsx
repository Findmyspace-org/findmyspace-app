"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { Loader2, X } from "lucide-react";

export type UnsavedSectionConfig = {
  label: string;
  isDirty: boolean;
  save?: () => Promise<boolean>;
};

type PendingNavigation = {
  type: "href" | "back";
  href?: string;
  source?: string;
};

type UnsavedChangesContextValue = {
  hasUnsavedChanges: boolean;
  dirtySectionLabels: string[];
  registerSection: (id: string, config: UnsavedSectionConfig) => void;
  unregisterSection: (id: string) => void;
  requestNavigation: (pending: PendingNavigation) => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

const DEV = process.env.NODE_ENV === "development";

function debugUnsaved(message: string, data?: Record<string, unknown>) {
  if (!DEV) return;
  if (data) {
    console.debug(`[UnsavedChanges] ${message}`, data);
  } else {
    console.debug(`[UnsavedChanges] ${message}`);
  }
}

export function useUnsavedChanges(): UnsavedChangesContextValue {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) {
    throw new Error("useUnsavedChanges must be used within UnsavedChangesProvider");
  }
  return ctx;
}

export function useUnsavedChangesOptional(): UnsavedChangesContextValue | null {
  return useContext(UnsavedChangesContext);
}

export function useRegisterUnsavedSection(
  sectionId: string,
  config: UnsavedSectionConfig
) {
  const ctx = useUnsavedChangesOptional();
  const { label, isDirty, save } = config;
  const saveRef = useRef(save);
  saveRef.current = save;

  const stableSave = useCallback(async () => {
    if (!saveRef.current) return true;
    return saveRef.current();
  }, []);

  useEffect(() => {
    if (!ctx) return;
    ctx.registerSection(sectionId, {
      label,
      isDirty,
      save: save ? stableSave : undefined,
    });
    return () => ctx.unregisterSection(sectionId);
  }, [ctx, sectionId, label, isDirty, save, stableSave]);
}

export function UnsavedSectionIndicator({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
      Unsaved
    </span>
  );
}

type ProviderProps = {
  children: ReactNode;
  enabled?: boolean;
  /** Used when browser-back leave cannot resolve history reliably. */
  backFallbackHref?: string;
};

export function UnsavedChangesProvider({
  children,
  enabled = true,
  backFallbackHref,
}: ProviderProps) {
  const pathname = usePathname();
  const sectionsRef = useRef<Map<string, UnsavedSectionConfig>>(new Map());
  const [revision, setRevision] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const pendingNavRef = useRef<PendingNavigation | null>(null);
  const isBypassingGuardRef = useRef(false);
  const guardDepthRef = useRef(0);
  const modalOpenRef = useRef(false);
  const pathnameWhenDirtyRef = useRef<string | null>(null);
  const backFallbackHrefRef = useRef(backFallbackHref);

  backFallbackHrefRef.current = backFallbackHref;
  modalOpenRef.current = modalOpen;

  const bump = useCallback(() => setRevision((value) => value + 1), []);

  const registerSection = useCallback(
    (id: string, config: UnsavedSectionConfig) => {
      sectionsRef.current.set(id, config);
      bump();
    },
    [bump]
  );

  const unregisterSection = useCallback(
    (id: string) => {
      sectionsRef.current.delete(id);
      bump();
    },
    [bump]
  );

  const dirtySections = useMemo(() => {
    void revision;
    return Array.from(sectionsRef.current.entries()).filter(([, section]) => section.isDirty);
  }, [revision]);

  const hasUnsavedChanges = enabled && !isBypassingGuardRef.current && dirtySections.length > 0;

  const canSaveAndLeave = dirtySections.every(([, section]) => typeof section.save === "function");

  const openModalForNavigation = useCallback((pending: PendingNavigation) => {
    pendingNavRef.current = pending;
    debugUnsaved("intercepted navigation", pending);
    setSaveError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    pendingNavRef.current = null;
    setModalOpen(false);
    setSaveError(null);
  }, []);

  const navigateToPending = useCallback((pending: PendingNavigation) => {
    debugUnsaved("executing navigation", pending);

    isBypassingGuardRef.current = true;
    pendingNavRef.current = null;
    setModalOpen(false);
    setSaveError(null);
    guardDepthRef.current = 0;
    pathnameWhenDirtyRef.current = null;

    if (pending.type === "href" && pending.href) {
      window.location.assign(pending.href);
      return;
    }

    if (pending.type === "back") {
      const fallback = backFallbackHrefRef.current;
      const steps = -(1 + guardDepthRef.current);
      debugUnsaved("browser back leave", { steps, fallback });

      if (fallback) {
        window.location.assign(fallback);
        return;
      }

      window.history.go(steps);

      window.setTimeout(() => {
        if (isBypassingGuardRef.current && window.location.pathname === pathname) {
          const referrer = document.referrer;
          if (referrer) {
            try {
              const refUrl = new URL(referrer);
              if (refUrl.origin === window.location.origin && refUrl.pathname !== pathname) {
                debugUnsaved("back fallback via referrer", { href: refUrl.pathname });
                window.location.assign(refUrl.pathname + refUrl.search + refUrl.hash);
                return;
              }
            } catch {
              /* ignore */
            }
          }
          debugUnsaved("back fallback via history.go failed — still on page");
        }
      }, 150);
    }
  }, [pathname]);

  const requestNavigation = useCallback(
    (pending: PendingNavigation) => {
      if (!enabled || isBypassingGuardRef.current || dirtySections.length === 0) {
        navigateToPending(pending);
        return;
      }
      openModalForNavigation(pending);
    },
    [dirtySections.length, enabled, navigateToPending, openModalForNavigation]
  );

  useEffect(() => {
    isBypassingGuardRef.current = false;
    guardDepthRef.current = 0;
    pathnameWhenDirtyRef.current = null;
    debugUnsaved("pathname changed — guard reset", { pathname });
  }, [pathname]);

  useEffect(() => {
    if (!enabled || dirtySections.length > 0) {
      return;
    }

    guardDepthRef.current = 0;
    pathnameWhenDirtyRef.current = null;
    isBypassingGuardRef.current = false;
  }, [dirtySections.length, enabled]);

  useEffect(() => {
    if (!enabled || dirtySections.length === 0 || isBypassingGuardRef.current) {
      return;
    }

    pathnameWhenDirtyRef.current = pathname;

    if (guardDepthRef.current === 0) {
      window.history.pushState({ unsavedChangesGuard: true }, "");
      guardDepthRef.current = 1;
      debugUnsaved("pushed history guard", { pathname });
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isBypassingGuardRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const onPopState = () => {
      if (isBypassingGuardRef.current) return;

      if (modalOpenRef.current) {
        window.history.pushState({ unsavedChangesGuard: true }, "");
        guardDepthRef.current += 1;
        debugUnsaved("back pressed while modal open — re-pushed guard", {
          guardDepth: guardDepthRef.current,
        });
        return;
      }

      openModalForNavigation({ type: "back", source: "popstate" });
      window.history.pushState({ unsavedChangesGuard: true }, "");
      guardDepthRef.current += 1;
      debugUnsaved("back intercepted — modal opened", { guardDepth: guardDepthRef.current });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
    };
  }, [dirtySections.length, enabled, openModalForNavigation, pathname]);

  useEffect(() => {
    if (!enabled || dirtySections.length === 0 || isBypassingGuardRef.current) {
      return;
    }

    const onDocumentClick = (event: MouseEvent) => {
      if (isBypassingGuardRef.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!anchor) return;
      if (anchor.getAttribute("target") === "_blank") return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash === window.location.hash
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const destination = url.pathname + url.search + url.hash;
      openModalForNavigation({ type: "href", href: destination, source: "link-click" });
    };

    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [dirtySections.length, enabled, openModalForNavigation]);

  function handleLeaveWithoutSaving() {
    const pending = pendingNavRef.current;
    if (!pending) {
      debugUnsaved("leave without saving — no pending navigation");
      return;
    }
    debugUnsaved("leave without saving clicked", pending);
    navigateToPending(pending);
  }

  async function handleSaveAndLeave() {
    const pending = pendingNavRef.current;
    if (!pending) {
      debugUnsaved("save and leave — no pending navigation");
      return;
    }

    debugUnsaved("save and leave clicked", pending);
    setSavingAll(true);
    setSaveError(null);

    try {
      for (const [, section] of dirtySections) {
        if (!section.save) continue;
        const ok = await section.save();
        if (!ok) {
          setSaveError("Could not save all changes. Fix any errors and try again, or leave without saving.");
          debugUnsaved("save and leave — section save failed", { label: section.label });
          return;
        }
      }
      debugUnsaved("save and leave — all sections saved, navigating");
      navigateToPending(pending);
    } finally {
      setSavingAll(false);
    }
  }

  const contextValue = useMemo<UnsavedChangesContextValue>(
    () => ({
      hasUnsavedChanges,
      dirtySectionLabels: dirtySections.map(([, section]) => section.label),
      registerSection,
      unregisterSection,
      requestNavigation,
    }),
    [dirtySections, hasUnsavedChanges, registerSection, requestNavigation, unregisterSection]
  );

  return (
    <UnsavedChangesContext.Provider value={contextValue}>
      {children}

      {modalOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-labelledby="unsaved-changes-title"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 id="unsaved-changes-title" className="text-lg font-semibold text-[#192a3a]">
                  Unsaved changes
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  You have unsaved changes on this space. Save your changes before leaving, or
                  leave without saving?
                </p>
                {saveError ? (
                  <p className="mt-2 text-sm text-red-700">{saveError}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#192a3a] hover:bg-gray-50"
              >
                Stay on page
              </button>
              <button
                type="button"
                onClick={handleLeaveWithoutSaving}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50"
              >
                Leave without saving
              </button>
              {canSaveAndLeave ? (
                <button
                  type="button"
                  disabled={savingAll}
                  onClick={() => void handleSaveAndLeave()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#192a3a] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {savingAll ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Save and leave
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </UnsavedChangesContext.Provider>
  );
}
