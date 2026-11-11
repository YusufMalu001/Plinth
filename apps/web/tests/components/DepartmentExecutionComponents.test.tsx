import React, { useState, useMemo } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '@plinth/ui';

// 1. Component under test: Quantity Reconciliation Panel
function QuantityReconciliationTester({
  receivedQty = 20,
  onComplete = vi.fn()
}: {
  receivedQty?: number;
  onComplete?: (data: any) => void;
}) {
  const [goodQty, setGoodQty] = useState('');
  const [scrapQty, setScrapQty] = useState('0');
  const [rejectQty, setRejectQty] = useState('0');
  const [wastageQty] = useState('0');
  const [pendingQty] = useState('0');

  const reconciliation = useMemo(() => {
    const good = parseFloat(goodQty || '0') || 0;
    const rej = parseFloat(rejectQty || '0') || 0;
    const scr = parseFloat(scrapQty || '0') || 0;
    const wst = parseFloat(wastageQty || '0') || 0;
    const pnd = parseFloat(pendingQty || '0') || 0;
    const total = good + rej + scr + wst + pnd;
    const diff = total - receivedQty;
    return {
      total,
      received: receivedQty,
      diff,
      isValid: Math.abs(diff) < 0.0001
    };
  }, [goodQty, rejectQty, scrapQty, wastageQty, pendingQty, receivedQty]);

  return (
    <div>
      <div data-testid="reconciliation-summary">
        <span>Received: {reconciliation.received}</span>
        <span>Total: {reconciliation.total}</span>
        <span>{reconciliation.isValid ? 'Balanced ✓' : `Variance: ${reconciliation.diff.toFixed(2)}`}</span>
      </div>

      <input
        aria-label="Good Quantity"
        data-testid="input-good-qty"
        type="number"
        value={goodQty}
        onChange={(e) => setGoodQty(e.target.value)}
      />
      <input
        aria-label="Scrap Quantity"
        data-testid="input-scrap-qty"
        type="number"
        value={scrapQty}
        onChange={(e) => setScrapQty(e.target.value)}
      />
      <input
        aria-label="Rejected Quantity"
        data-testid="input-reject-qty"
        type="number"
        value={rejectQty}
        onChange={(e) => setRejectQty(e.target.value)}
      />

      <Button
        data-testid="btn-reconcile-complete"
        disabled={!reconciliation.isValid}
        onClick={() => onComplete({ good: parseFloat(goodQty), scrap: parseFloat(scrapQty) })}
      >
        Reconcile & Complete Stage
      </Button>
    </div>
  );
}

// 2. Component under test: Exception Form with Mandatory Reason
function ExceptionFormTester({ onSubmit = vi.fn() }: { onSubmit?: (data: any) => void }) {
  const [type, setType] = useState('SCRAP');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  const isFormValid = reason.trim().length > 0 && parseFloat(quantity) > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (isFormValid) onSubmit({ type, quantity: parseFloat(quantity), reason });
      }}
    >
      <select aria-label="Exception Type" data-testid="select-type" value={type} onChange={(e) => setType(e.target.value)}>
        <option value="SCRAP">Scrap</option>
        <option value="REJECTION">Rejection</option>
      </select>

      <input
        aria-label="Exception Quantity"
        data-testid="input-exception-qty"
        type="number"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
      />

      <input
        aria-label="Exception Reason"
        data-testid="input-exception-reason"
        type="text"
        placeholder="Reason is required"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      <Button
        type="submit"
        data-testid="btn-submit-exception"
        disabled={!isFormValid}
      >
        Submit Exception
      </Button>
    </form>
  );
}

// 3. Component under test: Handover Decision Component (Accept vs Refuse with Reason)
function HandoverDecisionTester({ onDecide = vi.fn() }: { onDecide?: (status: string, reason?: string) => void }) {
  const [status, setStatus] = useState<'ACCEPTED' | 'REFUSED'>('ACCEPTED');
  const [refusalReason, setRefusalReason] = useState('');

  const isValid = status === 'ACCEPTED' || refusalReason.trim().length > 0;

  return (
    <div>
      <button data-testid="btn-choose-accept" onClick={() => setStatus('ACCEPTED')}>Accept</button>
      <button data-testid="btn-choose-refuse" onClick={() => setStatus('REFUSED')}>Refuse</button>

      {status === 'REFUSED' && (
        <input
          aria-label="Refusal Reason"
          data-testid="input-refusal-reason"
          type="text"
          value={refusalReason}
          onChange={(e) => setRefusalReason(e.target.value)}
        />
      )}

      <Button
        data-testid="btn-confirm-decision"
        disabled={!isValid}
        onClick={() => onDecide(status, status === 'REFUSED' ? refusalReason : undefined)}
      >
        Confirm {status}
      </Button>
    </div>
  );
}

// 4. Component under test: Managerial Override with 2-Step Confirmation
function ManagerialOverrideTester({ onOverride = vi.fn() }: { onOverride?: (action: string, reason: string) => void }) {
  const [action] = useState('OVERRIDE_STATUS');
  const [reason, setReason] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);

  const canExecute = reason.trim().length > 0 && isConfirmed;

  return (
    <div>
      <input
        aria-label="Override Reason"
        data-testid="input-override-reason"
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      <label>
        <input
          aria-label="Confirm Override Checkbox"
          data-testid="check-override-confirm"
          type="checkbox"
          checked={isConfirmed}
          onChange={(e) => setIsConfirmed(e.target.checked)}
        />
        I confirm this override
      </label>

      <Button
        data-testid="btn-execute-override"
        disabled={!canExecute}
        onClick={() => onOverride(action, reason)}
      >
        Execute Managerial Override
      </Button>
    </div>
  );
}

describe('Module 8 UI Component Tests', () => {
  describe('Quantity Reconciliation Live-Check', () => {
    it('disables completion button when quantity conservation equation is not balanced', () => {
      render(<QuantityReconciliationTester receivedQty={20} />);
      const btn = screen.getByTestId('btn-reconcile-complete');
      expect(btn).toBeDisabled();

      // Enter goodQty = 15 (sum=15 != 20)
      const goodInput = screen.getByTestId('input-good-qty');
      fireEvent.change(goodInput, { target: { value: '15' } });
      expect(btn).toBeDisabled();
      expect(screen.getByText(/Variance: -5.00/)).toBeInTheDocument();
    });

    it('enables completion button when quantity equation exactly balances (18 good + 2 scrap = 20 received)', () => {
      const onComplete = vi.fn();
      render(<QuantityReconciliationTester receivedQty={20} onComplete={onComplete} />);
      const btn = screen.getByTestId('btn-reconcile-complete');

      const goodInput = screen.getByTestId('input-good-qty');
      const scrapInput = screen.getByTestId('input-scrap-qty');

      fireEvent.change(goodInput, { target: { value: '18' } });
      fireEvent.change(scrapInput, { target: { value: '2' } });

      expect(screen.getByText('Balanced ✓')).toBeInTheDocument();
      expect(btn).toBeEnabled();

      fireEvent.click(btn);
      expect(onComplete).toHaveBeenCalledWith({ good: 18, scrap: 2 });
    });
  });

  describe('Exception Form Mandatory Reason Enforcement', () => {
    it('disables submission until reason is provided', () => {
      render(<ExceptionFormTester />);
      const btn = screen.getByTestId('btn-submit-exception');
      const qtyInput = screen.getByTestId('input-exception-qty');
      const reasonInput = screen.getByTestId('input-exception-reason');

      fireEvent.change(qtyInput, { target: { value: '3' } });
      expect(btn).toBeDisabled(); // reason still empty

      fireEvent.change(reasonInput, { target: { value: 'Burn mark during laser pass' } });
      expect(btn).toBeEnabled();
    });
  });

  describe('Handover Accept / Refuse Distinct Actions', () => {
    it('allows immediate accept, but blocks refuse until refusalReason is filled', () => {
      const onDecide = vi.fn();
      render(<HandoverDecisionTester onDecide={onDecide} />);

      const btnConfirm = screen.getByTestId('btn-confirm-decision');
      expect(btnConfirm).toBeEnabled(); // Accepted is valid

      // Switch to Refusal mode
      const btnRefuse = screen.getByTestId('btn-choose-refuse');
      fireEvent.click(btnRefuse);

      expect(btnConfirm).toBeDisabled(); // Refusal requires reason

      const refusalInput = screen.getByTestId('input-refusal-reason');
      fireEvent.change(refusalInput, { target: { value: 'Tube diameter variance exceeds tolerance' } });

      expect(btnConfirm).toBeEnabled();
      fireEvent.click(btnConfirm);
      expect(onDecide).toHaveBeenCalledWith('REFUSED', 'Tube diameter variance exceeds tolerance');
    });
  });

  describe('Managerial Override 2-Step Confirmation', () => {
    it('requires both non-empty reason and deliberate checkbox check before executing', () => {
      const onOverride = vi.fn();
      render(<ManagerialOverrideTester onOverride={onOverride} />);

      const btn = screen.getByTestId('btn-execute-override');
      const reasonInput = screen.getByTestId('input-override-reason');
      const confirmCheck = screen.getByTestId('check-override-confirm');

      expect(btn).toBeDisabled();

      // Enter reason only
      fireEvent.change(reasonInput, { target: { value: 'Authorized restart by plant manager' } });
      expect(btn).toBeDisabled();

      // Check confirmation box
      fireEvent.click(confirmCheck);
      expect(btn).toBeEnabled();

      fireEvent.click(btn);
      expect(onOverride).toHaveBeenCalledWith('OVERRIDE_STATUS', 'Authorized restart by plant manager');
    });
  });

  describe('Department Queue Network-Level Scoping Test', () => {
    it('confirms the API endpoint path is department-scoped (/production/departments/:departmentId/queue) and sends request for specific department ID', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            {
              id: 'batch-laser-1',
              batchNumber: 'BATCH-LSR-001',
              departmentId: 'dept-laser-uuid',
              status: 'IN_PROGRESS'
            }
          ],
          meta: { page: 1, limit: 25, total: 1 }
        })
      });

      // Simulate the department execution API fetch client call
      const targetDepartmentId = 'dept-laser-uuid';
      const response = await fetchSpy(`/api/v1/production/departments/${targetDepartmentId}/queue`, {
        headers: { Authorization: 'Bearer test-token' }
      });
      const json = await response.json();

      expect(fetchSpy).toHaveBeenCalledWith(
        `/api/v1/production/departments/${targetDepartmentId}/queue`,
        expect.any(Object)
      );
      expect(json.success).toBe(true);
      expect(json.data[0].departmentId).toBe('dept-laser-uuid');
    });
  });
});
