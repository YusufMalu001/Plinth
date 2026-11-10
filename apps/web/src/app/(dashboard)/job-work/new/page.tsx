'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader, Button, Card } from '@synergy/ui';
import {
  ArrowLeft,
  Package,
  Building2,
  Plus,
  Trash2,
  Scale,
  AlertTriangle,
  CheckCircle2,
  Info,
  Layers,
} from 'lucide-react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { jobWorkApi } from '@/features/job-work/api';
import { useProcurementSelectors, usePOList } from '@/features/purchases/hooks';
import { bomApi } from '@/features/bom/api';
import { vendorsApi, type GeminiVendorEvaluationDto } from '@/features/vendors/api';
import { VendorScorecardDialog } from '@/features/vendors/components/VendorScorecardDialog';
import { SearchableSelector } from '@/components/ui/SearchableSelector';
import { IssueChallanModal } from '@/features/job-work/components/IssueChallanModal';
import { showToast } from '@/components/toast-store';
import type { VendorCustodyBalanceDto } from '@synergy/types';

/* ─── Selector item types (derived from ProcurementSelectorData) ────────── */
type VendorItem     = { id: string; code: string; name: string; status?: string };
type ProductItem    = { id: string; sku: string; name: string; status?: string; uomId?: string; uom?: { id: string; code: string; symbol: string; name?: string } | null };
type MaterialItem   = { id: string; code: string; name: string; status?: string; uomId?: string; uom?: { id: string; code: string; symbol: string; name?: string } | null };
type UomItem        = { id: string; code: string; symbol: string; name: string; status?: string };
type LocationItem   = { id: string; code: string; name: string; status?: string };
type CapabilityItem = { id: string; vendorId: string; productId?: string | null; materialId?: string | null; categoryId?: string | null; unitPrice?: number | string | null; leadTimeDays?: number | null };

/* ─── Internal form types ────────────────────────────────────────────────── */
interface MaterialLine {
  id: string;
  materialId: string;
  uomId: string;
  requiredQuantity: number;
  allocatedQuantity: number;
  notes?: string;
}

interface TargetOutputItem {
  id: string;
  productId: string;
  natureOfProcessing: string;
  targetQuantity: number;
  targetUomId: string;
  expectedScrapRate: number;
  materialLines: MaterialLine[];
}

/* ─── Vendor option shape for the searchable selector (matching PO creation) ─── */
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

/* ══════════════════════════════════════════════════════════════════════════ */
export default function CreateJobWorkOrderPage() {
  const router = useRouter();

  /* Master data ─────────────────────────────────────────────────────────── */
  const { data: selectors, isLoading: isSelectorsLoading } = useProcurementSelectors();
  const { data: poData } = usePOList({ limit: 100 });

  const vendors:      VendorItem[]     = useMemo(() => selectors?.vendors.items     ?? [], [selectors]);
  const products:     ProductItem[]    = useMemo(() => selectors?.products.items    ?? [], [selectors]);
  const materials:    MaterialItem[]   = useMemo(() => selectors?.materials.items   ?? [], [selectors]);
  const allUoms:      UomItem[]        = useMemo(() => selectors?.uoms.items        ?? [], [selectors]);
  const locations:    LocationItem[]   = useMemo(() => selectors?.locations.items   ?? [], [selectors]);
  const capabilities: CapabilityItem[] = useMemo(() => selectors?.capabilities?.items ?? [], [selectors]);
  const purchaseOrders = useMemo(() => poData?.items ?? [], [poData]);

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
  /* Outsource vendors filter: only vendors that outsource (have capabilities for products or OUTSOURCING scoring profile) */
  const outsourceCapableVendors = useMemo(() => {
    const scoringVendors = new Set(
      (scoringReport?.evaluations || [])
        .filter((ev) => ev.vendorType === 'OUTSOURCING' || ev.vendorType === 'HYBRID')
        .map((ev) => ev.vendorId)
    );
    const capabilityProductVendors = new Set(
      capabilities.filter((c) => Boolean(c.productId)).map((c) => c.vendorId)
    );

    // Only vendors explicitly classified as outsourcing partners appear here.
    // No fallback to the full vendor list — Material Suppliers must never appear.
    const filtered = vendors.filter(
      (v) => scoringVendors.has(v.id) || capabilityProductVendors.has(v.id)
    );
    return filtered;
  }, [vendors, scoringReport, capabilities]);


  /* Form state ─────────────────────────────────────────────────────────── */
  const [vendorId,            setVendorId]            = useState('');
  const [purchaseOrderId,     setPurchaseOrderId]     = useState('');
  const [deliveryLocationId,  setDeliveryLocationId]  = useState('');
  const [notes,               setNotes]               = useState(
    'Raw material allocated from vendor deposit. Standard delivery in 14 days.'
  );
  const [outputs, setOutputs] = useState<TargetOutputItem[]>([
    {
      id:                  'out-1',
      productId:           '',
      natureOfProcessing:  'Precision CNC Machining & Powder Coating',
      targetQuantity:      100,
      targetUomId:         '',
      expectedScrapRate:   2,
      materialLines:       [],
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  /* Scorecard drawer ───────────────────────────────────────────────────── */
  const [scorecardVendorId,   setScorecardVendorId]   = useState<string | null>(null);
  const [scorecardVendorName, setScorecardVendorName] = useState<string | null>(null);

  /* Issue-Stock modal ──────────────────────────────────────────────────── */
  const [issueModalOpen,         setIssueModalOpen]         = useState(false);
  const [issueDeficitMaterialId, setIssueDeficitMaterialId] = useState<string | undefined>();
  const [issueDeficitQty,        setIssueDeficitQty]        = useState<number | undefined>();

  /* Vendor custody balances ────────────────────────────────────────────── */
  const [custodyBalances,  setCustodyBalances]  = useState<VendorCustodyBalanceDto[]>([]);
  const [isCustodyLoading, setIsCustodyLoading] = useState(false);

  const loadCustodyBalances = useCallback(async (vId: string) => {
    if (!vId) { setCustodyBalances([]); return; }
    try {
      setIsCustodyLoading(true);
      const res = await jobWorkApi.getVendorCustodyBalances(vId);
      setCustodyBalances(res ?? []);
    } catch (err) {
      console.error('[JobWork] Failed to load vendor custody balances', err);
      setCustodyBalances([]);
    } finally {
      setIsCustodyLoading(false);
    }
  }, []);

  useEffect(() => { void loadCustodyBalances(vendorId); }, [vendorId, loadCustodyBalances]);

  /* Default receiving location ─────────────────────────────────────────── */
  useEffect(() => {
    if (locations.length > 0 && !deliveryLocationId) {
      const loc =
        locations.find((l) => /central|main|default|plant|store/i.test(l.name || l.code)) ??
        locations[0];
      setDeliveryLocationId(loc.id);
    }
  }, [locations, deliveryLocationId]);

  /* Seed first output once products arrive ─────────────────────────────── */
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || products.length === 0) return;
    const firstPrd = products.find((p) => /semi.?round.?cap/i.test(p.name)) ?? products[0];
    if (firstPrd) {
      seededRef.current = true;
      void handleProductSelect('out-1', firstPrd.id);
    }
    // handleProductSelect is stable after initial render; dep on products is intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  /* ── BOM explosion + vendor auto-rank on product selection ───────────── */
  const handleProductSelect = async (outputId: string, selectedProductId: string) => {
    const targetProduct = products.find((p) => p.id === selectedProductId);
    const resolvedUomId = targetProduct?.uomId ?? allUoms[0]?.id ?? '';

    /* 1. Rank capable outsourcing vendors by AI score */
    const capableVendorIds = new Set(
      capabilities
        .filter((c) => c.productId === selectedProductId)
        .map((c) => c.vendorId)
    );
    // Filter vendors to outsourcing partners
    const pool = outsourceCapableVendors;
    const eligible = [...pool]
      .filter((v) => capableVendorIds.has(v.id))
      .sort((a, b) => (vendorScoreMap.get(b.id) ?? -1) - (vendorScoreMap.get(a.id) ?? -1));

    if (eligible.length > 0) setVendorId(eligible[0].id);
    else if (pool.length > 0) {
      const sortedPool = [...pool].sort((a, b) => (vendorScoreMap.get(b.id) ?? -1) - (vendorScoreMap.get(a.id) ?? -1));
      setVendorId(sortedPool[0].id);
    }
    // No fallback to unclassified vendors — only outsourcing partners are eligible.
    /* 2. Fetch latest approved BOM */
    let standardLines: MaterialLine[] = [];
    try {
      const bomRes = await bomApi.listVersions({
        productId: selectedProductId,
        status: 'APPROVED',
        limit: 1,
      });
      const summary = bomRes?.items?.[0];
      if (summary) {
        const detail  = await bomApi.getVersion(summary.id);
        const outputQty = outputs.find((o) => o.id === outputId)?.targetQuantity ?? 100;

        standardLines = detail.lines
          .filter((l) => l.materialId != null)
          .map((l) => {
            const baseQty = Number(l.quantity || 1);
            const reqQty  = l.quantityMode === 'SCALED' ? baseQty * outputQty : baseQty;
            return {
              id:                `mat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              materialId:        l.materialId as string, // filtered above: guaranteed non-null
              uomId:             l.uomId,
              requiredQuantity:  Number(reqQty.toFixed(2)),
              allocatedQuantity: Number(reqQty.toFixed(2)),
              notes:             `Standard BOM (${summary.bomNumber}) requirement`,
            };
          });
      }
    } catch (err) {
      console.warn('[JobWork] BOM lookup failed for product', selectedProductId, err);
    }

    /* Leave lines empty when no approved BOM exists */
    if (standardLines.length === 0) {
      standardLines = [];
    }

    setOutputs((prev) =>
      prev.map((o) =>
        o.id !== outputId
          ? o
          : { ...o, productId: selectedProductId, targetUomId: resolvedUomId, materialLines: standardLines }
      )
    );
  };

  /* ── Scale BOM lines when target quantity changes ─────────────────────── */
  const handleTargetQtyChange = (outputId: string, newQty: number) => {
    setOutputs((prev) =>
      prev.map((o) => {
        if (o.id !== outputId) return o;
        const scale = o.targetQuantity > 0 ? newQty / o.targetQuantity : 1;
        return {
          ...o,
          targetQuantity: newQty,
          materialLines: o.materialLines.map((ml) => ({
            ...ml,
            requiredQuantity:  Math.max(0.01, Number((ml.requiredQuantity  * scale).toFixed(2))),
            allocatedQuantity: Math.max(0,    Number((ml.allocatedQuantity * scale).toFixed(2))),
          })),
        };
      })
    );
  };

  /* ── Output CRUD ──────────────────────────────────────────────────────── */
  const addOutput = () => {
    const prd   = products.find((p) => /semi.?round.?cap/i.test(p.name)) ?? products[0];
    const newId = `out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setOutputs((prev) => [
      ...prev,
      {
        id:                 newId,
        productId:          prd?.id ?? '',
        natureOfProcessing: 'Precision CNC Machining & Powder Coating',
        targetQuantity:     100,
        targetUomId:        prd?.uomId ?? allUoms[0]?.id ?? '',
        expectedScrapRate:  2,
        materialLines:      [],
      },
    ]);
    if (prd?.id) void handleProductSelect(newId, prd.id);
  };

  const removeOutput = (outputId: string) => {
    if (outputs.length <= 1) return;
    setOutputs((prev) => prev.filter((o) => o.id !== outputId));
  };

  const updateOutput = <K extends keyof TargetOutputItem>(
    outputId: string, field: K, value: TargetOutputItem[K]
  ) => setOutputs((prev) => prev.map((o) => o.id !== outputId ? o : { ...o, [field]: value }));

  /* ── Material line CRUD ───────────────────────────────────────────────── */
  const addMaterialLine = (outputId: string) => {
    const def    = materials[0];
    const defUom = def?.uomId ?? def?.uom?.id ?? allUoms[0]?.id ?? '';
    setOutputs((prev) =>
      prev.map((o) =>
        o.id !== outputId ? o : {
          ...o,
          materialLines: [...o.materialLines, {
            id:                `mat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            materialId:        def?.id ?? '',
            uomId:             defUom,
            requiredQuantity:  1,
            allocatedQuantity: 1,
            notes:             '',
          }],
        }
      )
    );
  };

  const removeMaterialLine = (outputId: string, lineId: string) => {
    setOutputs((prev) =>
      prev.map((o) => {
        if (o.id !== outputId || o.materialLines.length <= 1) return o;
        return { ...o, materialLines: o.materialLines.filter((l) => l.id !== lineId) };
      })
    );
  };

  const updateMaterialLine = (
    outputId: string, lineId: string, field: keyof MaterialLine, value: string | number | undefined
  ) => {
    setOutputs((prev) =>
      prev.map((o) => {
        if (o.id !== outputId) return o;
        return {
          ...o,
          materialLines: o.materialLines.map((l) => {
            if (l.id !== lineId) return l;
            const updated: MaterialLine = { ...l, [field]: value };
            if (field === 'materialId' && typeof value === 'string') {
              const mat  = materials.find((m) => m.id === value);
              const pUom = mat?.uomId ?? mat?.uom?.id;
              if (pUom) updated.uomId = pUom;
            }
            return updated;
          }),
        };
      })
    );
  };

  /* ── Aggregated material requirement across all outputs ───────────────── */
  const requiredMaterials = useMemo(() => {
    const map = new Map<string, { materialId: string; totalRequired: number; uomId: string }>();
    outputs.forEach((o) =>
      o.materialLines.forEach((l) => {
        if (!l.materialId) return;
        const e = map.get(l.materialId) ?? { materialId: l.materialId, totalRequired: 0, uomId: l.uomId };
        e.totalRequired += Number(l.allocatedQuantity || l.requiredQuantity || 0);
        map.set(l.materialId, e);
      })
    );
    return [...map.values()];
  }, [outputs]);

  /* ── Custody availability per material ───────────────────────────────── */
  const custodyStatus = useMemo(() => {
    const balMap = new Map<string, number>();
    custodyBalances.forEach((cb) => {
      if (cb.materialId)
        balMap.set(cb.materialId, (balMap.get(cb.materialId) ?? 0) + Number(cb.currentBalance ?? 0));
    });

    let allAvailable = true;
    const details = requiredMaterials.map((req) => {
      const mat       = materials.find((m) => m.id === req.materialId);
      const available = balMap.get(req.materialId) ?? 0;
      const isOk      = available >= req.totalRequired;
      const deficit   = req.totalRequired - available;
      if (!isOk) allAvailable = false;

      const uomObj   = allUoms.find((u) => u.id === req.uomId) ?? mat?.uom ?? null;
      const uomLabel = uomObj?.symbol ?? uomObj?.code ?? 'Units';

      return {
        materialId:   req.materialId,
        materialName: mat?.name ?? 'Raw Material',
        materialCode: mat?.code ?? '',
        required:     req.totalRequired,
        available,
        deficit:      deficit > 0 ? deficit : 0,
        uomLabel,
        isAvailable:  isOk,
      };
    });

    return { allAvailable, details };
  }, [requiredMaterials, custodyBalances, materials, allUoms]);

  /* ── Submission ───────────────────────────────────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId) { setError('Please select an outsource vendor.'); return; }

    if (!custodyStatus.allAvailable) {
      setError(
        'Vendor custody does not have sufficient raw material balance. Issue material to vendor custody first, then re-create the order.'
      );
      return;
    }

    const allLines = outputs.flatMap((o) => o.materialLines);
    if (allLines.some((l) => !l.materialId || !l.uomId || Number(l.requiredQuantity) <= 0)) {
      setError('Complete all required material lines with valid quantities.');
      return;
    }
    if (outputs.some((o) => !o.productId || Number(o.targetQuantity) <= 0)) {
      setError('Specify a valid output product and target quantity for every output.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const primaryOut       = outputs[0];
      const totalTargetQty   = outputs.reduce((s, o) => s + Number(o.targetQuantity  || 0), 0);
      const totalAllocated   = allLines.reduce((s, l) => s + Number(l.allocatedQuantity || l.requiredQuantity || 0), 0);
      const avgScrapRate     = outputs.reduce((s, o) => s + Number(o.expectedScrapRate || 0), 0) / (outputs.length || 1);
      const natureStr        = outputs.map((o) => o.natureOfProcessing).filter(Boolean).join(', ');

      await jobWorkApi.createOrder({
        vendorId,
        purchaseOrderId:     purchaseOrderId || undefined,
        productId:           primaryOut.productId || undefined,
        targetQuantity:      totalTargetQty,
        targetUomId:         primaryOut.targetUomId || undefined,
        rawMaterialInputQty: totalAllocated,
        expectedScrapRate:   avgScrapRate,
        deliveryLocationId:  deliveryLocationId || undefined,
        natureOfProcessing:  natureStr || undefined,
        specifications:      '',
        notes,
        lines: allLines.map((l) => {
          const parentOut = outputs.find((o) => o.materialLines.some((ml) => ml.id === l.id));
          const prd       = parentOut ? products.find((p) => p.id === parentOut.productId) : null;
          const ctx       = prd ? `[Output: ${prd.name} (${prd.sku})] ` : '';
          return {
            materialId:        l.materialId,
            uomId:             l.uomId,
            requiredQuantity:  Number(l.requiredQuantity),
            allocatedQuantity: Number(l.allocatedQuantity),
            notes:             ctx + (l.notes ?? ''),
          };
        }),
      });

      showToast({
        title:   'Job Work Order Created',
        message: 'Order created, material deducted from custody, and confirmation email dispatched to vendor.',
        kind:    'success',
      });
      router.push('/job-work');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create Job Work Order.');
      setLoading(false);
    }
  };

  /* ── Vendor dropdown options, sorted by score descending ─────────────── */
  const vendorOptions: VendorOption[] = useMemo(() => {
    // Find all outsource-capable vendor capabilities for the primary selected product
    const primaryProductId = outputs[0]?.productId;
    const productCaps = primaryProductId
      ? capabilities.filter((c) => c.productId === primaryProductId)
      : [];

    // Map capability by vendorId
    const capByVendor = new Map<string, CapabilityItem>();
    productCaps.forEach((cap) => {
      if (!capByVendor.has(cap.vendorId)) capByVendor.set(cap.vendorId, cap);
    });

    // Comparative metrics if multiple outsource vendors exist
    const evMap = vendorEvalMap;
    const eligibleVendors = outsourceCapableVendors;
    const isComparative = eligibleVendors.length >= 2;

    const validPrices = eligibleVendors
      .map((v) => Number(capByVendor.get(v.id)?.unitPrice))
      .filter((p) => p > 0);
    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
    const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : null;

    const validLeadTimes = eligibleVendors
      .map((v) => capByVendor.get(v.id)?.leadTimeDays)
      .filter((lt): lt is number => typeof lt === 'number' && lt > 0);
    const minLeadTime = validLeadTimes.length > 0 ? Math.min(...validLeadTimes) : null;
    const maxLeadTime = validLeadTimes.length > 0 ? Math.max(...validLeadTimes) : null;

    const validQualities = eligibleVendors
      .map((v) => evMap.get(v.id)?.qualityScore)
      .filter((q): q is number => typeof q === 'number');
    const maxQuality = validQualities.length > 0 ? Math.max(...validQualities) : null;
    const minQuality = validQualities.length > 0 ? Math.min(...validQualities) : null;

    const validDebits = eligibleVendors
      .map((v) => evMap.get(v.id)?.metrics?.totalDebitNotesCount ?? 0);
    const minDebits = validDebits.length > 0 ? Math.min(...validDebits) : null;
    const maxDebits = validDebits.length > 0 ? Math.max(...validDebits) : null;

    return eligibleVendors
      .map((v) => {
        const score = vendorScoreMap.get(v.id);
        const scoreTag = typeof score === 'number' ? `★ ${Math.round(score)}/100` : 'Score N/A';
        const ev = evMap.get(v.id);
        const cap = capByVendor.get(v.id);
        const unitPrice = cap?.unitPrice != null ? Number(cap.unitPrice) : null;
        const priceLabel = unitPrice && unitPrice > 0 ? `₹${unitPrice.toLocaleString('en-IN')}` : '';
        const leadTimeDays = cap?.leadTimeDays ?? null;

        // Highlights badges exactly matching PrCreationWorkspace logic
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
  }, [outsourceCapableVendors, vendors, capabilities, outputs, vendorScoreMap, vendorEvalMap]);

  /* ══════════════════════════════════════════════════════════════════════ */
  /* Render                                                                */
  /* ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6 font-manrope">

      <div className="flex items-center gap-2">
        <Link
          href="/job-work"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Job Work Dashboard
        </Link>
      </div>

      <PageHeader
        title="Create Job Work / Outsourcing Order"
        description="Automated BOM explosion, vendor scoring rank, vendor custody stock verification, and Resend email dispatch on creation."
      />

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs font-bold text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── Card 1: Target Output Products ────────────────────────────── */}
        <Card className="p-6 border-border shadow-xs rounded-2xl bg-card space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2.5">
              <Package className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-base font-extrabold text-foreground">
                  1. Product to Outsource &amp; Processing Specs
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select the product to outsource — its approved standard BOM explodes automatically and capable outsourcing partners auto-select.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addOutput}
              className="text-xs font-bold flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Add Output Product
            </Button>
          </div>

          <div className="space-y-5">
            {outputs.map((out, outIdx) => {
              const selPrd = products.find((p) => p.id === out.productId);
              return (
                <div key={out.id} className="rounded-2xl border border-border/70 bg-muted/15 p-4 sm:p-5 space-y-4">

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary font-black text-xs font-mono">
                        {outIdx + 1}
                      </span>
                      <span className="text-xs font-bold text-foreground">
                        {selPrd ? `${selPrd.name} (${selPrd.sku})` : `Target Output #${outIdx + 1}`}
                      </span>
                    </div>
                    {outputs.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOutput(out.id)}
                        className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1 px-2"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1.5">Output Product / SKU *</label>
                      <SearchableSelector
                        value={out.productId}
                        onChange={(val) => void handleProductSelect(out.id, val)}
                        options={products.map((p) => ({ id: p.id, name: p.name, code: p.sku }))}
                        placeholder="Search finished or semi-finished product…"
                        isLoading={isSelectorsLoading}
                        renderOption={(opt) => (
                          <div className="py-1">
                            <div className="font-semibold text-xs text-foreground">{opt.name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">{opt.code}</div>
                          </div>
                        )}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1.5">Nature of Processing</label>
                      <input
                        type="text"
                        value={out.natureOfProcessing}
                        onChange={(e) => updateOutput(out.id, 'natureOfProcessing', e.target.value)}
                        placeholder="e.g. Die Casting, Electroplating, CNC Machining"
                        className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none shadow-2xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1.5">Target Output Qty *</label>
                      <input
                        type="number"
                        value={out.targetQuantity}
                        onChange={(e) => handleTargetQtyChange(out.id, Number(e.target.value))}
                        min="1"
                        className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none shadow-2xs"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1.5">Output UOM *</label>
                      <select
                        value={out.targetUomId}
                        onChange={(e) => updateOutput(out.id, 'targetUomId', e.target.value)}
                        className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none shadow-2xs"
                        disabled={isSelectorsLoading}
                        required
                      >
                        {allUoms.map((u) => (
                          <option key={u.id} value={u.id}>{u.symbol} ({u.name})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1.5">Expected Scrap Rate (%)</label>
                      <input
                        type="number"
                        value={out.expectedScrapRate}
                        onChange={(e) => updateOutput(out.id, 'expectedScrapRate', Number(e.target.value))}
                        step="0.1" min="0" max="100"
                        className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none shadow-2xs"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <label className="block text-xs font-bold text-foreground mb-1.5">
              Order Notes &amp; Commercial Instructions
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Delivery schedules, payment terms, batch packaging notes…"
              className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none shadow-2xs"
            />
          </div>
        </Card>

        {/* ── Card 2: Outsource Partner & Destination ────────────────────── */}
        <Card className="p-6 border-border shadow-xs rounded-2xl bg-card space-y-5">
          <div className="flex items-center gap-2.5 border-b border-border pb-3">
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-base font-extrabold text-foreground">
                2. Outsource Partner &amp; Destination
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auto-selected &amp; ranked by AI scoring for this product — custody accuracy, scrap yield, and delivery punctuality.
                Click <Info className="inline h-3 w-3" /> to view a full vendor scorecard.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Vendor selector */}
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                Outsource Vendor (Auto-Selected / Ranked) *
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
            </div>

            {/* PO linkage */}
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                Associated Purchase Order (Optional)
              </label>
              <select
                value={purchaseOrderId}
                onChange={(e) => setPurchaseOrderId(e.target.value)}
                className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none shadow-2xs"
              >
                <option value="">Direct Order (no PO linkage)</option>
                {purchaseOrders.map((p) => (
                  <option key={p.id} value={p.id}>{p.poNumber}</option>
                ))}
              </select>
            </div>

          </div>
        </Card>

        {/* ── Card 3: Custody Verification ──────────────────────────────── */}
        <Card className="p-6 border-border shadow-xs rounded-2xl bg-card space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2.5">
              <Scale className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-base font-extrabold text-foreground">
                  3. Vendor Custody Stock Verification
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  BOM requirements are checked against the live vendor custody ledger. Order cannot be placed with a deficit.
                </p>
              </div>
            </div>
            {custodyStatus.details.length > 0 && (
              custodyStatus.allAvailable ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="h-4 w-4" /> All Stock Available
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                  <AlertTriangle className="h-4 w-4" /> Stock Deficit — Issue Required
                </span>
              )
            )}
          </div>

          {isCustodyLoading ? (
            <div className="py-6 text-center text-xs text-muted-foreground animate-pulse">
              Verifying vendor custody balances…
            </div>
          ) : custodyStatus.details.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No raw material lines yet. Select an output product above to populate BOM requirements.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-background">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground font-bold border-b border-border">
                  <tr>
                    <th className="p-3 uppercase tracking-wide">Raw Material</th>
                    <th className="p-3 uppercase tracking-wide">Required</th>
                    <th className="p-3 uppercase tracking-wide">In Vendor Custody</th>
                    <th className="p-3 uppercase tracking-wide">Deficit / Surplus</th>
                    <th className="p-3 uppercase tracking-wide text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {custodyStatus.details.map((item) => (
                    <tr key={item.materialId} className="hover:bg-muted/30 transition">
                      <td className="p-3 font-semibold text-foreground">
                        <div>{item.materialName}</div>
                        {item.materialCode && (
                          <div className="text-[10px] font-mono text-muted-foreground">{item.materialCode}</div>
                        )}
                      </td>
                      <td className="p-3 font-bold font-mono">{item.required} {item.uomLabel}</td>
                      <td className="p-3 font-bold font-mono">{item.available} {item.uomLabel}</td>
                      <td className="p-3 font-mono font-bold">
                        {item.isAvailable ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +{(item.available - item.required).toFixed(2)} {item.uomLabel}
                          </span>
                        ) : (
                          <span className="text-destructive font-black">
                            −{item.deficit.toFixed(2)} {item.uomLabel}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {item.isAvailable ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                          </span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setIssueDeficitMaterialId(item.materialId);
                              setIssueDeficitQty(item.deficit);
                              setIssueModalOpen(true);
                            }}
                            className="h-7 text-xs font-bold gap-1"
                          >
                            <Plus className="h-3 w-3" /> Issue Stock
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── Card 4: Raw Material Allocation ───────────────────────────── */}
        <Card className="p-6 border-border shadow-xs rounded-2xl bg-card space-y-6">
          <div className="flex items-center gap-2.5 border-b border-border pb-3">
            <Layers className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-base font-extrabold text-foreground">
                4. Raw Material Allocation from Vendor Custody Deposit
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Allocated quantities are deducted from the vendor&apos;s active custody balance on order confirmation.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {outputs.map((out, outIdx) => {
              const outPrd   = products.find((p) => p.id === out.productId);
              const outTitle = outPrd ? `${outPrd.name} (${outPrd.sku})` : `Output #${outIdx + 1}`;
              const outUom   = allUoms.find((u) => u.id === out.targetUomId);

              return (
                <div key={`alloc-${out.id}`} className="rounded-2xl border border-border/70 bg-muted/15 p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary font-black text-xs font-mono">
                        {outIdx + 1}
                      </span>
                      <h4 className="text-xs font-bold text-foreground">{outTitle}</h4>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        Target: {out.targetQuantity} {outUom?.symbol ?? outUom?.code ?? 'Units'}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addMaterialLine(out.id)}
                      className="text-xs font-bold flex items-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Material Line
                    </Button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-border bg-card">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/50 text-muted-foreground font-bold border-b border-border">
                        <tr>
                          <th className="p-3">Raw Material Item *</th>
                          <th className="p-3">Required Qty</th>
                          <th className="p-3">Allocated (MT/Qty)</th>
                          <th className="p-3">UOM</th>
                          <th className="p-3">Notes</th>
                          <th className="p-3 text-center">Del</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {out.materialLines.map((line) => (
                          <tr key={line.id} className="hover:bg-muted/30 transition">
                            <td className="p-2.5 min-w-[200px]">
                              <select
                                value={line.materialId}
                                onChange={(e) => updateMaterialLine(out.id, line.id, 'materialId', e.target.value)}
                                className="w-full rounded-lg border border-border bg-background p-2 text-xs font-semibold text-foreground focus:ring-1 focus:ring-primary outline-none"
                                required
                                disabled={isSelectorsLoading}
                              >
                                {materials.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name} {m.code ? `(${m.code})` : ''}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2.5 w-32">
                              <input
                                type="number"
                                value={line.requiredQuantity}
                                onChange={(e) => updateMaterialLine(out.id, line.id, 'requiredQuantity', Number(e.target.value))}
                                step="0.01" min="0.01"
                                className="w-full rounded-lg border border-border bg-background p-2 text-xs font-semibold text-foreground"
                                required
                              />
                            </td>
                            <td className="p-2.5 w-36">
                              <input
                                type="number"
                                value={line.allocatedQuantity}
                                onChange={(e) => updateMaterialLine(out.id, line.id, 'allocatedQuantity', Number(e.target.value))}
                                step="0.01" min="0"
                                className="w-full rounded-lg border border-border bg-background p-2 text-xs font-black text-primary"
                              />
                            </td>
                            <td className="p-2.5 w-28">
                              <select
                                value={line.uomId}
                                onChange={(e) => updateMaterialLine(out.id, line.id, 'uomId', e.target.value)}
                                className="w-full rounded-lg border border-border bg-background p-2 text-xs font-semibold text-foreground"
                                required
                                disabled={isSelectorsLoading}
                              >
                                {allUoms.map((u) => (
                                  <option key={u.id} value={u.id}>{u.symbol}</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2.5">
                              <input
                                type="text"
                                value={line.notes ?? ''}
                                onChange={(e) => updateMaterialLine(out.id, line.id, 'notes', e.target.value)}
                                placeholder="Lot / spec constraint"
                                className="w-full rounded-lg border border-border bg-background p-2 text-xs font-medium text-foreground"
                              />
                            </td>
                            <td className="p-2.5 text-center w-12">
                              <button
                                type="button"
                                onClick={() => removeMaterialLine(out.id, line.id)}
                                disabled={out.materialLines.length === 1}
                                className="p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-30 transition"
                                aria-label="Delete material line"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Link href="/job-work">
            <Button type="button" variant="outline" className="text-xs font-bold">Cancel</Button>
          </Link>
          <Button
            type="submit"
            loading={loading}
            disabled={loading || !custodyStatus.allAvailable}
            title={
              !custodyStatus.allAvailable
                ? 'Issue material to vendor custody first (see Card 3)'
                : undefined
            }
            className="bg-[#173796] hover:bg-[#122b77] text-white font-extrabold text-xs shadow-sm px-6 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Job Work Order
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

      {/* Issue Material to Vendor Custody */}
      <IssueChallanModal
        open={issueModalOpen}
        onClose={() => setIssueModalOpen(false)}
        defaultVendorId={vendorId}
        defaultMaterialId={issueDeficitMaterialId}
        defaultQuantity={issueDeficitQty}
        onSuccess={() => {
          setIssueModalOpen(false);
          if (vendorId) void loadCustodyBalances(vendorId);
          showToast({
            title:   'Material Issued to Vendor Custody',
            message: 'Delivery challan created and custody ledger updated. Retry order creation.',
            kind:    'success',
          });
        }}
      />
    </div>
  );
}
