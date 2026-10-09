import { z } from 'zod';

/** Zod schemas for every input that crosses a trust boundary (API, forms). */

export const languageSchema = z.enum(['en', 'es']);
export const roleSchema = z.enum(['patient', 'caregiver', 'coordinator']);
export const ageRangeSchema = z.enum(['18-34', '35-49', '50-64', '65-74', '75+']);
export const insuranceSchema = z.enum(['medicaid', 'medicare', 'private', 'marketplace', 'uninsured', 'other']);
export const incomeSchema = z.enum(['under_25k', '25k_50k', '50k_75k', '75k_100k', 'over_100k', 'prefer_not_to_say']);
export const rideStatusSchema = z.enum(['confirmed', 'pending', 'none']);
export const equipmentNameSchema = z.enum([
  'walker',
  'crutches',
  'wheelchair',
  'shower_chair',
  'raised_toilet_seat',
  'cold_therapy',
  'wound_care_supplies',
  'other',
]);
export const equipmentAvailabilitySchema = z.enum(['available', 'can_borrow', 'need_to_obtain', 'unsure']);
export const capabilitySchema = z.enum(['transport', 'meals', 'basic_tasks', 'supervision']);

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');

export const homeEnvironmentSchema = z.object({
  livesAlone: z.boolean(),
  hasStairs: z.boolean(),
  reliableFood: z.boolean(),
  prescriptionConcern: z.boolean(),
  accessibilityBarriers: z.boolean(),
  accessibilityNotes: z.string().max(500).optional(),
  rideHome: rideStatusSchema,
  rideHomeNotes: z.string().max(300).optional(),
  followUpTransport: rideStatusSchema,
});

export const financialConcernsSchema = z.object({
  medications: z.boolean(),
  equipment: z.boolean(),
  caregiving: z.boolean(),
  wantsAssistance: z.boolean(),
});

export const caregiverInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  relationship: z.string().min(1).max(60),
  languages: z.array(languageSchema).min(1),
  capabilities: z.array(capabilitySchema),
  willingForAssigned: z.boolean(),
  needsTranslatedInstructions: z.boolean(),
  availability: z.array(z.object({ startAt: isoDate, endAt: isoDate })),
});

export const intakeSchema = z.object({
  displayName: z.string().min(1).max(120),
  ageRange: ageRangeSchema.optional(),
  preferredLanguage: languageSchema,
  zip: z.string().regex(/^\d{5}$/, 'ZIP must be 5 digits'),
  city: z.string().max(80).optional(),
  procedureName: z.string().min(1).max(160),
  facility: z.string().max(160).optional(),
  surgeryDate: isoDate,
  dischargeAt: isoDate,
  timezone: z.string().min(1),
  insuranceType: insuranceSchema,
  recoveryBudget: z.number().int().min(0).max(100000),
  incomeRange: incomeSchema,
  financialConcerns: financialConcernsSchema,
  homeEnvironment: homeEnvironmentSchema,
  equipment: z.array(
    z.object({ equipmentName: equipmentNameSchema, otherLabel: z.string().max(80).optional(), availabilityStatus: equipmentAvailabilitySchema }),
  ),
  caregivers: z.array(caregiverInputSchema),
});
export type IntakeInput = z.infer<typeof intakeSchema>;

const hours = z.number().min(0).max(24 * 30);

export const structuredRequirementSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('medication'),
    name: z.string().min(1).max(120),
    dose: z.string().max(60).optional(),
    route: z.string().max(40).optional(),
    frequencyHours: z.number().min(0.5).max(168).optional(),
    firstDoseOffsetHours: hours.optional(),
    durationHours: hours.optional(),
    timingExplicit: z.boolean(),
    asNeeded: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('mobility'),
    restriction: z.string().min(1).max(300),
    requiredEquipment: z.array(equipmentNameSchema),
    walkFrequencyHours: z.number().min(0.5).max(24).optional(),
    wakingHoursOnly: z.boolean().optional(),
    noStairs: z.boolean().optional(),
  }),
  z.object({ kind: z.literal('equipment'), requiredEquipment: z.array(equipmentNameSchema).min(1), neededByOffsetHours: hours }),
  z.object({
    kind: z.literal('caregiver'),
    supervisionStartOffsetHours: hours,
    supervisionDurationHours: z.number().min(1).max(168),
    capabilities: z.array(capabilitySchema),
  }),
  z.object({ kind: z.literal('transportation'), purpose: z.enum(['ride_home', 'follow_up']), offsetHours: hours, escortRequired: z.boolean() }),
  z.object({
    kind: z.literal('follow_up'),
    offsetHours: hours,
    location: z.string().max(160).optional(),
    withWhom: z.string().max(120).optional(),
    transportRequired: z.boolean(),
  }),
  z.object({
    kind: z.literal('wound_care'),
    label: z.string().max(60).optional(),
    frequencyHours: z.number().min(1).max(168).optional(),
    firstOffsetHours: hours.optional(),
    durationHours: hours.optional(),
    wakingHoursOnly: z.boolean().optional(),
    requiredEquipment: z.array(equipmentNameSchema),
    timingExplicit: z.boolean(),
  }),
  z.object({
    kind: z.literal('diet'),
    hydrationReminderHours: z.number().min(1).max(24).optional(),
    mealReminderHours: z.number().min(1).max(24).optional(),
    wakingHoursOnly: z.boolean().optional(),
  }),
  z.object({ kind: z.literal('warning_signs'), signs: z.array(z.string().max(200)).min(1), emergencyInstruction: z.string().min(1).max(400) }),
  z.object({ kind: z.literal('check_in'), offsetsHours: z.array(hours).min(1) }),
]);

export const instructionInputSchema = z.object({
  id: z.string().optional(),
  patientId: z.string(),
  documentId: z.string().optional(),
  category: z.enum(['medication', 'mobility', 'equipment', 'caregiver', 'transportation', 'follow_up', 'wound_care', 'diet', 'warning_signs', 'check_in']),
  originalText: z.string().min(3).max(2000),
  sourcePage: z.number().int().min(1).max(500).optional(),
  structured: structuredRequirementSchema,
});
export type InstructionInput = z.infer<typeof instructionInputSchema>;

export const reviewInputSchema = z.object({
  status: z.enum(['approved', 'needs_clarification', 'rejected']),
  notes: z.string().max(1000).optional(),
});

export const taskPatchSchema = z.object({
  event: z.enum(['assignment_accepted', 'started', 'reported_complete', 'verified', 'resolved', 'escalated', 'reassigned', 'resource_confirmed', 'note']),
  notes: z.string().max(1000).optional(),
  assignedCaregiverId: z.string().optional(),
});

export const barrierSchema = z.object({ reason: z.string().min(3).max(1000) });

export const serviceRequestInputSchema = z.object({
  patientId: z.string(),
  providerId: z.string(),
  gapId: z.string().optional(),
  requirementId: z.string().optional(),
  windowStart: isoDate,
  windowEnd: isoDate,
});

export const assistanceRequestInputSchema = z.object({
  patientId: z.string(),
  programId: z.string(),
  requirementId: z.string().optional(),
  requestedAmount: z.number().min(0).max(100000),
});

export const inviteSchema = z.object({ patientId: z.string(), caregiverId: z.string() });
export const acceptInviteSchema = z.object({ inviteCode: z.string().min(4).max(32), consent: z.literal(true) });

export const gapPatchSchema = z.object({
  status: z.enum(['identified', 'assigned', 'assistance_requested', 'awaiting_confirmation', 'verified_resolved', 'unresolved', 'escalated']),
  resolutionNotes: z.string().max(1000).optional(),
  assignedCoordinator: z.string().optional(),
});
