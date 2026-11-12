'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BadgePercent, Check, Edit2, Plus, Trash2, X } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@plinth/ui';
import { usePricingMaster, useUpdatePricingMaster, type PricingTier } from '../../../../../hooks/useMasterData';
import { usePricingLevels } from '../../../../../hooks/usePricingLevels';
import { PricingLevelModal } from '../../../../../features/products/components/PricingLevelModal';
import { LoadingState } from '../../../../../components/LoadingState';
import { ErrorState } from '../../../../../components/ErrorState';
import { showToast } from '../../../../../components/toast-store';
import { calculateTierPrice, handleNumberInputWheel, handleNumberInputKeyDown } from '../../../../../features/products/utils/tierPricing';

const blankTier = (name = ''): PricingTier => ({ id: `tier-${Date.now()}`, name, price: '' as any, discountPercentage: '' as any, isActive: true });
const inputClass = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

export default function PricingMasterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = usePricingMaster(id);
  const updateMutation = useUpdatePricingMaster();
  const { levels: pricingLevels } = usePricingLevels();
  const [isLevelModalOpen, setIsLevelModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(searchParams.get('edit') === '1');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tiers, setTiers] = useState<PricingTier[]>([]);

  useEffect(() => {
    if (!query.data) return;
    setName(query.data.name || '');
    setDescription(query.data.description || '');
    setTiers(query.data.tiers || []);
  }, [query.data]);

  if (query.isLoading) return <LoadingState message="Loading pricing master..." />;
  if (query.error || !query.data) return <ErrorState error={(query.error as Error) || new Error('Pricing master not found')} retry={query.refetch} />;

  const master = query.data;
  const updateTier = (index: number, patch: Partial<PricingTier>) => setTiers((current) => current.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));
  const reset = () => {
    setIsEditing(false);
    if (searchParams.get('edit') === '1') router.replace(`/products/pricing-masters/${id}`, { scroll: false });
    setName(master.name || '');
    setDescription(master.description || '');
    setTiers(master.tiers || []);
  };
  const handleSave = async () => {
    const cleanTiers = tiers.filter((tier) => tier.name.trim()).map((tier) => ({
      id: tier.id,
      name: tier.name.trim(),
      price: Number(tier.price) || 0,
      discountPercentage: Number(tier.discountPercentage) || 0,
      isActive: tier.isActive !== false,
    }));
    if (!name.trim() || cleanTiers.length === 0) {
      showToast({ kind: 'error', title: 'Incomplete Pricing Master', message: 'Enter a master name and at least one tier.' });
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: master.id, name: name.trim(), description: description.trim() || null, tiers: cleanTiers, fields: master.fields || [], columns: master.columns || [] });
      showToast({ kind: 'success', title: 'Pricing Master Updated', message: 'Changes saved successfully.' });
      setIsEditing(false);
      if (searchParams.get('edit') === '1') router.replace(`/products/pricing-masters/${id}`, { scroll: false });
      query.refetch();
    } catch (error) {
      showToast({ kind: 'error', title: 'Update Failed', message: error instanceof Error ? error.message : 'Error updating master' });
    }
  };

  const displayedTiers = isEditing ? tiers : master.tiers || [];
  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="w-full space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/products/pricing-masters" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" /> Pricing Masters
          </Link>
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <Button type="button" onClick={() => setIsEditing(true)} className="inline-flex items-center gap-2">
                <Edit2 className="h-4 w-4" /> Edit Pricing Master
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={reset}><X className="h-4 w-4" /> Cancel</Button>
                <Button type="button" disabled={updateMutation.isPending} onClick={handleSave}>
                  <Check className="h-4 w-4" /> {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </>
            )}
          </div>
        </div>

        <Card className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs">
          {!isEditing ? (
            <>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">{master.name}</h1>
              {master.description && <p className="mt-2 text-sm text-muted-foreground">{master.description}</p>}
            </>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">Master name <span className="text-destructive">*</span>
                <input value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} mt-1.5 normal-case tracking-normal text-foreground`} />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">Description
                <input value={description} onChange={(event) => setDescription(event.target.value)} className={`${inputClass} mt-1.5 normal-case tracking-normal text-foreground`} />
              </label>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 border-border-strong border-border px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2">
              <BadgePercent className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Pricing tiers</h2>
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">{displayedTiers.length}</span>
            </div>
            {isEditing && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsLevelModalOpen(true)}
                  className="h-8 rounded-xl text-xs font-bold gap-1.5 border-primary/30 text-primary hover:bg-primary/10 cursor-pointer"
                  icon={Plus}
                >
                  Level
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const unusedLevel = pricingLevels.find((lvl) => !tiers.some((t) => t.name === lvl)) || pricingLevels[0] || 'Dealer';
                    setTiers((current) => [...current, blankTier(unusedLevel)]);
                  }}
                  className="h-8 rounded-xl text-xs font-bold gap-1.5 border border-primary/50 bg-primary text-inverse shadow-sm hover:bg-primary/90 cursor-pointer"
                  icon={Plus}
                >
                  Add Tier
                </Button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <Table className="w-full min-w-[700px]">
              <TableHeader><TableRow>
                <TableHead>Level / Tier Name</TableHead>
                <TableHead>Price (₹)</TableHead>
                <TableHead>Discount (%)</TableHead>
                <TableHead>Applied price (₹)</TableHead>
                {isEditing && <TableHead className="w-14 text-center">Action</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {displayedTiers.map((tier, index) => {
                  const availableOptions = Array.from(new Set([...pricingLevels, tier.name].filter(Boolean)));
                  return (
                    <TableRow key={tier.id || index}>
                      <TableCell>
                        {isEditing ? (
                          <select
                            required
                            value={tier.name}
                            onChange={(event) => updateTier(index, { name: event.target.value })}
                            className={`${inputClass} cursor-pointer`}
                          >
                            <option value="" disabled>Select Level...</option>
                            {availableOptions.map((lvl) => (
                              <option key={lvl} value={lvl}>{lvl}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-semibold">{tier.name}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={tier.price === 0 || tier.price === '0' || tier.price === '' ? '' : tier.price}
                            onChange={(event) => updateTier(index, { price: event.target.value })}
                            onWheel={(e) => handleNumberInputWheel(e, tier.price, (val) => updateTier(index, { price: val }))}
                            onKeyDown={(e) => handleNumberInputKeyDown(e, tier.price, (val) => updateTier(index, { price: val }))}
                            placeholder="0"
                            className={`${inputClass} font-mono`}
                          />
                        ) : (
                          <span className="font-mono font-semibold">₹{Number(tier.price || 0).toFixed(2)}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
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
                            className={`${inputClass} font-mono`}
                          />
                        ) : (
                          <span className="font-mono font-semibold">{tier.discountPercentage}%</span>
                        )}
                      </TableCell>
                      <TableCell className="font-semibold text-primary">₹{calculateTierPrice(Number(tier.price), Number(tier.discountPercentage)).toFixed(2)}</TableCell>
                      {isEditing && <TableCell className="text-center"><button type="button" onClick={() => setTiers((current) => current.filter((_, i) => i !== index))} aria-label={`Remove ${tier.name || 'pricing tier'}`} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button></TableCell>}
                    </TableRow>
                  );
                })}
                {displayedTiers.length === 0 && <TableRow><TableCell colSpan={isEditing ? 5 : 4} className="h-24 text-center text-sm text-muted-foreground">No pricing tiers defined.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </Card>
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
