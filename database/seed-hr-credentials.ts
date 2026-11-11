import { PrismaClient, LifecycleStatus, TaskPriority, TaskStatus, AttendanceStatus } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function seedHrAndEmployees() {
  console.log('🌱 Seeding HR Manager and Employee Accounts...');

  const passwordHash = await argon2.hash('Plinth@123!', { type: argon2.argon2id });
  const tempPasswordHash = await argon2.hash('TempPass@123!', { type: argon2.argon2id });

  // 1. Create or Find HR Department
  let hrDept = await prisma.department.findFirst({ where: { code: 'HR-DEPT' } });
  if (!hrDept) {
    let factory = await prisma.factory.findFirst();
    if (!factory) {
      factory = await prisma.factory.create({
        data: {
          code: 'PLANT-01',
          name: 'Plinth Primary Plant',
          status: LifecycleStatus.ACTIVE
        }
      });
    }
    hrDept = await prisma.department.create({
      data: {
        code: 'HR-DEPT',
        name: 'Human Resources & Talent',
        factoryId: factory.id,
        status: LifecycleStatus.ACTIVE
      }
    });
  }

  // 2. Create HR Manager Employee & User Account
  const hrEmployee = await prisma.employee.upsert({
    where: { email: 'hr.manager@plinth.local' },
    create: {
      employeeCode: 'EMP-HR01',
      firstName: 'Priya',
      lastName: 'Sharma',
      email: 'hr.manager@plinth.local',
      phone: '+91 9876500001',
      role: 'HR Manager',
      designation: 'Head of Human Resources',
      departmentId: hrDept.id,
      gender: 'Female',
      ranking: 9,
      hierarchyLevel: 2,
      baseSalary: 120000,
      status: LifecycleStatus.ACTIVE,
      onboardingCompleted: true,
      onboardingCompletedAt: new Date()
    },
    update: {
      firstName: 'Priya',
      lastName: 'Sharma',
      role: 'HR Manager',
      designation: 'Head of Human Resources',
      departmentId: hrDept.id,
      onboardingCompleted: true
    }
  });

  await prisma.user.upsert({
    where: { email: 'hr.manager@plinth.local' },
    create: {
      email: 'hr.manager@plinth.local',
      name: 'Priya Sharma (HR Manager)',
      firstName: 'Priya',
      lastName: 'Sharma',
      password: passwordHash,
      role: 'admin',
      employeeRefId: hrEmployee.id,
      employeeId: hrEmployee.employeeCode,
      title: 'Head of Human Resources',
      department: hrDept.name,
      isActive: true,
      onboardingCompleted: true,
      mustChangePassword: false
    },
    update: {
      name: 'Priya Sharma (HR Manager)',
      password: passwordHash,
      role: 'admin',
      employeeRefId: hrEmployee.id,
      isActive: true,
      onboardingCompleted: true,
      mustChangePassword: false
    }
  });

  // 3. Create Demo Employee 1 (Completed Onboarding with sample tasks & attendance)
  const empCompleted = await prisma.employee.upsert({
    where: { email: 'rohit.verma@plinth.local' },
    create: {
      employeeCode: 'EMP-1001',
      firstName: 'Rohit',
      lastName: 'Verma',
      email: 'rohit.verma@plinth.local',
      phone: '+91 9876500002',
      role: 'Senior QC Lead',
      designation: 'Senior QC Lead',
      departmentId: hrDept.id,
      gender: 'Male',
      ranking: 8,
      hierarchyLevel: 3,
      baseSalary: 65000,
      status: LifecycleStatus.ACTIVE,
      onboardingCompleted: true,
      onboardingCompletedAt: new Date(),
      addressLine1: '42 Industrial Area, Sector 5',
      city: 'Indore',
      state: 'Madhya Pradesh',
      postalCode: '452001',
      country: 'India',
      emergencyContactName: 'Sunita Verma',
      emergencyContactPhone: '+91 9876500099',
      bankAccountNumber: '918237461928',
      bankName: 'HDFC Bank',
      bankIfscCode: 'HDFC0001234',
      panNumber: 'ABCDE1234F',
      aadhaarNumber: '987654321012'
    },
    update: {
      onboardingCompleted: true
    }
  });

  await prisma.user.upsert({
    where: { email: 'rohit.verma@plinth.local' },
    create: {
      email: 'rohit.verma@plinth.local',
      name: 'Rohit Verma',
      firstName: 'Rohit',
      lastName: 'Verma',
      password: passwordHash,
      role: 'employee',
      employeeRefId: empCompleted.id,
      employeeId: empCompleted.employeeCode,
      title: 'Senior QC Lead',
      isActive: true,
      onboardingCompleted: true,
      mustChangePassword: false
    },
    update: {
      password: passwordHash,
      onboardingCompleted: true,
      mustChangePassword: false
    }
  });

  // Seed sample tasks for Rohit
  await prisma.employeeTask.deleteMany({ where: { employeeId: empCompleted.id } });
  await prisma.employeeTask.createMany({
    data: [
      {
        employeeId: empCompleted.id,
        title: 'Calibrate Station 3 Quality Gauge',
        description: 'Perform ISO standard gauge calibration and log deviation measurements.',
        priority: TaskPriority.HIGH,
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
        department: 'Quality Control'
      },
      {
        employeeId: empCompleted.id,
        title: 'Inspect Incoming Raw Material Batch RM-402',
        description: 'Verify metallurgical certificates and batch dimensional tolerances.',
        priority: TaskPriority.URGENT,
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
        department: 'Quality Control'
      },
      {
        employeeId: empCompleted.id,
        title: 'Submit Weekly Quality Non-Conformance Report',
        description: 'Summarize scrap variance and root-cause analysis for plant manager review.',
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.IN_PROGRESS,
        department: 'Quality Control'
      }
    ]
  });

  // Seed sample attendances for Rohit
  const today = new Date();
  for (let i = 1; i <= 10; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), i);
    await prisma.attendance.upsert({
      where: {
        employeeId_date: {
          employeeId: empCompleted.id,
          date: d
        }
      },
      create: {
        employeeId: empCompleted.id,
        date: d,
        status: i === 6 || i === 7 ? AttendanceStatus.HOLIDAY : AttendanceStatus.PRESENT,
        workHours: i === 6 || i === 7 ? null : 8.5,
        markedBy: 'SYSTEM'
      },
      update: {}
    });
  }

  // 4. Create Demo Employee 2 (Pending Onboarding with Temporary Password)
  const empPending = await prisma.employee.upsert({
    where: { email: 'ananya.patel@plinth.local' },
    create: {
      employeeCode: 'EMP-1002',
      firstName: 'Ananya',
      lastName: 'Patel',
      email: 'ananya.patel@plinth.local',
      phone: '+91 9876500003',
      role: 'Operations Trainee',
      designation: 'Operations Associate',
      departmentId: hrDept.id,
      gender: 'Female',
      ranking: 2,
      hierarchyLevel: 5,
      baseSalary: 32000,
      status: LifecycleStatus.ACTIVE,
      onboardingCompleted: false
    },
    update: {
      onboardingCompleted: false
    }
  });

  await prisma.user.upsert({
    where: { email: 'ananya.patel@plinth.local' },
    create: {
      email: 'ananya.patel@plinth.local',
      name: 'Ananya Patel',
      firstName: 'Ananya',
      lastName: 'Patel',
      password: tempPasswordHash,
      role: 'employee',
      employeeRefId: empPending.id,
      employeeId: empPending.employeeCode,
      title: 'Operations Associate',
      isActive: true,
      onboardingCompleted: false,
      mustChangePassword: true,
      onboardingToken: 'token_ananya_onboarding_123'
    },
    update: {
      password: tempPasswordHash,
      onboardingCompleted: false,
      mustChangePassword: true,
      onboardingToken: 'token_ananya_onboarding_123'
    }
  });

  console.log('✅ HR and Employee credentials successfully seeded:');
  console.log('----------------------------------------------------');
  console.log('👑 HR MANAGER:');
  console.log('  Email:    hr.manager@plinth.local');
  console.log('  Password: Plinth@123!');
  console.log('----------------------------------------------------');
  console.log('👤 EMPLOYEE 1 (Onboarded & Active):');
  console.log('  Email:    rohit.verma@plinth.local');
  console.log('  Password: Plinth@123!');
  console.log('----------------------------------------------------');
  console.log('🆕 EMPLOYEE 2 (New Hire - Pending Onboarding & Temp Pass):');
  console.log('  Email:     ananya.patel@plinth.local');
  console.log('  Temp Pass: TempPass@123!');
  console.log('  Onboarding Token: token_ananya_onboarding_123');
  console.log('----------------------------------------------------');
}

seedHrAndEmployees()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
