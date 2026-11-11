"use client";

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  PackageCheck,
  ShieldAlert,
  ShieldCheck,
  Boxes,
  Lock,
  Unlock,
  Clock,
  Layers,
   ArrowRight,
   CheckCircle2,
  RefreshCw,
 } from 'lucide-react';
 import {
   Button,
  PageHeader,
   Card,
   CardHeader,
   CardTitle,
   CardContent,
   Table,
   TableHeader,
   TableRow,
   TableHead,
   TableBody,
   TableCell,
   Dialog,
   Input
 } from '@plinth/ui';
 import { StatusBadge } from '@/components/StatusBadge';
 import { LoadingState } from '@/components/LoadingState';
 import { EmptyState } from '@/components/EmptyState';
import {
  useFgReadyOutputs,
  useFgReceipts,
  useUpdateFgPackaging,
  useReceiveFgThroughGate,
  useHoldFgReceipt,
  useReleaseFgReceipt,
  useFgGenealogy
} from '@/features/finished-goods/hooks';
import { useWarehouseLocations } from '@/features/master-data/hooks';
import type {
  FgReadyOutputDto,
  FgReceiptDto,
  FgPackagingStatus
} from '@plinth/types';
import Link from 'next/link';

type TabMode = 'queue' | 'receipts' | 'inventory_link';

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

export function FgReceiptQueueWorkspace() {
  const searchParams = useSearchParams();
  const initialTab: TabMode = searchParams?.get('tab') === 'inventory' || searchParams?.get('tab') === 'receipts' ? 'receipts' : 'queue';
  const [activeTab, setActiveTab] = useState<TabMode>(initialTab);

  useEffect(() => {
    const tabParam = searchParams?.get('tab');
    if (tabParam === 'inventory' || tabParam === 'receipts') {
      setActiveTab('receipts');
    } else if (tabParam === 'queue') {
      setActiveTab('queue');
    }
  }, [searchParams]);
  const [selectedOutput, setSelectedOutput] = useState<FgReadyOutputDto | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<FgReceiptDto | null>(null);
  const [genealogyReceiptId, setGenealogyReceiptId] = useState<string | null>(null);

  // Modals
  const [packagingModalOpen, setPackagingModalOpen] = useState(false);
  const [packagingStatus, setPackagingStatus] = useState<FgPackagingStatus>('NOT_PACKED');
  const [packNotes, setPackNotes] = useState('');

  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveLocationId, setReceiveLocationId] = useState('');
  const [receiveNotes, setReceiveNotes] = useState('');

  const [holdModalOpen, setHoldModalOpen] = useState(false);
  const [holdReason, setHoldReason] = useState('');

  // Queries & Mutations
  const { data: readyOutputsData, isLoading: isLoadingQueue, refetch: refetchQueue } = useFgReadyOutputs();
  const { data: receiptsData, isLoading: isLoadingReceipts, refetch: refetchReceipts } = useFgReceipts();

  const updatePackagingMutation = useUpdateFgPackaging();
  const receiveMutation = useReceiveFgThroughGate();
  const holdMutation = useHoldFgReceipt();
  const releaseMutation = useReleaseFgReceipt();

  const { data: genealogyData, isLoading: isLoadingGenealogy } = useFgGenealogy(genealogyReceiptId || undefined);

  const { data: locationsData } = useWarehouseLocations({ limit: 100 });
  const locations = locationsData?.items || [];

  const outputs = readyOutputsData?.items || [];
  const receipts = receiptsData?.items || [];

  // Categorize Queue into the 3 distinct states required by specification
  const readyOutputs = outputs.filter(o => !o.fgReceipt && o.isReadyToReceive);
  const blockedNoCriteriaOutputs = outputs.filter(o => !o.fgReceipt && !o.hasApprovedQcCriteria);
  const awaitingGateOutputs = outputs.filter(o => !o.fgReceipt && o.hasApprovedQcCriteria && !o.isReadyToReceive);

  const handleOpenPackaging = (output: FgReadyOutputDto) => {
    setSelectedOutput(output);
    setPackagingStatus(output.packagingRecord?.status || 'NOT_PACKED');
    setPackNotes(output.packagingRecord?.packNotes || '');
    setPackagingModalOpen(true);
  };

  const handleSavePackaging = async () => {
    if (!selectedOutput) return;
    await updatePackagingMutation.mutateAsync({
      outputId: selectedOutput.id,
      payload: {
        status: packagingStatus,
        packNotes: packNotes.trim() || undefined
      }
    });
    setPackagingModalOpen(false);
  };

  const handleOpenReceive = (output: FgReadyOutputDto) => {
    setSelectedOutput(output);
    const defaultLoc = locations[0]?.id || 'loc-wh-main';
    setReceiveLocationId(defaultLoc);
    setReceiveNotes('');
    setReceiveModalOpen(true);
  };

  const handleExecuteReceive = async () => {
    if (!selectedOutput) return;
    await receiveMutation.mutateAsync({
      fgReadyOutputId: selectedOutput.id,
      locationId: receiveLocationId || 'loc-wh-main',
      notes: receiveNotes.trim() || undefined
    });
    setReceiveModalOpen(false);
  };

  const handleOpenHold = (receipt: FgReceiptDto) => {
    setSelectedReceipt(receipt);
    setHoldReason('');
    setHoldModalOpen(true);
  };

  const handleExecuteHold = async () => {
    if (!selectedReceipt) return;
    await holdMutation.mutateAsync({
      receiptId: selectedReceipt.id,
      reason: holdReason.trim()
    });
    setHoldModalOpen(false);
  };

  const handleExecuteRelease = async (receipt: FgReceiptDto) => {
    if (confirm(`Release FG Receipt [${receipt.receiptNumber}] to available inventory?`)) {
      await releaseMutation.mutateAsync({
        receiptId: receipt.id,
        releaseNotes: 'Released by store supervisor'
      });
    }
  };

  return (
    <div className="flex-1 p-6 md:p-8 space-y-6 max-w-[1550px] mx-auto min-h-screen">
      <PageHeader
        title="Finished Goods (FG) Receiving & Gate"
        description="Gate-verified receiving queue for assembled and pre-FG goods into authoritative inventory."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchQueue();
              refetchReceipts();
            }}
            className="gap-2 rounded-xl shadow-2xs"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            <span>Live Sync</span>
          </Button>
        }
      />

      {/* Mode Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Button
          variant={activeTab === 'queue' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('queue')}
          className="gap-2"
        >
          <PackageCheck className="h-4 w-4" />
          Pre-FG Receipt Queue
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-primary-foreground/20 font-bold">
            {outputs.filter(o => !o.fgReceipt).length}
          </span>
        </Button>
        <Button
          variant={activeTab === 'receipts' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('receipts')}
          className="gap-2"
        >
          <Boxes className="h-4 w-4" />
          Finished Goods Inventory
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-muted font-bold">
            {receipts.length}
          </span>
        </Button>
      </div>

      {activeTab === 'queue' && (
        <div className="space-y-6">
          {/* Section 1: Ready to Receive Gate Clearances */}
          <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-xs">
            <CardHeader className="pb-3 border-b border-emerald-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <CardTitle className="text-sm font-black uppercase text-emerald-900 dark:text-emerald-300">
                    1. Ready to Receive into FG Stock ({readyOutputs.length})
                  </CardTitle>
                </div>
                <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  Gate Passed: FINAL_FG QC PASS + Packaging Ready
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingQueue ? (
                <LoadingState message="Checking gate clearances..." />
              ) : readyOutputs.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground italic">
                  No outputs currently cleared for immediate FG stock receipt.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Output Ref</TableHead>
                      <TableHead>Target Product</TableHead>
                      <TableHead>Source Assembly</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>QC Status</TableHead>
                      <TableHead>Packaging Stage</TableHead>
                      <TableHead>Produced Date &amp; Time</TableHead>
                      <TableHead className="text-right">Gate Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {readyOutputs.map(output => (
                      <TableRow key={output.id} className="hover:bg-emerald-500/10">
                        <TableCell className="font-mono font-bold text-xs">{output.outputNumber}</TableCell>
                        <TableCell>
                          <div className="font-bold text-xs">{output.productName || 'Product'}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{output.productSku}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {output.assemblyBatchNumber || 'Direct Production'}
                        </TableCell>
                        <TableCell className="text-right font-mono font-black text-xs">
                          {output.quantity} {output.uomSymbol || 'pcs'}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold text-xs">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            FINAL_FG PASS
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={output.packagingRecord?.status || 'NOT_PACKED'} />
                          <button
                            onClick={() => handleOpenPackaging(output)}
                            className="ml-2 text-[10px] text-primary hover:underline"
                          >
                            Edit
                          </button>
                        </TableCell>
                        <TableCell className="text-xs font-mono font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {formatDateTime(output.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => handleOpenReceive(output)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-2xs text-xs"
                          >
                            <PackageCheck className="h-3.5 w-3.5" />
                            Receive FG
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Awaiting QC or Packaging Gate Clearance */}
          <Card className="border-amber-500/30 bg-amber-500/5 shadow-xs">
            <CardHeader className="pb-3 border-b border-amber-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-sm font-black uppercase text-amber-900 dark:text-amber-300">
                    2. Awaiting QC / Packaging Gate Clearance ({awaitingGateOutputs.length})
                  </CardTitle>
                </div>
                <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                  Physically produced intermediate outputs requiring completion before FG entry.
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {awaitingGateOutputs.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground italic">
                  No outputs awaiting inspection or packaging.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Output Ref</TableHead>
                      <TableHead>Target Product</TableHead>
                      <TableHead>Source Assembly</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>QC Status</TableHead>
                      <TableHead>Packaging Stage</TableHead>
                      <TableHead>Produced / Staged At</TableHead>
                      <TableHead className="text-right">Gate Block Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {awaitingGateOutputs.map(output => (
                      <TableRow key={output.id} className="hover:bg-amber-500/10">
                        <TableCell className="font-mono font-bold text-xs">{output.outputNumber}</TableCell>
                        <TableCell>
                          <div className="font-bold text-xs">{output.productName || 'Product'}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{output.productSku}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {output.assemblyBatchNumber || 'Direct Production'}
                        </TableCell>
                        <TableCell className="text-right font-mono font-black text-xs">
                          {output.quantity} {output.uomSymbol || 'pcs'}
                        </TableCell>
                        <TableCell>
                          {output.isQcPassed ? (
                            <span className="text-emerald-600 font-bold text-xs flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> PASS
                            </span>
                          ) : (
                            <span className="text-amber-600 font-bold text-xs flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" /> QC Pending
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={output.packagingRecord?.status || 'NOT_PACKED'} />
                          <button
                            onClick={() => handleOpenPackaging(output)}
                            className="ml-2 text-[10px] text-primary hover:underline font-medium"
                          >
                            Update
                          </button>
                        </TableCell>
                        <TableCell className="text-xs font-mono font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {formatDateTime(output.createdAt)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-amber-800 dark:text-amber-300 font-mono">
                          {output.gateBlockReason || 'Awaiting final gate criteria'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Section 3: Blocked — No Approved QC Criteria (V-009 Gate) */}
          <Card className="border-destructive/30 bg-destructive/5 shadow-xs">
            <CardHeader className="pb-3 border-b border-destructive/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                  <CardTitle className="text-sm font-black uppercase text-destructive">
                    3. Blocked — No Approved V-009 QC Criteria ({blockedNoCriteriaOutputs.length})
                  </CardTitle>
                </div>
                <span className="text-xs text-destructive font-semibold">
                  Strict Gate Policy: Receipt forbidden without active/approved FINAL_FG criteria.
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {blockedNoCriteriaOutputs.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground italic">
                  No products blocked by missing QC criteria.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Output Ref</TableHead>
                      <TableHead>Product / SKU</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Produced Date &amp; Time</TableHead>
                      <TableHead>Resolution Requirement</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedNoCriteriaOutputs.map(output => (
                      <TableRow key={output.id} className="hover:bg-destructive/10">
                        <TableCell className="font-mono font-bold text-xs">{output.outputNumber}</TableCell>
                        <TableCell>
                          <div className="font-bold text-xs">{output.productName || 'Product'}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{output.productSku}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono font-black text-xs">
                          {output.quantity} {output.uomSymbol || 'pcs'}
                        </TableCell>
                        <TableCell className="text-xs font-mono font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {formatDateTime(output.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs text-destructive font-medium">
                          Define and approve active V-009 QC Rule for FINAL_FG on this product.
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href="/quality/rules">
                            <Button size="sm" variant="outline" className="text-xs gap-1">
                              QC Rules <ArrowRight className="h-3 w-3" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'receipts' && (
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-black uppercase">
                  Finished Goods Made ({receipts.length})
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  List of completed finished goods produced and received into stock.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingReceipts ? (
              <LoadingState message="Loading received finished goods transactions..." />
            ) : receipts.length === 0 ? (
              <EmptyState
                title="No FG Receipts Recorded"
                description="Completed goods cleared through the gate will appear here."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Receipt Ref</TableHead>
                    <TableHead>Target Product</TableHead>
                    <TableHead>Warehouse Location</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Production / Received Date &amp; Time</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map(receipt => (
                    <TableRow key={receipt.id} className="hover:bg-muted/20">
                      <TableCell className="font-mono font-bold text-xs">{receipt.receiptNumber}</TableCell>
                      <TableCell>
                        <div className="font-bold text-xs">{receipt.productName || 'Product'}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">{receipt.productSku}</div>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {receipt.locationName || receipt.locationCode || 'Main FG Warehouse'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-black text-xs">
                        {receipt.quantity} {receipt.uomSymbol || 'pcs'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={receipt.status} />
                        {receipt.status === 'HELD' && (
                          <div className="text-[10px] text-destructive font-medium mt-0.5">
                            Reason: {receipt.holdReason}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {formatDateTime(receipt.receivedAt || receipt.createdAt)}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setGenealogyReceiptId(receipt.id)}
                          className="text-xs gap-1"
                        >
                          <Layers className="h-3.5 w-3.5" />
                          Genealogy
                        </Button>
                        {receipt.status === 'RECEIVED' && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleOpenHold(receipt)}
                            className="text-xs gap-1"
                          >
                            <Lock className="h-3 w-3" />
                            Hold
                          </Button>
                        )}
                        {receipt.status === 'HELD' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleExecuteRelease(receipt)}
                            className="text-xs gap-1 text-emerald-600 border-emerald-500/40 hover:bg-emerald-50"
                          >
                            <Unlock className="h-3 w-3" />
                            Release
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Packaging Status Update Dialog */}
      <Dialog
        open={packagingModalOpen}
        onClose={() => setPackagingModalOpen(false)}
        title="Update Packaging Readiness"
        description="* ASSUMPTION: Status set pending final confirmation from Plinth operations."
      >
        <div className="space-y-4 py-2 text-xs">
          <div>
            <label className="font-bold block mb-1.5">Packaging Status</label>
            <select
              value={packagingStatus}
              onChange={e => setPackagingStatus(e.target.value as FgPackagingStatus)}
              className="w-full bg-background border border-border rounded-lg p-2 text-xs font-medium"
            >
              <option value="NOT_PACKED">NOT_PACKED (Awaiting boxing/palletizing)</option>
              <option value="PACKED">PACKED (Boxed / Sealed)</option>
              <option value="READY_FOR_DISPATCH">READY_FOR_DISPATCH (Gate Cleared)</option>
            </select>
          </div>
          <div>
            <label className="font-bold block mb-1.5">Packaging Notes / Lot ID</label>
            <Input
              value={packNotes}
              onChange={e => setPackNotes(e.target.value)}
              placeholder="e.g. Master Carton #104, Staged in Buffer A"
              className="text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setPackagingModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSavePackaging}>
              Save Packaging State
            </Button>
          </div>
        </div>
      </Dialog>

      {/* FG Stock Receipt Confirmation Dialog */}
      <Dialog
        open={receiveModalOpen}
        onClose={() => setReceiveModalOpen(false)}
        title="Confirm FG Receipt to Inventory"
        description="This posts an immutable transaction into Module 4 StockLedgerEntry and increments StockBalance on-hand count."
      >
        {selectedOutput && (
          <div className="space-y-4 py-2 text-xs">
            <div className="p-3 bg-muted/40 rounded-lg space-y-1">
              <div className="flex justify-between font-bold">
                <span>Product:</span>
                <span>{selectedOutput.productName}</span>
              </div>
              <div className="flex justify-between font-mono">
                <span>Output Qty:</span>
                <span className="font-black text-sm">{selectedOutput.quantity} {selectedOutput.uomSymbol}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Source Batch:</span>
                <span>{selectedOutput.assemblyBatchNumber || 'Direct Production'}</span>
              </div>
            </div>
            <div>
              <label className="font-bold block mb-1.5">Target Destination Location</label>
              {locations.length > 0 ? (
                <select
                  value={receiveLocationId}
                  onChange={e => setReceiveLocationId(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg p-2 text-xs font-medium"
                >
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={receiveLocationId}
                  onChange={e => setReceiveLocationId(e.target.value)}
                  placeholder="loc-wh-main"
                  className="text-xs font-mono"
                />
              )}
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setReceiveModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleExecuteReceive} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Confirm &amp; Post to Inventory
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Hold & Quarantine Dialog (Handles hold-overrides-reservation visibly) */}
      <Dialog
        open={holdModalOpen}
        onClose={() => setHoldModalOpen(false)}
        title="Place FG Batch on QA Hold"
        description="Quarantines stock from fulfillment allocations and sales shipments."
      >
        <div className="space-y-4 py-2 text-xs">
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive font-medium text-xs">
            <strong>Caution:</strong> Placing this batch on hold will override any existing active stock reservations for this product.
          </div>
          <div>
            <label className="font-bold block mb-1.5">Hold Justification / Rejection Reason</label>
            <Input
              value={holdReason}
              onChange={e => setHoldReason(e.target.value)}
              placeholder="e.g. Paint scratch / Carton packaging seal failed"
              className="text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setHoldModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={handleExecuteHold}>
              Apply Hold &amp; Flag Overrides
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Genealogy Trace Drawer / Dialog */}
      <Dialog
        open={Boolean(genealogyReceiptId)}
        onClose={() => setGenealogyReceiptId(null)}
        title="End-to-End Finished Good Genealogy Trace"
        description="Traceability back through Assembly Convergence → Source Batches → Material Issue Lines → GRN Receipts."
        className="max-w-2xl"
      >
        {isLoadingGenealogy ? (
          <LoadingState message="Tracing batch genealogy..." />
        ) : genealogyData ? (
          <div className="space-y-4 py-2 text-xs">
            <div className="p-3 bg-muted/40 rounded-lg grid grid-cols-2 gap-2 text-xs font-mono">
              <div>
                <span className="text-muted-foreground">FG Receipt:</span>{' '}
                <strong>{genealogyData.receipt.receiptNumber}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Product:</span>{' '}
                <strong>{genealogyData.receipt.productName}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Assembly Batch:</span>{' '}
                <strong>{genealogyData.assemblyBatch?.batchNumber || 'N/A'}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Received Qty:</span>{' '}
                <strong>{genealogyData.receipt.quantity} {genealogyData.receipt.uomSymbol}</strong>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-xs uppercase text-muted-foreground mb-2">
                Assembled Components &amp; Lineage
              </h4>
              <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                {genealogyData.componentsTrace.map((comp, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between text-xs hover:bg-muted/20">
                    <div>
                      <div className="font-bold">
                        {comp.materialIssueLine?.materialName || comp.sourceBatch?.batchNumber || `Component ${idx + 1}`}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {comp.sourceBatch ? (
                          <span>Source Batch: {comp.sourceBatch.batchNumber} ({comp.sourceBatch.departmentName})</span>
                        ) : comp.materialIssueLine ? (
                          <span>Material Code: {comp.materialIssueLine.materialCode}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold">
                      {comp.consumedQuantity} {comp.uom}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setGenealogyReceiptId(null)}>
                Close Trace
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
