/**
 * Authoritative UOM Mapping Dataset & Resolver
 * Consolidated from Production Schedule (PS_) material-issue sheets.
 * Used for automatic UOM selection and fallback resolution during Purchase Order (PO) & Requisition creation.
 */

export interface UomMappingEntry {
  itemName: string;
  uomCategory: 'Nos.' | 'Pcs' | 'Pipes' | 'Box' | 'Kgs' | 'Set' | 'Roll' | 'Mtr';
  standardUomCode: 'NOS' | 'PCS' | 'PIPES' | 'BOX' | 'KG' | 'SET' | 'ROLL' | 'MTR';
}

export const UOM_MAPPING_DATA: UomMappingEntry[] = [
  // ─── Nos. (Numbers / Hardware / Screws / Fasteners / Caps / Sheet Frames) ─────────
  { itemName: '(10x20) Semi Round Cap', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: '(18x18) Square Bottom Cap', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: '10x20 Semi Round Cap', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: '16*16 SQUARE TOP CAP', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: '18x18 Square Bottom Cap', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: '2mm SS Sheet', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CONNECTING TUBE 5/16"', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CONNECTOR SCREW 4*12', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS10 - BOTTOM CAP', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS10 - BOTTOM LEGS FRAME - 2200', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS10 - HOLDING PLATE', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS10 - HOLDING TUBE', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS10 - MAIN RODS - 1135', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS10 - SIDE WING - 1388', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS10 - TOP FRAME - 3205', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS10 - WING RODS - 523', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS11 Chain 3mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS11 Chain 3mm (9 Kadi)', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS11 PIPE - 853mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS11 PIPE - 883mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS12 - 748mm Pipe', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS12 - 776mm Pipe', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS12 - Lower Frame with Rods', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS12 - Lower Frame without Rods', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS12 - Top Frame with Rods', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS12 - Top Frame without Rods', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS12 - Top Rod', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS8 - 827mm Pipe', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS8 - 860mm Pipe', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS8 - BOTTOM CAP', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS8 - Lower Frame with Rods', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS8 - Lower Frame without Rods', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS8 - SIDE CAP', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS8 - Top Frame with Rods', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS8 - Top Frame without Rods', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS8 - Top Rod', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS9 PIPE - 753mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'CS9 PIPE - 783mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'ECONOMY SS SCREWS', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'GLIDER BRACKET', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'PIPE 1 (18x18) - 1200mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'PIPE 2 (18x18) - 1200mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'PIPE 3 (10x20) - 450mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'PIPE 4 (10x20) - 650mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'PIPE 5 (10x20) - 450mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'PIPE 6 (10x20) - 250mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'PIPE 7 (10x20) - 450mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'PIPE 8 (10x20) - 650mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'PLASTIC WASHER 8mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'SS 6*25 PAN PHILIPS SHEET SCREW - ECONOMY', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'SS 6mm HEX NUT', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'SS 8mm HEX NUT', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'SS DOME NUT 6mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'SS HEX BOLT 6 x 40', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'SS HEX BOLT 6 x 50', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'SS HEX BOLT 6 x 60', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'SS HEX BOLT 6*30', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'SS HEX BOLT 6*40', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'SS HEX BOLT 6*50', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'SS HEX NUT 6mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'SS NYLOCK NUT 6mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'SS Pan Head Screw 6x32', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'SS Pan Head Screw 6x50', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'SS PLAIN WASHER 6*12mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'SS PLAIN WASHER 6*16mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },
  { itemName: 'SS Plain Washer 6x16mm', uomCategory: 'Nos.', standardUomCode: 'NOS' },

  // ─── Pcs (Pieces / Packed assemblies / Boxes / Finished Units) ───────────────────
  { itemName: '2 FEET', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: '2 FEET CS3 ROD', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: '3 FEET', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: '4 FEET', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: '5 FEET', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: '6 FEET', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: '6 PIPES - 12 Pcs / Set', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: '6 PIPES - 14 Pcs / Set', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: '6 PIPES - 17 Pcs / Set', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: '7 FEET', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'CS1 - BOX', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'CS1 - RAW', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'CS10 - BOX', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'CS10 - RAW', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'CS11 - RAW', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'CS12 - JACKET BOX', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'CS12 - RAW', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'CS18 - RAW', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'CS3 FULL PACK', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'CS3 LHS BEND', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'CS3 LONG PATTI', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'CS3 RHS BEND', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'CS3 SHORT PATTI', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'CS6 FULL PACK', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'CS8 - BOX', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'CS8 - JACKET BOX', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'CS8 - RAW', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'EZEE CLIPPER', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'LUXURY 8*38 SCREW', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'LUXURY ACCESSORIES BOX', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'LUXURY BIG CAP', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'LUXURY INNER BOX', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'LUXURY SMALL CAP', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'LUXURY WALL PLUG', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'LUXURY WALL PLUG 35mm', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'SPOT WELD 9.5mm RODS - 2 FEET', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'SS 6x25 PAN PHILIPS M/C SCREW', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'SS DOME NUT 6mm', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'SS HEX BOLT 5x12', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'SS HEX BOLT 5x16', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'SS HEX BOLT 5x20', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'SS NYLOCK NUT 5mm', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'SS NYLOCK NUT 6mm', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'SS PLAIN WASHER 6mm', uomCategory: 'Pcs', standardUomCode: 'PCS' },
  { itemName: 'SS SCREW 8*38 CSK', uomCategory: 'Pcs', standardUomCode: 'PCS' },

  // ─── Pipes (Structural Stainless Steel & Frame Pipes) ───────────────────────────
  { itemName: 'GLIDER 5 PIPES - LHS', uomCategory: 'Pipes', standardUomCode: 'PIPES' },
  { itemName: 'GLIDER 5 PIPES - RHS', uomCategory: 'Pipes', standardUomCode: 'PIPES' },
  { itemName: 'Lower Frame with Rods', uomCategory: 'Pipes', standardUomCode: 'PIPES' },
  { itemName: 'Lower Frame without Rods', uomCategory: 'Pipes', standardUomCode: 'PIPES' },
  { itemName: 'SS (16x16) x 0.6mm SQ PIPE', uomCategory: 'Pipes', standardUomCode: 'PIPES' },
  { itemName: 'SS (18x18) x 0.6mm SQ PIPE', uomCategory: 'Pipes', standardUomCode: 'PIPES' },
  { itemName: 'SS (20 x 40) x 0.7 mm PIPE - 20 Feet', uomCategory: 'Pipes', standardUomCode: 'PIPES' },
  { itemName: 'SS (20x10) x 0.6mm SQ PIPE', uomCategory: 'Pipes', standardUomCode: 'PIPES' },
  { itemName: 'SS 1/2" x 0.6mm', uomCategory: 'Pipes', standardUomCode: 'PIPES' },
  { itemName: 'SS 1/2" x 0.6mm PIPES', uomCategory: 'Pipes', standardUomCode: 'PIPES' },
  { itemName: 'SS 20 x 40mm 0.7 mm PIPE', uomCategory: 'Pipes', standardUomCode: 'PIPES' },
  { itemName: 'SS 3/4" x 0.8mm PIPE', uomCategory: 'Pipes', standardUomCode: 'PIPES' },
  { itemName: 'SS 3/4" x 0.8mm PIPE - 12 Feet', uomCategory: 'Pipes', standardUomCode: 'PIPES' },
  { itemName: 'Top Frame with Rods', uomCategory: 'Pipes', standardUomCode: 'PIPES' },
  { itemName: 'Top Frame without Rods', uomCategory: 'Pipes', standardUomCode: 'PIPES' },

  // ─── Box (Packaging / Corrugated boxes) ─────────────────────────────────────────
  { itemName: 'CS3 INNER BOX', uomCategory: 'Box', standardUomCode: 'BOX' },
  { itemName: 'CS3 OUTER BOX', uomCategory: 'Box', standardUomCode: 'BOX' },

  // ─── Kgs (Bulk Raw Material / Braided Ropes / Polymers) ─────────────────────────
  { itemName: 'ECONOMY 5mm BRAIDED ROPE - RAW', uomCategory: 'Kgs', standardUomCode: 'KG' },
  { itemName: 'LUXURY 3mm BRAIDED ROPE - RAW', uomCategory: 'Kgs', standardUomCode: 'KG' },
];

/**
 * Normalizes item names for loose/fuzzy matching
 */
const normalizeItemName = (name: string): string => {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
};

// Fast lookup index
const uomLookupMap = new Map<string, UomMappingEntry>();
UOM_MAPPING_DATA.forEach((entry) => {
  uomLookupMap.set(normalizeItemName(entry.itemName), entry);
});

/**
 * Automatically resolves the standard UOM code for a given item name.
 * Falls back to intelligent regex heuristics if exact match isn't found.
 */
export function resolveAutomatedUomCode(itemName: string): 'NOS' | 'PCS' | 'PIPES' | 'BOX' | 'KG' | 'SET' | 'ROLL' | 'MTR' {
  if (!itemName) return 'PCS';

  const normalized = normalizeItemName(itemName);
  const directMatch = uomLookupMap.get(normalized);
  if (directMatch) {
    return directMatch.standardUomCode;
  }

  // Heuristics based on production sheets rules
  const lower = itemName.toLowerCase();

  if (lower.includes('pipe') || lower.includes('sq pipe') || lower.includes('square pipe')) {
    return 'PIPES';
  }
  if (lower.includes('box') || lower.includes('carton') || lower.includes('jacket box')) {
    return 'BOX';
  }
  if (lower.includes('rope - raw') || lower.includes('granule') || lower.includes('polymer') || lower.includes('kg') || lower.includes('braided rope')) {
    return 'KG';
  }
  if (
    lower.includes('bolt') ||
    lower.includes('screw') ||
    lower.includes('nut') ||
    lower.includes('washer') ||
    lower.includes('locknut') ||
    lower.includes('cap') ||
    lower.includes('bracket') ||
    lower.includes('chain') ||
    lower.includes('sheet')
  ) {
    return 'NOS';
  }
  if (lower.includes('set') || lower.includes('pcs / set')) {
    return 'SET';
  }
  if (lower.includes('roll') || lower.includes('tape')) {
    return 'ROLL';
  }

  return 'PCS';
}

/**
 * Matches an item name to the database UOM record ID given the available UOM list.
 */
export function matchItemToUomId(
  itemName: string,
  availableUoms: Array<{ id: string; code: string; symbol: string; name?: string }>
): string | undefined {
  if (!availableUoms || availableUoms.length === 0) return undefined;

  const targetCode = resolveAutomatedUomCode(itemName);

  // Exact code match (e.g. 'NOS', 'PCS', 'PIPES', 'BOX', 'KG', 'SET')
  const codeMatch = availableUoms.find(
    (u) =>
      u.code.toUpperCase() === targetCode ||
      u.symbol.toUpperCase() === targetCode ||
      (targetCode === 'PIPES' && (u.code === 'PCS' || u.code === 'NOS'))
  );

  if (codeMatch) return codeMatch.id;

  // Fallback: match by symbol or default to first
  const fallbackPcs = availableUoms.find((u) => u.code.toUpperCase() === 'PCS' || u.code.toUpperCase() === 'NOS');
  return fallbackPcs ? fallbackPcs.id : availableUoms[0]?.id;
}
