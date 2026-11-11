import 'dotenv/config';
import { BatchExecutionStatus, LifecycleStatus, PrismaClient, Role } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'ShopFloor#26';
const DEMO_PLAN_NUMBER = 'DEMO-SHOPFLOOR-20261102';
const DEMO_ROUTE_CODE = 'DEMO-SHOPFLOOR-ROUTE-20261102';

const DEPARTMENT_CODES = [
  'SHOP-ROPE-CUTTING-MVZ89B2Y',
  'SHOP-PRINTING-MVZ88M9W',
  'SHOP-BUFFING-MVZ88C49',
  'SHOP-TOP-ROD-PUNCHING-MVZ883UE',
  'SHOP-ROD-CUTTING-MVZ87QOQ',
  'SHOP-TUBE-BENDING-MVZ87F7U',
  'SHOP-FRAME-MVZ86XVX',
  'SHOP-LASER-CUTTING-MVZ867CN',
  'MOULDING',
] as const;

const DEPARTMENT_PERMISSIONS = [
  ['view', 'DepartmentExecution'],
  ['receive', 'DepartmentExecution'],
  ['assign', 'DepartmentExecution'],
  ['start', 'DepartmentExecution'],
  ['update', 'DepartmentExecution'],
  ['complete', 'DepartmentExecution'],
  ['reject', 'DepartmentExecution'],
  ['handover_propose', 'DepartmentExecution'],
  ['handover_accept', 'DepartmentExecution'],
  ['view', 'WipTracking'],
  ['trace', 'WipTracking'],
  ['reconcile', 'WipTracking'],
  ['manage_exception', 'WipTracking'],
] as const;

function assertLocalDevelopmentDatabase(): void {
  const configuredUrl = process.env.DATABASE_URL;
  if (!configuredUrl) throw new Error('DATABASE_URL is required.');

  const databaseUrl = new URL(configuredUrl);
  const databaseName = databaseUrl.pathname.replace(/^\//, '').split('?')[0];
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname);
  if (
    process.env.NODE_ENV === 'production' ||
    !isLocalHost ||
    databaseName !== 'plinth_erp'
  ) {
    throw new Error('Refusing to seed: this script only runs against the local plinth_erp development database.');
  }
}

function emailSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
}

function legacyEmailSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function ensureDepartmentRole() {
  const role = await prisma.rbacRole.upsert({
    where: { name: 'department_incharge' },
    update: {},
    create: {
      name: 'department_incharge',
      description: 'Department-scoped shop-floor demo access',
      isSystem: true,
    },
  });

  for (const [action, resource] of DEPARTMENT_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { action_resource: { action, resource } },
      update: {},
      create: {
        action,
        resource,
        key: `${action}:${resource}`.toLowerCase(),
        description: `${action} ${resource}`,
      },
    });
    await prisma.rolePermission.createMany({
      data: [{ roleId: role.id, permissionId: permission.id }],
      skipDuplicates: true,
    });
  }

  return role;
}

async function main() {
  assertLocalDevelopmentDatabase();

  const departments = await prisma.department.findMany({
    where: { code: { in: [...DEPARTMENT_CODES] }, status: LifecycleStatus.ACTIVE },
    orderBy: { name: 'asc' },
  });
  const foundCodes = new Set(departments.map(department => department.code));
  const missingCodes = DEPARTMENT_CODES.filter(code => !foundCodes.has(code));
  if (missingCodes.length) {
    throw new Error(`These expected active departments were not found: ${missingCodes.join(', ')}`);
  }

  const admin = await prisma.user.findFirst({
    where: { role: Role.admin, isActive: true },
    select: { id: true },
  });
  if (!admin) throw new Error('An active admin account is required to create demo production records.');

  const productBom = await prisma.bomVersion.findFirst({
    where: {
      productId: { not: null },
      status: 'APPROVED',
      detachedFromItemAt: null,
    },
    include: { product: true },
    orderBy: [{ updatedAt: 'desc' }, { version: 'desc' }],
  });
  if (!productBom?.product) {
    throw new Error('No approved product BOM is available. Approve a product BOM before creating the demo production plan.');
  }

  const departmentRole = await ensureDepartmentRole();
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const credentials: Array<{ department: string; email: string; password: string }> = [];

  for (const department of departments) {
    const email = `${emailSlug(department.name.replace(/ department$/i, ''))}@plinth.local`;
    const legacyEmail = `demo.${legacyEmailSlug(department.code)}@plinth.local`;
    const legacyUser = await prisma.user.findUnique({ where: { email: legacyEmail }, select: { id: true } });
    const existingSimpleUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, assignedDepartmentId: true },
    });
    if (legacyUser && existingSimpleUser && legacyUser.id !== existingSimpleUser.id) {
      throw new Error(`Cannot simplify ${department.name}: ${email} is already used by another account.`);
    }
    if (
      existingSimpleUser &&
      !legacyUser &&
      (existingSimpleUser.name !== `${department.name} Demo In-Charge` ||
        existingSimpleUser.assignedDepartmentId !== department.id)
    ) {
      throw new Error(`Cannot create the ${department.name} demo login: ${email} already belongs to another account.`);
    }
    if (legacyUser && legacyEmail !== email) {
      await prisma.user.update({ where: { id: legacyUser.id }, data: { email } });
    }
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name: `${department.name} Demo In-Charge`,
        password: passwordHash,
        role: Role.employee,
        department: department.name,
        assignedDepartmentId: department.id,
        isActive: true,
        mustChangePassword: false,
        onboardingCompleted: true,
      },
      create: {
        email,
        name: `${department.name} Demo In-Charge`,
        firstName: department.name.slice(0, 40),
        lastName: 'Demo In-Charge',
        password: passwordHash,
        role: Role.employee,
        department: department.name,
        assignedDepartmentId: department.id,
        isActive: true,
        mustChangePassword: false,
        onboardingCompleted: true,
      },
    });

    await prisma.userRole.createMany({
      data: [{ userId: user.id, roleId: departmentRole.id }],
      skipDuplicates: true,
    });
    credentials.push({ department: department.name, email, password: DEMO_PASSWORD });
  }

  const now = new Date();
  const route = await prisma.productRoute.upsert({
    where: { code: DEMO_ROUTE_CODE },
    update: {
      name: 'Demo Shop-Floor Progress Route',
      productId: productBom.productId,
      bomVersionId: productBom.id,
      status: LifecycleStatus.ACTIVE,
      effectiveFrom: now,
    },
    create: {
      code: DEMO_ROUTE_CODE,
      name: 'Demo Shop-Floor Progress Route',
      productId: productBom.productId,
      bomVersionId: productBom.id,
      version: 1,
      effectiveFrom: now,
      status: LifecycleStatus.ACTIVE,
    },
  });

  const routeSteps = [];
  for (const [index, department] of departments.entries()) {
    const step = await prisma.routeStep.upsert({
      where: {
        routeId_branchKey_stepOrder: {
          routeId: route.id,
          branchKey: 'MAIN',
          stepOrder: index + 1,
        },
      },
      update: {
        sequenceNumber: index + 1,
        stepName: department.name,
        departmentId: department.id,
        status: LifecycleStatus.ACTIVE,
      },
      create: {
        routeId: route.id,
        sequenceNumber: index + 1,
        branchKey: 'MAIN',
        stepOrder: index + 1,
        stepName: department.name,
        departmentId: department.id,
        status: LifecycleStatus.ACTIVE,
      },
    });
    routeSteps.push({ step, department });
  }

  const plan = await prisma.productionPlan.upsert({
    where: { planNumber: DEMO_PLAN_NUMBER },
    update: {
      scheduleDate: now,
      productId: productBom.productId!,
      bomVersionId: productBom.id,
      routeId: route.id,
      scheduleType: 'SHOP_FLOOR_DEMO',
      quantity: 100,
      quantityUomId: productBom.product.uomId,
      notes: 'DEMO DATA: local shop-floor progress walkthrough. Safe to ignore in real planning.',
      status: 'RELEASED',
      releasedAt: now,
      releasedByActorId: admin.id,
    },
    create: {
      planNumber: DEMO_PLAN_NUMBER,
      scheduleDate: now,
      productId: productBom.productId!,
      bomVersionId: productBom.id,
      routeId: route.id,
      scheduleType: 'SHOP_FLOOR_DEMO',
      quantity: 100,
      quantityUomId: productBom.product.uomId,
      notes: 'DEMO DATA: local shop-floor progress walkthrough. Safe to ignore in real planning.',
      status: 'RELEASED',
      releasedAt: now,
      releasedByActorId: admin.id,
      createdByActorId: admin.id,
    },
  });

  const demoBatchStates = [
    { status: BatchExecutionStatus.COMPLETE, received: 100, completed: 100, pending: 0 },
    { status: BatchExecutionStatus.IN_PROGRESS, received: 100, completed: 60, pending: 40 },
    { status: BatchExecutionStatus.PAUSED, received: 100, completed: 40, rejected: 5, pending: 55 },
  ] as const;

  for (const [index, { step, department }] of routeSteps.entries()) {
    const sample = demoBatchStates[index] ?? {
      status: BatchExecutionStatus.AWAITING_RECEIPT,
      received: 0,
      completed: 0,
      pending: 0,
    };
    await prisma.departmentExecutionBatch.upsert({
      where: { batchNumber: `DEMO-SF-${String(index + 1).padStart(2, '0')}` },
      update: {
        productionPlanId: plan.id,
        departmentId: department.id,
        routeStepId: step.id,
        stageSequenceNumber: index + 1,
        status: sample.status,
        received_qty: sample.received,
        completed_qty: sample.completed,
        rejected_qty: 'rejected' in sample ? sample.rejected : 0,
        scrap_qty: 0,
        wastage_qty: 0,
        pending_qty: sample.pending,
        notes: `DEMO DATA: ${department.name} progress stage.`,
        createdByActorId: admin.id,
      },
      create: {
        batchNumber: `DEMO-SF-${String(index + 1).padStart(2, '0')}`,
        productionPlanId: plan.id,
        departmentId: department.id,
        routeStepId: step.id,
        stageSequenceNumber: index + 1,
        status: sample.status,
        received_qty: sample.received,
        completed_qty: sample.completed,
        rejected_qty: 'rejected' in sample ? sample.rejected : 0,
        scrap_qty: 0,
        wastage_qty: 0,
        pending_qty: sample.pending,
        notes: `DEMO DATA: ${department.name} progress stage.`,
        createdByActorId: admin.id,
      },
    });
  }

  console.log('\nLocal shop-floor demo logins (shared password):');
  console.table(credentials);
  console.log(`Demo production plan: ${DEMO_PLAN_NUMBER} — ${productBom.product.name}`);
  console.log('Created 9 demo stages: 1 complete, 1 in progress, 1 paused, 6 awaiting receipt.');
}

main()
  .catch(error => {
    console.error('Shop-floor demo seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
