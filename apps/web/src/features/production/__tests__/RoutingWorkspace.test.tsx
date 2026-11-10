import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { RoutingWorkspace } from '../RoutingWorkspace';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: 'new' }),
  usePathname: () => '/inventory/routing/new',
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const mockUseBomVersions = vi.fn().mockReturnValue({ data: { items: [] }, isLoading: false });

vi.mock('../../../hooks/useMasterData', () => ({
  expandProductsWithVariants: (_items: any[]) => [
    { id: 'parent-1', name: 'Glider Frame - Raw', sku: 'GF-01', isVariant: false },
    {
      id: 'parent-1__var__RHS',
      name: 'Glider Frame - Raw RHS',
      sku: 'GF-01-RHS',
      isVariant: true,
      parentOptionId: 'parent-1',
      parentProductId: 'parent-1',
      parentProductName: 'Glider Frame - Raw'
    }
  ],
  useProducts: () => ({
    data: {
      items: [
        { id: 'parent-1', name: 'Glider Frame - Raw', sku: 'GF-01' }
      ]
    },
    isLoading: false
  }),
  useMaterials: () => ({
    data: { items: [{ id: 'material-1', name: 'Cut timber', code: 'CT-01' }] },
    isLoading: false
  }),
  useDepartments: () => ({
    data: {
      items: [
        { id: 'dept-1', name: 'Cutting', code: 'SHOP-CUT' },
        { id: 'dept-2', name: 'Finishing', code: 'SHOP-FIN' },
        { id: 'dept-3', name: 'Welding', code: 'SHOP-WELD' }
      ]
    },
    isLoading: false
  }),
  useUoms: () => ({
    data: { items: [{ id: 'unit-1', name: 'Pieces', symbol: 'pcs' }] },
    isLoading: false
  }),
  useCreateDepartment: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateDepartment: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../../bom/hooks', () => ({
  useBomVersions: (params: any, options: any) => mockUseBomVersions(params, options),
  useBomVersion: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('../hooks', () => ({
  useProductionRouteGraph: () => ({ data: undefined, isLoading: false }),
  useSaveProductionRouteGraph: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe('RoutingWorkspace', () => {
  test('adds departments and sub-departments with clean material allotment and no shadows or blue strips', () => {
    const { container } = render(<RoutingWorkspace />);

    // Add first stage
    const addStageBtn = screen.getByRole('button', { name: /Add Stage/i });
    fireEvent.click(addStageBtn);

    // Add second stage
    fireEvent.click(addStageBtn);

    expect(screen.getByText('Department 1')).toBeTruthy();
    expect(screen.getByText('Department 2')).toBeTruthy();

    // Verify dedicated sub-stage drop/add zone exists
    expect(screen.getAllByText(/Drag department here or click to add sub-stage/i).length).toBeGreaterThan(0);

    // Add sub-department inside Department 1
    const addSubDeptBtns = screen.getAllByRole('button', { name: /Add Sub-Department/i });
    fireEvent.click(addSubDeptBtns[0]);

    expect(screen.getByText('Sub-Department 1')).toBeTruthy();

    // Verify material allocation section
    expect(screen.getAllByText('Allocated BOM Materials').length).toBeGreaterThan(0);

    // Verify departments catalog and search exist
    expect(screen.getByText('Departments Catalog')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search departments...')).toBeTruthy();

    // Verify no blue strip card at bottom
    expect(screen.queryByText(/Final Destination:/i)).toBeNull();

    // Verify no blue left border strip on department cards
    expect(container.querySelector('.border-l-4.border-l-primary')).toBeNull();
  });

  test('supports drag and drop onto Add Stage and Add Sub-Department buttons and inter-dropping between stages and sub-stages', () => {
    render(<RoutingWorkspace />);

    const addStageBtn = screen.getByRole('button', { name: /Add Stage/i });

    // 1. Drop sidebar department onto "+ Add Stage" button
    fireEvent.drop(addStageBtn, {
      dataTransfer: {
        getData: (type: string) => (type === 'text/sidebar-department-id' ? 'dept-1' : '')
      }
    });

    expect(screen.getAllByText(/Cutting/).length).toBeGreaterThanOrEqual(2);

    // 2. Drop sidebar department onto "+ Add Sub-Department" button of the stage
    const addSubDeptBtn = screen.getByRole('button', { name: /Add Sub-Department/i });
    fireEvent.drop(addSubDeptBtn, {
      dataTransfer: {
        getData: (type: string) => (type === 'text/sidebar-department-id' ? 'dept-2' : '')
      }
    });

    expect(screen.getAllByText(/Finishing/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Sub-stage')).toBeTruthy();

    // 3. Drop another department onto "+ Add Stage" button to create Stage 2
    fireEvent.drop(addStageBtn, {
      dataTransfer: {
        getData: (type: string) => (type === 'text/sidebar-department-id' ? 'dept-3' : '')
      }
    });

    // We now have 2 primary stages: Cutting and Finishing (Stage 2)
    const primaryStages = screen.getAllByText('Primary Stage');
    expect(primaryStages.length).toBe(2);

    // 4. Inter-drop: promote the sub-stage to primary by dropping onto "+ Add Stage" button
    // The sub-stage key can be retrieved from sub-stage element or test drop
    const subStageGrip = screen.getByTitle('Drag to reorder sub-stage');
    const subCard = subStageGrip.closest('[draggable="true"]') as HTMLElement;
    expect(subCard).toBeTruthy();

    // Fire dragStart on the sub-stage
    const subDataTransfer: Record<string, string> = {};
    fireEvent.dragStart(subCard, {
      dataTransfer: {
        setData: (k: string, v: string) => {
          subDataTransfer[k] = v;
        }
      }
    });

    expect(subDataTransfer['text/sub-stage-key']).toBeTruthy();

    // Drop the sub-stage onto "+ Add Stage" button to promote it
    fireEvent.drop(addStageBtn, {
      dataTransfer: {
        getData: (type: string) => subDataTransfer[type] || ''
      }
    });

    // Sub-stage is promoted to primary stage, so we now have 3 primary stages and 0 sub-stages
    expect(screen.getAllByText('Primary Stage').length).toBe(3);
    expect(screen.queryByText('Sub-stage')).toBeNull();
  });
});
