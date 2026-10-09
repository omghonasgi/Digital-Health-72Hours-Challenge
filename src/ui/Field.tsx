import React from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View, type TextInputProps } from 'react-native';
import { Chip } from './Chip';
import { Body, Meta, Muted } from './Text';
import { colors, fonts, radius, space, tapMin, tabular } from './theme';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  optional?: boolean;
  optionalLabel?: string;
}

export function Field({ label, hint, error, children, optional, optionalLabel }: FieldProps) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Body weight="medium">{label}</Body>
        {optional ? <Meta>{optionalLabel ?? 'optional'}</Meta> : null}
      </View>
      {hint ? <Muted>{hint}</Muted> : null}
      {children}
      {error ? (
        <View style={styles.errorRow}>
          <View style={[styles.dot, { backgroundColor: colors.urgent }]} />
          <Body>{error}</Body>
        </View>
      ) : null}
    </View>
  );
}

export function TextField(props: TextInputProps & { multiline?: boolean }) {
  return (
    <TextInput
      placeholderTextColor={colors.inkMuted}
      {...props}
      style={[styles.input, tabular, props.multiline && styles.multiline, props.style]}
    />
  );
}

export function NumberField({ value, onChange, ...rest }: { value: number | undefined; onChange: (n: number | undefined) => void } & Omit<TextInputProps, 'value' | 'onChangeText' | 'onChange'>) {
  return (
    <TextField
      {...rest}
      keyboardType="decimal-pad"
      inputMode="decimal"
      value={value === undefined || Number.isNaN(value) ? '' : String(value)}
      onChangeText={(t) => {
        const n = Number(t.replace(/[^0-9.]/g, ''));
        onChange(t.trim() === '' ? undefined : Number.isNaN(n) ? undefined : n);
      }}
    />
  );
}

interface ChoiceProps<T extends string> {
  options: { value: T; label: string }[];
  value?: T;
  onChange: (v: T) => void;
}

/** Single select as chips: chips re-color in place, no dropdowns. */
export function Choice<T extends string>({ options, value, onChange }: ChoiceProps<T>) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

export function MultiChoice<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return <Chip key={o.value} label={o.label} selected={on} onPress={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])} />;
      })}
    </View>
  );
}

export function YesNo({ value, onChange, labels }: { value?: boolean; onChange: (v: boolean) => void; labels: { yes: string; no: string } }) {
  return (
    <Choice
      options={[
        { value: 'yes', label: labels.yes },
        { value: 'no', label: labels.no },
      ]}
      value={value === undefined ? undefined : value ? 'yes' : 'no'}
      onChange={(v) => onChange(v === 'yes')}
    />
  );
}

export function ToggleRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.toggleRow} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Body>{label}</Body>
        {hint ? <Meta>{hint}</Meta> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.blue, false: colors.inkFaint }} thumbColor={colors.canvas} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.sm },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, justifyContent: 'space-between' },
  input: {
    fontFamily: fonts.mono,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
    backgroundColor: colors.paper,
    borderRadius: radius.chip,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: tapMin + 4,
    borderWidth: 1,
    borderColor: colors.inkFaint,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: tapMin, paddingVertical: space.xs },
});
