'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, Button } from '@plinth/ui';
import { jobWorkApi } from '../api';
import { fetchApi } from '@/features/api/client';

interface CreateJobWorkOrderModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateJobWorkOrderModal({ open, onClose, onSuccess }: CreateJobWorkOrderModalProps) {
  const [vendors, setVendors] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; sku: string }>>([]);
  const [materials, setMaterials] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [uoms, setUoms] = useState<Array<{ id: string; name: string; code: string; symbol?: string }>>([]);

  const [vendorId, setVendorId] = useState('');
  const [productId, setProductId] = useState('');
  const [targetQuantity, setTargetQuantity] = useState<number>(100);
  const [targetUomId, setTargetUomId] = useState('');
  const [rawMaterialInputQty, setRawMaterialInputQty] = useState<number>(4);
  const [expectedScrapRate, setExpectedScrapRate] = useState<number>(2);
  const [deliveryLocationId, setDeliveryLocationId] = useState('');
  const [natureOfProcessing, setNatureOfProcessing] = useState('Precision CNC Machining & Powder Coating');
  const [specifications, setSpecifications] = useState('Process per Drawing STD-JW-04, 25 micron finish');
  const [materialId, setMaterialId] = useState('');
  const [materialUomId, setMaterialUomId] = useState('');
  const [requiredMaterialQty, setRequiredMaterialQty] = useState<number>(4);
  const [allocatedDepositQty, setAllocatedDepositQty] = useState<number>(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadMasterData() {
      try {
        const [vRes, pRes, mRes, uRes, lRes] = await Promise.all([
          fetchApi<{ data: any[] }>('/master-data/vendors?activeOnly=true'),
          fetchApi<{ data: any[] }>('/master-data/products'),
          fetchApi<{ data: any[] }>('/master-data/materials'),
          fetchApi<{ data: any[] }>('/master-data/uom'),
          fetchApi<{ data: any[] }>('/master-data/warehouse-locations')
        ]);
        setVendors(vRes.data || []);
        setProducts(pRes.data || []);
        setMaterials(mRes.data || []);
        setUoms(uRes.data || []);

        if (vRes.data?.length) setVendorId(vRes.data[0].id);
        if (pRes.data?.length) setProductId(pRes.data[0].id);
        if (mRes.data?.length) setMaterialId(mRes.data[0].id);
        if (uRes.data?.length) {
          setTargetUomId(uRes.data[0].id);
          setMaterialUomId(uRes.data[0].id);
        }
        if (lRes.data?.length) setDeliveryLocationId(lRes.data[0].id);
      } catch (err: any) {
        console.error('Failed to load master data', err);
      }
    }
    if (open) loadMasterData();
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId || !materialId || !materialUomId) {
      setError('Please select vendor, material, and UOM.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await jobWorkApi.createOrder({
        vendorId,
        productId: productId || undefined,
        targetQuantity: Number(targetQuantity),
        targetUomId: targetUomId || undefined,
        rawMaterialInputQty: Number(rawMaterialInputQty),
        expectedScrapRate: Number(expectedScrapRate),
        deliveryLocationId: deliveryLocationId || undefined,
        natureOfProcessing,
        specifications,
        lines: [
          {
            materialId,
            uomId: materialUomId,
            requiredQuantity: Number(requiredMaterialQty),
            allocatedQuantity: Number(allocatedDepositQty)
          }
        ]
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create Job Work Order.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Create Job Work / Outsourcing Order">

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-rose-50 dark:bg-rose-950/50 p-3 text-xs font-bold text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Outsource Vendor *
              </label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-[#173796]"
                required
              >
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.code})
                  </option>
                ))}
              </select>
            </div>


            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Output Product / SKU
              </label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-[#173796]"
              >
                <option value="">Select Output Product...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Target Output Qty
                </label>
                <input
                  type="number"
                  value={targetQuantity}
                  onChange={(e) => setTargetQuantity(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-[#173796]"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  UOM
                </label>
                <select
                  value={targetUomId}
                  onChange={(e) => setTargetUomId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-[#173796]"
                >
                  {uoms.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.symbol || u.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3.5 space-y-3">
            <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">
              Raw Material Deposit & Allocation (Automatic Custody Balance Deduct)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Raw Material Item *
                </label>
                <select
                  value={materialId}
                  onChange={(e) => setMaterialId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium"
                >
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Allocated From Deposit (Tons/Qty)
                </label>
                <input
                  type="number"
                  value={allocatedDepositQty}
                  onChange={(e) => {
                    setAllocatedDepositQty(Number(e.target.value));
                    setRawMaterialInputQty(Number(e.target.value));
                    setRequiredMaterialQty(Number(e.target.value));
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Expected Scrap (%)
                </label>
                <input
                  type="number"
                  value={expectedScrapRate}
                  onChange={(e) => setExpectedScrapRate(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium"
                  step="0.1"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nature of Processing
              </label>
              <input
                type="text"
                value={natureOfProcessing}
                onChange={(e) => setNatureOfProcessing(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Processing Specifications & Tolerances
              </label>
              <textarea
                value={specifications}
                onChange={(e) => setSpecifications(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading} className="bg-[#173796] hover:bg-[#122b77] text-white">
              Create Job Work Order
            </Button>
          </div>
        </form>
    </Dialog>
  );
}
