import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ComponentReadinessList } from '../components/ComponentReadinessList';
import { LiveConservationCheck } from '../components/LiveConservationCheck';
import { GateBlockedState } from '../components/GateBlockedState';
import type { AssemblyBatchComponentDto } from '@plinth/types';

describe('Module 12: Assembly Convergence UI Components', () => {
  describe('ComponentReadinessList (Two Component Types Distinction)', () => {
    const mockComponents: AssemblyBatchComponentDto[] = [
      {
        id: 'comp-1',
        assemblyBatchId: 'batch-1',
        bomLineId: 'bom-line-1',
        componentType: 'BATCH_SOURCED',
        sourceBatchId: 'dept-batch-101',
        sourceBatchNumber: 'DEPT-BATCH-20260918-001',
        materialIssueLineId: null,
        productName: 'Machined Rotor Subassembly',
        itemCode: 'ROTOR-SUB-01',
        uomId: 'uom-1',
        uomCode: 'PCS',
        unitRatio: 2,
        requiredQuantity: 20,
        consumedQuantity: 20,
        scrapQuantity: 0,
        createdAt: '2026-09-18T00:00:00.000Z',
        updatedAt: '2026-09-18T00:00:00.000Z',
      },
      {
        id: 'comp-2',
        assemblyBatchId: 'batch-1',
        bomLineId: 'bom-line-2',
        componentType: 'ISSUE_LINE_SOURCED',
        sourceBatchId: null,
        materialIssueLineId: 'issue-line-501',
        materialName: 'M6 Stainless Hex Bolts',
        itemCode: 'FAST-M6-SS',
        uomId: 'uom-2',
        uomCode: 'PCS',
        unitRatio: 4,
        requiredQuantity: 40,
        consumedQuantity: 40,
        scrapQuantity: 0,
        createdAt: '2026-09-18T00:00:00.000Z',
        updatedAt: '2026-09-18T00:00:00.000Z',
      },
    ];

    it('clearly distinguishes between discrete upstream batches and bulk store issues', () => {
      render(
        <ComponentReadinessList
          components={mockComponents}
          targetOutputQuantity={10}
        />
      );

      // Section 1: Discrete Source Batches
      expect(screen.getByText(/Discrete Upstream Batches \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText('BATCH_SOURCED')).toBeInTheDocument();
      expect(screen.getByText('Machined Rotor Subassembly')).toBeInTheDocument();
      expect(screen.getByText('DEPT-BATCH-20260918-001')).toBeInTheDocument();

      // Section 2: Bulk Hardware & Kit Store Issues
      expect(screen.getByText(/Bulk Hardware & Kit Store Issues \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText('ISSUE_LINE_SOURCED')).toBeInTheDocument();
      expect(screen.getByText('M6 Stainless Hex Bolts')).toBeInTheDocument();
      expect(screen.getByText(/Line #issue-li/i)).toBeInTheDocument();
    });
  });

  describe('LiveConservationCheck (Quantity Conservation Yield Equation)', () => {
    const mockComponents: AssemblyBatchComponentDto[] = [
      {
        id: 'comp-1',
        assemblyBatchId: 'batch-1',
        bomLineId: 'bom-line-1',
        componentType: 'BATCH_SOURCED',
        sourceBatchId: 'dept-batch-101',
        sourceBatchNumber: 'DEPT-BATCH-20260918-001',
        materialIssueLineId: null,
        productName: 'Machined Rotor Subassembly',
        itemCode: 'ROTOR-SUB-01',
        uomId: 'uom-1',
        uomCode: 'PCS',
        unitRatio: 2, // 2 units of component per 1 FG unit
        requiredQuantity: 20,
        consumedQuantity: 20,
        scrapQuantity: 0,
        createdAt: '2026-09-18T00:00:00.000Z',
        updatedAt: '2026-09-18T00:00:00.000Z',
      },
    ];

    it('displays balanced check when actual output conforms to conservation equation', () => {
      render(
        <LiveConservationCheck
          actualOutputQuantity={10}
          scrapQuantity={0}
          targetOutputQuantity={10}
          components={mockComponents}
          componentConsumptions={{
            'comp-1': { consumedQuantity: 20, scrapQuantity: 0 },
          }}
        />
      );

      // 20 consumed / 2 unit ratio = 10 allowable FG output
      expect(screen.getByText(/Conservation Balanced ✓/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Balanced/i).length).toBeGreaterThan(0);
    });

    it('displays unbalanced warning when output exceeds consumed inputs', () => {
      render(
        <LiveConservationCheck
          actualOutputQuantity={15} // 15 > 10 theoretical yield -> violation!
          scrapQuantity={0}
          targetOutputQuantity={10}
          components={mockComponents}
          componentConsumptions={{
            'comp-1': { consumedQuantity: 20, scrapQuantity: 0 },
          }}
        />
      );

      expect(screen.getByText(/Yield Equation Unbalanced/i)).toBeInTheDocument();
      expect(screen.getByText(/Deficit/i)).toBeInTheDocument();
    });
  });

  describe('GateBlockedState (V-002, V-003, V-009 Gate Blocks)', () => {
    it('renders a distinct gate-blocked state naming missing requirements', () => {
      render(
        <GateBlockedState
          gate="V-002"
          message="Product has no approved BOM versions with confirmed component ratios."
          missingDetails={[
            { label: 'Product SKU', value: 'VALVE-BODY-01' },
            { label: 'Approved BOM', value: 'None Found' },
          ]}
          resolutionHref="/production/bom"
          resolutionLabel="Create / Approve BOM"
        />
      );

      expect(screen.getByText('GATE V-002')).toBeInTheDocument();
      expect(screen.getByText(/BOM & Component Ratios Gate Blocked \(V-002\)/i)).toBeInTheDocument();
      expect(screen.getByText(/VALVE-BODY-01/i)).toBeInTheDocument();
      expect(screen.getByText(/Create \/ Approve BOM/i)).toBeInTheDocument();
    });
  });
});
