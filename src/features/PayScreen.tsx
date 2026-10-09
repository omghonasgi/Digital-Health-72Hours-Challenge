import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react-native';
import { settleBill, validateCard, type SettledItem, type Settlement } from '@/core/engines/payments';
import { fmtDateTime } from '@/core/time';
import type { FamilyBill, Payment, PaymentMethod, ResourceKind } from '@/core/types';
import { payFamilyShare, publishBill, simulateInsuranceReply, submitInsuranceClaim } from '@/core/usecases';
import { useSession } from '@/state/SessionProvider';
import { useAction } from '@/state/usePlan';
import {
  BOTTOM_BAR_HEIGHT,
  Body,
  Button,
  Card,
  Chip,
  Choice,
  ConfirmSheet,
  Field,
  Glyph,
  Hairline,
  Icons,
  Meta,
  Muted,
  NumberField,
  Row,
  Screen,
  Section,
  Stamp,
  Surface,
  TextField,
  colors,
  radius,
  space,
  statusColor,
} from '@/ui';
import { PlanState } from './PlanScreen';
import { useFmt } from './format';

/**
 * Simulated checkout with CareBridge as the middle party. Approved programs
 * and the family pay CareBridge; CareBridge pays each service once its cost
 * is covered. No real money moves and only a card's brand and last 4 digits
 * are kept.
 */

const kindIcon: Record<ResourceKind, LucideIcon> = {
  equipment: Icons.Package,
  transportation: Icons.Car,
  meals: Icons.Utensils,
  caregiving: Icons.HeartHandshake,
  medication: Icons.Pill,
};

const TEST_CARD = { number: '4242 4242 4242 4242', expiry: '12/28', cvc: '123' };
const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const tint = {
  good: 'rgba(62, 125, 90, 0.12)',
  caution: 'rgba(183, 131, 47, 0.16)',
  blue: 'rgba(63, 114, 175, 0.14)',
};

function useBill(patientId: string | undefined, publish: boolean) {
  const { repo } = useSession();
  const [state, setState] = useState<{ bill: FamilyBill | null; payments: Payment[]; loading: boolean; error: string | null }>({ bill: null, payments: [], loading: true, error: null });
  const reload = useCallback(async () => {
    if (!patientId) return;
    try {
      setState((s) => ({ ...s, loading: !s.bill, error: null }));
      if (publish) await publishBill(repo, patientId);
      const [bill, payments] = await Promise.all([repo.getBill(patientId), repo.listPayments(patientId)]);
      setState({ bill, payments, loading: false, error: null });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }));
    }
  }, [repo, patientId, publish]);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  return { ...state, reload };
}

type View_ = 'simple' | 'detailed';

interface ClaimActions {
  canManage: boolean;
  busy: boolean;
  submit: (itemId: string) => void;
  reply: (claimId: string, decision: 'approved' | 'denied') => void;
}

export function PayScreen({
  patientId,
  publish,
  canManage = false,
  bookHref,
  header,
}: {
  patientId?: string;
  publish: boolean;
  /** Patient (or coordinator) side: may file insurance claims and trigger the simulated insurer reply. */
  canManage?: boolean;
  bookHref?: string;
  header?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { bill, payments, loading, error, reload } = useBill(patientId, publish);
  const settlement = useMemo(() => settleBill(bill, payments), [bill, payments]);
  const money = useMoney();
  const [checkout, setCheckout] = useState(false);
  const [receipt, setReceipt] = useState<{ payment: Payment; paidOut: SettledItem[] } | null>(null);
  const [view, setView] = useState<View_>('simple');
  const { repo } = useSession();
  const claimAction = useAction();
  const claims: ClaimActions = {
    canManage,
    busy: claimAction.busy,
    submit: (itemId) => {
      if (!patientId) return;
      void claimAction.run(async () => {
        await submitInsuranceClaim(repo, patientId, itemId);
        await reload();
      });
    },
    reply: (claimId, decision) => {
      if (!patientId) return;
      void claimAction.run(async () => {
        await new Promise((r) => setTimeout(r, 600)); // simulated insurer round trip
        await simulateInsuranceReply(repo, patientId, claimId, decision);
        await reload();
      });
    },
  };

  const ready = settlement.items.filter((i) => i.payable);
  const notBooked = settlement.items.filter((i) => !i.payable);

  return (
    <PlanState loading={loading && !bill} error={error} onRetry={reload}>
      <Screen title={t('pay.title')} subtitle={t('pay.intro')} aside={<Stamp label="test" size={56} />} bottomInset={BOTTOM_BAR_HEIGHT}>
        {header}
        <BalanceHero settlement={settlement} onPay={() => setCheckout(true)} checkoutOpen={checkout} />

        {receipt ? <Receipt receipt={receipt} onDone={() => setReceipt(null)} /> : null}

        {checkout && settlement.balance > 0 && patientId ? (
          <Checkout
            patientId={patientId}
            balance={settlement.balance}
            onCancel={() => setCheckout(false)}
            onPaid={async (payment) => {
              const before = new Set(settlement.items.filter((i) => i.payout === 'sent').map((i) => i.id));
              const next = settleBill(bill, [...payments, payment]);
              setReceipt({ payment, paidOut: next.items.filter((i) => i.payout === 'sent' && !before.has(i.id)) });
              setCheckout(false);
              await reload();
            }}
          />
        ) : null}

        <Row wrap style={{ justifyContent: 'space-between' }}>
          <Row>
            <Chip label={t('pay.view.simple')} icon={Icons.FileText} selected={view === 'simple'} onPress={() => setView('simple')} />
            <Chip label={t('pay.view.detailed')} icon={Icons.LayoutGrid} selected={view === 'detailed'} onPress={() => setView('detailed')} />
          </Row>
          {claimAction.error ? <Body color={colors.urgent}>{claimAction.error}</Body> : null}
        </Row>

        {view === 'simple' ? <SimpleSummary items={settlement.items} claims={claims} /> : null}

        {view === 'detailed' ? <MoneyFlow settlement={settlement} /> : null}

        {view === 'detailed' ? (
          <Section title={t('pay.ready')} aside={<Meta>{money(settlement.total)}</Meta>}>
            {ready.length === 0 ? (
              <Card>
                <Muted>{t('pay.nothingDue')}</Muted>
              </Card>
            ) : null}
            {ready.map((item) => (
              <ItemCard key={item.id} item={item} claims={claims} />
            ))}
          </Section>
        ) : null}

        {view === 'detailed' && notBooked.length ? (
          <Section title={t('pay.notBooked')} aside={<Meta>{money(settlement.notBooked)}</Meta>}>
            <Muted>{t('pay.notBookedBody')}</Muted>
            {notBooked.map((item) => (
              <NotBookedCard key={item.id} item={item} bookHref={bookHref} />
            ))}
          </Section>
        ) : null}

        <Section title={t('pay.history')}>
          {payments.length === 0 ? (
            <Card>
              <Muted>{t('pay.noPayments')}</Muted>
            </Card>
          ) : (
            <Card style={{ gap: 0 }}>
              {payments
                .slice()
                .reverse()
                .map((p, i) => (
                  <View key={p.id}>
                    {i > 0 ? <Hairline /> : null}
                    <View style={styles.historyRow}>
                      <View style={styles.historyIcon}>
                        <Glyph icon={Icons.CreditCard} size={18} color={colors.canvas} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Body weight="medium">{t('pay.paidBy', { name: p.payerName, method: t(`pay.methods.${p.method}`), last4: p.last4 })}</Body>
                        <Meta>{fmtDateTime(p.createdAt, DEVICE_TZ)} · → CareBridge</Meta>
                      </View>
                      <Body weight="medium">{money(p.amount)}</Body>
                    </View>
                  </View>
                ))}
            </Card>
          )}
        </Section>
        <Meta>{t('pay.testMode')}</Meta>
      </Screen>
    </PlanState>
  );
}

function useMoney() {
  const { i18n } = useTranslation();
  const locale = i18n.language === 'es' ? 'es-US' : 'en-US';
  return useCallback(
    (n: number) => `$${n.toLocaleString(locale, { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`,
    [locale],
  );
}

// ---------------------------------------------------------------------------

function BalanceHero({ settlement: s, onPay, checkoutOpen }: { settlement: Settlement; onPay: () => void; checkoutOpen: boolean }) {
  const { t } = useTranslation();
  const money = useMoney();
  const paidPct = s.familyDue > 0 ? Math.min(100, (s.familyPaid / s.familyDue) * 100) : 100;
  return (
    <View style={{ gap: space.md }}>
      <Surface tone="blueDeep" padded={space.xl} style={{ gap: space.sm }}>
        <Meta color={colors.canvasMuted}>{t('pay.balance').toUpperCase()}</Meta>
        <Body color={colors.canvas} style={styles.heroAmount}>
          {money(s.balance)}
        </Body>
        <Meta color={colors.canvasMuted}>
          {s.familyDue > 0 && s.balance === 0 ? t('pay.allPaid') : t('pay.balanceSub', { paid: money(s.familyPaid), due: money(s.familyDue), insurance: money(s.insuranceCover), programs: money(s.programsCover) })}
        </Meta>
        {s.credit > 0 ? <Meta color={colors.canvas}>{t('pay.credit', { amount: money(s.credit) })}</Meta> : null}
        <View style={styles.heroBar}>
          <View style={[styles.heroBarFill, { width: `${paidPct}%` }]} />
        </View>
        <Meta color={colors.canvasMuted}>{t('pay.splitHint')}</Meta>
      </Surface>
      {s.balance > 0 && !checkoutOpen ? <Button label={t('pay.payCta', { amount: money(s.balance) })} variant="hero" icon={Icons.CreditCard} onPress={onPay} /> : null}
    </View>
  );
}

/** Programs and family → CareBridge → services, with live amounts. */
function MoneyFlow({ settlement: s }: { settlement: Settlement }) {
  const { t } = useTranslation();
  const money = useMoney();
  const node = (label: string, amount: string, sub: string, icon: LucideIcon, tone: 'good' | 'blue' | 'caution' | 'deep') => (
    <View style={[styles.node, tone === 'deep' ? { backgroundColor: colors.blueDeep, borderLeftColor: colors.blueSoft } : { backgroundColor: tint[tone], borderLeftColor: statusColor[tone] }]}>
      <Row>
        <Glyph icon={icon} size={18} color={tone === 'deep' ? colors.canvas : statusColor[tone]} />
        <Body weight="medium" color={tone === 'deep' ? colors.canvas : colors.ink}>
          {label}
        </Body>
      </Row>
      <Body color={tone === 'deep' ? colors.canvas : colors.ink} style={styles.nodeAmount}>
        {amount}
      </Body>
      <Meta color={tone === 'deep' ? colors.canvasMuted : colors.inkMuted}>{sub}</Meta>
    </View>
  );
  const down = (
    <View style={styles.arrow}>
      <View style={styles.arrowLine} />
      <View style={styles.arrowHead} />
    </View>
  );
  return (
    <Card>
      <Body weight="medium">{t('pay.flowTitle')}</Body>
      <View style={styles.flowSources}>
        <View style={styles.source}>{node(t('pay.flow.insurance'), money(s.insuranceCover), t('pay.flow.insuranceSub'), Icons.FileText, 'good')}</View>
        <View style={styles.source}>{node(t('pay.flow.programs'), money(s.programsCover), t('pay.flow.programsSub'), Icons.ShieldCheck, 'good')}</View>
        <View style={styles.source}>{node(t('pay.flow.family'), money(s.familyDue), t('pay.flow.familySub', { paid: money(s.familyPaid) }), Icons.Users, s.balance > 0 ? 'caution' : 'good')}</View>
      </View>
      {down}
      {node('CareBridge', money(s.insuranceCover + s.programsCover + Math.min(s.familyPaid, s.familyDue)), t('pay.flow.carebridgeSub'), Icons.Wallet, 'deep')}
      {down}
      {node(t('pay.flow.services'), money(s.sentToServices), t('pay.flow.servicesSub', { total: money(s.total) }), Icons.HeartHandshake, 'blue')}
    </Card>
  );
}

function ItemCard({ item, claims }: { item: SettledItem; claims: ClaimActions }) {
  const { t } = useTranslation();
  const money = useMoney();
  const programTotal = item.programLegs.reduce((a, l) => a + l.amount, 0);
  const insured = item.insurance?.approvedAmount ?? 0;
  const pct = (n: number) => `${item.total > 0 ? (n / item.total) * 100 : 0}%` as const;
  const sent = item.payout === 'sent';
  return (
    <Card>
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={[styles.kindIcon, sent && { backgroundColor: colors.good }]}>
          <Glyph icon={kindIcon[item.kind]} size={20} color={colors.canvas} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Body weight="medium">{t(item.labelKey, { defaultValue: item.label })}{item.detail ? ` · ${item.detail}` : ''}</Body>
          <Meta>→ {item.payeeName}</Meta>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Body weight="medium">{money(item.total)}</Body>
          {item.hypothetical ? <Meta>{t('pay.estimate')}</Meta> : null}
        </View>
      </Row>

      <View style={styles.split} accessibilityLabel={`${t('pay.whoPays')}: ${money(programTotal)} programs, ${money(item.familyPaid)} family paid, ${money(item.familyShare - item.familyPaid)} family due`}>
        <View style={{ width: pct(insured), backgroundColor: colors.blueDeep }} />
        <View style={{ width: pct(programTotal), backgroundColor: colors.good }} />
        <View style={{ width: pct(item.familyPaid), backgroundColor: colors.blue }} />
        <View style={{ width: pct(item.familyShare - item.familyPaid), backgroundColor: colors.caution }} />
      </View>

      <View style={styles.legs}>
        <Meta>{t('pay.whoPays').toUpperCase()}</Meta>
        {item.insurance ? (
          <Leg
            from={item.insurance.payerName}
            to="CareBridge"
            amount={money(item.insurance.status === 'approved' ? (item.insurance.approvedAmount ?? 0) : item.insurance.estimate)}
            tone={item.insurance.status === 'approved' ? 'good' : item.insurance.status === 'denied' ? 'caution' : 'blue'}
            status={insuranceStatusText(item, t, money)}
            done={item.insurance.status === 'approved'}
          />
        ) : null}
        {item.insurance ? <InsuranceActions item={item} claims={claims} /> : null}
        {item.programLegs.map((l) => (
          <Leg key={l.programId} from={l.programName} to="CareBridge" amount={money(l.amount)} tone="good" status={t('pay.programPaid')} done />
        ))}
        <Leg
          from={t('pay.family')}
          to="CareBridge"
          amount={money(item.familyShare)}
          tone={item.familyShare === 0 || item.familyPaid >= item.familyShare ? 'good' : 'caution'}
          status={item.familyShare === 0 ? t('pay.nothingOwed') : item.familyPaid >= item.familyShare ? t('pay.paid') : item.familyPaid > 0 ? t('pay.partlyPaid', { amount: money(item.familyPaid) }) : t('pay.due')}
          done={item.familyShare === 0 || item.familyPaid >= item.familyShare}
        />
        <Leg from="CareBridge" to={item.payeeName} amount={money(item.total)} tone={sent ? 'good' : 'blue'} status={t(`pay.payout.${item.payout}`)} done={sent} />
      </View>

      {item.pending.map((p) => (
        <View key={p.programId} style={styles.pending}>
          <Glyph icon={Icons.ShieldCheck} size={16} color={colors.inkMuted} />
          <View style={{ flex: 1 }}>
            <Meta color={colors.ink}>{p.programName}</Meta>
            <Meta>
              {t('pay.couldCover', { amount: money(p.upTo) })} · {t(`assistanceStatus.${p.status}`)}
            </Meta>
          </View>
        </View>
      ))}
    </Card>
  );
}

function Leg({ from, to, amount, tone, status, done }: { from: string; to: string; amount: string; tone: 'good' | 'caution' | 'blue'; status: string; done: boolean }) {
  return (
    <View style={[styles.leg, { borderLeftColor: statusColor[tone] }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Row wrap style={{ gap: space.xs }}>
          <Body numberOfLines={1} style={{ flexShrink: 1 }}>
            {from}
          </Body>
          <Glyph icon={Icons.ChevronRight} size={16} color={colors.inkMuted} />
          <Body numberOfLines={1} style={{ flexShrink: 1 }}>
            {to}
          </Body>
        </Row>
        <Row style={{ gap: space.xs }}>
          {done ? <Glyph icon={Icons.Check} size={14} color={colors.good} /> : null}
          <Meta>{status}</Meta>
        </Row>
      </View>
      <Body weight="medium">{amount}</Body>
    </View>
  );
}

function NotBookedCard({ item, bookHref }: { item: SettledItem; bookHref?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const money = useMoney();
  return (
    <View style={styles.notBooked}>
      <Glyph icon={kindIcon[item.kind]} size={20} color={colors.inkMuted} />
      <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
        <Body>{t(item.labelKey, { defaultValue: item.label })}{item.detail ? ` · ${item.detail}` : ''}</Body>
        <Meta>
          {money(item.total)} {item.hypothetical ? `· ${t('pay.estimate')}` : ''}
          {item.programLegs.length ? ` · ${t('pay.programsCommitted', { amount: money(item.programLegs.reduce((a, l) => a + l.amount, 0)) })}` : ''}
        </Meta>
      </View>
      {bookHref ? <Button label={t('pay.bookProvider')} variant="ghost" compact onPress={() => router.push(bookHref as never)} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Insurance and the plain-language summary
// ---------------------------------------------------------------------------

type T = (key: string, params?: Record<string, unknown>) => string;
const plainName = (name: string) => name.replace(/\s*\(demo\)$/, '');

function insuranceStatusText(item: SettledItem, t: T, money: (n: number) => string) {
  const ins = item.insurance!;
  switch (ins.status) {
    case 'approved':
      return t('pay.insurance.approved');
    case 'submitted':
      return t('pay.insurance.submitted');
    case 'denied':
      return `${t('pay.insurance.denied')} · ${t(ins.denialReasonKey ?? 'pay.denials.priorAuth')}`;
    default:
      return t('pay.insurance.estimate', { amount: money(ins.estimate) });
  }
}

/** Submit / simulated reply / resubmit. Read-only status for caregivers. */
function InsuranceActions({ item, claims }: { item: SettledItem; claims: ClaimActions }) {
  const { t } = useTranslation();
  const ins = item.insurance;
  if (!ins || ins.status === 'approved' || !claims.canManage) return null;
  if (ins.status === 'submitted' && ins.claimId) {
    const id = ins.claimId;
    return (
      <View style={styles.claimBox}>
        <Meta>{t('pay.insurance.simulated')}</Meta>
        <Row wrap>
          <Button label={t('pay.insurance.simApprove')} variant="ghost" compact icon={Icons.Check} loading={claims.busy} onPress={() => claims.reply(id, 'approved')} />
          <Button label={t('pay.insurance.simDeny')} variant="quiet" compact disabled={claims.busy} onPress={() => claims.reply(id, 'denied')} />
        </Row>
      </View>
    );
  }
  return (
    <Button
      label={ins.status === 'denied' ? t('pay.insurance.resubmit') : t('pay.insurance.submit')}
      variant={ins.status === 'denied' ? 'quiet' : 'ghost'}
      compact
      icon={Icons.FileText}
      loading={claims.busy}
      onPress={() => claims.submit(item.id)}
    />
  );
}

/** One plain sentence per item: who pays what, and the one thing that could lower the family share. */
function plainSentences(item: SettledItem, t: T, money: (n: number) => string): { main: string; hint?: string } {
  if (!item.payable) return { main: t('pay.simple.notBooked') };
  const parts: string[] = [];
  if (item.insurance?.status === 'approved' && item.insurance.approvedAmount) parts.push(t('pay.simple.pays', { who: plainName(item.insurance.payerName), amount: money(item.insurance.approvedAmount) }));
  for (const l of item.programLegs) parts.push(t('pay.simple.pays', { who: plainName(l.programName), amount: money(l.amount) }));
  const owed = Math.max(0, item.familyShare - item.familyPaid);
  if (item.familyShare === 0) parts.push(t('pay.simple.youPayNothing'));
  else if (owed === 0) parts.push(t('pay.simple.youPaid', { amount: money(item.familyShare) }));
  else parts.push(item.familyPaid > 0 ? `${t('pay.simple.youPay', { amount: money(owed) })} (${t('pay.simple.alreadyPaid', { amount: money(item.familyPaid) })})` : t('pay.simple.youPay', { amount: money(owed) }));
  const main = parts.join(', ');

  let hint: string | undefined;
  const ins = item.insurance;
  if (ins && ins.status === 'not_submitted' && item.familyShare > 0) hint = t('pay.simple.insuranceCould', { who: plainName(ins.payerName), amount: money(ins.estimate) });
  else if (ins?.status === 'submitted') hint = t('pay.simple.insuranceWaiting', { who: plainName(ins.payerName), amount: money(ins.estimate) });
  else if (ins?.status === 'denied') hint = t('pay.simple.insuranceDenied', { who: plainName(ins.payerName), reason: t(ins.denialReasonKey ?? 'pay.denials.priorAuth') });
  else if (item.pending[0] && item.familyShare > 0) hint = t('pay.simple.programCould', { who: plainName(item.pending[0].programName), amount: money(item.pending[0].upTo) });
  return { main: main.charAt(0).toUpperCase() + main.slice(1) + '.', hint };
}

function SimpleSummary({ items, claims }: { items: SettledItem[]; claims: ClaimActions }) {
  const { t } = useTranslation();
  const money = useMoney();
  const ordered = useMemo(() => [...items.filter((i) => i.payable), ...items.filter((i) => !i.payable)], [items]);
  return (
    <Card style={{ gap: 0 }}>
      <Body weight="medium" style={{ paddingBottom: space.sm }}>
        {t('pay.simple.title')}
      </Body>
      {ordered.length === 0 ? <Muted>{t('pay.nothingDue')}</Muted> : null}
      {ordered.map((item, i) => {
        const { main, hint } = plainSentences(item, t, money);
        const done = item.payable && item.payout === 'sent';
        return (
          <View key={item.id}>
            {i > 0 ? <Hairline /> : null}
            <View style={styles.simpleRow}>
              <View style={[styles.kindIcon, done && { backgroundColor: colors.good }, !item.payable && { backgroundColor: colors.inkFaint }]}>
                <Glyph icon={done ? Icons.Check : kindIcon[item.kind]} size={20} color={item.payable ? colors.canvas : colors.inkMuted} />
              </View>
              <View style={{ flex: 1, gap: space.xs }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Body weight="medium" style={{ flex: 1 }}>
                    {t(item.labelKey, { defaultValue: item.label })}
                    {item.detail ? ` · ${item.detail}` : ''}
                  </Body>
                  <Body weight="medium">{money(item.total)}</Body>
                </Row>
                <Body>{main}</Body>
                {hint ? <Muted>{hint}</Muted> : null}
                <InsuranceActions item={item} claims={claims} />
              </View>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

type AmountMode = 'full' | 'half' | 'custom';

function Checkout({ patientId, balance, onCancel, onPaid }: { patientId: string; balance: number; onCancel: () => void; onPaid: (p: Payment) => Promise<void> }) {
  const { t } = useTranslation();
  const { session, repo } = useSession();
  const money = useMoney();
  const { busy, error, run } = useAction();
  const half = Math.round((balance / 2) * 100) / 100;
  const [mode, setMode] = useState<AmountMode>('full');
  const [custom, setCustom] = useState<number | undefined>();
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [name, setName] = useState(session?.profile.displayName ?? '');
  const [number, setNumber] = useState(TEST_CARD.number);
  const [expiry, setExpiry] = useState(TEST_CARD.expiry);
  const [cvc, setCvc] = useState(TEST_CARD.cvc);
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const amount = mode === 'full' ? balance : mode === 'half' ? half : Math.round((custom ?? 0) * 100) / 100;
  const card = validateCard({ number, expiry, cvc });
  const amountOk = amount > 0 && amount <= balance;
  const show = (bad?: true) => (submitted && bad ? true : undefined);

  return (
    <Card style={{ gap: space.lg, borderWidth: 1, borderColor: colors.blue }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          <Glyph icon={Icons.CreditCard} size={22} color={colors.blue} />
          <Body size="large" weight="medium">
            {t('pay.checkout.title')}
          </Body>
        </Row>
        <Button label={t('common.cancel')} variant="quiet" compact onPress={onCancel} />
      </Row>

      <Field label={t('pay.checkout.amount')} error={submitted && !amountOk ? t('pay.checkout.errAmount', { max: money(balance) }) : undefined}>
        <Row wrap>
          <Chip label={t('pay.checkout.full', { amount: money(balance) })} selected={mode === 'full'} onPress={() => setMode('full')} />
          {balance >= 2 ? <Chip label={t('pay.checkout.half', { amount: money(half) })} selected={mode === 'half'} onPress={() => setMode('half')} /> : null}
          <Chip label={t('pay.checkout.custom')} selected={mode === 'custom'} onPress={() => setMode('custom')} />
        </Row>
        {mode === 'custom' ? <NumberField value={custom} onChange={setCustom} placeholder="$0.00" accessibilityLabel={t('pay.checkout.custom')} /> : null}
      </Field>

      <Field label={t('pay.checkout.method')}>
        <Choice
          options={[
            { value: 'card' as const, label: t('pay.checkout.card') },
            { value: 'hsa_fsa' as const, label: t('pay.checkout.hsa') },
          ]}
          value={method}
          onChange={setMethod}
        />
      </Field>

      <Surface tone="ink" padded={space.lg} style={styles.cardFace}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Meta color={colors.canvasMuted}>{method === 'hsa_fsa' ? 'HSA / FSA' : card.brand.toUpperCase()}</Meta>
          <Meta color={colors.canvasMuted}>TEST</Meta>
        </Row>
        <Body color={colors.canvas} style={styles.cardNumber}>
          •••• •••• •••• {card.last4 || '0000'}
        </Body>
        <Row style={{ justifyContent: 'space-between' }}>
          <Meta color={colors.canvas}>{name || '—'}</Meta>
          <Meta color={colors.canvas}>{expiry}</Meta>
        </Row>
      </Surface>

      <Field label={t('pay.checkout.name')}>
        <TextField value={name} onChangeText={setName} autoComplete="cc-name" />
      </Field>
      <Field label={t('pay.checkout.number')} error={show(card.errors.number) && t('pay.checkout.errNumber')}>
        <TextField value={number} onChangeText={setNumber} keyboardType="number-pad" autoComplete="cc-number" />
      </Field>
      <View style={styles.twoCol}>
        <View style={{ flex: 1 }}>
          <Field label={t('pay.checkout.expiry')} error={show(card.errors.expiry) && t('pay.checkout.errExpiry')}>
            <TextField value={expiry} onChangeText={setExpiry} placeholder="MM/YY" autoComplete="cc-exp" />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t('pay.checkout.cvc')} error={show(card.errors.cvc) && t('pay.checkout.errCvc')}>
            <TextField value={cvc} onChangeText={setCvc} keyboardType="number-pad" secureTextEntry autoComplete="cc-csc" />
          </Field>
        </View>
      </View>
      <Meta>{t('pay.checkout.testCard')}</Meta>
      {error ? <Body color={colors.urgent}>{error}</Body> : null}

      <Button
        label={busy ? t('pay.checkout.processing') : t('pay.checkout.pay', { amount: money(amountOk ? amount : 0) })}
        variant="hero"
        icon={Icons.ShieldCheck}
        loading={busy}
        onPress={() => {
          setSubmitted(true);
          if (card.ok && amountOk) setConfirming(true);
        }}
      />

      <ConfirmSheet
        visible={confirming}
        title={t('pay.checkout.confirmTitle')}
        body={t('pay.checkout.confirmBody', { amount: money(amount), brand: method === 'hsa_fsa' ? 'HSA/FSA' : card.brand, last4: card.last4 })}
        confirmLabel={t('pay.checkout.pay', { amount: money(amount) })}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          if (!session) return;
          void run(async () => {
            await new Promise((r) => setTimeout(r, 900)); // simulated processor round trip
            const payment = await payFamilyShare(repo, session, patientId, { amount, method, cardBrand: card.brand, last4: card.last4 });
            await onPaid(payment);
          });
        }}
      />
    </Card>
  );
}

function Receipt({ receipt, onDone }: { receipt: { payment: Payment; paidOut: SettledItem[] }; onDone: () => void }) {
  const { t } = useTranslation();
  const money = useMoney();
  const f = useFmt(DEVICE_TZ);
  const p = receipt.payment;
  return (
    <View style={styles.receipt} accessibilityLiveRegion="polite">
      <Row>
        <View style={styles.receiptCheck}>
          <Glyph icon={Icons.Check} size={22} color={colors.canvas} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Body size="large" weight="medium">
            {t('pay.receipt.title')}
          </Body>
          <Meta>
            {money(p.amount)} · {t('pay.paidBy', { name: p.payerName, method: t(`pay.methods.${p.method}`), last4: p.last4 })}
          </Meta>
          <Meta>
            {f.dateTime(p.createdAt)} · {t('pay.receipt.ref', { id: p.id.slice(-8).toUpperCase() })}
          </Meta>
        </View>
      </Row>
      {receipt.paidOut.length ? (
        <View style={{ gap: space.xs }}>
          <Meta color={colors.ink}>{t('pay.receipt.paidOut')}</Meta>
          {receipt.paidOut.map((i) => (
            <Row key={i.id} style={{ gap: space.sm }}>
              <Glyph icon={Icons.Check} size={14} color={colors.good} />
              <Meta color={colors.ink} style={{ flex: 1 }}>
                {t(i.labelKey, { defaultValue: i.label })}{i.detail ? ` · ${i.detail}` : ''} → {i.payeeName}
              </Meta>
              <Meta color={colors.ink}>{money(i.total)}</Meta>
            </Row>
          ))}
        </View>
      ) : null}
      <Button label={t('pay.receipt.done')} variant="ghost" compact onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  heroAmount: { fontSize: 44, lineHeight: 52 },
  heroBar: { height: 8, borderRadius: 4, backgroundColor: 'rgba(242, 244, 247, 0.2)', overflow: 'hidden', marginVertical: space.xs },
  heroBarFill: { height: 8, borderRadius: 4, backgroundColor: colors.canvas },

  flowSources: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  source: { flexGrow: 1, flexBasis: 160 },
  simpleRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, alignItems: 'flex-start' },
  claimBox: { gap: space.xs, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.blueSoft, borderRadius: radius.card, padding: space.sm },
  node: { borderRadius: radius.card, borderLeftWidth: 4, padding: space.md, gap: 2, minWidth: 140 },
  nodeAmount: { fontSize: 24, lineHeight: 30 },
  arrow: { alignItems: 'center', height: 22 },
  arrowLine: { width: 2, flex: 1, backgroundColor: colors.inkFaint },
  arrowHead: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: colors.inkMuted },

  kindIcon: { width: 40, height: 40, borderRadius: radius.round, backgroundColor: colors.blueDeep, alignItems: 'center', justifyContent: 'center' },
  split: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.inkFaint },
  legs: { gap: space.sm },
  leg: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderLeftWidth: 3, paddingLeft: space.md, paddingVertical: 2 },
  pending: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.inkFaint, borderRadius: radius.card, padding: space.sm },

  notBooked: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.inkFaint, borderRadius: radius.card, padding: space.md },

  historyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  historyIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },

  cardFace: { gap: space.md, maxWidth: 360, width: '100%' },
  cardNumber: { fontSize: 20, lineHeight: 28, letterSpacing: 1 },
  twoCol: { flexDirection: 'row', gap: space.md },

  receipt: { gap: space.md, padding: space.lg, borderRadius: radius.card, borderLeftWidth: 4, borderLeftColor: colors.good, backgroundColor: tint.good },
  receiptCheck: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.good, alignItems: 'center', justifyContent: 'center' },
});
