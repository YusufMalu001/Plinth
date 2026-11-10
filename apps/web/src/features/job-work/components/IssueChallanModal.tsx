'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, Button } from '@synergy/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { StockOwnership } from '@synergy/types';
import { inventoryKeys } from '@/features/inventory/hooks';
import { inventoryApi } from '@/features/inventory/api';
import { bomApi } from '@/features/bom/api';
import { vendorsApi, type GeminiVendorEvaluationDto } from '@/features/vendors/api';
import { VendorScorecardDialog } from '@/features/vendors/components/VendorScorecardDialog';
import { SearchableSelector } from '@/components/ui/SearchableSelector';
import { jobWorkApi } from '../api';
import { useProcurementSelectors } from '@/features/purchases/hooks';
import {
  Package,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Info
} from 'lucide-react';

interface VendorOption {
  id: string;
  name: string;
  code: string;
  vendorName: string;
  prefix: string;
  score: number | undefined;
  scoreTag: string;
  leadTimeDays?: number | null;
  unitPrice?: number | null;
  priceLabel?: string;
  badges: Array<{ label: string }>;
  ev: GeminiVendorEvaluationDto | undefined;
}

interface BomMaterialLine {
  id: string;
  materialId: string;
  materialName: string;
  materialCode: string;
  uomId: string;
  uomLabel: string;
  requiredQty: number;
  availableInInventory: number;
  isAvailable: boolean;
}

interface IssueChallanModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultVendorId?: string;
  defaultJobWorkOrderId?: string;
  defaultProductId?: string;
  defaultMaterialId?: string;
  defaultQuantity?: number;
}

export function IssueChallanModal({
  open,
  onClose,
  onSuccess,
  defaultVendorId,
  defaultJobWorkOrderId,
  defaultProductId,
  defaultMaterialId: _defaultMaterialId,
  defaultQuantity
}: IssueChallanModalProps) {
  const queryClient = useQueryClient();

  /* Master data from the shared selector hook */
  const { data: selectors } = useProcurementSelectors();
  const vendors   = useMemo(() => selectors?.vendors.items   ?? [], [selectors]);
  const products  = useMemo(() => selectors?.products.items  ?? [], [selectors]);
  const materials = useMemo(() => selectors?.materials.items ?? [], [selectors]);
  const locations = useMemo(() => selectors?.locations.items ?? [], [selectors]);
  const allUoms   = useMemo(() => selectors?.uoms.items      ?? [], [selectors]);
  const capabilities = useMemo(() => selectors?.capabilities?.items ?? [], [selectors]);

  /* Vendor Scoring */
  const { data: scoringReport } = useQuery({
    queryKey: ['vendor-scoring', 'OUTSOURCING'],
    queryFn: () =>
      vendorsApi
        .getScoringReport('OUTSOURCING')
        .catch(() => vendorsApi.getScoringReport('ALL')),
    staleTime: 60_000,
    enabled: open,
  });

  const vendorScoreMap = useMemo(() => {
    const map = new Map<string, number>();
    scoringReport?.evaluations?.forEach((ev) => {
      if (typeof ev.score === 'number') map.set(ev.vendorId, ev.score);
    });
    return map;
  }, [scoringReport]);

  const vendorEvalMap = useMemo(() => {
    const map = new Map<string, GeminiVendorEvaluationDto>();
    scoringReport?.evaluations?.forEach((ev) => map.set(ev.vendorId, ev));
    return map;
  }, [scoringReport]);

  /* Inventory Balances */
  const { data: inventoryBalancesData, isLoading: isInventoryLoading } = useQuery({
    queryKey: inventoryKeys.balances({ ownership: 'COMPANY' as unknown as StockOwnership, limit: 1000 }),
    queryFn: () => inventoryApi.listBalances({ ownership: 'COMPANY' as unknown as StockOwnership, limit: 1000 }),
    staleTime: 15_000,
    enabled: open,
  });
  /* Form fields */
  const [productId,          setProductId]          = useState(defaultProductId ?? '');
  const [targetQuantity,     setTargetQuantity]     = useState<number>(defaultQuantity ?? 100);
  const [vendorId,           setVendorId]           = useState(defaultVendorId  ?? '');
  const [dispatchLocationId, setDispatchLocationId] = useState('');
  const [jobWorkOrderId,     setJobWorkOrderId]     = useState(defaultJobWorkOrderId ?? '');
  const [vehicleNumber,      setVehicleNumber]      = useState('MH-12-CD-5678');
  const [transporterName,    setTransporterName]    = useState('SafeCargo Logistics');
  const [driverContact,      setDriverContact]      = useState('+91 98765 43210');
  const [notes,              setNotes]              = useState('Raw material dispatched for outsourced machining custody');
  const [orders,             setOrders]             = useState<Array<{ id: string; orderNumber: string; vendorId: string }>>([]);


  const inventoryMap = useMemo(() => {
    const map = new Map<string, number>();
    (inventoryBalancesData?.items || []).forEach((bal) => {
      const matId = bal.materialId || (bal.itemType === 'MATERIAL' ? bal.itemId : null);
      if (matId) {
        const qty = Number(bal.available ?? bal.quantity ?? 0);
        map.set(matId, (map.get(matId) ?? 0) + qty);
      }
    });
    return map;
  }, [inventoryBalancesData]);

  /* Outsource vendors pool */
  const outsourceCapableVendors = useMemo(() => {
    const scoringVendors = new Set(
      (scoringReport?.evaluations || [])
        .filter((ev) => ev.vendorType === 'OUTSOURCING' || ev.vendorType === 'HYBRID')
        .map((ev) => ev.vendorId)
    );
    const capabilityProductVendors = new Set(
      capabilities.filter((c) => Boolean(c.productId)).map((c) => c.vendorId)
    );
    const filtered = vendors.filter(
      (v) => scoringVendors.has(v.id) || capabilityProductVendors.has(v.id)
    );
    return filtered.length > 0 ? filtered : vendors;
  }, [vendors, scoringReport, capabilities]);


  /* BOM */
  const [bomLines, setBomLines] = useState<Array<{ id: string; materialId: string; uomId: string; baseQty: number; quantityMode?: string }>>([]);
  const [bomNumber, setBomNumber] = useState<string>('');
  const [isBomLoading, setIsBomLoading] = useState(false);

  /* Scorecard */
  const [scorecardVendorId, setScorecardVendorId] = useState<string | null>(null);
  const [scorecardVendorName, setScorecardVendorName] = useState<string | null>(null);

  const [loading,           setLoading]           = useState(false);
  const [error,             setError]             = useState<string | null>(null);

  const handleProductSelect = async (selectedProductId: string) => {
    setProductId(selectedProductId);
    if (!selectedProductId) {
      setBomLines([]);
      setBomNumber('');
      return;
    }

    // Auto-select capable outsource vendor by AI score
    const capableVendorIds = new Set(
      capabilities
        .filter((c) => c.productId === selectedProductId)
        .map((c) => c.vendorId)
    );
    const pool = outsourceCapableVendors.length > 0 ? outsourceCapableVendors : vendors;
    const eligible = [...pool]
      .filter((v) => capableVendorIds.has(v.id))
      .sort((a, b) => (vendorScoreMap.get(b.id) ?? -1) - (vendorScoreMap.get(a.id) ?? -1));

    if (eligible.length > 0) {
      setVendorId(eligible[0].id);
    } else if (pool.length > 0) {
      const sortedPool = [...pool].sort((a, b) => (vendorScoreMap.get(b.id) ?? -1) - (vendorScoreMap.get(a.id) ?? -1));
      setVendorId(sortedPool[0].id);
    }

    // Fetch approved BOM
    setIsBomLoading(true);
    try {
      const bomRes = await bomApi.listVersions({
        productId: selectedProductId,
        status: 'APPROVED',
        limit: 1,
      });
      const summary = bomRes?.items?.[0];
      if (summary) {
        setBomNumber(summary.bomNumber || '');
        const detail = await bomApi.getVersion(summary.id);
        const lines = (detail.lines || [])
          .filter((l) => l.materialId != null)
          .map((l) => ({
            id: l.id || `bom-line-${Math.random()}`,
            materialId: l.materialId as string,
            uomId: l.uomId,
            baseQty: Number(l.quantity || 1),
            quantityMode: l.quantityMode,
          }));
        setBomLines(lines);
      } else {
        setBomNumber('');
        setBomLines([]);
      }
    } catch (err) {
      console.warn('[IssueChallanModal] BOM lookup failed', err);
      setBomLines([]);
      setBomNumber('');
    } finally {
      setIsBomLoading(false);
    }
  };

  /* Sync prop defaults when modal opens or defaults change */
  const seededRef = useRef(false);
  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      return;
    }

    if (defaultVendorId)        setVendorId(defaultVendorId);
    if (locations.length && !dispatchLocationId) {
      const rawLoc = locations.find((l) => /raw/i.test(l.name || l.code || ''));
      setDispatchLocationId(rawLoc?.id || locations[0].id);
    }
    if (defaultJobWorkOrderId)  setJobWorkOrderId(defaultJobWorkOrderId);
    if (defaultQuantity !== undefined) setTargetQuantity(defaultQuantity);

    /* Fetch orders only when modal opens */
    jobWorkApi
      .getOrders()
      .then((res) => {
        setOrders(
          (res.items ?? []).map((o) => ({ id: o.id, orderNumber: o.orderNumber ?? o.id, vendorId: o.vendorId }))
        );
      })
      .catch((err: unknown) => {
        console.error('[IssueChallanModal] Failed to load job work orders', err);
      });

    if (!seededRef.current && products.length > 0) {
      seededRef.current = true;
      const initialProduct = defaultProductId
        ? products.find((p) => p.id === defaultProductId)
        : products.find((p) => /semi.?round.?cap/i.test(p.name)) ?? products[0];
      if (initialProduct) {
        void handleProductSelect(initialProduct.id);
      }
    }
  }, [open, defaultVendorId, defaultJobWorkOrderId, defaultProductId, defaultQuantity, locations, products]);

  // Vendor dropdown options
  const vendorOptions: VendorOption[] = useMemo(() => {
    const productCaps = productId
      ? capabilities.filter((c) => c.productId === productId)
      : [];
    const capByVendor = new Map<string, typeof capabilities[0]>();
    productCaps.forEach((cap) => {
      if (!capByVendor.has(cap.vendorId)) capByVendor.set(cap.vendorId, cap);
    });

    const pool = outsourceCapableVendors.length > 0 ? outsourceCapableVendors : vendors;
    const isComparative = pool.length >= 2;

    const validPrices = pool
      .map((v) => Number(capByVendor.get(v.id)?.unitPrice))
      .filter((p) => p > 0);
    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
    const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : null;

    const validLeadTimes = pool
      .map((v) => capByVendor.get(v.id)?.leadTimeDays)
      .filter((lt): lt is number => typeof lt === 'number' && lt > 0);
    const minLeadTime = validLeadTimes.length > 0 ? Math.min(...validLeadTimes) : null;
    const maxLeadTime = validLeadTimes.length > 0 ? Math.max(...validLeadTimes) : null;

    const validQualities = pool
      .map((v) => vendorEvalMap.get(v.id)?.qualityScore)
      .filter((q): q is number => typeof q === 'number');
    const maxQuality = validQualities.length > 0 ? Math.max(...validQualities) : null;
    const minQuality = validQualities.length > 0 ? Math.min(...validQualities) : null;

    const validDebits = pool
      .map((v) => vendorEvalMap.get(v.id)?.metrics?.totalDebitNotesCount ?? 0);
    const minDebits = validDebits.length > 0 ? Math.min(...validDebits) : null;
    const maxDebits = validDebits.length > 0 ? Math.max(...validDebits) : null;

    return pool
      .map((v) => {
        const score = vendorScoreMap.get(v.id);
        const scoreTag = typeof score === 'number' ? `★ ${Math.round(score)}/100` : 'Score N/A';
        const ev = vendorEvalMap.get(v.id);
        const cap = capByVendor.get(v.id);
        const unitPrice = cap?.unitPrice != null ? Number(cap.unitPrice) : null;
        const priceLabel = unitPrice && unitPrice > 0 ? `₹${unitPrice.toLocaleString('en-IN')}` : '';
        const leadTimeDays = cap?.leadTimeDays ?? null;

        const badges: Array<{ label: string }> = [];
        if (isComparative) {
          if (unitPrice && unitPrice > 0 && minPrice !== null && maxPrice !== null && minPrice !== maxPrice && unitPrice === minPrice) {
            badges.push({ label: 'Best Rate' });
          } else if (unitPrice && unitPrice > 0 && minPrice !== null && maxPrice !== null && unitPrice <= minPrice * 1.15) {
            badges.push({ label: 'Competitive Rate' });
          }
          if (typeof leadTimeDays === 'number' && leadTimeDays > 0 && minLeadTime !== null && maxLeadTime !== null && minLeadTime !== maxLeadTime && leadTimeDays === minLeadTime) {
            badges.push({ label: 'Least Lead Time' });
          } else if (typeof leadTimeDays === 'number' && leadTimeDays > 0 && leadTimeDays <= 7) {
            badges.push({ label: `${leadTimeDays}d Fast Lead` });
          } else if (typeof leadTimeDays === 'number' && leadTimeDays > 0 && leadTimeDays <= 10) {
            badges.push({ label: `${leadTimeDays}d Lead Time` });
          }
          const q = ev?.qualityScore;
          if (typeof q === 'number' && minQuality !== null && maxQuality !== null && minQuality !== maxQuality && q === maxQuality) {
            badges.push({ label: 'Best Quality' });
          } else if (typeof q === 'number' && q >= 90) {
            badges.push({ label: 'High Quality' });
          } else if (ev?.grade === 'A+' || ev?.grade === 'A') {
            badges.push({ label: `Grade ${ev.grade}` });
          }
          const dn = ev?.metrics?.totalDebitNotesCount ?? 0;
          if (minDebits !== null && maxDebits !== null && minDebits !== maxDebits && dn === minDebits) {
            badges.push({ label: dn === 0 ? 'Zero Debit Notes' : 'Least Debit Notes' });
          } else if (dn === 0) {
            badges.push({ label: 'Zero Debit Notes' });
          }
        } else if (ev) {
          if (ev.qualityScore >= 95) badges.push({ label: 'Best Quality' });
          else if (ev.qualityScore >= 90) badges.push({ label: 'High Quality' });
          else if (ev.grade === 'A+' || ev.grade === 'A') badges.push({ label: `Grade ${ev.grade}` });
          if ((ev.metrics?.totalDebitNotesCount ?? 0) === 0) badges.push({ label: 'Zero Debit Notes' });
          if (typeof leadTimeDays === 'number' && leadTimeDays > 0 && leadTimeDays <= 14) {
            badges.push({ label: `${leadTimeDays}d Lead Time` });
          }
        }

        return {
          id: v.id,
          name: v.name,
          code: v.code,
          vendorName: v.name,
          prefix: '',
          score,
          scoreTag,
          leadTimeDays,
          unitPrice,
          priceLabel,
          badges,
          ev,
        };
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
      .map((opt, idx) => ({
        ...opt,
        prefix: idx === 0 ? 'Suggested · ' : '',
        name: opt.scoreTag ? `${idx === 0 ? 'Suggested · ' : ''}${opt.vendorName} (${opt.scoreTag})` : `${idx === 0 ? 'Suggested · ' : ''}${opt.vendorName}`,
      }));
  }, [outsourceCapableVendors, vendors, capabilities, productId, vendorScoreMap, vendorEvalMap]);

  // Evaluated BOM lines with inventory availability
  const evaluatedBomLines: BomMaterialLine[] = useMemo(() => {
    return bomLines.map((line) => {
      const mat = materials.find((m) => m.id === line.materialId);
      const uomObj = allUoms.find((u) => u.id === line.uomId) ?? mat?.uom ?? null;
      const uomLabel = uomObj?.symbol ?? uomObj?.code ?? 'Units';
      const reqQty = line.quantityMode === 'SCALED' ? line.baseQty * targetQuantity : line.baseQty;
      const roundedReq = Number(reqQty.toFixed(2));
      const available = inventoryMap.get(line.materialId) ?? 0;
      const isAvailable = available >= roundedReq;

      return {
        id: line.id,
        materialId: line.materialId,
        materialName: mat?.name ?? 'Raw Material',
        materialCode: mat?.code ?? '',
        uomId: line.uomId,
        uomLabel,
        requiredQty: roundedReq,
        availableInInventory: available,
        isAvailable,
      };
    });
  }, [bomLines, targetQuantity, materials, allUoms, inventoryMap]);

  const allMaterialsAvailable = useMemo(() => {
    if (evaluatedBomLines.length === 0) return false;
    return evaluatedBomLines.every((l) => l.isAvailable);
  }, [evaluatedBomLines]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId || !dispatchLocationId || !productId) {
      setError('Please select a product to outsource, an outsource vendor, and dispatch warehouse.');
      return;
    }

    if (evaluatedBomLines.length === 0) {
      setError('No BOM materials configured for this product.');
      return;
    }

    if (!allMaterialsAvailable) {
      setError('Cannot issue challan: inventory shortage for required BOM materials.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      for (const line of evaluatedBomLines) {
        await jobWorkApi.issueMaterial({
          vendorId,
          dispatchLocationId,
          materialId: line.materialId,
          uomId: line.uomId,
          quantity: line.requiredQty,
          jobWorkOrderId: jobWorkOrderId || undefined,
          vehicleNumber,
          transporterName,
          driverContact,
          notes: `[Product: ${products.find((p) => p.id === productId)?.name ?? 'Outsourced Product'}] ${notes}`
        });
      }

      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.balances() });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.ledger() });
      queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
      queryClient.invalidateQueries({ queryKey: ['stock-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['job-work'] });

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate delivery challan.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <Dialog open={open} onClose={onClose} title="Issue Raw Material (Delivery Challan)">
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto px-1">
          {error && (
            <div className="rounded-lg bg-rose-50 dark:bg-rose-950/50 p-3 text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Product & Target Output */}
          <div className="rounded-xl border border-border p-3.5 bg-muted/20 space-y-3">
            <div className="flex items-center gap-2 text-xs font-extrabold text-foreground">
              <Package className="h-4 w-4 text-primary" />
              <span>1. Product to Outsource</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-foreground mb-1">
                  Target Product *
                </label>
                <SearchableSelector
                  value={productId}
                  onChange={(val) => void handleProductSelect(val)}
                  options={products.map((p) => ({ id: p.id, name: p.name, code: p.sku }))}
                  placeholder="Search finished product / SKU…"
                  renderOption={(opt) => (
                    <div className="py-1">
                      <div className="font-semibold text-xs text-foreground">{opt.name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{opt.code}</div>
                    </div>
                  )}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-foreground mb-1">
                  Target Output Qty *
                </label>
                <input
                  type="number"
                  value={targetQuantity}
                  onChange={(e) => setTargetQuantity(Math.max(1, Number(e.target.value)))}
                  min="1"
                  className="w-full rounded-lg border border-border bg-background p-2 text-xs font-bold text-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  required
                />
              </div>
            </div>
          </div>

          {/* 2. Outsource Vendor (Auto-selected with scoring choice) & Warehouse */}
          <div className="rounded-xl border border-border p-3.5 bg-muted/20 space-y-3">
            <div className="flex items-center gap-2 text-xs font-extrabold text-foreground">
              <Layers className="h-4 w-4 text-primary" />
              <span>2. Outsource Partner &amp; Warehouse</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-foreground mb-1">
                  Outsource Vendor (Consignee) *
                </label>
                <SearchableSelector
                  value={vendorId}
                  onChange={setVendorId}
                  placeholder="Select outsourcing partner…"
                  options={vendorOptions}
                  renderOption={(opt) => {
                    const o = opt as VendorOption;
                    return (
                      <div className="py-1 space-y-0.5 w-full">
                        <div className="flex items-center justify-between gap-1.5 min-w-0">
                          <span className="font-semibold text-xs text-foreground truncate">
                            {o.prefix && <span className="text-primary font-bold">{o.prefix}</span>}
                            {o.vendorName || o.name}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                              {o.scoreTag}
                            </span>
                            <button
                              type="button"
                              aria-label={`View scorecard for ${o.vendorName || o.name}`}
                              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setScorecardVendorId(o.id);
                                setScorecardVendorName(o.vendorName || o.name);
                              }}
                              className="h-4 w-4 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-1 text-[9px] font-mono text-muted-foreground flex-wrap">
                          <span>{o.code ? `Code: ${o.code}` : ''}{o.priceLabel ? ` · ${o.priceLabel}` : ''}</span>
                          {o.badges && o.badges.length > 0 && (
                            <span className="text-emerald-600 font-bold">{o.badges[0].label}</span>
                          )}
                        </div>
                      </div>
                    );
                  }}
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-foreground mb-1">
                Link to Job Work Order (Optional)
              </label>
              <select
                value={jobWorkOrderId}
                onChange={(e) => setJobWorkOrderId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background p-2 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="">General Deposit (No specific order)</option>
                {orders
                  .filter((o) => !vendorId || o.vendorId === vendorId)
                  .map((o) => (
                    <option key={o.id} value={o.id}>{o.orderNumber}</option>
                  ))}
              </select>
            </div>
          </div>

          {/* 3. BOM & Inventory Stock Check */}
          <div className="rounded-xl border border-border p-3.5 bg-muted/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-foreground">
                3. Standard BOM &amp; Inventory Availability Check {bomNumber && `(${bomNumber})`}
              </span>
              {evaluatedBomLines.length > 0 && (
                allMaterialsAvailable ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> All In Stock
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" /> Inventory Shortage
                  </span>
                )
              )}
            </div>

            {isBomLoading || isInventoryLoading ? (
              <div className="py-3 text-center text-xs text-muted-foreground animate-pulse">
                Verifying standard BOM and warehouse stock…
              </div>
            ) : evaluatedBomLines.length === 0 ? (
              <div className="py-2 text-center text-xs text-muted-foreground">
                No BOM materials loaded.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 text-muted-foreground font-bold border-b border-border text-[10px]">
                    <tr>
                      <th className="p-2">Material</th>
                      <th className="p-2">Required</th>
                      <th className="p-2">In Stock</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {evaluatedBomLines.map((line) => (
                      <tr key={line.id} className="hover:bg-muted/30">
                        <td className="p-2 font-semibold">
                          <div>{line.materialName}</div>
                          <div className="text-[10px] text-muted-foreground">{line.materialCode}</div>
                        </td>
                        <td className="p-2 font-mono font-bold text-primary">
                          {line.requiredQty} {line.uomLabel}
                        </td>
                        <td className="p-2 font-mono font-bold">
                          {line.availableInInventory} {line.uomLabel}
                        </td>
                        <td className="p-2">
                          {line.isAvailable ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" /> Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-destructive">
                              <AlertTriangle className="h-3 w-3" /> Shortage
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4. Transit details */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Vehicle Number
              </label>
              <input
                type="text"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                className="w-full rounded-lg border border-border bg-background p-2 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Transporter Name
              </label>
              <input
                type="text"
                value={transporterName}
                onChange={(e) => setTransporterName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background p-2 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Driver Contact
              </label>
              <input
                type="text"
                value={driverContact}
                onChange={(e) => setDriverContact(e.target.value)}
                className="w-full rounded-lg border border-border bg-background p-2 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
              Challan Notes &amp; Remarks
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-border bg-background p-2 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} className="text-xs font-bold">
              Cancel
            </Button>
            <Button
              type="submit"
              loading={loading}
              disabled={loading || !allMaterialsAvailable}
              className="bg-[#173796] hover:bg-[#122b77] text-white font-extrabold text-xs disabled:opacity-50"
            >
              Generate Challan &amp; Issue Stock
            </Button>
          </div>
        </form>
      </Dialog>

      <VendorScorecardDialog
        open={Boolean(scorecardVendorId)}
        onClose={() => { setScorecardVendorId(null); setScorecardVendorName(null); }}
        variant="drawer"
        vendorId={scorecardVendorId}
        vendorName={scorecardVendorName}
      />
    </>
  );
}
