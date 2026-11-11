import type {
  DetailedProduct,
  ProductTechnicalSpecs,
  ProductBomComponent,
  ProductWarehouseStock,
  ProductMovementRow,
  ProductLinkedOrder,
} from './types';

export function formatINR(val?: number | string | null): string {
  if (val === undefined || val === null || val === '') return '—';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatQty(val?: number | string | null, symbol = 'pcs'): string {
  if (val === undefined || val === null || val === '') return '0';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '0';
  return `${new Intl.NumberFormat('en-IN').format(num)} ${symbol}`;
}

export function getResolvedSpecifications(product: DetailedProduct): ProductTechnicalSpecs {
  const metaSpecs = product.metadata?.specifications || {};
  // Product detail surfaces must never invent specifications. If the master
  // record does not contain a value, leave it empty for the UI to display as
  // unavailable rather than showing a catalog-specific fallback.
  return metaSpecs;
  const sku = (product.sku || '').toUpperCase();
  const name = (product.name || '').toUpperCase();
  const code = (product.productFamily?.code || product.category?.code || '').toUpperCase();

  const isCS12 = sku.includes('CS12') || sku.includes('CS-12') || name.includes('CS12') || name.includes('CS-12');
  const isCS10 = sku.includes('CS10') || sku.includes('CS-10') || name.includes('CS10') || name.includes('CS-10');
  const isCS11 = sku.includes('CS11') || sku.includes('CS-11') || name.includes('CS11') || name.includes('CS-11');
  const isCS8 = sku.includes('CS8') || sku.includes('CS-8') || sku.startsWith('CS08') || name.includes('CS8') || name.includes('CS-8');
  const isCS9 = sku.includes('CS9') || sku.includes('CS-9') || sku.startsWith('CS09') || name.includes('CS9') || name.includes('CS-9');
  const isCS3 = sku.includes('CS3') || sku.includes('CS-3') || sku.startsWith('CS03') || name.includes('CS3') || name.includes('CS-3');

  const isFloorStand = code.includes('FLOOR') || code.includes('CLOTH') || name.includes('CS') || sku.includes('CS');
  const isWallMount = code.includes('WALL') || name.includes('GL') || sku.includes('GL');

  if (isCS12) {
    return {
      materialGrade: metaSpecs.materialGrade || 'Stainless Steel 202 High-Tensile (Austenitic)',
      frameSpecs: metaSpecs.frameSpecs || '3/4" × 0.8mm SS Pipe Structural Frame (12ft & 20.5ft cuts)',
      rodSpecs: metaSpecs.rodSpecs || 'SS 748mm (4 Nos) & 776mm (9 Nos) Precision Tubes',
      surfaceFinish: metaSpecs.surfaceFinish || 'Mirror Buffed Electro-Polished Chrome Finish',
      hangingSpace: metaSpecs.hangingSpace || '62 Feet Linear Hanging Capacity',
      loadCapacity: metaSpecs.loadCapacity || '45 kg Uniformly Distributed Load',
      foldedDimensions: metaSpecs.foldedDimensions || '1350 mm (H) × 680 mm (W) × 100 mm (D)',
      extendedDimensions: metaSpecs.extendedDimensions || '1550 mm (L) × 680 mm (W) × 1300 mm (H)',
      netWeight: metaSpecs.netWeight || '7.77 kg',
      grossWeight: metaSpecs.grossWeight || '8.45 kg',
      packagingType: metaSpecs.packagingType || 'Heavy-Duty 5-Ply Printed Corrugated Master Carton',
      unitsPerCarton: metaSpecs.unitsPerCarton || '1 Unit / Box',
      warranty: metaSpecs.warranty || '1 Year Manufacturer Rust & Workmanship Warranty',
      corrosionResistance: metaSpecs.corrosionResistance || 'All-Weather Passivated Surface',
    };
  }

  if (isCS10) {
    return {
      materialGrade: metaSpecs.materialGrade || 'Stainless Steel 202 Wing-Frame Structural Alloy',
      frameSpecs: metaSpecs.frameSpecs || '16×16 mm & 18×18 mm (0.6mm Sq Pipe) Wing-Frame Design',
      rodSpecs: metaSpecs.rodSpecs || 'Main Rods 1135mm (5 Nos) & Wing Rods 523mm (8 Nos)',
      surfaceFinish: metaSpecs.surfaceFinish || 'Mirror Buffed Electro-Polished Chrome Finish',
      hangingSpace: metaSpecs.hangingSpace || '52 Feet Linear Hanging Capacity',
      loadCapacity: metaSpecs.loadCapacity || '35 kg Uniformly Distributed Load',
      foldedDimensions: metaSpecs.foldedDimensions || '1180 mm (H) × 620 mm (W) × 90 mm (D)',
      extendedDimensions: metaSpecs.extendedDimensions || '1420 mm (L) × 620 mm (W) × 1150 mm (H)',
      netWeight: metaSpecs.netWeight || '3.89 kg',
      grossWeight: metaSpecs.grossWeight || '4.45 kg',
      packagingType: metaSpecs.packagingType || 'Heavy-Duty 5-Ply Printed Corrugated Master Carton',
      unitsPerCarton: metaSpecs.unitsPerCarton || '1 Unit / Box',
      warranty: metaSpecs.warranty || '1 Year Manufacturer Rust & Workmanship Warranty',
      corrosionResistance: metaSpecs.corrosionResistance || 'All-Weather Passivated Surface',
    };
  }

  if (isCS8) {
    return {
      materialGrade: metaSpecs.materialGrade || 'Stainless Steel 202 (Austenitic Alloy)',
      frameSpecs: metaSpecs.frameSpecs || '3/4" × 0.8mm SS Pipe Structural Compact Frame',
      rodSpecs: metaSpecs.rodSpecs || 'SS 827mm (~4.5 Nos) & 860mm (~9 Nos) Precision Tubes',
      surfaceFinish: metaSpecs.surfaceFinish || 'Mirror Buffed Electro-Polished Chrome Finish',
      hangingSpace: metaSpecs.hangingSpace || '48 Feet Linear Hanging Capacity',
      loadCapacity: metaSpecs.loadCapacity || '35 kg Uniformly Distributed Load',
      foldedDimensions: metaSpecs.foldedDimensions || '1200 mm (H) × 600 mm (W) × 85 mm (D)',
      extendedDimensions: metaSpecs.extendedDimensions || '1380 mm (L) × 600 mm (W) × 1100 mm (H)',
      netWeight: metaSpecs.netWeight || '7.77 kg',
      grossWeight: metaSpecs.grossWeight || '8.30 kg',
      packagingType: metaSpecs.packagingType || 'Heavy-Duty 5-Ply Printed Corrugated Master Carton',
      unitsPerCarton: metaSpecs.unitsPerCarton || '1 Unit / Box',
      warranty: metaSpecs.warranty || '1 Year Manufacturer Rust & Workmanship Warranty',
      corrosionResistance: metaSpecs.corrosionResistance || 'All-Weather Passivated Surface',
    };
  }

  if (isCS9) {
    return {
      materialGrade: metaSpecs.materialGrade || 'Stainless Steel 202 (Austenitic Alloy)',
      frameSpecs: metaSpecs.frameSpecs || '18×18 mm & 10×20 mm Frame Pipes (Variants 1,2,3,6,7)',
      rodSpecs: metaSpecs.rodSpecs || 'CS9 Pipe 753mm (8 Nos) & 783mm (3 Nos)',
      surfaceFinish: metaSpecs.surfaceFinish || 'Mirror Buffed Electro-Polished Chrome Finish',
      hangingSpace: metaSpecs.hangingSpace || '42 Feet Linear Hanging Capacity',
      loadCapacity: metaSpecs.loadCapacity || '30 kg Uniformly Distributed Load',
      foldedDimensions: metaSpecs.foldedDimensions || '1150 mm (H) × 580 mm (W) × 80 mm (D)',
      extendedDimensions: metaSpecs.extendedDimensions || '1320 mm (L) × 580 mm (W) × 1050 mm (H)',
      netWeight: metaSpecs.netWeight || '4.60 kg',
      grossWeight: metaSpecs.grossWeight || '5.15 kg',
      packagingType: metaSpecs.packagingType || 'Heavy-Duty 5-Ply Printed Corrugated Master Carton',
      unitsPerCarton: metaSpecs.unitsPerCarton || '1 Unit / Box',
      warranty: metaSpecs.warranty || '1 Year Manufacturer Rust & Workmanship Warranty',
      corrosionResistance: metaSpecs.corrosionResistance || 'All-Weather Passivated Surface',
    };
  }

  if (isCS3) {
    return {
      materialGrade: metaSpecs.materialGrade || 'Stainless Steel 202 High-Tensile Foldable Patti Design',
      frameSpecs: metaSpecs.frameSpecs || 'CS3 Short Patti (4 Pcs), Long Patti (12 Pcs) & RHS/LHS Bends',
      rodSpecs: metaSpecs.rodSpecs || 'Spot Weld 9.5mm Rods — 2 Feet (7 Pcs)',
      surfaceFinish: metaSpecs.surfaceFinish || 'Mirror Buffed Electro-Polished Chrome Finish',
      hangingSpace: metaSpecs.hangingSpace || '28 Feet Linear Hanging Capacity',
      loadCapacity: metaSpecs.loadCapacity || '20 kg Distributed Pack Load',
      foldedDimensions: metaSpecs.foldedDimensions || '650 mm (L) × 150 mm (W) × 100 mm (D)',
      extendedDimensions: metaSpecs.extendedDimensions || '650 mm (L) × 650 mm (W) × 450 mm (H)',
      netWeight: metaSpecs.netWeight || '2.80 kg',
      grossWeight: metaSpecs.grossWeight || '3.20 kg',
      packagingType: metaSpecs.packagingType || 'CS3 Inner Box + Printed Outer Master Box',
      unitsPerCarton: metaSpecs.unitsPerCarton || '1 Full Pack',
      warranty: metaSpecs.warranty || '1 Year Manufacturer Rust & Workmanship Warranty',
      corrosionResistance: metaSpecs.corrosionResistance || 'All-Weather Passivated Surface',
    };
  }

  if (isFloorStand || isCS11) {
    return {
      materialGrade: metaSpecs.materialGrade || 'Stainless Steel 202 (Austenitic Alloy)',
      frameSpecs: metaSpecs.frameSpecs || '18 × 18 mm & 20 × 10 mm Square Pipes (0.6 mm wall thickness)',
      rodSpecs: metaSpecs.rodSpecs || 'SS 1/2" × 0.6mm Pipes (853mm & 883mm Rods)',
      surfaceFinish: metaSpecs.surfaceFinish || 'Mirror Buffed Electro-Polished Chrome Finish',
      hangingSpace: metaSpecs.hangingSpace || '56 Feet Linear Hanging Capacity',
      loadCapacity: metaSpecs.loadCapacity || '35 kg Uniformly Distributed Load',
      foldedDimensions: metaSpecs.foldedDimensions || '1220 mm (H) × 650 mm (W) × 90 mm (D)',
      extendedDimensions: metaSpecs.extendedDimensions || '1450 mm (L) × 650 mm (W) × 1200 mm (H)',
      netWeight: metaSpecs.netWeight || '5.80 kg',
      grossWeight: metaSpecs.grossWeight || '6.45 kg',
      packagingType: metaSpecs.packagingType || 'Heavy-Duty 5-Ply Printed Corrugated Master Carton',
      unitsPerCarton: metaSpecs.unitsPerCarton || '1 Unit / Box (Pallet standard: 40 units)',
      warranty: metaSpecs.warranty || '1 Year Manufacturer Rust & Workmanship Warranty',
      corrosionResistance: metaSpecs.corrosionResistance || 'All-Weather Passivated Surface',
    };
  }

  if (isWallMount) {
    return {
      materialGrade: metaSpecs.materialGrade || 'Stainless Steel 202 High-Tensile',
      frameSpecs: metaSpecs.frameSpecs || 'Heavy Duty Laser-Cut Side Brackets (2.0 mm)',
      rodSpecs: metaSpecs.rodSpecs || '5 Rods (1/2" Round Tubes × 5 Feet Length)',
      surfaceFinish: metaSpecs.surfaceFinish || 'Electro-Polished Chrome with UV-resistant Polymer Caps',
      hangingSpace: metaSpecs.hangingSpace || '25 Feet Linear Hanging Space',
      loadCapacity: metaSpecs.loadCapacity || '25 kg Wall Load Capacity',
      foldedDimensions: metaSpecs.foldedDimensions || '1520 mm (L) × 80 mm (D) × 180 mm (H)',
      extendedDimensions: metaSpecs.extendedDimensions || '1520 mm (L) × 600 mm (D) × 180 mm (H)',
      netWeight: metaSpecs.netWeight || '3.40 kg',
      grossWeight: metaSpecs.grossWeight || '3.90 kg',
      packagingType: metaSpecs.packagingType || 'Reinforced Long Corridor Carton',
      unitsPerCarton: metaSpecs.unitsPerCarton || '1 Unit / Master Pack',
      warranty: metaSpecs.warranty || '1 Year Plinth Guarantee',
      corrosionResistance: metaSpecs.corrosionResistance || 'Indoor / Balcony Weather Protected',
    };
  }

  return {
    materialGrade: metaSpecs.materialGrade || 'Industrial Grade Stainless Steel',
    frameSpecs: metaSpecs.frameSpecs || 'Tubular Welded Construction',
    rodSpecs: metaSpecs.rodSpecs || 'Precision Formed Steel Rods',
    surfaceFinish: metaSpecs.surfaceFinish || 'Standard Polished Finish',
    hangingSpace: metaSpecs.hangingSpace || 'Optimized Drying Space',
    loadCapacity: metaSpecs.loadCapacity || '30 kg Rated Capacity',
    foldedDimensions: metaSpecs.foldedDimensions || '1200 × 600 × 80 mm',
    extendedDimensions: metaSpecs.extendedDimensions || '1400 × 600 × 1100 mm',
    netWeight: metaSpecs.netWeight || '5.20 kg',
    grossWeight: metaSpecs.grossWeight || '5.80 kg',
    packagingType: metaSpecs.packagingType || 'Corrugated Master Box',
    unitsPerCarton: metaSpecs.unitsPerCarton || '1 Unit / Box',
    warranty: metaSpecs.warranty || '1 Year Guarantee',
    corrosionResistance: metaSpecs.corrosionResistance || 'Rust Resistant',
  };
}

export function getResolvedBomFormula(product: DetailedProduct): ProductBomComponent[] {
  const metaBom = product.metadata?.bomFormula;
  if (Array.isArray(metaBom) && metaBom.length > 0) {
    return metaBom.map((item) => ({
      component: String(item.component || ''),
      code: item.code || undefined,
      category: item.category || 'RAW_MATERIAL',
      quantity: item.quantity ?? 1,
      uom: String(item.uom || 'pcs'),
      scrapAllowance: item.scrapAllowance || '1.0%',
      unitCost: item.unitCost || 0,
      note: item.note || undefined,
    }));
  }

  // Do not invent a BOM when the product has no persisted formula.
  return [];

  const sku = (product.sku || '').toUpperCase();
  const name = (product.name || '').toUpperCase();

  // 1. CS12 - per 1 stand
  if (sku.includes('CS12') || sku.includes('CS-12') || name.includes('CS12') || name.includes('CS-12')) {
    return [
      { component: 'SS 3/4" × 0.8mm Pipe – 12 Feet', code: 'CS12-PIPE-3/4-12FT', category: 'RAW_MATERIAL', quantity: 4, uom: 'Pipes (≈5.18 kg)', scrapAllowance: '1.0%', unitCost: 260, note: 'Primary upright structural frame pipes' },
      { component: 'SS 3/4" × 0.8mm Pipe – 20.5 Feet', code: 'CS12-PIPE-3/4-20.5FT', category: 'RAW_MATERIAL', quantity: 2, uom: 'Pipes (≈2.59 kg)', scrapAllowance: '1.0%', unitCost: 440, note: 'Secondary upper rails & cross-members' },
      { component: 'Lower Frame (with rods / without rods)', code: 'CS12-SUB-LOWER-FRAME', category: 'SUB_ASSEMBLY', quantity: '1 + 1', uom: 'Nos.', scrapAllowance: '0.5%', unitCost: 195, note: 'Pre-welded lower modular deck frame pair' },
      { component: 'Top Frame (with rods / without rods)', code: 'CS12-SUB-TOP-FRAME', category: 'SUB_ASSEMBLY', quantity: '1 + 1', uom: 'Nos.', scrapAllowance: '0.5%', unitCost: 210, note: 'Top tier dual folding sub-frame pair' },
      { component: 'Top Rod', code: 'CS12-ROD-TOP', category: 'RAW_MATERIAL', quantity: 2, uom: 'Nos.', scrapAllowance: '0.5%', unitCost: 45, note: 'Upper reinforcement hanger rods' },
      { component: '748mm Pipe', code: 'CS12-PIPE-748MM', category: 'RAW_MATERIAL', quantity: 4, uom: 'Nos.', scrapAllowance: '0.8%', unitCost: 38, note: 'Intermediate cross-support deck pipes' },
      { component: '776mm Pipe', code: 'CS12-PIPE-776MM', category: 'RAW_MATERIAL', quantity: 9, uom: 'Nos.', scrapAllowance: '0.8%', unitCost: 42, note: 'Main hanging rod tier pipes' },
      { component: 'Side Cap', code: 'CAP-SIDE-CS12', category: 'POLYMERS', quantity: 6, uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 4.5, note: 'Moulded virgin polymer protective caps' },
      { component: 'Bottom Cap', code: 'CAP-BTM-CS12', category: 'POLYMERS', quantity: 4, uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 6.0, note: 'Anti-scratch heavy duty base floor pads' },
      { component: 'SS Hex Bolt 6x40 / 6x50 / 6x60 / 6x70', code: 'FASTENER-HEX-BOLT-M6', category: 'HARDWARE', quantity: '2 / 8 / 1 / 1', uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 3.5, note: 'Complete fastener set (2 of 6x40, 8 of 6x50, 1 of 6x60, 1 of 6x70)' },
      { component: 'Economy SS Screws', code: 'FASTENER-SS-SCREW-ECON', category: 'HARDWARE', quantity: 26, uom: 'Nos.', scrapAllowance: '2.0%', unitCost: 1.2, note: 'Stainless steel self-tapping fixing screws' },
      { component: 'SS 8mm Hex Nut', code: 'FASTENER-HEX-NUT-8MM', category: 'HARDWARE', quantity: 8, uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 1.8, note: 'Grade 304 8mm hexagonal anchor nuts' },
      { component: 'SS 6mm Hex Nut', code: 'FASTENER-HEX-NUT-6MM', category: 'HARDWARE', quantity: 4, uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 1.2, note: 'Grade 304 6mm hexagonal pivot nuts' },
      { component: 'SS Nylock Nut 6mm', code: 'FASTENER-NYLOCK-6MM', category: 'HARDWARE', quantity: 12, uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 2.2, note: 'Vibration-resistant nylon locking nuts' },
    ];
  }

  // 2. CS10 - per 1 stand (Wing-frame design)
  if (sku.includes('CS10') || sku.includes('CS-10') || name.includes('CS10') || name.includes('CS-10')) {
    return [
      { component: 'SS (16×16) × 0.6mm Sq Pipe', code: 'CS10-SQPIPE-16X16', category: 'RAW_MATERIAL', quantity: 2, uom: 'Pipes (≈2.59 kg)', scrapAllowance: '1.0%', unitCost: 195, note: 'Wing frame and outer structural square pipe' },
      { component: 'SS (18×18) × 0.6mm Sq Pipe', code: 'CS10-SQPIPE-18X18', category: 'RAW_MATERIAL', quantity: 1, uom: 'Pipe (≈1.295 kg)', scrapAllowance: '1.0%', unitCost: 215, note: 'Main upright column square pipe' },
      { component: 'Top Frame – 3205mm', code: 'CS10-FRAME-TOP-3205MM', category: 'SUB_ASSEMBLY', quantity: 1, uom: 'Nos.', scrapAllowance: '0.5%', unitCost: 180, note: 'Continuous top span welded frame' },
      { component: 'Side Wing – 1388mm', code: 'CS10-FRAME-WING-1388MM', category: 'SUB_ASSEMBLY', quantity: 2, uom: 'Nos.', scrapAllowance: '0.5%', unitCost: 95, note: 'Dual foldable lateral wing frames' },
      { component: 'Bottom Legs Frame – 2200mm', code: 'CS10-FRAME-LEGS-2200MM', category: 'SUB_ASSEMBLY', quantity: 2, uom: 'Nos.', scrapAllowance: '0.5%', unitCost: 140, note: 'Wide-stance stability base bottom leg frame' },
      { component: 'Main Rods – 1135mm', code: 'CS10-ROD-MAIN-1135MM', category: 'RAW_MATERIAL', quantity: 5, uom: 'Nos.', scrapAllowance: '0.8%', unitCost: 48, note: 'Central deck heavy duty hanging rods' },
      { component: 'Wing Rods – 523mm', code: 'CS10-ROD-WING-523MM', category: 'RAW_MATERIAL', quantity: 8, uom: 'Nos.', scrapAllowance: '0.8%', unitCost: 24, note: 'Lateral side wing hanging rods' },
      { component: 'Holding Tube / Holding Plate', code: 'CS10-HOLDING-ASSY', category: 'SUB_ASSEMBLY', quantity: '1 / 4', uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 65, note: '1 Holding tube + 4 SS holding brackets' },
      { component: 'Connecting Tube 5/16"', code: 'CS10-CONN-TUBE-5/16', category: 'RAW_MATERIAL', quantity: 6, uom: 'Nos.', scrapAllowance: '0.5%', unitCost: 18, note: 'Pivot hinge connecting sleeves' },
      { component: 'SS 6x25 Pan Philips Screw', code: 'FASTENER-PAN-PHILIPS-6X25', category: 'HARDWARE', quantity: 26, uom: 'Nos.', scrapAllowance: '2.0%', unitCost: 1.1, note: 'Precision pan head phillips screws' },
      { component: 'SS Hex Bolt 6x50 / 6x30 / 6x40', code: 'FASTENER-HEX-BOLT-SET-CS10', category: 'HARDWARE', quantity: '4 / 4 / 2', uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 3.2, note: '4 of 6x50, 4 of 6x30, 2 of 6x40 SS bolts' },
      { component: 'SS Hex Nut / Dome Nut / Nylock Nut 6mm', code: 'FASTENER-NUTS-SET-6MM', category: 'HARDWARE', quantity: '2 / 2 / 8', uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 2.5, note: '2 hex nuts, 2 decorative dome caps, 8 nylock nuts' },
      { component: 'Plain Washer 6x16mm / 6x12mm', code: 'FASTENER-WASHER-PLAIN-6MM', category: 'HARDWARE', quantity: '2 / 8', uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 0.8, note: '2 wide (6x16mm) + 8 standard (6x12mm) plain washers' },
      { component: 'Plastic Washer 8mm', code: 'POLYMERS-WASHER-8MM', category: 'POLYMERS', quantity: 4, uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 1.0, note: 'Friction-reducing nylon pivot washers' },
      { component: '16x16 Square Top Cap / Bottom Cap', code: 'CAP-16X16-SQ-SET', category: 'POLYMERS', quantity: '4 / 4', uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 3.5, note: '4 square top end caps + 4 bottom shoe caps' },
    ];
  }

  // 3. CS8 - per 1 stand (same family as CS12, smaller frame)
  if (sku.includes('CS8') || sku.includes('CS-8') || sku.startsWith('CS08') || name.includes('CS8') || name.includes('CS-8')) {
    return [
      { component: 'SS 3/4" × 0.8mm Pipe – 12 Feet', code: 'CS8-PIPE-3/4-12FT', category: 'RAW_MATERIAL', quantity: 4, uom: 'Pipes (≈5.18 kg)', scrapAllowance: '1.0%', unitCost: 260, note: 'Upright structural frame pipes' },
      { component: 'SS 3/4" × 0.8mm Pipe – 20.5 Feet', code: 'CS8-PIPE-3/4-20.5FT', category: 'RAW_MATERIAL', quantity: 2, uom: 'Pipes (≈2.59 kg)', scrapAllowance: '1.0%', unitCost: 440, note: 'Upper rails & cross-members' },
      { component: 'Lower/Top Frame (with & without rods)', code: 'CS8-SUB-FRAME-PAIR', category: 'SUB_ASSEMBLY', quantity: '~1 each', uom: 'Nos.', scrapAllowance: '0.5%', unitCost: 185, note: 'Modular frame tier assembly sets' },
      { component: 'Top Rod', code: 'CS8-ROD-TOP', category: 'RAW_MATERIAL', quantity: '~2', uom: 'Nos.', scrapAllowance: '0.5%', unitCost: 42, note: 'Top stabilizer rods' },
      { component: '827mm Pipe', code: 'CS8-PIPE-827MM', category: 'RAW_MATERIAL', quantity: '~4.5', uom: 'Nos.', scrapAllowance: '0.8%', unitCost: 36, note: 'Intermediate deck rod pipes' },
      { component: '860mm Pipe', code: 'CS8-PIPE-860MM', category: 'RAW_MATERIAL', quantity: '~9', uom: 'Nos.', scrapAllowance: '0.8%', unitCost: 40, note: 'Main tier hanging rod pipes' },
      { component: 'Side Cap / Bottom Cap', code: 'CAP-SET-CS8', category: 'POLYMERS', quantity: '~5.4 / ~3.6', uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 5.0, note: 'Polymer end caps and base floor pads' },
      { component: 'Hex bolts, nuts, washers', code: 'FASTENER-SET-CS8', category: 'HARDWARE', quantity: '1 set', uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 65, note: 'Similar fastener set to CS12 in slightly lower ratio' },
    ];
  }

  // 4. CS9 - per 1 stand
  if (sku.includes('CS9') || sku.includes('CS-9') || sku.startsWith('CS09') || name.includes('CS9') || name.includes('CS-9')) {
    return [
      { component: 'Frame pipes 1,2,3,6,7 (18x18/10x20 variants)', code: 'CS9-FRAME-PIPES-SET', category: 'RAW_MATERIAL', quantity: '2–4 each', uom: 'Nos.', scrapAllowance: '1.0%', unitCost: 145, note: '18x18 square and 10x20 rectangular frame upright variants' },
      { component: 'CS9 Pipe 753mm / 783mm', code: 'CS9-PIPE-753/783MM', category: 'RAW_MATERIAL', quantity: '8 / 3', uom: 'Nos.', scrapAllowance: '0.8%', unitCost: 35, note: '8 of 753mm deck rods + 3 of 783mm top rods' },
      { component: '10x20 Semi Round Cap', code: 'CAP-10X20-SEMI-ROUND', category: 'POLYMERS', quantity: 16, uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 2.2, note: 'Black virgin ABS protective caps' },
      { component: '18x18 Square Top/Bottom Cap', code: 'CAP-18X18-SQ-SET', category: 'POLYMERS', quantity: '4 / 4', uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 3.5, note: '4 top end plugs + 4 heavy-duty base leg shoes' },
      { component: '8mm Plastic Washer', code: 'POLYMERS-WASHER-8MM', category: 'POLYMERS', quantity: 14, uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 1.0, note: 'Pivot arm nylon smooth friction washers' },
      { component: 'SS Pan Head Screw 6x32 / 6x50', code: 'FASTENER-PAN-SCREW-6X32/50', category: 'HARDWARE', quantity: '12 / 10', uom: 'Nos.', scrapAllowance: '2.0%', unitCost: 1.4, note: '12 of 6x32 + 10 of 6x50 stainless steel screws' },
      { component: 'SS Plain Washer 6x16mm', code: 'FASTENER-PLAIN-WASHER-6X16', category: 'HARDWARE', quantity: 4, uom: 'Nos.', scrapAllowance: '0.0%', unitCost: 0.8, note: 'Heavy duty SS plain load-distributing washers' },
    ];
  }

  // 5. CS3 - per 1 full pack
  if (sku.includes('CS3') || sku.includes('CS-3') || sku.startsWith('CS03') || name.includes('CS3') || name.includes('CS-3')) {
    return [
      { component: 'CS3 Short Patti', code: 'CS3-SHORT-PATTI', category: 'RAW_MATERIAL', quantity: 4, uom: 'Pcs', scrapAllowance: '0.5%', unitCost: 28, note: 'Laser-cut stainless steel pivot links' },
      { component: 'CS3 Long Patti', code: 'CS3-LONG-PATTI', category: 'RAW_MATERIAL', quantity: 12, uom: 'Pcs', scrapAllowance: '0.5%', unitCost: 45, note: 'Foldable trellis scissor extension arms' },
      { component: 'CS3 RHS Bend / LHS Bend', code: 'CS3-BEND-RHS-LHS', category: 'RAW_MATERIAL', quantity: '1 / 1', uom: 'Pcs', scrapAllowance: '0.5%', unitCost: 55, note: '1 Right-hand bend + 1 Left-hand bend wall brackets' },
      { component: 'CS3 Inner Box / Outer Box', code: 'CS3-PACK-BOXES', category: 'PACKAGING', quantity: '1 / 1', uom: 'Box', scrapAllowance: '0.0%', unitCost: 38, note: '1 printed individual product carton + 1 corrugated outer pack' },
      { component: 'Spot Weld 9.5mm Rods – 2 Feet', code: 'CS3-ROD-9.5MM-2FT', category: 'RAW_MATERIAL', quantity: 7, uom: 'Pcs', scrapAllowance: '0.5%', unitCost: 22, note: '7 pre-cut 2ft rods with spot-weld end prep' },
      { component: 'SS Hex Bolt 5x12', code: 'FASTENER-HEX-BOLT-5X12', category: 'HARDWARE', quantity: 20, uom: 'Pcs', scrapAllowance: '0.0%', unitCost: 1.2, note: 'Scissor lattice stainless pivot bolts' },
      { component: 'SS Hex Bolt 5x20', code: 'FASTENER-HEX-BOLT-5X20', category: 'HARDWARE', quantity: 4, uom: 'Pcs', scrapAllowance: '0.0%', unitCost: 1.5, note: 'Wall bracket anchor pivot bolts' },
      { component: 'SS Plain Washer 6mm', code: 'FASTENER-PLAIN-WASHER-6MM', category: 'HARDWARE', quantity: 64, uom: 'Pcs', scrapAllowance: '0.0%', unitCost: 0.5, note: 'Anti-friction spacing washers for all scissor joints' },
      { component: 'SS Nylock Nut 5mm', code: 'FASTENER-NYLOCK-5MM', category: 'HARDWARE', quantity: 10, uom: 'Pcs', scrapAllowance: '0.0%', unitCost: 1.8, note: 'Self-locking nuts for smooth folding articulation' },
      { component: 'SS Screw 8x38 CSK', code: 'FASTENER-SCREW-8X38-CSK', category: 'HARDWARE', quantity: 4, uom: 'Pcs', scrapAllowance: '0.0%', unitCost: 2.0, note: 'Countersunk wall-mounting stainless steel screws' },
      { component: 'Luxury Wall Plug', code: 'HARDWARE-WALL-PLUG', category: 'HARDWARE', quantity: 4, uom: 'Pcs', scrapAllowance: '0.0%', unitCost: 1.5, note: 'Heavy-grip nylon masonry wall expansion plugs' },
    ];
  }

  // 6. CS11 (Default for other CS models or CS11 stands) - per 1 stand
  return [
    {
      component: 'SS (18x18) x 0.6mm Sq Pipe',
      code: 'CS11-PIPE-18X18',
      category: 'RAW_MATERIAL',
      quantity: 0.8,
      uom: 'Pipes',
      scrapAllowance: '1.2%',
      unitCost: 215,
      note: 'Batch ran in fractional units — round up to 1 per unit',
    },
    {
      component: 'SS (20x10) x 0.6mm Sq Pipe',
      code: 'CS11-PIPE-20X10',
      category: 'RAW_MATERIAL',
      quantity: 1.3,
      uom: 'Pipes',
      scrapAllowance: '1.2%',
      unitCost: 175,
      note: 'Round up to 1–2 per finished unit',
    },
    {
      component: 'SS 1/2" x 0.6mm Pipe',
      code: 'CS11-PIPE-1/2',
      category: 'RAW_MATERIAL',
      quantity: '1.5–2.2',
      uom: 'Pipes',
      scrapAllowance: '0.8%',
      unitCost: 140,
      note: 'Drying rail pipes for top and lower tiers',
    },
    {
      component: 'Frame pipes 1–8 (various 18x18/10x20, 250–1200mm)',
      code: 'CS11-FRAME-PIPES-1-8',
      category: 'RAW_MATERIAL',
      quantity: '2–4 each',
      uom: 'Nos.',
      scrapAllowance: '1.5%',
      unitCost: 160,
      note: 'Cut length 250–1200mm with precision punch and miter bends',
    },
    {
      component: 'CS11 Pipe 853mm / 883mm',
      code: 'CS11-PIPE-853/883MM',
      category: 'RAW_MATERIAL',
      quantity: '11 / 6',
      uom: 'Nos.',
      scrapAllowance: '0.8%',
      unitCost: 48,
      note: '11 of 853mm lower deck rods + 6 of 883mm upper wings rods',
    },
    {
      component: '(10x20) Semi Round Cap',
      code: 'CAP-10X20-SEMI-ROUND',
      category: 'POLYMERS',
      quantity: 32,
      uom: 'Nos.',
      scrapAllowance: '0.0%',
      unitCost: 2.2,
      note: 'Virgin ABS black polymer anti-scratch end plugs',
    },
    {
      component: '(18x18) Square Top/Bottom Cap',
      code: 'CAP-18X18-SQ-SET',
      category: 'POLYMERS',
      quantity: '4 / 4',
      uom: 'Nos.',
      scrapAllowance: '0.0%',
      unitCost: 3.5,
      note: '4 square top caps + 4 heavy duty floor anti-skid shoes',
    },
    {
      component: '8mm Plastic Washer',
      code: 'POLYMERS-WASHER-8MM',
      category: 'POLYMERS',
      quantity: 30,
      uom: 'Nos.',
      scrapAllowance: '0.0%',
      unitCost: 1.0,
      note: 'High-friction nylon articulation washers',
    },
    {
      component: 'SS Pan Head Screw 6x32 / 6x50',
      code: 'FASTENER-PAN-SCREW-6X32/50',
      category: 'HARDWARE',
      quantity: '22 / 12',
      uom: 'Nos.',
      scrapAllowance: '2.0%',
      unitCost: 1.4,
      note: '22 of 6x32 + 12 of 6x50 stainless steel machine screws',
    },
    {
      component: 'SS Plain Washer 6x16mm',
      code: 'FASTENER-PLAIN-WASHER-6X16',
      category: 'HARDWARE',
      quantity: 4,
      uom: 'Nos.',
      scrapAllowance: '0.0%',
      unitCost: 0.8,
      note: 'Grade 304 load distributing plain washers',
    },
    {
      component: 'CS11 Chain 3mm',
      code: 'CS11-CHAIN-3MM',
      category: 'HARDWARE',
      quantity: 2,
      uom: 'Nos.',
      scrapAllowance: '0.0%',
      unitCost: 42,
      note: 'Zinc-passivated safety tension lock chain',
    },
  ];
}

export function getResolvedWarehouseStocks(
  product: DetailedProduct,
  liveBalances?: Array<{
    locationId?: string;
    location?: { id?: string; code?: string; name?: string } | null;
    onHandQuantity?: number;
    reservedQuantity?: number;
    available?: number;
  }>
): ProductWarehouseStock[] {
  const unitCost = Number(product.metadata?.costPrice || 0);
  const initialQty = Number(product.metadata?.initialQuantity || 0);

  if (Array.isArray(liveBalances) && liveBalances.length > 0) {
    return liveBalances.map((live) => {
      const onHand = Number(live.onHandQuantity ?? 0);
      const reserved = Number(live.reservedQuantity ?? 0);
      const available = live.available !== undefined ? Number(live.available) : Math.max(0, onHand - reserved);

      let status: 'OPTIMAL' | 'LOW' | 'CRITICAL' | 'OVERSTOCK' = 'OPTIMAL';
      if (available === 0) status = 'CRITICAL';
      else if (available < 20) status = 'LOW';
      else if (available > 400) status = 'OVERSTOCK';

      return {
        locationId: live.locationId || live.location?.id || 'unassigned',
        locationCode: live.location?.code || live.locationId || 'UNASSIGNED',
        locationName: live.location?.name || 'Unassigned location',
        onHand,
        reserved,
        available,
        inTransit: 0,
        unitCost,
        status,
      };
    });
  }

  if (initialQty > 0) {
    let status: 'OPTIMAL' | 'LOW' | 'CRITICAL' | 'OVERSTOCK' = 'OPTIMAL';
    if (initialQty === 0) status = 'CRITICAL';
    else if (initialQty < 20) status = 'LOW';
    else if (initialQty > 400) status = 'OVERSTOCK';

    return [
      {
        locationId: 'main-store',
        locationCode: 'MAIN-STORE',
        locationName: 'Main Store / Opening Stock',
        onHand: initialQty,
        reserved: 0,
        available: initialQty,
        inTransit: 0,
        unitCost,
        status,
      }
    ];
  }

  return [];
}

export function getResolvedMovements(): ProductMovementRow[] {
  // Kept for compatibility with older consumers. Product detail now reads
  // movements from the authoritative inventory ledger via useStockLedger.
  return [];
}

export function getResolvedOrders(): ProductLinkedOrder[] {
  // Orders are populated by the live sales, purchasing, and production APIs.
  // Keep the resolver empty until those records are linked to this product;
  // fabricated order history is misleading in a production profile.
  return [];
}
