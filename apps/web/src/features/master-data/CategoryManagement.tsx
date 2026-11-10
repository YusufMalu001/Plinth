'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GenericList } from './GenericList';
import { categoriesListDescriptor, productFamiliesListDescriptor } from './descriptors';
import { CategorySubcategoryRows, useAllSubcategories, type Subcategory } from './CategorySubcategories';

type CategoryTab = 'parents' | 'subcategories';

export function CategoryManagement() {
  const initialTab: CategoryTab = 'parents';
  const [activeTab, setActiveTab] = useState<CategoryTab>(initialTab);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const allSubcategories = useAllSubcategories(activeTab === 'parents');
  const subcategoriesByParent = useMemo(() => {
    const grouped = new Map<string, Subcategory[]>();
    for (const subcategory of allSubcategories.data || []) {
      const siblings = grouped.get(subcategory.categoryId) || [];
      siblings.push(subcategory);
      grouped.set(subcategory.categoryId, siblings);
    }
    return grouped;
  }, [allSubcategories.data]);

  useEffect(() => {
    setActiveTab(tabParam === 'subcategories' ? 'subcategories' : initialTab);
  }, [initialTab, tabParam]);

  const selectTab = (tab: CategoryTab) => {
    setActiveTab(tab);
    router.push(tab === 'subcategories' ? '/products/categories?tab=subcategories' : '/products/categories?tab=parents');
  };

  const descriptor = activeTab === 'parents' ? categoriesListDescriptor : productFamiliesListDescriptor;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-2 border-b border-border px-4 pt-3 sm:px-6" role="tablist" aria-label="Category type">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'parents'}
          onClick={() => selectTab('parents')}
          className={`border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${activeTab === 'parents' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Parent Categories
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'subcategories'}
          onClick={() => selectTab('subcategories')}
          className={`border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${activeTab === 'subcategories' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Sub Categories
        </button>
      </div>
      {activeTab === 'parents' && allSubcategories.error && (
        <div role="alert" className="mx-4 mt-4 flex items-center gap-2 text-sm text-destructive sm:mx-6">
          Unable to load sub categories.
          <button type="button" onClick={() => allSubcategories.refetch()} className="font-semibold underline">Retry</button>
        </div>
      )}
      <GenericList
        key={descriptor.apiPath}
        descriptor={descriptor}
        getExpansionSummary={activeTab === 'parents' ? (category) => {
          const children = subcategoriesByParent.get(category.id) || [];
          return { count: children.length, label: children.length === 1 ? 'Sub Category' : 'Sub Categories' };
        } : undefined}
        renderExpanded={activeTab === 'parents' ? (category) => <CategorySubcategoryRows subcategories={subcategoriesByParent.get(category.id) || []} /> : undefined}
      />
    </div>
  );
}
