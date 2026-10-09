import type { AssistanceStatus, GapStatus, ReadinessStatus, RequirementStatus, TaskStatus } from '@/core/types';
import type { StatusTone } from '@/ui/Chip';

export const taskTone = (s: TaskStatus): StatusTone => {
  switch (s) {
    case 'verified_complete':
      return 'good';
    case 'patient_reported_complete':
    case 'caregiver_reported_complete':
      return 'good';
    case 'awaiting_resources':
    case 'blocked':
      return 'caution';
    case 'missed':
    case 'escalated':
      return 'urgent';
    case 'assigned':
    case 'in_progress':
      return 'blue';
    default:
      return 'neutral';
  }
};

export const gapTone = (s: GapStatus): StatusTone => {
  switch (s) {
    case 'verified_resolved':
      return 'good';
    case 'identified':
    case 'unresolved':
      return 'caution';
    case 'escalated':
      return 'urgent';
    default:
      return 'blue';
  }
};

export const readinessTone = (s: ReadinessStatus): StatusTone =>
  s === 'no_reported_gaps' ? 'good' : s === 'clinical_review_required' ? 'urgent' : s === 'gaps_identified' ? 'caution' : 'blue';

export const requirementTone = (s: RequirementStatus): StatusTone => (s === 'met' ? 'good' : s === 'unmet' ? 'caution' : s === 'review_required' ? 'urgent' : 'blue');

export const assistanceTone = (s: AssistanceStatus): StatusTone => (s === 'approved' ? 'good' : s === 'unavailable' ? 'neutral' : s === 'potentially_eligible' ? 'blue' : 'caution');
