'use client';
import React, { useState } from 'react';
import { Button, Card } from '@plinth/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../features/api/client';
import { ShieldCheck, XCircle, AlertTriangle, X, MessageSquare } from 'lucide-react';
import { showToast } from './toast-store';

const actionMeta = {
 approve: { title: 'Approve request', description: 'Confirm this request is complete and ready for the next workflow stage.', icon: ShieldCheck, header: 'bg-tone-emerald-bg', iconBox: 'bg-tone-emerald-bg text-tone-green-text', button: 'bg-tone-emerald-bg hover:bg-tone-emerald-bg', label: 'Confirm approval', placeholder: 'Optional approval remarks…', required: false },
 reject: { title: 'Reject request', description: 'This stops the workflow. Provide a clear reason for the requester.', icon: XCircle, header: 'bg-tone-red-bg', iconBox: 'bg-tone-red-bg text-tone-red-text', button: 'bg-tone-red-bg hover:bg-tone-red-bg', label: 'Confirm rejection', placeholder: 'Explain why this request is being rejected…', required: true },
 'request-changes': { title: 'Request changes', description: 'Send this request back with the changes required.', icon: AlertTriangle, header: 'bg-tone-amber-bg', iconBox: 'bg-tone-amber-bg text-tone-amber-text', button: 'bg-tone-amber-bg hover:bg-tone-amber-bg', label: 'Send change request', placeholder: 'Describe what needs to change…', required: true }
} as const;
type Action = keyof typeof actionMeta;
interface Props { entityId: string; entityTypePath: string; currentStatus: string; hasPermission: boolean; queryKey: readonly unknown[]; approvalStage?: string; inline?: boolean; purchaseOrderConfirmation?: boolean; }

export function ProcurementApprovalPanel({ entityId, entityTypePath, currentStatus, hasPermission, queryKey, approvalStage, inline = false, purchaseOrderConfirmation = false }: Props) {
 const client = useQueryClient(); const [action, setAction] = useState<Action | null>(null); const [reason, setReason] = useState('');
 const mutation = useMutation({ mutationFn: ({ endpoint, body }: { endpoint: string; body: Record<string, string | undefined> }) => fetchApi(`/${entityTypePath}/${entityId}/${endpoint}`, { method: 'POST', body: JSON.stringify(body) }), onMutate: async variables => {
 await client.cancelQueries({ queryKey });
 const previous = client.getQueryData(queryKey);
 const waitForEmailBeforeApproving = purchaseOrderConfirmation && variables.endpoint === 'approve';
 if (!waitForEmailBeforeApproving && previous && typeof previous === 'object') {
 const status = variables.endpoint === 'request-changes' ? 'CHANGES_REQUESTED' : variables.endpoint === 'reject' || variables.endpoint === 'cancel' ? 'CANCELLED' : 'APPROVED';
 client.setQueryData(queryKey, { ...(previous as Record<string, unknown>), status, ...(variables.endpoint === 'request-changes' ? { approvalStage: 'RETURNED' } : {}) });
 }
 return { previous };
 }, onError: (error, variables, context) => {
 if (context?.previous) client.setQueryData(queryKey, context.previous);
 if (purchaseOrderConfirmation && variables.endpoint === 'approve') {
 client.invalidateQueries({ queryKey: ['purchases', 'notifications'], refetchType: 'active' });
 showToast({
 kind: 'error',
 title: 'Purchase order email failed',
 message: `${error instanceof Error ? error.message : 'The vendor email could not be sent.'} The PO remains in Draft.`,
 });
 }
 }, onSuccess: data => {
 // Apply the server response immediately so status, approval stage and
 // action buttons change without waiting for a follow-up navigation fetch.
 client.setQueryData(queryKey, current => {
 if (current && typeof current === 'object' && data && typeof data === 'object') return { ...(current as Record<string, unknown>), ...(data as Record<string, unknown>) };
 return data ?? current;
 });
 client.invalidateQueries({ queryKey, refetchType: 'active' });
 // Keep the refresh scoped to affected procurement caches. Invalidating the
 // entire purchases tree here causes unrelated dashboards and lists to issue
 // extra remote database requests after every approval click.
 client.invalidateQueries({ queryKey: ['purchases', 'requisitions'], refetchType: 'active' });
 client.invalidateQueries({ queryKey: ['purchases', 'orders'], refetchType: 'active' });
 client.invalidateQueries({ queryKey: ['purchases', 'dashboard'], refetchType: 'active' });
 client.invalidateQueries({ queryKey: ['purchases', 'notifications'], refetchType: 'active' });
 if (purchaseOrderConfirmation) {
 showToast({ kind: 'success', title: 'Purchase order sent', message: 'The PO was emailed to the vendor and approved.' });
 }
 close();
 } });
 // The mutation success callback can run during React Query's pending ->
 // success transition, so checking `isPending` here would prevent the dialog
 // from closing after a successful submission.
 const close = () => { setAction(null); setReason(''); mutation.reset(); };
 // Keep the panel mounted during an optimistic transition so a failed
 // request can roll back cleanly and still display its error state.
 if (!(currentStatus === 'SUBMITTED' || currentStatus === 'DRAFT') && !mutation.isPending) return null;
 if (!hasPermission) return <Card className="border-l-4 border-l-slate-300 bg-muted p-4" data-testid="approval-forbidden"><div className="flex items-center gap-3 text-sm text-ink-secondary"><ShieldCheck className="h-5 w-5" />This record is pending review. You do not have approval permission.</div></Card>;
 const cancelOrder = purchaseOrderConfirmation && action === 'reject';
 const submit = () => { if (!action || (action !== 'approve' && !cancelOrder && !reason.trim())) return; mutation.mutate({ endpoint: cancelOrder ? 'cancel' : action, body: { reason: reason.trim() || undefined } }); };
 const meta = action ? actionMeta[action] : null;
 const displayedMeta = meta && action === 'approve' && purchaseOrderConfirmation
 ? { ...meta, title: 'Confirm and send purchase order', description: 'Are you sure you want to confirm and send this purchase order?', label: 'Confirm & Send', header: 'bg-card', iconBox: 'hidden' }
 : meta && cancelOrder
 ? { ...meta, title: 'Cancel purchase order', description: 'This will cancel this purchase order. You can’t undo this action.', label: 'Cancel PO', header: 'bg-card', iconBox: 'hidden', required: false }
 : meta;
 return (
 <>
 <Card className={inline ? 'border-0 bg-transparent p-0 shadow-none' : 'border border-border bg-card p-5 shadow-sm'} data-testid="procurement-approval-panel">
 <div className="flex flex-wrap items-center justify-between gap-4">
 <div className={inline ? 'hidden' : ''}>
 <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{approvalStage === 'ADMIN_REVIEW' ? 'Final administrator review' : approvalStage === 'STORE_REVIEW' ? 'Store review' : 'Review actions'}</p>
 <p className="mt-1 text-sm text-muted-foreground">Choose an action to progress this request.</p>
 </div>
 <div className="flex flex-wrap gap-2">
 <Button size="sm" onClick={() => setAction('approve')} className="bg-tone-emerald-bg text-white hover:bg-tone-emerald-bg" data-testid="btn-approve"><ShieldCheck className="mr-1.5 h-4 w-4" />{purchaseOrderConfirmation ? 'Confirm & Send' : 'Approve'}</Button>
 {!purchaseOrderConfirmation && <Button variant="outline" size="sm" onClick={() => setAction('request-changes')} className="border-tone-amber-solid text-tone-amber-text hover:bg-tone-amber-bg" data-testid="btn-request-changes"><AlertTriangle className="mr-1.5 h-4 w-4" />Request changes</Button>}
 <Button variant="outline" size="sm" onClick={() => setAction('reject')} className="border-tone-red-solid text-tone-red-text hover:bg-tone-red-bg" data-testid="btn-reject"><XCircle className="mr-1.5 h-4 w-4" />{purchaseOrderConfirmation ? 'Cancel PO' : 'Reject'}</Button>
 </div>
 </div>
 </Card>
 {displayedMeta && (
 <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[color:var(--overlay)] p-4 backdrop-blur-sm" data-testid={`${action}-panel`} role="dialog" aria-modal="true" aria-labelledby="approval-dialog-title" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
 <div className={`w-full ${purchaseOrderConfirmation && (action === 'approve' || cancelOrder) ? 'max-w-lg' : 'max-w-2xl'} overflow-hidden rounded-2xl border border-border bg-card shadow-2xl`}>
 <div className={`flex items-start justify-between border-b border-border px-6 py-5 ${displayedMeta.header}`}>
 <div className="flex gap-3">
 <div className={`rounded-xl p-2 ${displayedMeta.iconBox}`}><displayedMeta.icon className="h-5 w-5" /></div>
 <div><h2 id="approval-dialog-title" className="text-base font-bold">{displayedMeta.title}</h2><p className="mt-1 text-sm text-muted-foreground">{displayedMeta.description}</p></div>
 </div>
 <button type="button" onClick={close} className="rounded-lg p-1.5 text-muted-foreground hover:bg-black/5" aria-label="Close"><X className="h-5 w-5" /></button>
 </div>
 <div className="space-y-4 p-6">
 {!(purchaseOrderConfirmation && (action === 'approve' || cancelOrder)) && <><label className="block text-sm font-bold uppercase tracking-[0.12em] text-foreground">{displayedMeta.required ? 'Reason *' : 'Remarks (optional)'}</label><div className="relative"><MessageSquare className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-muted-foreground" /><textarea autoFocus rows={7} value={reason} onChange={e => setReason(e.target.value)} placeholder={displayedMeta.placeholder} className="min-h-40 w-full resize-y rounded-xl border border-border bg-background py-3 pl-11 pr-3 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10" data-testid={action === 'approve' ? 'approve-remarks' : action === 'reject' ? 'reject-reason' : 'request-changes-reason'} />{displayedMeta.required && <p className="text-xs text-muted-foreground">A reason is required for audit history and requester visibility.</p>}</div></>}
 {mutation.isError && <div className="rounded-lg border border-tone-red-solid bg-tone-red-bg px-3 py-2 text-sm text-tone-red-text">{(mutation.error as Error).message}</div>}
 <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="ghost" onClick={close} disabled={mutation.isPending}>Cancel</Button><Button onClick={submit} disabled={mutation.isPending || (displayedMeta.required && !cancelOrder && !reason.trim())} className={`${cancelOrder ? 'bg-tone-red-bg hover:bg-tone-red-bg' : displayedMeta.button} text-white`} data-testid={`confirm-${action}`}>{mutation.isPending ? 'Saving…' : displayedMeta.label}</Button></div>
 </div>
 </div>
 </div>
 )}
 </>
 );
}
