'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@plinth/ui';
import { fetchApi } from '../api/client';

export interface Subcategory {
  id: string;
  categoryId: string;
  name: string;
  description?: string | null;
}

async function fetchSubcategories(categoryId?: string): Promise<Subcategory[]> {
  const items: Subcategory[] = [];
  const limit = 1000;
  for (let page = 1; ; page += 1) {
    const result = await fetchApi<{ items: Subcategory[]; total: number }>(
      `/product-families?${categoryId ? `categoryId=${encodeURIComponent(categoryId)}&` : ''}limit=${limit}&page=${page}`
    );
    items.push(...result.items);
    if (result.items.length === 0 || items.length >= result.total) break;
  }
  return items;
}

function useCategorySubcategories(categoryId: string) {
  return useQuery({
    queryKey: ['product-families', 'by-category', categoryId],
    queryFn: () => fetchSubcategories(categoryId),
    enabled: Boolean(categoryId),
  });
}

export function useAllSubcategories(enabled = true) {
  return useQuery({
    queryKey: ['product-families', 'all-for-categories'],
    queryFn: () => fetchSubcategories(),
    enabled,
  });
}

export function CategorySubcategoryRows({ subcategories }: { subcategories: Subcategory[] }) {
  return <TableRow className="border-b border-border/80 bg-muted/15">
    <TableCell colSpan={4} className="p-0">
      <div className="border-y border-border/50 bg-muted/25 px-6 py-3 pl-14">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="border-b border-border bg-muted/50 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-3.5 py-2">Sub Category Name</th><th className="px-3.5 py-2">Description</th><th className="px-3.5 py-2 text-right">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {subcategories.map((subcategory) => <tr key={subcategory.id} className="hover:bg-muted/40">
                <td className="px-3.5 py-2 font-semibold text-foreground"><Link href={`/products/families/${subcategory.id}`} className="hover:text-primary hover:underline">{subcategory.name}</Link></td>
                <td className="px-3.5 py-2 text-muted-foreground">{subcategory.description || '—'}</td>
                <td className="px-3.5 py-2 text-right"><Link href={`/products/families/${subcategory.id}`} className="font-semibold text-primary hover:underline">View</Link></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </TableCell>
  </TableRow>;
}

export function ParentCategorySubcategories({ categoryId }: { categoryId: string }) {
  const { data, isLoading, error, refetch } = useCategorySubcategories(categoryId);

  return (
    <Card className="mt-6 max-w-3xl overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <h2 className="text-base font-bold text-foreground">Sub Categories {data ? `(${data.length})` : ''}</h2>
        <Link href={`/products/families/new?categoryId=${encodeURIComponent(categoryId)}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <Plus className="h-4 w-4" /> Add Sub Category
        </Link>
      </div>
      {isLoading ? <p className="px-6 py-5 text-sm text-muted-foreground">Loading sub categories…</p>
        : error ? <div className="px-6 py-5 text-sm text-destructive">Unable to load sub categories. <button type="button" onClick={() => refetch()} className="font-semibold underline">Retry</button></div>
        : !data?.length ? <p className="px-6 py-5 text-sm text-muted-foreground">No sub categories in this parent category.</p>
        : <div className="overflow-x-auto">
            <Table className="w-full">
              <TableHeader><TableRow><TableHead>Sub Category</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>{data.map((subcategory) => (
                <TableRow key={subcategory.id}>
                  <TableCell className="font-semibold">{subcategory.name}</TableCell>
                  <TableCell className="text-muted-foreground">{subcategory.description || '—'}</TableCell>
                  <TableCell className="text-right"><Link href={`/products/families/${subcategory.id}`} className="font-semibold text-primary hover:underline">View</Link></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>}
    </Card>
  );
}
