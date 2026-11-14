import {
  PrismaClient,
  LifecycleStatus,
  TaskPriority,
  TaskStatus,
  AttendanceStatus,
  PaySlipStatus,
  ScoreConfidenceStatus,
  EmployeeGoalStatus,
  Prisma,
  Role
} from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

// Comprehensive list of employees covering all 5 canonical active departments
// spanning Leadership (Level 1/2), Senior Leads (Level 3), Technicians/Inspectors (Level 4), and Machine Operators (Level 5)
const EMPLOYEES_DATA = [
  // 1. Plate & Section CNC Cutting Bay (DEPT-CUTTING)
  {
    employeeCode: 'EMP-CUT-HEAD',
    firstName: 'Ramesh',
    lastName: 'Sharma',
    email: 'ramesh.sharma@plinth.example',
    phone: '+91 98201 11001',
    role: 'Department Head',
    deptCode: 'DEPT-CUTTING',
    designation: 'Head of Cutting & Profiling',
    ranking: 8,
    hierarchyLevel: 2,
    baseSalary: 115000,
    hourlyRate: 650,
    gender: 'Male',
    dateOfBirth: '1979-04-12',
    hireDate: '2020-03-15',
    bloodGroup: 'B+',
    maritalStatus: 'Married',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400072',
    addressLine1: 'Flat 402, Sunrise Towers, Andheri East',
    panNumber: 'ABCPS1234F',
    aadhaarNumber: '4532 9871 2045',
    pfNumber: 'MH/BAN/0045123/001',
    esiNumber: '31000543210001',
    bankName: 'HDFC Bank',
    bankAccountNumber: '50100234567891',
    bankIfscCode: 'HDFC0000123',
    onboardingCompleted: true,
  },
  {
    employeeCode: 'EMP-CUT-01',
    firstName: 'Rajesh',
    lastName: 'Solanki',
    email: 'rajesh.solanki@plinth.example',
    phone: '+91 98201 11002',
    role: 'CNC Plasma Operator',
    deptCode: 'DEPT-CUTTING',
    designation: 'Senior CNC Plasma Specialist',
    ranking: 5,
    hierarchyLevel: 4,
    baseSalary: 52000,
    hourlyRate: 300,
    gender: 'Male',
    dateOfBirth: '1988-08-21',
    hireDate: '2022-01-10',
    bloodGroup: 'O+',
    maritalStatus: 'Married',
    city: 'Navi Mumbai',
    state: 'Maharashtra',
    postalCode: '410210',
    addressLine1: 'Plot 18, Sector 12, Kharghar',
    panNumber: 'BKLPS5678G',
    aadhaarNumber: '7821 3490 1123',
    pfNumber: 'MH/BAN/0045123/002',
    esiNumber: '31000543210002',
    bankName: 'State Bank of India',
    bankAccountNumber: '30459812450',
    bankIfscCode: 'SBIN0001452',
    onboardingCompleted: true,
  },
  {
    employeeCode: 'EMP-CUT-02',
    firstName: 'Amit',
    lastName: 'Chauhan',
    email: 'amit.chauhan@plinth.example',
    phone: '+91 98201 11003',
    role: 'Mitre Saw Operator',
    deptCode: 'DEPT-CUTTING',
    designation: 'Heavy Mitre Saw Operator',
    ranking: 4,
    hierarchyLevel: 5,
    baseSalary: 42000,
    hourlyRate: 240,
    gender: 'Male',
    dateOfBirth: '1993-11-05',
    hireDate: '2023-04-18',
    bloodGroup: 'A+',
    maritalStatus: 'Single',
    city: 'Thane',
    state: 'Maharashtra',
    postalCode: '400604',
    addressLine1: 'B-12, Shanti Nagar, Wagle Estate',
    panNumber: 'CHPAM8901K',
    aadhaarNumber: '9012 4589 3321',
    pfNumber: 'MH/BAN/0045123/003',
    esiNumber: '31000543210003',
    bankName: 'ICICI Bank',
    bankAccountNumber: '002101567890',
    bankIfscCode: 'ICIC0000021',
    onboardingCompleted: true,
  },

  // 2. Structural Fit-Up & Heavy Welding Shop (DEPT-FITUP-WELD)
  {
    employeeCode: 'EMP-WELD-HEAD',
    firstName: 'Vikramaditya',
    lastName: 'Rao',
    email: 'vikramaditya.rao@plinth.example',
    phone: '+91 98201 22001',
    role: 'Department Head',
    deptCode: 'DEPT-FITUP-WELD',
    designation: 'Chief Structural Welding Superintendent',
    ranking: 8,
    hierarchyLevel: 2,
    baseSalary: 122000,
    hourlyRate: 700,
    gender: 'Male',
    dateOfBirth: '1981-06-19',
    hireDate: '2019-11-01',
    bloodGroup: 'A+',
    maritalStatus: 'Married',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400053',
    addressLine1: '701, Lotus Enclave, Lokhandwala Complex',
    panNumber: 'VKMPR4321L',
    aadhaarNumber: '6745 8923 1109',
    pfNumber: 'MH/BAN/0045123/004',
    esiNumber: '31000543210004',
    bankName: 'Axis Bank',
    bankAccountNumber: '912010045678912',
    bankIfscCode: 'UTIB0000124',
    onboardingCompleted: true,
  },
  {
    employeeCode: 'EMP-WELD-02',
    firstName: 'Dinesh',
    lastName: 'Patel',
    email: 'dinesh.patel@plinth.example',
    phone: '+91 98201 22002',
    role: 'Senior SAW Welding Specialist',
    deptCode: 'DEPT-FITUP-WELD',
    designation: 'Master Welder & SAW Gantry Lead',
    ranking: 6,
    hierarchyLevel: 4,
    baseSalary: 58000,
    hourlyRate: 330,
    gender: 'Male',
    dateOfBirth: '1986-03-14',
    hireDate: '2021-06-01',
    bloodGroup: 'O+',
    maritalStatus: 'Married',
    city: 'Navi Mumbai',
    state: 'Maharashtra',
    postalCode: '410206',
    addressLine1: 'Room 304, Shiv Kripa, Panvel',
    panNumber: 'DNSPT6543M',
    aadhaarNumber: '3412 8901 7765',
    pfNumber: 'MH/BAN/0045123/005',
    esiNumber: '31000543210005',
    bankName: 'HDFC Bank',
    bankAccountNumber: '50100456123987',
    bankIfscCode: 'HDFC0000123',
    onboardingCompleted: true,
  },
  {
    employeeCode: 'EMP-WELD-03',
    firstName: 'Ganesh',
    lastName: 'Mhatre',
    email: 'ganesh.mhatre@plinth.example',
    phone: '+91 98201 22003',
    role: 'Fit-Up Fabricator',
    deptCode: 'DEPT-FITUP-WELD',
    designation: 'Hydraulic Bed Fit-Up Specialist',
    ranking: 4,
    hierarchyLevel: 5,
    baseSalary: 45000,
    hourlyRate: 260,
    gender: 'Male',
    dateOfBirth: '1991-09-28',
    hireDate: '2022-09-15',
    bloodGroup: 'AB+',
    maritalStatus: 'Married',
    city: 'Thane',
    state: 'Maharashtra',
    postalCode: '400601',
    addressLine1: '12/A, Kisan Nagar No 2',
    panNumber: 'MHTGN9012P',
    aadhaarNumber: '5623 7812 4490',
    pfNumber: 'MH/BAN/0045123/006',
    esiNumber: '31000543210006',
    bankName: 'Bank of Baroda',
    bankAccountNumber: '04510200014589',
    bankIfscCode: 'BARB0THANEW',
    onboardingCompleted: true,
  },

  // 3. Precision Milling & Flange Facing Bay (DEPT-MACHINING)
  {
    employeeCode: 'EMP-MACH-HEAD',
    firstName: 'Irfan',
    lastName: 'Khan',
    email: 'irfan.khan@plinth.example',
    phone: '+91 98201 33001',
    role: 'Department Head',
    deptCode: 'DEPT-MACHINING',
    designation: 'Precision Tooling & Machining In-Charge',
    ranking: 8,
    hierarchyLevel: 2,
    baseSalary: 118000,
    hourlyRate: 670,
    gender: 'Male',
    dateOfBirth: '1983-12-04',
    hireDate: '2020-08-15',
    bloodGroup: 'B+',
    maritalStatus: 'Married',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400098',
    addressLine1: 'Flat 101, Gulmohar Heights, Kalina',
    panNumber: 'IKHPN3456Q',
    aadhaarNumber: '8901 2345 6712',
    pfNumber: 'MH/BAN/0045123/007',
    esiNumber: '31000543210007',
    bankName: 'Kotak Mahindra Bank',
    bankAccountNumber: '231145678901',
    bankIfscCode: 'KKBK0000671',
    onboardingCompleted: true,
  },
  {
    employeeCode: 'EMP-MACH-03',
    firstName: 'Sunil',
    lastName: 'Verma',
    email: 'sunil.verma@plinth.example',
    phone: '+91 98201 33002',
    role: 'Precision Boring Machinist',
    deptCode: 'DEPT-MACHINING',
    designation: 'Lead CNC Boring & Flange Facing Operator',
    ranking: 6,
    hierarchyLevel: 4,
    baseSalary: 55000,
    hourlyRate: 315,
    gender: 'Male',
    dateOfBirth: '1987-05-18',
    hireDate: '2021-09-01',
    bloodGroup: 'O-',
    maritalStatus: 'Married',
    city: 'Navi Mumbai',
    state: 'Maharashtra',
    postalCode: '410208',
    addressLine1: 'Rowhouse 4, Sector 19, Airoli',
    panNumber: 'VRMSN7890R',
    aadhaarNumber: '4123 5678 9034',
    pfNumber: 'MH/BAN/0045123/008',
    esiNumber: '31000543210008',
    bankName: 'HDFC Bank',
    bankAccountNumber: '50100789456123',
    bankIfscCode: 'HDFC0000123',
    onboardingCompleted: true,
  },
  {
    employeeCode: 'EMP-MACH-04',
    firstName: 'Pooja',
    lastName: 'Sharma',
    email: 'pooja.sharma@plinth.example',
    phone: '+91 98201 33003',
    role: 'Radial Drill Technician',
    deptCode: 'DEPT-MACHINING',
    designation: 'CNC Drill Bed Specialist',
    ranking: 5,
    hierarchyLevel: 4,
    baseSalary: 48000,
    hourlyRate: 275,
    gender: 'Female',
    dateOfBirth: '1994-07-22',
    hireDate: '2023-02-15',
    bloodGroup: 'A+',
    maritalStatus: 'Single',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400076',
    addressLine1: 'A-302, Lake View Apts, Powai',
    panNumber: 'SHRPJ1234S',
    aadhaarNumber: '6789 0123 4567',
    pfNumber: 'MH/BAN/0045123/009',
    esiNumber: '31000543210009',
    bankName: 'ICICI Bank',
    bankAccountNumber: '002105432198',
    bankIfscCode: 'ICIC0000021',
    onboardingCompleted: true,
  },

  // 4. Shot Blasting & Protective Coating Line (DEPT-SURFACE-FINISH)
  {
    employeeCode: 'EMP-SURF-HEAD',
    firstName: 'Prakash',
    lastName: 'Nair',
    email: 'prakash.nair@plinth.example',
    phone: '+91 98201 44001',
    role: 'Department Head',
    deptCode: 'DEPT-SURFACE-FINISH',
    designation: 'Protective Coatings & NACE Level II Incharge',
    ranking: 8,
    hierarchyLevel: 2,
    baseSalary: 112000,
    hourlyRate: 640,
    gender: 'Male',
    dateOfBirth: '1980-02-17',
    hireDate: '2020-05-10',
    bloodGroup: 'O+',
    maritalStatus: 'Married',
    city: 'Thane',
    state: 'Maharashtra',
    postalCode: '400607',
    addressLine1: 'Flat 904, Harmony Towers, Ghodbunder Rd',
    panNumber: 'NIRPK5678T',
    aadhaarNumber: '3456 7890 1234',
    pfNumber: 'MH/BAN/0045123/010',
    esiNumber: '31000543210010',
    bankName: 'Axis Bank',
    bankAccountNumber: '912010098765432',
    bankIfscCode: 'UTIB0000124',
    onboardingCompleted: true,
  },
  {
    employeeCode: 'EMP-SURF-04',
    firstName: 'Kiran',
    lastName: 'Yadav',
    email: 'kiran.yadav@plinth.example',
    phone: '+91 98201 44002',
    role: 'Surface Preparation Inspector',
    deptCode: 'DEPT-SURFACE-FINISH',
    designation: 'Lead Shot Blasting & DFT Inspector',
    ranking: 5,
    hierarchyLevel: 4,
    baseSalary: 49000,
    hourlyRate: 280,
    gender: 'Male',
    dateOfBirth: '1990-10-11',
    hireDate: '2022-03-20',
    bloodGroup: 'B+',
    maritalStatus: 'Married',
    city: 'Navi Mumbai',
    state: 'Maharashtra',
    postalCode: '410209',
    addressLine1: 'Chawl No 5, Turbhe Naka',
    panNumber: 'YDVKI9012U',
    aadhaarNumber: '7890 1234 5678',
    pfNumber: 'MH/BAN/0045123/011',
    esiNumber: '31000543210011',
    bankName: 'State Bank of India',
    bankAccountNumber: '31024567890',
    bankIfscCode: 'SBIN0001452',
    onboardingCompleted: true,
  },
  {
    employeeCode: 'EMP-SURF-05',
    firstName: 'Meena',
    lastName: 'Deshmukh',
    email: 'meena.deshmukh@plinth.example',
    phone: '+91 98201 44003',
    role: 'Spray Booth Technician',
    deptCode: 'DEPT-SURFACE-FINISH',
    designation: 'Airless Epoxy Spray Applicator',
    ranking: 4,
    hierarchyLevel: 5,
    baseSalary: 43000,
    hourlyRate: 245,
    gender: 'Female',
    dateOfBirth: '1995-01-30',
    hireDate: '2023-07-01',
    bloodGroup: 'A+',
    maritalStatus: 'Single',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400080',
    addressLine1: 'Room 15, Jai Hind Society, Mulund West',
    panNumber: 'DSHMN3456V',
    aadhaarNumber: '2345 6789 0123',
    pfNumber: 'MH/BAN/0045123/012',
    esiNumber: '31000543210012',
    bankName: 'Canara Bank',
    bankAccountNumber: '1234101056789',
    bankIfscCode: 'CNRB0001234',
    onboardingCompleted: false, // in onboarding pending list
  },

  // 5. Heavy Industrial Final Assembly & Convergence Line (DEPT-FINAL-ASSEMBLY)
  {
    employeeCode: 'EMP-ASY-05',
    firstName: 'Subhash',
    lastName: 'Chandra',
    email: 'subhash.chandra@plinth.example',
    phone: '+91 98201 55001',
    role: 'Assembly & FAT Incharge',
    deptCode: 'DEPT-FINAL-ASSEMBLY',
    designation: 'General Manager - Assembly & Factory Acceptance',
    ranking: 8,
    hierarchyLevel: 2,
    baseSalary: 125000,
    hourlyRate: 720,
    gender: 'Male',
    dateOfBirth: '1978-08-09',
    hireDate: '2019-04-01',
    bloodGroup: 'AB+',
    maritalStatus: 'Married',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400058',
    addressLine1: '1202, Regency Park, Andheri West',
    panNumber: 'CHNSB7890W',
    aadhaarNumber: '9012 3456 7890',
    pfNumber: 'MH/BAN/0045123/013',
    esiNumber: '31000543210013',
    bankName: 'HDFC Bank',
    bankAccountNumber: '50100987123456',
    bankIfscCode: 'HDFC0000123',
    onboardingCompleted: true,
  },
  {
    employeeCode: 'EMP-ASY-06',
    firstName: 'Fardeen',
    lastName: 'Sayed',
    email: 'fardeen.sayed@plinth.example',
    phone: '+91 98201 55002',
    role: 'Assembly Specialist',
    deptCode: 'DEPT-FINAL-ASSEMBLY',
    designation: 'High-Torque Bolt & Convergence Specialist',
    ranking: 5,
    hierarchyLevel: 4,
    baseSalary: 51000,
    hourlyRate: 290,
    gender: 'Male',
    dateOfBirth: '1992-04-16',
    hireDate: '2022-08-10',
    bloodGroup: 'B+',
    maritalStatus: 'Single',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400070',
    addressLine1: 'B-201, Kohinoor City, Kurla West',
    panNumber: 'SYDFR1234X',
    aadhaarNumber: '1234 5678 9012',
    pfNumber: 'MH/BAN/0045123/014',
    esiNumber: '31000543210014',
    bankName: 'ICICI Bank',
    bankAccountNumber: '002109876543',
    bankIfscCode: 'ICIC0000021',
    onboardingCompleted: true,
  },
  {
    employeeCode: 'EMP-ASY-07',
    firstName: 'Ananya',
    lastName: 'Iyer',
    email: 'ananya.iyer@plinth.example',
    phone: '+91 98201 55003',
    role: 'FAT & Hydrostatic Testing Engineer',
    deptCode: 'DEPT-FINAL-ASSEMBLY',
    designation: 'Pressure Testing & FAT Compliance Officer',
    ranking: 6,
    hierarchyLevel: 3,
    baseSalary: 64000,
    hourlyRate: 365,
    gender: 'Female',
    dateOfBirth: '1991-12-14',
    hireDate: '2021-10-15',
    bloodGroup: 'O+',
    maritalStatus: 'Married',
    city: 'Navi Mumbai',
    state: 'Maharashtra',
    postalCode: '410210',
    addressLine1: 'Sector 20, Jalvayu Vihar, Kharghar',
    panNumber: 'IYRAN5678Y',
    aadhaarNumber: '5678 9012 3456',
    pfNumber: 'MH/BAN/0045123/015',
    esiNumber: '31000543210015',
    bankName: 'State Bank of India',
    bankAccountNumber: '32054678901',
    bankIfscCode: 'SBIN0001452',
    onboardingCompleted: true,
  },

  // 6. Central Operations / HR Leadership
  {
    employeeCode: 'EMP-HR-HEAD',
    firstName: 'Priyanka',
    lastName: 'Menon',
    email: 'priyanka.menon@plinth.example',
    phone: '+91 98201 99001',
    role: 'HR Director',
    deptCode: null, // Global
    designation: 'Vice President - Human Resources & Industrial Relations',
    ranking: 9,
    hierarchyLevel: 1,
    baseSalary: 165000,
    hourlyRate: 950,
    gender: 'Female',
    dateOfBirth: '1976-09-03',
    hireDate: '2018-01-15',
    bloodGroup: 'A+',
    maritalStatus: 'Married',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400050',
    addressLine1: 'Penthouse 14, Sea Breeze, Bandra West',
    panNumber: 'MNMPR9012Z',
    aadhaarNumber: '7890 5678 1234',
    pfNumber: 'MH/BAN/0045123/016',
    esiNumber: '31000543210016',
    bankName: 'HDFC Bank',
    bankAccountNumber: '50100112233445',
    bankIfscCode: 'HDFC0000123',
    onboardingCompleted: true,
  },
  {
    employeeCode: 'EMP-HR-SPEC',
    firstName: 'Sneha',
    lastName: 'Kulkarni',
    email: 'sneha.kulkarni@plinth.example',
    phone: '+91 98201 99002',
    role: 'HR Specialist',
    deptCode: null,
    designation: 'HR Operations & Workforce Payroll Lead',
    ranking: 6,
    hierarchyLevel: 3,
    baseSalary: 68000,
    hourlyRate: 390,
    gender: 'Female',
    dateOfBirth: '1993-03-29',
    hireDate: '2022-05-02',
    bloodGroup: 'B+',
    maritalStatus: 'Single',
    city: 'Thane',
    state: 'Maharashtra',
    postalCode: '400602',
    addressLine1: 'B-501, Vasant Vihar, Pokhran Rd 2',
    panNumber: 'KLKSN3456A',
    aadhaarNumber: '2345 1234 9012',
    pfNumber: 'MH/BAN/0045123/017',
    esiNumber: '31000543210017',
    bankName: 'Kotak Mahindra Bank',
    bankAccountNumber: '231189012345',
    bankIfscCode: 'KKBK0000671',
    onboardingCompleted: true,
  },
  {
    employeeCode: 'EMP-ONB-NEW1',
    firstName: 'Devendra',
    lastName: 'Patil',
    email: 'devendra.patil@plinth.example',
    phone: '+91 98201 99003',
    role: 'Apprentice Fitter',
    deptCode: 'DEPT-FITUP-WELD',
    designation: 'Apprentice Structural Fabricator',
    ranking: 2,
    hierarchyLevel: 5,
    baseSalary: 28000,
    hourlyRate: 160,
    gender: 'Male',
    dateOfBirth: '2001-07-15',
    hireDate: '2026-11-01',
    bloodGroup: 'O+',
    maritalStatus: 'Single',
    city: 'Navi Mumbai',
    state: 'Maharashtra',
    postalCode: '410206',
    addressLine1: 'Room 12, Ganesh Krupa Chawl, Kalamboli',
    panNumber: 'PTLDV7890B',
    aadhaarNumber: '6789 3456 0123',
    pfNumber: 'MH/BAN/0045123/018',
    esiNumber: '31000543210018',
    bankName: 'Bank of Maharashtra',
    bankAccountNumber: '60012345678',
    bankIfscCode: 'MAHB0000123',
    onboardingCompleted: false, // In onboarding pending queue
  }
];

export async function seedComprehensiveHR() {
  console.log('🚀 [Comprehensive HR Seed] Starting deep full HR database seeding...');

  const passwordHash = await argon2.hash('password123');

  // 1. Fetch departments
  const depts = await prisma.department.findMany();
  const deptMap = new Map<string, typeof depts[0]>();
  for (const d of depts) {
    deptMap.set(d.code, d);
  }

  // 2. Fetch existing Admin User for actor auditing
  const adminUser = await prisma.user.findFirst({ where: { role: 'admin' } }) ||
    await prisma.user.findFirst();

  if (!adminUser) throw new Error('No user found in database.');

  // 3. Ensure RBAC roles exist
  const rbacRoles = [
    { name: 'admin', description: 'System Administrator with unrestricted access' },
    { name: 'hr_director', description: 'Head of Human Capital & Industrial Relations' },
    { name: 'hr_manager', description: 'Human Resources & Payroll Operations' },
    { name: 'department_head', description: 'Department In-Charge Supervisor' },
    { name: 'shop_floor_operator', description: 'Shop Floor & Machine Operator' },
    { name: 'quality_inspector', description: 'QC & NDT Inspection Specialist' },
  ];

  const roleRecordMap = new Map<string, any>();
  for (const r of rbacRoles) {
    const roleRecord = await prisma.rbacRole.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: { name: r.name, description: r.description, isSystem: true }
    });
    roleRecordMap.set(r.name, roleRecord);
  }

  // 4. Upsert All Employees with 100% of fields populated
  console.log('👥 Seeding complete Employee directory records...');
  const employeeRecordMap = new Map<string, any>();

  for (const item of EMPLOYEES_DATA) {
    const dept = item.deptCode ? deptMap.get(item.deptCode) : null;
    const deptId = dept ? dept.id : null;

    const data: Prisma.EmployeeCreateInput = {
      employeeCode: item.employeeCode,
      firstName: item.firstName,
      lastName: item.lastName,
      email: item.email,
      phone: item.phone,
      role: item.role,
      status: LifecycleStatus.ACTIVE,
      gender: item.gender,
      dateOfBirth: new Date(item.dateOfBirth),
      hireDate: new Date(item.hireDate),
      ranking: item.ranking,
      designation: item.designation,
      hierarchyLevel: item.hierarchyLevel,
      baseSalary: new Prisma.Decimal(item.baseSalary),
      hourlyRate: new Prisma.Decimal(item.hourlyRate),
      bloodGroup: item.bloodGroup,
      maritalStatus: item.maritalStatus,
      city: item.city,
      state: item.state,
      postalCode: item.postalCode,
      country: 'India',
      addressLine1: item.addressLine1,
      emergencyContactName: `${item.lastName} Family Contact`,
      emergencyContactPhone: '+91 98200 99999',
      emergencyContactRelation: item.maritalStatus === 'Married' ? 'Spouse' : 'Parent',
      bankName: item.bankName,
      bankAccountNumber: item.bankAccountNumber,
      bankIfscCode: item.bankIfscCode,
      panNumber: item.panNumber,
      aadhaarNumber: item.aadhaarNumber,
      pfNumber: item.pfNumber,
      esiNumber: item.esiNumber,
      onboardingCompleted: item.onboardingCompleted,
      onboardingCompletedAt: item.onboardingCompleted ? new Date(item.hireDate) : null,
      department: deptId ? { connect: { id: deptId } } : undefined
    };

    const existing = await prisma.employee.findUnique({ where: { employeeCode: item.employeeCode } });
    let empRecord;
    if (existing) {
      empRecord = await prisma.employee.update({
        where: { id: existing.id },
        data: {
          ...data,
          department: deptId ? { connect: { id: deptId } } : { disconnect: true }
        }
      });
    } else {
      empRecord = await prisma.employee.create({ data });
    }
    employeeRecordMap.set(item.employeeCode, empRecord);
  }

  // Set up manager hierarchy links:
  // - Top VP HR (EMP-HR-HEAD) reports to none (top)
  // - Dept Heads report to VP HR
  // - Department operators/technicians report to their Department Head
  console.log('🔗 Wiring up Employee Reporting Hierarchy & Manager Links...');
  const vpHr = employeeRecordMap.get('EMP-HR-HEAD');
  for (const item of EMPLOYEES_DATA) {
    const emp = employeeRecordMap.get(item.employeeCode);
    if (!emp) continue;

    let managerId: string | null = null;
    if (item.hierarchyLevel === 2) {
      managerId = vpHr ? vpHr.id : null;
    } else if (item.hierarchyLevel && item.hierarchyLevel >= 3 && item.deptCode) {
      // Find dept head
      const deptHeadItem = EMPLOYEES_DATA.find(e => e.deptCode === item.deptCode && e.hierarchyLevel === 2);
      if (deptHeadItem) {
        const headRecord = employeeRecordMap.get(deptHeadItem.employeeCode);
        managerId = headRecord ? headRecord.id : null;
      }
    } else if (item.employeeCode === 'EMP-HR-SPEC') {
      managerId = vpHr ? vpHr.id : null;
    }

    if (managerId && managerId !== emp.id) {
      await prisma.employee.update({
        where: { id: emp.id },
        data: { managerId }
      });
    }
  }

  // Update Department Heads in department table to match the real Department Head employee names
  console.log('🏢 Linking Department Heads in canonical departments table...');
  for (const [code, dept] of deptMap.entries()) {
    const headEmp = EMPLOYEES_DATA.find(e => e.deptCode === code && e.hierarchyLevel === 2);
    if (headEmp) {
      await prisma.department.update({
        where: { id: dept.id },
        data: {
          departmentHead: `${headEmp.firstName} ${headEmp.lastName}`,
          status: LifecycleStatus.ACTIVE
        }
      });
    }
  }

  // 5. Create / Link User Accounts and RBAC roles for each employee
  console.log('🔑 Provisioning User logins & RBAC roles for all employees...');
  for (const item of EMPLOYEES_DATA) {
    const emp = employeeRecordMap.get(item.employeeCode);
    if (!emp) continue;

    let userRole: Role = Role.employee;
    let rbacRoleName = 'shop_floor_operator';
    if (item.hierarchyLevel === 1) {
      userRole = Role.admin;
      rbacRoleName = 'hr_director';
    } else if (item.hierarchyLevel === 2) {
      userRole = Role.manager;
      rbacRoleName = 'department_head';
    } else if (item.role.includes('HR')) {
      userRole = Role.manager;
      rbacRoleName = 'hr_manager';
    } else if (item.role.includes('Inspector') || item.role.includes('Engineer')) {
      rbacRoleName = 'quality_inspector';
    }

    const dept = item.deptCode ? deptMap.get(item.deptCode) : null;

    const user = await prisma.user.upsert({
      where: { email: item.email },
      update: {
        name: `${item.firstName} ${item.lastName}`,
        firstName: item.firstName,
        lastName: item.lastName,
        password: passwordHash,
        role: userRole,
        title: item.designation,
        department: dept ? dept.name : 'Human Resources',
        assignedDepartmentId: dept ? dept.id : null,
        employeeRefId: emp.id,
        employeeId: emp.employeeCode,
        phone: item.phone,
        isActive: true,
        mustChangePassword: false,
        onboardingCompleted: item.onboardingCompleted
      },
      create: {
        email: item.email,
        name: `${item.firstName} ${item.lastName}`,
        firstName: item.firstName,
        lastName: item.lastName,
        password: passwordHash,
        role: userRole,
        title: item.designation,
        department: dept ? dept.name : 'Human Resources',
        assignedDepartmentId: dept ? dept.id : null,
        employeeRefId: emp.id,
        employeeId: emp.employeeCode,
        phone: item.phone,
        isActive: true,
        mustChangePassword: false,
        onboardingCompleted: item.onboardingCompleted
      }
    });

    const targetRole = roleRecordMap.get(rbacRoleName);
    if (targetRole) {
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: targetRole.id,
          organizationId: null
        }
      });
    }
  }

  // 6. Connect Workers to Production Execution (Batches without assignments)
  console.log('⚙️ Connecting employees to all Shop Floor Production Execution batches...');
  const batches = await prisma.departmentExecutionBatch.findMany({
    include: {
      workerAssignments: true,
      department: true
    }
  });

  for (const b of batches) {
    if (b.workerAssignments.length === 0) {
      // Find an operator for this department
      const deptCode = b.department?.code;
      const candidates = EMPLOYEES_DATA.filter(e => e.deptCode === deptCode && e.hierarchyLevel && e.hierarchyLevel >= 4);
      const chosen = candidates.length > 0 ? candidates[0] : EMPLOYEES_DATA[1];
      const empRecord = employeeRecordMap.get(chosen.employeeCode);

      if (empRecord) {
        await prisma.workerAssignment.create({
          data: {
            batchId: b.id,
            employeeId: empRecord.id,
            subtaskDescription: `Execution operations and safety compliance on ${b.batchNumber}`,
            assignedByActorId: adminUser.id,
            assignedAt: new Date()
          }
        });
      }
    }
  }

  // 7. Seed Tasks (Task Queue & Validation) across all employees
  console.log('📋 Seeding comprehensive Employee Tasks Queue & Validation records...');
  await prisma.employeeTask.deleteMany();

  const taskTemplates = [
    { title: 'CNC Plasma Nozzle Calibration & Bevel Test', desc: 'Perform ISO 9013 tolerance verification on torch head 1', priority: TaskPriority.HIGH, status: TaskStatus.COMPLETED, proof: true, validationNotes: 'Tolerance within ±0.15mm. Approved by supervisor.' },
    { title: 'Saw Blade Replacement & Hydraulic Tension Inspection', desc: 'Replace circular carbide blade and record oil pressure', priority: TaskPriority.MEDIUM, status: TaskStatus.COMPLETED, proof: true, validationNotes: 'Hydraulic tension verified at 180 Bar.' },
    { title: 'Plate Heat Number Tracking & Inward Log Alignment', desc: 'Cross verify mill certificates against cutting log', priority: TaskPriority.MEDIUM, status: TaskStatus.IN_PROGRESS, proof: false },
    { title: 'SAW Column Tandem Flux Moisture Level Check', desc: 'Bake welding flux at 300°C for 2 hours and verify moisture content <0.05%', priority: TaskPriority.URGENT, status: TaskStatus.UNDER_REVIEW, proof: true, proofNotes: 'Oven temperature logs and bake certificate attached.' },
    { title: 'Tandem Welding Arc Voltage & Travel Speed Audit', desc: 'Calibrate digital ammeter on Submerged Arc Gantry', priority: TaskPriority.HIGH, status: TaskStatus.COMPLETED, proof: true, validationNotes: 'Parameters verified against WPS-PLN-01.' },
    { title: 'Vertical Boring Lathe Spindle Runout Measurement', desc: 'Measure spindle radial runout using dial indicator', priority: TaskPriority.HIGH, status: TaskStatus.COMPLETED, proof: true, validationNotes: 'Runout within 0.008mm.' },
    { title: 'Flange Facing Tool Holder Offset Calibration', desc: 'Verify tool turret repeatability on flange face bay', priority: TaskPriority.MEDIUM, status: TaskStatus.IN_PROGRESS, proof: false },
    { title: 'Turbine Grit Blast Profile Sa 2.5 Verification', desc: 'Measure surface roughness profile using Testex replica tape', priority: TaskPriority.HIGH, status: TaskStatus.UNDER_REVIEW, proof: true, proofNotes: 'Sa 2.5 profile tape reading: 65 microns.' },
    { title: 'Epoxy Coating DFT Multi-Point Magnetic Gauge Inspection', desc: 'Take 5-point dry film thickness measurements across 10 structural beams', priority: TaskPriority.HIGH, status: TaskStatus.COMPLETED, proof: true, validationNotes: 'DFT 320 microns verified across all points.' },
    { title: 'Hydrostatic Vessel Pressure Hold Test (1.5x Design Pressure)', desc: 'Hold vessel under 45 Bar water pressure for 30 minutes without pressure drop', priority: TaskPriority.URGENT, status: TaskStatus.COMPLETED, proof: true, validationNotes: 'Zero pressure drop observed over 30 mins.' },
    { title: 'Final Structural FAT Quality Checklist Sign-Off', desc: 'Assemble full fabrication documentation dossier for third party inspection', priority: TaskPriority.HIGH, status: TaskStatus.IN_PROGRESS, proof: false },
    { title: 'ISO 45001 Workshop Safety & Eye Protection Audit', desc: 'Inspect PPE adherence and emergency eye wash stations', priority: TaskPriority.MEDIUM, status: TaskStatus.COMPLETED, proof: true, validationNotes: 'All stations inspected and compliant.' },
  ];

  const proofSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 300 150"><rect fill="%23e0f2fe" width="300" height="150"/><text fill="%230369a1" font-size="13" font-family="sans-serif" font-weight="bold" x="50%25" y="45%25" text-anchor="middle">WORKSTATION VERIFICATION PROOF</text><text fill="%230284c7" font-size="11" font-family="sans-serif" x="50%25" y="65%25" text-anchor="middle">Calibration Test Log Attached OK</text></svg>';

  const allEmployeesList = Array.from(employeeRecordMap.values());
  let taskCounter = 0;

  for (let eIdx = 0; eIdx < allEmployeesList.length; eIdx++) {
    const emp = allEmployeesList[eIdx];
    // Create 3 to 4 tasks per employee
    for (let t = 0; t < 3; t++) {
      const tmpl = taskTemplates[(taskCounter++) % taskTemplates.length];
      const isCompleted = tmpl.status === TaskStatus.COMPLETED;
      const isReview = tmpl.status === TaskStatus.UNDER_REVIEW;
      const taskDate = new Date(Date.now() - (t * 2 + 1) * 24 * 3600000);

      await prisma.employeeTask.create({
        data: {
          title: `${tmpl.title} (${emp.firstName})`,
          description: tmpl.desc,
          employeeId: emp.id,
          assignedBy: adminUser.id,
          department: emp.departmentId ? deptMap.get(EMPLOYEES_DATA.find(ed => ed.employeeCode === emp.employeeCode)?.deptCode || '')?.name : 'Plant Operations',
          priority: tmpl.priority,
          status: tmpl.status,
          dueDate: new Date(taskDate.getTime() + 4 * 24 * 3600000),
          completedAt: isCompleted ? new Date(taskDate.getTime() + 2 * 24 * 3600000) : null,
          submittedAt: (isCompleted || isReview) ? new Date(taskDate.getTime() + 24 * 3600000) : null,
          proofUrl: tmpl.proof ? proofSvg : null,
          proofFileName: tmpl.proof ? `calibration-proof-${emp.employeeCode}.svg` : null,
          proofNotes: tmpl.proof ? (tmpl.proofNotes || 'Operation test procedure followed strictly according to SOP.') : null,
          validatedBy: isCompleted ? adminUser.name : null,
          validationNotes: isCompleted ? tmpl.validationNotes : null,
          notes: `Operational line task assigned for ${emp.designation}`,
          createdAt: taskDate,
          updatedAt: isCompleted ? new Date(taskDate.getTime() + 2 * 24 * 3600000) : taskDate
        }
      });
    }
  }

  // 8. Seed Attendance (My Attendance & Leaves) for 60 consecutive days
  console.log('📅 Seeding 60 days of realistic Attendance & Punch Logs for all employees...');
  await prisma.attendance.deleteMany();

  const daysCount = 60;
  for (const emp of allEmployeesList) {
    const isNew = emp.employeeCode === 'EMP-ONB-NEW1';
    const effectiveDays = isNew ? 14 : daysCount;

    for (let d = 0; d < effectiveDays; d++) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      // Strip time
      const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

      const dayOfWeek = dateOnly.getDay(); // 0 is Sunday
      if (dayOfWeek === 0) {
        // Sunday Holiday
        await prisma.attendance.create({
          data: {
            employeeId: emp.id,
            date: dateOnly,
            status: AttendanceStatus.HOLIDAY,
            workHours: new Prisma.Decimal(0),
            notes: 'Weekly Scheduled Off (Sunday)',
            markedBy: 'SYSTEM'
          }
        });
        continue;
      }

      // Realistic variation:
      // ~88% PRESENT, 4% HALF_DAY, 4% LEAVE_CASUAL, 2% LEAVE_SICK, 2% ABSENT
      const hash = (d * 17 + emp.firstName.charCodeAt(0)) % 100;
      let status: AttendanceStatus = AttendanceStatus.PRESENT;
      let workHours = 8.5;
      let checkIn: Date | null = new Date(dateOnly.getTime() + 9 * 3600000); // 9:00 AM
      let checkOut: Date | null = new Date(dateOnly.getTime() + 17.5 * 3600000); // 5:30 PM
      let notes: string | null = 'On-time shop floor check-in via biometric punch';

      if (hash > 96) {
        status = AttendanceStatus.LEAVE_SICK;
        workHours = 0;
        checkIn = null;
        checkOut = null;
        notes = 'Sick Leave approved by Medical Officer';
      } else if (hash > 92) {
        status = AttendanceStatus.LEAVE_CASUAL;
        workHours = 0;
        checkIn = null;
        checkOut = null;
        notes = 'Casual Leave applied & approved';
      } else if (hash > 88) {
        status = AttendanceStatus.HALF_DAY;
        workHours = 4.0;
        checkOut = new Date(dateOnly.getTime() + 13 * 3600000); // 1:00 PM
        notes = 'Half day permission for personal obligation';
      } else if (hash === 50) {
        status = AttendanceStatus.ABSENT;
        workHours = 0;
        checkIn = null;
        checkOut = null;
        notes = 'Unplanned absence recorded';
      }

      await prisma.attendance.create({
        data: {
          employeeId: emp.id,
          date: dateOnly,
          status,
          checkIn,
          checkOut,
          workHours: new Prisma.Decimal(workHours),
          notes,
          markedBy: 'Biometric System'
        }
      });
    }
  }

  // 9. Seed Pay Slips (Last 3 Months: Aug 2026, Sep 2026, Oct 2026)
  console.log('💵 Seeding monthly Pay Slips for all employees...');
  await prisma.paySlip.deleteMany();

  const payPeriods = [
    { month: 8, year: 2026, days: 31 },
    { month: 9, year: 2026, days: 30 },
    { month: 10, year: 2026, days: 31 },
  ];

  for (const emp of allEmployeesList) {
    const base = Number(emp.baseSalary) || 45000;
    const hra = Math.round(base * 0.40);
    const allowances = Math.round(base * 0.15);

    for (const p of payPeriods) {
      const bonus = p.month === 10 ? Math.round(base * 0.10) : 0; // Festive bonus in Oct
      const gross = base + hra + allowances + bonus;
      const pf = Math.round(base * 0.12);
      const tax = Math.round(gross * 0.08);
      const other = 200; // Professional Tax
      const deductions = pf + tax + other;
      const net = gross - deductions;

      const pStart = new Date(p.year, p.month - 1, 1);
      const pEnd = new Date(p.year, p.month, 0);
      const payDate = new Date(p.year, p.month, 5); // 5th of next month

      await prisma.paySlip.create({
        data: {
          employeeId: emp.id,
          month: p.month,
          year: p.year,
          payPeriodStart: pStart,
          payPeriodEnd: pEnd,
          basicSalary: new Prisma.Decimal(base),
          hra: new Prisma.Decimal(hra),
          allowances: new Prisma.Decimal(allowances),
          bonus: new Prisma.Decimal(bonus),
          grossPay: new Prisma.Decimal(gross),
          pfDeduction: new Prisma.Decimal(pf),
          taxDeduction: new Prisma.Decimal(tax),
          otherDeduction: new Prisma.Decimal(other),
          netPay: new Prisma.Decimal(net),
          status: PaySlipStatus.PAID,
          paymentDate: payDate,
          paymentMethod: 'Bank Transfer (NEFT/RTGS)',
          notes: `Monthly payroll processed & credited to ${emp.bankName}`
        }
      });
    }
  }

  // 10. Seed Employee Documents (ID, Offer, Tax, Certificates)
  console.log('📄 Seeding verified employee verification documents...');
  await prisma.employeeDocument.deleteMany();

  const sampleDocSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect fill="%23f1f5f9" width="300" height="200"/><text fill="%23334155" font-size="14" font-family="sans-serif" font-weight="bold" x="50%25" y="45%25" text-anchor="middle">OFFICIAL HR DOCUMENT</text><text fill="%23475569" font-size="11" font-family="sans-serif" x="50%25" y="60%25" text-anchor="middle">Verified & Digitally Sealed</text></svg>';

  for (const emp of allEmployeesList) {
    const docs = [
      { title: 'Aadhaar Card Copy', category: 'ID_PROOF', size: 142000, mime: 'image/svg+xml' },
      { title: 'PAN Card Copy', category: 'TAX_DOC', size: 118000, mime: 'image/svg+xml' },
      { title: 'Appointment & Offer Letter', category: 'OFFER_LETTER', size: 345000, mime: 'application/pdf' },
      { title: 'Technical Skill & Safety Certificate', category: 'CERTIFICATE', size: 289000, mime: 'application/pdf' },
    ];

    for (const d of docs) {
      await prisma.employeeDocument.create({
        data: {
          employeeId: emp.id,
          title: d.title,
          category: d.category,
          fileUrl: sampleDocSvg,
          fileSize: d.size,
          mimeType: d.mime,
          verified: emp.onboardingCompleted,
          verifiedBy: emp.onboardingCompleted ? adminUser.name : null,
          verifiedAt: emp.onboardingCompleted ? new Date(emp.hireDate || new Date()) : null
        }
      });
    }
  }

  // 11. Seed Work Experience
  console.log('💼 Seeding previous Work Experience...');
  await prisma.workExperience.deleteMany();

  for (const emp of allEmployeesList) {
    await prisma.workExperience.create({
      data: {
        employeeId: emp.id,
        companyName: 'Bharat Heavy Engineering Works Ltd.',
        jobTitle: `Junior ${emp.designation || 'Technician'}`,
        startDate: new Date('2017-06-01'),
        endDate: new Date('2021-05-31'),
        isCurrent: false,
        responsibilities: 'Heavy industrial manufacturing, precision fabrication, quality conformance and safety protocols.',
        location: 'Mumbai Industrial Corridor'
      }
    });

    await prisma.workExperience.create({
      data: {
        employeeId: emp.id,
        companyName: 'Plinth Heavy Engineering Industries',
        jobTitle: emp.designation || emp.role,
        startDate: new Date(emp.hireDate || '2021-06-01'),
        endDate: null,
        isCurrent: true,
        responsibilities: `Core departmental lead execution for ${emp.role}`,
        location: 'Main Plinth Plant (FAC-01)'
      }
    });
  }

  // 12. Seed Onboarding Details
  console.log('📝 Seeding Onboarding checklist status & compliance acknowledgments...');
  await prisma.onboardingDetails.deleteMany();

  for (const emp of allEmployeesList) {
    const isDone = emp.onboardingCompleted;
    await prisma.onboardingDetails.create({
      data: {
        employeeId: emp.id,
        personalDetailsComplete: true,
        documentsUploadComplete: isDone,
        experienceComplete: true,
        agreementsComplete: isDone,
        agreedToTerms: isDone,
        agreedToConductCode: isDone,
        agreedToNda: isDone,
        signatureText: isDone ? `${emp.firstName} ${emp.lastName}` : null,
        agreedAt: isDone ? new Date(emp.hireDate || new Date()) : null,
        completedAt: isDone ? new Date(emp.hireDate || new Date()) : null
      }
    });
  }

  // 13. Seed Employee Goals
  console.log('🎯 Seeding Role Goals & Key Performance Targets...');
  await prisma.employeeGoal.deleteMany();

  for (const emp of allEmployeesList) {
    await prisma.employeeGoal.create({
      data: {
        employeeId: emp.id,
        title: 'Zero Scrap & Wastage Tolerance Conformance',
        description: 'Maintain monthly execution loss below 1.5% of input material quota',
        weight: new Prisma.Decimal(40.0),
        targetValue: new Prisma.Decimal(100.0),
        achievedValue: new Prisma.Decimal(96.5),
        unit: '%',
        status: EmployeeGoalStatus.IN_PROGRESS,
        startDate: new Date('2026-07-01'),
        targetDate: new Date('2026-12-31'),
        approvedBy: adminUser.name
      }
    });

    await prisma.employeeGoal.create({
      data: {
        employeeId: emp.id,
        title: 'On-Time Production Execution & Handover',
        description: 'Complete scheduled execution batches within planned cycle times',
        weight: new Prisma.Decimal(60.0),
        targetValue: new Prisma.Decimal(100.0),
        achievedValue: new Prisma.Decimal(98.2),
        unit: '%',
        status: EmployeeGoalStatus.ACHIEVED,
        startDate: new Date('2026-07-01'),
        targetDate: new Date('2026-12-31'),
        achievedAt: new Date(),
        approvedBy: adminUser.name
      }
    });
  }

  // 14. Seed Employee Scoring Policy & Snapshots
  console.log('📊 Seeding Deterministic Performance Score Snapshots & Grade Ratings...');
  await prisma.employeeScoreSnapshot.deleteMany();

  let policy = await prisma.employeeScoringPolicy.findFirst({ where: { status: 'ACTIVE' } });
  if (!policy) {
    policy = await prisma.employeeScoringPolicy.create({
      data: {
        name: 'BALANCED_COMPREHENSIVE_POLICY_V2',
        version: 2,
        weights: {
          taskOutcomes: 20,
          workQuality: 20,
          deliveryReliability: 20,
          productivity: 10,
          roleGoals: 10,
          attendanceReliability: 20
        },
        rollingWindowDays: 90,
        minEvidenceTasks: 3,
        minEvidenceAttendances: 10,
        provisionalPolicy: 'NEUTRAL_PRIOR',
        provisionalNeutralScore: new Prisma.Decimal(70.0),
        status: 'ACTIVE',
        createdBy: 'SYSTEM'
      }
    });
  }

  for (let idx = 0; idx < allEmployeesList.length; idx++) {
    const emp = allEmployeesList[idx];
    const isTop = idx < 4;
    const scoreVal = isTop ? (92.5 + (idx % 4) * 1.8) : (82.0 + (idx % 5) * 2.2);
    const grade = scoreVal >= 90 ? 'A+' : scoreVal >= 80 ? 'A' : 'B';
    const velocity = isTop ? 'OPTIMAL' : 'FAST';

    await prisma.employeeScoreSnapshot.create({
      data: {
        employeeId: emp.id,
        policyId: policy.id,
        policyVersion: policy.version,
        overallScore: new Prisma.Decimal(scoreVal),
        grade,
        confidenceStatus: ScoreConfidenceStatus.SUFFICIENT_EVIDENCE,
        velocityRating: velocity,
        taskOutcomeScore: new Prisma.Decimal(isTop ? 94.0 : 84.0),
        qualityScore: new Prisma.Decimal(isTop ? 96.0 : 86.0),
        deliveryScore: new Prisma.Decimal(isTop ? 91.0 : 82.0),
        productivityScore: new Prisma.Decimal(isTop ? 90.0 : 80.0),
        roleGoalScore: new Prisma.Decimal(isTop ? 95.0 : 85.0),
        attendanceScore: new Prisma.Decimal(isTop ? 98.0 : 92.0),
        componentBreakdown: {
          taskOutcomes: { score: isTop ? 94.0 : 84.0, weight: 20 },
          workQuality: { score: isTop ? 96.0 : 86.0, weight: 20 },
          deliveryReliability: { score: isTop ? 91.0 : 82.0, weight: 20 },
          productivity: { score: isTop ? 90.0 : 80.0, weight: 10 },
          roleGoals: { score: isTop ? 95.0 : 85.0, weight: 10 },
          attendanceReliability: { score: isTop ? 98.0 : 92.0, weight: 20 },
          evidenceCount: { tasks: 4, attendances: 60, goals: 2 }
        },
        scoringPeriodStart: new Date(Date.now() - 90 * 24 * 3600000),
        scoringPeriodEnd: new Date(),
        calculatedAt: new Date()
      }
    });
  }

  console.log('\n🎉 ========================================================');
  console.log(`✨ COMPREHENSIVE HR MODULE SEED COMPLETED SUCCESSFULLY!`);
  console.log(`✨ Employees Seeded:      ${allEmployeesList.length}`);
  console.log(`✨ Departments Linked:    ${deptMap.size}`);
  console.log(`✨ User Logins Seeded:    ${allEmployeesList.length}`);
  console.log(`✨ Tasks Created:         ${allEmployeesList.length * 3}`);
  console.log(`✨ Attendances Logged:    ${await prisma.attendance.count()}`);
  console.log(`✨ PaySlips Generated:    ${await prisma.paySlip.count()}`);
  console.log(`✨ Documents Seeded:      ${await prisma.employeeDocument.count()}`);
  console.log(`✨ Onboardings Seeded:    ${await prisma.onboardingDetails.count()}`);
  console.log(`✨ Scores & Goals Seeded: ${await prisma.employeeScoreSnapshot.count()}`);
  console.log('🎉 ========================================================\n');
}

if (require.main === module) {
  seedComprehensiveHR()
    .catch((err) => {
      console.error('❌ Failed to seed comprehensive HR module:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
