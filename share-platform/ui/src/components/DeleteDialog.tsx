import { useEffect, useState } from "react";
import { Trash2Icon, TriangleAlertIcon } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type DeleteRequest = {
  /** Shown in the title: "Delete <label>?" */
  label: string;
  /** What will go, e.g. "1 file · 48 MB". */
  summary: string;
  /** If set, a second step asks for this to be typed exactly (projects, permanent purges). Otherwise one step. */
  confirmText?: string;
  /** Wording for the final button and step-2 note. */
  permanent?: boolean;
  run: () => Promise<void>;
};

const Mark = ({ children }: { children: React.ReactNode }) => (
  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-destructive/12 text-destructive [&_svg]:size-5">{children}</span>
);

/** Two-step delete confirmation. Never uses native browser dialogs. */
export function DeleteDialog({ request, onClose }: { request: DeleteRequest | null; onClose: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (request) { setStep(1); setTyped(""); setBusy(false); } }, [request]);

  if (!request) return null;
  const twoStep = !!request.confirmText;
  const ready = !twoStep || typed.trim() === request.confirmText;
  const go = async () => {
    setBusy(true);
    try { await request.run(); onClose(); } finally { setBusy(false); }
  };

  return (
    <AlertDialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent className="gap-5 rounded-2xl border p-6 shadow-2xl sm:max-w-md" onEscapeKeyDown={() => !busy && onClose()}>
        {step === 1 ? (
          <>
            <div className="flex gap-4 text-left">
              <Mark><Trash2Icon /></Mark>
              <div className="flex min-w-0 flex-col gap-2">
              {twoStep && <span className="text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">Step 1 of 2</span>}
              <AlertDialogTitle className="text-lg font-semibold break-all">Delete {request.label}?</AlertDialogTitle>
              <AlertDialogDescription className="leading-relaxed">
                {request.summary}
                <br />
                {request.permanent ? "This is permanent and can't be undone." : "It moves to Trash, where you can restore it."}
              </AlertDialogDescription>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-[38px] px-4">Cancel</AlertDialogCancel>
              {twoStep
                ? <Button variant="destructive" className="h-[38px] px-4 font-semibold text-[#FCA5A5]" onClick={() => setStep(2)} autoFocus>Continue</Button>
                : <Button variant="destructive" autoFocus disabled={busy} onClick={go}
                    className="h-[38px] bg-[#DC2626] px-4 font-semibold text-white hover:bg-[#B91C1C] dark:bg-[#DC2626] dark:hover:bg-[#B91C1C]">
                    {busy ? "Deleting…" : request.permanent ? "Delete forever" : "Delete"}
                  </Button>}
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <div className="flex gap-4 text-left">
              <Mark><TriangleAlertIcon /></Mark>
              <div className="flex min-w-0 flex-col gap-2">
              <span className="text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">Step 2 of 2</span>
              <AlertDialogTitle className="text-lg font-semibold">Type the name to confirm</AlertDialogTitle>
              <AlertDialogDescription className="leading-relaxed">
                Type <span className="font-mono text-foreground">{request.confirmText}</span> to confirm.
              </AlertDialogDescription>
              </div>
            </div>
            {request.confirmText && (
              <Input autoFocus value={typed} className="h-[42px] bg-header font-mono focus-visible:border-destructive focus-visible:ring-destructive/25" onChange={(e) => setTyped(e.target.value)} placeholder={request.confirmText}
                onKeyDown={(e) => e.key === "Enter" && ready && !busy && go()} aria-label="Confirmation text" />
            )}
            <AlertDialogFooter>
              <AlertDialogCancel className="h-[38px] px-4" disabled={busy}>Cancel</AlertDialogCancel>
              <Button variant="destructive" className="h-[38px] bg-[#DC2626] px-4 font-semibold text-white hover:bg-[#B91C1C] dark:bg-[#DC2626] dark:hover:bg-[#B91C1C]"
                disabled={!ready || busy} onClick={go}>
                {busy ? "Deleting…" : request.permanent ? "Delete forever" : "Delete"}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
