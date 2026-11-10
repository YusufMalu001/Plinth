import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, describe, vi } from 'vitest';
import { SearchableSelector } from '../SearchableSelector';
import { BaseMasterEntity } from '../../../hooks/useMasterData';

describe('SearchableSelector', () => {
  const mockOptions: BaseMasterEntity[] = [
    { id: '1', name: 'Draft Vendor', status: 'DRAFT', code: 'V001' },
    { id: '2', name: 'Pending Vendor', status: 'PENDING_VALIDATION', code: 'V002' },
    { id: '3', name: 'Approved Vendor', status: 'APPROVED', code: 'V003' },
    { id: '4', name: 'Active Vendor', status: 'ACTIVE', code: 'V004' },
    { id: '5', name: 'Inactive Vendor', status: 'INACTIVE', code: 'V005' },
    { id: '6', name: 'Superseded Vendor', status: 'SUPERSEDED', code: 'V006' },
  ];

  test('defensively excludes non-APPROVED and non-ACTIVE records', () => {
    const onChange = vi.fn();
    render(
      <SearchableSelector
        options={mockOptions}
        value=""
        onChange={onChange}
        placeholder="Select a vendor..."
      />
    );

    // Open the dropdown
    fireEvent.click(screen.getByText('Select a vendor...'));

    // Should render only Approved and Active
    expect(screen.getByText('Approved Vendor')).toBeTruthy();
    expect(screen.getByText('Active Vendor')).toBeTruthy();

    // Should NOT render any other statuses
    expect(screen.queryByText('Draft Vendor')).toBeNull();
    expect(screen.queryByText('Pending Vendor')).toBeNull();
    expect(screen.queryByText('Inactive Vendor')).toBeNull();
    expect(screen.queryByText('Superseded Vendor')).toBeNull();
  });

  test('does not show inactive or superseded variants', () => {
    render(
      <SearchableSelector
        options={[
          { id: 'parent', name: 'Frame', status: 'ACTIVE' },
          { id: 'current', name: 'LHS', status: 'ACTIVE', isVariant: true, parentOptionId: 'parent' },
          { id: 'old', name: 'Old LHS', status: 'SUPERSEDED', isVariant: true, parentOptionId: 'parent' },
        ]}
        value=""
        onChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Select an option...'));
    expect(screen.getByText('LHS')).toBeTruthy();
    expect(screen.queryByText('Old LHS')).toBeNull();
  });

  test('filters options based on search term', () => {
    const onChange = vi.fn();
    render(
      <SearchableSelector
        options={mockOptions}
        value=""
        onChange={onChange}
        placeholder="Select a vendor..."
      />
    );

    // Open the dropdown
    fireEvent.click(screen.getByText('Select a vendor...'));

    // Search for "Approved"
    const searchInput = screen.getByPlaceholderText('Search...');
    fireEvent.change(searchInput, { target: { value: 'Approved' } });

    // Only Approved Vendor should be visible
    expect(screen.getByText('Approved Vendor')).toBeTruthy();
    expect(screen.queryByText('Active Vendor')).toBeNull();
  });

  test('renders label correctly when provided', () => {
    const onChange = vi.fn();
    render(
      <SearchableSelector
        label="State / Region"
        options={mockOptions}
        value=""
        onChange={onChange}
      />
    );

    expect(screen.getByText('State / Region')).toBeTruthy();
  });

  test('allows selecting custom value when allowCustom is true', () => {
    const onChange = vi.fn();
    render(
      <SearchableSelector
        options={mockOptions}
        value=""
        onChange={onChange}
        allowCustom
        placeholder="Select or enter city..."
      />
    );

    // Open dropdown
    fireEvent.click(screen.getByText('Select or enter city...'));

    // Type a custom city name not in options
    const searchInput = screen.getByPlaceholderText('Search...');
    fireEvent.change(searchInput, { target: { value: 'Custom City' } });

    // Should show "Use “Custom City”"
    const customOption = screen.getByText(/Custom City/);
    expect(customOption).toBeTruthy();

    // Clicking custom option triggers onChange
    fireEvent.click(customOption);
    expect(onChange).toHaveBeenCalledWith('Custom City');
  });

  test('resolves selected option by code or case-insensitive match', () => {
    const onChange = vi.fn();
    render(
      <SearchableSelector
        options={mockOptions}
        value="V003"
        onChange={onChange}
      />
    );

    // Should find option with code V003 ('Approved Vendor')
    expect(screen.getByText('Approved Vendor')).toBeTruthy();
  });

  test('displays all variants when searching for the parent item', () => {
    const itemWithOptions = [
      { id: 'mat-1', name: 'Cotton Fabric', code: 'MAT-001', status: 'ACTIVE' },
      { id: 'mat-1-v1', name: 'Red', code: 'MAT-001-RED', isVariant: true, parentOptionId: 'mat-1', parentItemName: 'Cotton Fabric' },
      { id: 'mat-1-v2', name: 'Blue', code: 'MAT-001-BLU', isVariant: true, parentOptionId: 'mat-1', parentItemName: 'Cotton Fabric' },
      { id: 'mat-2', name: 'Steel Rod', code: 'MAT-002', status: 'ACTIVE' },
    ];
    const onChange = vi.fn();
    render(
      <SearchableSelector
        options={itemWithOptions}
        value=""
        onChange={onChange}
        placeholder="Select item..."
      />
    );

    fireEvent.click(screen.getByText('Select item...'));
    const searchInput = screen.getByPlaceholderText('Search...');
    fireEvent.change(searchInput, { target: { value: 'Cotton' } });

    // Both the parent item AND all its variants should be displayed
    expect(screen.getByText('Cotton Fabric')).toBeTruthy();
    expect(screen.getByText('Red')).toBeTruthy();
    expect(screen.getByText('Blue')).toBeTruthy();
    expect(screen.queryByText('Steel Rod')).toBeNull();
  });

  test('shows the parent item and variant label in options and the selected field', () => {
    const options = [
      { id: 'parent', name: 'GLIDER FRAME', code: 'FRAME', status: 'ACTIVE' },
      { id: 'variant', name: 'GLIDER FRAME - RAW LHS', code: 'FRAME-LHS', isVariant: true, parentOptionId: 'parent', parentItemName: 'GLIDER FRAME' },
    ];
    render(<SearchableSelector options={options} value="variant" onChange={vi.fn()} />);

    expect(screen.getByText('GLIDER FRAME RAW LHS')).toBeTruthy();

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('RAW LHS')).toBeTruthy();
    fireEvent.click(screen.getByText('RAW LHS'));
    expect(screen.getByText('GLIDER FRAME RAW LHS')).toBeTruthy();
    expect(screen.queryByText('Variant of GLIDER FRAME')).toBeNull();
  });

  test('can hide item codes in the dropdown while retaining code search', () => {
    const options = [{ id: 'material', name: 'Steel Pipe', code: 'MAT-123', status: 'ACTIVE' }];
    render(<SearchableSelector options={options} value="" onChange={vi.fn()} showOptionCode={false} placeholder="Select item..." />);

    fireEvent.click(screen.getByText('Select item...'));
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'MAT-123' } });

    expect(screen.getByText('Steel Pipe')).toBeTruthy();
    expect(screen.queryByText('MAT-123')).toBeNull();
  });

  test('displays parent item and variant when searching by variant attribute', () => {
    const itemWithOptions = [
      { id: 'mat-1', name: 'Cotton Fabric', code: 'MAT-001', status: 'ACTIVE' },
      { id: 'mat-1-v1', name: '100% Organic Red', code: 'MAT-001-RED', isVariant: true, parentOptionId: 'mat-1', parentItemName: 'Cotton Fabric' },
      { id: 'mat-2', name: 'Steel Rod', code: 'MAT-002', status: 'ACTIVE' },
    ];
    const onChange = vi.fn();
    render(
      <SearchableSelector
        options={itemWithOptions}
        value=""
        onChange={onChange}
        placeholder="Select item..."
      />
    );

    fireEvent.click(screen.getByText('Select item...'));
    const searchInput = screen.getByPlaceholderText('Search...');
    fireEvent.change(searchInput, { target: { value: 'Organic' } });

    // The variant matches, and its parent should also be visible
    expect(screen.getByText('100% Organic Red')).toBeTruthy();
    expect(screen.getByText('Cotton Fabric')).toBeTruthy();
    expect(screen.queryByText('Steel Rod')).toBeNull();
  });

  test('preserves hierarchy by rendering the parent item before its variants even if incoming order is inverted', () => {
    // Inverted incoming order (variants listed before parent)
    const invertedOptions = [
      { id: 'prod-v2', name: 'Variant 2', sku: 'SKU-VAR-02', isVariant: true, parentOptionId: 'prod-1', parentItemName: 'Fardeen Test Product' },
      { id: 'prod-v1', name: 'Variant 1', sku: 'SKU-VAR-01', isVariant: true, parentOptionId: 'prod-1', parentItemName: 'Fardeen Test Product' },
      { id: 'prod-1', name: 'Fardeen Test Product', sku: 'SYN-FAR-001', status: 'ACTIVE' },
    ];
    const onChange = vi.fn();
    render(
      <SearchableSelector
        options={invertedOptions}
        value=""
        onChange={onChange}
        placeholder="Select item..."
      />
    );

    fireEvent.click(screen.getByText('Select item...'));
    const searchInput = screen.getByPlaceholderText('Search...');
    fireEvent.change(searchInput, { target: { value: 'Far' } });

    const listItems = screen.getAllByRole('listitem');
    expect(listItems.length).toBe(3);
    // Parent must be first!
    expect(listItems[0].textContent).toContain('Fardeen Test Product');
    expect(listItems[1].textContent).toContain('Variant 2');
    expect(listItems[2].textContent).toContain('Variant 1');
  });

  test('opens on ArrowDown keypress on trigger button', () => {
    const onChange = vi.fn();
    render(
      <SearchableSelector
        options={mockOptions}
        value=""
        onChange={onChange}
        placeholder="Select a vendor..."
      />
    );

    const trigger = screen.getByRole('button');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    expect(screen.getByPlaceholderText('Search...')).toBeTruthy();
  });

  test('navigates with ArrowDown/ArrowUp and selects with Enter', () => {
    const onChange = vi.fn();
    render(
      <SearchableSelector
        options={mockOptions}
        value=""
        onChange={onChange}
        placeholder="Select a vendor..."
      />
    );

    // Open
    fireEvent.click(screen.getByText('Select a vendor...'));
    const searchInput = screen.getByPlaceholderText('Search...');

    // Options are: Approved Vendor (index 0), Active Vendor (index 1)
    // ArrowDown to index 1
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    // Press Enter to select index 1 (Active Vendor, id '4')
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('4');
    expect(screen.queryByPlaceholderText('Search...')).toBeNull();
  });

  test('closes on Escape key and restores focus to trigger', () => {
    const onChange = vi.fn();
    render(
      <SearchableSelector
        options={mockOptions}
        value=""
        onChange={onChange}
        placeholder="Select a vendor..."
      />
    );

    fireEvent.click(screen.getByText('Select a vendor...'));
    const searchInput = screen.getByPlaceholderText('Search...');

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Search...')).toBeNull();
  });

  test('Tab selects highlighted option and focuses next element without escaping', () => {
    const onChange = vi.fn();
    render(
      <form>
        <SearchableSelector
          options={mockOptions}
          value=""
          onChange={onChange}
          placeholder="Select a vendor..."
        />
        <input data-testid="next-input" type="text" />
      </form>
    );

    // Open
    fireEvent.click(screen.getByText('Select a vendor...'));
    const searchInput = screen.getByPlaceholderText('Search...');

    fireEvent.keyDown(searchInput, { key: 'Tab' });

    // Selected first option ('3' - Approved Vendor)
    expect(onChange).toHaveBeenCalledWith('3');
    // Dropdown closed
    expect(screen.queryByPlaceholderText('Search...')).toBeNull();
  });

  test('Shift+Tab closes dropdown and focuses previous element', () => {
    const onChange = vi.fn();
    render(
      <form>
        <input data-testid="prev-input" type="text" />
        <SearchableSelector
          options={mockOptions}
          value=""
          onChange={onChange}
          placeholder="Select a vendor..."
        />
      </form>
    );

    fireEvent.click(screen.getByText('Select a vendor...'));
    const searchInput = screen.getByPlaceholderText('Search...');
    fireEvent.keyDown(searchInput, { key: 'Tab', shiftKey: true });

    expect(screen.queryByPlaceholderText('Search...')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('prev-input'));
  });

  test('ArrowUp from top wraps to bottom and ArrowDown wraps to top', () => {
    const onChange = vi.fn();
    render(
      <SearchableSelector
        options={mockOptions}
        value=""
        onChange={onChange}
        placeholder="Select a vendor..."
      />
    );

    fireEvent.click(screen.getByText('Select a vendor...'));
    const searchInput = screen.getByPlaceholderText('Search...');

    // Initial highlight is index 0 ('Approved Vendor', id 3).
    // Pressing ArrowUp wraps to index 1 ('Active Vendor', id 4).
    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('4');

    // Open again
    fireEvent.click(screen.getByRole('button'));
    const searchInput2 = screen.getByPlaceholderText('Search...');
    // From 0, ArrowDown goes to 1, then ArrowDown wraps back to 0.
    fireEvent.keyDown(searchInput2, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput2, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput2, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('3');
  });
  test('initializes highlightedIndex to the currently selected option', () => {
    render(
      <SearchableSelector
        options={mockOptions}
        value="4"
        onChange={vi.fn()}
        placeholder="Select a vendor..."
      />
    );

    // Open dropdown
    fireEvent.click(screen.getByRole('button'));

    const listItems = screen.getAllByRole('listitem');
    // The second item ('Active Vendor', id 4) should be highlighted
    expect(listItems[1].className).toContain('border-primary');
  });

  test('ArrowRight and ArrowLeft on empty search input move focus to adjacent fields', () => {
    render(
      <form>
        <input data-testid="prev-input" type="text" />
        <SearchableSelector
          options={mockOptions}
          value=""
          onChange={vi.fn()}
          placeholder="Select a vendor..."
        />
        <input data-testid="next-input" type="text" />
      </form>
    );

    fireEvent.click(screen.getByText('Select a vendor...'));
    const searchInput = screen.getByPlaceholderText('Search...');

    // ArrowRight closes dropdown and moves focus to next-input
    fireEvent.keyDown(searchInput, { key: 'ArrowRight' });
    expect(screen.queryByPlaceholderText('Search...')).toBeNull();
  });
});
