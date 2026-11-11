import { PrismaClient, Role, LifecycleStatus } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Department In-Charge & Operator Credentials for RBAC Testing...');

  const passwordHash = await argon2.hash('password123');

  // 1. Get or create RBAC roles
  let inchargeRole = await prisma.rbacRole.findUnique({ where: { name: 'department_incharge' } });
  if (!inchargeRole) {
    inchargeRole = await prisma.rbacRole.create({
      data: { name: 'department_incharge', description: 'Department In-Charge supervisor' }
    });
  }

  let operatorRole = await prisma.rbacRole.findUnique({ where: { name: 'shop_floor_operator' } });
  if (!operatorRole) {
    operatorRole = await prisma.rbacRole.create({
      data: { name: 'shop_floor_operator', description: 'Shop floor operator' }
    });
  }

  // Ensure Admin user has password123 and completed onboarding
  const adminEmails = ['admin@gmail.com', 'admin@plinth.example'];
  for (const email of adminEmails) {
    await prisma.user.upsert({
      where: { email },
      update: {
        password: passwordHash,
        role: Role.admin,
        isActive: true,
        mustChangePassword: false,
        onboardingCompleted: true
      },
      create: {
        email,
        name: 'System Admin',
        firstName: 'System',
        lastName: 'Admin',
        password: passwordHash,
        role: Role.admin,
        isActive: true,
        mustChangePassword: false,
        onboardingCompleted: true
      }
    });
  }

  // 2. Fetch all active departments
  const departments = await prisma.department.findMany({
    where: { status: 'ACTIVE' }
  });

  console.log(`Found ${departments.length} active departments.`);

  const seededCredentials: Array<{
    department: string;
    code: string;
    inChargeEmail: string;
    operatorEmail: string;
    password: string;
  }> = [];

  for (const dept of departments) {
    const slug = dept.code.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const inchargeEmail = `${slug}.head@plinth.example`;
    const operatorEmail = `${slug}.op@plinth.example`;

    // A. Seed / Link Employee Record for Operator
    const empCode = `EMP-${slug.slice(0, 10).toUpperCase()}-01`;
    const employee = await prisma.employee.upsert({
      where: { employeeCode: empCode },
      update: {
        firstName: dept.name.slice(0, 20),
        lastName: 'Operator',
        email: operatorEmail,
        role: 'Operator',
        departmentId: dept.id,
        status: LifecycleStatus.ACTIVE
      },
      create: {
        employeeCode: empCode,
        firstName: dept.name.slice(0, 20),
        lastName: 'Operator',
        email: operatorEmail,
        role: 'Operator',
        departmentId: dept.id,
        status: LifecycleStatus.ACTIVE
      }
    });

    // B. Create/Update In-Charge User
    const inchargeUser = await prisma.user.upsert({
      where: { email: inchargeEmail },
      update: {
        name: `${dept.name} In-Charge`,
        firstName: dept.name.slice(0, 20),
        lastName: 'Head',
        password: passwordHash,
        role: Role.employee,
        department: dept.name,
        assignedDepartmentId: dept.id,
        isActive: true,
        mustChangePassword: false,
        onboardingCompleted: true
      },
      create: {
        email: inchargeEmail,
        name: `${dept.name} In-Charge`,
        firstName: dept.name.slice(0, 20),
        lastName: 'Head',
        password: passwordHash,
        role: Role.employee,
        department: dept.name,
        assignedDepartmentId: dept.id,
        isActive: true,
        mustChangePassword: false,
        onboardingCompleted: true
      }
    });

    const inchargeAssigned = await prisma.userRole.findFirst({
      where: { userId: inchargeUser.id, roleId: inchargeRole.id }
    });
    if (!inchargeAssigned) {
      await prisma.userRole.create({
        data: { userId: inchargeUser.id, roleId: inchargeRole.id }
      });
    }

    // C. Create/Update Operator User
    const operatorUser = await prisma.user.upsert({
      where: { email: operatorEmail },
      update: {
        name: `${dept.name} Operator`,
        firstName: dept.name.slice(0, 20),
        lastName: 'Operator',
        password: passwordHash,
        role: Role.employee,
        department: dept.name,
        assignedDepartmentId: dept.id,
        employeeRefId: employee.id,
        isActive: true,
        mustChangePassword: false,
        onboardingCompleted: true
      },
      create: {
        email: operatorEmail,
        name: `${dept.name} Operator`,
        firstName: dept.name.slice(0, 20),
        lastName: 'Operator',
        password: passwordHash,
        role: Role.employee,
        department: dept.name,
        assignedDepartmentId: dept.id,
        employeeRefId: employee.id,
        isActive: true,
        mustChangePassword: false,
        onboardingCompleted: true
      }
    });

    const operatorAssigned = await prisma.userRole.findFirst({
      where: { userId: operatorUser.id, roleId: operatorRole.id }
    });
    if (!operatorAssigned) {
      await prisma.userRole.create({
        data: { userId: operatorUser.id, roleId: operatorRole.id }
      });
    }

    // Also support friendly aliases for common test route departments
    if (dept.code === 'ACCESSORIES-IRONING-MAT') {
      await prisma.user.upsert({
        where: { email: 'dept1.head@plinth.example' },
        update: { password: passwordHash, assignedDepartmentId: dept.id, isActive: true, mustChangePassword: false, onboardingCompleted: true },
        create: {
          email: 'dept1.head@plinth.example', name: 'Dept 1 (Accessories) Head', role: Role.employee,
          password: passwordHash, assignedDepartmentId: dept.id, isActive: true, mustChangePassword: false, onboardingCompleted: true
        }
      }).then(async (u) => {
        const hasRole = await prisma.userRole.findFirst({ where: { userId: u.id, roleId: inchargeRole.id } });
        if (!hasRole) await prisma.userRole.create({ data: { userId: u.id, roleId: inchargeRole.id } });
      });
    }

    if (dept.code === 'DEPT-FARDEEN---TEST-SZ6S') {
      await prisma.user.upsert({
        where: { email: 'dept1.1.head@plinth.example' },
        update: { password: passwordHash, assignedDepartmentId: dept.id, isActive: true, mustChangePassword: false, onboardingCompleted: true },
        create: {
          email: 'dept1.1.head@plinth.example', name: 'Dept 1.1 (Fardeen Test) Head', role: Role.employee,
          password: passwordHash, assignedDepartmentId: dept.id, isActive: true, mustChangePassword: false, onboardingCompleted: true
        }
      }).then(async (u) => {
        const hasRole = await prisma.userRole.findFirst({ where: { userId: u.id, roleId: inchargeRole.id } });
        if (!hasRole) await prisma.userRole.create({ data: { userId: u.id, roleId: inchargeRole.id } });
      });
    }

    if (dept.code === 'JHUMER') {
      await prisma.user.upsert({
        where: { email: 'dept1.2.head@plinth.example' },
        update: { password: passwordHash, assignedDepartmentId: dept.id, isActive: true, mustChangePassword: false, onboardingCompleted: true },
        create: {
          email: 'dept1.2.head@plinth.example', name: 'Dept 1.2 (Jhumer) Head', role: Role.employee,
          password: passwordHash, assignedDepartmentId: dept.id, isActive: true, mustChangePassword: false, onboardingCompleted: true
        }
      }).then(async (u) => {
        const hasRole = await prisma.userRole.findFirst({ where: { userId: u.id, roleId: inchargeRole.id } });
        if (!hasRole) await prisma.userRole.create({ data: { userId: u.id, roleId: inchargeRole.id } });
      });
    }

    if (dept.code === 'DEPT-ASSEMBLY-DEPART-W225') {
      await prisma.user.upsert({
        where: { email: 'assembly.head@plinth.example' },
        update: { password: passwordHash, assignedDepartmentId: dept.id, isActive: true, mustChangePassword: false, onboardingCompleted: true },
        create: {
          email: 'assembly.head@plinth.example', name: 'Assembly Department Head', role: Role.employee,
          password: passwordHash, assignedDepartmentId: dept.id, isActive: true, mustChangePassword: false, onboardingCompleted: true
        }
      }).then(async (u) => {
        const hasRole = await prisma.userRole.findFirst({ where: { userId: u.id, roleId: inchargeRole.id } });
        if (!hasRole) await prisma.userRole.create({ data: { userId: u.id, roleId: inchargeRole.id } });
      });
    }

    seededCredentials.push({
      department: dept.name,
      code: dept.code,
      inChargeEmail: inchargeEmail,
      operatorEmail,
      password: 'password123'
    });
  }

  console.log('\n✅ Successfully seeded department users and credentials:');
  console.table(seededCredentials);
}

main().catch(console.error).finally(async () => prisma.$disconnect());
