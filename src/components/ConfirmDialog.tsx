"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, Info, OctagonAlert, X } from "lucide-react";

// ---------------------------------------------------------------------------
// 2026-10-01, user request (system-wide): "When errors or warning message
// notifications are thrown, make that it opens a mini coloured dialog where
// a user must confirm (complete system wide)." Before this file, the only
// place the app asked someone to confirm a consequential action was the
// browser's own window.confirm() — an unstyled native dialog with no colour,
// icon, or app chrome, used in 12 places across JobWorkspace.tsx,
// RfqAllWorkspace.tsx, PlatformModulesWorkspace.tsx and UsersWorkspace.tsx
// (grep for window.confirm to find any new ones that should also switch to
// this). This is the one shared replacement: a small modal, toned by
// severity (danger/warning/neutral), that requires an explicit click to
// proceed — same "must confirm" requirement window.confirm already had,
// just styled like the rest of the app instead of the OS's own dialog box.
//
// Deliberately reuses the existing .drawer-backdrop/.form-drawer
// .compact-dialog shell every other popup in this app already uses (the
// Jobs/WIP column picker, Import/Export's results dialog, JobWorkspace's
// own register/status dialogs — see JobsWipColumnPicker.tsx's own comment)
// rather than inventing a new dialog style, plus a coloured left accent +
// icon per tone so it reads as a warning/danger at a glance — the "mini
// coloured dialog" the request asked for.
//
// Usage — one hook call per component that needs it, same as any other
// local UI state in this app (there's no app-wide singleton/portal here,
// matching every other dialog in this codebase):
//
//   const { confirm, dialog } = useConfirmDialog();
//   async function removeThing(id: string) {
//     if (!(await confirm({ message: "Remove this thing?", tone: "danger", confirmLabel: "Remove" }))) return;
//     ...
//   }
//   return <div>...{dialog}</div>;
//
// `confirm` also accepts a plain string shorthand (confirm("Remove this?")),
// a drop-in replacement for `window.confirm("Remove this?")` apart from
// being async (await it, or .then()) rather than blocking.
// ---------------------------------------------------------------------------

export type ConfirmTone = "danger" | "warning" | "neutral";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

const TONE_META: Record<ConfirmTone, { icon: typeof AlertTriangle; eyebrow: string; confirmClass: string }> = {
  danger: { icon: OctagonAlert, eyebrow: "This can't be undone", confirmClass: "gold-button danger" },
  warning: { icon: AlertTriangle, eyebrow: "Please confirm", confirmClass: "gold-button" },
  neutral: { icon: Info, eyebrow: "Please confirm", confirmClass: "gold-button" },
};

export function useConfirmDialog() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string) => {
    const opts = typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => setState({ ...opts, resolve }));
  }, []);

  function settle(result: boolean) {
    state?.resolve(result);
    setState(null);
  }

  if (!state) return { confirm, dialog: null };

  const tone = state.tone ?? "warning";
  const meta = TONE_META[tone];
  const Icon = meta.icon;

  const dialog = (
    <div className="drawer-backdrop confirm-dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) settle(false); }}>
      <aside className={`form-drawer compact-dialog confirm-dialog tone-${tone}`} role="alertdialog" aria-modal="true" aria-label={state.title ?? state.message}>
        <header>
          <div className="confirm-dialog-heading">
            <Icon size={18} className="confirm-dialog-icon" aria-hidden="true" />
            <div><p className="eyebrow">{meta.eyebrow}</p>{state.title && <h2>{state.title}</h2>}</div>
          </div>
          <button type="button" onClick={() => settle(false)} aria-label="Close dialog"><X size={18} /></button>
        </header>
        <div className="confirm-dialog-body"><p>{state.message}</p></div>
        <footer className="detail-actions">
          <button type="button" className="quiet-button" onClick={() => settle(false)}>{state.cancelLabel ?? "Cancel"}</button>
          <button type="button" className={meta.confirmClass} autoFocus onClick={() => settle(true)}>{state.confirmLabel ?? "Confirm"}</button>
        </footer>
      </aside>
    </div>
  );

  return { confirm, dialog };
}
