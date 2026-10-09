import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { Meta, TextField, space } from '@/ui';

interface Props {
  /** ISO instant (UTC). */
  value?: string;
  onChange: (iso: string | undefined) => void;
  /** Zone the person is typing in. The instant is stored in UTC, so DST shifts never move a task. */
  timezone: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Two mono inputs (date, 24h time) interpreted in the given zone. Typed text
 * is the only source of truth: nothing is inferred from the device clock.
 */
export function DateTimeField({ value, onChange, timezone }: Props) {
  const [date, setDate] = useState(value ? formatInTimeZone(new Date(value), timezone, 'yyyy-MM-dd') : '');
  const [time, setTime] = useState(value ? formatInTimeZone(new Date(value), timezone, 'HH:mm') : '');
  // Re-sync the text when the external value or zone changes (state adjusted during render, per React docs).
  const [synced, setSynced] = useState({ value, timezone });
  if (synced.value !== value || synced.timezone !== timezone) {
    setSynced({ value, timezone });
    if (value) {
      const d = formatInTimeZone(new Date(value), timezone, 'yyyy-MM-dd');
      const tm = formatInTimeZone(new Date(value), timezone, 'HH:mm');
      if (!DATE_RE.test(date) || date !== d) setDate(d);
      if (!TIME_RE.test(time) || time !== tm) setTime(tm);
    }
  }

  const emit = (d: string, tm: string) => {
    if (DATE_RE.test(d) && TIME_RE.test(tm)) {
      const inst = fromZonedTime(`${d}T${tm}:00`, timezone);
      onChange(Number.isNaN(inst.getTime()) ? undefined : inst.toISOString());
    } else onChange(undefined);
  };

  return (
    <View style={styles.row}>
      <View style={{ flex: 3, gap: space.xs }}>
        <TextField
          value={date}
          onChangeText={(v) => {
            setDate(v);
            emit(v, time);
          }}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          inputMode="numeric"
        />
        <Meta>YYYY-MM-DD</Meta>
      </View>
      <View style={{ flex: 2, gap: space.xs }}>
        <TextField
          value={time}
          onChangeText={(v) => {
            setTime(v);
            emit(date, v);
          }}
          placeholder="HH:MM"
          autoCapitalize="none"
          inputMode="numeric"
        />
        <Meta>24h · {timezone}</Meta>
      </View>
    </View>
  );
}

export const COMMON_TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Puerto_Rico'];

export function deviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';
  } catch {
    return 'America/Chicago';
  }
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: space.md } });
