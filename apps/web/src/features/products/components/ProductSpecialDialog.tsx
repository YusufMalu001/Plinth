'use client';

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Pencil,
  Search,
  ArrowRight,
  SlidersHorizontal,
} from 'lucide-react';
import { Dialog, Button } from '@plinth/ui';
import { showToast } from '../../../components/toast-store';
import { SearchableSelector } from '../../../components/ui/SearchableSelector';
import { useHsnSacCodes, useHsnSacLookup } from '../../../hooks/useMasterData';
import { fetchApi } from '../../api/client';
import { handleNumberInputWheel, handleNumberInputKeyDown } from '../utils/tierPricing';

export interface ProductSpecialPreset {
  id: string;
  name: string;
  description?: string;
  hsnCode: string;
  taxability: string; // 'Taxable' | 'Exempt' | 'Nil Rated' | 'Non-GST'
  uomId: string;
  uomCode?: string;
  gstRate: string; // '0' | '5' | '12' | '18' | '28'
  initialQuantity: string; // Opening Stock e.g. '0', '100'
  isSystemDefault?: boolean;
}

const STORAGE_KEY = 'plinth_product_specials_v1';
const LEGACY_STORAGE_KEY = 'plinth_product_specials_v1';

export function getDefaultSpecials(uoms: { id: string; code: string; name: string }[]): ProductSpecialPreset[] {
  const defaultUomId = uoms[0]?.id || '';
  const defaultUomCode = uoms[0]?.code || 'NOS';
  const kgUom = uoms.find((u) => u.code.toUpperCase() === 'KGS' || u.code.toUpperCase() === 'KG') || uoms[0];

  return [
    {
      id: 'special-default-fg-18',
      name: 'Finished Goods Standard (18% GST)',
      description: 'Standard domestic finished goods preset with 18% GST and 0 opening stock.',
      hsnCode: '73239390',
      taxability: 'Taxable',
      gstRate: '18',
      uomId: defaultUomId,
      uomCode: defaultUomCode,
      initialQuantity: '0',
      isSystemDefault: true,
    },
    {
      id: 'special-default-ss-raw-18',
      name: 'Stainless Steel Raw Material (18% GST)',
      description: 'Raw stainless steel materials with 18% GST and 50 units initial quantity.',
      hsnCode: '73064000',
      taxability: 'Taxable',
      gstRate: '18',
      uomId: kgUom?.id || defaultUomId,
      uomCode: kgUom?.code || defaultUomCode,
      initialQuantity: '50',
      isSystemDefault: true,
    },
    {
      id: 'special-default-exempt-0',
      name: 'Exempt / Zero GST Goods',
      description: 'Tax-exempt items with Nil / 0% GST reporting.',
      hsnCode: '999999',
      taxability: 'Exempt',
      gstRate: '0',
      uomId: defaultUomId,
      uomCode: defaultUomCode,
      initialQuantity: '0',
      isSystemDefault: true,
    },
  ];
}

interface ProductSpecialDialogProps {
  open: boolean;
  onClose: () => void;
  onApplySpecial: (special: ProductSpecialPreset) => void;
  uoms: { id: string; code: string; name: string }[];
  hsnCodes?: { id?: string; code: string; description?: string }[];
}

export function ProductSpecialDialog({
  open,
  onClose,
  onApplySpecial,
  uoms,
  hsnCodes = [],
}: ProductSpecialDialogProps) {
  const [activeTab, setActiveTab] = useState<'choose' | 'create'>('choose');
  const [specials, setSpecials] = useState<ProductSpecialPreset[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);

  // Creation form state
  const [newSpecial, setNewSpecial] = useState({
    name: '',
    description: '',
    hsnCode: '73239390',
    taxability: 'Taxable',
    gstRate: '18',
    uomId: '',
    initialQuantity: '0',
  });

  const [hsnSearchTerm, setHsnSearchTerm] = useState('');
  const hsnQuery = useHsnSacCodes(hsnSearchTerm);
  const specialHsnLookup = useHsnSacLookup(newSpecial.hsnCode);

  const rawHsnItems = hsnQuery.data?.items?.length ? hsnQuery.data.items : hsnCodes;
  const selectedSpecialHsn = rawHsnItems.find((item) => item.code === newSpecial.hsnCode);
  const specialHsnDescription = specialHsnLookup.data?.description || selectedSpecialHsn?.description;

  const hsnOptions = React.useMemo(() => {
    const list = (rawHsnItems || []).map((item) => ({
      id: item.code,
      name: item.description ? `${item.code} — ${item.description}` : item.code,
      code: item.code,
      description: item.description,
      kind: (item as any).kind || 'HSN',
    }));
    if (newSpecial.hsnCode && !list.some((o) => o.code === newSpecial.hsnCode)) {
      list.unshift({
        id: newSpecial.hsnCode,
        name: specialHsnDescription ? `${newSpecial.hsnCode} — ${specialHsnDescription}` : newSpecial.hsnCode,
        code: newSpecial.hsnCode,
        description: specialHsnDescription || '',
        kind: 'HSN',
      });
    }
    return list;
  }, [rawHsnItems, newSpecial.hsnCode, specialHsnDescription]);

  // Load shared presets from the API and migrate device-local presets once.
  useEffect(() => {
    if (!open || uoms.length === 0) return;
    let cancelled = false;
    const load = async () => {
      const defaults = getDefaultSpecials(uoms);
      let localPresets: ProductSpecialPreset[] = [];
      let hasLocalSnapshot = false;
      try {
        const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
        if (stored) {
          hasLocalSnapshot = true;
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) localPresets = parsed;
        }
      } catch (error) {
        console.warn('[ProductSpecialDialog] Error reading local preset cache:', error);
      }

      try {
        let remote = await fetchApi<any[]>('/master-data/product-special-presets');
        const knownIds = new Set(remote.map((preset) => preset.id));
        const migrationCandidates = (hasLocalSnapshot ? localPresets : defaults).filter((preset) => !knownIds.has(preset.id));
        let changedRemote = false;
        for (const preset of migrationCandidates) {
          const matchingUom = uoms.find((uom) => uom.id === preset.uomId) ||
            uoms.find((uom) => preset.uomCode && uom.code.toUpperCase() === preset.uomCode.toUpperCase());
          if (!matchingUom) continue;
          await fetchApi('/master-data/product-special-presets', {
            method: 'POST',
            body: JSON.stringify({ ...preset, uomId: matchingUom.id, uomCode: matchingUom.code, isDeleted: false }),
          });
          changedRemote = true;
        }
        // Older clients represented deleting a built-in preset only by its
        // absence from localStorage. Migrate that absence as a shared tombstone.
        if (hasLocalSnapshot) {
          const localIds = new Set(localPresets.map((preset) => preset.id));
          for (const preset of defaults.filter((candidate) => !localIds.has(candidate.id))) {
            await fetchApi(`/master-data/product-special-presets/${encodeURIComponent(preset.id)}`, { method: 'DELETE' });
            changedRemote = true;
          }
        }
        if (changedRemote) remote = await fetchApi<any[]>('/master-data/product-special-presets');
        if (cancelled) return;

        const remoteById = new Map(remote.map((preset) => [preset.id, preset]));
        const combined = defaults.flatMap((preset) => {
          const saved = remoteById.get(preset.id);
          if (saved?.isDeleted) return [];
          const candidate = saved || preset;
          const matchingUom = uoms.find((uom) => uom.id === candidate.uomId) ||
            uoms.find((uom) => candidate.uomCode && uom.code.toUpperCase() === candidate.uomCode.toUpperCase());
          return matchingUom ? [{ ...candidate, uomId: matchingUom.id, uomCode: matchingUom.code }] : [];
        });
        const defaultIds = new Set(defaults.map((preset) => preset.id));
        for (const preset of remote) {
          if (defaultIds.has(preset.id) || preset.isDeleted) continue;
          const matchingUom = uoms.find((uom) => uom.id === preset.uomId) ||
            uoms.find((uom) => preset.uomCode && uom.code.toUpperCase() === preset.uomCode.toUpperCase());
          if (matchingUom) combined.push({ ...preset, uomId: matchingUom.id, uomCode: matchingUom.code });
        }
        setSpecials(combined);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(combined));
      } catch (error) {
        console.error('[ProductSpecialDialog] Shared preset load failed:', error);
        if (cancelled) return;
        const fallback = localPresets.length > 0 ? localPresets : defaults;
        setSpecials(fallback.flatMap((preset) => {
          const matchingUom = uoms.find((uom) => uom.id === preset.uomId) ||
            uoms.find((uom) => preset.uomCode && uom.code.toUpperCase() === preset.uomCode.toUpperCase());
          return matchingUom ? [{ ...preset, uomId: matchingUom.id, uomCode: matchingUom.code }] : [];
        }));
        showToast({ title: 'Presets Could Not Sync', message: 'Could not load shared presets. Check your connection and reopen this dialog.', kind: 'error' });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [open, uoms]);

  // Set default UOM for new special when UOMs load
  useEffect(() => {
    if (uoms.length > 0 && !uoms.some((uom) => uom.id === newSpecial.uomId)) {
      setNewSpecial((prev) => ({ ...prev, uomId: uoms[0].id }));
    }
  }, [uoms, newSpecial.uomId]);

  const saveSpecialsToStorage = (updated: ProductSpecialPreset[]) => {
    setSpecials(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('[ProductSpecialDialog] Error saving specials:', e);
    }
  };

  const handleApply = (special: ProductSpecialPreset, closeAfterApply = true) => {
    onApplySpecial(special);
    showToast({
      title: `Special Applied`,
      message: `"${special.name}" preset details have been filled into the form.`,
      kind: 'success',
    });
    if (closeAfterApply) onClose();
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetchApi(`/master-data/product-special-presets/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const filtered = specials.filter((s) => s.id !== id);
      saveSpecialsToStorage(filtered);
    } catch (error) {
      showToast({ title: 'Preset Delete Failed', message: error instanceof Error ? error.message : 'Could not delete this shared preset.', kind: 'error' });
      return;
    }
    showToast({
      title: 'Preset Removed',
      message: 'The special preset has been deleted.',
      kind: 'info',
    });
  };

  const handleEdit = (preset: ProductSpecialPreset) => {
    setEditingPresetId(preset.id);
    setNewSpecial({
      name: preset.name,
      description: preset.description || '',
      hsnCode: preset.hsnCode || '',
      taxability: preset.taxability,
      gstRate: preset.gstRate,
      uomId: uoms.some((uom) => uom.id === preset.uomId)
        ? preset.uomId
        : uoms.find((uom) => uom.code.toUpperCase() === preset.uomCode?.toUpperCase())?.id || uoms[0]?.id || '',
      initialQuantity: preset.initialQuantity || '0',
    });
    setActiveTab('create');
  };

  const handleCreateSubmit = async (applyImmediately: boolean) => {
    if (!newSpecial.name.trim()) {
      showToast({
        title: 'Preset Name Required',
        message: 'Please enter a name for this special configuration.',
        kind: 'error',
      });
      return;
    }

    const selectedUom = uoms.find((u) => u.id === newSpecial.uomId);
    const createdPreset: ProductSpecialPreset = {
      id: editingPresetId || `special-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newSpecial.name.trim(),
      description: newSpecial.description.trim() || undefined,
      hsnCode: newSpecial.hsnCode.trim(),
      taxability: newSpecial.taxability,
      gstRate: newSpecial.gstRate,
      uomId: newSpecial.uomId || uoms[0]?.id || '',
      uomCode: selectedUom?.code || 'NOS',
      initialQuantity: newSpecial.initialQuantity || '0',
      isSystemDefault: specials.find((preset) => preset.id === editingPresetId)?.isSystemDefault || false,
    };

    const wasEditing = Boolean(editingPresetId);
    const updated = editingPresetId
      ? specials.map((preset) => preset.id === editingPresetId ? createdPreset : preset)
      : [createdPreset, ...specials];
    try {
      await fetchApi(`/master-data/product-special-presets${wasEditing ? `/${encodeURIComponent(createdPreset.id)}` : ''}`, {
        method: wasEditing ? 'PUT' : 'POST',
        body: JSON.stringify(createdPreset),
      });
    } catch (error) {
      showToast({ title: 'Preset Save Failed', message: error instanceof Error ? error.message : 'Could not save this shared preset.', kind: 'error' });
      return;
    }
    saveSpecialsToStorage(updated);
    setEditingPresetId(null);
    setActiveTab('choose');
    setNewSpecial({
      name: '',
      description: '',
      hsnCode: '73239390',
      taxability: 'Taxable',
      gstRate: '18',
      uomId: uoms[0]?.id || '',
      initialQuantity: '0',
    });

    if (applyImmediately) {
      handleApply(createdPreset, false);
    } else {
      showToast({
        title: 'Preset Saved',
        message: wasEditing
          ? `"${createdPreset.name}" has been updated.`
          : `"${createdPreset.name}" has been added to your special presets.`,
        kind: 'success',
      });
    }
  };

  const filteredSpecials = specials.filter((s) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.hsnCode && s.hsnCode.toLowerCase().includes(q)) ||
      (s.uomCode && s.uomCode.toLowerCase().includes(q)) ||
      (s.description && s.description.toLowerCase().includes(q))
    );
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Special Configuration Presets"
      description="Apply pre-configured HSN, Taxability, GST Rate, UOM, and Opening Stock."
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {/* SEGMENTED TAB NAVIGATION */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setActiveTab('choose')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'choose'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
            <span>Select Preset ({specials.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeTab !== 'create' && !editingPresetId) {
                setNewSpecial({
                  name: '',
                  description: '',
                  hsnCode: '73239390',
                  taxability: 'Taxable',
                  gstRate: '18',
                  uomId: uoms[0]?.id || '',
                  initialQuantity: '0',
                });
              }
              setActiveTab('create');
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'create'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{editingPresetId ? 'Edit Preset' : 'Create New Preset'}</span>
          </button>
        </div>

        {/* TAB 1: CHOOSE A SPECIAL */}
        {activeTab === 'choose' && (
          <div className="space-y-3">
            {/* Search filter */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search presets by name, HSN code, or UOM..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* List of Specials */}
            <div className="max-h-[400px] overflow-y-auto space-y-2.5 pr-1">
              {filteredSpecials.length === 0 ? (
                <div className="py-10 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-6">
                  <SlidersHorizontal className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    No presets found
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {searchTerm ? 'Try a different search query' : 'Create your first special preset.'}
                  </p>
                  <button
                    type="button"
                onClick={() => {
                  setEditingPresetId(null);
                  setActiveTab('create');
                }}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-[#003c68] transition-all cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> Create Preset
                  </button>
                </div>
              ) : (
                filteredSpecials.map((s) => {
                  const resolvedUom = uoms.find((u) => u.id === s.uomId)?.code || s.uomCode || 'NOS';
                  return (
                    <div
                      key={s.id}
                      className="group p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900 transition-all shadow-2xs space-y-2.5"
                    >
                      {/* Top Header: Title, Default Tag, and Apply/Delete Actions */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {s.name}
                            </span>
                            {s.isSystemDefault && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 shrink-0">
                                Default
                              </span>
                            )}
                          </div>
                          {s.description && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                              {s.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleEdit(s)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Edit preset"
                            aria-label={`Edit ${s.name}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleApply(s)}
                            className="h-8 rounded-lg text-xs font-bold bg-primary hover:bg-[#003c68] text-white px-3 shadow-xs"
                            icon={ArrowRight}
                          >
                            Apply
                          </Button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(s.id, e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-destructive hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Delete preset"
                            aria-label={`Delete ${s.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Clean 5-Field Specifications Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-2.5 rounded-lg bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs">
                        <div>
                          <span className="block text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500">
                            HSN / SAC
                          </span>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                            {s.hsnCode || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500">
                            Taxability
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {s.taxability}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500">
                            GST Rate
                          </span>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                            {s.gstRate}%
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500">
                            UOM
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {resolvedUom}
                          </span>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <span className="block text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500">
                            Opening Stock
                          </span>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                            {s.initialQuantity || '0'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CREATE NEW SPECIAL */}
        {activeTab === 'create' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Special Name */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Preset Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Standard Stainless Steel 18% (100 NOS)"
                  value={newSpecial.name}
                  onChange={(e) => setNewSpecial({ ...newSpecial, name: e.target.value })}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* 1. HSN Code */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  1. HSN / SAC Code
                </label>
                <SearchableSelector
                  value={newSpecial.hsnCode}
                  onChange={(val) => setNewSpecial((prev) => ({ ...prev, hsnCode: val }))}
                  options={hsnOptions}
                  searchTerm={hsnSearchTerm}
                  onSearchTermChange={setHsnSearchTerm}
                  isLoading={hsnQuery.isLoading}
                  placeholder="Search HSN/SAC code"
                  allowCustom
                  renderOption={(option) => (
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-900 dark:text-white text-xs">{option.code}</span>
                      {option.description && (
                        <span className="text-[10px] text-slate-400 line-clamp-2">{option.description}</span>
                      )}
                    </div>
                  )}
                />
                {specialHsnDescription ? (
                  <p className="mt-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 line-clamp-2">
                    {specialHsnLookup.isFetching ? 'Fetching category description…' : specialHsnDescription}
                  </p>
                ) : newSpecial.hsnCode ? (
                  <p className="mt-1 text-[11px] text-slate-400">
                    {specialHsnLookup.isFetching ? 'Fetching category description…' : 'Custom / Uncategorized HSN Code'}
                  </p>
                ) : null}
              </div>

              {/* 2. Taxability */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  2. Taxability
                </label>
                <select
                  value={newSpecial.taxability}
                  onChange={(e) => setNewSpecial({ ...newSpecial, taxability: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer"
                >
                  <option value="Taxable">Taxable</option>
                  <option value="Exempt">Exempt</option>
                  <option value="Nil Rated">Nil Rated</option>
                  <option value="Non-GST">Non-GST</option>
                </select>
              </div>

              {/* 3. GST Rate */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  3. GST Rate (%)
                </label>
                <select
                  value={newSpecial.gstRate}
                  onChange={(e) => setNewSpecial({ ...newSpecial, gstRate: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer"
                >
                  <option value="0">0% (Nil)</option>
                  <option value="5">5% (Concessional)</option>
                  <option value="12">12% (Standard Low)</option>
                  <option value="18">18% (Standard High)</option>
                  <option value="28">28% (Luxury / Cess)</option>
                </select>
              </div>

              {/* 4. Unit of Measure (UOM) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  4. Unit of Measure (UOM)
                </label>
                <select
                  value={newSpecial.uomId}
                  onChange={(e) => setNewSpecial({ ...newSpecial, uomId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer"
                >
                  {uoms.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Opening Stock */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  5. Opening Stock Quantity
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={!newSpecial.initialQuantity || newSpecial.initialQuantity === '0' ? '' : newSpecial.initialQuantity}
                  onChange={(e) => setNewSpecial({ ...newSpecial, initialQuantity: e.target.value })}
                  onWheel={(e) => handleNumberInputWheel(e, newSpecial.initialQuantity, (val) => setNewSpecial({ ...newSpecial, initialQuantity: val }))}
                  onKeyDown={(e) => handleNumberInputKeyDown(e, newSpecial.initialQuantity, (val) => setNewSpecial({ ...newSpecial, initialQuantity: val }))}
                  className="w-full h-10 px-3.5 font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Short Description */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Description / Note
                </label>
                <input
                  type="text"
                  placeholder="e.g. Standard export batch with 50 units buffer"
                  value={newSpecial.description}
                  onChange={(e) => setNewSpecial({ ...newSpecial, description: e.target.value })}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingPresetId(null);
                  setActiveTab('choose');
                }}
                className="rounded-xl text-xs font-bold"
              >
                Back to Presets
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCreateSubmit(false)}
                  className="rounded-xl text-xs font-bold"
                >
                  {editingPresetId ? 'Update Preset' : 'Save Preset'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleCreateSubmit(true)}
                  className="rounded-xl text-xs font-bold bg-primary hover:bg-[#003c68] text-white shadow-xs"
                >
                  {editingPresetId ? 'Update & Apply' : 'Save & Apply'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
