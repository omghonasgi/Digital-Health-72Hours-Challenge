import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { intakeSchema, type IntakeInput } from '@/core/schemas';
import { offsetFromDischarge } from '@/core/time';
import type { AgeRange, CaregiverCapability, EquipmentAvailability, EquipmentName, HomeEnvironment, IncomeRange, InsuranceType, Language, Patient, RideStatus } from '@/core/types';
import { submitIntake } from '@/core/usecases';
import { COMMON_TIMEZONES, DateTimeField, deviceTimezone } from '@/features/DateTimeField';
import { useFmt } from '@/features/format';
import { useSession } from '@/state/SessionProvider';
import { useAction } from '@/state/usePlan';
import { BOTTOM_BAR_HEIGHT, Body, Button, Card, Chip, Choice, Field, Hairline, Icons, KeyValue, Meta, MultiChoice, Muted, NumberField, Row, Screen, Section, Stamp, TextField, ToggleRow, YesNo, colors, space } from '@/ui';

const STEPS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
type StepKey = (typeof STEPS)[number];

const EQUIPMENT: EquipmentName[] = ['walker', 'crutches', 'wheelchair', 'shower_chair', 'raised_toilet_seat', 'cold_therapy', 'wound_care_supplies', 'other'];
const AGES: AgeRange[] = ['18-34', '35-49', '50-64', '65-74', '75+'];
const INSURANCE: InsuranceType[] = ['medicaid', 'medicare', 'private', 'marketplace', 'uninsured', 'other'];
const INCOME: IncomeRange[] = ['under_25k', '25k_50k', '50k_75k', '75k_100k', 'over_100k', 'prefer_not_to_say'];
const CAPABILITIES: CaregiverCapability[] = ['supervision', 'transport', 'meals', 'basic_tasks'];
const RIDE: RideStatus[] = ['confirmed', 'pending', 'none'];

interface CaregiverDraft {
  id?: string;
  name: string;
  relationship: string;
  languages: Language[];
  capabilities: CaregiverCapability[];
  willingForAssigned: boolean;
  needsTranslatedInstructions: boolean;
  availability: { startAt?: string; endAt?: string }[];
}

interface Draft {
  displayName: string;
  ageRange?: AgeRange;
  preferredLanguage: Language;
  zip: string;
  city: string;
  procedureName: string;
  facility: string;
  surgeryDate?: string;
  dischargeAt?: string;
  timezone: string;
  insuranceType?: InsuranceType;
  recoveryBudget?: number;
  incomeRange?: IncomeRange;
  concerns: { medications?: boolean; equipment?: boolean; caregiving?: boolean; wantsAssistance?: boolean };
  equipment: Partial<Record<EquipmentName, EquipmentAvailability>>;
  otherLabel: string;
  hasHelper?: boolean;
  caregivers: CaregiverDraft[];
  home: Partial<HomeEnvironment>;
}

const emptyDraft = (name: string, lang: Language): Draft => ({
  displayName: name,
  preferredLanguage: lang,
  zip: '',
  city: '',
  procedureName: '',
  facility: '',
  timezone: deviceTimezone(),
  concerns: {},
  equipment: {},
  otherLabel: '',
  caregivers: [],
  home: {},
});

const stepSchemas: Record<Exclude<StepKey, 'f'>, z.ZodTypeAny> = {
  a: intakeSchema.pick({ displayName: true, ageRange: true, preferredLanguage: true, zip: true, city: true, procedureName: true, facility: true, surgeryDate: true, dischargeAt: true, timezone: true }),
  b: intakeSchema.pick({ insuranceType: true, recoveryBudget: true, incomeRange: true, financialConcerns: true }),
  c: intakeSchema.pick({ equipment: true }),
  d: intakeSchema.pick({ caregivers: true }),
  e: intakeSchema.pick({ homeEnvironment: true }),
};

function toInput(d: Draft) {
  return {
    displayName: d.displayName.trim(),
    ageRange: d.ageRange,
    preferredLanguage: d.preferredLanguage,
    zip: d.zip.trim(),
    city: d.city.trim() || undefined,
    procedureName: d.procedureName.trim(),
    facility: d.facility.trim() || undefined,
    surgeryDate: d.surgeryDate,
    dischargeAt: d.dischargeAt,
    timezone: d.timezone,
    insuranceType: d.insuranceType,
    recoveryBudget: d.recoveryBudget,
    incomeRange: d.incomeRange,
    financialConcerns: d.concerns,
    homeEnvironment: d.home,
    equipment: EQUIPMENT.filter((e) => d.equipment[e]).map((e) => ({ equipmentName: e, otherLabel: e === 'other' ? d.otherLabel.trim() || undefined : undefined, availabilityStatus: d.equipment[e]! })),
    caregivers: d.hasHelper === false ? [] : d.caregivers.map((c) => ({ ...c, name: c.name.trim(), relationship: c.relationship.trim(), availability: c.availability.filter((b) => b.startAt && b.endAt) })),
  };
}

type Errors = Record<string, string>;
function collect(result: z.ZodSafeParseResult<unknown>): Errors {
  if (result.success) return {};
  const out: Errors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export default function Intake() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, repo, refreshSession } = useSession();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(session?.profile.displayName ?? '', session?.profile.preferredLanguage ?? 'en'));
  const [errors, setErrors] = useState<Errors>({});
  const [existing, setExisting] = useState<Patient | undefined>();
  const [loaded, setLoaded] = useState(!session?.patientId);
  const { busy, error, run } = useAction();
  const scrollRef = React.useRef<ScrollView | null>(null);

  // Editing: pre-fill from the saved record.
  useEffect(() => {
    const pid = session?.patientId;
    if (!pid) return;
    (async () => {
      const p = await repo.getPatient(pid);
      if (!p) return setLoaded(true);
      const [eq, cgs] = await Promise.all([repo.listEquipment(pid), repo.listCaregivers(pid)]);
      const av = await repo.listAvailability(cgs.map((c) => c.id));
      setExisting(p);
      setDraft({
        displayName: p.displayName,
        ageRange: p.ageRange,
        preferredLanguage: p.preferredLanguage,
        zip: p.zip,
        city: p.city ?? '',
        procedureName: p.procedureName,
        facility: p.facility ?? '',
        surgeryDate: p.surgeryDate,
        dischargeAt: p.dischargeAt,
        timezone: p.timezone,
        insuranceType: p.insuranceType,
        recoveryBudget: p.recoveryBudget,
        incomeRange: p.incomeRange,
        concerns: { ...p.financialConcerns },
        equipment: Object.fromEntries(eq.map((e) => [e.equipmentName, e.availabilityStatus])),
        otherLabel: eq.find((e) => e.equipmentName === 'other')?.otherLabel ?? '',
        hasHelper: cgs.length > 0,
        caregivers: cgs.map((c) => ({
          id: c.id,
          name: c.name,
          relationship: c.relationship,
          languages: c.languages,
          capabilities: c.capabilities,
          willingForAssigned: c.willingForAssigned,
          needsTranslatedInstructions: c.needsTranslatedInstructions,
          availability: av.filter((a) => a.caregiverId === c.id).map((a) => ({ startAt: a.startAt, endAt: a.endAt })),
        })),
        home: { ...p.homeEnvironment },
      });
      setLoaded(true);
    })();
  }, [repo, session?.patientId]);

  const key = STEPS[step];
  const input = useMemo(() => toInput(draft), [draft]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const validateStep = (k: StepKey) => (k === 'f' ? collect(intakeSchema.safeParse(input)) : collect(stepSchemas[k].safeParse(input)));

  const next = () => {
    const errs = validateStep(key);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };
  const back = () => {
    setErrors({});
    if (step === 0) router.back();
    else setStep((s) => s - 1);
  };
  const jump = (k: StepKey) => {
    setErrors({});
    setStep(STEPS.indexOf(k));
  };

  const submit = () =>
    run(async () => {
      const parsed = intakeSchema.safeParse(input);
      const errs = collect(parsed);
      setErrors(errs);
      if (!parsed.success || !session) return;
      await submitIntake(repo, session, parsed.data as IntakeInput, existing);
      await refreshSession();
      router.replace('/patient');
    });

  if (!loaded) return <Screen title={t('common.loading')} bottomInset={BOTTOM_BAR_HEIGHT}>{null}</Screen>;

  return (
    <Screen
      title={t('intake.title')}
      subtitle={`${t('intake.step', { n: step + 1, total: STEPS.length })} · ${t(`intake.sections.${key}`)}`}
      aside={<Stamp label={String(step + 1)} size={52} variant={key === 'f' ? 'filled' : 'outline'} />}
      bottomInset={BOTTOM_BAR_HEIGHT}
      scrollRef={scrollRef}
    >
      <View style={styles.progress}>
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.progressSeg, i <= step && styles.progressOn]} />
        ))}
      </View>

      {key === 'a' ? <StepA draft={draft} set={set} errors={errors} /> : null}
      {key === 'b' ? <StepB draft={draft} set={set} errors={errors} /> : null}
      {key === 'c' ? <StepC draft={draft} set={set} /> : null}
      {key === 'd' ? <StepD draft={draft} set={set} errors={errors} /> : null}
      {key === 'e' ? <StepE draft={draft} set={set} errors={errors} /> : null}
      {key === 'f' ? <StepF draft={draft} input={input} jump={jump} errors={errors} /> : null}

      {error ? <Body color={colors.urgent}>{error}</Body> : null}
      <View style={styles.nav}>
        <Button label={t('common.back')} variant="quiet" compact onPress={back} />
        {key === 'f' ? <Button label={t('intake.f.submit')} variant="hero" loading={busy} onPress={submit} style={{ flex: 1 }} /> : <Button label={t('common.continue')} variant="hero" icon={Icons.ChevronRight} onPress={next} style={{ flex: 1 }} />}
      </View>
    </Screen>
  );
}

type StepProps = { draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void; errors: Errors };

function StepA({ draft, set, errors }: StepProps) {
  const { t } = useTranslation();
  const tzOptions = useMemo(() => {
    const list = [...COMMON_TIMEZONES];
    if (!list.includes(draft.timezone)) list.unshift(draft.timezone);
    return list.map((z) => ({ value: z, label: z.replace('America/', '').replace('Pacific/', '').replace('_', ' ') }));
  }, [draft.timezone]);
  return (
    <Card>
      <Field label={t('intake.a.displayName')} error={errors.displayName}>
        <TextField value={draft.displayName} onChangeText={(v) => set('displayName', v)} />
      </Field>
      <Field label={t('intake.a.ageRange')} error={errors.ageRange}>
        <Choice options={AGES.map((a) => ({ value: a, label: t(`ageRange.${a}`) }))} value={draft.ageRange} onChange={(v) => set('ageRange', v)} />
      </Field>
      <Field label={t('intake.a.preferredLanguage')}>
        <Choice
          options={[
            { value: 'en', label: t('common.english') },
            { value: 'es', label: t('common.spanish') },
          ]}
          value={draft.preferredLanguage}
          onChange={(v) => set('preferredLanguage', v)}
        />
      </Field>
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Field label={t('intake.a.zip')} error={errors.zip}>
            <TextField value={draft.zip} onChangeText={(v) => set('zip', v.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" maxLength={5} />
          </Field>
        </View>
        <View style={{ flex: 2 }}>
          <Field label={t('intake.a.city')} optional optionalLabel={t('common.optional')}>
            <TextField value={draft.city} onChangeText={(v) => set('city', v)} />
          </Field>
        </View>
      </Row>
      <Field label={t('intake.a.procedure')} error={errors.procedureName}>
        <TextField value={draft.procedureName} onChangeText={(v) => set('procedureName', v)} />
      </Field>
      <Field label={t('intake.a.facility')} optional optionalLabel={t('common.optional')}>
        <TextField value={draft.facility} onChangeText={(v) => set('facility', v)} />
      </Field>
      <Field label={t('intake.a.timezone')} error={errors.timezone}>
        <Choice options={tzOptions} value={draft.timezone} onChange={(v) => set('timezone', v)} />
      </Field>
      <Field label={t('intake.a.surgeryDate')} error={errors.surgeryDate}>
        <DateTimeField value={draft.surgeryDate} timezone={draft.timezone} onChange={(v) => set('surgeryDate', v)} />
      </Field>
      <Field label={t('intake.a.dischargeAt')} error={errors.dischargeAt} hint={t('intake.a.dischargeHint')}>
        <DateTimeField value={draft.dischargeAt} timezone={draft.timezone} onChange={(v) => set('dischargeAt', v)} />
      </Field>
    </Card>
  );
}

function StepB({ draft, set, errors }: StepProps) {
  const { t } = useTranslation();
  const yn = { yes: t('common.yes'), no: t('common.no') };
  const c = draft.concerns;
  const setC = (k: keyof Draft['concerns'], v: boolean) => set('concerns', { ...c, [k]: v });
  return (
    <Card>
      <Muted>{t('intake.b.privacy')}</Muted>
      <Field label={t('intake.b.income')} error={errors.incomeRange}>
        <Choice options={INCOME.map((i) => ({ value: i, label: t(`income.${i}`) }))} value={draft.incomeRange} onChange={(v) => set('incomeRange', v)} />
      </Field>
      <Field label={t('intake.b.insurance')} error={errors.insuranceType}>
        <Choice options={INSURANCE.map((i) => ({ value: i, label: t(`insurance.${i}`) }))} value={draft.insuranceType} onChange={(v) => set('insuranceType', v)} />
      </Field>
      <Field label={t('intake.b.budget')} error={errors.recoveryBudget}>
        <NumberField value={draft.recoveryBudget} onChange={(n) => set('recoveryBudget', n === undefined ? undefined : Math.round(n))} placeholder="0" />
      </Field>
      <Hairline />
      <Field label={t('intake.b.concernMeds')} error={errors['financialConcerns.medications']}>
        <YesNo value={c.medications} onChange={(v) => setC('medications', v)} labels={yn} />
      </Field>
      <Field label={t('intake.b.concernEquipment')} error={errors['financialConcerns.equipment']}>
        <YesNo value={c.equipment} onChange={(v) => setC('equipment', v)} labels={yn} />
      </Field>
      <Field label={t('intake.b.concernCaregiving')} error={errors['financialConcerns.caregiving']}>
        <YesNo value={c.caregiving} onChange={(v) => setC('caregiving', v)} labels={yn} />
      </Field>
      <Field label={t('intake.b.wantsAssistance')} error={errors['financialConcerns.wantsAssistance']}>
        <YesNo value={c.wantsAssistance} onChange={(v) => setC('wantsAssistance', v)} labels={yn} />
      </Field>
    </Card>
  );
}

function StepC({ draft, set }: Omit<StepProps, 'errors'>) {
  const { t } = useTranslation();
  const statuses: EquipmentAvailability[] = ['available', 'can_borrow', 'need_to_obtain', 'unsure'];
  return (
    <Card>
      <Muted>{t('intake.c.intro')}</Muted>
      {EQUIPMENT.map((e) => (
        <View key={e} style={{ gap: space.sm }}>
          <Hairline />
          <Row style={{ justifyContent: 'space-between' }}>
            <Body weight="medium">{t(`equipment.${e}`)}</Body>
            {draft.equipment[e] ? <Button label={t('common.none')} variant="quiet" compact onPress={() => set('equipment', { ...draft.equipment, [e]: undefined })} /> : null}
          </Row>
          <Choice options={statuses.map((s) => ({ value: s, label: t(`equipmentStatus.${s}`) }))} value={draft.equipment[e]} onChange={(v) => set('equipment', { ...draft.equipment, [e]: v })} />
          {e === 'other' && draft.equipment.other ? <TextField value={draft.otherLabel} onChangeText={(v) => set('otherLabel', v)} placeholder={t('equipment.other')} /> : null}
        </View>
      ))}
    </Card>
  );
}

function StepD({ draft, set, errors }: StepProps) {
  const { t } = useTranslation();
  const f = useFmt(draft.timezone);
  const yn = { yes: t('common.yes'), no: t('common.no') };
  const update = (i: number, patch: Partial<CaregiverDraft>) => set('caregivers', draft.caregivers.map((c, n) => (n === i ? { ...c, ...patch } : c)));
  const add = () =>
    set('caregivers', [
      ...draft.caregivers,
      { name: '', relationship: '', languages: [draft.preferredLanguage], capabilities: ['supervision'], willingForAssigned: true, needsTranslatedInstructions: false, availability: [] },
    ]);
  const addBlock = (i: number) => {
    const base = draft.dischargeAt ?? new Date().toISOString();
    const c = draft.caregivers[i];
    const last = c.availability[c.availability.length - 1];
    const start = last?.endAt ?? base;
    update(i, { availability: [...c.availability, { startAt: start, endAt: offsetFromDischarge(start, 12) }] });
  };
  return (
    <View style={{ gap: space.lg }}>
      <Card>
        <Muted>{t('intake.d.intro')}</Muted>
        <Field label={t('intake.d.hasHelper')}>
          <YesNo
            value={draft.hasHelper}
            onChange={(v) => {
              set('hasHelper', v);
              if (v && draft.caregivers.length === 0) add();
            }}
            labels={yn}
          />
        </Field>
      </Card>
      {draft.hasHelper
        ? draft.caregivers.map((c, i) => (
            <Card key={c.id ?? i}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Body weight="medium">
                  {t('common.caregiver')} {i + 1}
                </Body>
                <Button label={t('intake.d.remove')} variant="quiet" compact onPress={() => set('caregivers', draft.caregivers.filter((_, n) => n !== i))} />
              </Row>
              <Field label={t('intake.d.name')} error={errors[`caregivers.${i}.name`]}>
                <TextField value={c.name} onChangeText={(v) => update(i, { name: v })} />
              </Field>
              <Field label={t('intake.d.relationship')} error={errors[`caregivers.${i}.relationship`]}>
                <TextField value={c.relationship} onChangeText={(v) => update(i, { relationship: v })} />
              </Field>
              <Field label={t('intake.d.languages')} error={errors[`caregivers.${i}.languages`]}>
                <MultiChoice
                  options={[
                    { value: 'en', label: t('common.english') },
                    { value: 'es', label: t('common.spanish') },
                  ]}
                  value={c.languages}
                  onChange={(v) => update(i, { languages: v })}
                />
              </Field>
              <Field label={t('intake.d.capabilities')}>
                <MultiChoice options={CAPABILITIES.map((k) => ({ value: k, label: t(`capability.${k}`) }))} value={c.capabilities} onChange={(v) => update(i, { capabilities: v })} />
              </Field>
              <ToggleRow label={t('intake.d.willing')} value={c.willingForAssigned} onChange={(v) => update(i, { willingForAssigned: v })} />
              <ToggleRow label={t('intake.d.needsTranslation')} value={c.needsTranslatedInstructions} onChange={(v) => update(i, { needsTranslatedInstructions: v })} />
              <Field label={t('intake.d.availability')}>
                <View style={{ gap: space.md }}>
                  {c.availability.map((b, bi) => (
                    <View key={bi} style={styles.block}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Meta>{b.startAt && b.endAt ? f.range(b.startAt, b.endAt) : '—'}</Meta>
                        <Button label={t('intake.d.remove')} variant="quiet" compact onPress={() => update(i, { availability: c.availability.filter((_, n) => n !== bi) })} />
                      </Row>
                      <Meta>{t('common.at')}</Meta>
                      <DateTimeField value={b.startAt} timezone={draft.timezone} onChange={(v) => update(i, { availability: c.availability.map((x, n) => (n === bi ? { ...x, startAt: v } : x)) })} />
                      <Meta>{t('common.to')}</Meta>
                      <DateTimeField value={b.endAt} timezone={draft.timezone} onChange={(v) => update(i, { availability: c.availability.map((x, n) => (n === bi ? { ...x, endAt: v } : x)) })} />
                    </View>
                  ))}
                  <Button label={t('caregiverApp.addBlock')} variant="ghost" compact onPress={() => addBlock(i)} />
                </View>
              </Field>
            </Card>
          ))
        : null}
      {draft.hasHelper ? <Button label={t('intake.d.add')} variant="ghost" onPress={add} /> : null}
    </View>
  );
}

function StepE({ draft, set, errors }: StepProps) {
  const { t } = useTranslation();
  const yn = { yes: t('common.yes'), no: t('common.no') };
  const h = draft.home;
  const setH = <K extends keyof HomeEnvironment>(k: K, v: HomeEnvironment[K]) => set('home', { ...h, [k]: v });
  const rideOpts = RIDE.map((r) => ({ value: r, label: t(`intake.rideStatus.${r}`) }));
  return (
    <Card>
      <Field label={t('intake.e.rideHome')} error={errors['homeEnvironment.rideHome']}>
        <Choice options={rideOpts} value={h.rideHome} onChange={(v) => setH('rideHome', v)} />
      </Field>
      <Field label={t('intake.e.followUpTransport')} error={errors['homeEnvironment.followUpTransport']}>
        <Choice options={rideOpts} value={h.followUpTransport} onChange={(v) => setH('followUpTransport', v)} />
      </Field>
      <Hairline />
      <Field label={t('intake.e.livesAlone')} error={errors['homeEnvironment.livesAlone']}>
        <YesNo value={h.livesAlone} onChange={(v) => setH('livesAlone', v)} labels={yn} />
      </Field>
      <Field label={t('intake.e.hasStairs')} error={errors['homeEnvironment.hasStairs']}>
        <YesNo value={h.hasStairs} onChange={(v) => setH('hasStairs', v)} labels={yn} />
      </Field>
      <Field label={t('intake.e.reliableFood')} error={errors['homeEnvironment.reliableFood']}>
        <YesNo value={h.reliableFood} onChange={(v) => setH('reliableFood', v)} labels={yn} />
      </Field>
      <Field label={t('intake.e.prescriptionConcern')} error={errors['homeEnvironment.prescriptionConcern']}>
        <YesNo value={h.prescriptionConcern} onChange={(v) => setH('prescriptionConcern', v)} labels={yn} />
      </Field>
      <Field label={t('intake.e.accessibilityBarriers')} error={errors['homeEnvironment.accessibilityBarriers']}>
        <YesNo value={h.accessibilityBarriers} onChange={(v) => setH('accessibilityBarriers', v)} labels={yn} />
      </Field>
      {h.accessibilityBarriers ? (
        <Field label={t('intake.e.accessibilityNotes')} optional optionalLabel={t('common.optional')}>
          <TextField value={h.accessibilityNotes ?? ''} onChangeText={(v) => setH('accessibilityNotes', v)} multiline />
        </Field>
      ) : null}
    </Card>
  );
}

function StepF({ draft, input, jump, errors }: { draft: Draft; input: ReturnType<typeof toInput>; jump: (k: StepKey) => void; errors: Errors }) {
  const { t } = useTranslation();
  const f = useFmt(draft.timezone);
  const yn = (v?: boolean) => (v === undefined ? '—' : v ? t('common.yes') : t('common.no'));
  const errKeys = Object.keys(errors);
  const edit = (k: StepKey) => <Button label={t('common.edit')} variant="quiet" compact onPress={() => jump(k)} />;
  return (
    <View style={{ gap: space.lg }}>
      <Muted>{t('intake.f.intro')}</Muted>
      {errKeys.length ? (
        <Card>
          <Body color={colors.urgent}>{t('common.required')}</Body>
          {errKeys.slice(0, 6).map((k) => (
            <Meta key={k}>
              {k}: {errors[k]}
            </Meta>
          ))}
        </Card>
      ) : null}
      <Section title={t('intake.sections.a')} aside={edit('a')}>
        <Card>
          <KeyValue k={t('intake.a.displayName')} v={input.displayName || '—'} />
          <KeyValue k={t('intake.a.ageRange')} v={draft.ageRange ? t(`ageRange.${draft.ageRange}`) : '—'} />
          <KeyValue k={t('intake.a.preferredLanguage')} v={draft.preferredLanguage === 'es' ? t('common.spanish') : t('common.english')} />
          <KeyValue k={t('intake.a.zip')} v={[input.zip, input.city].filter(Boolean).join(' · ') || '—'} />
          <KeyValue k={t('intake.a.procedure')} v={input.procedureName || '—'} meta={input.facility} />
          <KeyValue k={t('intake.a.surgeryDate')} v={draft.surgeryDate ? f.dateTime(draft.surgeryDate) : '—'} />
          <KeyValue k={t('intake.a.dischargeAt')} v={draft.dischargeAt ? f.dateTime(draft.dischargeAt) : '—'} meta={draft.timezone} />
        </Card>
      </Section>
      <Section title={t('intake.sections.b')} aside={edit('b')}>
        <Card>
          <KeyValue k={t('intake.b.income')} v={draft.incomeRange ? t(`income.${draft.incomeRange}`) : '—'} />
          <KeyValue k={t('intake.b.insurance')} v={draft.insuranceType ? t(`insurance.${draft.insuranceType}`) : '—'} />
          <KeyValue k={t('intake.b.budget')} v={draft.recoveryBudget !== undefined ? f.money(draft.recoveryBudget) : '—'} />
          <KeyValue k={t('intake.b.concernMeds')} v={yn(draft.concerns.medications)} />
          <KeyValue k={t('intake.b.concernEquipment')} v={yn(draft.concerns.equipment)} />
          <KeyValue k={t('intake.b.concernCaregiving')} v={yn(draft.concerns.caregiving)} />
          <KeyValue k={t('intake.b.wantsAssistance')} v={yn(draft.concerns.wantsAssistance)} />
        </Card>
      </Section>
      <Section title={t('intake.sections.c')} aside={edit('c')}>
        <Card>
          {input.equipment.length === 0 ? <Muted>{t('common.none')}</Muted> : null}
          <Row wrap>
            {input.equipment.map((e) => (
              <Chip key={e.equipmentName} label={e.equipmentName === 'other' && e.otherLabel ? e.otherLabel : t(`equipment.${e.equipmentName}`)} meta={t(`equipmentStatus.${e.availabilityStatus}`)} tone={e.availabilityStatus === 'available' ? 'good' : e.availabilityStatus === 'need_to_obtain' ? 'caution' : 'neutral'} />
            ))}
          </Row>
        </Card>
      </Section>
      <Section title={t('intake.sections.d')} aside={edit('d')}>
        <Card>
          {input.caregivers.length === 0 ? <Muted>{t('home.noCaregiver')}</Muted> : null}
          {input.caregivers.map((c, i) => (
            <View key={i} style={{ gap: space.xs }}>
              <Body weight="medium">
                {c.name || '—'} · {c.relationship || '—'}
              </Body>
              <Meta>
                {c.languages.map((l) => (l === 'es' ? t('common.spanish') : t('common.english'))).join(' / ')} · {c.capabilities.map((k) => t(`capability.${k}`)).join(', ')}
              </Meta>
              {c.availability.map((b, bi) => (
                <Meta key={bi}>{f.range(b.startAt!, b.endAt!)}</Meta>
              ))}
              {c.availability.length === 0 ? <Meta>{t('intake.d.availability')}: —</Meta> : null}
            </View>
          ))}
        </Card>
      </Section>
      <Section title={t('intake.sections.e')} aside={edit('e')}>
        <Card>
          <KeyValue k={t('intake.e.rideHome')} v={draft.home.rideHome ? t(`intake.rideStatus.${draft.home.rideHome}`) : '—'} />
          <KeyValue k={t('intake.e.followUpTransport')} v={draft.home.followUpTransport ? t(`intake.rideStatus.${draft.home.followUpTransport}`) : '—'} />
          <KeyValue k={t('intake.e.livesAlone')} v={yn(draft.home.livesAlone)} />
          <KeyValue k={t('intake.e.hasStairs')} v={yn(draft.home.hasStairs)} />
          <KeyValue k={t('intake.e.reliableFood')} v={yn(draft.home.reliableFood)} />
          <KeyValue k={t('intake.e.prescriptionConcern')} v={yn(draft.home.prescriptionConcern)} />
          <KeyValue k={t('intake.e.accessibilityBarriers')} v={yn(draft.home.accessibilityBarriers)} meta={draft.home.accessibilityNotes} />
        </Card>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: space.xs },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.inkFaint },
  progressOn: { backgroundColor: colors.blue },
  nav: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  block: { gap: space.sm, padding: space.md, backgroundColor: colors.canvas, borderRadius: 4 },
});
