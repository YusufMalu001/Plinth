import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ItemUomRelationModal } from '../../src/features/products/components/ItemUomRelationModal';

describe('ItemUomRelationModal', () => {
  const mockUoms = [
    { id: 'uom-feet', name: 'Feet', code: 'FT', symbol: 'FT' },
    { id: 'uom-kg', name: 'Kilograms', code: 'KG', symbol: 'KG' },
    { id: 'uom-meter', name: 'Meter', code: 'MTR', symbol: 'MTR' },
  ];

  it('renders clean modal with base UOM when open', () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn();

    render(
      <ItemUomRelationModal
        open={true}
        onClose={handleClose}
        baseUomId="uom-feet"
        allUoms={mockUoms}
        relations={[]}
        onSave={handleSave}
      />
    );

    expect(screen.getByText('Unit of Measure Conversion Relation')).toBeInTheDocument();
    expect(screen.getByText('Base UOM:')).toBeInTheDocument();
    // Subtitle paragraph and Item-Specific cards should NOT exist
    expect(screen.queryByText(/Define how the multiple units of measure relate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Item-Specific UOM Conversion/i)).not.toBeInTheDocument();
  });

  it('allows user to specify 1 Feet = 0.041 Kgs', () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn();

    render(
      <ItemUomRelationModal
        open={true}
        onClose={handleClose}
        baseUomId="uom-feet"
        allUoms={mockUoms}
        relations={[]}
        onSave={handleSave}
      />
    );

    // Enter target quantity: 0.041
    const targetInput = screen.getByPlaceholderText('e.g. 0.041');
    fireEvent.change(targetInput, { target: { value: '0.041' } });

    // Click Apply & Save
    const saveBtn = screen.getByRole('button', { name: /Apply & Save Relation/i });
    fireEvent.click(saveBtn);

    expect(handleSave).toHaveBeenCalledTimes(1);
    expect(handleSave).toHaveBeenCalledWith([
      expect.objectContaining({
        fromUomId: 'uom-feet',
        toUomId: 'uom-kg',
        fromQuantity: 1,
        toQuantity: 0.041,
        factor: 0.041,
      }),
    ]);
    expect(handleClose).toHaveBeenCalled();
  });

  it('supports adding multiple dynamic relations from the Base UOM', () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn();

    render(
      <ItemUomRelationModal
        open={true}
        onClose={handleClose}
        baseUomId="uom-feet"
        allUoms={mockUoms}
        relations={[]}
        onSave={handleSave}
      />
    );

    // Row 1: 1 Feet = 0.014 Kilograms
    const firstInput = screen.getByPlaceholderText('e.g. 0.041');
    fireEvent.change(firstInput, { target: { value: '0.014' } });

    // Click "+ Add Relation"
    const addBtn = screen.getByRole('button', { name: /Add Relation/i });
    fireEvent.click(addBtn);

    // Now there are two rows
    const allInputs = screen.getAllByPlaceholderText('e.g. 0.041');
    expect(allInputs).toHaveLength(2);

    // Row 2: 1 Feet = 0.00014 Meter
    fireEvent.change(allInputs[1], { target: { value: '0.00014' } });

    // Click Apply & Save
    const saveBtn = screen.getByRole('button', { name: /Apply & Save Relation/i });
    fireEvent.click(saveBtn);

    expect(handleSave).toHaveBeenCalledTimes(1);
    expect(handleSave).toHaveBeenCalledWith([
      expect.objectContaining({
        fromUomId: 'uom-feet',
        toUomId: 'uom-kg',
        fromQuantity: 1,
        toQuantity: 0.014,
        factor: 0.014,
      }),
      expect.objectContaining({
        fromUomId: 'uom-feet',
        toUomId: 'uom-meter',
        fromQuantity: 1,
        toQuantity: 0.00014,
        factor: 0.00014,
      }),
    ]);
  });

  it('supports swapping direction seamlessly', () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn();

    render(
      <ItemUomRelationModal
        open={true}
        onClose={handleClose}
        baseUomId="uom-feet"
        allUoms={mockUoms}
        relations={[]}
        onSave={handleSave}
      />
    );

    const targetInput = screen.getByPlaceholderText('e.g. 0.041');
    fireEvent.change(targetInput, { target: { value: '0.041' } });

    const swapBtn = screen.getByTitle('Reverse conversion order');
    fireEvent.click(swapBtn);

    const saveBtn = screen.getByRole('button', { name: /Apply & Save Relation/i });
    fireEvent.click(saveBtn);

    expect(handleSave).toHaveBeenCalledWith([
      expect.objectContaining({
        fromUomId: 'uom-kg',
        toUomId: 'uom-feet',
        fromQuantity: 1,
        toQuantity: 24.390244,
      }),
    ]);
  });
});
