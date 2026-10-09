import React from 'react';
import { Redirect } from 'expo-router';
import { PayScreen } from '@/features/PayScreen';
import { useSession } from '@/state/SessionProvider';

export default function PatientPay() {
  const { session } = useSession();
  if (!session?.patientId) return <Redirect href="/patient" />;
  // The patient side republishes the bill from the live plan so caregivers see current numbers.
  return <PayScreen patientId={session.patientId} publish bookHref="/patient/caregivers" />;
}
