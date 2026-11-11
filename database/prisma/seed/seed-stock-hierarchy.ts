import { PrismaClient, LifecycleStatus, MaterialType } from '@prisma/client';

const prisma = new PrismaClient();

const toCode = (v: string) =>
  String(v || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

interface StockItemRow {
  mainCategory: string;
  subcategory: string;
  itemName: string;
  sku: string;
}

const STOCK_DATA: StockItemRow[] = [
  // MAIN CATEGORY: RAW MATERIAL
  { mainCategory: 'RAW MATERIAL', subcategory: 'BLACKES', itemName: 'JET BLACK', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'BOX #55ES BOXES', itemName: 'PLASTIC BOX #55', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'BOXES', itemName: 'CB-2L BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'BOXES', itemName: 'CB1 - BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'BOXES', itemName: 'CC1 BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'BOXES', itemName: 'CS11 MAIN BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'BOXES', itemName: 'CS12 - JACKET BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'BOXES', itemName: 'CS15 BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'BOXES', itemName: 'ECONOMY ACCESSORIES BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'BOXES', itemName: 'LUXURY ACCESSORIES BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'BRACKETES', itemName: 'GLIDER SS BRACKET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'BUMPERES', itemName: 'SILICON BUMPER', sku: '-' },

  // MAIN CATEGORY: FINISHED GOODS
  { mainCategory: 'FINISHED GOODS', subcategory: 'CHOPING BOADRD', itemName: 'PLINTH SS304 CHOPPING BOARD 10x13.5" SY-CB12', sku: 'CB12' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CHOPING BOADRD', itemName: 'PLINTH SS304 CHOPPING BOARD 12x20" SY-CB13', sku: 'CB13' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CHOPING BOADRD', itemName: 'PLINTH SS304 CHOPPING BOARD 8x12" SY-CB11', sku: 'CB11' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CHOPING BOARD', itemName: 'PLINTH 10 x 14" ACACIA CHOPPING BOARD  SY-CB21', sku: 'SY-CB21' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CHOPING BOARD', itemName: 'PLINTH 10" x 14" TEAK CHOPPING BOARD SY-CB1', sku: 'SY-CB1' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CHOPING BOARD', itemName: 'PLINTH 16" x 11" ACACIA CHOPPING BOARD SY-CB22L', sku: 'SY-CB22L' },

  // MAIN CATEGORY: RAW MATERIAL
  { mainCategory: 'RAW MATERIAL', subcategory: 'CHOPPING BOARD', itemName: 'CHOPPING BOARD CB-22L - RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CHOPPING BOARD', itemName: 'CHOPPING BOARD CB-2L - RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CHOPPING BOARD', itemName: 'CHOPPING BOARD CB1 - RAW', sku: 'CB1-RAW' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CHOPPING BOARD', itemName: 'CHOPPING BOARD CB21 - RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CLIPPERES', itemName: 'EZEE CLOTH CLIPPER', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CLIPS', itemName: 'ADI JUNIOR CLOTH CLIPS', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CLIPS', itemName: 'CC1 CLIPS - RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CLIPS', itemName: 'NO 2 # CLIPS', sku: '-' },

  // MAIN CATEGORY: FINISHED GOODS
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH CLIPS', itemName: 'PAIR OF EZEE CLOTH CLIPPER SY-CS7', sku: 'SY-CS7' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH CLIPS', itemName: 'PLINTH 18 PCS SS CLOTH CLIP WITH GRIP SY-CC1', sku: 'SY-CC1' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH CLIPS', itemName: 'PLINTH PLASTIC CLIPS SY-CC2', sku: 'SY-CC2' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH - 1 TIER - FLOOR CLOTH DRYER SY-CS19-L1', sku: 'SY-CS19-L1' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH - 1-TIER-FLOOR CLOTH DRYER SY-CS20-L1', sku: 'SY-CS20-L1' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH 2 TIER CLOTH STAND SY-CS21-L2', sku: 'SY-CS21-L2' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH 2-TIER CLOTH STAND GREY SY-CS20-L2', sku: 'SY-CS20-L2' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH 2-TIER CLOTH STAND SY-CS19-L2', sku: 'SY-CS19-L2' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH 3 RODS WALL MOUNTING CLOTH DRYER', sku: '-' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH 3 TIER CLOTH STAND BLUE SY-CS19', sku: 'SY-CS19' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH 3 TIER CLOTH STAND WHITE SY-CS21', sku: 'SY-CS21' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH 4-TIER CLOTH STAND GREY SY-CS20-L4', sku: 'SY-CS20-L4' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH 4-TIER CLOTH STAND SY-CS19-L4', sku: 'SY-CS19-L4' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH 4-TIER CLOTH STAND SY-CS21-L4', sku: 'SY-CS21-L4' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH CLOTH STAND SY-CS19 - 304', sku: 'SY-CS19-304' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH CLOTH STAND SY-CS20 GREY', sku: 'SY-CS20' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH CLOTH STAND SY-CS20- COMBO', sku: 'CS20- COMBO' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH CLOTH STAND SY-CS21 - 304', sku: 'SY-CS21-304' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH CLOTH STAND SY-CS21-COMBO', sku: 'SY-CS21-COMBO' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH CLOTH STHAND SY- CS20-L2 BLACK', sku: '-' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'CLOTH STAND', itemName: 'PLINTH SS DOUBLE POLE CLOTH STAND COMBO SY-CS5.3', sku: 'CS5.3' },

  // MAIN CATEGORY: RAW MATERIAL
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS10 - BOTTOM', itemName: 'CS10 - BOTTOM LEGS FRAME - 2200', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS10 - MAIN', itemName: 'CS10 - MAIN RODS (9.5) - 1135', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS10 - SIDE', itemName: 'CS10 - SIDE WING - 1388', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS10 - TOP FRAMES', itemName: 'CS10 - TOP FRAME - 3205', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS10 - WING RODS', itemName: 'CS10 - WING RODS (9.5) - 523', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS11 - PIPE', itemName: 'CS11 - PIPE 1 - (18x18) - 1200mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS11 - PIPE', itemName: 'CS11 - PIPE 2 - (18x18) -  1200mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS11 - PIPE', itemName: 'CS11 - PIPE 3 - (10x20) - 450mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS11 - PIPE', itemName: 'CS11 - PIPE 4 - (10x20) - 650mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS11 - PIPE', itemName: 'CS11 - PIPE 5 - (10x20) - 450mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS11 - PIPE', itemName: 'CS11 - PIPE 6 - (10x20) - 250mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS11 - PIPE', itemName: 'CS11 - PIPE 7 - (10x20) - 450mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS11 - PIPE', itemName: 'CS11 - PIPE 8 - (10x20) - 650mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS11 - SS', itemName: 'CS11 - SS 1/2" x 0.6mm - 853mm', sku: 'CS11 - 853mm' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS11 - SS', itemName: 'CS11 - SS 1/2" x 0.6mm - 883mm', sku: 'CS11 - 883mm' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS11 RAW MATERIAL', itemName: 'CS11  CHAIN 3mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS11 RAW MATERIAL', itemName: 'CS11 LEG', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS12 - LOWER', itemName: 'CS12 - LOWER FRAME WITH RODS (2660)', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS12 - LOWER', itemName: 'CS12 - LOWER FRAME WITHOUT RODS (2710)', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS12 - TOP', itemName: 'CS12 - TOP FRAME WITH RODS (2670)', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS12 - TOP', itemName: 'CS12 - TOP FRAME WITHOUT RODS (2720)', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - B ROD', itemName: 'CS19 - B ROD - 304', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - B ROD', itemName: 'CS19 - B ROD - L1', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - C ROD', itemName: 'CS19 - C-ROD - 304', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - D ROD', itemName: 'CS19 - D ROD - L4', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - E ROD', itemName: 'CS19 - E ROD - L4', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - F ROD', itemName: 'CS19 - F ROD - L4', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - NUT SCREWS', itemName: 'CS19 - NUT - 5mm LOCKNUT', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - PARTS', itemName: 'CS19 - BASE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - PARTS', itemName: 'CS19 - HANGER HOLDER', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - PARTS', itemName: 'CS19 - INNER BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - PARTS', itemName: 'CS19 - L CONNECTOR', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - PARTS', itemName: 'CS19 - L NUT - L4', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - PARTS', itemName: 'CS19 - MIDDLE CONNECTOR', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 PARTS', itemName: 'CS19 - WING PATTI', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - PARTS', itemName: 'CS19 - TOP CONNECTOR', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - RODES', itemName: 'CS19 - C-ROD', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - SCREWS', itemName: 'CS19 - SCREW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - WHEELS LOCK', itemName: 'CS19 - WHEELS WITH LOCK', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - WHEELS LOCK', itemName: 'CS19 - WHEELS WITHOUT LOCK', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS19 - WING', itemName: 'CS19 - WING ROD - 304', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS20 PARTS', itemName: 'CS20 - BASE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS20 PARTS', itemName: 'CS20 - HANGER HOLDER', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS20 PARTS', itemName: 'CS20 - L NUT - L4', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS20 PARTS', itemName: 'CS20 - MIDDLE CONNECTOR', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS20 PARTS', itemName: 'CS20 - TOP CONNECTOR', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS20 PARTS', itemName: 'CS20 - WING PATTI', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS20 PARTS', itemName: 'CS20 L-CONNECTOR', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS21 PARTS', itemName: 'CS21 - BASE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS21 PARTS', itemName: 'CS21 - HANGER HOLDER', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS21 PARTS', itemName: 'CS21 - L CONNECTOR', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS21 PARTS', itemName: 'CS21 - L NUT - L4', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS21 PARTS', itemName: 'CS21 - MIDDLE CONNECTOR', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS21 PARTS', itemName: 'CS21 - TOP CONNECTOR', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS21 PARTS', itemName: 'CS21 - WING PATTI', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS3 BOXES', itemName: 'CS3 - INNER BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS3 BOXES', itemName: 'CS3 OUTER BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS8 - LOWER', itemName: 'CS8 - LOWER FRAME WITH RODS (3020)', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS8 - LOWER', itemName: 'CS8 - LOWER FRAME WITHOUT RODS (3070)', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS8 - TOP', itemName: 'CS8 - TOP FRAME WITH RODS (3030)', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS8 - TOP', itemName: 'CS8 - TOP FRAME WITHOUT RODS (3080)', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS9 - PIPE', itemName: 'CS9 - PIPE 1 - (18x18) - 1200mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS9 - SS', itemName: 'CS9 - SS 1/2" x 0.6mm - 753mm', sku: 'CS9 - 753mm' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'CS9 - SS', itemName: 'CS9 - SS 1/2" x 0.6mm - 783mm', sku: 'CS9 - 783mm' },

  // MAIN CATEGORY: FINISHED GOODS
  { mainCategory: 'FINISHED GOODS', subcategory: 'ECONOMY PACKED', itemName: 'PLINTH ECONOMY 6 PIPE x 6 FEET SY-CE3-304', sku: 'SY-CE3-304' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'ECONOMY PACKED', itemName: 'PLINTH ECONOMY PULLEY 6 PIPE x 4 FEET SY-CE1', sku: 'SY-CE1' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'ECONOMY PACKED', itemName: 'PLINTH ECONOMY PULLEY 6 PIPE x 6 FEET SY-CE3', sku: 'SY-CE3' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'ECONOMY PACKED', itemName: 'PLINTH ECONOMY PULLEY 6 PIPES x 5 FEET SY-CE2', sku: 'SY-CE2' },

  // MAIN CATEGORY: RAW MATERIAL
  { mainCategory: 'RAW MATERIAL', subcategory: 'ECONOMY ROPE', itemName: 'ECONOMY ROPE BRAIDED 5mm - CUT', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'ECONOMY ROPE', itemName: 'ECONOMY ROPE BRAIDED 5mm - RAW', sku: '-' },

  // MAIN CATEGORY: FINISHED GOODS
  { mainCategory: 'FINISHED GOODS', subcategory: 'FINISHED GOODS', itemName: 'ECONOMY ACCESSORIES SY-CE-ACC', sku: 'SY-CE-ACC' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'FINISHED GOODS', itemName: 'ECONOMY SPARE ROPE CE-ROPE', sku: 'SY-CE-ROPE' },

  // MAIN CATEGORY: RAW MATERIAL
  { mainCategory: 'RAW MATERIAL', subcategory: 'FRAMES', itemName: 'ECONOMY - 6 PIPES - ACCESSORIES', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'FRAMES', itemName: 'ECONOMY - 6 PIPES - FRAME PACKED', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'FRAMES', itemName: 'ECONOMY - FRAME RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'FRAMES', itemName: 'GLIDER - 3 PIPES - FRAME PACKED', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'FRAMES', itemName: 'GLIDER - 3 PIPES - RAW LHS', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'FRAMES', itemName: 'GLIDER - 3 PIPES - RAW RHS', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'FRAMES', itemName: 'GLIDER - 4 PIPES - FRAME PACKED', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'FRAMES', itemName: 'GLIDER - 4 PIPES - RAW LHS', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'FRAMES', itemName: 'GLIDER - 4 PIPES - RAW RHS', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'FRAMES', itemName: 'GLIDER - 5 PIPES - FRAME PACKED', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'FRAMES', itemName: 'GLIDER - 5 PIPES - RAW LHS', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'FRAMES', itemName: 'GLIDER - 5 PIPES - RAW RHS', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'FRAMES', itemName: 'GLIDER - 6 PIPES - FRAME PACKED', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'FRAMES', itemName: 'GLIDER - 6 PIPES - RAW LHS', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'FRAMES', itemName: 'GLIDER - 6 PIPES - RAW RHS', sku: '-' },

  // MAIN CATEGORY: FINISHED GOODS
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 3 PIPE x 2 FEET SY-GL1-3P', sku: 'SY-GL1-3P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 3 PIPE x 3 FEET SY-GL2-3P', sku: 'SY-GL2-3P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 3 PIPE x 4 FEET SY-GL3-3P', sku: 'SY-GL3-3P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 3 PIPE x 5 FEET SY-GL4-3P', sku: 'SY-GL4-3P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 3 PIPE x 6 FEET SY-GL5-3P', sku: 'SY-GL5-3P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 4 PIPE x 2 FEET SY-GL1-4P', sku: 'SY-GL1-4P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 4 PIPE x 3 FEET SY-GL2-4P', sku: 'SY-GL2-4P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 4 PIPE x 4 FEET SY-GL3-4P', sku: 'SY-GL3-4P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 4 PIPE x 5 FEET SY-GL4-4P', sku: 'SY-GL4-4P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 4 PIPE x 6 FEET SY-GL5-4P', sku: 'SY-GL5-4P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 5 PIPE x 2 FEET SY-GL1', sku: 'SY-GL1' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 5 PIPE x 3 FEET SY-GL2', sku: 'SY-GL2' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 5 PIPE x 4 FEET SY-GL3', sku: 'SY-GL3' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 5 PIPE x 5 FEET SY-GL4', sku: 'SY-GL4' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 5 PIPE x 6 FEET SY-GL5', sku: 'SY-GL5' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 6 PIPE x 2 FEET SY-GL11', sku: 'SY-GL11' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 6 PIPE x 3 FEET SY-GL12', sku: 'SY-GL12' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 6 PIPE x 4 FEET SY-GL13', sku: 'SY-GL13' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 6 PIPE x 5 FEET SY-GL14', sku: 'SY-GL14' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'GLIDER PACKED', itemName: 'PLINTH GLIDER 6 PIPE x 6 FEET SY-GL15', sku: 'SY-GL15' },

  // MAIN CATEGORY: RAW MATERIAL
  { mainCategory: 'RAW MATERIAL', subcategory: 'GLIDER SCREW', itemName: 'GLIDER SCREW 10*50 CSK PHILIPS', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'GLIDER SCREW', itemName: 'GLIDER SS 6*25 PAN PHILIPS MACHINE SCREW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'GLIDER SCREW', itemName: 'GLIDER WALL PLUG 50*12', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'GLIDERES', itemName: 'CUSTOMISED GLIDER', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'HOLDING', itemName: 'CS10 - HOLDING PLATE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'HOLDING', itemName: 'CS10 - HOLDING TUBE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'HOOKES', itemName: 'ECONOMY HOOK', sku: '-' },

  // MAIN CATEGORY: PLASTIC RAW MATERIAL
  { mainCategory: 'PLASTIC RAW MATERIAL', subcategory: 'IFB WHITE', itemName: 'IFB WHITE', sku: '-' },

  // MAIN CATEGORY: RAW MATERIAL
  { mainCategory: 'RAW MATERIAL', subcategory: 'IRON BAR', itemName: 'IRON BAR - 72142090', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'IRONING MAT', itemName: 'IRONING MAT IM1 - RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'IRONING MAT', itemName: 'IRONING MAT IM2 - RAW', sku: '-' },

  // MAIN CATEGORY: FINISHED GOODS
  { mainCategory: 'FINISHED GOODS', subcategory: 'IRONING MAT', itemName: 'PLINTH ALUMINISED IRONING MAT SY-IM2', sku: 'SY-IM2' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'IRONING MAT', itemName: 'PLINTH IRONING MAT SY-IM1', sku: 'SY-IM1' },

  // MAIN CATEGORY: RAW MATERIAL
  { mainCategory: 'RAW MATERIAL', subcategory: 'JACKET BOXES', itemName: 'CS8 - JACKET BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'JALI BUNBLE', itemName: 'JALI BUNBLE - 73143900', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'JHUMER', itemName: 'JHUMER SY-CS13 - RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'JHUMER', itemName: 'JHUMER SY-CS14 (4mm) - RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'JHUMER', itemName: 'JHUMER SY-CS15 - RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'JHUMER', itemName: 'JHUMER SY-CS16 - RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'JHUMER', itemName: 'JHUMER SY-CS17 - RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'JHUMER', itemName: 'PLINTH SY-CS13 HEAVY CLIP CLOTH HANGER (25 CLIPS)', sku: 'CS13' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'JHUMER', itemName: 'PLINTH SY-CS15 REGULAR CLIP CLOTH HANGER (25 CLIPS)', sku: 'CS15' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'JHUMER', itemName: 'PLINTH SY-CS16 REGULAR CLIP HEXAGON CLOTH HANGER (27 CLIPS)', sku: 'CS16' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'JHUMER', itemName: 'PLINTH SY-CS17 REGULAR CLIP ROUND CLOTH HANGER (24 CLIPS)', sku: 'CS17.' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'KITCHEN TROLLEY', itemName: 'PLINTH 3 LAYER SQUARE TROLLEY SY-ST-3L', sku: 'SY-ST-3L' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'KITCHEN TROLLEY', itemName: 'PLINTH 5 LAYER SQUARE TROLLEY SY-ST-5L', sku: 'SY-ST-5L' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'KITCHEN TROLLEYS', itemName: 'ROUND TROLLEY 4 LAYERS  ST4L - RAW', sku: '-' },

  // MAIN CATEGORY: FINISHED GOODS
  { mainCategory: 'FINISHED GOODS', subcategory: 'KITCHEN TROLLEYS', itemName: 'PLINTH 2-LAYER SQUARE TROLLEY SY-ST1', sku: 'SY-ST1' },

  // MAIN CATEGORY: RAW MATERIAL
  { mainCategory: 'RAW MATERIAL', subcategory: 'KITCHEN TROLLEYS', itemName: 'PLINTH 4 LAYER SQUARE TROLLEY SY-ST-4L', sku: 'SY-ST-4L' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'KITCHEN TROLLEYS BOXES', itemName: 'ST - 5 TROLLEY BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'KITCHEN TROLLEYS BOXES', itemName: 'ST- 3 TROLLEY BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'KITCHEN TROLLEYS BOXES', itemName: 'ST- 4 TROLLEY BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'KITCHEN TROLLEYS BOXES', itemName: 'ST-3L TROLLEY BOX-OFFLINE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'KITCHEN TROLLEYS BOXES', itemName: 'ST-4L TROLLEY BOX-OFFLINE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'LUXURY - FRAMES', itemName: 'LUXURY - 4 PIPES - ACCESSORIES', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'LUXURY - FRAMES', itemName: 'LUXURY - 4 PIPES - FRAME PACKED', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'LUXURY - FRAMES', itemName: 'LUXURY - 4 PIPES - FRAME RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'LUXURY - FRAMES', itemName: 'LUXURY - 6 PIPES - ACCESSORIES', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'LUXURY - FRAMES', itemName: 'LUXURY - 6 PIPES - FRAME PACKED', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'LUXURY - FRAMES', itemName: 'LUXURY - 6 PIPES - FRAME RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'LUXURY - FRAMES', itemName: 'LUXURY - 8 PIPES - ACCESSORIES', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'LUXURY - FRAMES', itemName: 'LUXURY - 8 PIPES - FRAME PACKED', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'LUXURY - FRAMES', itemName: 'LUXURY - 8 PIPES - FRAME RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'LUXURY BOXES', itemName: 'LUXURY FRAME BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'LUXURY BOXES', itemName: 'LUXURY INNER BOX - BIG', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'LUXURY BOXES', itemName: 'LUXURY INNER BOX - SMALL', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'LUXURY BOXES', itemName: 'LUXURY TOP-CAP BOX', sku: '-' },

  // MAIN CATEGORY: FINISHED GOODS
  { mainCategory: 'FINISHED GOODS', subcategory: 'LUXURY PACKED', itemName: 'LUXURY ACCESSORIES SET SY-CL-ACC', sku: 'SY-CL-ACC' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'LUXURY PACKED', itemName: 'PLINTH 4 PIPES x 4 FEET LUXURY SY-CL1-4P', sku: 'SY-CL1-4P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'LUXURY PACKED', itemName: 'PLINTH 4 PIPES x 5 FEET LUXURY SY-CL2-4P', sku: 'SY-CL2-4P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'LUXURY PACKED', itemName: 'PLINTH 4 PIPES x 6 FEET LUXURY SY-CL3-4P', sku: 'SY-CL3-4P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'LUXURY PACKED', itemName: 'PLINTH 4 PIPES x 7 FEET LUXURY SY-CL4-4P', sku: 'SY-CL4-4P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'LUXURY PACKED', itemName: 'PLINTH 4 PIPES x 8 FEET LUXURY SY-CL5-4P', sku: 'SY-CL5-4P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'LUXURY PACKED', itemName: 'PLINTH 8 PIPES x 4 FEET LUXURY SY-CL1-8P', sku: 'SY-CL1-8P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'LUXURY PACKED', itemName: 'PLINTH 8 PIPES x 5 FEET LUXURY SY-CL2-8P', sku: 'SY-CL2-8P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'LUXURY PACKED', itemName: 'PLINTH 8 PIPES x 6 FEET LUXURY SY-CL3-8P', sku: 'SY-CL3-8P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'LUXURY PACKED', itemName: 'PLINTH 8 PIPES x 7 FEET LUXURY SY-CL4-8P', sku: 'SY-CL4-8P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'LUXURY PACKED', itemName: 'PLINTH 8 PIPES x 8 FEET LUXURY SY-CL5-8P', sku: 'SY-CL5-8P' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'LUXURY PACKED', itemName: 'PLINTH LUXURY CEILING PULLEY 4 FEET SY-CL1', sku: 'SY-CL1' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'LUXURY PACKED', itemName: 'PLINTH LUXURY CEILING PULLEY 5 FEET SY-CL2', sku: 'SY-CL2' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'LUXURY PACKED', itemName: 'PLINTH LUXURY CEILING PULLEY 6 FEET SY-CL3', sku: 'SY-CL3' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'LUXURY PACKED', itemName: 'PLINTH LUXURY CEILING PULLEY 7 FEET SY-CL4', sku: 'SY-CL4' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'LUXURY PACKED', itemName: 'PLINTH LUXURY CEILING PULLEY 8 FEET SY-CL5', sku: 'SY-CL5' },

  // MAIN CATEGORY: RAW MATERIAL
  { mainCategory: 'RAW MATERIAL', subcategory: 'LUXURY ROPE', itemName: 'LUXURY ROPE BRAIDED 3mm - CUT', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'LUXURY ROPE', itemName: 'LUXURY ROPE BRAIDED 3mm - RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'LUXURY SCREW', itemName: 'LUXURY SCREW 8*38 MS PAN HEAD', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'MAIN BOX', itemName: 'CS12 - MAIN BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'MAIN BOXES', itemName: 'CS8 - MAIN BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'ORDERES', itemName: 'LUXURY CUSTOM ORDER', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'OUTER BOX', itemName: 'CS10 - OUTER BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'OUTER BOX', itemName: 'CS12 - OUTER BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'OUTER BOX', itemName: 'CS19 - OUTER BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PACKETES', itemName: 'ECONOMY PACKET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PIPE PACKET', itemName: 'LUXURY 4 PIPE PACKET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PIPE PACKET', itemName: 'LUXURY 6 PIPE PACKET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PIPE PACKET', itemName: 'LUXURY 8 PIPE PACKET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PIPE RAW', itemName: 'SS 2mm SHEET (202)', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PIPES', itemName: 'PLINTH TOWEL ROD 1.5 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLASTIC CAPS', itemName: '10*20 SEMI ROUND CAP', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLASTIC CAPS', itemName: '16*16 SQUARE TOP CAP', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLASTIC CAPS', itemName: '18*18 SQUARE BOTTOM CAP', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLASTIC CAPS', itemName: '18*18 SQUARE TOP CAP', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLASTIC CAPS', itemName: 'CS10 - BOTTOM CAP', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLASTIC CAPS', itemName: 'CS10-SQUARE CAP', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLASTIC CAPS', itemName: 'CS8 - BOTTOM CAP (RUBBER)', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLASTIC CAPS', itemName: 'CS8 - SIDE CAP', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLASTIC CAPS', itemName: 'ECONOMY SIDE CAP', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLASTIC CAPS', itemName: 'GLIDER FRONT CAP - WHITE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLASTIC CAPS', itemName: 'LUXURY BIG CAP - 12mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLASTIC CAPS', itemName: 'LUXURY BIG CAP - 16mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLASTIC CAPS', itemName: 'LUXURY SMALL CAP', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLASTIC MATERIAL', itemName: 'TPR RUBBER MATERIAL', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLASTIC PROCESSING FEE', itemName: 'PLASTIC PROCESSING FEE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLASTIC RAW MATERIAL', itemName: 'ABS NATURAL MATERIAL', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLASTIC RAW MATERIAL', itemName: 'PLASTIC GRANULES PP - NATURAL', sku: 'PP - NATURAL' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLYWOOD - 4412ES', itemName: 'PLYWOOD - 4412', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PULLEY', itemName: 'ECONOMY PULLEY - DOUBLE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PULLEY', itemName: 'ECONOMY PULLEY - SINGLE', sku: '-' },

  // MAIN CATEGORY: FINISHED GOODS
  { mainCategory: 'FINISHED GOODS', subcategory: 'RACK', itemName: 'PLINTH ANTIQUE TOWEL RACK 24 INCHES', sku: '-' },

  // MAIN CATEGORY: RAW MATERIAL
  { mainCategory: 'RAW MATERIAL', subcategory: 'RAW MATERIAL', itemName: 'CS18 - RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'RAWES', itemName: 'CS1 - RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'RINGES', itemName: 'ECONOMY SS RING', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'ROD PACKET', itemName: 'GLIDER 3 ROD PACKET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'ROD PACKET', itemName: 'GLIDER 4 ROD PACKET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'ROD PACKET', itemName: 'GLIDER 5 ROD PACKET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'ROD PACKET', itemName: 'GLIDER 6 ROD PACKET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'RODES', itemName: 'CS19 - A-ROD', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'RODES', itemName: 'CS19 - B-ROD', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'ROPE', itemName: 'GL NYLON ROPE TWISTED', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'ROPEES', itemName: 'ECONOMY FRAME ROPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'S.S', itemName: 'S.S CARRIAGE BOLY 50 MM [8302]', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREW 4*12ES', itemName: 'CONNECTOR SCREW 4*12', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'LUXURY WALL PLUG 35mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'NUT  BOLT 3*16 [8302]', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'PLASTIC WASHER 8mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SCREWS 38*8 [ 1202]', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS 6*25 PAN PHILIPS SHEET SCREW - ECONOMY', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS 8*38 PAN PHILIPS SCREW - CS3', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS DOME NUT 6mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS HEX BOLT 5*12', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS HEX BOLT 5*16', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS HEX BOLT 5*20', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS HEX BOLT 5*35', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS HEX BOLT 6*30', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS HEX BOLT 6*40', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS HEX BOLT 6*50', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS HEX BOLT 6*60', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS HEX BOLT 6*70', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS HEX NUT 6mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS HEX NUT 8mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS NYLOCK NUT 5mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS NYLOCK NUT 6mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS PAN PHILIPS SHEET SCREW 6*32', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SCREWS', itemName: 'SS PAN PHILIPS SHEET SCREW 6*50', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SHEET', itemName: 'SS 1.5mm SHEET (202)', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SPOT WELD', itemName: 'SPOT WELD - 748mm CS12', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SPOT WELD', itemName: 'SPOT WELD - 776mm CS12', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SPOT WELD', itemName: 'SPOT WELD - SS 1/2" PIPE - 2 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SPOT WELD', itemName: 'SPOT WELD - SS 1/2" PIPE - 3 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SPOT WELD', itemName: 'SPOT WELD - SS 1/2" PIPE - 4 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SPOT WELD', itemName: 'SPOT WELD - SS 1/2" PIPE - 5 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SPOT WELD', itemName: 'SPOT WELD - SS 1/2" PIPE - 6 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SPOT WELD', itemName: 'SPOT WELD - SS 9.5mm x 0.6 - 2 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SQUARE TROLLEY', itemName: 'SQUARE TROLLEY 3 LAYER ST-3L - RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SQUARE TROLLEY', itemName: 'SQUARE TROLLEY 4 LAYER ST-4L - RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SQUARE TROLLEY', itemName: 'SQUARE TROLLEY 5 LAYER ST-5L - RAW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS (16x PIPE RAW', itemName: 'SS (16x16) x 0.6mm SQ PIPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS (18*18) x PIPE RAW', itemName: 'SS (18*18) x 0.6mm SQ PIPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS (20x PIPE RAW', itemName: 'SS (20x40) x 0.7mm PIPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS (20x PIPE RAW', itemName: 'SS (20x40) x 0.9mm PIPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS (10*20) x 0.6mm SQ PIPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS (12x12) x 0.6mm SQ PIPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" PIPE - 2 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" PIPE - 3 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" PIPE - 3 FEET - 304', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" PIPE - 4 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" PIPE - 4 FEET - 304', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" PIPE - 5 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" PIPE - 5 FEET - 304', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" PIPE - 6 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" PIPE - 6 FEET - 304', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" PIPE - 7 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" PIPE - 7 FEET - 304', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" PIPE - 8 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" PIPE - 8 FEET - 304', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" x 0.6mm CS12 - 748mm PIPE', sku: 'CS12 - 748mm' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" x 0.6mm CS12 - 776mm PIPE', sku: 'CS12 - 776mm' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" x 0.6mm CS8 - 827mm', sku: 'CS8 - 827mm' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" x 0.6mm CS8 - 860mm', sku: 'CS8 - 860mm' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" x 0.6mm PIPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" x 0.8mm - 10 Feet', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" x 0.8mm - 12 Feet', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" x 0.8mm - Random', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" x 0.8mm PIPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" x 0.9mm PIPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 1/2" x 0.9mm PIPE - 304', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 12mm x 0.3mm PIPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 1/2" PIPE RAW', itemName: 'SS 12mm x 0.4 mm Pipe - 304', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 16mm PIPE RAW', itemName: 'SS 16mm x 0.3mm PIPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 19mm PIPE RAW', itemName: 'SS 19mm x 0.3mm PIPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 19mm PIPE RAW', itemName: 'SS 19mm x 0.4 mm PIPE -304', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 3/4" X PIPE RAW', itemName: 'SS 3/4" X 0.6mm PIPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 3/4" x PIPE RAW', itemName: 'SS 3/4" x 0.8mm PIPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 5/8" x PIPE RAW', itemName: 'SS 5/8" x 0.7mm - 10 Feet', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 5/8" x PIPE RAW', itemName: 'SS 5/8" x 0.7mm - 12 Feet', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 5/8" x PIPE RAW', itemName: 'SS 5/8" x 0.7mm - 14 Feet', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 5/8" x PIPE RAW', itemName: 'SS 5/8" x 0.7mm - 16 Feet', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 5/8" x PIPE RAW', itemName: 'SS 5/8" x 0.7mm - 20 Feet', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 5/8" x PIPE RAW', itemName: 'SS 5/8" x 0.7mm - Random', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 5/8" x PIPE RAW', itemName: 'SS 5/8" x 0.7mm PIPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 5/8" x PIPE RAW', itemName: 'SS 5/8" x 0.7mm PIPE - 4 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 5/8" x PIPE RAW', itemName: 'SS 5/8" x 0.7mm PIPE - 5 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 5/8" x PIPE RAW', itemName: 'SS 5/8" x 0.7mm PIPE - 6 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 5/8" x PIPE RAW', itemName: 'SS 5/8" x 0.7mm PIPE - 7 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 5/8" x PIPE RAW', itemName: 'SS 5/8" x 0.7mm PIPE - 8 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 8mm PIPE RAW', itemName: 'SS 8mm x 0.6mm PIPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 9.5mm PIPE', itemName: 'SS 9.5mm CS11 - 853', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 9.5mm PIPE', itemName: 'SS 9.5mm CS11 - 883', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 9.5mm PIPE', itemName: 'SS 9.5mm PIPE - 2 FEET', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS 9.5mm PIPE', itemName: 'SS 9.5mm x 0.6mm PIPE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS STAND', itemName: 'SS STAND CS1 - OUTER BOX', sku: '-' },

  // MAIN CATEGORY: FINISHED GOODS
  { mainCategory: 'FINISHED GOODS', subcategory: 'SS STAND', itemName: 'PLINTH BED STYLE CLOTH DRYER CS10 - ONLINE', sku: 'CS10 - ONLINE' },

  // MAIN CATEGORY: RAW MATERIAL
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS STAND RAW', itemName: 'PLINTH BED STYLE CLOTH DRYER SY-CS10 - RAW', sku: 'CS10 - RAW' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS STAND RAW', itemName: 'PLINTH SS 3 TIER CLOTH DRYER SY-CS8', sku: 'CS8' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS STAND RAW', itemName: 'PLINTH SS CLOTH DRYER 11 RODS - SY-CS9', sku: 'CS9' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS STAND RAW', itemName: 'PLINTH SS CLOTH DRYER 17 RODS SY-CS11', sku: 'CS11' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS STAND RAW', itemName: 'PLINTH SS CLOTH STAND 13 RODS SY-CS12', sku: 'CS12' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS STAND RAW', itemName: 'PLINTH SS DIAMOND 17 RODS W/H OUTER BOX', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS STAND RAW', itemName: 'PLINTH SS STAND 13 RODS W/H OUTER BOX SY-CS12', sku: 'CS12-RAW' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS STAND RAW', itemName: 'PLINTH SS WING DRYER SY-CS1', sku: 'CS1' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS STAND RAW', itemName: 'PLINTH SS WING DRYER SY-CS18', sku: 'CS18' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'SS STANDS', itemName: 'PLINTH SY-CS8 - ONLINE', sku: '-' },

  // MAIN CATEGORY: FINISHED GOODS
  { mainCategory: 'FINISHED GOODS', subcategory: 'SY-CS2', itemName: 'PLINTH WALL MOUNTING CLOTH DRYER SY-CS2', sku: '-' },

  // MAIN CATEGORY: RAW MATERIAL
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLINTH 4 PIPES', itemName: 'PLINTH 4 PIPES LUXURY ACCESSORIES SY-CL-ACC-4P', sku: 'SY-CL-ACC-4P' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'PLINTH 6 PIPES', itemName: 'PLINTH 6 PIPES LUXURY ACCESSORIES SY-CL-ACC-6P', sku: 'SY-CL-ACC-6P' },

  // MAIN CATEGORY: FINISHED GOODS
  { mainCategory: 'FINISHED GOODS', subcategory: 'PLINTH 8 PIPES', itemName: 'PLINTH 8 PIPES LUXURY ACCESSORIES SY-CL-ACC-8P', sku: 'SY-CL-ACC-8P' },

  // MAIN CATEGORY: RAW MATERIAL
  { mainCategory: 'RAW MATERIAL', subcategory: 'TABLEES', itemName: 'IRONING BOARD TABLE', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'TOP', itemName: 'CS12 - TOP ROD', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'TOP ROD', itemName: 'CS8 - TOP ROD', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'TOWEL', itemName: 'PLINTH OVAL TOWEL RING', sku: '-' },

  // MAIN CATEGORY: FINISHED GOODS
  { mainCategory: 'FINISHED GOODS', subcategory: 'TOWEL RODS', itemName: 'PLINTH 2-TIER SHELF SY-TH15', sku: 'SY-TH15' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'TOWEL RODS', itemName: 'PLINTH 3IN1 DOUBLE SHELF SY-TH13', sku: 'SY-TH13' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'TOWEL RODS', itemName: 'PLINTH 4 ARM TOWEL HOLDER SY-TH10', sku: 'SY-TH10' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'TOWEL RODS', itemName: 'PLINTH DOUBLE TOWEL ROD CHROME SY-TH1', sku: 'SY-TH1' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'TOWEL RODS', itemName: 'PLINTH DOUBLE TOWEL ROD STRAIGHT SY-TH5', sku: 'SY-TH5' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'TOWEL RODS', itemName: 'PLINTH DOUBLE TOWEL ROD SY-TH2', sku: 'SY-TH2' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'TOWEL RODS', itemName: 'PLINTH PREMIUM DOUBLE TOWEL ROD SY-TH11', sku: 'TH11' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'TOWEL RODS', itemName: 'PLINTH PREMIUM STRAIGHT TOWEL ROD SY-TH12', sku: 'TH12' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'TOWEL RODS', itemName: 'PLINTH RECTANGLE SINGLE TOWEL ROD SY-TH3', sku: 'TH3' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'TOWEL RODS', itemName: 'PLINTH ROUND CHOPPING BOARD SY-CB2', sku: 'CB2' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'TOWEL RODS', itemName: 'PLINTH SINGLE SHELF SY-TH14', sku: 'TH14' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'TOWEL RODS', itemName: 'PLINTH SINGLE TOWEL ROD SY-TH6', sku: 'TH6' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'TOWEL RODS', itemName: 'PLINTH SQUARE TOWEL RING', sku: 'TOWEL RING' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'TOWEL RODS', itemName: 'PLINTH SS304 24 INCH TOWEL RACK SY-TH8', sku: 'TH8' },

  // MAIN CATEGORY: RAW MATERIAL
  { mainCategory: 'RAW MATERIAL', subcategory: 'TOWEL RODS', itemName: 'PLINTH TOWEL RACK 1.5 FEET SY-TH7', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'TOWEL RODS', itemName: 'PLINTH TOWEL RACK NEW', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'TOWEL RODS', itemName: 'PLINTH TOWEL RACK SY-TH4', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'TOWEL RODS', itemName: 'PLINTH TOWEL RACK SY-TH9', sku: '-' },

  // MAIN CATEGORY: TOWEL RODS
  { mainCategory: 'TOWEL RODS', subcategory: 'TOWEL RODS', itemName: 'PLINTH TRINGLE TOWEL RING', sku: '-' },

  // MAIN CATEGORY: RAW MATERIAL
  { mainCategory: 'RAW MATERIAL', subcategory: 'TROLLY WHEEL', itemName: 'TROLLY WHEEL WITHOUT LOCK 1.5"', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'TUBE 5/16"ES', itemName: 'CONNECTING TUBE 5/16"', sku: '-' },

  // MAIN CATEGORY: -
  { mainCategory: 'UNASSIGNED', subcategory: 'UNASSIGNED', itemName: 'CUNCIL SS HAVY [8481]', sku: '-' },
  { mainCategory: 'UNASSIGNED', subcategory: 'UNASSIGNED', itemName: 'CUSTOMISED RODS', sku: '-' },
  { mainCategory: 'UNASSIGNED', subcategory: 'UNASSIGNED', itemName: 'PLINTH OVEN STAND BROWN SY-KA1', sku: 'SY-KA1' },
  { mainCategory: 'UNASSIGNED', subcategory: 'UNASSIGNED', itemName: 'PLINTH OVEN STAND WHITE SY-KA2', sku: 'SY-KA2' },

  // MAIN CATEGORY: WALL MOUNT
  { mainCategory: 'WALL MOUNT', subcategory: 'WALL MOUNT', itemName: 'WALL MOUNT SY-CS3 - RAW', sku: '-' },
  { mainCategory: 'WALL MOUNT', subcategory: 'WALL MOUNT', itemName: 'WALL MOUNT SY-CS6 - RAW', sku: '-' },

  // MAIN CATEGORY: FINISHED GOODS
  { mainCategory: 'FINISHED GOODS', subcategory: 'WALL MOUNT PACKED', itemName: 'PLINTH 7 ROD WALL MOUNT CLOTH DRYER SY-CS3', sku: 'SY-CS3' },
  { mainCategory: 'FINISHED GOODS', subcategory: 'WALL MOUNT PACKED', itemName: 'PLINTH 9 ROD WALL MOUNT CLOTH DRYER SY-CS6', sku: 'SY-CS6' },

  // MAIN CATEGORY: COMBOES
  { mainCategory: 'COMBOES', subcategory: 'WALL MOUNT PACKED', itemName: 'PLINTH SY-CS3-COMBO', sku: '-' },
  { mainCategory: 'COMBOES', subcategory: 'WALL MOUNT PACKED', itemName: 'PLINTH SY-CS6-COMBO', sku: '-' },

  // MAIN CATEGORY: RAW MATERIAL
  { mainCategory: 'RAW MATERIAL', subcategory: 'WALL MOUNT PARTS', itemName: 'CS3 - LONG PATTI', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'WALL MOUNT PARTS', itemName: 'CS3 - SHORT PATTI', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'WALL MOUNT PARTS', itemName: 'CS3 BEND LHS', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'WALL MOUNT PARTS', itemName: 'CS3 BEND RHS', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'WASHER', itemName: 'SS PLAIN WASHER 10mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'WASHER', itemName: 'SS PLAIN WASHER 6*12mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'WASHER', itemName: 'SS PLAIN WASHER 6*16mm', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'WING ROD', itemName: 'CS19 - WING ROD', sku: '-' },
  { mainCategory: 'RAW MATERIAL', subcategory: 'mmES', itemName: 'SS CHAIN 3mm', sku: '-' },
];

async function main() {
  console.log('🌱 Starting import of Stock Item Hierarchy Dataset...');

  // Ensure default UOM (PCS, KG, MTR, BOX, SET, NOS)
  const defaultUom = await prisma.unitOfMeasure.upsert({
    where: { code: 'PCS' },
    update: { name: 'Pieces', symbol: 'pcs', dimension: 'COUNT', status: LifecycleStatus.ACTIVE },
    create: { code: 'PCS', name: 'Pieces', symbol: 'pcs', dimension: 'COUNT', status: LifecycleStatus.ACTIVE }
  });

  // Collect distinct Categories and Subcategories (Product Families)
  const categoryMap = new Map<string, string>();
  const familyMap = new Map<string, string>();

  // Map Main Categories
  const uniqueMainCats = Array.from(new Set(STOCK_DATA.map((r) => r.mainCategory || 'GENERAL')));
  for (const mc of uniqueMainCats) {
    const code = toCode(mc);
    const cat = await prisma.category.upsert({
      where: { code },
      update: { name: mc, description: `Main Category: ${mc}`, status: LifecycleStatus.ACTIVE },
      create: { code, name: mc, description: `Main Category: ${mc}`, status: LifecycleStatus.ACTIVE }
    });
    categoryMap.set(mc, cat.id);
  }

  // Map Subcategories to Product Families under their Main Category
  const uniqueSubCats = Array.from(
    new Set(STOCK_DATA.map((r) => `${r.mainCategory}:::${r.subcategory}`))
  );
  for (const key of uniqueSubCats) {
    const [mc, sc] = key.split(':::');
    const catId = categoryMap.get(mc)!;
    const famCode = toCode(`${mc}-${sc}`);
    const fam = await prisma.productFamily.upsert({
      where: { code: famCode },
      update: { name: sc, description: `Family: ${sc} (${mc})`, categoryId: catId, status: LifecycleStatus.ACTIVE },
      create: { code: famCode, name: sc, description: `Family: ${sc} (${mc})`, categoryId: catId, status: LifecycleStatus.ACTIVE }
    });
    familyMap.set(key, fam.id);
  }

  // Seed Items as Products under their respective Product Families
  let productsCount = 0;

  for (let i = 0; i < STOCK_DATA.length; i++) {
    const row = STOCK_DATA[i];
    const catId = categoryMap.get(row.mainCategory)!;
    const famId = familyMap.get(`${row.mainCategory}:::${row.subcategory}`)!;

    // Compute unique SKU if '-'
    const sku =
      row.sku && row.sku !== '-'
        ? row.sku.trim()
        : `SKU-${toCode(row.itemName)}-${i + 1}`;

    await prisma.product.upsert({
      where: { sku },
      update: {
        name: row.itemName,
        description: `${row.itemName} [${row.subcategory}]`,
        categoryId: catId,
        productFamilyId: famId,
        uomId: defaultUom.id,
        status: LifecycleStatus.ACTIVE,
        metadata: {
          mainCategory: row.mainCategory,
          subcategory: row.subcategory,
          originalSku: row.sku,
        }
      },
      create: {
        sku,
        name: row.itemName,
        description: `${row.itemName} [${row.subcategory}]`,
        categoryId: catId,
        productFamilyId: famId,
        uomId: defaultUom.id,
        status: LifecycleStatus.ACTIVE,
        metadata: {
          mainCategory: row.mainCategory,
          subcategory: row.subcategory,
          originalSku: row.sku,
        }
      }
    });
    productsCount++;
  }

  console.log(`✅ Finished seeding:`);
  console.log(`   - ${uniqueMainCats.length} Categories`);
  console.log(`   - ${uniqueSubCats.length} Product Families`);
  console.log(`   - ${productsCount} Products`);
}

main()
  .catch((e) => {
    console.error('❌ Error during stock item seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
