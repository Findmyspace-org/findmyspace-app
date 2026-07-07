"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { PipelineStage } from "@/lib/space-place/constants";
import { CrmQuickActionDrawer } from "./CrmQuickActionDrawer";

export type CrmQuickActionType =
  | "menu"
  | "add_note"
  | "log_call"
  | "log_email"
  | "log_meeting"
  | "add_task"
  | "schedule_followup"
  | "complete_task"
  | "edit_task"
  | "change_pipeline"
  | "assign_owner";

export type CrmActionContext = {
  organisationId?: string;
  organisationName?: string;
  contactId?: string;
  contactName?: string;
  spaceId?: string;
  spaceTitle?: string;
  taskId?: string;
  taskTitle?: string;
  prefillTaskTitle?: string;
  prefillTaskDescription?: string;
  pipelineStage?: PipelineStage | string | null;
  assignedTo?: string | null;
};

type OpenState = {
  action: CrmQuickActionType;
  context: CrmActionContext;
  onSuccess?: () => void;
};

type CrmQuickActionContextValue = {
  open: boolean;
  action: CrmQuickActionType | null;
  context: CrmActionContext;
  openQuickAction: (
    action: CrmQuickActionType,
    context: CrmActionContext,
    onSuccess?: () => void
  ) => void;
  openQuickMenu: (context: CrmActionContext, onSuccess?: () => void) => void;
  closeQuickAction: () => void;
  notifySuccess: () => void;
};

const CrmQuickActionContext = createContext<CrmQuickActionContextValue | null>(
  null
);

export function CrmQuickActionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<OpenState | null>(null);

  const closeQuickAction = useCallback(() => setState(null), []);

  const openQuickAction = useCallback(
    (
      action: CrmQuickActionType,
      context: CrmActionContext,
      onSuccess?: () => void
    ) => {
      setState({ action, context, onSuccess });
    },
    []
  );

  const openQuickMenu = useCallback(
    (context: CrmActionContext, onSuccess?: () => void) => {
      setState({ action: "menu", context, onSuccess });
    },
    []
  );

  const notifySuccess = useCallback(() => {
    state?.onSuccess?.();
  }, [state]);

  const value = useMemo(
    () => ({
      open: Boolean(state),
      action: state?.action ?? null,
      context: state?.context ?? {},
      openQuickAction,
      openQuickMenu,
      closeQuickAction,
      notifySuccess,
    }),
    [state, openQuickAction, openQuickMenu, closeQuickAction, notifySuccess]
  );

  return (
    <CrmQuickActionContext.Provider value={value}>
      {children}
      {state ? (
        <CrmQuickActionDrawer
          action={state.action}
          context={state.context}
          onClose={closeQuickAction}
          onSuccess={() => {
            state.onSuccess?.();
          }}
        />
      ) : null}
    </CrmQuickActionContext.Provider>
  );
}

export function useCrmQuickAction() {
  const ctx = useContext(CrmQuickActionContext);
  if (!ctx) {
    throw new Error("useCrmQuickAction must be used within CrmQuickActionProvider");
  }
  return ctx;
}
