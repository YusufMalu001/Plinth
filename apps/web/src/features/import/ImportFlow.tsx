'use client';

import React, { useState } from 'react';
import { Card } from '@plinth/ui';
import { Button } from '@plinth/ui';
import { Table } from '@plinth/ui';
import { fetchApi } from '../api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoadingState } from '../../components/LoadingState';
import { authenticatedApiRequest } from '../auth/api';

export function ImportFlow({ entityType }: { entityType: string }) {
 const [file, setFile] = useState<File | null>(null);
 const [batchId, setBatchId] = useState<string | null>(null);
 const queryClient = useQueryClient();

 const uploadMutation = useMutation({
 mutationFn: async () => {
 if (!file) throw new Error('No file selected');
 const formData = new FormData();
 formData.append('file', file);
 formData.append('entityType', entityType);
 
 const response = await authenticatedApiRequest<{ batchId: string }>('/import/staged', {
 method: 'POST',
 body: formData,
 headers: { Accept: 'application/json' },
 });
 if (!response.data) throw new Error('Import staging returned no batch ID');
 return response.data; // { batchId, ... }
 },
 onSuccess: (data) => {
 setBatchId(data.batchId);
 }
 });

 const commitMutation = useMutation({
 mutationFn: () => fetchApi(`/import/batches/${batchId}/commit`, { method: 'POST' }),
 onSuccess: () => {
 setBatchId(null);
 setFile(null);
 queryClient.invalidateQueries();
 alert('Import committed successfully!');
 }
 });

 if (!batchId) {
 return (
 <Card className="p-6">
 <h3 className="text-lg font-medium mb-4">Import {entityType} Data</h3>
 <input 
 type="file" 
 accept=".csv,.xlsx,.xlsm"
 onChange={e => setFile(e.target.files?.[0] || null)}
 className="mb-4 block w-full text-sm text-ink-secondary file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-tone-blue-bg file:text-link hover:file:bg-tone-blue-bg"
 />
 <Button 
 onClick={() => uploadMutation.mutate()} 
 disabled={!file || uploadMutation.isPending}
 >
 {uploadMutation.isPending ? 'Uploading...' : 'Upload & Preview'}
 </Button>
 </Card>
 );
 }

 return (
 <StagedPreview 
 batchId={batchId} 
 onCommit={() => commitMutation.mutate()} 
 isCommitting={commitMutation.isPending} 
 />
 );
}

function StagedPreview({ batchId, onCommit, isCommitting }: { batchId: string, onCommit: () => void, isCommitting: boolean }) {
 const { data: batchData, isLoading, refetch } = useQuery({
 queryKey: ['import', batchId, 'preview'],
 queryFn: () => fetchApi<{ items: { id: string; status: string; code?: string; rawData?: string }[] }>(`/import/batches/${batchId}/preview`)
 });

 if (isLoading) return <LoadingState message="Loading preview..." />;

 const items = batchData?.items || [];
 const needsResolution = items.some((i) => i.status === 'DUPLICATE');

 return (
 <Card className="p-6">
 <div className="flex justify-between items-center mb-4">
 <h3 className="text-lg font-medium">Staged Preview</h3>
 <Button onClick={onCommit} disabled={needsResolution || isCommitting} variant="default">
 {isCommitting ? 'Committing...' : 'Commit Valid Rows'}
 </Button>
 </div>

 {needsResolution && (
 <div className="bg-tone-yellow-bg border border-tone-amber-solid text-tone-amber-text p-4 rounded-md mb-4">
 Please resolve all duplicates before committing.
 </div>
 )}

 <Table>
 <thead>
 <tr>
 <th className="px-4 py-2">Row</th>
 <th className="px-4 py-2">Code</th>
 <th className="px-4 py-2">Status</th>
 <th className="px-4 py-2">Action</th>
 </tr>
 </thead>
 <tbody>
 {items.map((item, i: number) => (
 <tr key={i}>
 <td className="px-4 py-2">{i + 1}</td>
 <td className="px-4 py-2">{item.code || (item.rawData ? JSON.parse(item.rawData).code : '')}</td>
 <td className="px-4 py-2">{item.status}</td>
 <td className="px-4 py-2">
 {item.status === 'DUPLICATE' && (
 <DuplicateResolver batchId={batchId} rowId={item.id} onResolved={refetch} />
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </Table>
 </Card>
 );
}

export function DuplicateResolver({ batchId, rowId, onResolved }: { batchId: string, rowId: string, onResolved: () => void }) {
 const [resolution, setResolution] = useState<'SKIP' | 'CREATE_NEW' | 'FLAG_MERGE'>('SKIP');
 const [newCode, setNewCode] = useState('');

 const resolveMutation = useMutation({
 mutationFn: () => fetchApi(`/import/batches/${batchId}/rows/${rowId}/resolve`, {
 method: 'POST',
 body: JSON.stringify({ resolutionDecision: resolution, newCode: resolution === 'CREATE_NEW' ? newCode : undefined })
 }),
 onSuccess: onResolved
 });

 return (
 <div className="flex flex-col space-y-2 max-w-sm">
 <select 
 value={resolution} 
 onChange={e => setResolution(e.target.value as 'SKIP' | 'CREATE_NEW' | 'FLAG_MERGE')}
 className="border-border-strong rounded-md text-sm p-1"
 >
 <option value="SKIP">Skip</option>
 <option value="CREATE_NEW">Create New</option>
 <option value="FLAG_MERGE">Flag for Merge</option>
 </select>
 
 {resolution === 'CREATE_NEW' && (
 <input 
 type="text" 
 placeholder="New Code Override" 
 value={newCode} 
 onChange={e => setNewCode(e.target.value)}
 className="border-border-strong rounded-md text-sm p-1"
 />
 )}
 
 <Button 
 size="sm" 
 onClick={() => resolveMutation.mutate()} 
 disabled={resolveMutation.isPending || (resolution === 'CREATE_NEW' && !newCode)}
 >
 Resolve
 </Button>
 </div>
 );
}
