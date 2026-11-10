import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const PROFILES_TO_SEED = [
  {
    email: 'admin@synergy.com',
    aliases: ['admin@gmail.com'],
    firstName: 'System',
    lastName: 'Admin',
    role: Role.admin,
    rbacRole: 'admin',
    title: 'System Administrator',
    deptCode: null
  },
  {
    email: 'storemanager@synergy.com',
    aliases: ['manager@synergy.com'],
    firstName: 'Sufiyan',
    lastName: 'Mirza',
    role: Role.manager,
    rbacRole: 'store-manager',
    title: 'Store Operations Manager',
    deptCode: null
  },
  {
    email: 'sales@synergy.com',
    aliases: ['sales.executive@synergy.com', 'salesmanager@synergy.com'],
    firstName: 'Rajesh',
    lastName: 'Sharma',
    role: Role.employee,
    rbacRole: 'sales_executive',
    title: 'Sales & Commercial Executive',
    deptCode: null
  }
];

export async function seedUserProfiles() {
  console.log('🌱 Seeding user profiles and easy login credentials...');

  // 1. Get or create a default factory
  let factory = await prisma.factory.findFirst();
  if (!factory) {
    factory = await prisma.factory.create({
      data: {
        code: 'FAC-01',
        name: 'Main Synergy Production Plant'
      }
    });
  }

  // Department users and shop-floor departments are created by administrators.
  // Seed only general system profiles here; never restore sample department
  // accounts with shared credentials.

  // 2. Hash common password
  const defaultPasswordHash = await argon2.hash('password123');

  // 3. Create / Upsert non-department system users
  for (const profile of PROFILES_TO_SEED) {
    const emailsToSeed = [profile.email, ...profile.aliases];
    const assignedDeptId = null;

    for (const email of emailsToSeed) {
      const user = await prisma.user.upsert({
        where: { email },
        update: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          name: `${profile.firstName} ${profile.lastName}`,
          password: defaultPasswordHash,
          role: profile.role,
          title: profile.title,
          department: 'Operations',
          assignedDepartmentId: assignedDeptId,
          isActive: true
        },
        create: {
          email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          name: `${profile.firstName} ${profile.lastName}`,
          password: defaultPasswordHash,
          role: profile.role,
          title: profile.title,
          department: 'Operations',
          assignedDepartmentId: assignedDeptId,
          isActive: true
        }
      });

      // Ensure RBAC Role is assigned
      const roleRecord = await prisma.rbacRole.findUnique({
        where: { name: profile.rbacRole }
      });

      if (roleRecord) {
        await prisma.userRole.deleteMany({
          where: { userId: user.id }
        });
        await prisma.userRole.create({
          data: {
            userId: user.id,
            roleId: roleRecord.id
          }
        });
      }

      console.log(`  ✓ Seeded user: ${email} (${profile.title}) -> Password: password123`);
    }
  }

  console.log('✅ System user profiles successfully seeded.');
}

if (require.main === module) {
  seedUserProfiles()
    .catch((err) => {
      console.error('Failed to seed user profiles:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
