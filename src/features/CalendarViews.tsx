import React, { useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { fmtDateKey, ms } from '@/core/time';
import type { CalendarConflict, Caregiver, RecoveryTask, TaskStatus } from '@/core/types';
import { Body, Button, Card, Chip, Glyph, Icons, Meta, Muted, Row, Section, StatusDot, colors, layout, radius, space } from '@/ui';
import { DayGrid, DayTabs, EventBlock, ScheduleOverview, bucketOf, groupByDay, type Bucket, type DayGroup } from './ScheduleGrid';
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

type ListFilter = TaskStatus | 'all' | 'open' | Bucket;
const STATUS_FILTERS: ListFilter[] = ['all', 'open', 'attention', 'upcoming', 'done', 'awaiting_resources', 'blocked', 'missed', 'verified_complete'];

const matches = (x: RecoveryTask, filter: ListFilter) =>
  filter === 'all'
    ? true
    : filter === 'open'
      ? !x.status.endsWith('complete')
      : filter === 'attention' || filter === 'upcoming' || filter === 'done'
        ? bucketOf(x.status) === filter
        : x.status === filter;

/**
 * Three views over the same task list: an hour-grid schedule, day columns,
 * and a filterable list. Time is always rendered in the patient's zone from
 * UTC instants, so a DST change during the 72 hours shifts labels, never the
 * tasks.
 */
export function CalendarViews({ tasks, conflicts, dischargeAt, timezone, caregivers, now, hrefFor, reviewItems, conflictRoute }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const f = useFmt(timezone);
  const [mode, setMode] = useState<CalendarMode>('timeline');
  const [filter, setFilter] = useState<ListFilter>('all');
  const sorted = useMemo(() => tasks.slice().sort((a, b) => ms(a.scheduledAt) - ms(b.scheduledAt)), [tasks]);
  const days = useMemo(() => groupByDay(sorted, timezone), [sorted, timezone]);
  const todayIndex = days.findIndex((d) => d.key === fmtDateKey(now, timezone));
  const [picked, setPicked] = useState<number | null>(null);
  const [allConflicts, setAllConflicts] = useState(false);
  const selected = Math.min(picked ?? Math.max(0, todayIndex), Math.max(0, days.length - 1));

  return (
    <View style={{ gap: space.xl }}>
      {sorted.length ? (
        <ScheduleOverview
          tasks={sorted}
          dischargeAt={dischargeAt}
          timezone={timezone}
          now={now}
          caregivers={caregivers}
          hrefFor={hrefFor}
          onBucket={(b) => {
            setFilter(b);
            setMode('list');
          }}
        />
      ) : null}

      <Row wrap style={{ justifyContent: 'space-between' }}>
        <Row>
          {(['timeline', 'days', 'list'] as CalendarMode[]).map((m) => (
            <Chip key={m} label={t(`calendar.${m}`)} icon={m === 'timeline' ? Icons.Activity : m === 'days' ? Icons.Calendar : Icons.LayoutGrid} selected={mode === m} onPress={() => setMode(m)} />
          ))}
        </Row>
        <Meta>{t('calendar.legend')}</Meta>
      </Row>

      {conflicts.length ? (
        <Section
          title={`${t('calendar.conflicts')} · ${conflicts.length}`}
          aside={
            conflicts.length > 1 ? (
              <Button label={allConflicts ? t('calendar.hide') : `${t('common.viewAll')} (${conflicts.length})`} variant="quiet" compact onPress={() => setAllConflicts((v) => !v)} />
            ) : (
              <Glyph icon={Icons.AlertTriangle} size={20} color={colors.caution} />
            )
          }
        >
          {(allConflicts ? conflicts : conflicts.slice(0, 1)).map((c) => (
            <View key={c.id} style={styles.conflict}>
              <Row style={{ alignItems: 'flex-start' }}>
                <Glyph icon={Icons.AlertTriangle} size={18} color={colors.caution} />
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
            </View>
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
        <View style={{ gap: space.lg }}>
          <DayTabs days={days} selected={selected} onSelect={setPicked} timezone={timezone} />
          {days[selected] ? (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Body weight="medium">{f.dayLong(days[selected].at)}</Body>
                <Meta>{t('calendar.dayCount', { done: days[selected].done, total: days[selected].tasks.length })}</Meta>
              </Row>
              <DayGrid day={days[selected]} timezone={timezone} now={now} caregivers={caregivers} hrefFor={hrefFor} />
            </Card>
          ) : null}
        </View>
      ) : mode === 'days' ? (
        <Days days={days} selected={selected} onSelect={setPicked} timezone={timezone} caregivers={caregivers} hrefFor={hrefFor} />
      ) : (
        <View style={{ gap: space.md }}>
          <Row wrap>
            {STATUS_FILTERS.map((s) => (
              <Chip key={s} label={s === 'all' ? t('coordinator.all') : s === 'open' ? t('home.unresolved') : s === 'attention' || s === 'upcoming' || s === 'done' ? t(`calendar.stats.${s}`) : t(`taskStatus.${s}`)} selected={filter === s} onPress={() => setFilter(s)} dense />
            ))}
          </Row>
          {sorted.filter((x) => matches(x, filter)).length === 0 ? (
            <Card>
              <Muted>{t('calendar.noTasks')}</Muted>
            </Card>
          ) : null}
          {sorted
            .filter((x) => matches(x, filter))
            .map((task) => (
              <TaskCard key={task.id} task={task} timezone={timezone} caregivers={caregivers} href={hrefFor(task)} compact />
            ))}
        </View>
      )}
    </View>
  );
}

function Days({ days, selected, onSelect, timezone, caregivers, hrefFor }: { days: DayGroup[]; selected: number; onSelect: (i: number) => void; timezone: string; caregivers?: Caregiver[]; hrefFor: (t: RecoveryTask) => Href }) {
  const { t } = useTranslation();
  const f = useFmt(timezone);
  const { width } = useWindowDimensions();
  const wide = width >= layout.wideBreakpoint;
  const column = (d: DayGroup, i: number) => (
    <View key={d.key} style={[styles.dayCol, wide && { flex: 1 }]}>
      <View style={styles.dayColHead}>
        <Meta color={colors.canvasMuted}>{t('calendar.day', { n: i + 1 })}</Meta>
        <Body weight="medium" color={colors.canvas}>
          {f.day(d.at)}
        </Body>
        <Meta color={colors.canvasMuted}>{t('calendar.dayCount', { done: d.done, total: d.tasks.length })}</Meta>
      </View>
      {d.tasks.map((task) => (
        <EventBlock key={task.id} task={task} timezone={timezone} caregivers={caregivers} href={hrefFor(task)} />
      ))}
    </View>
  );
  if (wide) return <View style={styles.daysWide}>{days.map(column)}</View>;
  return (
    <View style={{ gap: space.md }}>
      <DayTabs days={days} selected={selected} onSelect={onSelect} timezone={timezone} />
      {days[selected] ? column(days[selected], selected) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  conflict: { gap: space.sm, padding: space.md, borderRadius: radius.card, borderLeftWidth: 4, borderLeftColor: colors.caution, backgroundColor: 'rgba(183, 131, 47, 0.12)' },
  daysWide: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  dayCol: { gap: space.sm },
  dayColHead: { backgroundColor: colors.blueDeep, borderRadius: radius.card, paddingVertical: space.sm, paddingHorizontal: space.md, gap: 2 },
});
