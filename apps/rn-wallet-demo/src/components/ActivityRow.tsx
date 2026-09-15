import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Layers,
  LogOut,
  type LucideIcon,
  QrCode,
  Zap,
} from 'lucide-react-native';
import { Entry } from '@lightninglabs/wavelength-react';
import { formatSats, formatTimestamp, shortKey } from '../lib/format';
import { Palette, fonts } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useThemedStyles } from '../theme/useThemedStyles';
import { GhostButton } from './ui/Button';
import { CopyRow } from './ui/CopyRow';
import { QRCode } from './ui/QRCode';

const KIND_ICON: Record<string, LucideIcon> = {
  receive: ArrowDownLeft,
  send: ArrowUpRight,
  deposit: Layers,
  exit: LogOut,
};

const KIND_LABEL: Record<string, string> = {
  receive: 'Received',
  send: 'Sent',
  deposit: 'Boarding deposit',
  exit: 'Unilateral exit',
};

// phaseHint renders the daemon's lifecycle label for an in-flight entry, which
// explains why a row is still pending (the balance can settle before the entry
// finalizes). It returns '' when the label adds nothing over what the row
// already says: a boarding deposit, for one, carries the counterparty
// 'boarding' and the phase label 'boarding'.
function phaseHint(
  label: string | undefined,
  title: string,
  counterparty: string,
): string {
  const text = (label ?? '').replace(/_/g, ' ').trim();
  if (!text) {
    return '';
  }
  const same = (other: string) =>
    other.trim().toLowerCase() === text.toLowerCase();

  return same(title) || same(counterparty) ? '' : text;
}

const makeStyles = (p: Palette) => ({
  row: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 12,
    paddingVertical: 12,
  },
  iconBox: {
    alignItems: 'center' as const,
    borderColor: p.border,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center' as const,
    width: 36,
  },
  main: {
    flex: 1,
  },
  title: {
    color: p.text,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  meta: {
    color: p.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
    marginTop: 2,
  },
  failReason: {
    color: p.bad,
    fontFamily: fonts.sans,
    fontSize: 11,
    marginTop: 2,
  },
  // The status pill and the invoice button share one fixed height so they
  // line up when shown side by side.
  chips: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 6,
    marginTop: 4,
  },
  status: {
    borderWidth: 1,
    height: 22,
    justifyContent: 'center' as const,
    paddingHorizontal: 6,
  },
  invoiceButton: {
    alignItems: 'center' as const,
    borderColor: p.border,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 5,
    height: 22,
    paddingHorizontal: 6,
  },
  invoiceButtonText: {
    color: p.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 11,
  },
  statusText: {
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  amountCol: {
    alignItems: 'flex-end' as const,
  },
  amount: {
    fontFamily: fonts.monoMedium,
    fontSize: 14,
  },
  fee: {
    color: p.faint,
    fontFamily: fonts.mono,
    fontSize: 11,
    marginTop: 2,
  },
  backdrop: {
    alignItems: 'center' as const,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    flex: 1,
    justifyContent: 'center' as const,
    padding: 16,
  },
  card: {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderWidth: 1,
    maxWidth: 384,
    padding: 24,
    width: '100%' as const,
  },
  hairline: {
    backgroundColor: p.accent,
    height: 1,
    left: 0,
    position: 'absolute' as const,
    right: 0,
    top: 0,
  },
  dialogHead: {
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    gap: 12,
  },
  dialogBadge: {
    alignItems: 'center' as const,
    backgroundColor: p.skySoft,
    height: 36,
    justifyContent: 'center' as const,
    width: 36,
  },
  dialogTitle: {
    color: p.text,
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
  },
  dialogSubtitle: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 12,
    marginTop: 2,
  },
  dialogAmount: {
    color: p.text,
    fontFamily: fonts.monoMedium,
    fontSize: 16,
  },
  dialogUnit: {
    color: p.muted,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  dialogQr: {
    alignItems: 'center' as const,
    marginTop: 20,
  },
  dialogCopy: {
    marginTop: 20,
  },
  dialogActions: {
    marginTop: 24,
  },
});

// ActivityRow renders a single dense transaction line from an SDK Entry. The
// counterparty is a bare string (pubkey / address / invoice), so the local
// note is the title and a truncated counterparty is shown monospace beneath.
export function ActivityRow({ entry }: { entry: Entry }) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  // The daemon uses one 'exit' kind for both a cooperative on-chain send (which
  // carries the destination as an on-chain request) and a unilateral exit
  // (which does not). Treat the cooperative case as a normal outbound send.
  const cooperativeSend =
    entry.kind === 'exit' && Boolean(entry.request?.onchainAddress);
  const Icon = cooperativeSend
    ? ArrowUpRight
    : (KIND_ICON[entry.kind] ?? Activity);
  const incoming = entry.kind === 'receive' || entry.kind === 'deposit';
  const failed = entry.status === 'failed';
  const pending = entry.status === 'pending';
  const invoice =
    entry.kind === 'receive' && pending && entry.request?.type === 'lightning'
      ? entry.request.lightningInvoice
      : '';
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const sign = incoming ? '+' : '-';
  const title =
    entry.note ||
    (cooperativeSend ? 'Sent' : KIND_LABEL[entry.kind]) ||
    entry.kind;
  const time = formatTimestamp(entry.createdAt);
  const meta = entry.counterparty
    ? `${shortKey(entry.counterparty, 10, 6)}${time ? ` · ${time}` : ''}`
    : time;
  const phase = pending
    ? phaseHint(entry.progress?.phaseLabel, title, entry.counterparty)
    : '';
  const amountColor = failed ? palette.faint : incoming ? palette.good : palette.text;
  const statusColor = failed ? palette.bad : palette.warn;
  const statusBg = failed ? palette.badSoft : palette.warnSoft;

  return (
    <View style={styles.row}>
      <View style={styles.iconBox}>
        <Icon size={15} color={incoming ? palette.sky : palette.orange} />
      </View>
      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {failed && entry.failureReason ? (
          <Text style={styles.failReason} numberOfLines={1}>
            {entry.failureReason}
          </Text>
        ) : null}
        {phase ? (
          <Text style={styles.meta} numberOfLines={1}>
            {phase}
          </Text>
        ) : null}
        {pending || failed ? (
          <View style={styles.chips}>
            <View
              style={[styles.status, { backgroundColor: statusBg, borderColor: statusColor }]}
            >
              <Text style={[styles.statusText, { color: statusColor }]}>
                {entry.status}
              </Text>
            </View>
            {invoice ? (
              <Pressable
                onPress={() => setInvoiceOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Show invoice"
                hitSlop={6}
                style={styles.invoiceButton}
              >
                <QrCode size={12} color={palette.muted} />
                <Text style={styles.invoiceButtonText}>Invoice</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.amountCol}>
        <Text style={[styles.amount, { color: amountColor }]}>
          {sign}
          {formatSats(Math.abs(entry.amountSat ?? 0))}
        </Text>
        {entry.feeSat && entry.feeSat > 0 ? (
          <Text style={styles.fee}>fee {formatSats(entry.feeSat)}</Text>
        ) : null}
      </View>
      {invoice ? (
        <InvoiceDialog
          open={invoiceOpen}
          invoice={invoice}
          amountSat={entry.amountSat ?? 0}
          onClose={() => setInvoiceOpen(false)}
        />
      ) : null}
    </View>
  );
}

// InvoiceDialog re-presents a pending Lightning receive the way the Receive
// screen first showed it (amount, QR, copyable invoice), so a payer can still
// be handed the request after the user has navigated away.
function InvoiceDialog({
  open,
  invoice,
  amountSat,
  onClose,
}: {
  open: boolean;
  invoice: string;
  amountSat: number;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <View style={styles.hairline} />
          <View style={styles.dialogHead}>
            <View style={styles.dialogBadge}>
              <Zap size={18} color={palette.sky} />
            </View>
            <View style={styles.main}>
              <Text style={styles.dialogTitle}>Lightning invoice</Text>
              <Text style={styles.dialogSubtitle}>Waiting for payment</Text>
            </View>
            <Text style={styles.dialogAmount}>
              {formatSats(Math.abs(amountSat))}
              <Text style={styles.dialogUnit}> sats</Text>
            </Text>
          </View>
          <View style={styles.dialogQr}>
            <QRCode value={invoice} size={160} />
          </View>
          <View style={styles.dialogCopy}>
            <CopyRow label="Invoice" value={invoice} />
          </View>
          <View style={styles.dialogActions}>
            <GhostButton onPress={onClose}>Close</GhostButton>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
