import React, { useState } from 'react';
import { View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { InstructionInput } from '@/core/schemas';
import type { ClinicalInstruction } from '@/core/types';
import { addDocument, refreshPlan, saveInstruction } from '@/core/usecases';
import { InstructionCard } from '@/features/InstructionCard';
import { InstructionForm } from '@/features/InstructionForm';
import { PlanState } from '@/features/PlanScreen';
import { useFmt } from '@/features/format';
import { useSession } from '@/state/SessionProvider';
import { useAction, usePlan } from '@/state/usePlan';
import { BOTTOM_BAR_HEIGHT, Body, Button, Card, Chip, ConfirmSheet, Glyph, Icons, Meta, Muted, Row, Screen, Section, colors, space } from '@/ui';

export default function Instructions() {
  const { t } = useTranslation();
  const { session, repo } = useSession();
  const { plan, loading, error, reload } = usePlan(session?.patientId);
  const { busy, error: actionError, run } = useAction();
  const [editing, setEditing] = useState<ClinicalInstruction | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ClinicalInstruction | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const f = useFmt(plan?.patient.timezone ?? 'UTC');

  if (!session?.patientId) return <Redirect href="/patient" />;
  const patientId = session.patientId;

  const attach = () =>
    run(async () => {
      setUploadNote(null);
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const readable = (a.mimeType ?? '').includes('pdf') && (a.size ?? 1) > 0;
      await addDocument(repo, session, patientId, { name: a.name, mimeType: a.mimeType, size: a.size, uri: a.uri }, readable);
      if (!readable) setUploadNote(t('instructions.unreadable'));
      await reload();
    });

  const submit = async (input: InstructionInput) => {
    await run(async () => {
      await saveInstruction(repo, session, input, editing && editing !== 'new' ? editing : undefined);
      setEditing(null);
      await reload();
    });
  };

  return (
    <PlanState loading={loading && !plan} error={error} onRetry={reload}>
      {plan ? (
        <Screen title={t('instructions.title')} subtitle={t('instructions.intro')} bottomInset={BOTTOM_BAR_HEIGHT}>
          <Card>
            <Row>
              <Glyph icon={Icons.FileText} size={20} color={colors.blue} />
              <Body weight="medium" style={{ flex: 1 }}>
                {t('instructions.upload')}
              </Body>
            </Row>
            <Muted>{t('instructions.uploadHelp')}</Muted>
            {plan.documents.map((d) => (
              <Row key={d.id} style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Body numberOfLines={1}>{d.fileName}</Body>
                  <Meta>
                    {t('instructions.attached')} · {f.dateTime(d.uploadedAt)}
                    {d.sizeBytes ? ` · ${Math.round(d.sizeBytes / 1024)} KB` : ''}
                  </Meta>
                </View>
                <Chip label={d.extractionStatus === 'unreadable' ? t('instructions.unreadable').split('.')[0] : t('instructions.attached')} tone={d.extractionStatus === 'unreadable' ? 'caution' : 'good'} dense />
              </Row>
            ))}
            {uploadNote ? <Body color={colors.urgent}>{uploadNote}</Body> : null}
            <Button label={t('instructions.upload')} variant="ghost" compact icon={Icons.FileText} loading={busy && !editing} onPress={attach} />
          </Card>

          {editing ? (
            <InstructionForm patientId={patientId} documents={plan.documents} existing={editing === 'new' ? undefined : editing} onSubmit={submit} onCancel={() => setEditing(null)} busy={busy} />
          ) : (
            <Button label={t('instructions.add')} variant="hero" icon={Icons.ClipboardList} onPress={() => setEditing('new')} />
          )}
          {actionError ? <Body color={colors.urgent}>{actionError}</Body> : null}

          <Section title={`${plan.instructions.length} · ${t('instructions.title')}`}>
            {plan.instructions.length === 0 ? (
              <Card>
                <Muted>{t('common.noItems')}</Muted>
              </Card>
            ) : null}
            {plan.instructions.map((ins) => (
              <InstructionCard key={ins.id} instruction={ins}>
                <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                  <Button label={t('common.edit')} variant="quiet" compact onPress={() => setEditing(ins)} />
                  <Button label={t('common.delete')} variant="quiet" compact onPress={() => setDeleting(ins)} />
                </View>
              </InstructionCard>
            ))}
          </Section>

          <ConfirmSheet
            visible={!!deleting}
            title={t('common.delete')}
            body={deleting?.originalText}
            confirmLabel={t('common.delete')}
            cancelLabel={t('common.cancel')}
            destructive
            onCancel={() => setDeleting(null)}
            onConfirm={() => {
              const target = deleting;
              setDeleting(null);
              if (!target) return;
              void run(async () => {
                await repo.deleteInstruction(target.id);
                await refreshPlan(repo, patientId);
                await reload();
              });
            }}
          />
        </Screen>
      ) : null}
    </PlanState>
  );
}
