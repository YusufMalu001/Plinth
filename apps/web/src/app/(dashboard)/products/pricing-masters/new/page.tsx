'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, BadgePercent, Plus, Save, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@synergy/ui';
import { useRouter } from 'next/navigation';
import { useCreatePricingMaster, type PricingTier } from '../../../../../hooks/useMasterData';
import { usePricingLevels } from '../../../../../hooks/usePricingLevels';
import { PricingLevelModal } from '../../../../../features/products/components/PricingLevelModal';
import { showToast } from '../../../../../components/toast-store';
import { ReturnToProductDraftBanner } from '../../../../../components/ReturnToProductDraftBanner';
import { calculateTierPrice, handleNumberInputWheel, handleNumberInputKeyDown } from '../../../../../features/products/utils/tierPricing';

const blankTier = (name = '', discount: number | string = ''): PricingTier => ({
  id: `tier-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  name,
  price: '' as any,
  discountPercentage: discount as any,
  isActive: true,
});

export default function CreatePricingMasterPage() {
  const router = useRouter();
  const create = useCreatePricingMaster();
  const { levels: pricingLevels } = usePricingLevels();
  const [isLevelModalOpen, setIsLevelModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tiers, setTiers] = useState<PricingTier[]>([blankTier('Dealer'), blankTier('E-Trade'), blankTier('Customer')]);

  const updateTier = (index: number, patch: Partial<PricingTier>) => setTiers((current) => current.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanTiers = tiers.filter((tier) => tier.name.trim()).map((tier) => ({
      id: tier.id || `tier-${Date.now()}`,
      name: tier.name.trim(),
      price: Number(tier.price) || 0,
      discountPercentage: Number(tier.discountPercentage) || 0,
      isActive: tier.isActive !== false,
    }));
    if (!name.trim()) { showToast({ kind: 'error', title: 'Master Name Required', message: 'Enter a pricing master name.' }); return; }
    if (cleanTiers.length === 0) { showToast({ kind: 'error', title: 'Pricing Tiers Required', message: 'Add at least one pricing tier.' }); return; }
    try {
      await create.mutateAsync({ name: name.trim(), description: description.trim() || undefined, fields: [], columns: [], tiers: cleanTiers });
      showToast({ kind: 'success', title: 'Pricing Master Created', message: `Configured ${cleanTiers.length} pricing tiers.` });
      router.push('/products/pricing-masters'); router.refresh();
    } catch (error) { showToast({ kind: 'error', title: 'Unable to Create Pricing Master', message: error instanceof Error ? error.message : 'Please try again.' }); }
  };

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/products/pricing-masters" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> Back to Pricing Masters</Link>
        </div>
        <ReturnToProductDraftBanner currentFlowName="Pricing Master" />
        <header><h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">Create Pricing Master</h1></header>
        <form onSubmit={submit} className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
          <div className="grid grid-cols-1 gap-4 border-b border-border p-6 md:grid-cols-2">
            <label className="block text-sm font-bold">Master name <span className="text-destructive">*</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Standard Commercial Pricing" className="mt-1.5 h-10 w-full rounded-xl border border-input bg-background px-3.5 text-sm font-semibold" /></label>
            <label className="block text-sm font-bold">Description<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional pricing policy description" className="mt-1.5 h-10 w-full rounded-xl border border-input bg-background px-3.5 text-sm font-medium" /></label>
          </div>
          <section className="m-6 space-y-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <BadgePercent className="h-5 w-5 text-primary" />
                <h2 className="text-base font-bold">Customer Pricing Tiers</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsLevelModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Level
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const unusedLevel = pricingLevels.find((lvl) => !tiers.some((t) => t.name === lvl)) || pricingLevels[0] || 'Dealer';
                    setTiers((current) => [...current, blankTier(unusedLevel)]);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-primary/50 bg-primary px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary/90 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Tier
                </button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border bg-background">
              <Table className="w-full min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Level / Tier Name</TableHead>
                    <TableHead>Price (₹)</TableHead>
                    <TableHead>Discount (%)</TableHead>
                    <TableHead>Applied price (₹)</TableHead>
                    <TableHead className="w-14 text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tiers.map((tier, index) => {
                    const availableOptions = Array.from(new Set([...pricingLevels, tier.name].filter(Boolean)));
                    return (
                      <TableRow key={tier.id || index}>
                        <TableCell>
                          <select
                            required
                            value={tier.name}
                            onChange={(event) => updateTier(index, { name: event.target.value })}
                            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 cursor-pointer"
                          >
                            <option value="" disabled>Select Level...</option>
                            {availableOptions.map((lvl) => (
                              <option key={lvl} value={lvl}>{lvl}</option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={tier.price === 0 || tier.price === '0' || tier.price === '' ? '' : tier.price}
                            onChange={(event) => updateTier(index, { price: event.target.value })}
                            onWheel={(e) => handleNumberInputWheel(e, tier.price, (val) => updateTier(index, { price: val }))}
                            onKeyDown={(e) => handleNumberInputKeyDown(e, tier.price, (val) => updateTier(index, { price: val }))}
                            placeholder="0"
                            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-mono font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                          />
                        </TableCell>
                        <TableCell>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={tier.discountPercentage === 0 || tier.discountPercentage === '0' || tier.discountPercentage === '' ? '' : tier.discountPercentage}
                            onChange={(event) => updateTier(index, { discountPercentage: event.target.value })}
                            onWheel={(e) => handleNumberInputWheel(e, tier.discountPercentage, (val) => updateTier(index, { discountPercentage: val }), { min: 0, max: 100 })}
                            onKeyDown={(e) => handleNumberInputKeyDown(e, tier.discountPercentage, (val) => updateTier(index, { discountPercentage: val }), { min: 0, max: 100 })}
                            placeholder="0"
                            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-mono font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                          />
                        </TableCell>
                        <TableCell className="font-semibold text-primary">₹{calculateTierPrice(Number(tier.price) || 0, Number(tier.discountPercentage) || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                          <button type="button" onClick={() => setTiers((current) => current.filter((_, i) => i !== index))} aria-label="Remove tier" className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {tiers.length === 0 && <TableRow><TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">No pricing tiers added.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </section>
          <div className="flex justify-end gap-3 border-t border-border bg-muted/20 px-6 py-4">
            <Link href="/products/pricing-masters" className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-bold">Cancel</Link>
            <button type="submit" disabled={create.isPending} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground cursor-pointer">
              <Save className="h-4 w-4" />{create.isPending ? 'Creating Master...' : 'Create Pricing Master'}
            </button>
          </div>
        </form>
      </div>

      <PricingLevelModal
        open={isLevelModalOpen}
        onClose={() => setIsLevelModalOpen(false)}
        onLevelCreated={(newLevel) => {
          setTiers((current) => [...current, blankTier(newLevel)]);
          setIsLevelModalOpen(false);
        }}
      />
    </div>
  );
}
