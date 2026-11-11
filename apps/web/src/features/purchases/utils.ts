/**
 * Purchase Order & Procurement Utilities
 * Provides formatting, Indian number-to-words currency conversion, and GST calculations.
 */

export function formatINR(amount: number | string | null | undefined): string {
  const num = Number(amount || 0);
  return `₹ ${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatIndianDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  
  return `${day}-${month}-${year}`;
}

export function formatFullDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Converts numbers to Indian Currency Words format
 * e.g., 34650 -> "INR Thirty Four Thousand Six Hundred Fifty Only"
 */
export function numberToIndianWords(num: number | string | null | undefined): string {
  const value = Number(num || 0);
  if (isNaN(value) || value === 0) return 'INR Zero Only';

  const singleDigits = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const twoDigits = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tensMultiple = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertTwoDigits = (n: number): string => {
    if (n === 0) return '';
    if (n < 10) return singleDigits[n];
    if (n >= 10 && n < 20) return twoDigits[n - 10];
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return `${tensMultiple[tens]}${ones > 0 ? ' ' + singleDigits[ones] : ''}`;
  };

  const convertThreeDigits = (n: number): string => {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let res = '';
    if (hundred > 0) {
      res += `${singleDigits[hundred]} Hundred`;
    }
    if (rest > 0) {
      if (res) res += ' ';
      res += convertTwoDigits(rest);
    }
    return res;
  };

  const integerPart = Math.floor(Math.abs(value));
  const decimalPart = Math.round((Math.abs(value) - integerPart) * 100);

  // Indian Number System: Crores (1,00,00,000), Lakhs (1,00,000), Thousands (1,000), Hundreds (100)
  const crore = Math.floor(integerPart / 10000000);
  const lakh = Math.floor((integerPart % 10000000) / 100000);
  const thousand = Math.floor((integerPart % 100000) / 1000);
  const remainder = integerPart % 1000;

  let words = '';

  if (crore > 0) {
    words += `${convertTwoDigits(crore)} Crore `;
  }
  if (lakh > 0) {
    words += `${convertTwoDigits(lakh)} Lakh `;
  }
  if (thousand > 0) {
    words += `${convertTwoDigits(thousand)} Thousand `;
  }
  if (remainder > 0) {
    words += `${convertThreeDigits(remainder)} `;
  }

  words = words.trim();
  if (!words) words = 'Zero';

  let result = `INR ${words}`;

  if (decimalPart > 0) {
    result += ` and Paise ${convertTwoDigits(decimalPart)}`;
  }

  return `${result} Only`;
}

/**
 * Neutral document header constants (Addendum #9 — no real client data in code).
 */
export const COMPANY_INFO = {
  name: 'ACME INDUSTRIES',
  legalName: 'Acme Industries Pvt. Ltd.',
  addressLine1: 'Plot 12, Industrial Estate Phase II,',
  addressLine2: 'MG Road,',
  addressLine3: 'Indore - 452001, Madhya Pradesh, India',
  phone: '+91 - 000 0000 000',
  email: 'accounts@plinth.example',
  website: 'www.plinth.example',
  gstin: '00AAAAA0000A0Z0',
  state: 'Madhya Pradesh',
  stateCode: '23',
  financialYear: '2026-27',
  jurisdiction: 'SUBJECT TO INDORE JURISDICTION',
};

export const PO_PAYMENT_MODES = [
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
] as const;

export function encodePoPaymentTerms(mode: string, netTermsDays: string | number): string {
  const days = String(netTermsDays ?? '').trim();
  if (!mode && !days) return '';
  const modeLabel = PO_PAYMENT_MODES.find((option) => option.value === mode)?.label || mode;
  return [modeLabel, days ? `Net ${days} days` : ''].filter(Boolean).join(' / ');
}

export function parsePoPaymentTerms(paymentTerms?: string | null): { paymentMode: string; netTermsDays: string } {
  const value = paymentTerms?.trim() || '';
  const paymentMode = PO_PAYMENT_MODES.find((option) =>
    value.toLowerCase().includes(option.label.toLowerCase()) || value.toLowerCase().includes(option.value.toLowerCase())
  )?.value || '';
  const netTermsDays = value.match(/\bnet\s+(\d+)\s*(?:days?)?\b/i)?.[1] || '';
  return { paymentMode, netTermsDays };
}

export function getPoPaymentTerms(po: { paymentTerms?: string | null }): string {
  return po.paymentTerms?.trim() || '';
}

/**
 * Purchase Order In-Progress Creation Draft Key
 */
export const PURCHASE_ORDER_CREATION_DRAFT_KEY = 'plinth_po_creation_draft_v1';

export interface SavedPoWorkspaceLine {
  tempId: string;
  itemSelectorKey: string;
  itemId: string;
  itemType: 'material' | 'product';
  itemName: string;
  uomId: string;
  quantity: string;
  unitPrice: string;
  needDate: string;
  preferredMake: string;
  vendorId?: string;
}

export interface PurchaseOrderCreationDraft {
  departmentId: string;
  needDate: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  vendorId: string;
  paymentTerms?: string;
  paymentMode?: string;
  netTermsDays?: string;
  deliveryLocation: string;
  dispatchedThrough?: string;
  otherReferences?: string;
  termsOfDelivery?: string;
  costCenter: string;
  projectCode: string;
  requestedBudget: string;
  businessJustification: string;
  notes: string;
  lines: SavedPoWorkspaceLine[];
  savedAt: string;
}

export function getSavedPoDraft(): PurchaseOrderCreationDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PURCHASE_ORDER_CREATION_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.lines)) {
      return parsed as PurchaseOrderCreationDraft;
    }
  } catch {
    // Ignore invalid JSON
  }
  return null;
}

export function clearSavedPoDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PURCHASE_ORDER_CREATION_DRAFT_KEY);
  } catch {
    // Ignore localStorage errors
  }
}

export interface VendorAddressData {
  street?: string;
  line1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  pincode?: string;
  country?: string;
  stateCode?: string;
}

export function getVendorDisplayDetails(vendor?: {
  id?: string;
  name?: string;
  code?: string;
  taxNumber?: string | null;
  gstin?: string | null;
  address?: unknown;
} | null) {
  const rawAddr = vendor?.address;
  let addr: VendorAddressData | undefined;

  if (rawAddr && typeof rawAddr === 'object') {
    addr = rawAddr as VendorAddressData;
  } else if (typeof rawAddr === 'string') {
    try {
      addr = JSON.parse(rawAddr) as VendorAddressData;
    } catch {
      addr = { street: rawAddr };
    }
  }

  const street = addr?.street || addr?.line1 || (typeof rawAddr === 'string' ? rawAddr : undefined);
  const city = addr?.city;
  const state = addr?.state;
  const postalCode = addr?.postalCode || addr?.pincode;
  const country = addr?.country;

  const cityStateZip = [
    city,
    state && postalCode ? `${state} - ${postalCode}` : state || postalCode,
    country,
  ].filter(Boolean).join(', ');

  const fullAddress = [street, cityStateZip].filter(Boolean).join('\n') || (street || 'Address not provided');
  const singleLineAddress = [street, city, state, postalCode, country].filter(Boolean).join(', ') || 'Address not provided';
  const gstin = vendor?.gstin || vendor?.taxNumber || '—';
  const stateName = state || '—';
  const stateCode = addr?.stateCode || (gstin && gstin.length >= 2 && !isNaN(Number(gstin.slice(0, 2))) ? gstin.slice(0, 2) : '—');

  return {
    name: vendor?.name || '—',
    code: vendor?.code || '—',
    street,
    cityStateZip,
    fullAddress,
    singleLineAddress,
    gstin,
    stateName,
    stateCode,
  };
}
