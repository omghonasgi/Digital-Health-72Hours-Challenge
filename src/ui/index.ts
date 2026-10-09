import { Platform } from 'react-native';
import { Button } from './Button';
import { Chip, StatusDot } from './Chip';
import { ConfirmSheet } from './ConfirmSheet';
import { Choice, Field, MultiChoice, NumberField, TextField, ToggleRow, YesNo } from './Field';
import { Grain } from './Grain';
import { Provenance } from './Provenance';
import { Hairline, KeyValue, Row, Screen, Section } from './Screen';
import { Shell } from './Shell';
import { Stamp } from './Stamp';
import { Card, Surface } from './Surface';
import { Body, Display, Meta, Muted, Num } from './Text';
import { Thread } from './Thread';

export const CareBridgeUI = {
  Button,
  Chip,
  StatusDot,
  ConfirmSheet,
  Field,
  TextField,
  NumberField,
  Choice,
  MultiChoice,
  YesNo,
  ToggleRow,
  Grain,
  Provenance,
  Screen,
  Section,
  Row,
  KeyValue,
  Hairline,
  Shell,
  Stamp,
  Surface,
  Card,
  Body,
  Display,
  Meta,
  Muted,
  Num,
  Thread,
};

/**
 * skills.md: every component registers on window.CareBridgeUI so an agent
 * layer can spawn it inline with identical pixels. Web only; no-op elsewhere.
 */
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  (window as unknown as { CareBridgeUI: typeof CareBridgeUI }).CareBridgeUI = CareBridgeUI;
}

export * from './Button';
export * from './Chip';
export * from './ConfirmSheet';
export * from './Field';
export * from './Grain';
export * from './Icons';
export * from './Provenance';
export * from './Screen';
export * from './Shell';
export * from './Stamp';
export * from './Surface';
export * from './Text';
export * from './Thread';
export * from './theme';
