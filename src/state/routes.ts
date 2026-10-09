import type { Href } from 'expo-router';
import type { Role } from '@/core/types';

export const roleHome = (role: Role): Href => (role === 'patient' ? '/patient' : role === 'caregiver' ? '/caregiver' : '/coordinator');
