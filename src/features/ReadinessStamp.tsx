import React from 'react';
import type { ReadinessStatus } from '@/core/types';
import { Stamp, colors } from '@/ui';

const label: Record<ReadinessStatus, string> = {
  no_reported_gaps: 'no gaps',
  gaps_identified: 'gaps',
  assistance_being_arranged: 'arranging',
  clinical_review_required: 'review',
};

const color: Record<ReadinessStatus, string> = {
  no_reported_gaps: colors.good,
  gaps_identified: colors.caution,
  assistance_being_arranged: colors.blue,
  clinical_review_required: colors.urgent,
};

export function ReadinessStamp({ status, size = 72 }: { status: ReadinessStatus; size?: number }) {
  return <Stamp label={label[status]} statusColor={color[status]} size={size} rotate={-8} variant={status === 'no_reported_gaps' ? 'filled' : 'outline'} key={status} />;
}

export const readinessLabel = (status: ReadinessStatus, t: (k: string) => string) => t(`readinessStatus.${status}`);
