import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { canTransition } from '@/core/engines/tasks';
import type { Caregiver, ClinicalInstruction, RecoveryTask, TaskEvent, TaskEventType } from '@/core/types';
import { reportBarrier, transitionTask } from '@/core/usecases';
import { useSession } from '@/state/SessionProvider';
import { useAction } from '@/state/usePlan';
import { Body, Button, Card, Chip, ConfirmSheet, Field, Glyph, Hairline, KeyValue, Meta, Muted, Provenance, Row, Section, TextField, categoryIcon, colors, space } from '@/ui';
import { assigneeLabel } from './TaskCard';
import { useFmt } from './format';
import { taskTone } from './status';

interface Props {
  task: RecoveryTask;
  timezone: string;
  caregivers?: Caregiver[];
  instruction?: ClinicalInstruction;
  onChanged: () => void;
}

/**
 * Task detail with role-appropriate actions. Patients and caregivers report;
 * coordinators verify, resolve, escalate and reassign. Every change writes a
 * timestamped event, shown below as history.
 */
export function TaskDetail({ task, timezone, caregivers, instruction, onChanged }: Props) {
  const { t } = useTranslation();
  const f = useFmt(timezone);
  const { repo, session } = useSession();
  const { busy, error, run } = useAction();
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [barrier, setBarrier] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [reassign, setReassign] = useState<string | null>(null);
  const role = session?.profile.role;
  const Icon = categoryIcon[task.category];

  const loadEvents = useCallback(() => repo.listTaskEvents(task.id).then(setEvents).catch(() => setEvents([])), [repo, task.id]);
  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const fire = (event: TaskEventType, opts?: { notes?: string; assignedCaregiverId?: string }) =>
    run(async () => {
      if (!session) return;
      await transitionTask(repo, session, task, event, opts);
      await loadEvents();
      onChanged();
    });

  const can = (e: TaskEventType) => canTransition(task.status, e);
  const mine = role === 'patient' || (role === 'caregiver' && task.assignedUserId === session?.profile.id);

  return (
    <View style={{ gap: space.xl }}>
      <Card>
        <Row>
          <Glyph icon={Icon} size={26} color={colors.ink} />
          <Body size="large" weight="medium" style={{ flex: 1 }}>
            {f.title(task.titleKey, task.titleParams)}
          </Body>
          <Chip label={t(`taskStatus.${task.status}`)} tone={taskTone(task.status)} dense />
        </Row>
        <Hairline />
        <KeyValue k={t('tasks.scheduled')} v={f.dateTime(task.scheduledAt)} />
        <KeyValue k={t('tasks.due')} v={f.dateTime(task.dueAt)} />
        <KeyValue k={t('tasks.assigned')} v={assigneeLabel(task, caregivers, t)} />
        <KeyValue k={t('tasks.priority')} v={t(`tasks.priorityLabel.${task.priority}`)} />
        {task.requiredResources.length ? <KeyValue k={t('tasks.equipment')} v={task.requiredResources.map((r) => t(`resources.${r}`, { defaultValue: r })).join(', ')} /> : null}
        {task.blockedReason ? <KeyValue k={t('taskStatus.blocked')} v={task.blockedReason} /> : null}
      </Card>

      <Section title={t('tasks.source')}>
        <Card>
          <Body>{task.sourceText}</Body>
          <Provenance>{instruction?.sourcePage ? t('provenance.reportPage', { page: instruction.sourcePage }) : t('provenance.report')}</Provenance>
          {instruction?.reviewedBy ? <Provenance>{t('provenance.reviewedBy', { name: t('common.coordinator') })}</Provenance> : null}
          <Meta>{t('report.originalLanguage')}</Meta>
        </Card>
      </Section>

      <View style={styles.actions}>
        {mine && can('assignment_accepted') && role === 'caregiver' && task.assignedUserId === session?.profile.id ? (
          <Button label={t('tasks.accept')} variant="hero" loading={busy} onPress={() => fire('assignment_accepted')} />
        ) : null}
        {mine && can('reported_complete') ? (
          <Button label={role === 'caregiver' ? t('tasks.completeCaregiver') : t('tasks.complete')} variant="hero" loading={busy} onPress={() => fire('reported_complete')} />
        ) : null}
        {mine && can('blocked') ? <Button label={t('tasks.cannot')} variant="ghost" onPress={() => setBarrier('')} /> : null}
        {role === 'coordinator' && can('verified') ? <Button label={t('tasks.verify')} variant="hero" loading={busy} onPress={() => fire('verified')} /> : null}
        {role === 'coordinator' && can('resolved') ? <Button label={t('tasks.resolve')} variant="hero" onPress={() => setNotes('')} /> : null}
        {role === 'coordinator' && can('escalated') ? <Button label={t('tasks.escalate')} variant="danger" loading={busy} onPress={() => fire('escalated')} /> : null}
        {role === 'coordinator' && can('reassigned') && caregivers?.length ? <Button label={t('tasks.reassign')} variant="ghost" onPress={() => setReassign('')} /> : null}
        {role === 'coordinator' && task.status === 'awaiting_resources' && can('resource_confirmed') ? (
          <Button label={t('taskEvent.resource_confirmed')} variant="ghost" loading={busy} onPress={() => fire('resource_confirmed')} />
        ) : null}
      </View>
      {error ? <Body color={colors.urgent}>{error}</Body> : null}

      <Section title={t('tasks.history')}>
        <Card>
          {events.length === 0 ? <Muted>{t('common.noItems')}</Muted> : null}
          {events.map((e) => (
            <View key={e.id} style={styles.event}>
              <Meta style={{ minWidth: 150 }}>{f.dateTime(e.createdAt)}</Meta>
              <View style={{ flex: 1 }}>
                <Body>
                  {t(`taskEvent.${e.eventType}`)}
                  {e.toStatus ? ` → ${t(`taskStatus.${e.toStatus}`)}` : ''}
                </Body>
                {e.notes ? <Muted>{e.notes}</Muted> : null}
                <Meta>{e.actorRole === 'system' ? t('provenance.computed') : t(`common.${e.actorRole}`)}</Meta>
              </View>
            </View>
          ))}
        </Card>
      </Section>

      <ConfirmSheet
        visible={barrier !== null}
        title={t('tasks.cannot')}
        body={t('tasks.cannotWhy')}
        confirmLabel={t('tasks.report')}
        cancelLabel={t('common.cancel')}
        confirmDisabled={!barrier || barrier.trim().length < 3}
        onCancel={() => setBarrier(null)}
        onConfirm={() => {
          const reason = barrier ?? '';
          setBarrier(null);
          void run(async () => {
            if (!session) return;
            await reportBarrier(repo, session, task, reason);
            await loadEvents();
            onChanged();
          });
        }}
      >
        <TextField value={barrier ?? ''} onChangeText={setBarrier} multiline placeholder={t('caregiverApp.barrierHint')} />
      </ConfirmSheet>

      <ConfirmSheet
        visible={notes !== null}
        title={t('tasks.resolve')}
        confirmLabel={t('common.save')}
        cancelLabel={t('common.cancel')}
        confirmDisabled={!notes || notes.trim().length < 3}
        onCancel={() => setNotes(null)}
        onConfirm={() => {
          const n = notes ?? '';
          setNotes(null);
          void fire('resolved', { notes: n });
        }}
      >
        <Field label={t('tasks.resolutionNotes')}>
          <TextField value={notes ?? ''} onChangeText={setNotes} multiline />
        </Field>
      </ConfirmSheet>

      <ConfirmSheet
        visible={reassign !== null}
        title={t('tasks.reassign')}
        confirmLabel={t('common.save')}
        cancelLabel={t('common.cancel')}
        confirmDisabled={!reassign}
        onCancel={() => setReassign(null)}
        onConfirm={() => {
          const id = reassign ?? '';
          setReassign(null);
          void fire('reassigned', { assignedCaregiverId: id, notes: 'Reassigned by coordinator' });
        }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {(caregivers ?? []).map((c) => (
            <Chip key={c.id} label={c.name} selected={reassign === c.id} onPress={() => setReassign(c.id)} />
          ))}
        </View>
      </ConfirmSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.md },
  event: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', paddingVertical: space.xs },
});
