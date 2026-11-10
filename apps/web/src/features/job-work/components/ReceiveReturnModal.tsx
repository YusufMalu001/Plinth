'use client';

import { Checkbox } from '@synergy/ui';
import React, { useState, useEffect } from 'react';
import { Dialog, Button } from '@synergy/ui';
import { jobWorkApi } from '../api';
import { fetchApi } from '@/features/api/client';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ReceiveReturnModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultVendorId?: string;
  defaultJobWorkOrderId?: string;
}

export function ReceiveReturnModal({ open, onClose, onSuccess, defaultVendorId, defaultJobWorkOrderId }: ReceiveReturnModalProps) {
  const [vendors, setVendors] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; sku: string }>>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [uoms, setUoms] = useState<Array<{ id: string; name: string; code: string; symbol?: string }>>([]);
  const [orders, setOrders] = useState<Array<{ id: string; orderNumber: string; vendorId: string }>>([]);

  const [vendorId, setVendorId] = useState(defaultVendorId || '');
  const [jobWorkOrderId, setJobWorkOrderId] = useState(defaultJobWorkOrderId || '');
  const [locationId, setLocationId] = useState('');
  const [productId, setProductId] = useState('');
  const [uomId, setUomId] = useState('');
  const [expectedQuantity, setExpectedQuantity] = useState<number>(100);
  const [receivedQuantity, setReceivedQuantity] = useState<number>(85);
  const [acceptedQuantity, setAcceptedQuantity] = useState<number>(85);
  const [consumedRawMaterial, setConsumedRawMaterial] = useState<number>(4);
  const [scrapQuantity, setScrapQuantity] = useState<number>(0.1);
  const [generateDebitNote, setGenerateDebitNote] = useState(true);
  const [notes, setNotes] = useState('Processed output received at receiving dock');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shortQuantity = Math.max(0, expectedQuantity - receivedQuantity);

  useEffect(() => {
    async function loadData() {
      try {
        const [vRes, pRes, lRes, uRes, oRes] = await Promise.all([
          fetchApi<{ data: any[] }>('/master-data/vendors?activeOnly=true'),
          fetchApi<{ data: any[] }>('/master-data/products'),
          fetchApi<{ data: any[] }>('/master-data/warehouse-locations'),
          fetchApi<{ data: any[] }>('/master-data/uom'),
          jobWorkApi.getOrders()
        ]);
        setVendors(vRes.data || []);
        setProducts(pRes.data || []);
        setLocations(lRes.data || []);
        setUoms(uRes.data || []);
        setOrders(oRes.items || []);
        if (defaultVendorId) setVendorId(defaultVendorId);
        else if (vRes.data?.length) setVendorId(vRes.data[0].id);
        if (defaultJobWorkOrderId) setJobWorkOrderId(defaultJobWorkOrderId);
        if (pRes.data?.length) setProductId(pRes.data[0].id);
        if (lRes.data?.length) setLocationId(lRes.data[0].id);
        if (uRes.data?.length) setUomId(uRes.data[0].id);
      } catch (err: any) {
        console.error('Failed to load return master data', err);
      }
    }
    if (open) loadData();
  }, [open, defaultVendorId, defaultJobWorkOrderId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId || !locationId || !productId || !uomId) {
      setError('Please fill in all mandatory fields.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await jobWorkApi.receiveReturn({
        vendorId,
        locationId,
        productId,
        uomId,
        expectedQuantity: Number(expectedQuantity),
        receivedQuantity: Number(receivedQuantity),
        acceptedQuantity: Number(acceptedQuantity),
        consumedRawMaterial: Number(consumedRawMaterial),
        scrapQuantity: Number(scrapQuantity),
        jobWorkOrderId: jobWorkOrderId || undefined,
        generateDebitNoteForShortage: generateDebitNote,
        debitNoteReason: `Job Work Shortage: Expected ${expectedQuantity}, received ${receivedQuantity}. Shortage claim: ${shortQuantity} units.`,
        notes
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to process return and GRN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Receive Job Work Return / Output (Normal GRN Flow)">

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
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium"
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
                Receiving Location *
              </label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium"
                required
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Received Product / SKU *
              </label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium"
                required
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Unit of Measure (UOM) *
              </label>
              <select
                value={uomId}
                onChange={(e) => setUomId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium"
                required
              >
                {uoms.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.symbol || u.code} ({u.name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Linked Job Work Order
              </label>
              <select
                value={jobWorkOrderId}
                onChange={(e) => setJobWorkOrderId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium"
              >
                <option value="">Direct Return (No order link)</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3.5 space-y-3">
            <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">
              Quantity Measurements & Inspection
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Expected Output Qty
                </label>
                <input
                  type="number"
                  value={expectedQuantity}
                  onChange={(e) => setExpectedQuantity(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Received Qty
                </label>
                <input
                  type="number"
                  value={receivedQuantity}
                  onChange={(e) => {
                    setReceivedQuantity(Number(e.target.value));
                    setAcceptedQuantity(Number(e.target.value));
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Accepted Qty (GRN)
                </label>
                <input
                  type="number"
                  value={acceptedQuantity}
                  onChange={(e) => setAcceptedQuantity(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Consumed Raw Material
                </label>
                <input
                  type="number"
                  value={consumedRawMaterial}
                  onChange={(e) => setConsumedRawMaterial(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Scrap Qty
                </label>
                <input
                  type="number"
                  value={scrapQuantity}
                  onChange={(e) => setScrapQuantity(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium"
                  step="0.01"
                />
              </div>
            </div>
          </div>

          {/* Shortage & Debit Note Banner */}
          {shortQuantity > 0 ? (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30 p-3.5 space-y-2">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-black text-rose-900 dark:text-rose-200 uppercase tracking-wider">
                    Shortage Detected ({shortQuantity} Units Short)
                  </h4>
                  <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
                    As per standard receiving flow, a Debit Note will automatically be initiated in the Debit Notes registry for supplier review.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Checkbox

                  id="dn-check"
                  checked={generateDebitNote}
                  onChange={(e) => setGenerateDebitNote(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#173796] focus:ring-[#173796]"
                />
                <label htmlFor="dn-check" className="text-xs font-extrabold text-slate-900 dark:text-white">
                  Automatically generate Debit Note claim for shortage of {shortQuantity} units
                </label>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 p-3 flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-extrabold text-emerald-900 dark:text-emerald-200">
                Full quantity received with zero shortage. GRN and inventory receipt will be finalized.
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Return & Receiving Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white font-medium"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading} className="bg-[#173796] hover:bg-[#122b77] text-white">
              Process Return & GRN
            </Button>
          </div>
        </form>
    </Dialog>
  );
}
