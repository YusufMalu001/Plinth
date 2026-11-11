'use client';

import { Checkbox } from '@plinth/ui';
import React, { useState, useMemo, useEffect, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ChevronRight,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  Save,
  UserSquare2,
  Boxes,
  Search,
  X,
  Package,
} from 'lucide-react';
import { Button, PageHeader } from '@plinth/ui';
import { SearchableSelector } from '../../components/ui/SearchableSelector';
import { getCityOptionsForState, STATE_OPTIONS } from '../sales/data/indianStatesAndCities';
import { vendorsApi } from './api';
import { showToast } from '../../components/toast-store';
import { friendlyErrorMessage } from '../../features/auth/access-control';
import { fetchApi } from '../api/client';
import { useCurrentUser } from '../auth/hooks';

type CatalogCategory = { id: string; code: string; name: string };
type CatalogUom = { id: string; code: string; symbol?: string | null; name?: string | null };
type CatalogMaterial = { id: string; code: string; name: string; materialType?: string | null; status?: string; categoryId?: string | null; category?: CatalogCategory | null; uom?: CatalogUom | null; specs?: unknown; isVariant?: boolean; parentMaterialId?: string | null; parentMaterialName?: string | null };
type CatalogProduct = { id: string; sku: string; name: string; status?: string; categoryId?: string | null; category?: CatalogCategory | null; productFamily?: { categoryId?: string | null; category?: CatalogCategory | null; name?: string | null } | null; uom?: CatalogUom | null; metadata?: unknown; isVariant?: boolean; parentProductId?: string | null; parentProductName?: string | null };

async function fetchAllCatalogRows<T>(resource: 'materials' | 'products'): Promise<{ items: T[]; total: number }> {
  const pageSize = 500;
  const items: T[] = [];
  let total = Number.POSITIVE_INFINITY;
  let page = 1;
  while (items.length < total) {
    const result = await fetchApi<{ items: T[]; total: number }>(`/master-data/${resource}?page=${page}&limit=${pageSize}`);
    items.push(...(result.items || []));
    total = Number.isFinite(result.total) ? result.total : items.length;
    if (!result.items?.length) break;
    page += 1;
  }
  return { items, total: items.length };
}

const getCatalogDetails = (value: unknown): string => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return Object.entries(value as Record<string, unknown>)
    .filter(([, detail]) => ['string', 'number', 'boolean'].includes(typeof detail) && String(detail).trim())
    .map(([key, detail]) => `${key}: ${String(detail)}`)
    .join(' · ');
};

interface VendorFormState {
  code: string;
  name: string;
  vendorType: 'MATERIAL' | 'OUTSOURCING';
  sourcingTier: 'TIER_1_STRATEGIC' | 'TIER_2_STANDARD' | 'TIER_3_BACKUP';
  currency: string;
  // Tax & Compliance
  taxNumber: string;
  panNumber: string;
  msmeUdyamNumber: string;
  isoCertification: string;
  tdsCategory: string;
  // Commercial & Payment
  paymentTerms: string;
  leadTimeDays: string;
  creditLimit: string;
  bankName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankBeneficiaryName: string;
  incoterms: string;
  // Contacts & Address
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  notes: string;
}

const INITIAL_FORM: VendorFormState = {
  code: '',
  name: '',
  vendorType: 'MATERIAL',
  sourcingTier: 'TIER_1_STRATEGIC',
  currency: 'INR',
  taxNumber: '',
  panNumber: '',
  msmeUdyamNumber: '',
  isoCertification: '',
  tdsCategory: '',
  paymentTerms: 'Net 30 Days',
  leadTimeDays: '7',
  creditLimit: '',
  bankName: '',
  bankAccountNumber: '',
  bankIfsc: '',
  bankBeneficiaryName: '',
  incoterms: 'FOR Destination (Freight Paid)',
  contactPerson: '',
  contactEmail: '',
  contactPhone: '',
  street: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'India',
  notes: '',
};

const TDS_CATEGORY_OPTIONS = [
  'TDS PROFESSIONAL SERVICES - 194J @ 10%',
  'TDS PURCHASE - 194Q @ 0.1%',
  'TDS RENT - 194I @ 10%',
  'TDS SERVICES COMPANY - 194C @ 2%',
  'TDS SERVICES INDIVIDUAL - 194C @ 1%',
];

export interface VendorCreationWorkspaceProps {
  mode?: 'create' | 'edit';
  editId?: string;
}

export function VendorCreationWorkspace({ mode: initialMode, editId: initialEditId }: VendorCreationWorkspaceProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const roleKey = String(currentUser?.roleDefinition?.key || currentUser?.role || currentUser?.roles?.[0]?.key || '').toLowerCase().replace(/[\s_]+/g, '-');
  const isAdmin = roleKey === 'admin' || roleKey === 'super-admin';

  const isEditMode = initialMode === 'edit' || searchParams?.get('mode') === 'edit';
  const editId = initialEditId || searchParams?.get('editId') || searchParams?.get('id') || '';

  const [form, setForm] = useState<VendorFormState>(INITIAL_FORM);
  const [isCustomTdsCategory, setIsCustomTdsCategory] = useState(false);
  const [customPaymentDays, setCustomPaymentDays] = useState('');
  const [isVendorActive, setIsVendorActive] = useState(true);
  const [isLookingUpPostalCode, setIsLookingUpPostalCode] = useState(false);
  const [postalLookupMessage, setPostalLookupMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({});
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogFilter, setCatalogFilter] = useState<string>('ALL');
  const [isPopulated, setIsPopulated] = useState(false);

  useEffect(() => {
    setIsPopulated(false);
  }, [editId]);

  useEffect(() => {
    if (form.country !== 'India' || !/^\d{6}$/.test(form.postalCode)) {
      setPostalLookupMessage('');
      setIsLookingUpPostalCode(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLookingUpPostalCode(true);
      setPostalLookupMessage('');
      try {
        const response = await fetch(`https://api.postalpincode.in/pincode/${form.postalCode}`, { signal: controller.signal });
        const result = await response.json() as Array<{ Status?: string; PostOffice?: Array<{ District?: string; Name?: string; State?: string; Circle?: string }> }>;
        const office = result[0]?.Status === 'Success' ? result[0]?.PostOffice?.[0] : undefined;
        if (!office) {
          setPostalLookupMessage('No location found for this PIN code.');
          return;
        }
        const stateName = office.State || '';
        const matchedState = STATE_OPTIONS.find((option) => option.name.toLowerCase() === stateName.toLowerCase());
        const cityName = office.District || office.Name || '';
        setForm((previous) => ({
          ...previous,
          state: matchedState?.id || stateName,
          city: cityName,
        }));
        setPostalLookupMessage('Location filled from PIN code.');
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setPostalLookupMessage('Location lookup is unavailable. Enter the city and state manually.');
      } finally {
        if (!controller.signal.aborted) setIsLookingUpPostalCode(false);
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.postalCode, form.country]);
  const {
    data: materialCatalog,
    isLoading: materialsLoading,
    error: materialsError,
    refetch: refetchMaterials,
  } = useQuery({
    queryKey: ['vendor-create-materials'],
    queryFn: () => fetchAllCatalogRows<CatalogMaterial>('materials'),
  });

  const {
    data: productCatalog,
    isLoading: productsLoading,
    error: productsError,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ['vendor-create-products'],
    queryFn: () => fetchAllCatalogRows<CatalogProduct>('products'),
  });
  const { data: existingVendor, isLoading: vendorLoading } = useQuery({
    queryKey: ['vendor-edit', editId],
    queryFn: () => vendorsApi.profile(editId),
    enabled: Boolean(isEditMode && editId),
  });

  // Populate form with existing vendor details in edit mode
  useEffect(() => {
    if (!isEditMode || !existingVendor || isPopulated) return;

    const rawAddr = existingVendor.address as Record<string, unknown> | null | undefined;
    const street = String(rawAddr?.street || rawAddr?.line1 || '');
    const city = String(rawAddr?.city || '');
    const state = String(rawAddr?.state || '');
    const postalCode = String(rawAddr?.postalCode || rawAddr?.pincode || '');
    const country = String(rawAddr?.country || 'India');

    const primaryContact = Array.isArray(existingVendor.contacts) && existingVendor.contacts.length > 0
      ? existingVendor.contacts[0]
      : null;
    const contactPerson = primaryContact && typeof primaryContact === 'object' && 'name' in primaryContact
      ? String(primaryContact.name || '')
      : '';
    const contactEmail = existingVendor.contactEmail || (primaryContact && typeof primaryContact === 'object' && 'email' in primaryContact ? String(primaryContact.email || '') : '');
    const contactPhone = existingVendor.contactPhone || (primaryContact && typeof primaryContact === 'object' && 'phone' in primaryContact ? String(primaryContact.phone || '') : '');

    const tdsCategory = String(rawAddr?.tdsCategory || '');
    setForm({
      code: existingVendor.code || '',
      name: existingVendor.name || '',
      vendorType: rawAddr?.vendorType === 'OUTSOURCING' ? 'OUTSOURCING' : 'MATERIAL',
      sourcingTier: (rawAddr?.sourcingTier as VendorFormState['sourcingTier']) || 'TIER_1_STRATEGIC',
      currency: existingVendor.currency || 'INR',
      taxNumber: existingVendor.taxNumber || existingVendor.taxId || '',
      panNumber: String(rawAddr?.panNumber || ''),
      msmeUdyamNumber: String(rawAddr?.msmeUdyamNumber || ''),
      isoCertification: String(rawAddr?.isoCertification || ''),
      tdsCategory,
      paymentTerms: existingVendor.paymentTerms || 'Net 30 Days',
      leadTimeDays: existingVendor.leadTimeDays != null ? String(existingVendor.leadTimeDays) : '7',
      creditLimit: String(rawAddr?.creditLimit || ''),
      bankName: String(rawAddr?.bankName || ''),
      bankAccountNumber: String(rawAddr?.bankAccountNumber || ''),
      bankIfsc: String(rawAddr?.bankIfsc || ''),
      bankBeneficiaryName: String(rawAddr?.bankBeneficiaryName || ''),
      incoterms: String(rawAddr?.incoterms || 'FOR Destination (Freight Paid)'),
      contactPerson,
      contactEmail,
      contactPhone,
      street,
      city,
      state,
      postalCode,
      country,
      notes: String(rawAddr?.notes || ''),
    });
    setIsCustomTdsCategory(Boolean(tdsCategory && !TDS_CATEGORY_OPTIONS.includes(tdsCategory)));
    setIsVendorActive(existingVendor.status === 'ACTIVE');
    const termsMatch = existingVendor.paymentTerms?.match(/(\d+)/);
    setCustomPaymentDays(termsMatch && !['15', '30', '60'].includes(termsMatch[1]) ? termsMatch[1] : '');

    // Populate capabilities/materials
    setSelectedItems([]);
    setItemPrices({});
    if (Array.isArray(existingVendor.capabilities) && existingVendor.capabilities.length > 0) {
      const initialKeys: string[] = [];
      const initialPrices: Record<string, string> = {};

      for (const cap of existingVendor.capabilities) {
        const itemKey = cap.materialId
          ? `material:${cap.materialId}`
          : cap.productId
            ? `product:${cap.productId}`
            : null;
        if (itemKey) {
          initialKeys.push(itemKey);
          if (cap.unitPrice != null) {
            initialPrices[itemKey] = String(Number(cap.unitPrice));
          }
        }
      }
      setSelectedItems(initialKeys);
      setItemPrices(initialPrices);
    }

    setIsPopulated(true);
  }, [isEditMode, existingVendor, isPopulated]);

  const handleChange = (field: keyof VendorFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePriceChange = (key: string, value: string) => {
    setItemPrices((prev) => ({ ...prev, [key]: value }));
  };

  // Unified Catalog Items
  const allCatalogItems = useMemo(() => {
    const materials = (materialCatalog?.items || []).map((m) => {
      const rawMatType = String(m.materialType || '').toUpperCase();
      const specs = m.specs && typeof m.specs === 'object' ? m.specs as Record<string, unknown> : {};
      // For materials, the material master classification is authoritative. The
      // linked category can be a broad/legacy bucket (for example "Product").
      const materialCategory = rawMatType
        ? rawMatType.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
        : m.category?.name || m.category?.code || 'Uncategorized';
      const catalogClassification = `${rawMatType} ${m.category?.name || ''} ${m.category?.code || ''} ${m.name}`.toLowerCase();
      const isHardware = /hardware|fastener/.test(catalogClassification) || Boolean(m.name.toLowerCase().match(/(bolt|screw|rivet|rod|pin|nut)/));
      const isPackaging = /packaging/.test(catalogClassification) || Boolean(m.name.toLowerCase().match(/(box|pallet|bag|carton|cap|wrap)/));
      const isOutsourcing = /outsource|service|processing/.test(catalogClassification) || Boolean(m.name.toLowerCase().match(/(plating|buffing|machin|coat)/));

      let displayType = 'Raw Material';
      if (isHardware) {
        displayType = 'Hardware & Fasteners';
      } else if (isPackaging) {
        displayType = 'Packaging';
      } else if (isOutsourcing) {
        displayType = 'Outsource Processing';
      }

      return {
        key: `material:${m.id}`,
        id: m.id,
        parentId: m.parentMaterialId || (typeof specs.parentMaterialId === 'string' ? specs.parentMaterialId : ''),
        parentName: m.parentMaterialName || '',
        type: 'MATERIAL' as const,
        rawMaterialType: m.materialType,
        displayType,
        code: m.code,
        name: m.name,
        isVariant: Boolean(m.isVariant || specs.isVariant || m.name.includes(' — ')),
        categoryName: materialCategory,
        categoryCode: m.category?.code || '',
        uomName: m.uom?.symbol || m.uom?.name || m.uom?.code || '—',
        status: m.status || '',
        detailText: getCatalogDetails(m.specs),
      };
    });
    const products = (productCatalog?.items || []).map((p) => {
      const category = p.category || p.productFamily?.category;
      const rawCatName = (category?.name || category?.code || '').toLowerCase();
      const isSemi =
        rawCatName.includes('semi') ||
        p.name.toLowerCase().includes('semi') ||
        (p.sku && p.sku.toLowerCase().includes('semi'));
      const isRawOrPkg =
        rawCatName.includes('raw') ||
        rawCatName.includes('packaging') ||
        rawCatName.includes('consumables') ||
        rawCatName.includes('hardware');
      const displayType = isSemi ? 'Semi-Finished Goods' : isRawOrPkg ? 'Raw Material' : 'Finished Goods';

      return {
        key: `product:${p.id}`,
        id: p.id,
        parentId: p.parentProductId || String((p.metadata as Record<string, unknown> | null)?.parentProductId || ''),
        parentName: p.parentProductName || '',
        type: 'PRODUCT' as const,
        rawMaterialType: undefined as string | undefined,
        displayType,
        code: p.sku,
        name: p.name,
        isVariant: Boolean(p.isVariant || (p.metadata && typeof p.metadata === 'object' && (p.metadata as Record<string, unknown>).isVariant) || p.name.includes(' — ')),
        categoryName: isSemi ? 'Semi-Finished' : isRawOrPkg ? 'Raw Material' : 'Finished Goods',
        categoryCode: category?.code || '',
        uomName: p.uom?.symbol || p.uom?.name || p.uom?.code || '—',
        status: p.status || '',
        detailText: getCatalogDetails((p.metadata as Record<string, unknown> | null)?.specifications),
      };
    });
    const merged = [...materials, ...products];
    const byId = new Map(merged.map((item) => [item.id, item]));
    merged.forEach((item) => {
      if (item.parentId && !item.parentName) item.parentName = byId.get(item.parentId)?.name || '';
    });
    return merged.sort((a, b) => {
      const aGroup = a.parentId || a.id;
      const bGroup = b.parentId || b.id;
      const parentA = byId.get(aGroup)?.name || a.name;
      const parentB = byId.get(bGroup)?.name || b.name;
      return parentA.localeCompare(parentB) || Number(a.isVariant) - Number(b.isVariant) || a.name.localeCompare(b.name);
    });
  }, [materialCatalog?.items, productCatalog?.items]);

  // Available items filtered by vendor type (Outsourcing vendors strictly see only Finished and Semi-Finished goods)
  const scopedCatalogItems = useMemo(() => {
    if (form.vendorType === 'OUTSOURCING') {
      return allCatalogItems.filter(
        (item) => item.displayType === 'Finished Goods' || item.displayType === 'Semi-Finished Goods'
      );
    }
    return allCatalogItems;
  }, [allCatalogItems, form.vendorType]);

  // Filtered Catalog Items based on search and type filter
  const visibleCatalogItems = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    return scopedCatalogItems.filter((item) => {
      // Filter selection
      if (catalogFilter === 'SELECTED' && !selectedItems.includes(item.key)) return false;
      if (form.vendorType === 'OUTSOURCING') {
        if (catalogFilter === 'FINISHED_GOODS' && item.displayType !== 'Finished Goods') return false;
        if (catalogFilter === 'SEMI_FINISHED' && item.displayType !== 'Semi-Finished Goods') return false;
      } else {
        if (catalogFilter === 'RAW_MATERIALS' && (item.type !== 'MATERIAL' || item.displayType !== 'Raw Material')) return false;
        if (catalogFilter === 'FINISHED_GOODS' && item.type !== 'PRODUCT') return false;
        if (catalogFilter === 'HARDWARE' && (item.type !== 'MATERIAL' || item.displayType !== 'Hardware & Fasteners')) return false;
        if (catalogFilter === 'PACKAGING' && (item.type !== 'MATERIAL' || item.displayType !== 'Packaging')) return false;
        if (catalogFilter === 'OUTSOURCING' && (item.type !== 'MATERIAL' || item.displayType !== 'Outsource Processing')) return false;
      }

      // Text search
      if (!query) return true;
      return `${item.name} ${item.code} ${item.categoryName} ${item.categoryCode}`.toLowerCase().includes(query);
    });
  }, [scopedCatalogItems, catalogSearch, catalogFilter, selectedItems, form.vendorType]);
  const toggleItem = (key: string) => {
    setSelectedItems((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSelectAllVisible = () => {
    const keysToAdd = visibleCatalogItems.map((item) => item.key);
    setSelectedItems((prev) => Array.from(new Set([...prev, ...keysToAdd])));
  };

  const handleClearSelection = () => {
    setSelectedItems([]);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const focusField = (selector: string) => {
      const field = document.querySelector<HTMLElement>(selector);
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => field?.focus(), 250);
    };
    if (!form.name.trim()) {
      showToast({
        kind: 'error',
        title: 'Vendor Trading Name Required',
        message: 'Specify trade or company name.',
      });
      focusField('[name="vendorName"]');
      return;
    }
    if (!form.contactPerson.trim() || !form.contactPhone.trim() || !form.street.trim() || !form.city.trim() || !form.state.trim() || !form.postalCode.trim() || !form.country.trim()) {
      showToast({ kind: 'error', title: 'Contact and Dispatch Details Required', message: 'Complete the key contact and dispatch address fields before saving.' });
      const requiredSelectors = [
        !form.contactPerson.trim() && '[name="contactPerson"]', !form.contactEmail.trim() && '[name="contactEmail"]',
        !form.contactPhone.trim() && '[name="contactPhone"]', !form.street.trim() && '[name="street"]',
        !form.state.trim() && '[data-vendor-state] button', !form.city.trim() && '[data-vendor-city] button',
        !form.postalCode.trim() && '[name="postalCode"]', !form.country.trim() && '[name="country"]',
      ].filter(Boolean);
      if (requiredSelectors[0]) focusField(String(requiredSelectors[0]));
      return;
    }
    if (!form.contactEmail.trim()) {
      showToast({
        kind: 'error',
        title: 'PO Delivery Email Required',
        message: 'Provide a valid email address for purchase order delivery.',
      });
      focusField('[name="contactEmail"]');
      return;
    }
    if (form.country === 'India' && !/^\d{6}$/.test(form.postalCode)) {
      showToast({ kind: 'error', title: 'Invalid PIN Code', message: 'Enter a valid six-digit Indian PIN code.' });
      focusField('[name="postalCode"]');
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(form.contactEmail.trim())) {
      showToast({
        kind: 'error',
        title: 'Invalid Email Address',
        message: 'Please enter a valid email address (e.g. orders@supplier.com).',
      });
      focusField('[name="contactEmail"]');
      return;
    }
    const itemMissingPrice = selectedItems.some((key) => {
      const rawPrice = itemPrices[key]?.trim();
      return !rawPrice || !Number.isFinite(Number(rawPrice)) || Number(rawPrice) < 0;
    });
    if (itemMissingPrice) {
      showToast({ kind: 'error', title: 'Price Required', message: 'Enter a valid price for every selected catalog item.' });
      setCatalogFilter('SELECTED');
      window.setTimeout(() => {
        const firstMissingKey = selectedItems.find((key) => {
          const rawPrice = itemPrices[key]?.trim();
          return !rawPrice || !Number.isFinite(Number(rawPrice)) || Number(rawPrice) < 0;
        });
        const field = firstMissingKey ? document.querySelector<HTMLInputElement>(`[data-vendor-price="${CSS.escape(firstMissingKey)}"]`) : null;
        field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        field?.focus();
      }, 100);
      return;
    }
    if (form.paymentTerms === 'CUSTOM' && (!customPaymentDays || Number(customPaymentDays) < 1)) {
      showToast({ kind: 'error', title: 'Payment Term Required', message: 'Enter the custom payment term in days.' });
      focusField('[name="customPaymentDays"]');
      return;
    }
    setIsSaving(true);
    try {
      const address = {
        street: form.street.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        postalCode: form.postalCode.trim(),
        country: form.country.trim(),
        vendorType: form.vendorType,
        sourcingTier: form.sourcingTier,
        panNumber: form.panNumber.trim(),
        msmeUdyamNumber: form.msmeUdyamNumber.trim(),
        isoCertification: form.isoCertification.trim(),
        tdsCategory: form.tdsCategory.trim(),
        creditLimit: form.creditLimit.trim(),
        bankName: form.bankName.trim(),
        bankAccountNumber: form.bankAccountNumber.trim(),
        bankIfsc: form.bankIfsc.trim(),
        bankBeneficiaryName: form.bankBeneficiaryName.trim(),
        incoterms: form.incoterms,
        notes: form.notes.trim(),
      };

      const capabilities = selectedItems.map((item) => {
        const unitPrice = Number(itemPrices[item]);

        return item.startsWith('material:')
          ? { materialId: item.slice(9), unitPrice }
          : { productId: item.slice(8), unitPrice };
      });

      if (isEditMode && editId) {
        const updatePayload = {
          name: form.name.trim(),
          currency: form.currency || 'INR',
          taxNumber: form.taxNumber.trim() || undefined,
          contactPerson: form.contactPerson.trim(),
          contactEmail: form.contactEmail.trim(),
          contactPhone: form.contactPhone.trim(),
          paymentTerms: form.paymentTerms === 'CUSTOM' ? (customPaymentDays ? `Net ${customPaymentDays} Days` : undefined) : form.paymentTerms.trim() || undefined,
          leadTimeDays: parseInt(form.leadTimeDays, 10) || 0,
          capabilities,
          address,
          addresses: [address],
        };

        await vendorsApi.update(editId, updatePayload);
        if (isAdmin && existingVendor?.status && (existingVendor.status === 'ACTIVE') !== isVendorActive) {
          await vendorsApi.transitionStatus(editId, isVendorActive ? 'ACTIVE' : 'INACTIVE');
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['vendor-profile', editId] }),
          queryClient.invalidateQueries({ queryKey: ['vendor-raw', editId] }),
          queryClient.invalidateQueries({ queryKey: ['vendor-edit', editId] }),
          queryClient.invalidateQueries({ queryKey: ['vendors'] }),
          queryClient.invalidateQueries({ queryKey: ['master-data', 'procurement-selectors'] }),
          queryClient.invalidateQueries({ queryKey: ['approved-vendors'] }),
        ]);
        const [refreshedProfile, refreshedVendor] = await Promise.all([
          vendorsApi.profile(editId),
          vendorsApi.getById(editId),
        ]);
        // Set the authoritative server response after invalidation so the
        // profile page opens with the saved contact and capability data.
        queryClient.setQueryData(['vendor-profile', editId], refreshedProfile);
        queryClient.setQueryData(['vendor-raw', editId], refreshedVendor);

        showToast({
          kind: 'success',
          title: 'Vendor Updated',
          message: `${form.name} details have been successfully updated.`,
        });
        router.push(`/vendors/${editId}`);
      } else {
        const payload = {
          name: form.name.trim(),
          contactPerson: form.contactPerson.trim(),
          currency: form.currency || 'INR',
          taxNumber: form.taxNumber.trim() || undefined,
          contactEmail: form.contactEmail.trim(),
          contactPhone: form.contactPhone.trim(),
          paymentTerms: form.paymentTerms === 'CUSTOM' ? (customPaymentDays ? `Net ${customPaymentDays} Days` : undefined) : form.paymentTerms.trim() || undefined,
          leadTimeDays: parseInt(form.leadTimeDays, 10) || 0,
          capabilities,
          address,
          addresses: [address],
        };

        const result = await vendorsApi.create(payload);
        if (isAdmin && !isVendorActive) await vendorsApi.transitionStatus(result.id, 'INACTIVE');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['vendors'] }),
          queryClient.invalidateQueries({ queryKey: ['master-data', 'procurement-selectors'] }),
        ]);
        showToast({
          kind: 'success',
          title: isAdmin ? 'Vendor Created' : 'Vendor Submitted for Approval',
          message: isAdmin ? `${payload.name} is active and available for procurement.` : `${payload.name} is saved as a draft and awaiting admin approval.`,
        });
        router.push(`/vendors/${result.id}`);
      }
    } catch (err) {
      const message = friendlyErrorMessage(err);
      const isDuplicateName = !isEditMode && /vendor named .* already exists/i.test(message);
      showToast({
        kind: 'error',
        title: isEditMode ? 'Update Failed' : isDuplicateName ? 'Vendor Name Already Exists' : 'Vendor Registration Failed',
        message,
      });
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto bg-muted/15 min-h-screen">
      <div className="w-full max-w-[1680px] mx-auto space-y-6">
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/procurement" className="hover:text-primary transition-colors">
            Procurement
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href="/vendors" className="hover:text-primary transition-colors">
            Vendors Directory
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          {isEditMode ? (
            <>
              <Link href={`/vendors/${editId}`} className="hover:text-primary transition-colors">
                {form.name || 'Vendor Profile'}
              </Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="font-semibold text-foreground">Edit Vendor</span>
            </>
          ) : (
            <span className="font-semibold text-foreground">Create Vendor</span>
          )}
        </nav>

        {/* Page Header */}
        <PageHeader
          title={isEditMode ? `Edit Vendor: ${form.name || 'Vendor'}` : 'Create Vendor'}
          actions={
            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(isEditMode && editId ? `/vendors/${editId}` : '/vendors')}
                className="h-9 rounded-lg text-xs font-semibold shadow-none"
                icon={ArrowLeft}
              >
                {isEditMode ? 'Back to profile' : 'Back to directory'}
              </Button>
              {!isEditMode && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setForm(INITIAL_FORM);
                    setIsCustomTdsCategory(false);
                  }}
                  className="h-9 rounded-lg text-xs font-semibold shadow-none"
                  icon={RotateCcw}
                >
                  Reset
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isSaving || (isEditMode && vendorLoading)}
                className="h-9 rounded-lg text-xs font-medium shadow-none"
                icon={Save}
              >
                {isSaving
                  ? (isEditMode ? 'Saving Changes...' : 'Creating...')
                  : (isEditMode ? 'Save Changes' : isAdmin ? 'Create Active Vendor' : 'Submit for Approval')}
              </Button>
            </div>
          }
        />

        {/* Form Container: Responsive Wide Layout */}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">

          {/* ========================================================= */}
          {/* LEFT COLUMN (8 Columns): Primary Identity, Unified Catalog & Contacts */}
          {/* ========================================================= */}
          <div className="contents">

            {/* 1. CORPORATE IDENTITY & LEGAL PROFILE */}
            <div className="order-1 bg-card rounded-xl border border-border shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-border/70 flex flex-wrap items-center justify-between gap-3 bg-card">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-white font-mono text-xs font-black shadow-xs ring-2 ring-primary/20">
                    01
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground tracking-tight flex items-center gap-2">
                      Corporate Identity & Entity Profile
                    </h2>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                      Trading / Operating Name <span className="text-destructive">*</span>
                    </label>
                    <input
                      name="vendorName"
                      type="text"
                      required
                      placeholder="e.g. Apex Steel Corp"
                      value={form.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-input bg-background text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                      Vendor Type
                    </label>
                    <select
                      value={form.vendorType}
                      onChange={(e) => handleChange('vendorType', e.target.value as VendorFormState['vendorType'])}
                      className="w-full h-9 px-3 rounded-lg border border-input bg-background text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                    >
                      <option value="MATERIAL">1. Material Supplier</option>
                      <option value="OUTSOURCING">2. Job-Work and Outsourcing</option>
                    </select>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 px-4 py-2.5">
                      <div>
                        <p className="text-xs font-semibold text-foreground">Vendor status</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{isVendorActive ? 'Available for purchase orders' : 'Hidden from purchasing workflows'}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isVendorActive}
                        aria-label="Vendor active status"
                        onClick={() => setIsVendorActive((active) => !active)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${isVendorActive ? 'border-primary bg-primary' : 'border-border bg-muted'}`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${isVendorActive ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                    Vendor Capability & Sourcing Profile Summary
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter production capacities, approved grades, delivery SLA agreements, or special sourcing notes..."
                    value={form.notes}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    className="w-full p-3 rounded-lg border border-input bg-background text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-y transition-all"
                  />
                </div>
              </div>
            </div>

            {/* 2. UNIFIED SUPPLIED CATALOG (COMBINED MATERIALS & PRODUCTS) */}
            <div className="order-5 xl:col-span-2 bg-card rounded-xl border border-border shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-border/70 flex flex-wrap items-center justify-between gap-3 bg-card">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-white font-mono text-xs font-black shadow-xs ring-2 ring-primary/20">
                    05
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground tracking-tight flex items-center gap-2">
                      {form.vendorType === 'OUTSOURCING' ? 'Outsourced Items' : 'Supplied Items Catalog'}
                    </h2>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
                  <div className="min-w-0 space-y-4">
                {/* Search Bar & Category Filter Pills */}
                <div className="flex flex-col gap-3">
                  {/* Search Input (Top Line) */}
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                      type="search"
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      placeholder="Search items by name..."
                      className="w-full h-9 pl-9 pr-8 rounded-lg border border-input bg-background text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                    {catalogSearch && (
                      <button
                        type="button"
                        onClick={() => setCatalogSearch('')}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCatalogFilter('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${catalogFilter === 'ALL'
                          ? 'bg-primary text-white font-bold'
                          : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/80'
                        }`}
                    >
                      All ({scopedCatalogItems.length})
                    </button>

                    {form.vendorType === 'OUTSOURCING' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setCatalogFilter('FINISHED_GOODS')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${catalogFilter === 'FINISHED_GOODS'
                              ? 'bg-primary text-white font-bold'
                              : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/80'
                            }`}
                        >
                          Finished Goods ({scopedCatalogItems.filter((i) => i.displayType === 'Finished Goods').length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setCatalogFilter('SEMI_FINISHED')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${catalogFilter === 'SEMI_FINISHED'
                              ? 'bg-primary text-white font-bold'
                              : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/80'
                            }`}
                        >
                          Semi-Finished Goods ({scopedCatalogItems.filter((i) => i.displayType === 'Semi-Finished Goods').length})
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setCatalogFilter('RAW_MATERIALS')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${catalogFilter === 'RAW_MATERIALS'
                              ? 'bg-primary text-white font-bold'
                              : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/80'
                            }`}
                        >
                          Raw Materials ({scopedCatalogItems.filter((i) => i.displayType === 'Raw Material').length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setCatalogFilter('HARDWARE')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${catalogFilter === 'HARDWARE'
                              ? 'bg-primary text-white font-bold'
                              : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/80'
                            }`}
                        >
                          Hardware &amp; Fasteners ({scopedCatalogItems.filter((i) => i.displayType === 'Hardware & Fasteners').length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setCatalogFilter('PACKAGING')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${catalogFilter === 'PACKAGING'
                              ? 'bg-primary text-white font-bold'
                              : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/80'
                            }`}
                        >
                          Packaging ({scopedCatalogItems.filter((i) => i.displayType === 'Packaging').length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setCatalogFilter('OUTSOURCING')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${catalogFilter === 'OUTSOURCING'
                              ? 'bg-primary text-white font-bold'
                              : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/80'
                            }`}
                        >
                          Outsource Processing ({scopedCatalogItems.filter((i) => i.displayType === 'Outsource Processing').length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setCatalogFilter('FINISHED_GOODS')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${catalogFilter === 'FINISHED_GOODS'
                              ? 'bg-primary text-white font-bold'
                              : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/80'
                            }`}
                        >
                          Products ({scopedCatalogItems.filter((i) => i.type === 'PRODUCT').length})
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setCatalogFilter('SELECTED')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${catalogFilter === 'SELECTED'
                          ? 'bg-primary text-white font-bold'
                          : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/80'
                        }`}
                    >
                      Selected ({selectedItems.length})
                    </button>
                  </div>
                </div>

                {/* Quick Selection Actions Toolbar */}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/60">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      Showing {visibleCatalogItems.length} of {scopedCatalogItems.length} items
                    </span>
                    {catalogSearch && (
                      <span className="text-[11px] bg-muted px-2 py-0.5 rounded text-foreground font-mono">
                        &quot;{catalogSearch}&quot;
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllVisible}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Select all visible ({visibleCatalogItems.length})
                    </button>
                    {selectedItems.length > 0 && (
                      <>
                        <span className="text-border">|</span>
                        <button
                          type="button"
                          onClick={handleClearSelection}
                          className="text-xs font-semibold text-destructive hover:underline"
                        >
                          Clear all ({selectedItems.length})
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Unified Items Scrollable List */}
                <div className="rounded-xl border border-border bg-background overflow-hidden shadow-2xs">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-muted/40 border-b border-border/80 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <div className="col-span-1 flex items-center justify-center">Select</div>
                    <div className="col-span-2">Category</div>
                    <div className="col-span-6">Item Name</div>
                    <div className="col-span-3 text-right pr-2">Price (₹)</div>
                  </div>

                  {/* Table Body / Scrollable Area */}
                  <div className="max-h-[560px] overflow-y-auto divide-y divide-border/60">
                    {materialsLoading || productsLoading ? (
                      <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
                        <Boxes className="w-6 h-6 animate-pulse mx-auto text-primary" />
                        <p>Loading catalog items…</p>
                      </div>
                    ) : materialsError || productsError ? (
                      <div className="p-8 text-center text-xs text-destructive space-y-2">
                        <p>Unable to load catalog items from master-data service.</p>
                        <button
                          type="button"
                          onClick={() => {
                            void refetchMaterials();
                            void refetchProducts();
                          }}
                          className="px-3 py-1 rounded bg-destructive/10 text-destructive font-semibold hover:bg-destructive/20 text-xs"
                        >
                          Retry Loading
                        </button>
                      </div>
                    ) : visibleCatalogItems.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground space-y-1">
                        <Package className="w-6 h-6 mx-auto text-muted-foreground/60" />
                        <p className="font-semibold text-foreground">No catalog items found</p>
                        <p className="text-[11px]">
                          {catalogSearch
                            ? `No materials or products match "${catalogSearch}". Try broadening your search.`
                            : catalogFilter === 'SELECTED'
                              ? 'No items have been selected yet. Switch to "All" to browse items.'
                              : 'No items are registered in the system yet.'}
                        </p>
                      </div>
                    ) : (
                      visibleCatalogItems.map((item) => {
                        const isSelected = selectedItems.includes(item.key);
                        const price = itemPrices[item.key] ?? '';
                        return (
                          <div
                            key={item.key}
                            onClick={() => toggleItem(item.key)}
                            className={`grid grid-cols-12 gap-3 px-4 py-2.5 items-center text-xs cursor-pointer transition-colors ${item.parentId ? 'border-l-2 border-l-primary/30 pl-6' : ''} ${isSelected
                                ? 'bg-primary/[0.06] hover:bg-primary/[0.09]'
                                : 'hover:bg-muted/40'
                              }`}
                          >
                            {/* Checkbox */}
                            <div className="col-span-1 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                              <Checkbox

                                checked={isSelected}
                                onChange={() => toggleItem(item.key)}
                                className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer"
                              />
                            </div>

                            {/* Category */}
                            <div className="col-span-2">
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                                  item.displayType === 'Semi-Finished Goods'
                                    ? 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-500/20'
                                    : item.displayType === 'Finished Goods'
                                      ? 'bg-primary/10 text-primary border-primary/20'
                                      : item.displayType === 'Hardware & Fasteners'
                                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-900'
                                        : item.displayType === 'Packaging'
                                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-900'
                                          : item.displayType === 'Outsource Processing'
                                            ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 border border-orange-200 dark:border-orange-900'
                                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
                                }`}
                              >
                                {item.categoryName}
                              </span>
                            </div>

                            {/* Item Name */}
                            <div className="col-span-6 flex min-w-0 items-center gap-2">
                              <span className="truncate font-semibold text-foreground" title={item.name}>{item.name}</span>
                              {item.isVariant && <span className="shrink-0 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[9px] font-semibold text-primary">↳ Variant of {item.parentName || 'parent item'}</span>}
                            </div>

                            {/* Price input column */}
                            <div
                              className="col-span-3 flex items-center justify-end gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="relative flex items-center w-36">
                                <span className="absolute left-2.5 text-xs font-bold text-muted-foreground select-none pointer-events-none">
                                  ₹
                                </span>
                                <input
                                  data-vendor-price={item.key}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  required={isSelected}
                                  placeholder={isSelected ? 'Required' : '0.00'}
                                  value={price}
                                  onChange={(e) => {
                                    handlePriceChange(item.key, e.target.value);
                                    if (!isSelected) {
                                      toggleItem(item.key);
                                    }
                                  }}
                                  className="w-full h-8 pl-6 pr-2.5 text-right font-mono font-medium text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                                  aria-label={`Price for ${item.name}`}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                  </div>
                  <aside className="rounded-xl border border-border bg-muted/20 p-5 xl:sticky xl:top-4">
                    <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Selected Items</h3>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{isEditMode ? 'Update item prices and selection.' : 'Items and prices saved with this vendor.'}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {selectedItems.length > 0 && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">{selectedItems.length} selected</span>}
                        {selectedItems.length > 0 && <button type="button" onClick={handleClearSelection} className="text-[11px] font-medium text-muted-foreground hover:text-foreground">Clear</button>}
                      </div>
                    </div>
                    <div className="mt-3 max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
                      {selectedItems.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border bg-card px-3 py-6 text-center text-xs text-muted-foreground">
                          Select catalog items to add them here.
                        </p>
                      ) : selectedItems.map((key) => {
                        const item = allCatalogItems.find((entry) => entry.key === key);
                        if (!item) return null;
                        const rawPrice = itemPrices[key]?.trim();
                        const hasPrice = Boolean(rawPrice) && Number.isFinite(Number(rawPrice)) && Number(rawPrice) >= 0;
                        return (
                          <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-border/80 bg-card px-3 py-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="min-w-0 truncate text-xs font-semibold text-foreground" title={item.name}>{item.name}</p>
                                {item.isVariant && <span className="shrink-0 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[9px] font-semibold text-primary">Variant</span>}
                              </div>
                              <div className="min-w-[74px] text-right">
                                {hasPrice ? (
                                  <span className="font-mono text-xs font-semibold text-foreground">₹{Number(rawPrice).toFixed(2)}</span>
                                ) : (
                                  <span className="text-[10px] font-medium text-destructive">Required</span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleItem(key)}
                                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                aria-label={`Remove ${item.name}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                          </div>
                        );
                      })}
                    </div>
                    {isEditMode && (
                      <Button type="submit" size="sm" disabled={isSaving || vendorLoading} className="mt-4 w-full rounded-lg text-xs font-medium shadow-none">
                        {isSaving ? 'Saving Catalog…' : 'Save Catalog Changes'}
                      </Button>
                    )}
                  </aside>
                </div>
              </div>
            </div>

            {/* 3. OPERATIONAL CONTACTS & PHYSICAL ADDRESS */}
            <div className="order-3 bg-card rounded-xl border border-border shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-border/70 flex flex-wrap items-center justify-between gap-3 bg-card">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-white font-mono text-xs font-black shadow-xs ring-2 ring-primary/20">
                    03
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground tracking-tight flex items-center gap-2">
                      Key Contacts & Dispatch Location
                    </h2>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                        Key Contact Person & Designation <span className="text-destructive">*</span>
                      </label>
                      <div className="relative">
                        <UserSquare2 className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                        <input
                          name="contactPerson"
                          type="text"
                          required
                          placeholder="e.g. Rajesh Sharma (Sales Head)"
                          value={form.contactPerson}
                          onChange={(e) => handleChange('contactPerson', e.target.value)}
                          className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-background text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                        PO Delivery Email <span className="text-destructive">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                        <input
                          name="contactEmail"
                          type="email"
                          required
                          placeholder="orders@supplier.com"
                          value={form.contactEmail}
                          onChange={(e) => handleChange('contactEmail', e.target.value)}
                          className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-background font-mono text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">Purchase orders are sent to this address when they are issued.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                        Direct Phone / Mobile <span className="text-destructive">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                        <input
                          name="contactPhone"
                          type="tel"
                          required
                          placeholder="+91 98765 43210"
                          value={form.contactPhone}
                          onChange={(e) => handleChange('contactPhone', e.target.value)}
                          className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-background font-mono text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                        Street Address / Industrial Plot <span className="text-destructive">*</span>
                      </label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                        <input
                          name="street"
                          type="text"
                          required
                          placeholder="Plot No. 42, GIDC Phase 2, Industrial Estate"
                          value={form.street}
                          onChange={(e) => handleChange('street', e.target.value)}
                          className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-background text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                          State / Province <span className="text-destructive">*</span>
                        </label>
                        <div data-vendor-state>
                          <SearchableSelector
                            value={form.state}
                            onChange={(state) => setForm((previous) => ({ ...previous, state, city: '' }))}
                            options={STATE_OPTIONS}
                            placeholder="Search state..."
                            allowCustom={false}
                            size="sm"
                            className="w-full"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                          City <span className="text-destructive">*</span>
                        </label>
                        <div data-vendor-city>
                          <SearchableSelector
                            value={form.city}
                            onChange={(city) => handleChange('city', city)}
                            options={getCityOptionsForState(form.state)}
                            placeholder={form.state ? 'Search city...' : 'Select state first'}
                            disabled={!form.state}
                            allowCustom
                            size="sm"
                            className="w-full"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                          Postal / Pin Code <span className="text-destructive">*</span>
                        </label>
                        <input
                          name="postalCode"
                          type="text"
                          required
                          inputMode="numeric"
                          maxLength={6}
                          pattern="[0-9]{6}"
                          placeholder="380001"
                          value={form.postalCode}
                          onChange={(e) => handleChange('postalCode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="w-full h-9 px-3 rounded-lg border border-input bg-background font-mono text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                        {(isLookingUpPostalCode || postalLookupMessage) && <p className={`mt-1 text-[10px] ${postalLookupMessage.includes('unavailable') || postalLookupMessage.includes('No location') ? 'text-destructive' : 'text-muted-foreground'}`}>{isLookingUpPostalCode ? 'Looking up location…' : postalLookupMessage}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                          Country <span className="text-destructive">*</span>
                        </label>
                        <select
                          name="country"
                          required
                          value={form.country}
                          onChange={(e) => handleChange('country', e.target.value)}
                          className="w-full h-9 px-3 rounded-lg border border-input bg-background text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                        >
                          {['India', 'United States', 'United Kingdom', 'United Arab Emirates', 'Singapore', 'Australia', 'Canada'].map((country) => <option key={country} value={country}>{country}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* ========================================================= */}
          {/* RIGHT COLUMN (4 Columns): Live Summary, Statutory & Commercials */}
          {/* ========================================================= */}
          <div className="contents">
            {/* 4. STATUTORY, TAX & COMPLIANCE */}
            <div className="order-2 bg-card rounded-xl border border-border shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-border/70 flex items-center gap-3 bg-card">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-black text-white shadow-xs ring-2 ring-primary/20">02</div>
                <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-foreground">
                  Statutory & Tax Compliance
                </h2>
              </div>
              <div className="p-6 space-y-5">
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                      GSTIN / Tax ID Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 24AAACA1234A1Z5"
                      value={form.taxNumber}
                      onChange={(e) => handleChange('taxNumber', e.target.value.toUpperCase())}
                      className="w-full h-9 px-3 rounded-lg border border-input bg-background font-mono text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-semibold"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                        PAN Number
                      </label>
                      <input
                        type="text"
                        placeholder="AAACA1234A"
                        value={form.panNumber}
                        onChange={(e) => handleChange('panNumber', e.target.value.toUpperCase())}
                        className="w-full h-9 px-3 rounded-lg border border-input bg-background font-mono text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                        MSME / Udyam No.
                      </label>
                      <input
                        type="text"
                        placeholder="UDYAM-GJ-01-..."
                        value={form.msmeUdyamNumber}
                        onChange={(e) => handleChange('msmeUdyamNumber', e.target.value.toUpperCase())}
                        className="w-full h-9 px-3 rounded-lg border border-input bg-background font-mono text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                        ISO / Quality Cert.
                      </label>
                      <input
                        type="text"
                        placeholder="ISO 9001:2015"
                        value={form.isoCertification}
                        onChange={(e) => handleChange('isoCertification', e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-input bg-background text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                        TDS Category
                      </label>
                      <select
                        value={isCustomTdsCategory ? '__custom__' : form.tdsCategory}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '__custom__') {
                            setIsCustomTdsCategory(true);
                            if (TDS_CATEGORY_OPTIONS.includes(form.tdsCategory)) handleChange('tdsCategory', '');
                            return;
                          }
                          setIsCustomTdsCategory(false);
                          handleChange('tdsCategory', value);
                        }}
                        className="w-full h-9 px-3 rounded-lg border border-input bg-background text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      >
                        <option value="">Select TDS category</option>
                        {TDS_CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}
                        <option value="__custom__">Custom</option>
                      </select>
                      {isCustomTdsCategory && (
                        <input
                          type="text"
                          placeholder="Enter a custom TDS category"
                          value={form.tdsCategory}
                          onChange={(e) => handleChange('tdsCategory', e.target.value)}
                          className="mt-2 w-full h-9 px-3 rounded-lg border border-input bg-background text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. COMMERCIAL & BANKING TERMS */}
            <div className="order-4 bg-card rounded-xl border border-border shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-border/70 flex items-center gap-3 bg-card">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-black text-white shadow-xs ring-2 ring-primary/20">04</div>
                <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-foreground">
                  Commercial & Bank Details
                </h2>
              </div>
              <div className="p-6 space-y-5">
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                      Agreed Payment Terms
                    </label>
                    <select
                      value={form.paymentTerms === 'Net 15 Days' || form.paymentTerms === 'Net 30 Days' || form.paymentTerms === 'Net 60 Days' ? form.paymentTerms : 'CUSTOM'}
                      onChange={(e) => {
                        handleChange('paymentTerms', e.target.value);
                        if (e.target.value !== 'CUSTOM') setCustomPaymentDays('');
                      }}
                      className="w-full h-9 px-3 rounded-lg border border-input bg-background text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                    >
                      <option value="Net 15 Days">Net 15 Days</option>
                      <option value="Net 30 Days">Net 30 Days</option>
                      <option value="Net 60 Days">Net 60 Days</option>
                      <option value="CUSTOM">Custom</option>
                    </select>
                    {form.paymentTerms === 'CUSTOM' && (
                      <div className="mt-3">
                        <label className="mb-1.5 block text-xs font-semibold text-foreground/85">Custom payment term (days) <span className="text-destructive">*</span></label>
                        <input
                          name="customPaymentDays"
                          type="number"
                          min="1"
                          required
                          value={customPaymentDays}
                          onChange={(e) => setCustomPaymentDays(e.target.value)}
                          placeholder="Enter number of days"
                          className="w-full h-9 px-3 rounded-lg border border-input bg-background font-mono text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                        Lead Time (Days)
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="7"
                        value={form.leadTimeDays}
                        onChange={(e) => handleChange('leadTimeDays', e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-input bg-background font-mono text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                        Credit Limit (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="e.g. 500000"
                        value={form.creditLimit}
                        onChange={(e) => handleChange('creditLimit', e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-input bg-background font-mono text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-bold"
                      />
                    </div>
                  </div>

                  <div className="border-t border-border/70 pt-4">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Banking & remittance</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {([
                        ['bankBeneficiaryName', 'Beneficiary / Account Name', 'Name as registered with the bank'],
                        ['bankName', 'Bank Name', 'e.g. State Bank of India'],
                        ['bankAccountNumber', 'Account Number', 'Bank account number'],
                        ['bankIfsc', 'IFSC Code', 'e.g. SBIN0001234'],
                      ] as const).map(([field, label, placeholder]) => (
                        <label key={field} className="block text-xs font-semibold text-foreground/85">
                          {label}
                          <input value={form[field]} onChange={(event) => handleChange(field, event.target.value)} placeholder={placeholder} className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        </label>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}
