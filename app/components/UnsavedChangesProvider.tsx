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
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";

export type UnsavedSectionConfig = {
  label: string;
  isDirty: boolean;
  save?: () => Promise<boolean>;
};

type PendingNavigation =
  | { type: "href"; href: string }
  | { type: "back" }
  | { type: "custom"; action: () => void };

type UnsavedChangesContextValue = {
  hasUnsavedChanges: boolean;
  dirtySectionLabels: string[];
  registerSection: (id: string, config: UnsavedSectionConfig) => void;
  unregisterSection: (id: string) => void;
  requestNavigation: (pending: PendingNavigation) => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

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
};

export function UnsavedChangesProvider({ children, enabled = true }: ProviderProps) {
  const router = useRouter();
  const sectionsRef = useRef<Map<string, UnsavedSectionConfig>>(new Map());
  const [revision, setRevision] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingNav, setPendingNav] = useState<PendingNavigation | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [discardUnsaved, setDiscardUnsaved] = useState(false);
  const guardPushedRef = useRef(false);
  const allowNavigationRef = useRef(false);
  const modalOpenRef = useRef(false);

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

  const hasUnsavedChanges =
    enabled && !discardUnsaved && dirtySections.length > 0;

  const canSaveAndLeave = dirtySections.every(([, section]) => typeof section.save === "function");

  const releaseNavigationGuards = useCallback(() => {
    window.setTimeout(() => {
      allowNavigationRef.current = false;
      setDiscardUnsaved(false);
      guardPushedRef.current = false;
    }, 1500);
  }, []);

  const completeNavigation = useCallback(
    (pending: PendingNavigation, options?: { discard?: boolean }) => {
      if (options?.discard) {
        setDiscardUnsaved(true);
      }

      allowNavigationRef.current = true;
      setModalOpen(false);
      setPendingNav(null);

      window.requestAnimationFrame(() => {
        if (pending.type === "href") {
          if (pending.href.startsWith("http")) {
            window.location.assign(pending.href);
          } else {
            router.push(pending.href);
          }
        } else if (pending.type === "back") {
          const steps = guardPushedRef.current ? -2 : -1;
          guardPushedRef.current = false;
          window.history.go(steps);
        } else {
          pending.action();
        }

        releaseNavigationGuards();
      });
    },
    [releaseNavigationGuards, router]
  );

  const requestNavigation = useCallback(
    (pending: PendingNavigation) => {
      if (!enabled || allowNavigationRef.current || discardUnsaved || dirtySections.length === 0) {
        completeNavigation(pending);
        return;
      }
      setPendingNav(pending);
      setModalOpen(true);
    },
    [completeNavigation, dirtySections.length, discardUnsaved, enabled]
  );

  useEffect(() => {
    if (!hasUnsavedChanges) {
      guardPushedRef.current = false;
      return;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowNavigationRef.current || discardUnsaved) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [discardUnsaved, hasUnsavedChanges]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    if (!guardPushedRef.current) {
      window.history.pushState({ unsavedChangesGuard: true }, "");
      guardPushedRef.current = true;
    }

    const onPopState = () => {
      if (allowNavigationRef.current || discardUnsaved) return;

      if (modalOpenRef.current) {
        window.history.pushState({ unsavedChangesGuard: true }, "");
        return;
      }

      setPendingNav({ type: "back" });
      setModalOpen(true);
      window.history.pushState({ unsavedChangesGuard: true }, "");
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [discardUnsaved, hasUnsavedChanges]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const onDocumentClick = (event: MouseEvent) => {
      if (allowNavigationRef.current || discardUnsaved) return;
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
      setPendingNav({ type: "href", href: url.pathname + url.search + url.hash });
      setModalOpen(true);
    };

    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [discardUnsaved, hasUnsavedChanges]);

  async function handleSaveAndLeave() {
    if (!pendingNav) return;
    setSavingAll(true);
    try {
      for (const [, section] of dirtySections) {
        if (!section.save) continue;
        const ok = await section.save();
        if (!ok) return;
      }
      completeNavigation(pendingNav, { discard: true });
    } finally {
      setSavingAll(false);
    }
  }

  function handleLeaveWithoutSaving() {
    if (!pendingNav) return;
    completeNavigation(pendingNav, { discard: true });
  }

  const contextValue = useMemo<UnsavedChangesContextValue>(
    () => ({
      hasUnsavedChanges,
      dirtySectionLabels: dirtySections.map(([, section]) => section.label),
      registerSection,
      unregisterSection,
      requestNavigation,
    }),
    [
      dirtySections,
      hasUnsavedChanges,
      registerSection,
      requestNavigation,
      unregisterSection,
    ]
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
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setPendingNav(null);
                }}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setPendingNav(null);
                }}
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
