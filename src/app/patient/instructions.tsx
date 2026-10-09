import { Redirect } from 'expo-router';
import { InstructionsEditor } from '@/features/InstructionsEditor';
import { useSession } from '@/state/SessionProvider';

export default function Instructions() {
  const { session } = useSession();
  if (!session?.patientId) return <Redirect href="/patient" />;
  return <InstructionsEditor patientId={session.patientId} />;
}
