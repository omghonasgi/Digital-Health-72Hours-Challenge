import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ProviderMatch, ServiceRequest } from '@/core/types';
import { Body, Button, Card, Chip, Hairline, Meta, Muted, Row, Icons, StatusDot } from '@/ui';
import { hoursLabel, useFmt } from './format';

interface Props {
  match: ProviderMatch;
  timezone: string;
  request?: ServiceRequest;
  onRequest?: (m: ProviderMatch) => void;
  busy?: boolean;
}

const serviceIcon = { supervision: Icons.HeartHandshake, transport: Icons.Car, meals: Icons.Utensils, basic_tasks: Icons.Home, medication_pickup: Icons.Pill, equipment_delivery: Icons.Package } as const;

/** Provider card: services as glyph chips, reasons as plain sentences, never a match percentage. */
export function ProviderCard({ match, timezone, request, onRequest, busy }: Props) {
  const { t } = useTranslation();
  const f = useFmt(timezone);
  const p = match.provider;
  return (
    <Card>
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Body weight="medium">{p.companyName}</Body>
          <Meta>
            {p.serviceAreaLabel} · {p.languages.map((l) => t(l === 'es' ? 'common.spanish' : 'common.english')).join(' / ')} · {t(`caregivers.verification.${p.verificationStatus}`)}
          </Meta>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Body weight="medium">{t('caregivers.estimate', { amount: match.estimatedCost })}</Body>
          <Meta>
            {t('caregivers.rate', { rate: p.hourlyRate })} · {t('caregivers.minimum', { hours: p.minimumHours })}
          </Meta>
        </View>
      </Row>
      <Row wrap>
        {p.services.map((s) => (
          <Chip key={s} label={t(`capability.${s}`, { defaultValue: t(`resources.${s}`, { defaultValue: s }) })} icon={serviceIcon[s]} dense />
        ))}
      </Row>
      <Hairline />
      <View style={{ gap: 2 }}>
        <Meta>{t('caregivers.why')}</Meta>
        {match.reasons.map((r) => (
          <Muted key={r}>· {t(r)}</Muted>
        ))}
        {match.coveredHours > 0 ? <Muted>· {t('caregivers.covers', { hours: hoursLabel(Math.round(match.coveredHours * 10) / 10) })}</Muted> : null}
        {match.coveredWindows[0] ? <Meta>{f.range(match.coveredWindows[0].start, match.coveredWindows[match.coveredWindows.length - 1].end)}</Meta> : null}
      </View>
      <Meta>{p.qualifications.join(' · ')}</Meta>
      <Meta>
        {p.contactPhone} · {p.contactEmail} · {t('common.simulated')}
      </Meta>
      {request ? (
        <Chip
          label={request.status === 'provider_confirmed' ? t('caregivers.confirmed') : request.status === 'declined' ? t('caregivers.declined') : t('caregivers.requested')}
          tone={request.status === 'provider_confirmed' ? 'good' : request.status === 'declined' ? 'urgent' : 'caution'}
        />
      ) : onRequest ? (
        <Button label={t('caregivers.request')} variant="hero" loading={busy} onPress={() => onRequest(match)} />
      ) : null}
      {!match.withinBudget && !request ? (
        <Row>
          <StatusDot tone="caution" />
          <Meta>{t('finance.gap')}</Meta>
        </Row>
      ) : null}
    </Card>
  );
}
