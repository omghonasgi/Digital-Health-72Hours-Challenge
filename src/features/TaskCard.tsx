import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { canTransition } from '@/core/engines/tasks';
import type { Caregiver, RecoveryTask } from '@/core/types';
import { useSession } from '@/state/SessionProvider';
import { Body, Button, Chip, Glyph, Meta, Muted, Surface, Thread, categoryIcon, colors, space, Icons } from '@/ui';
import { useFmt } from './format';
import { taskTone } from './status';

interface Props {
  task: RecoveryTask;
  timezone: string;
  caregivers?: Caregiver[];
  href?: Href;
  /** Show the thread to the resource chip. */
  threaded?: boolean;
  compact?: boolean;
  /** Shows a one-tap "Done" under the card while the task can still be reported. */
  onDone?: (task: RecoveryTask) => void;
  doneBusy?: boolean;
}

export function assigneeLabel(task: RecoveryTask, caregivers: Caregiver[] | undefined, t: (k: string) => string) {
  if (task.assignedCaregiverId) return caregivers?.find((c) => c.id === task.assignedCaregiverId)?.name ?? t('tasks.assignedRole.family_caregiver');
  return t(`tasks.assignedRole.${task.assignedRole}`);
}

/** A task: glyph, title, time, assignee, status; threaded to the resource behind it. */
export function TaskCard({ task, timezone, caregivers, href, threaded = true, compact, onDone, doneBusy }: Props) {
  const { t } = useTranslation();
  const f = useFmt(timezone);
  const router = useRouter();
  // "You" means the patient; a caregiver reading the same task needs it named.
  const viewerIsCaregiver = useSession().session?.profile.role === 'caregiver';
  const Icon = categoryIcon[task.category];
  const resource = task.requiredResources[0];
  const tone = taskTone(task.status);
  const complete = task.status.endsWith('complete');

  const body = (
    <Surface tone="paper" padded={compact ? space.md : space.lg} style={[styles.card, complete && styles.complete]}>
      <View style={styles.row}>
        <Glyph icon={Icon} size={22} color={complete ? colors.good : colors.ink} />
        <View style={{ flex: 1, gap: 2 }}>
          <Body weight="medium" numberOfLines={2}>
            {f.title(task.titleKey, task.titleParams)}
          </Body>
          <Meta>
            {f.time(task.scheduledAt)} · {f.day(task.scheduledAt)} · {viewerIsCaregiver && task.assignedRole === 'patient' ? t('common.patient') : assigneeLabel(task, caregivers, t)}
          </Meta>
        </View>
        <Chip label={t(`taskStatus.${task.status}`)} tone={tone} dense />
      </View>
      {threaded && resource && !compact ? (
        <View style={styles.threadRow}>
          <Thread length={56} orientation="horizontal" live={task.status === 'awaiting_resources'} />
          <Chip
            label={t(`resources.${resource}`, { defaultValue: resource })}
            icon={resource === 'ride' ? Icons.Car : resource === 'meals' ? Icons.Utensils : task.category === 'medication' ? Icons.Pill : Icons.Package}
            tone={task.status === 'awaiting_resources' ? 'caution' : 'good'}
            dense
          />
        </View>
      ) : null}
      {task.blockedReason ? <Muted>{t('tasks.blockedBy', { reason: task.blockedReason })}</Muted> : null}
    </Surface>
  );
  const card = href ? (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.85 }}>
      {body}
    </Pressable>
  ) : (
    body
  );
  if (!onDone || !canTransition(task.status, 'reported_complete')) return card;
  return (
    <View style={{ gap: space.xs }}>
      {card}
      <Button label={t('reminders.quickDone')} variant="hero" compact icon={Icons.Check} loading={doneBusy} onPress={() => onDone(task)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  complete: { opacity: 0.72 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  threadRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: 34 },
});
