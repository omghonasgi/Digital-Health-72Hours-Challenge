import React from 'react';
import {
  Activity,
  AlertTriangle,
  Bandage,
  Bell,
  Calendar,
  Car,
  Check,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  Footprints,
  HeartHandshake,
  Home,
  Languages,
  LayoutGrid,
  Package,
  PhoneCall,
  Pill,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  Utensils,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import type { GapCategory, TaskCategory } from '@/core/types';
import { colors } from './theme';

export const Icons = {
  Activity,
  AlertTriangle,
  Bandage,
  Bell,
  Calendar,
  Car,
  Check,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  Footprints,
  HeartHandshake,
  Home,
  Languages,
  LayoutGrid,
  Package,
  PhoneCall,
  Pill,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  Utensils,
  Wallet,
  X,
};

/** Icons lead; text follows. Every category and resource has a glyph. */
export const categoryIcon: Record<TaskCategory, LucideIcon> = {
  medication: Pill,
  mobility: Footprints,
  wound_care: Bandage,
  meals_hydration: Utensils,
  caregiver_assistance: HeartHandshake,
  equipment: Package,
  transportation: Car,
  follow_up: Stethoscope,
  check_in: PhoneCall,
};

export const gapIcon: Record<GapCategory, LucideIcon> = {
  equipment: Package,
  caregiving: HeartHandshake,
  transportation: Car,
  financial: Wallet,
  language: Languages,
  medication_access: Pill,
  scheduling: ClipboardList,
  home_accessibility: Home,
};

export function Glyph({ icon: I, size = 20, color = colors.ink }: { icon: LucideIcon; size?: number; color?: string }) {
  return <I size={size} color={color} strokeWidth={1.75} />;
}
