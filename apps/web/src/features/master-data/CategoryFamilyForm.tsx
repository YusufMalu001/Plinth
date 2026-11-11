'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { Button, Card, Input, PageHeader } from '@plinth/ui';
import { fetchApi } from '../api/client';
import { useCategories } from '../../hooks/useMasterData';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { showToast } from '../../components/toast-store';
import { ParentCategorySubcategories } from './CategorySubcategories';

type Kind = 'category' | 'family';

export function CategoryFamilyForm({ kind }: { kind: Kind }) {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const searchParams = useSearchParams();
  const id = params.id;
  const isNew = !id || id === 'new';
  const isFamily = kind === 'family';
  const basePath = isFamily ? '/products/families' : '/products/categories';
  const categories = useCategories('ACTIVE');
  const detail = useQuery({
    queryKey: [isFamily ? 'product-families' : 'categories', id],
    queryFn: () => fetchApi<any>(`/${isFamily ? 'product-families' : 'categories'}/${id}`),
    enabled: !isNew,
  });
  const [form, setForm] = useState({ code: '', name: '', description: '', categoryId: searchParams.get('categoryId') || '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!detail.data) return;
    setForm({
      code: detail.data.code || '', name: detail.data.name || '', description: detail.data.description || '',
      categoryId: detail.data.categoryId || '',
    });
  }, [detail.data]);

  if (!isNew && detail.isLoading) return <LoadingState message="Loading master record…" />;
  if (!isNew && detail.error) return <ErrorState error={detail.error as Error} retry={detail.refetch} />;

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const generatedCode = (prefix: string) => {
    const normalized = form.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42);
    return normalized ? `${prefix}-${normalized}`.slice(0, 50) : `${prefix}-${Date.now()}`;
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const body = isFamily
        ? { code: isNew ? generatedCode('FAMILY') : form.code, name: form.name, description: form.description || undefined, categoryId: form.categoryId }
        : { code: isNew ? generatedCode('CATEGORY') : form.code, name: form.name, description: form.description || undefined };
      await fetchApi(`/${isFamily ? 'product-families' : 'categories'}${isNew ? '' : `/${id}`}`, { method: isNew ? 'POST' : 'PUT', body: JSON.stringify(body) });
      showToast({ title: isNew ? `${isFamily ? 'Sub category' : 'Parent category'} created` : 'Record updated', message: 'The master data list has been refreshed.', kind: 'success' });
      router.push(basePath);
    } catch (error) {
      showToast({ title: 'Unable to save record', message: error instanceof Error ? error.message : 'Please review the fields and try again.', kind: 'error' });
    } finally { setSaving(false); }
  };

  return (
    <main className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8">
      <PageHeader title={isNew ? `Create ${isFamily ? 'Sub Category' : 'Parent Category'}` : `Edit ${isFamily ? 'Sub Category' : 'Parent Category'}`} description={isFamily ? 'Maintain reusable sub-category master data.' : 'Maintain the parent categories used by products and sub categories.'} actions={<Button type="button" variant="outline" onClick={() => router.push(basePath)}><ArrowLeft className="mr-2 h-4 w-4" />Back to list</Button>} />
      <Card className="mt-6 max-w-3xl rounded-2xl p-6">
        <form onSubmit={save} className="space-y-5">
          <div><label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Name</label><Input required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder={isFamily ? 'Sub category name' : 'Parent category name'} /></div>
          {isFamily ? (
            <div><label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Parent Category <span className="text-destructive">*</span></label><select required value={form.categoryId} onChange={(e) => update('categoryId', e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"><option value="">Select parent category</option>{categories.data?.items.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><p className="mt-1.5 text-xs text-muted-foreground">Need a parent category first? <a className="text-primary hover:underline" href="/products/categories/new">Create one</a>.</p></div>
          ) : null}
          <div><label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</label><textarea value={form.description} onChange={(e) => update('description', e.target.value)} rows={4} maxLength={500} className="w-full resize-y rounded-xl border border-input bg-background p-3 text-sm" placeholder="Describe how this classification should be used…" /></div>
          <div className="flex justify-end gap-3 border-t pt-5"><Button type="button" variant="ghost" onClick={() => router.push(basePath)}>Cancel</Button><Button type="submit" loading={saving}><Save className="mr-2 h-4 w-4" />{isNew ? 'Create' : 'Save changes'}</Button></div>
        </form>
      </Card>
      {!isNew && !isFamily && id && <ParentCategorySubcategories categoryId={id} />}
    </main>
  );
}
