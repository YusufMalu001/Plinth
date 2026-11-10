import * as fs from 'fs/promises';
import * as path from 'path';

export interface IntegrationJobItemExportPayload {
  id: string;
  sourceType: string;
  sourceId: string;
  amount: string;
  currency: string;
  payloadFingerprint: string;
  payload?: Record<string, unknown> | null;
}

export interface IntegrationJobExportPayload {
  id: string;
  batchNumber: string;
  sourceType: string;
  totalItems: number;
  items: IntegrationJobItemExportPayload[];
}

/**
 * TallyExportAdapter Contract
 * 
 * TEMPORARY STUB — PENDING V-006/V-007
 * Writes structured export batch files (JSON/CSV) to a local directory.
 * Does NOT invoke any real Tally HTTP or XML API endpoints.
 */
export interface TallyExportAdapter {
  export(job: IntegrationJobExportPayload): Promise<{ batchFileRef: string }>;
}

export class FileBatchTallyExportAdapter implements TallyExportAdapter {
  private readonly exportDirectory: string;

  constructor(exportDir?: string) {
    this.exportDirectory = exportDir || path.resolve(process.cwd(), 'storage', 'tally-exports');
  }

  async export(job: IntegrationJobExportPayload): Promise<{ batchFileRef: string }> {
    await fs.mkdir(this.exportDirectory, { recursive: true });

    const filename = `TALLY_EXPORT_${job.sourceType}_${job.batchNumber}_${Date.now()}.json`;
    const fullPath = path.join(this.exportDirectory, filename);

    const exportData = {
      _notice: 'TEMPORARY TALLY BATCH EXPORT FILE — PENDING REAL CONNECTOR V-006/V-007',
      batchId: job.id,
      batchNumber: job.batchNumber,
      sourceType: job.sourceType,
      exportedAt: new Date().toISOString(),
      itemCount: job.items.length,
      items: job.items.map((item) => ({
        itemId: item.id,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        amount: item.amount,
        currency: item.currency,
        payloadFingerprint: item.payloadFingerprint,
        tallyVoucherPayload: item.payload
      }))
    };

    await fs.writeFile(fullPath, JSON.stringify(exportData, null, 2), 'utf-8');

    return {
      batchFileRef: fullPath
    };
  }
}
