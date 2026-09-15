import { useId, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Layers,
  LogOut,
  type LucideIcon,
  QrCode,
  Zap,
} from "lucide-react";
import { Entry } from "@lightninglabs/wavelength-react";
import { cn } from "../lib/cn";
import { formatSats, formatTimestamp, shortKey } from "../lib/format";
import { GhostButton } from "./ui/Button";
import { CopyRow } from "./ui/CopyRow";
import { FauxQR } from "./ui/FauxQR";
import { Modal } from "./ui/Modal";

const KIND_ICON: Record<string, LucideIcon> = {
  receive: ArrowDownLeft,
  send: ArrowUpRight,
  deposit: Layers,
  exit: LogOut,
};

const KIND_LABEL: Record<string, string> = {
  receive: "Received",
  send: "Sent",
  deposit: "Boarding deposit",
  exit: "Unilateral exit",
};

const STATUS_CLASS: Record<string, string> = {
  complete: "border-border text-good",
  pending: "border-warn/40 bg-warn/10 text-warn",
  failed: "border-bad/40 bg-bad/10 text-bad",
};

// phaseHint renders the daemon's lifecycle label for an in-flight entry, which
// explains why a row is still pending (the balance can settle before the entry
// finalizes). It returns "" when the label adds nothing over what the row
// already says: a boarding deposit, for one, carries the counterparty
// "boarding" and the phase label "boarding".
function phaseHint(
  label: string | undefined,
  title: string,
  counterparty: string,
): string {
  const text = (label ?? "").replace(/_/g, " ").trim();
  if (!text) {
    return "";
  }
  const same = (other: string) =>
    other.trim().toLowerCase() === text.toLowerCase();

  return same(title) || same(counterparty) ? "" : text;
}

// ActivityRow renders a single dense transaction line from an SDK Entry. The
// counterparty is a bare string (pubkey / address / invoice), so the local note
// is the title and the raw counterparty is shown monospace beneath - never a
// name (there is no contacts API).
export function ActivityRow({ entry }: { entry: Entry }) {
  // The daemon uses one 'exit' kind for both a cooperative on-chain send (which
  // carries the destination as an on-chain request) and a unilateral exit
  // (which does not). Treat the cooperative case as a normal outbound send.
  const cooperativeSend =
    entry.kind === "exit" && Boolean(entry.request?.onchainAddress);
  const Icon = cooperativeSend
    ? ArrowUpRight
    : (KIND_ICON[entry.kind] ?? Activity);
  const incoming = entry.kind === "receive" || entry.kind === "deposit";
  const failed = entry.status === "failed";
  const pending = entry.status === "pending";
  const invoice =
    entry.kind === "receive" && pending &&
    entry.request?.type === "lightning"
      ? entry.request.lightningInvoice
      : "";
  const sign = incoming ? "+" : "-";
  const title =
    entry.note ||
    (cooperativeSend ? "Sent" : KIND_LABEL[entry.kind]) ||
    entry.kind;
  const time = formatTimestamp(entry.createdAt);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const invoiceTitleId = useId();
  const phase = pending
    ? phaseHint(entry.progress?.phaseLabel, title, entry.counterparty)
    : "";

  return (
    <div data-testid="activity-row" className="py-3">
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center border
            border-border"
        >
          <Icon size={15} className={incoming ? "text-sky" : "text-orange"} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-fg">{title}</div>
          {entry.counterparty ? (
            <div className="truncate font-mono text-xs text-muted">
              {shortKey(entry.counterparty, 10, 6)}
              {time ? ` · ${time}` : ""}
            </div>
          ) : time ? (
            <div className="truncate font-mono text-xs text-muted">{time}</div>
          ) : null}
          {failed && entry.failureReason ? (
            <div className="truncate text-xs text-bad">{entry.failureReason}</div>
          ) : null}
          {phase ? (
            <div className="truncate text-xs text-muted">{phase}</div>
          ) : null}
        </div>
        {invoice ? (
          <button
            type="button"
            onClick={() => setInvoiceOpen(true)}
            aria-label="Show invoice"
            className="inline-flex h-6 shrink-0 items-center gap-1.5 border
              border-border px-2 text-xs font-medium text-muted
              transition-colors hover:border-border-strong hover:text-fg"
          >
            <QrCode size={13} />
            <span className="hidden sm:inline">Invoice</span>
          </button>
        ) : null}
        <div className="hidden sm:flex">
          <span
            className={cn(
              `inline-flex h-6 items-center border px-2 text-[10px]
              font-medium uppercase tracking-wide`,
              STATUS_CLASS[entry.status] ?? "border-border text-muted",
            )}
          >
            {entry.status}
          </span>
        </div>
        <div className="text-right">
          <div
            className={cn(
              "text-sm font-medium tabular-nums font-mono",
              failed ? "text-faint" : incoming ? "text-good" : "text-fg",
            )}
          >
            {sign}
            {formatSats(Math.abs(entry.amountSat ?? 0))}
          </div>
          {entry.feeSat && entry.feeSat > 0 ? (
            <div className="font-mono text-[11px] tabular-nums text-faint">
              fee {formatSats(entry.feeSat)}
            </div>
          ) : null}
        </div>
      </div>
      {invoice ? (
        <Modal
          open={invoiceOpen}
          onClose={() => setInvoiceOpen(false)}
          labelledBy={invoiceTitleId}
        >
          <InvoiceDialogBody
            titleId={invoiceTitleId}
            invoice={invoice}
            amountSat={entry.amountSat ?? 0}
            onClose={() => setInvoiceOpen(false)}
          />
        </Modal>
      ) : null}
    </div>
  );
}

// InvoiceDialogBody re-presents a pending Lightning receive the way the Receive
// screen first showed it (amount, QR, copyable invoice), so a payer can still
// be handed the request after the user has navigated away.
function InvoiceDialogBody({
  titleId,
  invoice,
  amountSat,
  onClose,
}: {
  titleId: string;
  invoice: string;
  amountSat: number;
  onClose: () => void;
}) {
  return (
    <div data-testid="invoice-dialog">
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center
            bg-sky/15 text-sky"
        >
          <Zap size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-base font-semibold text-fg">
            Lightning invoice
          </h2>
          <p className="mt-0.5 text-xs text-muted">Waiting for payment</p>
        </div>
        <div className="text-right font-mono text-base font-medium tabular-nums text-fg">
          {formatSats(Math.abs(amountSat))}
          <span className="ml-1 text-xs text-muted">sats</span>
        </div>
      </div>

      <div className="mt-5 flex flex-col items-center gap-2">
        <div className="bg-white p-3">
          <FauxQR seed={invoice} size={23} color="#0a0a0b" className="h-40 w-40" />
        </div>
        <span className="text-xs text-faint">This is not a real QR code</span>
      </div>

      <div className="mt-5">
        <CopyRow label="Invoice" value={invoice} />
      </div>

      <div className="mt-6">
        <GhostButton onClick={onClose}>Close</GhostButton>
      </div>
    </div>
  );
}
