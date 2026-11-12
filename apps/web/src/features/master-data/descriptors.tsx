/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { EntityDescriptor } from './GenericList';
import { DetailDescriptor } from './GenericDetail';
import { createUomSchema, createCategorySchema } from '@plinth/validation';
import { StatusBadge } from '../../components/StatusBadge';

export const categoriesListDescriptor: EntityDescriptor<any> = {
  name: 'Parent Category', pluralName: 'Parent Categories', apiPath: 'categories', basePath: '/products/categories',
  allowDelete: true, allowBulkDelete: true,
  columns: [
    { key: 'name', header: 'Parent Category Name', width: '55%', render: (row) => <span className="font-bold text-sm">{row.name}</span> },
    { key: 'description', header: 'Description', width: '45%', render: (row) => <span className="text-xs text-muted-foreground">{row.description || '—'}</span> },
  ],
};

export const productFamiliesListDescriptor: EntityDescriptor<any> = {
  name: 'Sub Category', pluralName: 'Sub Categories', apiPath: 'product-families', basePath: '/products/families',
  allowDelete: true, allowBulkDelete: true,
  columns: [
    { key: 'name', header: 'Sub Category Name', width: '50%', render: (row) => <span className="font-bold text-sm">{row.name}</span> },
    { key: 'category', header: 'Parent Category', width: '50%', render: (row) => <span className="text-sm">{row.category?.name || '—'}</span> },
  ],
};

export const categoryDetailDescriptor: DetailDescriptor<any> = {
  name: 'Parent Category', apiPath: 'categories', basePath: '/products/categories', schema: createCategorySchema,
  fields: [{ name: 'name', label: 'Parent Category Name', type: 'text' }, { name: 'description', label: 'Description', type: 'text' }],
  defaultValues: { name: '', description: '' },
};

// ------------------------------------------------------------------
// UOM
// ------------------------------------------------------------------
export const uomListDescriptor: EntityDescriptor<any> = {
  name: 'Unit of Measure',
  pluralName: 'Units of Measure',
  apiPath: 'uom',
  basePath: '/inventory/uom',
  allowDelete: true,
  allowBulkDelete: true,
  columns: [
    {
      key: 'name',
      header: 'Name',
      width: '50%',
      render: (row) => (
        <span className="font-bold text-foreground text-sm">
          {row.name}
        </span>
      ),
    },
    {
      key: 'specification',
      header: 'Specification',
      width: '50%',
      render: (row) => {
        const symbol = row.symbol || row.code || '—';

        return (
          <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md border border-primary/20">
            {symbol}
          </span>
        );
      },
    },
  ],
};

export const uomDetailDescriptor: DetailDescriptor<any> = {
  name: 'Unit of Measure',
  apiPath: 'uom',
  basePath: '/inventory/uom',
  schema: createUomSchema,
  fields: [
    { name: 'code', label: 'UOM Code', type: 'text' },
    { name: 'name', label: 'Name', type: 'text' },
    { name: 'symbol', label: 'Symbol', type: 'text' },
    { name: 'dimension', label: 'Dimension', type: 'select', options: [
      { label: 'None', value: '' },
      { label: 'Length', value: 'Length' },
      { label: 'Mass', value: 'Mass' },
      { label: 'Volume', value: 'Volume' }
    ] },
  ],
  defaultValues: {
    code: '',
    name: '',
    symbol: '',
    dimension: ''
  }
};

// ------------------------------------------------------------------
// PRODUCTS (for Generic Master Data routes)
// ------------------------------------------------------------------
import { createProductSchema, createVendorSchema, createCustomerSchema, createMaterialSchema } from '@plinth/validation';

export const productsListDescriptor: EntityDescriptor<any> = {
  name: 'Product',
  pluralName: 'Products',
  apiPath: 'products',
  basePath: '/inventory/products',
  allowDelete: true,
  allowBulkDelete: true,
  columns: [
    {
      key: 'code',
      header: 'Code',
      width: '20%',
      render: (row) => (
        <span className="font-mono text-xs font-bold bg-muted/60 px-2.5 py-1 rounded-md border border-border/60 text-foreground">
          {row.code || row.sku}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Product Name',
      width: '45%',
      render: (row) => <span className="font-bold text-foreground text-sm">{row.name}</span>,
    },
    {
      key: 'baseUnitId',
      header: 'Base Unit',
      width: '20%',
      render: (row) => (
        <span className="font-mono text-xs font-medium text-muted-foreground">
          {row.baseUnitId || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '15%',
      render: (row) => <StatusBadge status={row.status} />,
    },
  ],
};

export const productsDetailDescriptor: DetailDescriptor<any> = {
  name: 'Product',
  apiPath: 'products',
  basePath: '/inventory/products',
  schema: createProductSchema,
  fields: [
    { name: 'code', label: 'Product Code', type: 'text' },
    { name: 'name', label: 'Name', type: 'text' },
    { name: 'description', label: 'Description', type: 'text' },
    { name: 'familyId', label: 'Family ID', type: 'text' },
    { name: 'baseUnitId', label: 'Base Unit ID', type: 'text' },
  ]
};

// ------------------------------------------------------------------
// VENDORS
// ------------------------------------------------------------------
import { VendorHistoryWidget } from '../purchases/VendorHistoryWidget';
export const vendorsListDescriptor: EntityDescriptor<any> = {
  name: 'Vendor',
  pluralName: 'Vendors',
  apiPath: 'vendors',
  basePath: '/inventory/vendors',
  columns: [
    {
      key: 'code',
      header: 'Vendor code',
      width: '20%',
      render: (row) => (
        <span className="font-mono text-xs font-bold bg-muted/60 px-2.5 py-1 rounded-md border border-border/60 text-foreground">
          {row.code}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Vendor name',
      width: '35%',
      render: (row) => <span className="font-bold text-foreground text-sm">{row.name}</span>,
    },
    { key: 'contactEmail', header: 'Contact', width: '20%' },
    { key: 'contactPhone', header: 'Phone', width: '15%' },
    {
      key: 'status',
      header: 'Status',
      width: '10%',
      render: (row) => <StatusBadge status={row.status} />,
    },
  ],
};

export const vendorsDetailDescriptor: DetailDescriptor<any> = {
  name: 'Vendor',
  apiPath: 'vendors',
  basePath: '/inventory/vendors',
  schema: createVendorSchema,
  fields: [
    { name: 'code', label: 'Vendor Code', type: 'text' },
    { name: 'name', label: 'Name', type: 'text' },
    { name: 'contactEmail', label: 'Email', type: 'text' },
    { name: 'address.street', label: 'Address', type: 'text' },
    { name: 'taxNumber', label: 'GST No', type: 'text' },
    { name: 'contactPhone', label: 'Contact No', type: 'text' },
  ],
  renderRightPanel: (id) => <VendorHistoryWidget vendorId={id} />
};

// ------------------------------------------------------------------
// CUSTOMERS
// ------------------------------------------------------------------
export const customersListDescriptor: EntityDescriptor<any> = {
  name: 'Customer',
  pluralName: 'Customers',
  apiPath: 'customers',
  basePath: '/inventory/customers',
  columns: [
    {
      key: 'code',
      header: 'Code',
      width: '25%',
      render: (row) => (
        <span className="font-mono text-xs font-bold bg-muted/60 px-2.5 py-1 rounded-md border border-border/60 text-foreground">
          {row.code}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      width: '45%',
      render: (row) => <span className="font-bold text-foreground text-sm">{row.name}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '30%',
      render: (row) => <StatusBadge status={row.status} />,
    },
  ],
};

export const customersDetailDescriptor: DetailDescriptor<any> = {
  name: 'Customer',
  apiPath: 'customers',
  basePath: '/inventory/customers',
  schema: createCustomerSchema,
  fields: [
    { name: 'code', label: 'Customer Code', type: 'text' },
    { name: 'name', label: 'Name', type: 'text' },
    { name: 'email', label: 'Email', type: 'text' },
  ]
};

// ------------------------------------------------------------------
// MATERIALS
// ------------------------------------------------------------------
export const materialsListDescriptor: EntityDescriptor<any> = {
  name: 'Material',
  pluralName: 'Materials',
  apiPath: 'materials',
  basePath: '/inventory/materials',
  allowDelete: true,
  allowBulkDelete: true,
  columns: [
    {
      key: 'code',
      header: 'Code',
      width: '20%',
      render: (row) => (
        <span className="font-mono text-xs font-bold bg-muted/60 px-2.5 py-1 rounded-md border border-border/60 text-foreground">
          {row.code}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Material Name',
      width: '40%',
      render: (row) => <span className="font-bold text-foreground text-sm">{row.name}</span>,
    },
    {
      key: 'uom',
      header: 'Base UOM',
      width: '20%',
      render: (row) => (
        <span className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
          {row.uom?.code || row.uom?.symbol || row.uom?.name || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '20%',
      render: (row) => <StatusBadge status={row.status} />,
    },
  ],
};

export const materialsDetailDescriptor: DetailDescriptor<any> = {
  name: 'Material',
  apiPath: 'materials',
  basePath: '/inventory/materials',
  schema: createMaterialSchema,
  fields: [
    { name: 'code', label: 'Material Code', type: 'text' },
    { name: 'name', label: 'Name', type: 'text' },
    { name: 'typeId', label: 'Type ID', type: 'text' },
    { name: 'baseUnitId', label: 'Base Unit ID', type: 'text' },
  ]
};

// ------------------------------------------------------------------
// ORG STRUCTURE (Factories)
// ------------------------------------------------------------------
import { createFactorySchema, createQcRuleSchema, createRouteStepSchema } from '@plinth/validation';

export const factoriesListDescriptor: EntityDescriptor<any> = {
  name: 'Factory',
  pluralName: 'Factories',
  apiPath: 'org/factories',
  basePath: '/inventory/org-structure',
  columns: [
    {
      key: 'code',
      header: 'Code',
      width: '25%',
      render: (row) => (
        <span className="font-mono text-xs font-bold bg-muted/60 px-2.5 py-1 rounded-md border border-border/60 text-foreground">
          {row.code}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      width: '50%',
      render: (row) => <span className="font-bold text-foreground text-sm">{row.name}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '25%',
      render: (row) => <StatusBadge status={row.status} />,
    },
  ],
};

export const factoriesDetailDescriptor: DetailDescriptor<any> = {
  name: 'Factory',
  apiPath: 'org/factories',
  basePath: '/inventory/org-structure',
  schema: createFactorySchema,
  fields: [
    { name: 'code', label: 'Factory Code', type: 'text' },
    { name: 'name', label: 'Name', type: 'text' },
  ]
};

// ------------------------------------------------------------------
// QC RULES
// ------------------------------------------------------------------
export const qcRulesListDescriptor: EntityDescriptor<any> = {
  name: 'QC Rule',
  pluralName: 'QC Rules',
  apiPath: 'rules/qc',
  basePath: '/inventory/qc-wastage-rules',
  columns: [
    {
      key: 'code',
      header: 'Code',
      width: '25%',
      render: (row) => (
        <span className="font-mono text-xs font-bold bg-muted/60 px-2.5 py-1 rounded-md border border-border/60 text-foreground">
          {row.code}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      width: '50%',
      render: (row) => <span className="font-bold text-foreground text-sm">{row.name}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '25%',
      render: (row) => <StatusBadge status={row.status} />,
    },
  ],
};

export const qcRulesDetailDescriptor: DetailDescriptor<any> = {
  name: 'QC Rule',
  apiPath: 'rules/qc',
  basePath: '/inventory/qc-wastage-rules',
  schema: createQcRuleSchema,
  fields: [
    { name: 'code', label: 'QC Rule Code', type: 'text' },
    { name: 'name', label: 'Name', type: 'text' },
    { name: 'description', label: 'Description', type: 'text' },
    // Override for effective-dated versions
    { name: 'effectiveFrom', label: 'Effective From (YYYY-MM-DD)', type: 'text' },
    { name: 'effectiveTo', label: 'Effective To (YYYY-MM-DD)', type: 'text' },
  ]
};

// ------------------------------------------------------------------
// ROUTING
// ------------------------------------------------------------------
export const routingListDescriptor: EntityDescriptor<any> = {
  name: 'Production Route',
  pluralName: 'Production Routes',
  apiPath: 'routing/routes',
  basePath: '/production/routing',
  allowDelete: true,
  sortByHeaders: true,
  hideStatusControls: true,
  deleteConfirmation: (route) => `This will deactivate ${route.name} and preserve its route steps and production history.`,
  excludeFromList: (route) => route.status === 'INACTIVE',
  columns: [
    {
      key: 'code',
      header: 'Code',
      width: '35%',
      render: (row) => (
        <span className="font-mono text-xs font-bold bg-muted/60 px-2.5 py-1 rounded-md border border-border/60 text-foreground">
          {row.code}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      width: '65%',
      render: (row) => <span className="font-bold text-foreground text-sm">{row.name}</span>,
    },
  ],
};

export const routingDetailDescriptor: DetailDescriptor<any> = {
  name: 'Route Step',
  apiPath: 'routing/routes',
  basePath: '/inventory/routing',
  schema: createRouteStepSchema,
  fields: [
    { name: 'code', label: 'Step Code', type: 'text' },
    { name: 'name', label: 'Name', type: 'text' },
    { name: 'workCenterId', label: 'Work Center ID', type: 'text' },
    // Override for step reordering
    { name: 'sequence', label: 'Sequence Order (Reorder Steps)', type: 'number' },
  ]
};
