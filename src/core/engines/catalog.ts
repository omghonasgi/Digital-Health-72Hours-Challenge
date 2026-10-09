import type { EquipmentName, ProviderService, CaregiverCapability } from '../types';

/**
 * Hypothetical price list. Every figure here is a planning estimate and is
 * labelled as such in the UI until a provider, pharmacy, or program confirms it.
 */
export const COST_CATALOG = {
  equipment: {
    walker: 45,
    crutches: 35,
    wheelchair: 120,
    shower_chair: 40,
    raised_toilet_seat: 35,
    cold_therapy: 25,
    wound_care_supplies: 20,
    other: 30,
  } satisfies Record<EquipmentName, number>,
  medicationCopay: 30,
  caregivingHourly: 28,
  rideOneWay: 25,
  mealsPerDay: 14,
} as const;

export const EQUIPMENT_NAMES: EquipmentName[] = [
  'walker',
  'crutches',
  'wheelchair',
  'shower_chair',
  'raised_toilet_seat',
  'cold_therapy',
  'wound_care_supplies',
  'other',
];

export const capabilityToService: Record<CaregiverCapability, ProviderService> = {
  supervision: 'supervision',
  transport: 'transport',
  meals: 'meals',
  basic_tasks: 'basic_tasks',
};

/** Local hours (inclusive start, exclusive end) treated as "awake" for waking-hours-only schedules. */
export const WAKING_HOURS = { start: 8, end: 22 } as const;
