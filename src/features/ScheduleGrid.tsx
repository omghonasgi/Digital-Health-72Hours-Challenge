import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { HOUR_MS, RECOVERY_WINDOW_HOURS, fmtDateKey, ms } from '@/core/time';
import type { Caregiver, RecoveryTask, TaskStatus } from '@/core/types';
import { Body, Glyph, Icons, Meta, Surface, categoryIcon, colors, layout, radius, space, statusColor, type StatusTone } from '@/ui';
import { assigneeLabel } from './TaskCard';
import { useFmt } from './format';
import { taskTone } from './status';

/**
 * Schedule building blocks for the 72-hour calendar: an at-a-glance overview,
 * day tabs, and an hour grid of color-coded event blocks. Color always means
 * status (done / needs attention / coming up), never category; the glyph
 * carries the category.
 */

export type Bucket = 'done' | 'attention' | 'upcoming';

const ATTENTION = new Set<TaskStatus>(['missed', 'blocked', 'escalated', 'awaiting_resources']);

export const bucketOf = (s: TaskStatus): Bucket => (s.endsWith('complete') ? 'done' : ATTENTION.has(s) ? 'attention' : 'upcoming');

/** Status fills: the status colors at low alpha, so text stays ink. */
const fill: Record<StatusTone, string> = {
  good: 'rgba(62, 125, 90, 0.12)',
  caution: 'rgba(183, 131, 47, 0.16)',
  urgent: 'rgba(181, 72, 59, 0.14)',
  blue: 'rgba(63, 114, 175, 0.14)',
  neutral: colors.paper,
};
const stripe: Record<StatusTone, string> = { ...statusColor, neutral: colors.blueSoft };

export interface DayGroup {
  key: string;
  at: number;
  tasks: RecoveryTask[];
  done: number;
  attention: number;
}

export function groupByDay(tasks: RecoveryTask[], timezone: string): DayGroup[] {
  const m = new Map<string, DayGroup>();
  for (const task of tasks) {
    const key = fmtDateKey(task.scheduledAt, timezone);
    const cur = m.get(key) ?? { key, at: ms(task.scheduledAt), tasks: [], done: 0, attention: 0 };
    cur.tasks.push(task);
    const b = bucketOf(task.status);
    if (b === 'done') cur.done++;
    if (b === 'attention') cur.attention++;
    m.set(key, cur);
  }
  return [...m.values()].sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------------------
// Overview: up next, counts, 72-hour progress
// ---------------------------------------------------------------------------

export function ScheduleOverview({
  tasks,
  dischargeAt,
  timezone,
  now,
  caregivers,
  hrefFor,
  onBucket,
}: {
  tasks: RecoveryTask[];
  dischargeAt: string;
  timezone: string;
  now: string;
  caregivers?: Caregiver[];
  hrefFor: (t: RecoveryTask) => Href;
  onBucket: (b: Bucket) => void;
}) {
  const { t } = useTranslation();
  const f = useFmt(timezone);
  const router = useRouter();
  const nowMs = ms(now);
  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { done: 0, attention: 0, upcoming: 0 };
    for (const task of tasks) c[bucketOf(task.status)]++;
    return c;
  }, [tasks]);
  const next = useMemo(() => {
    const open = tasks.filter((x) => bucketOf(x.status) !== 'done');
    return open.find((x) => ms(x.scheduledAt) >= nowMs) ?? open[0];
  }, [tasks, nowMs]);

  return (
    <View style={{ gap: space.md }}>
      {next ? (
        <Pressable onPress={() => router.push(hrefFor(next))} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.9 }}>
          <Surface tone="blueDeep" padded style={styles.next}>
            <View style={styles.nextIcon}>
              <Glyph icon={categoryIcon[next.category]} size={26} color={colors.canvas} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Meta color={colors.canvasMuted}>
                {t('calendar.next').toUpperCase()} · {f.day(next.scheduledAt)}
              </Meta>
              <Body size="large" color={colors.canvas} numberOfLines={2}>
                {f.title(next.titleKey, next.titleParams)}
              </Body>
              <Meta color={colors.canvasMuted}>{assigneeLabel(next, caregivers, t)}</Meta>
            </View>
            <Body color={colors.canvas} style={styles.nextTime}>
              {f.time(next.scheduledAt)}
            </Body>
          </Surface>
        </Pressable>
      ) : (
        <Surface tone="paper" padded style={styles.next}>
          <Glyph icon={Icons.Check} size={24} color={colors.good} />
          <Body>{t('calendar.allDone')}</Body>
        </Surface>
      )}

      <View style={styles.stats}>
        <StatTile n={counts.done} label={t('calendar.stats.done')} tone="good" icon={Icons.Check} onPress={() => onBucket('done')} />
        <StatTile n={counts.upcoming} label={t('calendar.stats.upcoming')} tone="blue" icon={Icons.Calendar} onPress={() => onBucket('upcoming')} />
        <StatTile n={counts.attention} label={t('calendar.stats.attention')} tone={counts.attention ? 'urgent' : 'neutral'} icon={Icons.AlertTriangle} onPress={() => onBucket('attention')} />
      </View>

      <WindowBar tasks={tasks} dischargeAt={dischargeAt} now={nowMs} />
    </View>
  );
}

function StatTile({ n, label, tone, icon, onPress }: { n: number; label: string; tone: StatusTone; icon: typeof Icons.Check; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${n}`} style={({ pressed }) => [styles.statWrap, pressed && { opacity: 0.85 }]}>
      <View style={[styles.stat, { backgroundColor: fill[tone], borderLeftColor: stripe[tone] }]}>
        <View style={styles.statTop}>
          <Body style={styles.statNum}>{String(n)}</Body>
          <Glyph icon={icon} size={18} color={stripe[tone]} />
        </View>
        <Meta color={colors.ink} numberOfLines={2}>
          {label}
        </Meta>
      </View>
    </Pressable>
  );
}

/** The 72 hours as one bar: elapsed fill, a now marker, and a dot per task colored by status. */
function WindowBar({ tasks, dischargeAt, now }: { tasks: RecoveryTask[]; dischargeAt: string; now: number }) {
  const { t } = useTranslation();
  const start = ms(dischargeAt);
  const span = RECOVERY_WINDOW_HOURS * HOUR_MS;
  const pct = (x: number) => `${Math.min(100, Math.max(0, ((x - start) / span) * 100))}%` as const;
  const elapsedH = (now - start) / HOUR_MS;
  const label =
    elapsedH < 0
      ? t('calendar.progress.before', { hours: Math.ceil(-elapsedH) })
      : elapsedH >= RECOVERY_WINDOW_HOURS
        ? t('calendar.progress.after')
        : t('calendar.progress.during', { n: Math.floor(elapsedH) });

  return (
    <Surface tone="paper" padded style={{ gap: space.sm }}>
      <View style={styles.barHead}>
        <Meta color={colors.ink}>{t('calendar.window')}</Meta>
        <Meta color={elapsedH >= 0 && elapsedH < RECOVERY_WINDOW_HOURS ? colors.blue : colors.inkMuted}>{label}</Meta>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: pct(now) }]} />
        {[24, 48].map((h) => (
          <View key={h} style={[styles.barTick, { left: pct(start + h * HOUR_MS) }]} />
        ))}
        {tasks.map((task) => (
          <View key={task.id} style={[styles.barDot, { left: pct(ms(task.scheduledAt)), backgroundColor: stripe[taskTone(task.status)] }]} />
        ))}
        {elapsedH >= 0 && elapsedH < RECOVERY_WINDOW_HOURS ? <View style={[styles.barNow, { left: pct(now) }]} /> : null}
      </View>
      <View style={styles.barHead}>
        {[0, 24, 48, 72].map((h) => (
          <Meta key={h}>{h}h</Meta>
        ))}
      </View>
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// Day tabs
// ---------------------------------------------------------------------------

export function DayTabs({ days, selected, onSelect, timezone }: { days: DayGroup[]; selected: number; onSelect: (i: number) => void; timezone: string }) {
  const { t } = useTranslation();
  const f = useFmt(timezone);
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {days.map((d, i) => {
        const on = i === selected;
        const fg = on ? colors.canvas : colors.ink;
        const muted = on ? colors.canvasMuted : colors.inkMuted;
        return (
          <Pressable
            key={d.key}
            onPress={() => onSelect(i)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${t('calendar.day', { n: i + 1 })}, ${f.dayLong(d.at)}, ${t('calendar.dayCount', { done: d.done, total: d.tasks.length })}`}
            style={({ pressed }) => [styles.tab, { backgroundColor: on ? colors.blue : colors.paper }, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.tabHead}>
              <Meta color={muted}>{t('calendar.day', { n: i + 1 })}</Meta>
              {d.attention ? <View style={[styles.tabAlert, { borderColor: on ? colors.blue : colors.paper }]} /> : null}
            </View>
            <Body weight="medium" color={fg} numberOfLines={1}>
              {f.day(d.at)}
            </Body>
            <View style={[styles.tabBar, { backgroundColor: on ? 'rgba(242, 244, 247, 0.3)' : colors.inkFaint }]}>
              <View style={[styles.tabBarFill, { width: `${d.tasks.length ? (d.done / d.tasks.length) * 100 : 0}%`, backgroundColor: on ? colors.canvas : colors.good }]} />
            </View>
            <Meta color={muted}>{t('calendar.dayCount', { done: d.done, total: d.tasks.length })}</Meta>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Hour grid for one day
// ---------------------------------------------------------------------------

type Segment = { kind: 'hour'; h: number; items: RecoveryTask[] } | { kind: 'empty'; h: number } | { kind: 'quiet'; from: number; to: number };

export function DayGrid({ day, timezone, now, caregivers, hrefFor }: { day: DayGroup; timezone: string; now: string; caregivers?: Caregiver[]; hrefFor: (t: RecoveryTask) => Href }) {
  const { t } = useTranslation();
  const f = useFmt(timezone);
  const { width } = useWindowDimensions();
  const wide = width >= layout.wideBreakpoint;
  const nowMs = ms(now);

  const segments = useMemo(() => {
    const byHour = new Map<number, RecoveryTask[]>();
    for (const task of day.tasks) {
      const h = Math.floor(ms(task.scheduledAt) / HOUR_MS);
      byHour.set(h, [...(byHour.get(h) ?? []), task]);
    }
    const hours = [...byHour.keys()];
    const out: Segment[] = [];
    if (!hours.length) return out;
    let run: number[] = [];
    const flush = () => {
      if (run.length === 1) out.push({ kind: 'empty', h: run[0] });
      else if (run.length > 1) out.push({ kind: 'quiet', from: run[0], to: run[run.length - 1] + 1 });
      run = [];
    };
    for (let h = Math.min(...hours); h <= Math.max(...hours); h++) {
      const items = byHour.get(h);
      if (items) {
        flush();
        out.push({ kind: 'hour', h, items: items.sort((a, b) => ms(a.scheduledAt) - ms(b.scheduledAt)) });
      } else run.push(h);
    }
    flush();
    return out;
  }, [day.tasks]);

  // The now line sits before the first segment that starts after now, on today only.
  const startOf = (s: Segment) => (s.kind === 'quiet' ? s.from : s.h) * HOUR_MS;
  const isToday = fmtDateKey(nowMs, timezone) === day.key;
  const nowAt = isToday && segments.length && nowMs >= startOf(segments[0]) ? segments.findIndex((s) => startOf(s) > nowMs) : -2;

  const nowLine = (
    <View key="now" style={styles.nowRow} accessibilityLabel={`${t('calendar.now')} ${f.time(nowMs)}`}>
      <View style={styles.gutter}>
        <Meta color={colors.urgent}>{f.time(nowMs)}</Meta>
      </View>
      <View style={styles.nowDot} />
      <View style={styles.nowLine} />
    </View>
  );

  return (
    <View style={styles.grid}>
      {segments.map((s, i) => (
        <React.Fragment key={s.kind === 'quiet' ? `q${s.from}` : `h${s.h}`}>
          {i === nowAt ? nowLine : null}
          {s.kind === 'hour' ? (
            <View style={styles.hourRow}>
              <View style={styles.gutter}>
                <Body weight="medium">{f.time(s.h * HOUR_MS)}</Body>
              </View>
              <View style={styles.track}>
                <View style={styles.trackLine} />
                <View style={styles.lanes}>
                  {s.items.map((task) => (
                    <EventBlock key={task.id} task={task} timezone={timezone} caregivers={caregivers} href={hrefFor(task)} basis={s.items.length === 1 ? '100%' : wide ? '31%' : '47%'} />
                  ))}
                </View>
              </View>
            </View>
          ) : s.kind === 'empty' ? (
            <View style={styles.emptyRow}>
              <View style={styles.gutter}>
                <Meta>{f.time(s.h * HOUR_MS)}</Meta>
              </View>
              <View style={[styles.trackLine, { flex: 1 }]} />
            </View>
          ) : (
            <View style={styles.quietRow}>
              <View style={styles.gutter}>
                <Meta>{f.time(s.from * HOUR_MS)}</Meta>
              </View>
              <View style={styles.quietBand}>
                <Meta>
                  {t('calendar.quiet')} · {f.time(s.from * HOUR_MS)}–{f.time(s.to * HOUR_MS)}
                </Meta>
              </View>
            </View>
          )}
        </React.Fragment>
      ))}
      {nowAt === -1 ? nowLine : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Event block
// ---------------------------------------------------------------------------

export function EventBlock({
  task,
  timezone,
  caregivers,
  href,
  basis = '100%',
}: {
  task: RecoveryTask;
  timezone: string;
  caregivers?: Caregiver[];
  href: Href;
  basis?: `${number}%`;
}) {
  const { t } = useTranslation();
  const f = useFmt(timezone);
  const router = useRouter();
  const tone = taskTone(task.status);
  const bucket = bucketOf(task.status);
  const who = assigneeLabel(task, caregivers, t);
  const status = t(`taskStatus.${task.status}`);
  const title = f.title(task.titleKey, task.titleParams);

  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      accessibilityLabel={`${f.time(task.scheduledAt)}, ${title}, ${who}, ${status}`}
      style={({ pressed }) => [{ flexBasis: basis, flexGrow: 1, minWidth: 140 }, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.event, { backgroundColor: fill[tone], borderLeftColor: stripe[tone] }, bucket === 'done' && { opacity: 0.75 }]}>
        <View style={styles.eventHead}>
          <Glyph icon={categoryIcon[task.category]} size={18} color={colors.ink} />
          <Meta color={colors.ink} style={{ flex: 1 }}>
            {f.time(task.scheduledAt)}
          </Meta>
          {bucket === 'done' ? (
            <Glyph icon={Icons.Check} size={18} color={colors.good} />
          ) : bucket === 'attention' ? (
            <Glyph icon={Icons.AlertTriangle} size={18} color={stripe[tone]} />
          ) : null}
        </View>
        <Body weight="medium" numberOfLines={3} style={bucket === 'done' && styles.doneText}>
          {title}
        </Body>
        <View style={styles.eventFoot}>
          <View style={styles.avatar}>
            <Meta color={colors.canvas} style={styles.avatarText}>
              {initials(who)}
            </Meta>
          </View>
          <Meta numberOfLines={1} style={{ flex: 1 }}>
            {who}
          </Meta>
        </View>
        {bucket === 'attention' ? (
          <Meta color={colors.ink} numberOfLines={2}>
            {task.blockedReason ? t('tasks.blockedBy', { reason: task.blockedReason }) : status}
          </Meta>
        ) : null}
      </View>
    </Pressable>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

const GUTTER = 60;

const styles = StyleSheet.create({
  next: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  nextIcon: { width: 48, height: 48, borderRadius: radius.round, backgroundColor: 'rgba(242, 244, 247, 0.14)', alignItems: 'center', justifyContent: 'center' },
  nextTime: { fontSize: 28, lineHeight: 34 },

  stats: { flexDirection: 'row', gap: space.sm },
  statWrap: { flex: 1 },
  stat: { borderRadius: radius.card, borderLeftWidth: 4, padding: space.md, gap: 2 },
  statTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statNum: { fontSize: 28, lineHeight: 34 },

  barHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bar: { height: 20, borderRadius: radius.round, backgroundColor: colors.canvas, overflow: 'hidden', justifyContent: 'center' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(63, 114, 175, 0.22)' },
  barTick: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: colors.inkFaint },
  barDot: { position: 'absolute', width: 6, height: 6, marginLeft: -3, borderRadius: 3 },
  barNow: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: colors.urgent },

  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tab: { flexGrow: 1, flexBasis: 120, borderRadius: radius.card, paddingVertical: space.sm, paddingHorizontal: space.md, gap: 4, minHeight: 44 },
  tabHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tabAlert: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.urgent, borderWidth: 2 },
  tabBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  tabBarFill: { height: 4, borderRadius: 2 },

  grid: { gap: 0 },
  gutter: { width: GUTTER, paddingTop: 2 },
  hourRow: { flexDirection: 'row', minHeight: 64 },
  track: { flex: 1, paddingBottom: space.md },
  trackLine: { height: 1, backgroundColor: colors.inkFaint, alignSelf: 'stretch', marginTop: 12, marginBottom: space.sm },
  lanes: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  emptyRow: { flexDirection: 'row', alignItems: 'flex-start', height: 32 },
  quietRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm },
  quietBand: { flex: 1, borderRadius: radius.card, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.inkFaint, paddingVertical: space.sm, paddingHorizontal: space.md },

  nowRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.xs },
  nowDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.urgent, marginLeft: -5 },
  nowLine: { flex: 1, height: 2, backgroundColor: colors.urgent },

  event: { borderRadius: radius.card, borderLeftWidth: 4, paddingVertical: space.sm, paddingHorizontal: space.md, gap: 4 },
  eventHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  eventFoot: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  avatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.blueDeep, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 10, lineHeight: 12 },
  doneText: { textDecorationLine: 'line-through' },
});
