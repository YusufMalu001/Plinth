export const formatCurrency = (val: number | string | bigint | null | undefined): string => {
  if (val === null || val === undefined || val === '') return '₹0.00';
  const num = typeof val === 'bigint' ? Number(val) / 100 : Number(val);
  if (isNaN(num)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export const cents = (value: string): bigint => {
  if (!value || !/^-?\d+(?:\.\d{1,2})?$/.test(value)) return 0n;
  const negative = value.startsWith('-');
  const clean = negative ? value.slice(1) : value;
  const [whole, fraction = ''] = clean.split('.');
  const amount = BigInt(whole || '0') * 100n + BigInt((fraction + '00').slice(0, 2));
  return negative ? -amount : amount;
};

export const fromCents = (amount: bigint): string => {
  const absolute = amount < 0n ? -amount : amount;
  const whole = absolute / 100n;
  const cents = (absolute % 100n).toString().padStart(2, '0');
  return `${amount < 0n ? '-' : ''}${whole}.${cents}`;
};

export const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr.slice(0, 10);
  }
};
