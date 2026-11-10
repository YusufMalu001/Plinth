export interface GstUqcSpecification {
  id: string;
  code: string;
  name: string;
  symbol: string;
  dimension?: string;
}

export const GST_UQC_SPECIFICATIONS: GstUqcSpecification[] = [
  { id: 'BAG', code: 'BAG', name: 'BAGS', symbol: 'BAG', dimension: 'COUNT' },
  { id: 'BAL', code: 'BAL', name: 'BALE', symbol: 'BAL', dimension: 'COUNT' },
  { id: 'BDL', code: 'BDL', name: 'BUNDLES', symbol: 'BDL', dimension: 'COUNT' },
  { id: 'BKL', code: 'BKL', name: 'BUCKLES', symbol: 'BKL', dimension: 'COUNT' },
  { id: 'BOU', code: 'BOU', name: 'BILLIONS OF UNITS', symbol: 'BOU', dimension: 'COUNT' },
  { id: 'BOX', code: 'BOX', name: 'BOX', symbol: 'BOX', dimension: 'COUNT' },
  { id: 'BTL', code: 'BTL', name: 'BOTTLES', symbol: 'BTL', dimension: 'COUNT' },
  { id: 'BUN', code: 'BUN', name: 'BUNCHES', symbol: 'BUN', dimension: 'COUNT' },
  { id: 'CAN', code: 'CAN', name: 'CANS', symbol: 'CAN', dimension: 'COUNT' },
  { id: 'CBM', code: 'CBM', name: 'CUBIC METER', symbol: 'CBM', dimension: 'VOLUME' },
  { id: 'CCM', code: 'CCM', name: 'CUBIC CENTIMETER', symbol: 'CCM', dimension: 'VOLUME' },
  { id: 'CMS', code: 'CMS', name: 'CENTIMETER', symbol: 'CMS', dimension: 'LENGTH' },
  { id: 'CTN', code: 'CTN', name: 'CARTONS', symbol: 'CTN', dimension: 'COUNT' },
  { id: 'DOZ', code: 'DOZ', name: 'DOZEN', symbol: 'DOZ', dimension: 'COUNT' },
  { id: 'DRM', code: 'DRM', name: 'DRUM', symbol: 'DRM', dimension: 'COUNT' },
  { id: 'EA', code: 'EA', name: 'EACH', symbol: 'ea', dimension: 'COUNT' },
  { id: 'FT', code: 'FT', name: 'FEET', symbol: 'ft', dimension: 'LENGTH' },
  { id: 'G', code: 'G', name: 'GRAMS', symbol: 'g', dimension: 'MASS' },
  { id: 'GGR', code: 'GGR', name: 'GREAT GROSS', symbol: 'GGR', dimension: 'COUNT' },
  { id: 'GMS', code: 'GMS', name: 'GRAMS', symbol: 'GMS', dimension: 'MASS' },
  { id: 'GRS', code: 'GRS', name: 'GROSS', symbol: 'GRS', dimension: 'COUNT' },
  { id: 'GYD', code: 'GYD', name: 'GROSS YARDS', symbol: 'GYD', dimension: 'COUNT' },
  { id: 'KG', code: 'KG', name: 'KILOGRAMS', symbol: 'kg', dimension: 'MASS' },
  { id: 'KGS', code: 'KGS', name: 'KILOGRAMS', symbol: 'KGS', dimension: 'MASS' },
  { id: 'KLR', code: 'KLR', name: 'KILOLITRE', symbol: 'KLR', dimension: 'VOLUME' },
  { id: 'KME', code: 'KME', name: 'KILOMETRE', symbol: 'KME', dimension: 'LENGTH' },
  { id: 'LTR', code: 'LTR', name: 'LITERS', symbol: 'L', dimension: 'VOLUME' },
  { id: 'ML', code: 'ML', name: 'MILLILITERS', symbol: 'mL', dimension: 'VOLUME' },
  { id: 'MLT', code: 'MLT', name: 'MILLILITRE', symbol: 'MLT', dimension: 'VOLUME' },
  { id: 'MM', code: 'MM', name: 'MILLIMETERS', symbol: 'mm', dimension: 'LENGTH' },
  { id: 'MTR', code: 'MTR', name: 'METERS', symbol: 'MTR', dimension: 'LENGTH' },
  { id: 'MTS', code: 'MTS', name: 'METRIC TON', symbol: 'MTS', dimension: 'MASS' },
  { id: 'NOS', code: 'NOS', name: 'NUMBERS', symbol: 'NOS', dimension: 'COUNT' },
  { id: 'OTH', code: 'OTH', name: 'OTHERS', symbol: 'OTH', dimension: 'COUNT' },
  { id: 'PAC', code: 'PAC', name: 'PACKS', symbol: 'PAC', dimension: 'COUNT' },
  { id: 'PACK', code: 'PACK', name: 'PACK', symbol: 'pk', dimension: 'COUNT' },
  { id: 'PCS', code: 'PCS', name: 'PIECES', symbol: 'PCS', dimension: 'COUNT' },
  { id: 'PRS', code: 'PRS', name: 'PAIRS', symbol: 'PRS', dimension: 'COUNT' },
  { id: 'QTL', code: 'QTL', name: 'QUINTAL', symbol: 'QTL', dimension: 'MASS' },
  { id: 'ROL', code: 'ROL', name: 'ROLLS', symbol: 'ROL', dimension: 'COUNT' },
  { id: 'ROLL', code: 'ROLL', name: 'ROLL', symbol: 'roll', dimension: 'COUNT' },
  { id: 'SET', code: 'SET', name: 'SETS', symbol: 'SET', dimension: 'COUNT' },
  { id: 'SQF', code: 'SQF', name: 'SQUARE FEET', symbol: 'SQF', dimension: 'AREA' },
  { id: 'SQM', code: 'SQM', name: 'SQUARE METERS', symbol: 'SQM', dimension: 'AREA' },
  { id: 'SQY', code: 'SQY', name: 'SQUARE YARDS', symbol: 'SQY', dimension: 'AREA' },
  { id: 'TBS', code: 'TBS', name: 'TABLETS', symbol: 'TBS', dimension: 'COUNT' },
  { id: 'TGM', code: 'TGM', name: 'TEN GRAMS', symbol: 'TGM', dimension: 'MASS' },
  { id: 'THD', code: 'THD', name: 'THOUSANDS', symbol: 'THD', dimension: 'COUNT' },
  { id: 'TON', code: 'TON', name: 'TONNES', symbol: 'TON', dimension: 'MASS' },
  { id: 'TUB', code: 'TUB', name: 'TUBES', symbol: 'TUB', dimension: 'COUNT' },
  { id: 'UGS', code: 'UGS', name: 'US GALLONS', symbol: 'UGS', dimension: 'VOLUME' },
  { id: 'UNT', code: 'UNT', name: 'UNITS', symbol: 'UNT', dimension: 'COUNT' },
  { id: 'YDS', code: 'YDS', name: 'YARDS', symbol: 'YDS', dimension: 'COUNT' },
];

export function getUomSpecificationOptions(uom?: { id: string; symbol: string; dimension?: string | null }) {
  if (!uom?.symbol) return GST_UQC_SPECIFICATIONS;
  const known = GST_UQC_SPECIFICATIONS.some((spec) => spec.symbol.toLowerCase() === uom.symbol.toLowerCase());
  if (known) return GST_UQC_SPECIFICATIONS;
  return [{ id: `current:${uom.id}`, code: uom.symbol, name: uom.symbol, symbol: uom.symbol, dimension: uom.dimension || undefined }, ...GST_UQC_SPECIFICATIONS];
}

export function getUomSpecificationId(uom?: { id: string; symbol: string; dimension?: string | null }) {
  if (!uom?.symbol) return '';
  const matches = GST_UQC_SPECIFICATIONS.filter((spec) => spec.symbol.toLowerCase() === uom.symbol.toLowerCase());
  return (matches.find((spec) => spec.dimension?.toLowerCase() === uom.dimension?.toLowerCase()) || matches[0])?.id || `current:${uom.id}`;
}
