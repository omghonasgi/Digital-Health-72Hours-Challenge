import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { instructionInputSchema, type InstructionInput } from '@/core/schemas';
import type { ClinicalInstruction, DischargeDocument, EquipmentName, InstructionCategory, StructuredRequirement } from '@/core/types';
import { Body, Button, Card, Chip, Choice, Field, Hairline, Meta, MultiChoice, Muted, NumberField, Row, TextField, ToggleRow, colors, space } from '@/ui';

const CATEGORIES: InstructionCategory[] = ['medication', 'mobility', 'equipment', 'caregiver', 'transportation', 'follow_up', 'wound_care', 'diet', 'warning_signs', 'check_in'];
const EQUIPMENT: EquipmentName[] = ['walker', 'crutches', 'wheelchair', 'shower_chair', 'raised_toilet_seat', 'cold_therapy', 'wound_care_supplies', 'other'];

/** Blank structured record for a category. Every optional number starts undefined: nothing is assumed. */
export function blankStructured(category: InstructionCategory): StructuredRequirement {
  switch (category) {
    case 'medication':
      return { kind: 'medication', name: '', timingExplicit: false };
    case 'mobility':
      return { kind: 'mobility', restriction: '', requiredEquipment: [] };
    case 'equipment':
      return { kind: 'equipment', requiredEquipment: [], neededByOffsetHours: 0 };
    case 'caregiver':
      return { kind: 'caregiver', supervisionStartOffsetHours: 0, supervisionDurationHours: 24, capabilities: ['supervision'] };
    case 'transportation':
      return { kind: 'transportation', purpose: 'ride_home', offsetHours: 0, escortRequired: false };
    case 'follow_up':
      return { kind: 'follow_up', offsetHours: 48, transportRequired: true };
    case 'wound_care':
      return { kind: 'wound_care', requiredEquipment: [], timingExplicit: false };
    case 'diet':
      return { kind: 'diet' };
    case 'warning_signs':
      return { kind: 'warning_signs', signs: [], emergencyInstruction: '' };
    case 'check_in':
      return { kind: 'check_in', offsetsHours: [] };
  }
}

interface Props {
  patientId: string;
  documents: DischargeDocument[];
  existing?: ClinicalInstruction;
  onSubmit: (input: InstructionInput) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}

/**
 * Manual structured entry. The person typing copies the clinician's words
 * and only fills numbers the document states. No extraction, no inference.
 */
export function InstructionForm({ patientId, documents, existing, onSubmit, onCancel, busy }: Props) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<InstructionCategory>(existing?.category ?? 'medication');
  const [originalText, setOriginalText] = useState(existing?.originalText ?? '');
  const [sourcePage, setSourcePage] = useState<number | undefined>(existing?.sourcePage);
  const [documentId, setDocumentId] = useState<string | undefined>(existing?.documentId ?? documents[0]?.id);
  const [structured, setStructured] = useState<StructuredRequirement>(existing?.structured ?? blankStructured(existing?.category ?? 'medication'));
  const [signsText, setSignsText] = useState(existing?.structured.kind === 'warning_signs' ? existing.structured.signs.join('\n') : '');
  const [offsetsText, setOffsetsText] = useState(existing?.structured.kind === 'check_in' ? existing.structured.offsetsHours.join(', ') : '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const changeCategory = (c: InstructionCategory) => {
    setCategory(c);
    setStructured(blankStructured(c));
    setErrors({});
  };

  const patch = (p: Partial<StructuredRequirement>) => setStructured((s) => ({ ...s, ...p }) as StructuredRequirement);

  const submit = async () => {
    let s = structured;
    if (s.kind === 'warning_signs') s = { ...s, signs: signsText.split('\n').map((x) => x.trim()).filter(Boolean) };
    if (s.kind === 'check_in')
      s = {
        ...s,
        offsetsHours: offsetsText
          .split(/[,\s]+/)
          .map((x) => Number(x))
          .filter((n) => !Number.isNaN(n) && n >= 0),
      };
    const parsed = instructionInputSchema.safeParse({ id: existing?.id, patientId, documentId, category, originalText: originalText.trim(), sourcePage, structured: s });
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const i of parsed.error.issues) out[i.path.join('.')] ||= i.message;
      setErrors(out);
      return;
    }
    setErrors({});
    await onSubmit(parsed.data);
  };

  return (
    <Card>
      <Body weight="medium">{existing ? t('common.edit') : t('instructions.add')}</Body>
      <Muted>{t('instructions.safety')}</Muted>
      <Field label={t('instructions.category')}>
        <Choice options={CATEGORIES.map((c) => ({ value: c, label: t(`instructions.categories.${c}`) }))} value={category} onChange={changeCategory} />
      </Field>
      <Field label={t('instructions.originalText')} error={errors.originalText}>
        <TextField value={originalText} onChangeText={setOriginalText} multiline />
      </Field>
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Field label={t('instructions.sourcePage')} optional optionalLabel={t('common.optional')} error={errors.sourcePage}>
            <NumberField value={sourcePage} onChange={(n) => setSourcePage(n === undefined ? undefined : Math.round(n))} />
          </Field>
        </View>
        {documents.length ? (
          <View style={{ flex: 2 }}>
            <Field label={t('instructions.upload')} optional optionalLabel={t('common.optional')}>
              <Row wrap>
                {documents.map((d) => (
                  <Chip key={d.id} label={d.fileName} selected={documentId === d.id} onPress={() => setDocumentId(documentId === d.id ? undefined : d.id)} dense />
                ))}
              </Row>
            </Field>
          </View>
        ) : null}
      </Row>
      <Hairline />
      <Body weight="medium">{t('instructions.structured')}</Body>
      {structured.kind === 'medication' ? (
        <>
          <Field label={t('instructions.name')} error={errors['structured.name']}>
            <TextField value={structured.name} onChangeText={(v) => patch({ name: v })} />
          </Field>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field label={t('instructions.dose')} optional optionalLabel={t('common.optional')}>
                <TextField value={structured.dose ?? ''} onChangeText={(v) => patch({ dose: v || undefined })} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('instructions.route')} optional optionalLabel={t('common.optional')}>
                <TextField value={structured.route ?? ''} onChangeText={(v) => patch({ route: v || undefined })} />
              </Field>
            </View>
          </Row>
          <ToggleRow label={t('instructions.asNeeded')} value={!!structured.asNeeded} onChange={(v) => patch({ asNeeded: v })} />
          {!structured.asNeeded ? (
            <>
              <Row style={{ alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Field label={t('instructions.frequencyHours')} error={errors['structured.frequencyHours']}>
                    <NumberField value={structured.frequencyHours} onChange={(n) => patch({ frequencyHours: n })} />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label={t('instructions.firstDoseOffsetHours')} error={errors['structured.firstDoseOffsetHours']}>
                    <NumberField value={structured.firstDoseOffsetHours} onChange={(n) => patch({ firstDoseOffsetHours: n })} />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label={t('instructions.durationHours')} optional optionalLabel={t('common.optional')}>
                    <NumberField value={structured.durationHours} onChange={(n) => patch({ durationHours: n })} />
                  </Field>
                </View>
              </Row>
              <ToggleRow label={t('instructions.timingExplicit')} value={structured.timingExplicit} onChange={(v) => patch({ timingExplicit: v })} hint={t('review.medication_timing')} />
            </>
          ) : null}
        </>
      ) : null}

      {structured.kind === 'mobility' ? (
        <>
          <Field label={t('instructions.restriction')} error={errors['structured.restriction']}>
            <TextField value={structured.restriction} onChangeText={(v) => patch({ restriction: v })} />
          </Field>
          <Field label={t('instructions.requiredEquipment')}>
            <MultiChoice options={EQUIPMENT.map((e) => ({ value: e, label: t(`equipment.${e}`) }))} value={structured.requiredEquipment} onChange={(v) => patch({ requiredEquipment: v })} />
          </Field>
          <Field label={t('instructions.walkFrequencyHours')} optional optionalLabel={t('common.optional')} error={errors['structured.walkFrequencyHours']}>
            <NumberField value={structured.walkFrequencyHours} onChange={(n) => patch({ walkFrequencyHours: n })} />
          </Field>
          <ToggleRow label={t('instructions.wakingHoursOnly')} value={!!structured.wakingHoursOnly} onChange={(v) => patch({ wakingHoursOnly: v })} />
          <ToggleRow label={t('instructions.noStairs')} value={!!structured.noStairs} onChange={(v) => patch({ noStairs: v })} />
        </>
      ) : null}

      {structured.kind === 'equipment' ? (
        <>
          <Field label={t('instructions.requiredEquipment')} error={errors['structured.requiredEquipment']}>
            <MultiChoice options={EQUIPMENT.map((e) => ({ value: e, label: t(`equipment.${e}`) }))} value={structured.requiredEquipment} onChange={(v) => patch({ requiredEquipment: v })} />
          </Field>
          <Field label={t('instructions.neededByOffsetHours')} error={errors['structured.neededByOffsetHours']}>
            <NumberField value={structured.neededByOffsetHours} onChange={(n) => patch({ neededByOffsetHours: n ?? 0 })} />
          </Field>
        </>
      ) : null}

      {structured.kind === 'caregiver' ? (
        <>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field label={t('instructions.supervisionStart')} error={errors['structured.supervisionStartOffsetHours']}>
                <NumberField value={structured.supervisionStartOffsetHours} onChange={(n) => patch({ supervisionStartOffsetHours: n ?? 0 })} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('instructions.supervisionDuration')} error={errors['structured.supervisionDurationHours']}>
                <NumberField value={structured.supervisionDurationHours} onChange={(n) => patch({ supervisionDurationHours: n ?? 0 })} />
              </Field>
            </View>
          </Row>
          <Field label={t('intake.d.capabilities')}>
            <MultiChoice
              options={(['supervision', 'transport', 'meals', 'basic_tasks'] as const).map((c) => ({ value: c, label: t(`capability.${c}`) }))}
              value={structured.capabilities}
              onChange={(v) => patch({ capabilities: v })}
            />
          </Field>
        </>
      ) : null}

      {structured.kind === 'transportation' ? (
        <>
          <Field label={t('instructions.purpose')}>
            <Choice
              options={[
                { value: 'ride_home', label: t('instructions.ride_home') },
                { value: 'follow_up', label: t('instructions.follow_up_ride') },
              ]}
              value={structured.purpose}
              onChange={(v) => patch({ purpose: v })}
            />
          </Field>
          <Field label={t('instructions.offsetHours')} error={errors['structured.offsetHours']}>
            <NumberField value={structured.offsetHours} onChange={(n) => patch({ offsetHours: n ?? 0 })} />
          </Field>
          <ToggleRow label={t('instructions.escortRequired')} value={structured.escortRequired} onChange={(v) => patch({ escortRequired: v })} />
        </>
      ) : null}

      {structured.kind === 'follow_up' ? (
        <>
          <Field label={t('instructions.offsetHours')} error={errors['structured.offsetHours']}>
            <NumberField value={structured.offsetHours} onChange={(n) => patch({ offsetHours: n ?? 0 })} />
          </Field>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field label={t('instructions.withWhom')} optional optionalLabel={t('common.optional')}>
                <TextField value={structured.withWhom ?? ''} onChangeText={(v) => patch({ withWhom: v || undefined })} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('instructions.location')} optional optionalLabel={t('common.optional')}>
                <TextField value={structured.location ?? ''} onChangeText={(v) => patch({ location: v || undefined })} />
              </Field>
            </View>
          </Row>
          <ToggleRow label={t('instructions.transportRequired')} value={structured.transportRequired} onChange={(v) => patch({ transportRequired: v })} />
        </>
      ) : null}

      {structured.kind === 'wound_care' ? (
        <>
          <Field label={t('instructions.label')} optional optionalLabel={t('common.optional')}>
            <TextField value={structured.label ?? ''} onChangeText={(v) => patch({ label: v || undefined })} />
          </Field>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field label={t('instructions.frequencyHours')} error={errors['structured.frequencyHours']}>
                <NumberField value={structured.frequencyHours} onChange={(n) => patch({ frequencyHours: n })} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('instructions.firstDoseOffsetHours')} optional optionalLabel={t('common.optional')}>
                <NumberField value={structured.firstOffsetHours} onChange={(n) => patch({ firstOffsetHours: n })} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('instructions.durationHours')} optional optionalLabel={t('common.optional')}>
                <NumberField value={structured.durationHours} onChange={(n) => patch({ durationHours: n })} />
              </Field>
            </View>
          </Row>
          <Field label={t('instructions.requiredEquipment')}>
            <MultiChoice options={EQUIPMENT.map((e) => ({ value: e, label: t(`equipment.${e}`) }))} value={structured.requiredEquipment} onChange={(v) => patch({ requiredEquipment: v })} />
          </Field>
          <ToggleRow label={t('instructions.wakingHoursOnly')} value={!!structured.wakingHoursOnly} onChange={(v) => patch({ wakingHoursOnly: v })} />
          <ToggleRow label={t('instructions.timingExplicit')} value={structured.timingExplicit} onChange={(v) => patch({ timingExplicit: v })} hint={t('review.wound_care_timing')} />
        </>
      ) : null}

      {structured.kind === 'diet' ? (
        <>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field label={t('instructions.hydrationHours')} optional optionalLabel={t('common.optional')} error={errors['structured.hydrationReminderHours']}>
                <NumberField value={structured.hydrationReminderHours} onChange={(n) => patch({ hydrationReminderHours: n })} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('instructions.mealHours')} optional optionalLabel={t('common.optional')} error={errors['structured.mealReminderHours']}>
                <NumberField value={structured.mealReminderHours} onChange={(n) => patch({ mealReminderHours: n })} />
              </Field>
            </View>
          </Row>
          <ToggleRow label={t('instructions.wakingHoursOnly')} value={!!structured.wakingHoursOnly} onChange={(v) => patch({ wakingHoursOnly: v })} />
        </>
      ) : null}

      {structured.kind === 'warning_signs' ? (
        <>
          <Field label={t('instructions.signs')} error={errors['structured.signs']}>
            <TextField value={signsText} onChangeText={setSignsText} multiline />
          </Field>
          <Field label={t('instructions.emergency')} error={errors['structured.emergencyInstruction']}>
            <TextField value={structured.emergencyInstruction} onChangeText={(v) => patch({ emergencyInstruction: v })} />
          </Field>
        </>
      ) : null}

      {structured.kind === 'check_in' ? (
        <Field label={t('instructions.offsets')} error={errors['structured.offsetsHours']}>
          <TextField value={offsetsText} onChangeText={setOffsetsText} placeholder="4, 12, 24, 48, 72" />
        </Field>
      ) : null}

      {Object.keys(errors).length ? <Meta color={colors.urgent}>{Object.values(errors)[0]}</Meta> : null}
      <View style={styles.actions}>
        <Button label={t('common.cancel')} variant="quiet" compact onPress={onCancel} />
        <Button label={t('common.save')} variant="hero" compact loading={busy} onPress={() => void submit()} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({ actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.md } });
