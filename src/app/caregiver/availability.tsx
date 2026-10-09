import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { offsetFromDischarge } from '@/core/time';
import type { Caregiver } from '@/core/types';
import { setAvailability } from '@/core/usecases';
import { DateTimeField } from '@/features/DateTimeField';
import { PlanState } from '@/features/PlanScreen';
import { useFmt } from '@/features/format';
import { useSession } from '@/state/SessionProvider';
import { useAction, useCaregiverView } from '@/state/usePlan';
import { BOTTOM_BAR_HEIGHT, Body, Button, Card, Chip, Icons, Meta, Muted, Row, Screen, Section, StatusDot, colors, space } from '@/ui';

type Block = { startAt?: string; endAt?: string };

/** The caregiver confirms the hours the plan can count on. Entered by the patient ≠ confirmed. */
export default function Availability() {
  const { t } = useTranslation();
  const { repo } = useSession();
  const { view, loading, error, reload } = useCaregiverView();
  const { busy, error: actionError, run } = useAction();
  const [drafts, setDrafts] = useState<Record<string, Block[]>>({});
  const [saved, setSaved] = useState<string | null>(null);

  // Seed drafts for records we have not edited yet (state adjusted during render).
  if (view) {
    const missing = view.records.filter((r) => !drafts[r.id]);
    if (missing.length) {
      const next = { ...drafts };
      for (const r of missing) next[r.id] = view.availability.filter((a) => a.caregiverId === r.id).map((a) => ({ startAt: a.startAt, endAt: a.endAt }));
      setDrafts(next);
    }
  }

  return (
    <PlanState loading={loading && !view} error={error} onRetry={reload}>
      {view ? (
        <Screen title={t('caregiverApp.availabilityTitle')} subtitle={t('caregiverApp.availabilityIntro')} bottomInset={BOTTOM_BAR_HEIGHT}>
          {actionError ? <Body color={colors.urgent}>{actionError}</Body> : null}
          {view.records.filter((r) => r.acceptedInvitation).length === 0 ? (
            <Card>
              <Muted>{t('caregiverApp.noPatients')}</Muted>
            </Card>
          ) : null}
          {view.records
            .filter((r) => r.acceptedInvitation)
            .map((r) => {
              const patient = view.patients.find((p) => p.id === r.patientId);
              if (!patient) return null;
              return (
                <CaregiverBlocks
                  key={r.id}
                  record={r}
                  patientName={patient.displayName}
                  dischargeAt={patient.dischargeAt}
                  timezone={patient.timezone}
                  blocks={drafts[r.id] ?? []}
                  confirmed={view.availability.filter((a) => a.caregiverId === r.id).every((a) => a.confirmed) && view.availability.some((a) => a.caregiverId === r.id)}
                  busy={busy}
                  saved={saved === r.id}
                  onChange={(b) => setDrafts({ ...drafts, [r.id]: b })}
                  onSave={() =>
                    void run(async () => {
                      const valid = (drafts[r.id] ?? []).filter((b) => b.startAt && b.endAt && Date.parse(b.endAt) > Date.parse(b.startAt)) as { startAt: string; endAt: string }[];
                      await setAvailability(repo, r, valid, true);
                      setSaved(r.id);
                      await reload();
                    })
                  }
                />
              );
            })}
        </Screen>
      ) : null}
    </PlanState>
  );
}

function CaregiverBlocks({
  record,
  patientName,
  dischargeAt,
  timezone,
  blocks,
  confirmed,
  busy,
  saved,
  onChange,
  onSave,
}: {
  record: Caregiver;
  patientName: string;
  dischargeAt: string;
  timezone: string;
  blocks: Block[];
  confirmed: boolean;
  busy: boolean;
  saved: boolean;
  onChange: (b: Block[]) => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const f = useFmt(timezone);
  return (
    <Section title={t('caregiverApp.helping', { name: patientName })} aside={<Chip label={confirmed ? t('caregiverApp.confirmedHours') : t('caregivers.pending')} tone={confirmed ? 'good' : 'caution'} dense />}>
      <Card>
        <Meta>
          {record.relationship} · {t('home.discharge')} {f.dateTime(dischargeAt)} · {timezone}
        </Meta>
        {blocks.length === 0 ? <Muted>{t('common.none')}</Muted> : null}
        {blocks.map((b, i) => (
          <View key={i} style={styles.block}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row>
                <StatusDot tone={b.startAt && b.endAt ? 'blue' : 'caution'} />
                <Body>{b.startAt && b.endAt ? f.range(b.startAt, b.endAt) : '—'}</Body>
              </Row>
              <Button label={t('intake.d.remove')} variant="quiet" compact onPress={() => onChange(blocks.filter((_, n) => n !== i))} />
            </Row>
            <Meta>{t('common.at')}</Meta>
            <DateTimeField value={b.startAt} timezone={timezone} onChange={(v) => onChange(blocks.map((x, n) => (n === i ? { ...x, startAt: v } : x)))} />
            <Meta>{t('common.to')}</Meta>
            <DateTimeField value={b.endAt} timezone={timezone} onChange={(v) => onChange(blocks.map((x, n) => (n === i ? { ...x, endAt: v } : x)))} />
          </View>
        ))}
        <Row wrap>
          <Button
            label={t('caregiverApp.addBlock')}
            variant="ghost"
            compact
            onPress={() => {
              const last = blocks[blocks.length - 1]?.endAt ?? dischargeAt;
              onChange([...blocks, { startAt: last, endAt: offsetFromDischarge(last, 12) }]);
            }}
          />
          <Button label={saved ? t('caregiverApp.confirmedHours') : t('caregiverApp.confirmHours')} variant="hero" compact icon={Icons.Check} loading={busy} onPress={onSave} />
        </Row>
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({ block: { gap: space.sm, padding: space.md, backgroundColor: colors.canvas, borderRadius: 4 } });
