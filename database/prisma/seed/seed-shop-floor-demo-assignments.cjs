require('dotenv').config({ path: require('node:path').resolve(process.cwd(), '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const workers = [
  ['buffing', 'DEMO-SF-01'],
  ['frame', 'DEMO-SF-02'],
  ['laser.cutting', 'DEMO-SF-03'],
  ['moulding', 'DEMO-SF-04'],
  ['printing', 'DEMO-SF-05'],
  ['rod.cutting', 'DEMO-SF-06'],
  ['rope.cutting', 'DEMO-SF-07'],
  ['top.rod.punching', 'DEMO-SF-08'],
  ['tube.bending', 'DEMO-SF-09'],
];

function assertLocalDemoDatabase() {
  const configuredUrl = process.env.DATABASE_URL;
  if (!configuredUrl) throw new Error('DATABASE_URL is required.');
  const databaseUrl = new URL(configuredUrl);
  const databaseName = databaseUrl.pathname.replace(/^\//, '').split('?')[0];
  if (
    process.env.NODE_ENV === 'production' ||
    !['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname) ||
    databaseName !== 'synergy_erp'
  ) {
    throw new Error('Refusing to continue: this script only seeds the local synergy_erp database.');
  }
}

async function main() {
  assertLocalDemoDatabase();
  const emails = workers.map(([slug]) => `worker.${slug}@synergy.local`);
  const users = await prisma.user.findMany({
    where: { email: { in: emails }, isActive: true },
    select: {
      id: true,
      email: true,
      employeeRefId: true,
      assignedDepartmentId: true,
      userRoles: { select: { role: { select: { name: true } } } },
    },
  });
  if (
    users.length !== workers.length ||
    users.some((user) =>
      !user.employeeRefId ||
      !user.assignedDepartmentId ||
      !user.userRoles.some(({ role }) => role.name === 'shop_floor_operator')
    )
  ) {
    throw new Error('Expected nine active shop-floor accounts linked to employee profiles and departments.');
  }

  const admin = await prisma.user.findFirst({
    where: { role: 'admin', isActive: true },
    select: { id: true },
  });
  if (!admin) throw new Error('An active local admin account is required for the demo assignment audit trail.');

  const plannedAssignments = [];
  for (const [slug, batchNumber] of workers) {
    const user = users.find((candidate) => candidate.email === `worker.${slug}@synergy.local`);
    const batch = await prisma.departmentExecutionBatch.findFirst({
      where: {
        batchNumber,
        departmentId: user.assignedDepartmentId,
        notes: { startsWith: 'DEMO DATA:' },
      },
      select: { id: true, batchNumber: true, departmentId: true },
    });
    if (!batch) throw new Error(`Expected demo batch ${batchNumber} for worker ${user.email}; no changes were applied.`);
    plannedAssignments.push({ user, batch });
  }

  let created = 0;
  let alreadyAssigned = 0;
  await prisma.$transaction(async (tx) => {
    for (const { user, batch } of plannedAssignments) {
      const existing = await tx.workerAssignment.findFirst({
        where: { batchId: batch.id, employeeId: user.employeeRefId },
        select: { id: true },
      });
      if (existing) {
        alreadyAssigned += 1;
        continue;
      }
      await tx.workerAssignment.create({
        data: {
          batchId: batch.id,
          employeeId: user.employeeRefId,
          subtaskDescription: `DEMO DATA: Assigned shop-floor work for ${batch.batchNumber}.`,
          assignedByActorId: admin.id,
        },
      });
      created += 1;
    }
  });

  console.log(`Demo production assignments ready for ${plannedAssignments.length} workers (${created} created, ${alreadyAssigned} already present).`);
  console.log('Batch states were left unchanged. Each operator can see only their own assigned batch.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Demo assignment seed failed.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

