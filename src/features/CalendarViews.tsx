import React, { useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { HOUR_MS, fmtDateKey, ms } from '@/core/time';
import type { CalendarConflict, Caregiver, RecoveryTask, TaskStatus } from '@/core/types';
import { Body, Button, Card, Chip, Glyph, Icons, Meta, Muted, Row, Section, StatusDot, Thread, colors, layout, space } from '@/ui';
import { TaskCard } from './TaskCard';
import { useFmt } from './format';

export type CalendarMode = 'timeline' | 'days' | 'list';

interface Props {
  tasks: RecoveryTask[];
  conflicts: CalendarConflict[];
  dischargeAt: string;
  timezone: string;
  caregivers?: Caregiver[];
  now: string;
  hrefFor: (task: RecoveryTask) => Href;
  reviewItems?: { instructionId: string; reasonKey: string }[];
  conflictRoute?: (route?: string) => Href;
}

const STATUS_FILTERS: (TaskStatus | 'all' | 'open')[] = ['all', 'open', 'awaiting_resources', 'blocked', 'missed', 'verified_complete'];

/**
 * Three views over the same task list. Time is always rendered in the
 * patient's zone from UTC instants, so a DST change during the 72 hours
 * shifts labels, never the tasks.
 */
export function CalendarViews({ tasks, conflicts, dischargeAt, timezone, caregivers, now, hrefFor, reviewItems, conflictRoute }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const f = useFmt(timezone);
  const [mode, setMode] = useState<CalendarMode>('timeline');
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const sorted = useMemo(() => tasks.slice().sort((a, b) => ms(a.scheduledAt) - ms(b.scheduledAt)), [tasks]);
  const start = ms(dischargeAt);

  return (
    <View style={{ gap: space.xl }}>
      <Row wrap style={{ justifyContent: 'space-between' }}>
        <Row>
          {(['timeline', 'days', 'list'] as CalendarMode[]).map((m) => (
            <Chip key={m} label={t(`calendar.${m}`)} icon={m === 'timeline' ? Icons.Activity : m === 'days' ? Icons.Calendar : Icons.LayoutGrid} selected={mode === m} onPress={() => setMode(m)} />
          ))}
        </Row>
        <Meta>{t('calendar.legend')}</Meta>
      </Row>

      {conflicts.length ? (
        <Section title={t('calendar.conflicts')} aside={<Glyph icon={Icons.AlertTriangle} size={20} color={colors.caution} />}>
          {conflicts.map((c) => (
            <Card key={c.id}>
              <Row style={{ alignItems: 'flex-start' }}>
                <StatusDot tone="caution" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Body>{t(c.messageKey, { ...c.messageParams, defaultValue: c.message })}</Body>
                  <Meta>{f.range(c.windowStart, c.windowEnd)}</Meta>
                </View>
              </Row>
              <Row wrap>
                {c.actions.slice(0, 2).map((a) => (
                  <Button key={a.key} label={t(a.key)} variant="ghost" compact onPress={() => router.push(conflictRoute ? conflictRoute(a.route) : ((a.route ?? '/patient/resources') as Href))} />
                ))}
                {c.taskId ? <Button label={t('tasks.detail')} variant="quiet" compact onPress={() => router.push(hrefFor(tasks.find((x) => x.id === c.taskId)!))} /> : null}
              </Row>
            </Card>
          ))}
        </Section>
      ) : null}

      {reviewItems?.length ? (
        <Card>
          <Row>
            <StatusDot tone="urgent" />
            <Body weight="medium">{t('review.reviewItems')}</Body>
          </Row>
          {reviewItems.map((r) => (
            <Muted key={`${r.instructionId}-${r.reasonKey}`}>{t(r.reasonKey)}</Muted>
          ))}
        </Card>
      ) : null}

      {sorted.length === 0 ? (
        <Card>
          <Muted>{t('calendar.notActive')}</Muted>
        </Card>
      ) : mode === 'timeline' ? (
        <Timeline tasks={sorted} start={start} timezone={timezone} now={now} caregivers={caregivers} hrefFor={hrefFor} />
      ) : mode === 'days' ? (
        <Days tasks={sorted} start={start} timezone={timezone} caregivers={caregivers} hrefFor={hrefFor} />
      ) : (
        <View style={{ gap: space.md }}>
          <Row wrap>
            {STATUS_FILTERS.map((s) => (
              <Chip key={s} label={s === 'all' ? t('coordinator.all') : s === 'open' ? t('home.unresolved') : t(`taskStatus.${s}`)} selected={filter === s} onPress={() => setFilter(s)} dense />
            ))}
          </Row>
          {sorted
            .filter((x) => (filter === 'all' ? true : filter === 'open' ? !x.status.endsWith('complete') : x.status === filter))
            .map((task) => (
              <TaskCard key={task.id} task={task} timezone={timezone} caregivers={caregivers} href={hrefFor(task)} compact />
            ))}
        </View>
      )}
    </View>
  );
}

function Timeline({ tasks, start, timezone, now, caregivers, hrefFor }: { tasks: RecoveryTask[]; start: number; timezone: string; now: string; caregivers?: Caregiver[]; hrefFor: (t: RecoveryTask) => Href }) {
  const { t } = useTranslation();
  const f = useFmt(timezone);
  const nowMs = ms(now);
  // Group by the hour offset from discharge; empty hours collapse.
  const groups = useMemo(() => {
    const m = new Map<number, RecoveryTask[]>();
    for (const task of tasks) {
      const h = Math.floor((ms(task.scheduledAt) - start) / HOUR_MS);
      m.set(h, [...(m.get(h) ?? []), task]);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [tasks, start]);
  const nowIndex = nowMs >= start ? groups.findIndex(([h]) => nowMs < start + h * HOUR_MS) : -1;
  return (
    <View>
      {groups.map(([h, items], idx) => {
        const at = start + h * HOUR_MS;
        const showNow = idx === nowIndex;
        const dayBoundary = idx === 0 || fmtDateKey(at, timezone) !== fmtDateKey(start + groups[idx - 1][0] * HOUR_MS, timezone);
        return (
          <View key={h}>
            {dayBoundary ? (
              <Row style={styles.dayHeader}>
                <Chip label={t('calendar.day', { n: Math.floor(h / 24) + 1 })} dense />
                <Meta>{f.dayLong(at)}</Meta>
              </Row>
            ) : null}
            {showNow ? (
              <Row style={styles.nowRow}>
                <View style={styles.nowDot} />
                <Meta color={colors.blue}>{t('common.today')} · {f.time(nowMs)}</Meta>
              </Row>
            ) : null}
            <View style={styles.hourRow}>
              <View style={styles.hourCol}>
                <Body weight="medium">{f.time(at)}</Body>
                <Meta>{t('calendar.hourLabel', { n: h })}</Meta>
                <Thread length={Math.max(48, items.length * 96)} live={items.some((x) => !x.status.endsWith('complete') && x.status !== 'missed')} />
              </View>
              <View style={{ flex: 1, gap: space.sm }}>
                {items.map((task) => (
                  <TaskCard key={task.id} task={task} timezone={timezone} caregivers={caregivers} href={hrefFor(task)} />
                ))}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Days({ tasks, start, timezone, caregivers, hrefFor }: { tasks: RecoveryTask[]; start: number; timezone: string; caregivers?: Caregiver[]; hrefFor: (t: RecoveryTask) => Href }) {
  const { t } = useTranslation();
  const f = useFmt(timezone);
  const { width } = useWindowDimensions();
  const wide = width >= layout.wideBreakpoint;
  const days = useMemo(() => {
    const m = new Map<string, { key: string; at: number; tasks: RecoveryTask[] }>();
    for (const task of tasks) {
      const key = fmtDateKey(task.scheduledAt, timezone);
      const cur = m.get(key) ?? { key, at: ms(task.scheduledAt), tasks: [] };
      cur.tasks.push(task);
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => a.at - b.at);
  }, [tasks, timezone]);
  const [selected, setSelected] = useState(0);
  const dayIndex = (at: number) => Math.floor((at - start) / (24 * HOUR_MS)) + 1;
  const render = (d: (typeof days)[number]) => (
    <View key={d.key} style={[styles.dayCol, wide && { flex: 1 }]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Chip label={t('calendar.day', { n: Math.max(1, dayIndex(d.at)) })} dense />
        <Meta>{f.dayLong(d.at)}</Meta>
      </Row>
      {d.tasks.map((task) => (
        <TaskCard key={task.id} task={task} timezone={timezone} caregivers={caregivers} href={hrefFor(task)} compact />
      ))}
    </View>
  );
  if (wide) return <View style={styles.daysWide}>{days.map(render)}</View>;
  return (
    <View style={{ gap: space.md }}>
      <Row wrap>
        {days.map((d, i) => (
          <Chip key={d.key} label={`${t('calendar.day', { n: Math.max(1, dayIndex(d.at)) })} · ${f.day(d.at)}`} selected={selected === i} onPress={() => setSelected(i)} dense />
        ))}
      </Row>
      {days[selected] ? render(days[selected]) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dayHeader: { paddingVertical: space.md, gap: space.md },
  nowRow: { paddingVertical: space.xs, gap: space.sm },
  nowDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.blue },
  hourRow: { flexDirection: 'row', gap: space.md, paddingBottom: space.lg },
  hourCol: { width: 72, alignItems: 'flex-start', gap: 2 },
  daysWide: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  dayCol: { gap: space.sm },
});
