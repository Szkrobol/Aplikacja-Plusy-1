import { Enums } from './database.types';

export type ClassStatus = Enums<'class_status'>;

export const CLASS_STATUS_LABELS: Record<ClassStatus, string> = {
  draft: 'Szkic',
  round1_open: 'Zapisy: tura 1',
  round2_open: 'Zapisy: tura 2',
  assigned: 'Przydzielone',
  finished: 'Zakończone',
};

/** Tailwind classes for the status chip. Full class names so Tailwind can detect them. */
export const CLASS_STATUS_CHIP: Record<ClassStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  round1_open: 'bg-emerald-50 text-emerald-800',
  round2_open: 'bg-emerald-50 text-emerald-800',
  assigned: 'bg-sky-50 text-sky-800',
  finished: 'bg-slate-100 text-slate-500',
};

export function isRoundOpen(status: ClassStatus): boolean {
  return status === 'round1_open' || status === 'round2_open';
}
