import { Request, Response, NextFunction } from 'express';
import { ImportExportService } from '../services/import-export.service';
import { ApiResponse } from '@synergy/types';
import { parse } from 'csv-parse/sync';
import * as xlsx from 'xlsx';
import { parseAsync } from 'json2csv';
import { ValidationError } from '../../../common/errors/AppError';
import { isAdminActor } from '../../../common/middleware/auth';

export class ImportExportController {
  constructor(private readonly importExportService: ImportExportService) {}

  stageBatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const entityType = req.body.entityType;
      if (!entityType) throw new ValidationError('entityType is required in body.');
      
      let rows: Array<Record<string, unknown>> = [];
      let filename = null;

      if (req.file) {
        filename = req.file.originalname;
        if (filename.endsWith('.csv')) {
          rows = parse(req.file.buffer, { columns: true, skip_empty_lines: true });
        } else if (/\.(xlsx|xls|xlsm)$/i.test(filename)) {
          const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
          const firstSheet = workbook.SheetNames[0];
          rows = xlsx.utils.sheet_to_json(workbook.Sheets[firstSheet]);
        } else {
          throw new ValidationError('Unsupported file type. Please upload a .csv, .xlsx, .xls, or .xlsm file.');
        }
      } else if (req.body.rows && Array.isArray(req.body.rows)) {
        rows = req.body.rows;
      } else {
        throw new ValidationError('No file or rows provided for import.');
      }

      const result = await this.importExportService.stageBatch({
        entityType,
        filename,
        rows,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  getBatchPreview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.importExportService.getBatchPreview(req.params.id);
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  resolveDuplicate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { batchId, rowId } = req.params;
      const { resolutionDecision, newCode } = req.body;
      
      if (!resolutionDecision) {
         throw new ValidationError('resolutionDecision is required.');
      }

      const result = await this.importExportService.resolveDuplicateRow({
        batchId,
        rowId,
        decision: resolutionDecision,
        newCode: newCode,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
      
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  commitBatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.importExportService.commitBatch({
        batchId: req.params.id,
        actorId: req.user?.id || 'system',
        activateImmediately: isAdminActor(req.user),
        requestId: req.id
      });
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  exportData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.importExportService.exportData({
        entityType: String(req.query.entityType || ''),
        status: req.query.status as string | undefined,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
      
      if (req.query.format === 'csv' || req.accepts(['json', 'text/csv']) === 'text/csv') {
        const csvString = result.items.length > 0 ? await parseAsync(result.items) : '';
        res.header('Content-Type', 'text/csv');
        res.attachment(`export-${result.entityType.toLowerCase()}-${Date.now()}.csv`);
        res.send(csvString);
        return;
      }
      
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };
}
