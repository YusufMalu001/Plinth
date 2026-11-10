import { z } from 'zod';

// ==============================================================================
// AUTH & USERS VALIDATION SCHEMAS (MODULE 0)
// ==============================================================================

export const loginSchema = z.object({
  // Normalize credentials at the API boundary so copied emails/newline
  // characters cannot turn a valid account into a misleading 401.
  email: z.string().trim().toLowerCase().email({ message: 'Invalid email address format' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters long' })
});

export const loginRequestSchema = z.object({
  body: loginSchema,
  query: z.object({}),
  params: z.object({})
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerUserSchema = z.object({
  email: z.string().email({ message: 'Invalid email address format' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters long' }),
  name: z.string().min(2, { message: 'Name must be at least 2 characters long' }).optional(),
  role: z.enum(['admin', 'manager', 'employee', 'siddhi_tech_lead']).default('employee'),
  roleDefinitionId: z.string().uuid().optional()
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>;

export const createUserRequestSchema = z.object({
  body: registerUserSchema,
  query: z.object({}),
  params: z.object({})
});

export const userStatusRequestSchema = z.object({
  body: z.object({ isActive: z.boolean() }),
  query: z.object({}),
  params: z.object({ id: z.string().uuid() })
});

export const userListRequestSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  }),
  params: z.object({})
});

export const userRoleEnum = z.enum(['admin', 'manager', 'employee']);
export const updateUserRoleRequestSchema = z.object({
  body: z.object({ role: userRoleEnum.optional(), roleDefinitionId: z.string().uuid().nullable().optional() }).refine((value) => Boolean(value.role) !== Boolean(value.roleDefinitionId), { message: 'Specify exactly one role or roleDefinitionId' }),
  query: z.object({}),
  params: z.object({ id: z.string().uuid() })
});

export const createRoleRequestSchema = z.object({
  body: z.object({ key: z.string().trim().min(2).max(50).transform((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).refine((value) => value.length >= 2 && value.length <= 50, 'Invalid role key'), name: z.string().trim().min(2).max(80), description: z.string().trim().max(300).optional(), permissionIds: z.array(z.string().uuid()).max(200).default([]) }),
  query: z.object({}), params: z.object({})
});

export const updateRoleDefinitionRequestSchema = z.object({
  body: z.object({ name: z.string().trim().min(2).max(80).optional(), description: z.string().trim().max(300).nullable().optional(), isActive: z.boolean().optional(), permissionIds: z.array(z.string().uuid()).max(200).optional() }),
  query: z.object({}), params: z.object({ id: z.string().uuid() })
});

export const updateRolePermissionsRequestSchema = z.object({
  body: z.object({ permissionIds: z.array(z.string().uuid()).max(200) }),
  query: z.object({}),
  params: z.object({ role: userRoleEnum })
});

// ==============================================================================
// COMMON / LIFECYCLE / PAGINATION SCHEMAS (MODULE 1)
// ==============================================================================

export const lifecycleStatusEnum = z.enum([
  'DRAFT',
  'PENDING_VALIDATION',
  'APPROVED',
  'ACTIVE',
  'INACTIVE',
  'SUPERSEDED'
]);

export const transitionStatusSchema = z.object({
  targetStatus: lifecycleStatusEnum,
  remarks: z.string().max(500).optional()
});
export type TransitionStatusInput = z.infer<typeof transitionStatusSchema>;

export const submitValidationSchema = z.object({
  remarks: z.string().max(500).optional()
}).default({});
export type SubmitValidationInput = z.infer<typeof submitValidationSchema>;

export const approveMasterSchema = z.object({
  remarks: z.string().max(500).optional()
}).default({});
export type ApproveMasterInput = z.infer<typeof approveMasterSchema>;

export const rejectMasterSchema = z.object({
  reason: z.string().max(500).optional(),
  targetStatus: z.enum(['DRAFT', 'INACTIVE']).default('DRAFT').optional()
}).default({});
export type RejectMasterInput = z.infer<typeof rejectMasterSchema>;

export const deactivateMasterSchema = z.object({
  reason: z.string().max(500).optional()
}).default({});
export type DeactivateMasterInput = z.infer<typeof deactivateMasterSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  search: z.string().trim().optional(),
  status: lifecycleStatusEnum.optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional()
});

export type PaginationQueryInput = z.infer<typeof paginationQuerySchema>;

// ==============================================================================
// PRODUCTS, CATEGORIES, FAMILIES & VARIANTS
// ==============================================================================

export const createCategorySchema = z.object({
  code: z.string().min(1, 'Category code is required').max(50),
  name: z.string().min(1, 'Category name is required').max(150),
  description: z.string().max(500).optional(),
  parentCategoryId: z.string().uuid().optional().nullable(),
  parentId: z.string().uuid().optional().nullable()
}).transform((data) => ({
  ...data,
  parentId: data.parentId || data.parentCategoryId || undefined
}));
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(500).optional(),
  parentId: z.string().uuid().optional().nullable(),
  parentCategoryId: z.string().uuid().optional().nullable()
}).transform((data) => ({
  ...data,
  parentId: data.parentId !== undefined ? data.parentId : (data.parentCategoryId !== undefined ? data.parentCategoryId : undefined)
}));
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const createProductFamilySchema = z.object({
  code: z.string().min(1, 'Product family code is required').max(50),
  name: z.string().min(1, 'Product family name is required').max(150),
  description: z.string().max(500).optional(),
  categoryId: z.string().uuid('Valid Category ID is required')
});
export type CreateProductFamilyInput = z.infer<typeof createProductFamilySchema>;

export const updateProductFamilySchema = createProductFamilySchema.partial();
export type UpdateProductFamilyInput = z.infer<typeof updateProductFamilySchema>;

export const createProductSchema = z.object({
  sku: z.string().max(100).optional().or(z.literal('')),
  name: z.string().min(1, 'Product name is required').max(200),
  description: z.string().max(1000).optional(),
  // Classification is maintained as an internal legacy reference. Product
  // creation no longer asks the user to select it.
  categoryId: z.string().uuid('Valid Category ID is required').optional(),
  productFamilyId: z.string().uuid('Valid Product Family ID is required').optional(),
  uomId: z.string().uuid('Valid Unit of Measure ID is required'),
  initialQuantity: z.number().min(0).default(0).optional(),
  minStockLevel: z.number().min(0).default(0).optional(),
  reorderPoint: z.number().min(0).default(0).optional(),
  leadTimeDays: z.number().min(0).default(0).optional(),
  costPrice: z.number().min(0).default(0).optional(),
  sellingPrice: z.number().min(0).default(0).optional(),
  metadata: z.record(z.unknown()).default({}).optional()
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productSpecialPresetSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().max(200).default(''),
  description: z.string().trim().max(1000).optional().nullable(),
  hsnCode: z.string().trim().max(50).default(''),
  taxability: z.string().trim().max(50).default('Taxable'),
  uomId: z.string().trim().max(100).default(''),
  uomCode: z.string().trim().max(50).default('NOS'),
  gstRate: z.string().trim().max(20).default('18'),
  initialQuantity: z.string().trim().max(50).default('0'),
  isSystemDefault: z.boolean().default(false),
  isDeleted: z.boolean().default(false),
});
export type ProductSpecialPresetInput = z.infer<typeof productSpecialPresetSchema>;

export const createProductVariantSchema = z.object({
  productId: z.string().uuid('Valid Product ID is required'),
  variantSku: z.string().min(1, 'Variant SKU is required').max(100).optional(),
  sku: z.string().min(1, 'Variant SKU is required').max(100).optional(),
  name: z.string().min(1, 'Variant name is required').max(200),
  color: z.string().max(50).optional().nullable(),
  size: z.string().max(50).optional().nullable(),
  specifications: z.record(z.unknown()).default({}).optional(),
  attributes: z.record(z.unknown()).default({}).optional(),
  costPrice: z.number().min(0).default(0).optional(),
  sellingPrice: z.number().min(0).default(0).optional()
}).transform((data) => ({
  ...data,
  sku: data.sku || data.variantSku || ''
}));
export type CreateProductVariantInput = z.infer<typeof createProductVariantSchema>;

export const updateProductVariantSchema = z.object({
  sku: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(200).optional(),
  color: z.string().max(50).optional().nullable(),
  size: z.string().max(50).optional().nullable(),
  specifications: z.record(z.unknown()).optional(),
  attributes: z.record(z.unknown()).optional(),
  costPrice: z.number().min(0).optional(),
  sellingPrice: z.number().min(0).optional()
});
export type UpdateProductVariantInput = z.infer<typeof updateProductVariantSchema>;

// ==============================================================================
// MATERIALS
// ==============================================================================

export const materialTypeEnum = z.enum([
  'RAW_MATERIAL',
  'HARDWARE',
  'PACKAGING',
  'COMPONENT'
]);

export const createMaterialSchema = z.object({
  code: z.string().max(50).optional().or(z.literal('')),
  name: z.string().min(1, 'Material name is required').max(200),
  description: z.string().max(1000).optional(),
  materialType: materialTypeEnum,
  uomId: z.string().uuid('Valid Unit of Measure ID is required'),
  categoryId: z.string().uuid().optional().nullable(),
  specs: z.record(z.unknown()).default({}),
  initialQuantity: z.number().min(0).default(0).optional(),
  minStockLevel: z.number().min(0).default(0).optional(),
  reorderPoint: z.number().min(0).default(0).optional(),
  leadTimeDays: z.number().min(0).default(0).optional(),
  standardCost: z.number().min(0).default(0).optional()
});
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;

export const updateMaterialSchema = createMaterialSchema.partial();
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;

// ==============================================================================
// UNIT OF MEASURE (UOM), CONVERSIONS & PACK SIZES
// ==============================================================================

export const createUomSchema = z.object({
  code: z.string().min(1, 'UOM code is required').max(50),
  name: z.string().min(1, 'UOM name is required').max(100),
  symbol: z.string().min(1, 'UOM symbol is required').max(20),
  dimension: z.string().max(50).optional().nullable(),
  allowFractional: z.boolean().default(true).optional(),
  isBaseUnit: z.boolean().default(false).optional()
});
export type CreateUomInput = z.infer<typeof createUomSchema>;

export const updateUomSchema = createUomSchema.partial();
export type UpdateUomInput = z.infer<typeof updateUomSchema>;

export const createUomConversionSchema = z.object({
  fromUomId: z.string().uuid('Valid From UOM ID is required'),
  toUomId: z.string().uuid('Valid To UOM ID is required'),
  conversionFactor: z.number().positive('Conversion factor must be positive').optional(),
  factor: z.number().positive('Factor must be positive').optional(),
  effectiveDate: z.coerce.date().default(() => new Date()).optional(),
  materialId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid().optional().nullable()
}).transform((data) => ({
  ...data,
  factor: data.factor || data.conversionFactor || 1,
  effectiveDate: data.effectiveDate || new Date()
}));
export type CreateUomConversionInput = z.infer<typeof createUomConversionSchema>;

export const updateUomConversionSchema = z.object({
  factor: z.number().positive().optional(),
  conversionFactor: z.number().positive().optional(),
  effectiveDate: z.coerce.date().optional()
});
export type UpdateUomConversionInput = z.infer<typeof updateUomConversionSchema>;

export const createPackSizeSchema = z.object({
  materialId: z.string().uuid('Valid Material ID is required'),
  uomId: z.string().uuid('Valid UOM ID is required'),
  name: z.string().min(1, 'Pack size name is required').max(100).optional(),
  quantity: z.number().positive('Quantity must be positive').optional(),
  packQty: z.number().positive('Pack quantity must be positive').optional(),
  effectiveDate: z.coerce.date().default(() => new Date()).optional(),
  barcode: z.string().max(100).optional().nullable()
}).transform((data) => ({
  ...data,
  packQty: data.packQty || data.quantity || 1,
  effectiveDate: data.effectiveDate || new Date()
}));
export type CreatePackSizeInput = z.infer<typeof createPackSizeSchema>;

export const updatePackSizeSchema = z.object({
  packQty: z.number().positive().optional(),
  quantity: z.number().positive().optional(),
  effectiveDate: z.coerce.date().optional(),
  barcode: z.string().max(100).optional().nullable()
});
export type UpdatePackSizeInput = z.infer<typeof updatePackSizeSchema>;

// ==============================================================================
// VENDORS & CUSTOMERS
// ==============================================================================

export const vendorCapabilityItemSchema = z.object({
  productId: z.string().optional().nullable(),
  materialId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  uomId: z.string().optional().nullable(),
  moq: z.number().optional().nullable(),
  unitPrice: z.number().min(0).optional().nullable(),
  leadTimeDays: z.number().int().min(0).optional().nullable(),
  notes: z.string().optional().nullable()
});

export const createVendorSchema = z.object({
  code: z.string().max(50).optional(),
  name: z.string().min(1, 'Vendor name is required').max(200),
  status: z.enum(['DRAFT', 'PENDING_VALIDATION', 'APPROVED', 'ACTIVE']).optional(),
  legalName: z.string().max(200).optional().nullable(),
  contactPerson: z.string().min(1, 'Key contact is required'),
  taxId: z.string().max(50).optional().nullable(),
  taxNumber: z.string().max(50).optional().nullable(),
  contactEmail: z.string().email('Invalid email format').optional().nullable(),
  contactPhone: z.string().max(30).optional().nullable(),
  paymentTerms: z.string().max(100).optional().nullable(),
  currency: z.string().length(3).default('INR').optional(),
  address: z.record(z.unknown()).optional().nullable(),
  addresses: z.array(z.record(z.unknown())).default([]),
  capabilities: z.array(vendorCapabilityItemSchema).optional().default([])
}).superRefine((data, ctx) => {
  const address = data.address || data.addresses?.[0] || {};
  for (const field of ['street', 'city', 'state', 'postalCode', 'country']) {
    if (typeof address[field] !== 'string' || !(address[field] as string).trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['address', field], message: `${field} is required` });
    }
  }
  if (!data.contactEmail?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['contactEmail'], message: 'PO delivery email is required' });
  if (!data.contactPhone?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['contactPhone'], message: 'Direct phone is required' });
}).transform((data) => ({
  ...data,
  taxNumber: data.taxNumber || data.taxId || undefined,
  address: data.address || (data.addresses && data.addresses[0]) || undefined
}));
export type CreateVendorInput = z.infer<typeof createVendorSchema>;

export const updateVendorSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  legalName: z.string().max(200).optional().nullable(),
  contactPerson: z.string().min(1).optional(),
  taxId: z.string().max(50).optional().nullable(),
  taxNumber: z.string().max(50).optional().nullable(),
  contactEmail: z.string().email('Invalid email format').optional().nullable(),
  contactPhone: z.string().max(30).optional().nullable(),
  paymentTerms: z.string().max(100).optional().nullable(),
  currency: z.string().length(3).optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  address: z.record(z.unknown()).optional().nullable(),
  addresses: z.array(z.record(z.unknown())).optional(),
  capabilities: z.array(vendorCapabilityItemSchema).optional()
}).transform((data) => ({
  ...data,
  taxNumber: data.taxNumber !== undefined ? data.taxNumber : data.taxId,
  address: data.address !== undefined ? data.address : (data.addresses && data.addresses[0] ? data.addresses[0] : undefined)
}));
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;

export const createVendorEvaluationSchema = z.object({
  body: z.object({
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    scores: z.object({
      quality: z.number().min(0).max(5),
      delivery: z.number().min(0).max(5),
      responsiveness: z.number().min(0).max(5),
      documentation: z.number().min(0).max(5),
      service: z.number().min(0).max(5)
    }),
    comments: z.string().max(4000).optional(),
    evidenceUrl: z.string().url().optional().nullable()
  })
});

export const createVendorScorecardSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(120),
    weights: z.object({
      quality: z.number().min(0).max(100),
      delivery: z.number().min(0).max(100),
      fillRate: z.number().min(0).max(100),
      price: z.number().min(0).max(100),
      responsiveness: z.number().min(0).max(100),
      compliance: z.number().min(0).max(100)
    }).refine(value => Object.values(value).reduce((sum, item) => sum + item, 0) === 100, {
      message: 'Vendor scorecard weights must total 100'
    }),
    thresholds: z.record(z.number()).optional()
  })
});

export const vendorRecommendationSchema = z.object({
  body: z.object({
    lineIds: z.array(z.string().uuid()).min(1)
  })
});

export const createCustomerSchema = z.object({
  code: z.string().min(1, 'Customer code is required').max(50),
  name: z.string().min(1, 'Customer name is required').max(200),
  legalName: z.string().max(200).optional().nullable(),
  taxId: z.string().max(50).optional().nullable(),
  taxNumber: z.string().max(50).optional().nullable(),
  contactEmail: z.string().email('Invalid email format').optional().nullable(),
  contactPhone: z.string().max(30).optional().nullable(),
  creditLimit: z.number().min(0).default(0).optional(),
  paymentTerms: z.string().max(100).optional().nullable(),
  currency: z.string().length(3).default('INR').optional(),
  billingAddress: z.record(z.unknown()).optional().nullable(),
  shippingAddress: z.record(z.unknown()).optional().nullable(),
  addresses: z.array(z.record(z.unknown())).default([])
}).transform((data) => ({
  ...data,
  taxNumber: data.taxNumber || data.taxId || undefined,
  billingAddress: data.billingAddress || (data.addresses && data.addresses[0]) || undefined
}));
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  legalName: z.string().max(200).optional().nullable(),
  taxId: z.string().max(50).optional().nullable(),
  taxNumber: z.string().max(50).optional().nullable(),
  contactEmail: z.string().email('Invalid email format').optional().nullable(),
  contactPhone: z.string().max(30).optional().nullable(),
  creditLimit: z.number().min(0).optional(),
  paymentTerms: z.string().max(100).optional().nullable(),
  currency: z.string().length(3).optional(),
  billingAddress: z.record(z.unknown()).optional().nullable(),
  shippingAddress: z.record(z.unknown()).optional().nullable(),
  addresses: z.array(z.record(z.unknown())).optional()
}).transform((data) => ({
  ...data,
  taxNumber: data.taxNumber !== undefined ? data.taxNumber : data.taxId,
  billingAddress: data.billingAddress !== undefined ? data.billingAddress : (data.addresses && data.addresses[0] ? data.addresses[0] : undefined)
}));
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// ==============================================================================
// ORGANIZATIONAL STRUCTURE
// ==============================================================================

export const createFactorySchema = z.object({
  code: z.string().min(1, 'Factory code is required').max(50),
  name: z.string().min(1, 'Factory name is required').max(150),
  location: z.string().max(200).optional().nullable(),
  address: z.record(z.unknown()).optional().nullable()
});
export type CreateFactoryInput = z.infer<typeof createFactorySchema>;
export const updateFactorySchema = createFactorySchema.partial();
export type UpdateFactoryInput = z.infer<typeof updateFactorySchema>;

export const createDepartmentSchema = z.object({
  factoryId: z.string().uuid('Valid Factory ID is required').optional(),
  code: z.string().min(1, 'Department code is required').max(50).optional(),
  name: z.string().min(1, 'Department name is required').max(150),
  departmentHead: z.string().max(150).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  isAssembly: z.boolean().default(false).optional()
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export const updateDepartmentSchema = createDepartmentSchema.partial();
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

export const createWorkCenterSchema = z.object({
  departmentId: z.string().uuid('Valid Department ID is required'),
  code: z.string().min(1, 'Work center code is required').max(50),
  name: z.string().min(1, 'Work center name is required').max(150),
  capacityPerHour: z.number().min(0).default(0).optional(),
  costPerHour: z.number().min(0).default(0).optional()
});
export type CreateWorkCenterInput = z.infer<typeof createWorkCenterSchema>;
export const updateWorkCenterSchema = createWorkCenterSchema.partial();
export type UpdateWorkCenterInput = z.infer<typeof updateWorkCenterSchema>;

export const createWarehouseLocationSchema = z.object({
  factoryId: z.string().uuid().optional().nullable(),
  code: z.string().min(1, 'Location code is required').max(50),
  name: z.string().min(1, 'Location name is required').max(150),
  type: z.string().min(1, 'Location type is required').max(50).optional(),
  locationType: z.string().min(1, 'Location type is required').max(50).optional()
}).transform((data) => ({
  ...data,
  type: data.type || data.locationType || 'STORAGE'
}));
export type CreateWarehouseLocationInput = z.infer<typeof createWarehouseLocationSchema>;
export const updateWarehouseLocationSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  factoryId: z.string().uuid().optional().nullable(),
  type: z.string().max(50).optional(),
  locationType: z.string().max(50).optional()
}).transform((data) => ({
  ...data,
  type: data.type || data.locationType
}));
export type UpdateWarehouseLocationInput = z.infer<typeof updateWarehouseLocationSchema>;

export const createEmployeeMasterSchema = z.object({
  departmentId: z.string().uuid().optional().nullable(),
  employeeCode: z.string().min(1, 'Employee code is required').max(50).optional(),
  code: z.string().min(1, 'Employee code is required').max(50).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(150).optional(),
  email: z.string().email('Invalid email'),
  phone: z.string().max(30).optional().nullable(),
  contactPhone: z.string().max(30).optional().nullable(),
  role: z.string().max(50).default('OPERATOR').optional(),
  designation: z.string().max(100).optional().nullable()
}).transform((data) => {
  const parts = data.name ? data.name.trim().split(' ') : [];
  const firstName = data.firstName || parts[0] || 'Employee';
  const lastName = data.lastName || (parts.length > 1 ? parts.slice(1).join(' ') : 'Staff');
  return {
    ...data,
    employeeCode: data.employeeCode || data.code || `EMP-${Date.now()}`,
    firstName,
    lastName,
    role: data.role || data.designation || 'OPERATOR',
    phone: data.phone || data.contactPhone || undefined
  };
});
export type CreateEmployeeMasterInput = z.infer<typeof createEmployeeMasterSchema>;
export const updateEmployeeMasterSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional().nullable(),
  role: z.string().max(50).optional(),
  departmentId: z.string().uuid().optional().nullable()
});
export type UpdateEmployeeMasterInput = z.infer<typeof updateEmployeeMasterSchema>;

export const createSalesChannelSchema = z.object({
  code: z.string().min(1, 'Channel code is required').max(50),
  name: z.string().min(1, 'Channel name is required').max(150),
  description: z.string().max(500).optional().nullable(),
  currency: z.string().length(3).default('INR').optional(),
  type: z.string().min(1, 'Channel type is required').max(50).optional()
});
export type CreateSalesChannelInput = z.infer<typeof createSalesChannelSchema>;
export const updateSalesChannelSchema = createSalesChannelSchema.partial();
export type UpdateSalesChannelInput = z.infer<typeof updateSalesChannelSchema>;

// ==============================================================================
// QC & WASTAGE RULES
// ==============================================================================

export const createQcRuleSchema = z.object({
  code: z.string().min(1, 'QC rule code is required').max(50),
  name: z.string().min(1, 'QC rule name is required').max(150),
  description: z.string().max(500).optional().nullable(),
  targetType: z.string().min(1, 'Target type is required').max(50),
  targetId: z.string().uuid().optional().nullable(),
  parameters: z.record(z.unknown()).default({}),
  effectiveFrom: z.coerce.date().default(() => new Date()),
  effectiveTo: z.coerce.date().optional().nullable()
});
export type CreateQcRuleInput = z.infer<typeof createQcRuleSchema>;
export const updateQcRuleSchema = createQcRuleSchema.partial();
export type UpdateQcRuleInput = z.infer<typeof updateQcRuleSchema>;

export const createWastageRuleSchema = z.object({
  code: z.string().min(1, 'Wastage rule code is required').max(50),
  name: z.string().min(1, 'Wastage rule name is required').max(150),
  materialId: z.string().uuid().optional().nullable(),
  workCenterId: z.string().uuid().optional().nullable(),
  standardWastagePct: z.number().min(0).max(100),
  tolerancePct: z.number().min(0).max(100),
  effectiveFrom: z.coerce.date().default(() => new Date()),
  effectiveTo: z.coerce.date().optional().nullable()
});
export type CreateWastageRuleInput = z.infer<typeof createWastageRuleSchema>;
export const updateWastageRuleSchema = createWastageRuleSchema.partial();
export type UpdateWastageRuleInput = z.infer<typeof updateWastageRuleSchema>;

// ==============================================================================
// ROUTING & ROUTE STEPS
// ==============================================================================

export const createProductRouteSchema = z.object({
  code: z.string().min(1, 'Route code is required').max(50),
  name: z.string().min(1, 'Route name is required').max(150),
  productId: z.string().uuid().optional().nullable(),
  materialId: z.string().uuid().optional().nullable(),
  productVariantId: z.string().uuid().optional().nullable(),
  effectiveFrom: z.coerce.date().default(() => new Date()),
  effectiveTo: z.coerce.date().optional().nullable()
});
export type CreateProductRouteInput = z.infer<typeof createProductRouteSchema>;
export const updateProductRouteSchema = createProductRouteSchema.partial();
export type UpdateProductRouteInput = z.infer<typeof updateProductRouteSchema>;

export const createRouteStepSchema = z.object({
  routeId: z.string().uuid('Valid Route ID is required'),
  sequenceNumber: z.number().int().positive('Sequence number must be a positive integer'),
  stepName: z.string().min(1, 'Step name is required').max(150),
  workCenterId: z.string().uuid().optional().nullable(),
  departmentId: z.string().uuid('Valid Department ID is required'),
  standardDurationMinutes: z.number().min(0).optional().nullable(),
  isQcRequired: z.boolean().default(false).optional(),
  qcRuleId: z.string().uuid().optional().nullable()
});
export type CreateRouteStepInput = z.infer<typeof createRouteStepSchema>;
export const updateRouteStepSchema = createRouteStepSchema.partial();
export type UpdateRouteStepInput = z.infer<typeof updateRouteStepSchema>;

export const saveProductionRouteGraphSchema = z.object({
  body: z.object({
    code: z.string().trim().min(1).max(50),
    name: z.string().trim().min(1).max(150),
    productId: z.string().uuid(),
    bomVersionId: z.string().uuid(),
    assemblyDepartmentId: z.string().uuid().optional(),
    effectiveFrom: z.coerce.date(),
    steps: z.array(z.object({
      key: z.string().trim().min(1).max(80),
      branchKey: z.string().trim().min(1).max(80),
      stepOrder: z.number().int().positive(),
      parentKey: z.string().trim().min(1).nullable(),
      stepName: z.string().trim().min(1).max(150),
      departmentId: z.string().uuid(),
      nextDepartmentId: z.string().uuid().nullable().optional(),
      workCenterId: z.string().uuid().nullable().optional(),
      standardDurationMinutes: z.number().nonnegative().nullable().optional(),
      isQcRequired: z.boolean(),
      outputItemType: z.enum(['MATERIAL', 'PRODUCT']),
      outputItemId: z.string().uuid(),
      outputUomId: z.string().uuid(),
      outputQuantityPerUnit: z.number().positive()
    })).min(1),
    allocations: z.array(z.object({
      bomLineId: z.string().uuid(),
      stepKey: z.string().nullable(),
      quantity: z.number().positive()
    })).min(1)
  })
});
export type SaveProductionRouteGraphInput = z.infer<typeof saveProductionRouteGraphSchema>['body'];

// ==============================================================================
// IMPORT & EXPORT SCHEMAS
// ==============================================================================

export const stageImportBatchSchema = z.object({
  entityType: z.string().min(1, 'Entity type is required'),
  filename: z.string().optional().nullable(),
  rows: z.array(z.record(z.unknown())).min(1, 'At least one row is required for staging')
});
export type StageImportBatchInput = z.infer<typeof stageImportBatchSchema>;

export const commitImportBatchSchema = z.object({
  skipErrors: z.boolean().default(true).optional(),
  remarks: z.string().optional()
}).default({});
export type CommitImportBatchInput = z.infer<typeof commitImportBatchSchema>;

export const exportQuerySchema = z.object({
  entityType: z.string().min(1, 'Entity type is required'),
  status: lifecycleStatusEnum.optional(),
  format: z.enum(['json', 'csv']).default('json').optional()
});
export type ExportQueryInput = z.infer<typeof exportQuerySchema>;

// ==============================================================================
// PROCUREMENT VALIDATION SCHEMAS (MODULE 2)
// ==============================================================================

export const createPrSchema = z.object({
  body: z.object({
    prNumber: z.string().min(1).optional(),
    departmentId: z.string().uuid(),
    preferredVendorId: z.string().uuid().optional(),
    needDate: z.coerce.date(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).default('NORMAL').optional(),
    businessJustification: z.string().trim().min(10).max(2000).optional(),
    deliveryLocation: z.string().trim().min(2).max(300).optional(),
    costCenter: z.string().trim().max(80).optional(),
    projectCode: z.string().trim().max(80).optional(),
    requestedBudget: z.number().nonnegative().optional(),
    notes: z.string().max(2000).optional(),
    lines: z.array(z.object({
      productId: z.string().uuid().optional(),
      materialId: z.string().uuid().optional(),
      uomId: z.string().uuid(),
      requestedQuantity: z.number().positive(),
      estimatedUnitCost: z.number().nonnegative().optional(),
      specifications: z.string().trim().max(1000).optional(),
      preferredMake: z.string().trim().max(200).optional(),
      needDateOverride: z.coerce.date().optional()
    })).min(1).refine(lines => lines.every(l => Boolean(l.productId) || Boolean(l.materialId)), {
      message: "Each line must specify a product or material"
    })
  })
});

export type CreatePrInput = z.infer<typeof createPrSchema>;

export const updatePrSchema = z.object({
  body: z.object({
    departmentId: z.string().uuid().optional(),
    preferredVendorId: z.string().uuid().optional(),
    needDate: z.coerce.date().optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).optional(),
    businessJustification: z.string().trim().min(10).max(2000).optional(),
    deliveryLocation: z.string().trim().min(2).max(300).optional(),
    costCenter: z.string().trim().max(80).optional(),
    projectCode: z.string().trim().max(80).optional(),
    requestedBudget: z.number().nonnegative().optional(),
    notes: z.string().max(2000).optional(),
    lines: z.array(z.object({
      productId: z.string().uuid().optional(),
      materialId: z.string().uuid().optional(),
      uomId: z.string().uuid(),
      requestedQuantity: z.number().positive(),
      estimatedUnitCost: z.number().nonnegative().optional(),
      specifications: z.string().trim().max(1000).optional(),
      preferredMake: z.string().trim().max(200).optional(),
      needDateOverride: z.coerce.date().optional()
    })).min(1).refine(lines => lines.every(l => Boolean(l.productId) || Boolean(l.materialId)), {
      message: "Each line must specify a product or material"
    }).optional()
  })
});

export type UpdatePrInput = z.infer<typeof updatePrSchema>;

export const submitPrSchema = z.object({
  body: z.object({}) // empty body
});

export const approvePrSchema = z.object({
  body: z.object({
    reason: z.string().optional()
  })
});

export const rejectPrSchema = z.object({
  body: z.object({
    reason: z.string().min(1, "Reason is required for rejection")
  })
});

export const requestChangesPrSchema = z.object({
  body: z.object({
    reason: z.string().min(1, "Reason is required for requesting changes")
  })
});

export const cancelPrSchema = z.object({
  body: z.object({
    reason: z.string().optional()
  })
});

export const generatePoSchema = z.object({
  body: z.object({
    poNumber: z.string().min(1).optional(),
    prId: z.string().uuid().optional(),
    vendorId: z.string().uuid(),
    departmentId: z.string().uuid().optional(),
    needDate: z.coerce.date().optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).optional(),
    costCenter: z.string().optional(),
    projectCode: z.string().optional(),
    requestedBudget: z.number().nonnegative().optional(),
    notes: z.string().optional(),
    businessJustification: z.string().optional(),
    paymentTerms: z.string().optional(),
    deliveryLocation: z.string().optional(),
    dispatchedThrough: z.string().max(200).optional(),
    otherReferences: z.string().max(300).optional(),
    termsOfDelivery: z.string().max(300).optional(),
    lines: z.array(z.object({
      productId: z.string().uuid().optional(),
      materialId: z.string().uuid().optional(),
      uomId: z.string().uuid(),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative().default(0),
      needDate: z.coerce.date()
    })).min(1).refine(lines => lines.every(l => Boolean(l.productId) || Boolean(l.materialId)), {
      message: "Each line must specify a product or material"
    })
  })
});

export const updatePoSchema = z.object({
  body: z.object({
    vendorId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    needDate: z.coerce.date().optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).optional(),
    costCenter: z.string().optional(),
    projectCode: z.string().optional(),
    requestedBudget: z.number().nonnegative().optional(),
    notes: z.string().optional(),
    businessJustification: z.string().optional(),
    paymentTerms: z.string().optional(),
    deliveryLocation: z.string().optional(),
    dispatchedThrough: z.string().max(200).optional(),
    otherReferences: z.string().max(300).optional(),
    termsOfDelivery: z.string().max(300).optional(),
    lines: z.array(z.object({
      id: z.string().uuid().optional(),
      productId: z.string().uuid().optional(),
      materialId: z.string().uuid().optional(),
      uomId: z.string().uuid(),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative().default(0),
      needDate: z.coerce.date()
    })).min(1).refine(lines => lines.every(l => Boolean(l.productId) || Boolean(l.materialId)), {
      message: "Each line must specify a product or material"
    }).optional()
  })
});
export type UpdatePoInput = z.infer<typeof updatePoSchema>;

export const approvePoSchema = z.object({
  body: z.object({
    reason: z.string().optional()
  })
});

export const requestChangesPoSchema = z.object({
  body: z.object({
    reason: z.string().min(1, "Reason is required for requesting changes")
  })
});
export type RequestChangesPoInput = z.infer<typeof requestChangesPoSchema>;

export const revisePoSchema = z.object({
  body: z.object({
    reason: z.string().optional(),
    lines: z.array(z.object({
      productId: z.string().uuid().optional(),
      materialId: z.string().uuid().optional(),
      uomId: z.string().uuid(),
      quantity: z.number().positive(),
      needDate: z.coerce.date()
    })).min(1).refine(lines => lines.every(l => Boolean(l.productId) || Boolean(l.materialId)), {
      message: "Each line must specify a product or material"
    })
  })
});

export const sendPoSchema = z.object({
  body: z.object({
    method: z.string().default('MANUAL')
  })
});

export const cancelPoSchema = z.object({
  body: z.object({
    reason: z.string().optional()
  })
});

export const updateExpectedReceiptSchema = z.object({
  body: z.object({
    status: z.enum(['PARTIALLY_RECEIVED', 'FULLY_RECEIVED'])
  })
});

// ==============================================================================
// MODULE 3 - GOODS RECEIPT / GRN VALIDATION SCHEMAS
// ==============================================================================

// Only the PO line reference is client-supplied - product/material/uom/expected quantity
// are always derived server-side from the actual PurchaseOrderLine, never trusted from input.
const grnLineFromPoSchema = z.object({
  poLineId: z.string().uuid(),
  receivedQuantity: z.number().nonnegative().optional()
});

export const createGrnFromPoSchema = z.object({
  body: z.object({
    poId: z.string().uuid(),
    // Optional: defaults to the actor's assigned location when omitted.
    locationId: z.string().uuid().optional(),
    lines: z.array(grnLineFromPoSchema).min(1)
  })
});

const grnLineUnreferencedSchema = z.object({
  productId: z.string().uuid().optional(),
  materialId: z.string().uuid().optional(),
  uomId: z.string().uuid(),
  receivedQuantity: z.number().nonnegative().optional()
}).refine(line => Boolean(line.productId) !== Boolean(line.materialId), {
  message: 'Each line must specify exactly one of productId or materialId'
});

// Distinct from createGrnFromPoSchema: an unreferenced shipment has no PO/PO line to
// validate against, so it requires an explicit justification instead.
export const createUnreferencedGrnSchema = z.object({
  body: z.object({
    vendorId: z.string().uuid(),
    // Optional: defaults to the actor's assigned location when omitted.
    locationId: z.string().uuid().optional(),
    justification: z.string().min(10, { message: 'Justification must explain why this shipment has no PO reference' }),
    lines: z.array(grnLineUnreferencedSchema).min(1)
  })
});

export const updateGrnSchema = z.object({
  body: z.object({
    lines: z.array(z.object({
      id: z.string().uuid(),
      receivedQuantity: z.number().nonnegative().optional(),
      acceptedQuantity: z.number().nonnegative().optional(),
      rejectedQuantity: z.number().nonnegative().optional(),
      damagedQuantity: z.number().nonnegative().optional(),
      invoiceUnitPrice: z.number().nonnegative().optional()
    })).optional()
  })
});

export const verifyGrnLinesSchema = z.object({
  body: z.object({
    lines: z.array(z.object({
      lineId: z.string().uuid(),
      receivedQuantity: z.number().nonnegative(),
      acceptedQuantity: z.number().nonnegative(),
      rejectedQuantity: z.number().nonnegative().default(0),
      damagedQuantity: z.number().nonnegative().default(0),
      invoiceUnitPrice: z.number().nonnegative().optional(),
      notes: z.string().trim().max(1000).optional()
    })).min(1),
    overallNotes: z.string().trim().max(2000).optional()
  })
});

export const notifyAccountantForDebitNoteSchema = z.object({
  body: z.object({
    reason: z.string().min(5, { message: 'A discrepancy explanation is required for the accountant' }).max(2000),
    reasonCategory: z.enum(['SHORTAGE', 'DAMAGE', 'REJECTION', 'PRICE_VARIANCE', 'OTHER']).default('SHORTAGE'),
    discrepancyIds: z.array(z.string().uuid()).optional(),
    responsiblePersonId: z.string().uuid().optional()
  })
});

export const recordMeasurementSchema = z.object({
  body: z.object({
    type: z.enum(['WEIGHT', 'PIECE', 'BUNDLE', 'PACKET']),
    value: z.number().positive(),
    // Recorded exactly as read (e.g. "kg", "pcs") - no unit conversion is performed (V-013).
    unitLabel: z.string().min(1),
    note: z.string().optional().nullable().transform((v) => (v && v.trim() ? v.trim() : undefined)),
    acceptedQuantity: z.number().nonnegative().optional(),
    rejectedQuantity: z.number().nonnegative().optional(),
    damagedQuantity: z.number().nonnegative().optional()
  })
});

// Distinct required field per resolution type: ACCEPT_EXCESS requires a justification,
// RETURN_TO_VENDOR requires a return reference - these are different authority levels
// and different evidence requirements, not interchangeable.
export const resolveDiscrepancySchema = z.object({
  body: z.discriminatedUnion('resolutionType', [
    z.object({
      resolutionType: z.literal('ACCEPT_EXCESS'),
      acceptanceJustification: z.string().min(10, { message: 'Accepting an excess requires a justification' })
    }),
    z.object({
      resolutionType: z.literal('RETURN_TO_VENDOR'),
      returnReference: z.string().min(1, { message: 'Returning to vendor requires a return reference' }),
      acceptanceJustification: z.string().min(10, { message: 'Add a brief resolution note' })
    })
  ])
});

export const signOffGrnSchema = z.object({
  body: z.object({
    note: z.string().optional()
  })
});

export const finalizeGrnSchema = z.object({
  body: z.object({
    note: z.string().optional()
  })
});

export const reprintLabelSchema = z.object({
  body: z.object({
    reason: z.string().optional()
  })
});

// ==============================================================================
// MODULE 4 - INVENTORY & STORE MANAGEMENT
// ==============================================================================

const stockOwnershipEnum = z.enum(['OWNED', 'VENDOR_HELD']);

const itemReferenceSchema = z.object({
  productId: z.string().uuid().optional(),
  materialId: z.string().uuid().optional()
});

export const createStockIssueSchema = z.object({
  body: itemReferenceSchema.extend({
    uomId: z.string().uuid(),
    locationId: z.string().uuid().optional(),
    ownership: stockOwnershipEnum.optional(),
    quantity: z.number().positive(),
    reason: z.string().min(3, { message: 'A reason is required for a stock issue.' })
  })
});

export const reverseStockIssueSchema = z.object({
  body: z.object({
    reason: z.string().min(3, { message: 'A reason is required to reverse a stock issue.' })
  })
});

export const createStockTransferSchema = z.object({
  body: itemReferenceSchema.extend({
    uomId: z.string().uuid(),
    fromLocationId: z.string().uuid(),
    toLocationId: z.string().uuid(),
    ownership: stockOwnershipEnum.optional(),
    requestedQuantity: z.number().positive(),
    note: z.string().optional()
  })
});

export const issueStockTransferSchema = z.object({
  body: z.object({
    quantity: z.number().positive()
  })
});

export const receiveStockTransferSchema = z.object({
  body: z.object({
    quantity: z.number().positive()
  })
});

export const createStockAdjustmentSchema = z.object({
  body: itemReferenceSchema.extend({
    uomId: z.string().uuid(),
    locationId: z.string().uuid().optional(),
    ownership: stockOwnershipEnum.optional(),
    direction: z.enum(['INCREASE', 'DECREASE']),
    quantity: z.number().positive(),
    reason: z.string().min(3, { message: 'A reason is required for a stock adjustment.' })
  })
});

export const reviewStockAdjustmentSchema = z.object({
  body: z.object({
    note: z.string().optional()
  })
});

export const rejectStockAdjustmentSchema = z.object({
  body: z.object({
    reason: z.string().min(3, { message: 'A reason is required to reject a stock adjustment.' })
  })
});

export const createStockReservationSchema = z.object({
  body: itemReferenceSchema.extend({
    uomId: z.string().uuid(),
    locationId: z.string().uuid().optional(),
    ownership: stockOwnershipEnum.optional(),
    quantity: z.number().positive(),
    reason: z.string().min(3, { message: 'A reason is required for a stock reservation.' }),
    sourceReference: z.string().optional()
  })
});

export const stockBalanceQuerySchema = z.object({
  query: z.object({
    productId: z.string().uuid().optional(),
    materialId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    ownership: stockOwnershipEnum.optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional()
  })
});

export const stockLedgerQuerySchema = z.object({
  query: z.object({
    productId: z.string().uuid().optional(),
    materialId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    entryType: z.string().optional(),
    postedFrom: z.string().datetime().optional(),
    postedTo: z.string().datetime().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional()
  })
});

// ==============================================================================
// MODULE 5 - BILL OF MATERIALS (BOM) & FORMULAS
// ==============================================================================

export const bomLineTypeEnum = z.enum(['COMPONENT', 'PACKAGING']);
export const bomQuantityModeEnum = z.enum(['FIXED', 'SCALED']);
export const bomRoundingRuleEnum = z.enum(['NONE', 'ROUND_UP', 'ROUND_DOWN', 'ROUND_NEAREST']);

export const bomLineInputSchema = z.object({
  lineType: bomLineTypeEnum.default('COMPONENT'),
  materialId: z.string().uuid().optional().nullable(),
  componentProductId: z.string().uuid().optional().nullable(),
  uomId: z.string().uuid('Valid Unit of Measure ID is required'),
  quantityMode: bomQuantityModeEnum.default('SCALED'),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  unitCost: z.coerce.number().nonnegative().optional().nullable(),
  roundingRule: bomRoundingRuleEnum.default('NONE').optional(),
  roundingPrecision: z.number().int().min(0).max(6).optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  sequence: z.number().int().optional(),
  note: z.string().max(500).optional().nullable()
}).refine((line) => Boolean(line.materialId) !== Boolean(line.componentProductId), {
  message: 'Each BOM line must reference either a materialId or a componentProductId, but not both.'
});

export const createBomDraftSchema = z.object({
  body: z.object({
    productId: z.string().uuid().optional(),
    materialId: z.string().uuid().optional(),
    productVariantId: z.string().uuid().optional().nullable(),
    copyFromVersionId: z.string().uuid().optional().nullable(),
    updateVersionId: z.string().uuid().optional(),
    bomNumber: z.string().min(1).max(100).optional().nullable(),
    note: z.string().max(2000).optional().nullable(),
    lines: z.array(bomLineInputSchema).optional()
  }).refine((value) => Boolean(value.productId) !== Boolean(value.materialId), {
    message: 'A BOM must belong to exactly one product or material.',
  })
});

export const updateBomDraftSchema = z.object({
  body: z.object({
    bomNumber: z.string().trim().min(1).max(100).optional(),
    note: z.string().max(2000).optional().nullable(),
    effectiveDate: z.coerce.date().optional().nullable(),
    lines: z.array(bomLineInputSchema).optional()
  })
});

export const validateBomVersionSchema = z.object({
  body: z.object({
    remarks: z.string().max(500).optional()
  }).default({})
});

export const approveBomVersionSchema = z.object({
  body: z.object({
    remarks: z.string().max(500).optional()
  }).default({})
});

export const supersedeBomVersionSchema = z.object({
  body: z.object({
    replacementVersionId: z.string().uuid().optional(),
    remarks: z.string().max(500).optional()
  }).default({})
});

export const createGoldenExampleSchema = z.object({
  body: z.object({
    label: z.string().min(1, 'Label is required').max(150),
    inputQuantity: z.number().positive('Input quantity must be positive'),
    inputUomId: z.string().uuid('Valid input UOM ID is required'),
    sourceReference: z.string().max(200).default('TEST_BENCH'),
    expectedResults: z.array(z.object({
      bomLineId: z.string().uuid(),
      expectedQuantity: z.number().positive(),
      uomId: z.string().uuid(),
      note: z.string().max(500).optional()
    })).min(1, 'At least one expected result line is required')
  })
});

export const simulateBomSchema = z.object({
  body: z.object({
    requestedQuantity: z.number().positive('Requested quantity must be positive'),
    requestedUomId: z.string().uuid('Valid requested UOM ID is required')
  })
});

// ============================================================================
// MODULE 6 - PRODUCTION PLANNING & EXECUTION
// ============================================================================
export const productionPlanQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().optional(),
    status: z.string().optional(),
    scheduleType: z.string().trim().optional(),
    productId: z.string().uuid().optional(),
    scheduleDateFrom: z.string().datetime().optional(),
    scheduleDateTo: z.string().datetime().optional()
  })
});

export const createProductionPlanSchema = z.object({
  body: z.object({
    scheduleDate: z.coerce.date(), productId: z.string().uuid(), bomVersionId: z.string().uuid(),
    productVariantId: z.string().uuid().nullable().optional(), quantityUomId: z.string().uuid().optional(),
    // Inventory is unified; the API resolves the single active internal
    // location automatically when the client does not provide one.
    targetLocationId: z.string().uuid().nullable().optional(), targetDepartmentId: z.string().uuid().nullable().optional(), routeId: z.string().uuid().nullable().optional(),
    quantity: z.coerce.number().positive(), bufferQuantity: z.coerce.number().min(0).default(0), scheduleType: z.string().trim().min(1).max(40),
    priority: z.coerce.number().int().min(0).max(100).default(0), ownerId: z.string().uuid().nullable().optional(), incharge: z.string().trim().max(120).optional(), notes: z.string().max(2000).optional(),
    sourceReferenceType: z.string().max(80).nullable().optional(), sourceReferenceId: z.string().max(120).nullable().optional(), plannedStartAt: z.coerce.date().nullable().optional(), plannedEndAt: z.coerce.date().nullable().optional(),
    saveAsDraft: z.boolean().optional()
  })
});
export const checkProductionPlanAvailabilitySchema = z.object({
  body: z.object({
    scheduleDate: z.coerce.date(),
    productId: z.string().uuid(),
    quantityUomId: z.string().uuid().optional(),
    quantity: z.coerce.number().positive(),
    lines: z.array(z.object({
      itemType: z.enum(['MATERIAL', 'PRODUCT']),
      itemId: z.string().uuid(),
      parentItemId: z.string().uuid().optional(),
      uomId: z.string().uuid(),
      quantity: z.coerce.number().positive(),
      quantityMode: z.enum(['FIXED', 'SCALED']).optional(),
      roundingRule: z.enum(['NONE', 'ROUND_UP', 'ROUND_DOWN', 'ROUND_NEAREST']).optional(),
      roundingPrecision: z.coerce.number().int().min(0).max(8).nullable().optional()
    })).min(1)
  })
});
export const updateProductionPlanSchema = z.object({
  body: z.object({
    scheduleDate: z.coerce.date().optional(),
    productId: z.string().uuid().optional(),
    bomVersionId: z.string().uuid().optional(),
    productVariantId: z.string().uuid().nullable().optional(),
    quantityUomId: z.string().uuid().optional(),
    targetLocationId: z.string().uuid().optional(),
    targetDepartmentId: z.string().uuid().nullable().optional(),
    routeId: z.string().uuid().nullable().optional(),
    quantity: z.coerce.number().positive().optional(),
    bufferQuantity: z.coerce.number().min(0).optional(),
    scheduleType: z.string().trim().min(1).max(40).optional(),
    priority: z.coerce.number().int().min(0).max(100).optional(),
    ownerId: z.string().uuid().nullable().optional(),
    incharge: z.string().trim().max(120).optional(),
    notes: z.string().max(2000).optional(),
    submitDraft: z.boolean().optional(),
    sourceReferenceType: z.string().max(80).nullable().optional(),
    sourceReferenceId: z.string().max(120).nullable().optional(),
    plannedStartAt: z.coerce.date().nullable().optional(),
    plannedEndAt: z.coerce.date().nullable().optional()
  })
});
export const productionReasonSchema = z.object({ body: z.object({ reason: z.string().trim().min(1).max(500).optional() }).default({}) });
export const productionMaterialIssueSchema = z.object({
  body: z.object({
    requirementId: z.string().uuid(),
    quantity: z.coerce.number().positive(),
    locationId: z.string().uuid().optional(),
    lotId: z.string().uuid().nullable().optional(),
    reason: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().trim().min(8).max(120).optional()
  })
});
export const productionOutputSchema = z.object({
  body: z.object({
    quantity: z.coerce.number().positive(),
    rejectedQuantity: z.coerce.number().min(0).default(0),
    damagedQuantity: z.coerce.number().min(0).default(0),
    uomId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    lotId: z.string().uuid().nullable().optional(),
    note: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().trim().min(8).max(120).optional()
  })
});

// ============================================================================
// MODULE 8 - DEPARTMENT-WISE EXECUTION & SHOP-FLOOR TRACKING
// ============================================================================

export const batchExecutionStatusEnum = z.enum([
  'AWAITING_RECEIPT',
  'RECEIVED',
  'ASSIGNED',
  'IN_PROGRESS',
  'PAUSED',
  'PARTIAL',
  'COMPLETE',
  'REWORK',
  'REJECTED',
  'HANDOVER_PENDING',
  'NEXT_STAGE_ACCEPTED'
]);

export const progressEventTypeEnum = z.enum([
  'STARTED',
  'PAUSED',
  'RESUMED',
  'PARTIAL_RECORDED',
  'COMPLETED'
]);

export const exceptionRecordTypeEnum = z.enum([
  'REJECTION',
  'SCRAP',
  'WASTAGE',
  'PENDING',
  'INTERRUPTION'
]);

export const handoverStatusEnum = z.enum([
  'PROPOSED',
  'ACCEPTED',
  'REFUSED'
]);

export const departmentQueueQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    status: batchExecutionStatusEnum.optional(),
    search: z.string().trim().optional()
  })
});

export const receiveBatchSchema = z.object({
  body: z.object({
    materialIssueId: z.string().uuid().optional(),
    notes: z.string().trim().max(500).optional()
  }).default({})
});

export const assignWorkerSchema = z.object({
  body: z.object({
    employeeId: z.string().uuid('Valid Employee ID is required'),
    subtaskDescription: z.string().trim().max(500).optional()
  })
});

export const startBatchSchema = z.object({
  body: z.object({
    employeeId: z.string().uuid('Employee attribution is required'),
    notes: z.string().trim().max(500).optional()
  })
});

export const pauseBatchSchema = z.object({
  body: z.object({
    employeeId: z.string().uuid('Employee attribution is required'),
    reason: z.string().trim().min(1, 'Interruption reason is mandatory').max(500)
  })
});

export const resumeBatchSchema = z.object({
  body: z.object({
    employeeId: z.string().uuid('Employee attribution is required'),
    notes: z.string().trim().max(500).optional()
  })
});

export const recordProgressSchema = z.object({
  body: z.object({
    employeeId: z.string().uuid('Employee attribution is required'),
    quantityDelta: z.coerce.number().optional(),
    eventType: z.string().optional(),
    completed_qty: z.coerce.number().min(0).optional(),
    rejected_qty: z.coerce.number().min(0).optional(),
    scrap_qty: z.coerce.number().min(0).optional(),
    wastage_qty: z.coerce.number().min(0).optional(),
    pending_qty: z.coerce.number().min(0).optional(),
    notes: z.string().trim().max(500).optional()
  })
});

export const recordExceptionSchema = z.object({
  body: z.object({
    employeeId: z.string().uuid('Employee attribution is required'),
    type: exceptionRecordTypeEnum,
    quantity: z.coerce.number().positive('Quantity must be greater than 0'),
    reason: z.string().trim().min(1, 'Reason is mandatory').max(500)
  })
});

export const completeBatchSchema = z.object({
  body: z.object({
    employeeId: z.string().uuid('Employee attribution is required'),
    completed_qty: z.coerce.number().min(0).optional(),
    rejected_qty: z.coerce.number().min(0).optional(),
    scrap_qty: z.coerce.number().min(0).optional(),
    wastage_qty: z.coerce.number().min(0).optional(),
    pending_qty: z.coerce.number().min(0).optional(),
    notes: z.string().trim().max(500).optional()
  })
});

export const proposeHandoverSchema = z.object({
  body: z.object({
    quantity: z.coerce.number().positive('Handover quantity must be greater than 0'),
    incomingDepartmentId: z.string().uuid('Target Department ID is required'),
    idempotencyKey: z.string().trim().min(8).max(120),
    notes: z.string().trim().max(500).optional()
  })
});

export const decideHandoverSchema = z.object({
  body: z.object({
    status: z.enum(['ACCEPTED', 'REFUSED']),
    refusalReason: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().trim().min(8).max(120).optional(),
    notes: z.string().trim().max(500).optional()
  }).refine(data => data.status !== 'REFUSED' || (data.refusalReason && data.refusalReason.length > 0), {
    message: 'Refusal reason is mandatory when refusing a handover',
    path: ['refusalReason']
  })
});

export const managerialOverrideSchema = z.object({
  body: z.object({
    action: z.enum(['FORCE_ACCEPT_HANDOVER', 'REASSIGN_DEPARTMENT', 'OVERRIDE_STATUS']),
    targetDepartmentId: z.string().uuid().optional(),
    targetStatus: batchExecutionStatusEnum.optional(),
    reason: z.string().trim().min(5, 'A detailed override reason of at least 5 characters is required').max(500)
  })
});

export const postToInventorySchema = z.object({
  body: z.object({
    quantity: z.coerce.number().positive('Quantity to post must be greater than 0'),
    locationId: z.string().uuid().optional(),
    notes: z.string().trim().max(500).optional()
  })
});

// ==============================================================================
// MODULE 18 - ACCOUNTS / TALLY INTEGRATION VALIDATION SCHEMAS
// ==============================================================================

export const transactionSourceTypeEnum = z.enum([
  'PURCHASE_ORDER',
  'SALES_INVOICE',
  'DEBIT_NOTE',
  'JOB_WORK',
  'RETURN',
  'INVENTORY_COGS'
]);

export const integrationJobStatusEnum = z.enum([
  'QUEUED',
  'IN_PROGRESS',
  'COMPLETED',
  'PARTIALLY_FAILED',
  'FAILED',
  'CANCELLED'
]);

export const integrationJobItemStatusEnum = z.enum([
  'ELIGIBLE',
  'QUEUED',
  'EXPORTED',
  'SENT',
  'ACKNOWLEDGED',
  'RECONCILED',
  'FAILED',
  'INVESTIGATED',
  'CORRECTED',
  'RETRIED',
  'REJECTED',
  'HELD'
]);

export const internalReconciliationStatusEnum = z.enum([
  'INTERNALLY_CONSISTENT',
  'VARIANCE_FLAGGED',
  'DUPLICATE_FLAGGED',
  'MANUALLY_RESOLVED'
]);

// Mapping Configuration Schemas
export const createMappingConfigSchema = z.object({
  body: z.object({
    sourceType: transactionSourceTypeEnum,
    version: z.number().int().positive().default(1),
    fieldMapping: z.record(z.unknown()),
    effectiveFrom: z.coerce.date().default(() => new Date()),
    effectiveTo: z.coerce.date().optional().nullable()
  })
});

export const approveMappingConfigSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid Mapping Configuration ID is required')
  })
});

export const queryMappingConfigSchema = z.object({
  query: z.object({
    sourceType: transactionSourceTypeEnum.optional(),
    status: lifecycleStatusEnum.optional()
  })
});

// Eligibility & Queue Schemas
export const checkEligibilityQuerySchema = z.object({
  query: z.object({
    sourceType: transactionSourceTypeEnum
  })
});

export const queueTransactionsSchema = z.object({
  body: z.object({
    sourceType: transactionSourceTypeEnum,
    sourceIds: z.array(z.string().uuid()).min(1, 'At least one source ID must be provided')
  })
});

// Export Batch Schema
export const triggerExportBatchSchema = z.object({
  body: z.object({
    jobId: z.string().uuid('Valid Job ID is required')
  })
});

// Manual Finance Acknowledgement Schema
export const acknowledgeJobItemSchema = z.object({
  params: z.object({
    itemId: z.string().uuid('Valid Job Item ID is required')
  }),
  body: z.object({
    externalReference: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(500).optional()
  })
});

// Internal Reconciliation Schema
export const reconcileJobItemSchema = z.object({
  params: z.object({
    itemId: z.string().uuid('Valid Job Item ID is required')
  }),
  body: z.object({
    resolutionNotes: z.string().trim().max(1000).optional()
  })
});

// Error & Retry Schema
export const investigateAndRetrySchema = z.object({
  params: z.object({
    itemId: z.string().uuid('Valid Job Item ID is required')
  }),
  body: z.object({
    action: z.enum(['RETRY', 'REJECT', 'HOLD']),
    reason: z.string().trim().min(5, 'Reason of at least 5 characters is required').max(500)
  })
});

// Job & Item Query Schemas
export const queryJobsSchema = z.object({
  query: z.object({
    sourceType: transactionSourceTypeEnum.optional(),
    status: integrationJobStatusEnum.optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
});

export const queryJobItemsSchema = z.object({
  query: z.object({
    jobId: z.string().uuid().optional(),
    sourceType: transactionSourceTypeEnum.optional(),
    status: integrationJobItemStatusEnum.optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
});

// ============================================================================
// MODULE 9 - WIP & BATCH TRACKING
// ============================================================================

export const wipExceptionTypeEnum = z.enum([
  'DOUBLE_PRESENCE',
  'NEGATIVE_QUANTITY',
  'BROKEN_GENEALOGY_CHAIN',
  'CONSERVATION_MISMATCH',
  'INVALID_STAGE_TRANSITION'
]);

export const wipExceptionStatusEnum = z.enum([
  'OPEN',
  'INVESTIGATING',
  'RESOLVED',
  'DISMISSED'
]);

export const wipExceptionSeverityEnum = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
]);

export const wipOverviewQuerySchema = z.object({
  query: z.object({
    departmentId: z.string().uuid().optional(),
    productionPlanId: z.string().uuid().optional()
  }).optional()
});

export const wipBatchQuerySchema = z.object({
  query: z.object({
    departmentId: z.string().uuid().optional(),
    productionPlanId: z.string().uuid().optional(),
    status: batchExecutionStatusEnum.optional(),
    search: z.string().trim().optional(),
    workCenterId: z.string().uuid().optional(),
    stageSequenceNumber: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional()
  }).optional()
});

export const wipDepartmentQueueQuerySchema = z.object({
  params: z.object({
    departmentId: z.string().uuid('Valid Department ID is required')
  }),
  query: z.object({
    status: batchExecutionStatusEnum.optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  }).optional()
});

export const wipTimingQuerySchema = z.object({
  query: z.object({
    departmentId: z.string().uuid().optional(),
    productionPlanId: z.string().uuid().optional(),
    batchId: z.string().uuid().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  }).optional()
});

export const wipBatchParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid Batch ID is required')
  })
});

export const runReconciliationSchema = z.object({
  body: z.object({
    productionPlanId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    batchId: z.string().uuid().optional()
  }).optional()
});

export const wipExceptionQuerySchema = z.object({
  query: z.object({
    batchId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    productionPlanId: z.string().uuid().optional(),
    exceptionType: wipExceptionTypeEnum.optional(),
    severity: wipExceptionSeverityEnum.optional(),
    status: wipExceptionStatusEnum.optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  }).optional()
});

export const wipExceptionParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid Exception ID is required')
  })
});

export const investigateExceptionSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid Exception ID is required')
  }),
  body: z.object({
    investigationNotes: z.string().trim().max(2000).optional()
  }).optional()
});

export const resolveExceptionSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid Exception ID is required')
  }),
  body: z.object({
    resolutionNotes: z.string().trim().min(3, 'Resolution notes are required').max(2000)
  })
});

export const dismissExceptionSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid Exception ID is required')
  }),
  body: z.object({
    resolutionNotes: z.string().trim().min(3, 'Dismissal reason/notes are required').max(2000)
  })
});

// ==============================================================================
// MODULE 7 - MATERIAL ISSUE
// ==============================================================================

export const requestMaterialIssueSchema = z.object({
  body: z.object({
    productionPlanId: z.string().uuid(),
    locationId: z.string().uuid().optional(),
    note: z.string().optional()
  })
});

export const emptyMaterialIssueActionSchema = z.object({
  body: z.object({}).optional()
});

export const cancelMaterialIssueSchema = z.object({
  body: z.object({
    reason: z.string().optional()
  })
});

export const requestMaterialIssueReturnSchema = z.object({
  body: z.object({
    materialIssueLineId: z.string().uuid(),
    returnType: z.enum(['UNUSED_RETURN', 'DAMAGED_REPLACEMENT']),
    quantity: z.number().positive(),
    reason: z.string().optional()
  })
});

// ==============================================================================
// MODULE 10 - QUALITY MANAGEMENT & INSPECTION ENGINE
// ==============================================================================

export const qcCheckpointEnum = z.enum([
  'INCOMING_MATERIAL',
  'IN_PROCESS',
  'INTERMEDIATE',
  'ASSEMBLY',
  'PRE_FG',
  'FINAL_FG'
]);

export const inspectionResultStatusEnum = z.enum([
  'PASS',
  'FAIL',
  'REWORK',
  'REJECT_SCRAP',
  'RE_INSPECTION'
]);

export const correctiveActionStatusEnum = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'VERIFIED',
  'CANCELLED'
]);

export const qcQueueQuerySchema = z.object({
  query: z.object({
    checkpointType: qcCheckpointEnum.optional(),
    targetType: z.enum(['BATCH', 'GRN_LINE', 'ALL']).optional(),
    departmentId: z.string().uuid().optional(),
    requiresInspectionOnly: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
    page: z.string().optional().transform(v => (v ? parseInt(v, 10) : 1)),
    limit: z.string().optional().transform(v => (v ? parseInt(v, 10) : 50))
  }).optional()
});

export const resolveCheckpointsQuerySchema = z.object({
  query: z.object({
    targetType: z.enum(['BATCH', 'GRN_LINE']),
    targetId: z.string().uuid()
  })
});

export const recordInspectionSchema = z.object({
  body: z.object({
    checkpointType: qcCheckpointEnum,
    targetType: z.enum(['BATCH', 'GRN_LINE']),
    targetId: z.string().uuid(),
    inspectorEmployeeId: z.string().uuid('Valid Employee ID is required for inspector'),
    qcRuleId: z.string().uuid().optional().nullable(),
    sampledQuantity: z.number().positive('Sampled quantity must be greater than 0'),
    defectiveQuantity: z.number().min(0, 'Defective quantity cannot be negative').default(0),
    status: inspectionResultStatusEnum,
    reason: z.string().trim().optional().nullable(),
    findings: z.record(z.unknown()).optional().nullable(),
    evidenceAttachmentUrls: z.array(z.string().url('Must be a valid URL')).default([]),
    // For REWORK disposition:
    targetReworkStageId: z.string().uuid().optional().nullable(),
    correctiveActionDescription: z.string().trim().optional().nullable(),
    assignedEmployeeId: z.string().uuid().optional().nullable(),
    // For REJECT_SCRAP disposition on batch:
    exceptionType: z.enum(['REJECTION', 'SCRAP']).optional().default('REJECTION')
  }).superRefine((data, ctx) => {
    if (data.status !== 'PASS') {
      if (!data.reason || data.reason.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Reason is strictly required for any non-PASS inspection result',
          path: ['reason']
        });
      }
    }
    if (data.defectiveQuantity > data.sampledQuantity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Defective quantity cannot exceed sampled quantity',
        path: ['defectiveQuantity']
      });
    }
    if (data.status === 'REWORK') {
      if (!data.correctiveActionDescription || data.correctiveActionDescription.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Corrective action description is required for REWORK disposition',
          path: ['correctiveActionDescription']
        });
      }
    }
  })
});

export const reinspectInspectionSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid Inspection Result ID is required')
  }),
  body: z.object({
    inspectorEmployeeId: z.string().uuid('Valid Employee ID is required for inspector'),
    sampledQuantity: z.number().positive('Sampled quantity must be greater than 0'),
    defectiveQuantity: z.number().min(0, 'Defective quantity cannot be negative').default(0),
    status: inspectionResultStatusEnum,
    reason: z.string().trim().optional().nullable(),
    findings: z.record(z.unknown()).optional().nullable(),
    evidenceAttachmentUrls: z.array(z.string().url('Must be a valid URL')).default([])
  }).superRefine((data, ctx) => {
    if (data.status !== 'PASS' && (!data.reason || data.reason.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Reason is strictly required for any non-PASS re-inspection result',
        path: ['reason']
      });
    }
  })
});

export const createCorrectiveActionSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid Inspection Result ID is required')
  }),
  body: z.object({
    actionDescription: z.string().trim().min(3, 'Action description is required'),
    assignedEmployeeId: z.string().uuid().optional().nullable(),
    targetReworkStageId: z.string().uuid().optional().nullable(),
    status: correctiveActionStatusEnum.optional().default('OPEN')
  })
});

export const updateCorrectiveActionSchema = z.object({
  params: z.object({
    actionId: z.string().uuid('Valid Corrective Action ID is required')
  }),
  body: z.object({
    status: correctiveActionStatusEnum.optional(),
    resolutionNotes: z.string().trim().max(2000).optional().nullable(),
    assignedEmployeeId: z.string().uuid().optional().nullable()
  })
});

export const batchQualityHistoryParamSchema = z.object({
  params: z.object({
    batchId: z.string().uuid('Valid Batch ID is required')
  })
});

export const grnLineQualityHistoryParamSchema = z.object({
  params: z.object({
    grnLineId: z.string().uuid('Valid GRN Line ID is required')
  })
});

export const createQcRuleRequestSchema = z.object({
  body: z.object({
    code: z.string().trim().min(2, 'Code is required'),
    name: z.string().trim().min(2, 'Name is required'),
    description: z.string().trim().optional().nullable(),
    targetType: z.string().trim().min(1, 'Target type is required (e.g. PRODUCT, MATERIAL, WORK_CENTER)'),
    targetId: z.string().uuid().optional().nullable(),
    parameters: z.record(z.unknown()),
    effectiveFrom: z.string().datetime({ message: 'Valid effectiveFrom ISO date is required' }),
    effectiveTo: z.string().datetime().optional().nullable()
  })
});

export const approveQcRuleSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid QC Rule ID is required')
  })
});

export const qcOverrideSchema = z.object({
  body: z.object({
    checkpointType: qcCheckpointEnum,
    targetType: z.enum(['BATCH', 'GRN_LINE']),
    targetId: z.string().uuid(),
    overrideReason: z.string().trim().min(5, 'A comprehensive override reason is required (min 5 chars)'),
    sampledQuantity: z.number().positive().default(1)
  })
});

export const releaseGateCheckQuerySchema = z.object({
  query: z.object({
    targetType: z.enum(['BATCH', 'GRN_LINE']),
    targetId: z.string().uuid()
  })
});

// ==============================================================================
// MODULE 11 - LOSS, DAMAGE & WASTE MANAGEMENT SCHEMAS
// ==============================================================================

export const lossSourceTypeEnum = z.enum([
  'DEPARTMENT_EXECUTION_EXCEPTION',
  'GRN_DISCREPANCY',
  'QC_REJECTION_NO_BATCH',
  'MANUAL_REPORT'
]);

export const lossClassificationEnum = z.enum([
  'WITHIN_TOLERANCE',
  'ABNORMAL'
]);

export const lossEventStatusEnum = z.enum([
  'REPORTED',
  'REVIEWED',
  'APPROVED',
  'REJECTED',
  'INVESTIGATED',
  'POSTED',
  'REPLACED'
]);

export const createLossEventSchema = z.object({
  body: z.object({
    sourceType: lossSourceTypeEnum,
    sourceExceptionRecordId: z.string().uuid().optional().nullable(),
    sourceDiscrepancyId: z.string().uuid().optional().nullable(),
    sourceInspectionResultId: z.string().uuid().optional().nullable(),
    materialId: z.string().uuid().optional().nullable(),
    productId: z.string().uuid().optional().nullable(),
    uomId: z.string().uuid('Valid UOM ID is required'),
    locationId: z.string().uuid().optional().nullable(),
    departmentId: z.string().uuid().optional().nullable(),
    quantity: z.number().positive('Quantity must be positive'),
    reason: z.string().trim().min(3, 'Reason is required (min 3 chars)')
  }).refine(data => Boolean(data.materialId) !== Boolean(data.productId), {
    message: 'Loss event must reference exactly one of materialId or productId'
  }).refine(data => {
    if (data.sourceType === 'DEPARTMENT_EXECUTION_EXCEPTION') return Boolean(data.sourceExceptionRecordId);
    if (data.sourceType === 'GRN_DISCREPANCY') return Boolean(data.sourceDiscrepancyId);
    if (data.sourceType === 'QC_REJECTION_NO_BATCH') return Boolean(data.sourceInspectionResultId);
    return true;
  }, {
    message: 'Source reference ID matching sourceType must be provided'
  })
});

export const classifyLossEventSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid Loss Event ID is required')
  }),
  body: z.object({
    basisQuantity: z.number().positive().optional()
  }).optional()
});

export const reviewLossEventSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid Loss Event ID is required')
  }),
  body: z.object({
    reviewNotes: z.string().trim().max(2000).optional().nullable()
  })
});

export const approveLossEventSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid Loss Event ID is required')
  })
});

export const rejectLossEventSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid Loss Event ID is required')
  }),
  body: z.object({
    rejectionReason: z.string().trim().min(3, 'Rejection reason is required (min 3 chars)'),
    rejectedQuantity: z.number().positive('Rejected quantity must be positive').optional()
  })
});

export const investigateLossEventSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid Loss Event ID is required')
  }),
  body: z.object({
    investigationNotes: z.string().trim().min(5, 'Investigation notes are required (min 5 chars)')
  })
});

export const postLossEventStockEffectSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid Loss Event ID is required')
  })
});

export const createReplacementChallanSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid Loss Event ID is required')
  }),
  body: z.object({
    dispatchLocationId: z.string().uuid('Valid dispatch location ID is required'),
    targetDepartmentId: z.string().uuid().optional().nullable(),
    targetVendorId: z.string().uuid().optional().nullable(),
    replacementQuantity: z.number().positive('Replacement quantity must be positive').optional(),
    rejectedQuantity: z.number().min(0, 'Rejected quantity must be non-negative').optional(),
    rejectionReason: z.string().trim().optional(),
    notes: z.string().trim().max(1000).optional().nullable()
  })
});

export const acknowledgeReplacementChallanSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid Replacement Challan ID is required')
  })
});

export const lossEventQuerySchema = z.object({
  query: z.object({
    sourceType: lossSourceTypeEnum.optional(),
    classification: lossClassificationEnum.optional(),
    status: lossEventStatusEnum.optional(),
    departmentId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    materialId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    search: z.string().trim().optional(),
    skip: z.coerce.number().int().nonnegative().default(0),
    take: z.coerce.number().int().positive().max(100).default(50)
  })
});

export const lossAnalyticsQuerySchema = z.object({
  query: z.object({
    departmentId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional()
  })
});

export const lossEventParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid Loss Event ID is required')
  })
});

// ==============================================================================
// MODULE 12 - ASSEMBLY & CONVERGENCE SCHEMAS
// ==============================================================================

export const assemblyBatchStatusEnum = z.enum([
  'PLANNED',
  'ALLOCATED',
  'IN_ASSEMBLY',
  'PARTIAL',
  'COMPLETE',
  'QC_PENDING',
  'PASSED_TO_FG',
  'REWORK',
  'REJECTED'
]);

export const assemblyComponentTypeEnum = z.enum([
  'BATCH_SOURCED',
  'ISSUE_LINE_SOURCED'
]);

export const planAssemblyBatchSchema = z.object({
  body: z.object({
    productId: z.string().uuid('Valid product ID is required'),
    productVariantId: z.string().uuid().optional().nullable(),
    productionPlanId: z.string().uuid().optional().nullable(),
    bomVersionId: z.string().uuid('Valid BOM version ID is required'),
    productRouteId: z.string().uuid().optional().nullable(),
    targetOutputQuantity: z.number().positive('Target output quantity must be > 0'),
    plannedStartDate: z.string().datetime().optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable()
  })
});

export const allocateAssemblyComponentsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid assembly batch ID is required')
  }),
  body: z.object({
    allocations: z.array(
      z.object({
        bomLineId: z.string().uuid().optional().nullable(),
        componentType: assemblyComponentTypeEnum,
        sourceBatchId: z.string().uuid().optional().nullable(),
        materialIssueLineId: z.string().uuid().optional().nullable(),
        uomId: z.string().uuid('Valid UOM ID is required'),
        unitRatio: z.number().positive('Unit ratio must be > 0'),
        requiredQuantity: z.number().positive('Required quantity must be > 0')
      })
    ).min(1, 'At least one component must be allocated')
  })
});

export const startAssemblyBatchSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid assembly batch ID is required')
  }),
  body: z.object({
    actualStartDate: z.string().datetime().optional()
  }).optional().default({})
});

export const recordAssemblyWorkerAssignmentSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid assembly batch ID is required')
  }),
  body: z.object({
    employeeId: z.string().uuid('Valid employee ID is required'),
    subtaskDescription: z.string().trim().max(500).optional().nullable()
  })
});

export const recordAssemblyProgressSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid assembly batch ID is required')
  }),
  body: z.object({
    employeeId: z.string().uuid('Valid employee ID is required'),
    eventType: z.enum(['STARTED', 'PAUSED', 'RESUMED', 'PARTIAL_RECORDED', 'COMPLETED']),
    quantityDelta: z.number().default(0),
    notes: z.string().trim().max(500).optional().nullable()
  })
});

export const completeAssemblyBatchSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid assembly batch ID is required')
  }),
  body: z.object({
    actualOutputQuantity: z.number().positive('Actual output quantity must be > 0'),
    scrapQuantity: z.number().min(0).default(0),
    idempotencyKey: z.string().trim().min(1, 'Idempotency key is required'),
    componentConsumptions: z.array(
      z.object({
        componentId: z.string().uuid('Valid component ID is required'),
        consumedQuantity: z.number().min(0, 'Consumed quantity must be >= 0'),
        scrapQuantity: z.number().min(0).default(0)
      })
    ).min(1, 'At least one component consumption is required'),
    notes: z.string().trim().max(1000).optional().nullable()
  })
});

export const qcDispositionAssemblyBatchSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid assembly batch ID is required')
  }),
  body: z.object({
    disposition: z.enum(['PASSED_TO_FG', 'REWORK', 'REJECTED']),
    inspectionNotes: z.string().trim().max(1000).optional().nullable(),
    rejectionReason: z.string().trim().max(500).optional().nullable(),
    defectTypeId: z.string().uuid().optional().nullable(),
    locationId: z.string().uuid().optional().nullable(),
    costImpact: z.number().min(0).optional().nullable()
  })
});

export const assemblyBatchQuerySchema = z.object({
  query: z.object({
    productId: z.string().uuid().optional(),
    productionPlanId: z.string().uuid().optional(),
    status: assemblyBatchStatusEnum.optional(),
    skip: z.coerce.number().int().nonnegative().default(0),
    take: z.coerce.number().int().positive().max(100).default(50)
  })
});

export const assemblyBatchParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid assembly batch ID is required')
  })
});

// ==============================================================================
// MODULE 13 - FINISHED GOODS (FG) RECEIVING VALIDATION SCHEMAS
// ==============================================================================

export const fgPackagingStatusEnum = z.enum(['NOT_PACKED', 'PACKED', 'READY_FOR_DISPATCH']);
export const fgReceiptStatusEnum = z.enum(['RECEIVED', 'HELD', 'RELEASED', 'CANCELLED']);

export const createFgReadyOutputSchema = z.object({
  body: z.object({
    assemblyBatchId: z.string().uuid('Valid assembly batch ID is required').optional().nullable(),
    productId: z.string().uuid('Valid product ID is required'),
    productVariantId: z.string().uuid().optional().nullable(),
    quantity: z.number().positive('Quantity must be > 0'),
    uomId: z.string().uuid('Valid UOM ID is required'),
    qcInspectionResultId: z.string().uuid().optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable()
  })
});

export const updateFgPackagingSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid output ID is required')
  }),
  body: z.object({
    status: fgPackagingStatusEnum,
    packNotes: z.string().trim().max(1000).optional().nullable(),
    stagedLocationId: z.string().uuid().optional().nullable()
  })
});

export const createFgReceiptSchema = z.object({
  body: z.object({
    fgReadyOutputId: z.string().uuid('Valid ready output ID is required'),
    locationId: z.string().uuid('Valid warehouse location ID is required'),
    notes: z.string().trim().max(1000).optional().nullable()
  })
});

export const holdFgReceiptSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid FG receipt ID is required')
  }),
  body: z.object({
    reason: z.string().trim().min(3, 'Hold reason must be at least 3 characters').max(500)
  })
});

export const releaseFgReceiptSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid FG receipt ID is required')
  }),
  body: z.object({
    releaseNotes: z.string().trim().max(500).optional().nullable()
  })
});

export const fgReadyOutputQuerySchema = z.object({
  query: z.object({
    productId: z.string().uuid().optional(),
    isReadyOnly: z.enum(['true', 'false']).optional(),
    skip: z.coerce.number().int().nonnegative().default(0),
    take: z.coerce.number().int().positive().max(100).default(50)
  })
});

export const fgReceiptQuerySchema = z.object({
  query: z.object({
    productId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    status: fgReceiptStatusEnum.optional(),
    skip: z.coerce.number().int().nonnegative().default(0),
    take: z.coerce.number().int().positive().max(100).default(50)
  })
});

// ==============================================================================
// MODULE 14 - JOB WORK / OUTSOURCED PROCESSING VALIDATION SCHEMAS
// ==============================================================================

export const jobWorkOrderStatusEnum = z.enum([
  'DRAFT',
  'APPROVED',
  'ISSUED',
  'PARTIALLY_RETURNED',
  'FULLY_RETURNED',
  'RECONCILED',
  'CLOSED',
  'CANCELLED'
]);

export const jobWorkReturnDispositionEnum = z.enum([
  'FINISHED_GOODS',
  'RAW_MATERIAL_RETURN',
  'SCRAP',
  'DEFECTIVE_REWORK'
]);

export const jobWorkOrderLineInputSchema = z.object({
  materialId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid().optional().nullable(),
  uomId: z.string().uuid('Valid UOM ID is required'),
  requiredQuantity: z.number().positive('Required quantity must be positive'),
  allocatedQuantity: z.number().min(0).default(0),
  notes: z.string().max(500).optional().nullable()
}).refine((data) => Boolean(data.materialId) !== Boolean(data.productId), {
  message: 'Exactly one of materialId or productId must be provided.'
});

export const createJobWorkOrderSchema = z.object({
  body: z.object({
    orderNumber: z.string().trim().min(1).optional(),
    vendorId: z.string().uuid('Valid Vendor ID is required'),
    purchaseOrderId: z.string().uuid().optional().nullable(),
    productId: z.string().uuid().optional().nullable(),
    targetQuantity: z.number().min(0).default(0),
    targetUomId: z.string().uuid().optional().nullable(),
    rawMaterialInputQty: z.number().min(0).default(0), // Deposit raw material needed
    expectedScrapRate: z.number().min(0).max(100).default(0),
    deliveryLocationId: z.string().uuid().optional().nullable(),
    natureOfProcessing: z.string().trim().min(1).max(255).optional().nullable(),
    specifications: z.string().max(2000).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    evidenceAttachments: z.array(z.record(z.unknown())).optional().nullable(),
    lines: z.array(jobWorkOrderLineInputSchema).min(1, 'At least one material line is required.')
  })
});
export type CreateJobWorkOrderInput = z.infer<typeof createJobWorkOrderSchema>['body'];

export const updateJobWorkOrderSchema = z.object({
  body: z.object({
    natureOfProcessing: z.string().trim().max(255).optional().nullable(),
    specifications: z.string().max(2000).optional().nullable(),
    targetQuantity: z.number().min(0).optional(),
    rawMaterialInputQty: z.number().min(0).optional(),
    expectedScrapRate: z.number().min(0).max(100).optional(),
    deliveryLocationId: z.string().uuid().optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    evidenceAttachments: z.array(z.record(z.unknown())).optional().nullable(),
    lines: z.array(jobWorkOrderLineInputSchema).optional()
  })
});
export type UpdateJobWorkOrderInput = z.infer<typeof updateJobWorkOrderSchema>['body'];

export const approveJobWorkOrderSchema = z.object({
  body: z.object({
    remarks: z.string().max(500).optional()
  }).default({})
});

export const closeJobWorkOrderSchema = z.object({
  body: z.object({
    remarks: z.string().max(500).optional()
  }).default({})
});

export const issueJobWorkMaterialSchema = z.object({
  body: z.object({
    challanNumber: z.string().trim().min(1).optional(),
    jobWorkOrderId: z.string().uuid().optional().nullable(),
    vendorId: z.string().uuid('Valid Vendor ID is required'),
    dispatchLocationId: z.string().uuid('Valid dispatch location ID is required'),
    materialId: z.string().uuid().optional().nullable(),
    productId: z.string().uuid().optional().nullable(),
    uomId: z.string().uuid('Valid UOM ID is required'),
    quantity: z.number().positive('Issued quantity must be positive'),
    vehicleNumber: z.string().trim().max(50).optional().nullable(),
    transporterName: z.string().trim().max(100).optional().nullable(),
    driverContact: z.string().trim().max(50).optional().nullable(),
    notes: z.string().max(500).optional().nullable()
  }).refine((data) => Boolean(data.materialId) !== Boolean(data.productId), {
    message: 'Exactly one of materialId or productId must be provided.'
  })
});
export type IssueJobWorkMaterialInput = z.infer<typeof issueJobWorkMaterialSchema>['body'];

export const receiveJobWorkReturnSchema = z.object({
  body: z.object({
    returnNumber: z.string().trim().min(1).optional(),
    jobWorkOrderId: z.string().uuid().optional().nullable(),
    vendorId: z.string().uuid('Valid Vendor ID is required'),
    locationId: z.string().uuid('Valid location ID is required'),
    disposition: jobWorkReturnDispositionEnum.default('FINISHED_GOODS'),
    productId: z.string().uuid().optional().nullable(),
    materialId: z.string().uuid().optional().nullable(),
    uomId: z.string().uuid('Valid UOM ID is required'),
    expectedQuantity: z.number().min(0),
    receivedQuantity: z.number().min(0),
    acceptedQuantity: z.number().min(0),
    scrapQuantity: z.number().min(0).default(0),
    consumedRawMaterial: z.number().min(0).default(0),
    notes: z.string().max(500).optional().nullable(),
    generateDebitNoteForShortage: z.boolean().default(true),
    debitNoteReason: z.string().max(500).optional()
  }).refine((data) => Boolean(data.materialId) !== Boolean(data.productId), {
    message: 'Exactly one of materialId or productId must be provided.'
  })
});
export type ReceiveJobWorkReturnInput = z.infer<typeof receiveJobWorkReturnSchema>['body'];

export const createJobWorkReconciliationSchema = z.object({
  body: z.object({
    jobWorkOrderId: z.string().uuid('Valid Job Work Order ID is required'),
    returnId: z.string().uuid().optional().nullable(),
    reason: z.string().max(1000).optional().nullable(),
    financialImpactNotes: z.string().max(1000).optional().nullable(),
    evidenceAttachments: z.array(z.record(z.unknown())).optional().nullable(),
    autoGenerateDebitNote: z.boolean().default(true)
  })
});
export type CreateJobWorkReconciliationInput = z.infer<typeof createJobWorkReconciliationSchema>['body'];

export const jobWorkQuerySchema = z.object({
  query: z.object({
    vendorId: z.string().uuid().optional(),
    status: jobWorkOrderStatusEnum.optional(),
    productId: z.string().uuid().optional(),
    materialId: z.string().uuid().optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
});
