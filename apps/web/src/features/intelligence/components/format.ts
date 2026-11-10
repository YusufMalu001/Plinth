import type { ExpectedImpact, Metric } from '../types';

export const asNumber = (value: string | number | null | undefined) => Number(value ?? 0);
export const percent = (value: string | number) => `${(asNumber(value) * 100).toFixed(0)}%`;
export const dateTime = (value: string | Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value));
export const money = (value: string | number, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(asNumber(value));

export function metricValue(metric?: Metric) {
  if (!metric) return '—';
  if (metric.value === null || metric.value === undefined) return 'Unavailable';
  if (metric.currency || metric.unit === 'INR') return money(metric.value, metric.currency ?? 'INR');
  if (metric.unit === 'PERCENT') return percent(metric.value);
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(asNumber(metric.value));
}

export function impactValue(impact?: ExpectedImpact) {
  if (!impact) return 'Not quantified';
  const value = impact.base;
  if (impact.currency || impact.unit === 'INR') return money(value, impact.currency ?? 'INR');
  if (impact.unit === 'PERCENT') return percent(value);
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)} ${impact.unit.toLowerCase()}`;
}
