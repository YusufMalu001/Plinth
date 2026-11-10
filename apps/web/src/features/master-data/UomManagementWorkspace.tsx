'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GenericList } from './GenericList';
import { uomListDescriptor } from './descriptors';
import { UomDialog } from './UomDialog';
import { fetchApi } from '../api/client';
import type { DetailedUom } from './UomDetailWorkspace';

export function UomManagementWorkspace({ initialMode, initialId }: { initialMode?: 'create'; initialId?: string }) {
  const [mode, setMode] = useState<'create' | 'view' | 'edit' | null>(initialMode || (initialId ? 'view' : null));
  const [selectedId, setSelectedId] = useState(initialId);
  const { data: selectedUom } = useQuery<DetailedUom>({
    queryKey: ['uom', selectedId],
    queryFn: () => fetchApi(`/uom/${selectedId}`),
    enabled: Boolean(selectedId && mode),
  });

  const open = (nextMode: 'create' | 'view' | 'edit', id?: string) => {
    setSelectedId(id);
    setMode(nextMode);
  };

  return <>
    <GenericList
      descriptor={uomListDescriptor}
      onCreate={() => open('create')}
      onOpen={(item) => open('view', item.id)}
      onEdit={(item) => open('edit', item.id)}
    />
    <UomDialog
      open={Boolean(mode && (mode === 'create' || selectedUom))}
      mode={mode || 'view'}
      uom={selectedUom}
      onClose={() => setMode(null)}
      onEdit={() => setMode('edit')}
    />
  </>;
}
