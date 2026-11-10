import {
  BomStatus,
  BomLineType,
  BomQuantityMode,
  BomRoundingRule,
} from '@synergy/types';

export interface BomLine {
  id: string;
  bomVersionId: string;
  lineType: BomLineType;
  materialId?: string | null;
  componentProductId?: string | null;
  uomId: string;
  quantityMode: BomQuantityMode;
  quantity: number;
  unitCost?: number | null;
  roundingRule: BomRoundingRule;
  roundingPrecision?: number | null;
  departmentId?: string | null;
  sequence: number;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
  material?: {
    id: string;
    code: string;
    name: string;
  } | null;
  componentProduct?: {
    id: string;
    sku: string;
    name: string;
  } | null;
  uom?: {
    id: string;
    code: string;
    name: string;
    symbol: string;
  } | null;
  department?: {
    id: string;
    code: string;
    name: string;
  } | null;
}

export interface BomGoldenExample {
  id: string;
  bomVersionId: string;
  label: string;
  inputQuantity: number;
  inputUomId: string;
  expectedResults: Array<{
    bomLineId: string;
    expectedQuantity: number;
    uomId: string;
    note?: string;
  }>;
  sourceReference: string;
  createdByActorId: string;
  createdAt: string;
  inputUom?: {
    id: string;
    code: string;
    name: string;
    symbol: string;
  } | null;
}

export interface BomSimulationRun {
  id: string;
  bomVersionId: string;
  requestedQuantity: number;
  requestedUomId: string;
  isAuthoritative: boolean;
  runByActorId: string;
  runAt: string;
  resultPayload: BomCalculationResult;
  requestedUom?: {
    id: string;
    code: string;
    name: string;
    symbol: string;
  } | null;
}

export interface BomVersionSummary {
  id: string;
  bomNumber: string;
  productId?: string | null;
  materialId?: string | null;
  productVariantId?: string | null;
  variantScopeKey: string;
  version: number;
  status: BomStatus;
  effectiveDate?: string | null;
  supersededById?: string | null;
  note?: string | null;
  createdByActorId: string;
  approvedByActorId?: string | null;
  approvedAt?: string | null;
  retiredByActorId?: string | null;
  retiredAt?: string | null;
  createdAt: string;
  updatedAt: string;
  product?: {
    id: string;
    sku: string;
    name: string;
    uomId?: string;
    uom?: {
      id: string;
      code: string;
      name: string;
      symbol?: string;
    } | null;
  };
  material?: {
    id: string;
    code: string;
    name: string;
    uomId?: string;
    uom?: { id: string; code: string; name: string; symbol?: string } | null;
  } | null;
  productVariant?: {
    id: string;
    sku: string;
    name: string;
  } | null;
  lines?: BomLine[];
  _count?: {
    lines: number;
    goldenExamples: number;
    simulationRuns: number;
  };
}

export interface BomVersionDetail extends BomVersionSummary {
  lines: BomLine[];
  goldenExamples: BomGoldenExample[];
  simulationRuns: BomSimulationRun[];
}

export interface BomVersionListResponse {
  items: BomVersionSummary[];
  total: number;
}

export interface BomCalculationRequirement {
  bomLineId: string;
  lineType: BomLineType;
  materialId?: string | null;
  materialCode?: string | null;
  materialName?: string | null;
  componentProductId?: string | null;
  componentSku?: string | null;
  componentName?: string | null;
  uomId: string;
  uomCode: string;
  uomSymbol: string;
  quantityMode: BomQuantityMode;
  baseRatio: number;
  requiredQuantity: number;
  roundingRule: BomRoundingRule;
  roundingPrecision?: number | null;
  departmentId?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
}

export interface BomCalculationResult {
  bomVersionId: string;
  bomNumber: string;
  version: number;
  status: BomStatus;
  isAuthoritative: boolean;
  productId?: string | null;
  materialId?: string | null;
  productVariantId?: string | null;
  requestedQuantity: number;
  requestedUomId: string;
  effectiveAsOf: string;
  requirements: BomCalculationRequirement[];
  departmentBreakdown: Record<string, {
    departmentId: string;
    departmentName: string;
    lines: BomCalculationRequirement[];
  }>;
}

export interface BomVersionDiff {
  fromVersion: {
    id: string;
    bomNumber: string;
    version: number;
    status: BomStatus;
  };
  toVersion: {
    id: string;
    bomNumber: string;
    version: number;
    status: BomStatus;
  };
  addedLines: BomLine[];
  removedLines: BomLine[];
  changedLines: Array<{
    from: BomLine;
    to: BomLine;
    differences: string[];
  }>;
  unchangedLines: BomLine[];
}

export interface CreateBomDraftInput {
  productId?: string;
  materialId?: string;
  productVariantId?: string | null;
  copyFromVersionId?: string | null;
  updateVersionId?: string;
  bomNumber?: string;
  note?: string;
  lines?: Array<{
    lineType: BomLineType;
    materialId?: string | null;
    componentProductId?: string | null;
    uomId: string;
    quantityMode: BomQuantityMode;
    quantity: number;
    unitCost?: number | null;
    roundingRule?: BomRoundingRule;
    roundingPrecision?: number | null;
    departmentId?: string | null;
    sequence?: number;
    note?: string | null;
  }>;
}

export interface UpdateBomDraftInput {
  bomNumber?: string;
  note?: string | null;
  effectiveDate?: string | null;
  lines?: Array<{
    lineType: BomLineType;
    materialId?: string | null;
    componentProductId?: string | null;
    uomId: string;
    quantityMode: BomQuantityMode;
    quantity: number;
    unitCost?: number | null;
    roundingRule?: BomRoundingRule;
    roundingPrecision?: number | null;
    departmentId?: string | null;
    sequence?: number;
    note?: string | null;
  }>;
}

export interface AddGoldenExampleInput {
  label: string;
  inputQuantity: number;
  inputUomId: string;
  expectedResults: Array<{
    bomLineId: string;
    expectedQuantity: number;
    uomId: string;
    note?: string;
  }>;
  sourceReference: string;
}

export interface RunSimulationInput {
  requestedQuantity: number;
  requestedUomId: string;
}
