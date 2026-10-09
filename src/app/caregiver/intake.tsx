import { Redirect, useLocalSearchParams } from 'expo-router';
import { IntakeFlow } from '@/features/IntakeFlow';

export default function CaregiverIntake() {
  const { patientId } = useLocalSearchParams<{ patientId?: string | string[] }>();
  const id = Array.isArray(patientId) ? patientId[0] : patientId;
  if (!id) return <Redirect href="/caregiver" />;
  return <IntakeFlow patientId={id} />;
}
