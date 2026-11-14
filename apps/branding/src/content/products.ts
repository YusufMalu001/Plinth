export type ProductStatus = 'available' | 'coming-soon';

export interface ModuleItem {
  name: string;
  benefit: string;
  iconName: string;
}

export interface WorkflowStep {
  step: number;
  title: string;
  description: string;
}

export interface AiExample {
  prompt: string;
  result: string;
}

export interface SpecRow {
  label: string;
  value: string;
}

export interface ProductFaq {
  question: string;
  answer: string;
}

export interface Product {
  slug: string;
  name: string;
  shortName: string;
  status: ProductStatus;
  tagline: string;
  summary: string;
  audience: string;
  painPoints: [string, string, string];
  modules: ModuleItem[];
  workflowSteps: [WorkflowStep, WorkflowStep, WorkflowStep, WorkflowStep];
  aiExamples: [AiExample, AiExample, AiExample];
  specs: SpecRow[];
  integrations: string[];
  faqs: [ProductFaq, ProductFaq, ProductFaq, ProductFaq];
  ctaLabel: string;
  note?: string;
}


export const BRAND_COPY = {
  masterHeadline: 'STRUCTURED OPERATIONS. ACCOUNTABLE OUTPUT.',
  masterSubline: 'The operations platform for businesses that make, move and sell.',
  descriptor: 'Industrial cloud ERP',
  pricingClaim: 'Flat monthly subscription per plant. Not per user.',
  aiOperatorClaim:
    "An AI operator that drafts the work from a plain-language request. Every change is previewed before it is saved, limited to the user's role, and recorded in the audit trail.",
} as const;

export const SITE_URL = 'https://plintherp.com';

export const PRODUCTS: Product[] = [
  {
    slug: 'manufacturing',
    name: 'Plinth Manufacturing',
    shortName: 'Manufacturing',
    status: 'available',
    tagline: 'Production, stock and dispatch, in one system of record.',
    summary:
      'Engineered for metal fabrication, plastics, precision machining, and made-to-order industrial plants requiring disciplined batch control, real-time BOM costing, and dependable shop floor tracking.',
    audience: 'Metal fabrication, plastics, garments, and made-to-order manufacturers.',
    painPoints: [
      'Blind shop floor execution causing production bottlenecks, idle machine time, and unrecorded WIP scrap.',
      'Disjointed procurement leading to raw material stockouts, duplicate purchase orders, and unverified vendor bills.',
      'Manual dispatch friction with delayed delivery challans, unsynced e-way bills, and chaotic batch segregation.',
    ],
    modules: [
      {
        name: 'Procurement',
        benefit: 'Requisitions, purchase orders, goods receipt notes (GRN), and vendor rate comparison history.',
        iconName: 'ShoppingCart',
      },
      {
        name: 'Inventory & Lots',
        benefit: 'Multi-location bin tracking, batch/lot traceability, minimum reorder thresholds, and ledger-based stock.',
        iconName: 'Boxes',
      },
      {
        name: 'Production & Routing',
        benefit: 'Multi-level configurable BOMs, work orders, shop floor material issue, WIP tracking, and scrap accounting.',
        iconName: 'Cpu',
      },
      {
        name: 'Quality Control',
        benefit: 'Configurable receiving inspection checklists, in-process signoffs, and quarantine disposition workflows.',
        iconName: 'CheckCircle2',
      },
      {
        name: 'Sales & Dispatch',
        benefit: 'Quotations, confirmed sales orders, delivery challans, e-way bills, and automated tax invoices.',
        iconName: 'Truck',
      },
      {
        name: 'Job Work & Subcontracting',
        benefit: 'External vendor material issue (Annexure II), return reconciliation, and scrap allowances.',
        iconName: 'Layers',
      },
      {
        name: 'Tally Accounting Sync',
        benefit: 'Bi-directional financial voucher sync for clean general ledgers without manual dual-entry.',
        iconName: 'FileSpreadsheet',
      },
      {
        name: 'Plant Intelligence & Reports',
        benefit: 'Production efficiency metrics, daily shift yield analysis, and live executive oversight.',
        iconName: 'BarChart3',
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'BOM & Stock Reservation',
        description: 'Confirm orders and automatically reserve allocated inventory against active engineering bills of materials.',
      },
      {
        step: 2,
        title: 'Shop Floor Release',
        description: 'Issue materials to routing workstations with barcoded work orders and clear operator work instructions.',
      },
      {
        step: 3,
        title: 'Inspection & Disposition',
        description: 'Verify finished goods against precision tolerance parameters before releasing items to staging bays.',
      },
      {
        step: 4,
        title: 'Challan & Gate Dispatch',
        description: 'Generate commercial invoices, verified packing lists, and gate passes with immediate courier handover tracking.',
      },
    ],
    aiExamples: [
      {
        prompt: 'Create purchase orders for everything below reorder level',
        result:
          'Drafted 6 purchase orders for 14 depleted SKUs totaling ₹3,42,800 across 3 approved vendors with preferred lead times. Awaiting plant manager approval.',
      },
      {
        prompt: 'What caused the assembly line delay on Line 2 yesterday?',
        result:
          'Line 2 experienced 84 minutes of downtime due to delayed batch release of M12 fasteners (GRN-2026-088). Quality hold cleared at 15:40.',
      },
      {
        prompt: 'Prepare dispatch manifest for all confirmed Bangalore shipments',
        result:
          'Staged 4 consignments (48 cartons, 780 kg gross) for Blue Dart Surface pickup at Dock North 1. Delivery challans and labels generated.',
      },
    ],
    specs: [
      { label: 'Pricing Model', value: 'Flat monthly subscription per plant' },
      { label: 'Security & Access', value: 'Granular role-based permissions (RBAC) with audit logs' },
      { label: 'Traceability', value: 'Full immutable audit trail on every master change and ledger move' },
      { label: 'Data Extensibility', value: 'Configurable custom fields, document sequences, and plant labels' },
      { label: 'Data Migration', value: 'Structured bulk import from existing Excel sheets and ERP exports' },
    ],
    integrations: ['Tally Prime ERP', 'GST Portal / E-Way Bill', 'Excel & CSV Pipelines', 'WhatsApp Business API'],
    faqs: [
      {
        question: 'How does per-plant pricing work?',
        answer:
          'You pay one flat subscription fee for your physical plant or manufacturing facility. You never face per-seat billing penalties as your administrative or shop floor team expands.',
      },
      {
        question: 'Can we import our existing items, vendors, and opening balances from Excel?',
        answer:
          'Yes. Plinth includes built-in migration templates for master catalogs, BOM structures, vendor directories, and opening stock balances.',
      },
      {
        question: 'How does Plinth synchronize with our accounting team?',
        answer:
          'Plinth acts as the operational system of record. Approved purchases, sales invoices, debit notes, and payment receipts export cleanly to Tally Prime for financial close.',
      },
      {
        question: 'Is internet required on the plant floor?',
        answer:
          'Plinth is a lightweight cloud-first application engineered to operate reliably over standard industrial broadband and 4G connections.',
      },
    ],
    ctaLabel: 'Book a demo',
  },
  {
    slug: 'provenance',
    name: 'Plinth Provenance',
    shortName: 'Provenance',
    status: 'coming-soon',
    tagline: 'Batch traceability for FMCG, food and cosmetics.',
    summary:
      'Built specifically for batch-driven production where ingredient provenance, expiry enforcement, and rapid backward-and-forward recall tracing are operational essentials.',
    audience: 'Food processors, specialty chemicals, personal care, and packaged FMCG manufacturers.',
    note: 'Built for batch traceability. Regulated pharma support comes later.',
    painPoints: [
      'Risk of expiring ingredients consumed on the floor due to manual FIFO tracking errors.',
      'Slow and stressful audit recalls requiring hours of manual paper binder searching.',
      'Inconsistent formulation batch yields leading to margin shrinkage and unaccounted loss.',
    ],
    modules: [
      {
        name: 'Batch & Expiry Tracking',
        benefit: 'Automated lot generation with shelf-life enforcement and warning windows.',
        iconName: 'Clock',
      },
      {
        name: 'FEFO Automated Issue',
        benefit: 'First-Expired, First-Out routing preventing material spoilage on warehouse racks.',
        iconName: 'ArrowRightLeft',
      },
      {
        name: 'Quality Release Gates',
        benefit: 'Pre-release quarantine holds requiring chemical/microbiological sign-offs.',
        iconName: 'ShieldCheck',
      },
      {
        name: 'Recall Genealogy Tracing',
        benefit: 'Single-click forward trace to customer and backward trace to supplier farm/vat.',
        iconName: 'GitFork',
      },
      {
        name: 'Recipe Formulation & Yield',
        benefit: 'Dynamic scaling of standard ingredient formulations with variance calculations.',
        iconName: 'FlaskConical',
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Intake & Lot Quarantine',
        description: 'Raw agricultural and chemical lots are quarantined immediately on receipt.',
      },
      {
        step: 2,
        title: 'Recipe & FEFO Issue',
        description: 'The formulation engine dispenses materials prioritized strictly by earliest expiry date.',
      },
      {
        step: 3,
        title: 'Lab Quality Signoff',
        description: 'Quality technicians log analytical checklist readings before batch release.',
      },
      {
        step: 4,
        title: 'Packaging & Trace Labeling',
        description: 'Finished containers receive QR codes linking directly to origin batch documentation.',
      },
    ],
    aiExamples: [
      {
        prompt: 'Trace backward all batches using Palm Oil Lot PO-2026-88',
        result:
          'Identified 4 finished production runs (Batches 104, 105, 108, 112). 2 batches remain in warehouse; 2 shipped to Western Distribution. Recall report generated.',
      },
      {
        prompt: 'List raw ingredients expiring within the next 14 days',
        result:
          'Found 3 lots: Vanilla Extract Lot V-04 (expires in 6 days, 45 kg), Emulsifier E-21 (expires in 11 days, 120 kg). Suggested production prioritization created.',
      },
      {
        prompt: 'Show yield variance across cosmetic cream runs this week',
        result:
          'Average yield: 97.4%. Run #4 showed 4.1% moisture loss during heating phase. Recipe adjustment suggested.',
      },
    ],
    specs: [
      { label: 'Traceability Standard', value: 'Full backward-forward parent/child lot genealogy' },
      { label: 'Issue Policy', value: 'Strict First-Expired First-Out (FEFO) and lot quarantine locks' },
      { label: 'Formulation Engine', value: 'Multi-stage recipes with moisture and processing loss allowances' },
      { label: 'Regulatory Scope', value: 'Built for batch traceability. Regulated pharma support comes later.' },
    ],
    integrations: ['Analytical Lab Instruments', 'Barcode / 2D DataMatrix Scanners', 'Tally Prime', 'Logistics 3PLs'],
    faqs: [
      {
        question: 'Does Plinth Provenance support strict FEFO pick rules?',
        answer:
          'Yes. Warehouse operators are barred from picking newer batches when older, valid inventory with closer expiry is available.',
      },
      {
        question: 'How fast can a recall report be assembled?',
        answer:
          'Genealogy trees are calculated automatically in the database. A full forward and backward recall manifest compiles in seconds.',
      },
      {
        question: 'Is this edition intended for regulated pharmaceutical manufacturing?',
        answer:
          'No. Provenance is designed for FMCG, food, and cosmetics. Regulated pharma validation and compliance features will be released at a later stage.',
      },
      {
        question: 'Can we configure multi-stage inspection parameters?',
        answer:
          'Yes. Define custom quantitative tolerances and qualitative criteria for incoming ingredients and finished blends.',
      },
    ],
    ctaLabel: 'Join the waitlist',
  },
  {
    slug: 'trade',
    name: 'Plinth Trade',
    shortName: 'Trade',
    status: 'coming-soon',
    tagline: 'Distribution and wholesale operations made transparent.',
    summary:
      'Designed for master distributors, wholesale traders, and industrial stockists balancing high-velocity multi-depot inventory, complex commercial credit limits, and razor-thin trade margins.',
    audience: 'Wholesale distributors, multi-depot stockists, and industrial equipment dealers.',
    painPoints: [
      'Capital locked in slow-moving depots while fast-moving hubs suffer stockouts.',
      'Uncontrolled customer credit leading to overdue receivables and bad debt write-offs.',
      'Manual price adjustments and promotional scheme confusion eating into margins.',
    ],
    modules: [
      {
        name: 'Multi-Warehouse Network',
        benefit: 'Real-time stock visibility across central distribution hubs and satellite depots.',
        iconName: 'Warehouse',
      },
      {
        name: 'Promotional Schemes & Tiers',
        benefit: 'Automated dealer slabs, volume rebates, cash discounts, and seasonal offers.',
        iconName: 'Percent',
      },
      {
        name: 'Credit Limit & Hold Queue',
        benefit: 'System-enforced exposure caps halting orders when overdue invoices lapse.',
        iconName: 'CreditCard',
      },
      {
        name: 'Collections & Aging Analysis',
        benefit: 'Automated dealer payment reminders and aged debtor ledger breakdown.',
        iconName: 'Receipt',
      },
      {
        name: 'E-Way Bill & Dispatch Staging',
        benefit: 'Instant GST e-way bill generation with transporter consignment manifests.',
        iconName: 'Truck',
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Dealer Order Intake',
        description: 'Capture dealer requisitions with live price slabs and instant inventory check.',
      },
      {
        step: 2,
        title: 'Credit Clearance Check',
        description: 'Automated credit engine validates outstanding aging before releasing to dispatch.',
      },
      {
        step: 3,
        title: 'Inter-Depot Allocation',
        description: 'Fulfill from the nearest depot or generate automated stock transfer requests.',
      },
      {
        step: 4,
        title: 'Dispatch & E-Way Bill',
        description: 'Generate commercial documents, e-way bills, and automated payment payment links.',
      },
    ],
    aiExamples: [
      {
        prompt: 'Check credit status for Dealer Apex Corp before approving order',
        result:
          'Apex Corp credit limit: ₹15,00,000. Current exposure: ₹13,80,000. New order ₹2,50,000 exceeds limit by ₹1,30,000. Placed in Credit Hold Queue.',
      },
      {
        prompt: 'Rebalance fastener stock from Pune Central to Nagpur Depot',
        result:
          'Calculated 30-day run rate. Drafted inter-warehouse transfer for 2,400 kg fasteners from Pune Bay 3 to Nagpur. Transfer note generated.',
      },
      {
        prompt: 'List top 5 overdue accounts over 45 days',
        result:
          'Identified 5 dealers with ₹18,40,000 cumulative overdue exposure. WhatsApp reminder summaries prepared for approval.',
      },
    ],
    specs: [
      { label: 'Depot Scale', value: 'Multi-warehouse stock reservation with automated inter-depot transfers' },
      { label: 'Commercial Control', value: 'Hard credit limit stops and aging-based dispatch holds' },
      { label: 'Scheme Matrix', value: 'Multi-tier pricing, quantity breaks, and dealer slab management' },
      { label: 'Compliance Engine', value: 'Direct integration with GST e-invoicing and e-way bill portals' },
    ],
    integrations: ['Tally Prime', 'GST E-Way Bill Portal', 'Payment Gateways', 'WhatsApp Notifications'],
    faqs: [
      {
        question: 'Can sales reps check real-time stock across all warehouses from mobile?',
        answer: 'Yes. Plinth Trade is fully responsive and provides instant stock lookups by location.',
      },
      {
        question: 'What happens when a dealer exceeds their credit limit?',
        answer:
          'The order is diverted to an administrative Credit Hold Queue. It cannot proceed to picking without an authorized override or payment recording.',
      },
      {
        question: 'Can we apply different pricing schemes per dealer tier?',
        answer: 'Yes. Configure dealer tier matrices with automated percentage discounts, cash margins, and free item slabs.',
      },
      {
        question: 'How are inter-depot transfers managed?',
        answer: 'Transfers use a two-step transit workflow: stock dispatched from Origin moves to In-Transit before receiving signoff at Destination.',
      },
    ],
    ctaLabel: 'Join the waitlist',
  },
  {
    slug: 'build',
    name: 'Plinth Build',
    shortName: 'Build',
    status: 'coming-soon',
    tagline: 'Project costing and site material control for contractors.',
    summary:
      'Tailored for engineering contractors, infrastructure builders, and construction firms needing ironclad bill-of-quantities (BOQ) tracking, site stock custody, and subcontractor running bills.',
    audience: 'EPC contractors, industrial builders, infrastructure developers, and specialty fabricators.',
    painPoints: [
      'Uncontrolled material theft, waste, and unaccounted consumption at remote job sites.',
      'Cost overruns hidden until project completion due to disconnected milestone billing.',
      'Subcontractor running bill disputes over verified measurements and retention amounts.',
    ],
    modules: [
      {
        name: 'BOQ & Estimation',
        benefit: 'Import client project schedules with budgeted material and labor baselines.',
        iconName: 'FileText',
      },
      {
        name: 'Site Material Requisitions',
        benefit: 'Formal site indents with head-office procurement and dispatch tracking.',
        iconName: 'HardHat',
      },
      {
        name: 'Subcontractor RA Bills',
        benefit: 'Running account verification with standard retention deductions and TDS.',
        iconName: 'Calculator',
      },
      {
        name: 'Project P&L in Real Time',
        benefit: 'Continuous comparison of budgeted cost of work scheduled vs actual spend.',
        iconName: 'LineChart',
      },
      {
        name: 'Equipment & Tool Custody',
        benefit: 'Machinery allocation, daily logbook tracking, and preventative site maintenance.',
        iconName: 'Wrench',
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Project Budget & BOQ Upload',
        description: 'Establish work breakdown schedules and approve project material budgets.',
      },
      {
        step: 2,
        title: 'Site Indent & Central Dispatch',
        description: 'Site project managers request materials verified against BOQ quantity caps.',
      },
      {
        step: 3,
        title: 'Milestone Measurement Entry',
        description: 'Engineers log daily site progress measurements against subcontractor line items.',
      },
      {
        step: 4,
        title: 'RA Bill & Client Billing',
        description: 'Generate verified running account invoices with retention and advance recoveries.',
      },
    ],
    aiExamples: [
      {
        prompt: 'Show variance between budgeted and actual TMT steel on Metro Project',
        result:
          'Budgeted: 450 Metric Tons. Dispatched to date: 482 MT (+7.1% overage). Overage driven by sub-structure piling redesign in Sector 4.',
      },
      {
        prompt: 'Draft Running Account Bill #4 for Earthworks Subcontractor',
        result:
          'Calculated 14,200 m3 excavation @ ₹180/m3. Deducted 5% retention (₹1,27,800) and 2% TDS. Net payable: ₹23,64,300.',
      },
      {
        prompt: 'List unverified site delivery challans for Ahmedabad site',
        result: 'Found 3 cement deliveries (1,200 bags) awaiting site engineer GRN signoff at Gate 2.',
      },
    ],
    specs: [
      { label: 'Project Architecture', value: 'Hierarchical Work Breakdown Structure (WBS) with BOQ caps' },
      { label: 'Subcontractor Ledger', value: 'Running Account (RA) billing with retention and penalty controls' },
      { label: 'Site Inventory Mode', value: 'Custody transfer accounting between central warehouse and sites' },
      { label: 'Financial Baseline', value: 'Earned Value Cost comparison (Budgeted vs Actual spend)' },
    ],
    integrations: ['AutoCAD & Excel Schedules', 'Tally Prime', 'On-site Mobile Tablets', 'Weighbridge Systems'],
    faqs: [
      {
        question: 'Can site engineers create material requisitions without seeing financial margins?',
        answer: 'Yes. Granular RBAC ensures site supervisors only view quantities and item specifications.',
      },
      {
        question: 'How are retention money deductions tracked?',
        answer:
          'Retention percentages are automatically deducted from subcontractor RA bills and accumulated in a dedicated liability ledger until handover.',
      },
      {
        question: 'Does Plinth Build prevent over-requisitioning beyond BOQ limits?',
        answer: 'Yes. Warning and hard-stop thresholds can be configured when site indents exceed approved BOQ allowances.',
      },
      {
        question: 'Can we track rental equipment and heavy machinery logs?',
        answer: 'Yes. Record machine runtime hours, diesel consumption, and preventative servicing schedules.',
      },
    ],
    ctaLabel: 'Join the waitlist',
  },
  {
    slug: 'fleet',
    name: 'Plinth Fleet',
    shortName: 'Fleet',
    status: 'coming-soon',
    tagline: 'Logistics, trips and fleet operations in full control.',
    summary:
      'Built for company-owned transport fleets, heavy vehicle logistics, and plant dispatch managers demanding real-time trip accounting, fuel efficiency audit, and compliance documentation.',
    audience: 'Private fleet operators, industrial logistics divisions, and transport contractors.',
    painPoints: [
      'Unchecked diesel theft, inflated fuel vouchers, and poor mileage accountability.',
      'Expired vehicle fitness, insurance, and road tax permits leading to regulatory impounds.',
      'Uncoordinated driver schedules causing missed customer dispatch delivery promises.',
    ],
    modules: [
      {
        name: 'Vehicle & Asset Registry',
        benefit: 'Complete digital documents locker for RC, insurance, fitness, and national permits.',
        iconName: 'Truck',
      },
      {
        name: 'Trip Sheet Lifecycle',
        benefit: 'Trip dispatch, odometer logs, route allowances, and delivery challan linking.',
        iconName: 'Navigation',
      },
      {
        name: 'Fuel & Expense Auditing',
        benefit: 'Fuel card transaction reconciliation with mileage benchmarks per vehicle model.',
        iconName: 'Fuel',
      },
      {
        name: 'Driver Management',
        benefit: 'License validity tracking, trip settlements, advances, and safety records.',
        iconName: 'UserCheck',
      },
      {
        name: 'Maintenance & Spares',
        benefit: 'Preventative servicing schedules, tyre rotation tracking, and breakdown logs.',
        iconName: 'Wrench',
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Trip Creation & Driver Assignment',
        description: 'Link vehicle capacity to customer dispatch orders and assign qualified drivers.',
      },
      {
        step: 2,
        title: 'Gate Out & Advance Issuance',
        description: 'Record opening odometer, issue fastag/diesel allowances, and stamp gatepass.',
      },
      {
        step: 3,
        title: 'En-route Checkpoint Logging',
        description: 'Log toll receipts, fuel purchases, and transit proof-of-delivery milestones.',
      },
      {
        step: 4,
        title: 'Gate In & Trip Reconciliation',
        description: 'Verify closing odometer, calculate km/litre fuel mileage, and settle driver balance.',
      },
    ],
    aiExamples: [
      {
        prompt: 'Audit fuel consumption for Truck MH-12-RN-8890 on the Pune-Bangalore route',
        result:
          'Distance: 840 km. Fuel consumed: 262 L. Actual mileage: 3.20 km/L (within expected 3.15–3.35 km/L benchmark). Fuel voucher approved.',
      },
      {
        prompt: 'Which vehicles have insurance or fitness renewals due this month?',
        result:
          '3 vehicles detected: MH-14-GA-5521 (Fitness expires in 8 days), MH-12-PQ-9900 (National Permit expires in 19 days). Renewal alerts dispatched.',
      },
      {
        prompt: 'Calculate profit contribution per km for fleet operations in October',
        result:
          'Fleet covered 48,200 total freight km. Total operational cost: ₹28.40/km. Freight billing: ₹36.80/km. Net margin: ₹8.40/km (+22.8%).',
      },
    ],
    specs: [
      { label: 'Trip Architecture', value: 'Complete lifecycle from load staging to driver settlement' },
      { label: 'Fuel Integrity', value: 'Automated fuel efficiency audit against vehicle class baseline' },
      { label: 'Compliance Vault', value: 'Proactive renewal alerts for Insurance, Fitness, PUC, and Permits' },
      { label: 'ERP Unification', value: 'Direct integration with Plinth Sales Dispatch and E-Way bills' },
    ],
    integrations: ['FASTag Gateways', 'Fuel Fleet Cards', 'GPS Telematics Providers', 'GST E-Way Bill'],
    faqs: [
      {
        question: 'Does Plinth Fleet calculate driver trip settlements?',
        answer: 'Yes. It balances trip advances against submitted toll, fuel, and lodging receipts with clear sign-offs.',
      },
      {
        question: 'How does it detect fuel leakage or theft?',
        answer:
          'By comparing distance logged against fuel fills, the system flags trips falling below expected vehicle mileage thresholds.',
      },
      {
        question: 'Can we track tyre serial numbers and retreading cycles?',
        answer: 'Yes. The tyre ledger tracks mounting position, running kilometers, and retread history per wheel.',
      },
      {
        question: 'Is Plinth Fleet integrated with Plinth Manufacturing?',
        answer: 'Yes. Dispatch staging orders in Manufacturing instantly generate outbound freight trip sheets in Fleet.',
      },
    ],
    ctaLabel: 'Join the waitlist',
  },
  {
    slug: 'campus',
    name: 'Plinth Campus',
    shortName: 'Campus',
    status: 'coming-soon',
    tagline: 'Streamlined academic administration and institutional control.',
    summary:
      'Engineered for educational institutions, polytechnic colleges, and training academies requiring integrated fee reconciliations, timetable scheduling, and parent communication.',
    audience: 'Colleges, polytechnics, industrial training institutes, and private academic trusts.',
    painPoints: [
      'Uncollected student fees and chaotic manual bank reconciliation at semester starts.',
      'Fragmented student records spread across disparate paper files and spreadsheets.',
      'Manual examination grading and delay in report card compilation.',
    ],
    modules: [
      {
        name: 'Admissions & Enrollment',
        benefit: 'Digital applicant tracking, document verification, and seat allocation.',
        iconName: 'GraduationCap',
      },
      {
        name: 'Fee Management & Accounts',
        benefit: 'Automated fee schedule generation, online payment gateway, and concession tracking.',
        iconName: 'Banknote',
      },
      {
        name: 'Attendance & Timetables',
        benefit: 'Biometric and app-based classroom attendance with faculty load optimization.',
        iconName: 'CalendarCheck',
      },
      {
        name: 'Exams & Grading',
        benefit: 'Gradebook management, moderation rules, and automated digital marksheets.',
        iconName: 'Award',
      },
      {
        name: 'Student & Parent Portal',
        benefit: 'Transparent mobile portal for attendance notifications, circulars, and dues.',
        iconName: 'Users',
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Applicant Registration',
        description: 'Prospective students submit documents and verify eligibility online.',
      },
      {
        step: 2,
        title: 'Enrollment & Fee Structure',
        description: 'Assign roll numbers, branch allocations, and annual installment schedules.',
      },
      {
        step: 3,
        title: 'Academic Term Execution',
        description: 'Track daily attendance, internal assessments, and lab work completion.',
      },
      {
        step: 4,
        title: 'Examination & Certification',
        description: 'Compile semester GPA scores and generate official academic transcripts.',
      },
    ],
    aiExamples: [
      {
        prompt: 'Generate outstanding fee reminder list for Semester 4 Mechanical students',
        result:
          'Identified 28 students with pending installment dues totaling ₹4,80,000. Automated SMS and email payment reminders drafted.',
      },
      {
        prompt: 'Highlight students below 75% attendance threshold in Electrical Engineering',
        result:
          'Found 12 students currently at risk of exam disqualification. Guardian advisory report prepared for Department Head.',
      },
      {
        prompt: 'Check classroom utilization efficiency for Science Block B',
        result:
          'Average occupancy: 82.4%. Lab 3 is unoccupied on Tuesday and Thursday afternoons. Schedule optimization suggested.',
      },
    ],
    specs: [
      { label: 'Campus Hierarchy', value: 'Multi-department, course, semester, and section architecture' },
      { label: 'Fee Accounting', value: 'Automated bank reconciliation with installment plan tracking' },
      { label: 'Evaluation System', value: 'Continuous internal assessment (CIA) and final semester grading' },
      { label: 'Communication Hub', value: 'Direct SMS, WhatsApp, and email parent advisory broadcasts' },
    ],
    integrations: ['Biometric Attendance Devices', 'UPI & NetBanking Gateways', 'Tally Prime', 'SMS Services'],
    faqs: [
      {
        question: 'Can parents pay fees online using UPI or credit card?',
        answer: 'Yes. Integrated payment gateways support instant reconciliation with automated receipt generation.',
      },
      {
        question: 'Does the system handle scholarship and category-based fee concessions?',
        answer: 'Yes. Custom fee category waivers and government scholarship accounts can be configured per student.',
      },
      {
        question: 'How is attendance captured?',
        answer: 'Faculty can log attendance via mobile or synchronize with hardware RFID/biometric readers.',
      },
      {
        question: 'Can multi-institution educational trusts manage multiple campuses?',
        answer: 'Yes. Central management can oversee financial and academic performance across all group entities.',
      },
    ],
    ctaLabel: 'Join the waitlist',
  },
];

export function getProductBySlug(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export const BRAND = {
  name: 'Plinth',
  masterHeadline: 'STRUCTURED OPERATIONS. ACCOUNTABLE OUTPUT.',
  masterSubline: 'The operations platform for businesses that make, move and sell.',
  descriptor: 'Industrial cloud ERP',
  pricingClaim: 'Flat monthly subscription per plant. Not per user.',
  aiClaim:
    "An AI operator that drafts the work from a plain-language request. Every change is previewed before it is saved, limited to the user's role, and recorded in the audit trail.",
};

export const PRICING_FROM = {
  amount: 7000,
  currency: 'INR',
  currencySymbol: '₹',
  cadence: 'plant / month',
};
