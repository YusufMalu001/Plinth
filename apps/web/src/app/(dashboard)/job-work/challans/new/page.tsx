'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader, Button, Card } from '@plinth/ui';
import {
  ArrowLeft,
  Truck,
  AlertCircle,
  Package,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Info
} from 'lucide-react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { jobWorkApi } from '@/features/job-work/api';
import { useProcurementSelectors } from '@/features/purchases/hooks';
import { bomApi } from '@/features/bom/api';
import { vendorsApi, type GeminiVendorEvaluationDto } from '@/features/vendors/api';
import { inventoryApi } from '@/features/inventory/api';
import { VendorScorecardDialog } from '@/features/vendors/components/VendorScorecardDialog';
import { SearchableSelector } from '@/components/ui/SearchableSelector';
import { showToast } from '@/components/toast-store';
import { useQueryClient } from '@tanstack/react-query';
import { inventoryKeys } from '@/features/inventory/hooks';
import type { StockOwnership } from '@plinth/types';

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

export default function IssueMaterialChallanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedVendorId = searchParams.get('vendorId') || '';
  const preselectedProductId = searchParams.get('productId') || '';
  const queryClient = useQueryClient();

  /* Master data ─────────────────────────────────────────────────────────── */
  const { data: selectors, isLoading: isSelectorsLoading } = useProcurementSelectors();
  const vendors = useMemo(() => selectors?.vendors.items || [], [selectors]);
  const products = useMemo(() => selectors?.products.items || [], [selectors]);
  const materials = useMemo(() => selectors?.materials.items || [], [selectors]);
  const locations = useMemo(() => selectors?.locations.items || [], [selectors]);
  const allUoms = useMemo(() => selectors?.uoms.items || [], [selectors]);
  const capabilities = useMemo(() => selectors?.capabilities?.items || [], [selectors]);

  /* Vendor Scoring ─────────────────────────────────────────────────────── */
  const { data: scoringReport } = useQuery({
    queryKey: ['vendor-scoring', 'OUTSOURCING'],
    queryFn: () =>
      vendorsApi
        .getScoringReport('OUTSOURCING')
        .catch(() => vendorsApi.getScoringReport('ALL')),
    staleTime: 60_000,
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

  /* Inventory Balances across company internal storage locations ───────── */
  const { data: inventoryBalancesData, isLoading: isInventoryLoading } = useQuery({
    queryKey: inventoryKeys.balances({ ownership: 'COMPANY' as unknown as StockOwnership, limit: 1000 }),
    queryFn: () => inventoryApi.listBalances({ ownership: 'COMPANY' as unknown as StockOwnership, limit: 1000 }),
    staleTime: 15_000,
  });

  const inventoryBalances = useMemo(
    () => inventoryBalancesData?.items || [],
    [inventoryBalancesData]
  );

  /* Outsource vendors pool ─────────────────────────────────────────────── */
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

  /* Form state ─────────────────────────────────────────────────────────── */
  const [orders, setOrders] = useState<Array<{ id: string; orderNumber: string; vendorId: string }>>([]);
  const [productId, setProductId] = useState(preselectedProductId);
  const [targetQuantity, setTargetQuantity] = useState<number>(100);
  const [vendorId, setVendorId] = useState(preselectedVendorId);
  const [dispatchLocationId, setDispatchLocationId] = useState('');
  const [jobWorkOrderId, setJobWorkOrderId] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('MH-12-CD-5678');
  const [transporterName, setTransporterName] = useState('SafeCargo Logistics Pvt Ltd');
  const [driverContact, setDriverContact] = useState('+91 98765 43210');
  const [notes, setNotes] = useState('Raw material dispatched for outsourced machining custody under Rule 55 Delivery Challan.');

  /* BOM Requirements ───────────────────────────────────────────────────── */
  const [bomLines, setBomLines] = useState<Array<{ id: string; materialId: string; uomId: string; baseQty: number; quantityMode?: string }>>([]);
  const [bomNumber, setBomNumber] = useState<string>('');
  const [isBomLoading, setIsBomLoading] = useState(false);

  /* Scorecard Dialog ───────────────────────────────────────────────────── */
  const [scorecardVendorId, setScorecardVendorId] = useState<string | null>(null);
  const [scorecardVendorName, setScorecardVendorName] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing Job Work orders for optional reference
  useEffect(() => {
    async function loadOrders() {
      try {
        const res = await jobWorkApi.getOrders();
        setOrders(res.items || []);
      } catch (err: any) {
        console.error('Failed to load orders', err);
      }
    }
    loadOrders();
  }, []);

  // Unified warehouse location: automatically bind to the single company inventory warehouse
  useEffect(() => {
    if (locations.length === 0) return;
    if (!dispatchLocationId) {
      const activeLoc = locations.find((l) => l.status === 'ACTIVE') || locations[0];
      setDispatchLocationId(activeLoc.id);
    }
  }, [locations, dispatchLocationId]);

  // Handle product selection: auto-select vendor & auto-load BOM
  const handleProductSelect = async (selectedProductId: string) => {
    setProductId(selectedProductId);
    if (!selectedProductId) {
      setBomLines([]);
      setBomNumber('');
      return;
    }

    // 1. Auto-select capable outsource vendor by AI score
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

    // 2. Fetch latest approved standard BOM
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
      console.warn('[IssueChallan] BOM lookup failed', err);
      setBomLines([]);
      setBomNumber('');
    } finally {
      setIsBomLoading(false);
    }
  };

  // Seed initial product on first load
  const seededRef = React.useRef(false);
  useEffect(() => {
    if (seededRef.current || products.length === 0) return;
    const firstPrd = preselectedProductId
      ? products.find((p) => p.id === preselectedProductId)
      : products.find((p) => /semi.?round.?cap/i.test(p.name)) ?? products[0];
    if (firstPrd) {
      seededRef.current = true;
      void handleProductSelect(firstPrd.id);
    }
  }, [products, preselectedProductId]);

  // Vendor dropdown options with full scoring, pricing, and comparative tags
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

  // Compute inventory balance map across unified warehouse inventory
  const inventoryMap = useMemo(() => {
    const map = new Map<string, number>();
    inventoryBalances.forEach((bal) => {
      const matId =
        bal.materialId ||
        (bal.itemType === 'MATERIAL' ? bal.itemId : null);
      if (matId) {
        const rawQty = bal.available ?? bal.availableQuantity ?? bal.onHandQuantity ?? bal.quantity ?? 0;
        const qty = Number(rawQty) || 0;
        map.set(matId, (map.get(matId) ?? 0) + qty);
      }
    });
    return map;
  }, [inventoryBalances]);

  // Check availability of each BOM material line in company inventory
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

  // All BOM materials must be available in inventory to issue challan
  const allMaterialsAvailable = useMemo(() => {
    if (evaluatedBomLines.length === 0) return false;
    return evaluatedBomLines.every((l) => l.isAvailable);
  }, [evaluatedBomLines]);
  // Handle submission: dispatch delivery challans for the loaded BOM materials
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId || !dispatchLocationId || !productId) {
      setError('Please select an output product, an outsource vendor, and dispatch warehouse.');
      return;
    }

    if (targetQuantity <= 0) {
      setError('Target quantity must be greater than zero.');
      return;
    }

    if (evaluatedBomLines.length === 0) {
      setError('No BOM materials found for this product. Verify approved BOM configuration.');
      return;
    }

    if (!allMaterialsAvailable) {
      setError('Cannot issue challan: some raw materials are not available in company inventory.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Issue challan for each BOM line (or primary material line)
      let lastChallanId = '';
      const challanNumbers: string[] = [];

      for (const line of evaluatedBomLines) {
        const challan = await jobWorkApi.issueMaterial({
          vendorId,
          dispatchLocationId,
          materialId: line.materialId,
          uomId: line.uomId,
          quantity: line.requiredQty,
          jobWorkOrderId: jobWorkOrderId || undefined,
          vehicleNumber,
          transporterName,
          driverContact,
          notes: `[Product: ${products.find((p) => p.id === productId)?.name ?? 'Outsourced Product'}] ${notes}`,
        });
        lastChallanId = challan.id;
        challanNumbers.push(challan.challanNumber);
      }

      showToast({
        title: 'Delivery Challan Generated',
        message: `Challan(s) ${challanNumbers.join(', ')} issued. Materials transferred into vendor custody.`,
        kind: 'success',
      });

      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.balances() });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.ledger() });
      queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
      queryClient.invalidateQueries({ queryKey: ['stock-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['job-work'] });

      if (lastChallanId) {
        router.push(`/job-work/challans/${lastChallanId}`);
      } else {
        router.push('/job-work');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate delivery challan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6 font-manrope">
      <div className="flex items-center gap-2 mb-2">
        <Link
          href="/job-work"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Job Work Dashboard
        </Link>
      </div>

      <PageHeader
        title="Issue Raw Material (Delivery Challan)"
        description="Dispatch company-owned raw material to an outsourcing vendor under Rule 55 statutory Delivery Challan. Credits the vendor-held custody ledger."
      />

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs font-bold text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card 1: Product Selection & Outsource Vendor */}
        <Card className="p-6 border-border shadow-xs rounded-2xl bg-card space-y-5">
          <div className="flex items-center gap-2.5 border-b border-border pb-3">
            <Package className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-base font-extrabold text-foreground">
                1. Product to Outsource &amp; Outsource Vendor
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Select the product to outsource — capable outsource vendors and approved standard BOM are auto-loaded.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Product Selector */}
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                Target Product to Outsource *
              </label>
              <SearchableSelector
                value={productId}
                onChange={(val) => void handleProductSelect(val)}
                options={products.map((p) => ({ id: p.id, name: p.name, code: p.sku }))}
                placeholder="Search product / SKU to outsource…"
                isLoading={isSelectorsLoading}
                renderOption={(opt) => (
                  <div className="py-1">
                    <div className="font-semibold text-xs text-foreground">{opt.name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{opt.code}</div>
                  </div>
                )}
              />
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Auto-selects capable vendor and loads standard BOM recipe.
              </span>
            </div>

            {/* Target Output Quantity */}
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                Target Output Quantity *
              </label>
              <input
                type="number"
                value={targetQuantity}
                onChange={(e) => setTargetQuantity(Math.max(1, Number(e.target.value)))}
                min="1"
                className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-bold text-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-2xs"
                required
              />
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Scales required BOM quantities for raw material issue.
              </span>
            </div>

            {/* Outsource Vendor with Scoring */}
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                Outsource Vendor (Consignee) *
              </label>
              <SearchableSelector
                value={vendorId}
                onChange={setVendorId}
                disabled={isSelectorsLoading}
                placeholder="Select outsourcing partner…"
                options={vendorOptions}
                renderOption={(opt) => {
                  const o = opt as VendorOption;
                  return (
                    <div className="py-1 space-y-1 w-full">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="font-semibold text-xs text-foreground truncate">
                          {o.prefix && <span className="text-primary font-bold">{o.prefix}</span>}
                          {o.vendorName || o.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                            {o.scoreTag}
                          </span>
                          <button
                            type="button"
                            aria-label={`View scorecard for ${o.vendorName || o.name}`}
                            title="View vendor scorecard & performance audit"
                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setScorecardVendorId(o.id);
                              setScorecardVendorName(o.vendorName || o.name);
                            }}
                            className="h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {o.code ? `Code: ${o.code}` : ''}
                          {o.priceLabel ? ` · ${o.priceLabel}` : ''}
                          {typeof o.leadTimeDays === 'number' && o.leadTimeDays > 0 ? ` · ${o.leadTimeDays}d lead` : ''}
                          {o.ev?.grade ? ` · Grade: ${o.ev.grade}` : ''}
                        </span>
                        {o.badges && o.badges.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {o.badges.map((b, bIdx) => (
                              <span
                                key={bIdx}
                                className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 transition-colors"
                              >
                                {b.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }}
              />
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Ranked by AI scoring &amp; outsource capabilities.
              </span>
            </div>



            {/* Associated Job Work Order */}
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-foreground mb-1.5">
                Associated Job Work Order (Optional)
              </label>
              <select
                value={jobWorkOrderId}
                onChange={(e) => setJobWorkOrderId(e.target.value)}
                className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none shadow-2xs"
              >
                <option value="">General Vendor Deposit (Unlinked)</option>
                {orders
                  .filter((o) => !vendorId || o.vendorId === vendorId)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNumber}
                    </option>
                  ))}
              </select>
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Link this delivery challan to a specific order.
              </span>
            </div>
          </div>
        </Card>

        {/* Card 2: Standard BOM Recipe & Inventory Stock Availability */}
        <Card className="p-6 border-border shadow-xs rounded-2xl bg-card space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2.5">
              <Layers className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-base font-extrabold text-foreground">
                  2. Standard BOM Requirements &amp; Inventory Availability Check
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {bomNumber ? `Loaded approved Standard BOM: ${bomNumber}` : 'Standard BOM recipe for output product'}
                  {' — checks company warehouse inventory stock before issuing challan.'}
                </p>
              </div>
            </div>
            {evaluatedBomLines.length > 0 && (
              allMaterialsAvailable ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="h-4 w-4" /> All Materials Available in Stock
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-destructive/10 text-destructive border border-destructive/30">
                  <AlertTriangle className="h-4 w-4" /> Inventory Shortage — Cannot Issue
                </span>
              )
            )}
          </div>

          {isBomLoading || isInventoryLoading ? (
            <div className="py-6 text-center text-xs text-muted-foreground animate-pulse">
              Verifying standard BOM and warehouse inventory balances…
            </div>
          ) : evaluatedBomLines.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Select an output product above to load required raw materials from its standard BOM.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-background">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground font-bold border-b border-border">
                  <tr>
                    <th className="p-3 uppercase tracking-wide">Raw Material</th>
                    <th className="p-3 uppercase tracking-wide">Required Dispatched Qty</th>
                    <th className="p-3 uppercase tracking-wide">Available in Warehouse</th>
                    <th className="p-3 uppercase tracking-wide">Stock Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {evaluatedBomLines.map((line) => (
                    <tr key={line.id} className="hover:bg-muted/30 transition">
                      <td className="p-3 font-semibold text-foreground">
                        <div>{line.materialName}</div>
                        {line.materialCode && (
                          <div className="text-[10px] font-mono text-muted-foreground">{line.materialCode}</div>
                        )}
                      </td>
                      <td className="p-3 font-bold font-mono text-primary">
                        {line.requiredQty} {line.uomLabel}
                      </td>
                      <td className="p-3 font-bold font-mono">
                        {line.availableInInventory} {line.uomLabel}
                      </td>
                      <td className="p-3">
                        {line.isAvailable ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> In Stock (+{(line.availableInInventory - line.requiredQty).toFixed(2)})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5" /> Shortage (Deficit: {(line.requiredQty - line.availableInInventory).toFixed(2)} {line.uomLabel})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Card 3: Transport & Transit Logistics */}
        <Card className="p-6 border-border shadow-xs rounded-2xl bg-card space-y-5">
          <div className="flex items-center gap-2.5 border-b border-border pb-3">
            <Truck className="h-5 w-5 text-primary" />
            <h3 className="text-base font-extrabold text-foreground">
              3. Transporter &amp; Logistics Details
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                Vehicle / Lorry Registration No.
              </label>
              <input
                type="text"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                placeholder="e.g. MH-12-AB-1234"
                className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                Transporter Company Name
              </label>
              <input
                type="text"
                value={transporterName}
                onChange={(e) => setTransporterName(e.target.value)}
                placeholder="e.g. SpeedFreight Logistics"
                className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                Driver Contact / Mobile
              </label>
              <input
                type="text"
                value={driverContact}
                onChange={(e) => setDriverContact(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none shadow-2xs"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-foreground mb-1.5">
                Challan Remarks &amp; Instructions
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none shadow-2xs"
              />
            </div>
          </div>
        </Card>

        {/* Statutory Rule 55 Notice */}
        <div className="p-4 rounded-2xl border border-primary/20 bg-primary/5 flex items-start gap-3 text-xs text-muted-foreground">
          <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-foreground uppercase tracking-wide">
              Rule 55 Statutory Delivery Challan Note
            </span>
            <p className="mt-0.5">
              Goods dispatched under this challan are for outsourced processing only and not for sale. The material continues to be Plinth-owned property throughout vendor custody.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Link href="/job-work">
            <Button type="button" variant="outline" className="text-xs font-bold">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            loading={loading}
            disabled={loading || !allMaterialsAvailable}
            title={!allMaterialsAvailable ? 'Inventory stock is insufficient for required BOM materials' : undefined}
            className="bg-[#173796] hover:bg-[#122b77] text-white font-extrabold text-xs shadow-sm px-6 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generate Delivery Challan &amp; Dispatch
          </Button>
        </div>
      </form>

      {/* Vendor Scorecard Drawer */}
      <VendorScorecardDialog
        open={Boolean(scorecardVendorId)}
        onClose={() => { setScorecardVendorId(null); setScorecardVendorName(null); }}
        variant="drawer"
        vendorId={scorecardVendorId}
        vendorName={scorecardVendorName}
      />
    </div>
  );
}
