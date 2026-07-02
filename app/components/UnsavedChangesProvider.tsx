"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAuthRelatedPath } from "@/lib/auth-redirect";
import { Loader2, X } from "lucide-react";
import type { ComponentProps } from "react";

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
  updateSection: (id: string, config: UnsavedSectionConfig) => void;
  unregisterSection: (id: string) => void;
  requestNavigation: (pending: PendingNavigation) => void;
  saveAllDirtySections: (options?: { skipIds?: string[] }) => Promise<boolean>;
  /** Synchronously clear dirty flags after a successful save (before React re-render). */
  markSectionsClean: (sectionIds?: string[]) => void;
  /** Disable beforeunload / link interception before programmatic full-page navigation. */
  releaseGuardForUnload: () => void;
  /** Form baseline is synced — allow history guard and navigation blocking. */
  setBaselineReady: (ready: boolean) => void;
  /** Clear synthetic history guard entries after save or baseline sync. */
  resetHistoryGuard: () => void;
  /** Live guard check (reads refs — safe from event handlers). */
  isNavigationBlocked: () => boolean;
  /** Main form dirty flag when section registration lags behind useFormSaveState. */
  setFormDirty: (dirty: boolean) => void;
  /** Browser-back fallback when leaving via popstate. */
  setBackFallbackHref: (href: string | undefined) => void;
  /** Temporarily disable blocking (e.g. read-only or locked listing). */
  setGuardEnabled: (enabled: boolean) => void;
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

/** Set browser-back fallback for the current edit page (cleared on unmount). */
export function useUnsavedBackFallback(href: string | undefined) {
  const ctx = useUnsavedChangesOptional();
  const setBackFallbackHrefRef = useRef(ctx?.setBackFallbackHref);
  setBackFallbackHrefRef.current = ctx?.setBackFallbackHref;

  useEffect(() => {
    const setBackFallbackHref = setBackFallbackHrefRef.current;
    if (!setBackFallbackHref) return;
    setBackFallbackHref(href);
    return () => {
      setBackFallbackHrefRef.current?.(undefined);
    };
  }, [href]);
}

/** Enable/disable navigation blocking for the current page (default off at shell level). */
export function useUnsavedGuardEnabled(active: boolean) {
  const ctx = useUnsavedChangesOptional();
  const setGuardEnabledRef = useRef(ctx?.setGuardEnabled);
  setGuardEnabledRef.current = ctx?.setGuardEnabled;

  useLayoutEffect(() => {
    const setGuardEnabled = setGuardEnabledRef.current;
    if (!setGuardEnabled) return;
    setGuardEnabled(active);
    return () => {
      setGuardEnabledRef.current?.(false);
    };
  }, [active]);
}

export function useRegisterUnsavedSection(
  sectionId: string,
  config: UnsavedSectionConfig
) {
  const ctx = useUnsavedChangesOptional();
  const ctxRef = useRef(ctx);
  const { label, isDirty, save } = config;
  const saveRef = useRef(save);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const stableSave = useCallback(async () => {
    if (!saveRef.current) return true;
    return saveRef.current();
  }, []);

  const sectionConfig = useMemo((): UnsavedSectionConfig => {
    return {
      label,
      isDirty,
      save: save ? stableSave : undefined,
    };
  }, [isDirty, label, save, stableSave]);

  const sectionRegisteredRef = useRef(false);

  // Register once per section; unregister only on unmount.
  useEffect(() => {
    const current = ctxRef.current;
    if (!current) return;
    current.registerSection(sectionId, sectionConfig);
    sectionRegisteredRef.current = true;
    return () => {
      ctxRef.current?.unregisterSection(sectionId);
      sectionRegisteredRef.current = false;
    };
    // Register/unregister lifecycle only — dirty updates go through updateSection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  // Keep dirty state in sync before paint so click handlers see the latest value.
  useLayoutEffect(() => {
    ctxRef.current = ctx;
    if (!ctx || !sectionRegisteredRef.current) return;
    ctx.updateSection(sectionId, sectionConfig);
  }, [ctx, sectionId, sectionConfig]);
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
  const saveAndLeaveGenerationRef = useRef(0);
  const baselineReadyRef = useRef(false);
  const [baselineReady, setBaselineReadyState] = useState(false);
  const externalFormDirtyRef = useRef(false);
  /** Off by default — edit/create pages opt in via useUnsavedGuardEnabled. */
  const guardEnabledRef = useRef(false);
  const hasUnsavedChangesRef = useRef(false);
  const isNavigationBlockedRef = useRef(false);
  const openModalForNavigationRef = useRef<
    ((pending: PendingNavigation) => void) | null
  >(null);

  backFallbackHrefRef.current = backFallbackHref;
  modalOpenRef.current = modalOpen;

  const hasDirtySections = useCallback(() => {
    return Array.from(sectionsRef.current.values()).some((section) => section.isDirty);
  }, []);

  const computeHasDirtyState = useCallback(() => {
    return hasDirtySections() || externalFormDirtyRef.current;
  }, [hasDirtySections]);

  const computeNavigationBlocked = useCallback(() => {
    if (isAuthRelatedPath(pathname)) return false;
    return (
      enabled &&
      guardEnabledRef.current &&
      baselineReadyRef.current &&
      !isBypassingGuardRef.current &&
      computeHasDirtyState()
    );
  }, [computeHasDirtyState, enabled, pathname]);

  const syncNavigationGuardRefs = useCallback(() => {
    const blocked = computeNavigationBlocked();
    hasUnsavedChangesRef.current = blocked;
    isNavigationBlockedRef.current = blocked;
  }, [computeNavigationBlocked]);

  const bump = useCallback(() => setRevision((value) => value + 1), []);

  const setBackFallbackHref = useCallback((href: string | undefined) => {
    if (backFallbackHrefRef.current === href) return;
    backFallbackHrefRef.current = href;
    debugUnsaved("back fallback href", { href });
  }, []);

  const setGuardEnabled = useCallback(
    (active: boolean) => {
      if (guardEnabledRef.current === active) return;
      guardEnabledRef.current = active;
      debugUnsaved("guard enabled", { active });
      syncNavigationGuardRefs();
      bump();
    },
    [bump, syncNavigationGuardRefs]
  );

  const prevBlockedRef = useRef(false);
  useLayoutEffect(() => {
    const blocked = computeNavigationBlocked();
    hasUnsavedChangesRef.current = blocked;
    isNavigationBlockedRef.current = blocked;
    if (DEV && prevBlockedRef.current !== blocked) {
      debugUnsaved("guard refs synced", {
        blocked,
        baselineReady: baselineReadyRef.current,
        bypass: isBypassingGuardRef.current,
        sectionDirty: hasDirtySections(),
        formDirty: externalFormDirtyRef.current,
      });
    }
    prevBlockedRef.current = blocked;
  });

  const resetHistoryGuard = useCallback(() => {
    const depth = guardDepthRef.current;
    guardDepthRef.current = 0;
    pathnameWhenDirtyRef.current = null;
    if (depth <= 0) return;

    isBypassingGuardRef.current = true;
    debugUnsaved("unwinding history guard", { depth });
    window.history.go(-depth);
    window.setTimeout(() => {
      isBypassingGuardRef.current = false;
    }, 0);
  }, []);

  const setBaselineReady = useCallback(
    (ready: boolean) => {
      if (baselineReadyRef.current === ready) return;
      baselineReadyRef.current = ready;
      setBaselineReadyState((current) => (current === ready ? current : ready));
      debugUnsaved("baseline ready", { ready });
      syncNavigationGuardRefs();
      if (ready && !hasDirtySections() && !externalFormDirtyRef.current) {
        resetHistoryGuard();
      }
      bump();
    },
    [bump, hasDirtySections, resetHistoryGuard, syncNavigationGuardRefs]
  );

  const registerSection = useCallback(
    (id: string, config: UnsavedSectionConfig) => {
      const prev = sectionsRef.current.get(id);
      sectionsRef.current.set(id, config);
      if (
        prev &&
        prev.isDirty === config.isDirty &&
        prev.label === config.label &&
        Boolean(prev.save) === Boolean(config.save)
      ) {
        return;
      }
      bump();
    },
    [bump]
  );

  const updateSection = useCallback(
    (id: string, config: UnsavedSectionConfig) => {
      const prev = sectionsRef.current.get(id);
      if (!prev) {
        sectionsRef.current.set(id, config);
        bump();
        return;
      }
      sectionsRef.current.set(id, config);
      if (
        prev.isDirty === config.isDirty &&
        prev.label === config.label &&
        Boolean(prev.save) === Boolean(config.save)
      ) {
        return;
      }
      bump();
    },
    [bump]
  );

  const unregisterSection = useCallback(
    (id: string) => {
      if (!sectionsRef.current.has(id)) return;
      sectionsRef.current.delete(id);
      bump();
    },
    [bump]
  );

  const dirtySections = useMemo(() => {
    void revision;
    return Array.from(sectionsRef.current.entries()).filter(([, section]) => section.isDirty);
  }, [revision]);

  const saveAllDirtySections = useCallback(
    async (options?: { skipIds?: string[] }) => {
      const skip = new Set(options?.skipIds ?? []);
      for (const [id, section] of dirtySections) {
        if (skip.has(id)) continue;
        if (!section.save) {
          return false;
        }
        const ok = await section.save();
        if (!ok) {
          return false;
        }
      }
      return true;
    },
    [dirtySections]
  );

  const hasUnsavedChanges = useMemo(() => {
    void revision;
    return (
      enabled &&
      guardEnabledRef.current &&
      baselineReady &&
      computeHasDirtyState()
    );
  }, [enabled, baselineReady, revision, computeHasDirtyState]);

  const setFormDirty = useCallback(
    (dirty: boolean) => {
      if (externalFormDirtyRef.current === dirty) return;
      externalFormDirtyRef.current = dirty;
      syncNavigationGuardRefs();
      debugUnsaved("form dirty flag", {
        dirty,
        blocked: isNavigationBlockedRef.current,
      });
      bump();
    },
    [bump, syncNavigationGuardRefs]
  );

  const markSectionsClean = useCallback(
    (sectionIds?: string[]) => {
      let changed = false;
      if (sectionIds && sectionIds.length > 0) {
        for (const id of sectionIds) {
          const section = sectionsRef.current.get(id);
          if (section?.isDirty) {
            sectionsRef.current.set(id, { ...section, isDirty: false });
            changed = true;
          }
        }
        if (sectionIds.includes("admin-space-details") && externalFormDirtyRef.current) {
          externalFormDirtyRef.current = false;
          changed = true;
        }
      } else {
        for (const [id, section] of sectionsRef.current) {
          if (section.isDirty) {
            sectionsRef.current.set(id, { ...section, isDirty: false });
            changed = true;
          }
        }
        if (externalFormDirtyRef.current) {
          externalFormDirtyRef.current = false;
          changed = true;
        }
      }
      if (changed) {
        syncNavigationGuardRefs();
        bump();
      }
    },
    [bump, syncNavigationGuardRefs]
  );

  const releaseGuardForUnload = useCallback(() => {
    isBypassingGuardRef.current = true;
    guardDepthRef.current = 0;
    pendingNavRef.current = null;
    pathnameWhenDirtyRef.current = null;
    saveAndLeaveGenerationRef.current += 1;
    externalFormDirtyRef.current = false;
    setModalOpen(false);
    setSaveError(null);
    setSavingAll(false);
    syncNavigationGuardRefs();
    debugUnsaved("guard released for unload navigation");
  }, [syncNavigationGuardRefs]);

  const isNavigationBlocked = useCallback(() => {
    return computeNavigationBlocked();
  }, [computeNavigationBlocked]);

  const canSaveAndLeave = dirtySections.every(([, section]) => typeof section.save === "function");

  const openModalForNavigation = useCallback((pending: PendingNavigation) => {
    pendingNavRef.current = pending;
    debugUnsaved("intercepted navigation", pending);
    setSaveError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    saveAndLeaveGenerationRef.current += 1;
    pendingNavRef.current = null;
    setModalOpen(false);
    setSaveError(null);
    setSavingAll(false);
  }, []);

  const navigateToPending = useCallback((pending: PendingNavigation) => {
    debugUnsaved("executing navigation", pending);

    isBypassingGuardRef.current = true;
    pendingNavRef.current = null;
    setModalOpen(false);
    setSaveError(null);
    const guardDepth = guardDepthRef.current;
    guardDepthRef.current = 0;
    pathnameWhenDirtyRef.current = null;

    if (pending.type === "href" && pending.href) {
      window.location.assign(pending.href);
      return;
    }

    if (pending.type === "back") {
      const fallback = backFallbackHrefRef.current;
      const steps = -(1 + guardDepth);
      debugUnsaved("browser back leave", { steps, fallback, guardDepth });

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
      if (!isNavigationBlocked()) {
        navigateToPending(pending);
        return;
      }
      openModalForNavigation(pending);
    },
    [isNavigationBlocked, navigateToPending, openModalForNavigation]
  );

  const prevPathnameRef = useRef<string | null>(null);

  // Reset guard synchronously on route change — before paint and before click handlers.
  useLayoutEffect(() => {
    const previous = prevPathnameRef.current;
    prevPathnameRef.current = pathname;

    isBypassingGuardRef.current = false;
    guardDepthRef.current = 0;
    pathnameWhenDirtyRef.current = null;
    pendingNavRef.current = null;

    if (previous === null) {
      if (guardEnabledRef.current !== false) {
        guardEnabledRef.current = false;
        syncNavigationGuardRefs();
      }
      debugUnsaved("pathname mount — guard off until edit page opts in", { pathname });
      return;
    }

    if (previous === pathname) {
      return;
    }

    const hadSections = sectionsRef.current.size > 0;
    const hadBaseline = baselineReadyRef.current;
    const hadFormDirty = externalFormDirtyRef.current;
    const hadGuardEnabled = guardEnabledRef.current;

    sectionsRef.current.clear();
    baselineReadyRef.current = false;
    externalFormDirtyRef.current = false;
    guardEnabledRef.current = false;
    setBaselineReadyState((current) => (current ? false : current));
    setModalOpen((current) => (current ? false : current));
    setSaveError((current) => (current ? null : current));
    setSavingAll((current) => (current ? false : current));
    syncNavigationGuardRefs();

    if (hadSections || hadBaseline || hadFormDirty || hadGuardEnabled) {
      bump();
    }
    debugUnsaved("pathname changed — guard reset", { from: previous, to: pathname });
  }, [pathname, syncNavigationGuardRefs, bump]);

  useEffect(() => {
    if (!enabled || computeHasDirtyState()) {
      return;
    }

    if (modalOpenRef.current) {
      setModalOpen(false);
      setSaveError(null);
      pendingNavRef.current = null;
      setSavingAll(false);
    }

    resetHistoryGuard();
  }, [computeHasDirtyState, dirtySections.length, enabled, resetHistoryGuard, revision]);

  useEffect(() => {
    if (!enabled || !baselineReadyRef.current || !computeHasDirtyState() || isBypassingGuardRef.current) {
      return;
    }

    pathnameWhenDirtyRef.current = pathname;

    if (guardDepthRef.current === 0) {
      window.history.pushState({ unsavedChangesGuard: true }, "");
      guardDepthRef.current = 1;
      debugUnsaved("pushed history guard", { pathname });
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isNavigationBlockedRef.current) return;
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

      if (!computeHasDirtyState()) {
        return;
      }

      openModalForNavigationRef.current?.({ type: "back", source: "popstate" });
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
  }, [
    computeHasDirtyState,
    dirtySections.length,
    enabled,
    pathname,
    revision,
  ]);

  openModalForNavigationRef.current = openModalForNavigation;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onDocumentClick = (event: MouseEvent) => {
      // Recompute live — refs can lag one frame if layout effects have not run yet.
      const blocked = computeNavigationBlocked();
      isNavigationBlockedRef.current = blocked;
      hasUnsavedChangesRef.current = blocked;

      const target = event.target;
      const anchor =
        target instanceof Element ? target.closest("a[href]") : null;
      const href = anchor?.getAttribute("href") ?? null;

      if (!blocked) {
        if (DEV && href && anchor?.getAttribute("target") !== "_blank") {
          debugUnsaved("link click allowed", {
            href,
            guardEnabled: guardEnabledRef.current,
            baselineReady: baselineReadyRef.current,
            bypass: isBypassingGuardRef.current,
            sectionDirty: hasDirtySections(),
            formDirty: externalFormDirtyRef.current,
          });
        }
        return;
      }

      if (!(target instanceof Element)) return;

      if (!anchor) return;
      if (anchor.getAttribute("target") === "_blank") return;

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
      if (isAuthRelatedPath(url.pathname)) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash === window.location.hash
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const destination = url.pathname + url.search + url.hash;
      debugUnsaved("link click intercepted", {
        destination,
        guardEnabled: guardEnabledRef.current,
        baselineReady: baselineReadyRef.current,
        bypass: isBypassingGuardRef.current,
        sectionDirty: hasDirtySections(),
        formDirty: externalFormDirtyRef.current,
        pending: pendingNavRef.current,
      });
      openModalForNavigationRef.current?.({
        type: "href",
        href: destination,
        source: "link-click",
      });
    };

    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [computeNavigationBlocked, enabled, hasDirtySections]);

  useEffect(() => {
    return () => {
      isBypassingGuardRef.current = true;
      guardDepthRef.current = 0;
      baselineReadyRef.current = false;
      externalFormDirtyRef.current = false;
      setBaselineReadyState(false);
    };
  }, []);

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

    const generation = saveAndLeaveGenerationRef.current;
    debugUnsaved("save and leave clicked", pending);
    setSavingAll(true);
    setSaveError(null);

    try {
      for (const [, section] of dirtySections) {
        if (generation !== saveAndLeaveGenerationRef.current) {
          debugUnsaved("save and leave — cancelled (modal closed)");
          return;
        }
        if (!section.save) continue;
        const ok = await section.save();
        if (!ok) {
          setSaveError("Could not save all changes. Fix any errors and try again, or leave without saving.");
          debugUnsaved("save and leave — section save failed", { label: section.label });
          return;
        }
      }
      if (generation !== saveAndLeaveGenerationRef.current) {
        debugUnsaved("save and leave — cancelled before navigate");
        return;
      }
      debugUnsaved("save and leave — all sections saved, navigating");
      externalFormDirtyRef.current = false;
      markSectionsClean();
      navigateToPending(pending);
    } finally {
      if (generation === saveAndLeaveGenerationRef.current) {
        setSavingAll(false);
      }
    }
  }

  const contextValue = useMemo<UnsavedChangesContextValue>(
    () => ({
      hasUnsavedChanges,
      dirtySectionLabels: dirtySections.map(([, section]) => section.label),
      registerSection,
      updateSection,
      unregisterSection,
      requestNavigation,
      saveAllDirtySections,
      markSectionsClean,
      releaseGuardForUnload,
      setBaselineReady,
      resetHistoryGuard,
      isNavigationBlocked,
      setFormDirty,
      setBackFallbackHref,
      setGuardEnabled,
    }),
    [
      dirtySections,
      hasUnsavedChanges,
      registerSection,
      updateSection,
      requestNavigation,
      saveAllDirtySections,
      markSectionsClean,
      releaseGuardForUnload,
      setBaselineReady,
      resetHistoryGuard,
      unregisterSection,
      isNavigationBlocked,
      setFormDirty,
      setBackFallbackHref,
      setGuardEnabled,
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

type GuardedLinkProps = ComponentProps<typeof Link>;

/** Navigates via the unsaved-changes guard when the form is dirty. */
export function GuardedLink({
  href,
  onClick,
  onClickCapture,
  ...props
}: GuardedLinkProps) {
  const ctx = useUnsavedChangesOptional();
  const destination =
    typeof href === "string"
      ? href
      : `${href.pathname || ""}${href.search || ""}${href.hash || ""}`;

  const tryGuardNavigation = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented) return;
    if (!ctx) return;

    const blocked = ctx.isNavigationBlocked();
    if (DEV) {
      debugUnsaved("guarded link click", {
        destination,
        blocked,
        hasUnsavedChanges: ctx.hasUnsavedChanges,
      });
    }
    if (!blocked) return;

    event.preventDefault();
    event.stopPropagation();
    debugUnsaved("guarded link intercepted", { destination, source: "guarded-link" });
    ctx.requestNavigation({ type: "href", href: destination, source: "guarded-link" });
  };

  return (
    <Link
      href={href}
      {...props}
      onClickCapture={(event) => {
        onClickCapture?.(event);
        tryGuardNavigation(event);
      }}
      onClick={onClick}
    />
  );
}

/** Programmatic navigation that respects the active unsaved-changes guard (sidebar, search, etc.). */
export function useGuardedNavigation() {
  const ctx = useUnsavedChangesOptional();
  return useCallback(
    (href: string, source = "programmatic") => {
      if (!ctx) {
        window.location.assign(href);
        return;
      }
      ctx.requestNavigation({ type: "href", href, source });
    },
    [ctx]
  );
}
