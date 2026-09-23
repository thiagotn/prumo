// Lucide icons per module (docs/design.md, "Assets"). One map, used by the mobile tab bar and
// anywhere else that needs it.
import {
  CalendarDays,
  ClipboardList,
  FileSignature,
  Gauge,
  Images,
  LayoutGrid,
  MessageCircle,
  Package,
  PieChart,
  Settings,
  Stethoscope,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import type { Module } from '@/lib/modules';

export const MODULE_ICONS: Record<
  Module,
  React.ComponentType<{ size?: number; strokeWidth?: number }>
> = {
  dashboard: Gauge,
  schedule: CalendarDays,
  patients: Users,
  encounter: Stethoscope,
  medicalRecord: ClipboardList,
  photos: Images,
  finance: Wallet,
  inventory: Package,
  reports: PieChart,
  messages: MessageCircle,
  consents: FileSignature,
  settings: Settings,
  tenants: LayoutGrid,
  portal: UserRound,
};
