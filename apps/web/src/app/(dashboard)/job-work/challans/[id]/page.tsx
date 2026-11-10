'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@synergy/ui';
import { useReactToPrint } from 'react-to-print';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { jobWorkApi } from '@/features/job-work/api';
import { JobWorkChallanPDF } from '@/components/JobWorkChallanPDF';
import type { JobWorkMaterialIssueDto } from '@synergy/types';

export default function JobWorkChallanViewPage() {
  const params = useParams();
  const challanId = params.id as string;
  const [challan, setChallan] = useState<JobWorkMaterialIssueDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Delivery_Challan_${challan?.challanNumber || challanId}`
  });

  React.useEffect(() => {
    async function loadChallan() {
      try {
        setLoading(true);
        const res = await jobWorkApi.getChallans();
        const found = res.items.find((c) => c.id === challanId || c.challanNumber === challanId);
        if (found) {
          setChallan(found);
        } else {
          setError('Challan not found.');
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load delivery challan.');
      } finally {
        setLoading(false);
      }
    }
    if (challanId) loadChallan();
  }, [challanId]);

  if (loading) {
    return (
      <div className="flex-1 w-full bg-muted/20 p-8 flex items-center justify-center font-manrope">
        <div className="text-center text-xs font-semibold text-muted-foreground animate-pulse">
          Loading delivery challan document...
        </div>
      </div>
    );
  }

  if (error || !challan) {
    return (
      <div className="flex-1 w-full bg-muted/20 p-6 sm:p-8 font-manrope">
        <div className="max-w-[1600px] mx-auto space-y-4">
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs font-bold text-destructive">
            {error || 'Unable to display challan'}
          </div>
          <Link href="/job-work" className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to Job Work Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full min-h-screen overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 font-manrope">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Link
              href="/job-work"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline mb-2 transition"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Job Work Dashboard
            </Link>
            <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
              Delivery Challan: {challan.challanNumber}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Outsourced material dispatch under Rule 55 CGST Rules
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handlePrint}
              className="bg-[#173796] hover:bg-[#122b77] text-white flex items-center gap-2 text-xs font-extrabold shadow-sm"
            >
              <Printer className="h-4 w-4" />
              Print / Save Delivery Challan PDF
            </Button>
          </div>
        </div>

        {/* Printable Challan Component Preview Container with standard inner margins */}
        <div className="bg-muted/40 dark:bg-card/40 p-4 sm:p-8 rounded-2xl border border-border flex justify-center shadow-inner">
          <div className="w-full max-w-[920px] bg-white shadow-2xl rounded-sm border border-border/40 overflow-hidden">
            <JobWorkChallanPDF ref={printRef} challan={challan} isPrintPreview />
          </div>
        </div>
      </div>
    </div>
  );
}
