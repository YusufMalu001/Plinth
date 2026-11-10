import { describe, it, expect } from 'vitest';

/**
 * Logic unit test for production workstation action buttons:
 * Validates that Record Progress and Pause Work buttons are hidden
 * when the batch target has been completely marked/completed.
 */
describe('Production Execution Batch Action Buttons Visibility', () => {
  function getActionButtonsVisibility({
    status,
    expQty,
    recQty,
    compQty,
    totalLoss,
    availableToHandover,
    canExecuteBatch
  }: {
    status: string;
    expQty: number;
    recQty: number;
    compQty: number;
    totalLoss: number;
    availableToHandover: number;
    canExecuteBatch: boolean;
  }) {
    if (!canExecuteBatch) {
      return {
        showRecordProgress: false,
        showPauseWork: false,
        showCompleteStage: false,
        showHandOver: false,
        readOnly: true
      };
    }

    const isTargetFullyCompleted = expQty > 0
      ? (compQty >= expQty || compQty + totalLoss >= expQty)
      : (recQty > 0 && (compQty >= recQty || compQty + totalLoss >= recQty));

    const isInProgressOrPartial = ['IN_PROGRESS', 'PARTIAL'].includes(status);

    return {
      showRecordProgress: isInProgressOrPartial && !isTargetFullyCompleted,
      showPauseWork: isInProgressOrPartial && !isTargetFullyCompleted,
      showCompleteStage: isInProgressOrPartial && isTargetFullyCompleted,
      showHandOver: availableToHandover > 0,
      readOnly: false
    };
  }

  it('shows Record Progress and Pause Work when batch is partially completed (e.g. 500 / 1000)', () => {
    const visibility = getActionButtonsVisibility({
      status: 'PARTIAL',
      expQty: 1000,
      recQty: 1000,
      compQty: 500,
      totalLoss: 0,
      availableToHandover: 500,
      canExecuteBatch: true
    });

    expect(visibility.showRecordProgress).toBe(true);
    expect(visibility.showPauseWork).toBe(true);
    expect(visibility.showCompleteStage).toBe(false);
    expect(visibility.showHandOver).toBe(true);
  });

  it('hides Record Progress and Pause Work, and shows Complete Stage when target is 100% completed (1000 / 1000)', () => {
    const visibility = getActionButtonsVisibility({
      status: 'PARTIAL',
      expQty: 1000,
      recQty: 1000,
      compQty: 1000,
      totalLoss: 0,
      availableToHandover: 1000,
      canExecuteBatch: true
    });

    expect(visibility.showRecordProgress).toBe(false);
    expect(visibility.showPauseWork).toBe(false);
    expect(visibility.showCompleteStage).toBe(true);
    expect(visibility.showHandOver).toBe(true);
  });

  it('hides Record Progress and Pause Work when accounted units (completed + loss) meet expected target (980 + 20 / 1000)', () => {
    const visibility = getActionButtonsVisibility({
      status: 'PARTIAL',
      expQty: 1000,
      recQty: 1000,
      compQty: 980,
      totalLoss: 20,
      availableToHandover: 980,
      canExecuteBatch: true
    });

    expect(visibility.showRecordProgress).toBe(false);
    expect(visibility.showPauseWork).toBe(false);
    expect(visibility.showCompleteStage).toBe(true);
    expect(visibility.showHandOver).toBe(true);
  });

  it('hides all execution action buttons when batch status is COMPLETE, leaving only Hand Over if units remain', () => {
    const visibility = getActionButtonsVisibility({
      status: 'COMPLETE',
      expQty: 1000,
      recQty: 1000,
      compQty: 1000,
      totalLoss: 0,
      availableToHandover: 1000,
      canExecuteBatch: true
    });

    expect(visibility.showRecordProgress).toBe(false);
    expect(visibility.showPauseWork).toBe(false);
    expect(visibility.showCompleteStage).toBe(false);
    expect(visibility.showHandOver).toBe(true);
  });

  it('hides Hand Over when all units have been transferred', () => {
    const visibility = getActionButtonsVisibility({
      status: 'COMPLETE',
      expQty: 1000,
      recQty: 1000,
      compQty: 1000,
      totalLoss: 0,
      availableToHandover: 0,
      canExecuteBatch: true
    });

    expect(visibility.showRecordProgress).toBe(false);
    expect(visibility.showPauseWork).toBe(false);
    expect(visibility.showCompleteStage).toBe(false);
    expect(visibility.showHandOver).toBe(false);
  });
});
