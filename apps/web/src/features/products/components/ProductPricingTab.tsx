import React from 'react';
import { Receipt, Percent, Tag, Building2, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../../api/client';
import type { DetailedProduct } from '../types';
import { calculateTierPrice } from '../utils/tierPricing';

interface ProductPricingTabProps { product: DetailedProduct; onOpenEdit?: () => void }
interface ProductTierPricing {
  tierId: string;
  tierName: string;
  masterPrice?: number;
  defaultDiscountPercentage?: number;
  discountPercentage: number;
  isCustomPrice?: boolean;
  customPrice?: number | string;
  calculatedPrice?: number;
  enabled?: boolean;
}

interface VendorPricingRow {
  id: string;
  vendorId: string;
  unitPrice: number | string;
  moq: number | string | null;
  leadTimeDays: number | null;
  vendor?: {
    id: string;
    code: string;
    name: string;
    currency: string | null;
    status: string;
    paymentTerms: string | null;
    leadTimeDays: number | null;
  };
}

export function ProductPricingTab({ product, onOpenEdit }: ProductPricingTabProps) {
  const metadata = (product.metadata || {}) as Record<string, unknown>;
  const tiers = (Array.isArray(metadata.tierPricing) ? metadata.tierPricing : []) as ProductTierPricing[];
  const isRawMaterial = /raw\s*materials?/i.test(product.category?.name || '')
    || String(metadata.materialType || '').toUpperCase() === 'RAW_MATERIAL';

  // Query vendors supplying this product
  const { data: rawVendorPricingData, isLoading: loadingVendors } = useQuery<any>({
    queryKey: ['product-vendor-pricing', product.id],
    queryFn: () => fetchApi<any>(`/master-data/products/${product.id}/vendor-pricing`),
    staleTime: 30_000,
  });

  const vendorSources: VendorPricingRow[] = Array.isArray(rawVendorPricingData)
    ? rawVendorPricingData
    : Array.isArray(rawVendorPricingData?.data)
    ? rawVendorPricingData.data
    : [];

  const mrp = Number(metadata.mrp ?? (isRawMaterial ? metadata.costPrice : 0) ?? 0);
  const costPrice = Number(metadata.costPrice ?? (isRawMaterial ? metadata.mrp : 0) ?? 0);
  const globalDiscount = Math.max(0, Math.min(100, Number(metadata.globalDiscountPercentage ?? 0)));
  const additionalDiscount = Math.max(0, Math.min(100, Number(metadata.additionalDiscountPercentage ?? 0)));

  const globalDiscountAmount = (mrp * globalDiscount) / 100;
  const priceAfterGlobal = Math.max(0, mrp - globalDiscountAmount);
  const addlDiscountAmount = (priceAfterGlobal * additionalDiscount) / 100;
  const baseNetPrice = Math.max(0, Math.round((priceAfterGlobal - addlDiscountAmount) * 100) / 100);

  const getTierPrice = (tier: ProductTierPricing) => {
    if (tier.isCustomPrice && tier.customPrice && Number.isFinite(Number(tier.customPrice))) {
      return Number(tier.customPrice);
    }
    const basePrice = tier.masterPrice != null ? Number(tier.masterPrice) : baseNetPrice;
    if (!basePrice) return 0;
    return calculateTierPrice(basePrice, Number(tier.discountPercentage));
  };

  return (
    <div className="space-y-6">
      {/* Commercial KPI Card */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs md:p-6">
        {onOpenEdit && (
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={onOpenEdit}
              className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/10 transition-colors cursor-pointer"
            >
              Edit Pricing &amp; Tiers
            </button>
          </div>
        )}

        {/* Commercial KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{isRawMaterial ? 'Cost Price (₹)' : 'List MRP (₹)'}</p>
            <p className="mt-1 font-mono text-xl font-black text-foreground">₹{(isRawMaterial ? costPrice : mrp) > 0 ? (isRawMaterial ? costPrice : mrp).toLocaleString('en-IN') : '—'}</p>
          </div>
          {!isRawMaterial && <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Global Discount</p>
            <p className="mt-1 flex items-center gap-1 font-mono text-xl font-black text-tone-green-text">
              <Percent className="h-4 w-4" /> {globalDiscount}%
            </p>
          </div>}
          {!isRawMaterial && <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Addl. Discount</p>
            <p className="mt-1 flex items-center gap-1 font-mono text-xl font-black text-tone-green-text">
              <Percent className="h-4 w-4" /> {additionalDiscount}%
            </p>
          </div>}
          {!isRawMaterial && <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Base Net Price (₹)</p>
            <p className="mt-1 font-mono text-xl font-black text-primary">₹{baseNetPrice > 0 ? baseNetPrice.toLocaleString('en-IN') : '—'}</p>
          </div>}
          {!isRawMaterial && <div className="col-span-2 rounded-xl border border-border/80 bg-muted/20 p-3.5 sm:col-span-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Assumed Standard Cost</p>
            <p className="mt-1 font-mono text-xl font-black text-muted-foreground">₹{costPrice > 0 ? costPrice.toLocaleString('en-IN') : '—'}</p>
          </div>}
        </div>

      </div>

      {/* Customer Pricing Tiers Matrix */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
        <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-foreground">Customer Tier Pricing Breakdown</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Target selling prices configured for Dealer, E-Trade, Amazon, and Wholesaler accounts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-bold text-foreground">
              {tiers.length} Active {tiers.length === 1 ? 'Tier' : 'Tiers'}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-14 px-5 py-3">#</th>
                <th className="px-5 py-3">Customer Level / Tier</th>
                <th className="px-5 py-3">Master Price</th>
                <th className="px-5 py-3">Tier Discount</th>
                <th className="px-5 py-3">Net Effective Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {tiers.map((tier, index) => {
                const finalPrice = getTierPrice(tier);
                const isCustom = tier.isCustomPrice;
                const totalOffMrp = mrp > 0 ? ((1 - finalPrice / mrp) * 100).toFixed(1) : '0.0';
                const levelDisplayName = (tier as any).level || tier.tierName;

                return (
                  <tr key={tier.tierId || index} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-4 font-mono text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, '0')}
                    </td>
                    <td className="px-5 py-4 font-bold text-foreground">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-black text-primary">
                          {levelDisplayName ? levelDisplayName[0]?.toUpperCase() : 'L'}
                        </span>
                        <span>{levelDisplayName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono font-bold text-primary">
                      ₹{Number(tier.masterPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-4 font-mono font-bold text-tone-green-text">
                      {isCustom ? (
                        <span className="text-xs text-muted-foreground font-normal italic">N/A (Fixed Rate)</span>
                      ) : (
                        `${tier.discountPercentage}% off tier price`
                      )}
                    </td>
                    <td className="px-5 py-4 font-mono">
                      <div className="flex items-baseline gap-2">
                        <span className="text-base font-black text-primary">
                          ₹{finalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {mrp > 0 && (
                          <span className="text-xs font-semibold text-muted-foreground">
                            ({totalOffMrp}% total off MRP)
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {tiers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                    <Receipt className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
                    <p className="font-bold text-foreground text-sm">No Customer Tiers Configured</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Edit this product to apply a Pricing Master or configure Dealer, E-Trade, and Amazon tiers.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* VENDOR PRICINGS CARD */}
      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5 md:p-6 bg-muted/20">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <h3 className="text-base font-bold text-foreground">Vendor Pricings</h3>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary font-mono">
                {vendorSources.length} {vendorSources.length === 1 ? 'vendor' : 'vendors'}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Complete list of vendors offering this item along with their respective quoted supply prices and commercial terms.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/80 bg-muted/50 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Vendor Code</th>
                <th className="px-5 py-3">Vendor Name</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Agreed Supply Price (₹)</th>
                <th className="px-5 py-3 text-right">MOQ</th>
                <th className="px-5 py-3 text-right">Lead Time</th>
                <th className="px-5 py-3">Payment Terms</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loadingVendors ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                    Loading vendor sourcing details...
                  </td>
                </tr>
              ) : vendorSources.length > 0 ? (
                vendorSources.map((row) => {
                  const v = row.vendor;
                  const price = Number(row.unitPrice || 0);
                  const moq = row.moq ? Number(row.moq) : 1;
                  const leadTime = row.leadTimeDays ?? v?.leadTimeDays ?? 7;

                  return (
                    <tr key={row.id} className="hover:bg-muted/25 transition-colors">
                      <td className="px-5 py-3.5 font-mono font-bold text-primary">
                        {v?.code || '—'}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-foreground">
                        {v?.name || 'Unnamed Vendor'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${
                          v?.status === 'ACTIVE' || v?.status === 'APPROVED'
                            ? 'bg-tone-green-bg text-tone-green-text'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {v?.status ? v.status.replace('_', ' ') : 'ACTIVE'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-base font-black text-foreground text-right">
                        ₹ {price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-muted-foreground text-right">
                        {moq}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-muted-foreground text-right">
                        {leadTime}d
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground font-medium">
                        {v?.paymentTerms || 'Net 30'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {v?.id && (
                          <Link
                            href={`/vendors/${v.id}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                          >
                            Profile <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                    <Building2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
                    <p className="font-bold text-foreground text-sm">No Sourcing Vendors Configured</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      This item is not currently listed under any vendor&apos;s supplied catalog. Map it in the Vendor Directory.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
