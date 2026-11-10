require('dotenv').config({ path: require('node:path').resolve(process.cwd(), '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const workerEmails = [
  'worker.buffing@synergy.local',
  'worker.frame@synergy.local',
  'worker.laser.cutting@synergy.local',
  'worker.moulding@synergy.local',
  'worker.printing@synergy.local',
  'worker.rod.cutting@synergy.local',
  'worker.rope.cutting@synergy.local',
  'worker.top.rod.punching@synergy.local',
  'worker.tube.bending@synergy.local',
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
    throw new Error('Refusing to continue: this script only updates the local synergy_erp database.');
  }
}

async function main() {
  assertLocalDemoDatabase();

  const users = await prisma.user.findMany({
    where: { email: { in: workerEmails }, isActive: true },
    select: { id: true, email: true, employeeRefId: true },
  });
  if (users.length !== workerEmails.length || users.some((user) => !user.employeeRefId)) {
    throw new Error(`Expected ${workerEmails.length} active worker accounts linked to employee profiles; found ${users.length}.`);
  }

  const employeeIds = users.map((user) => user.employeeRefId);
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    select: {
      id: true,
      firstName: true,
      documents: {
        where: { title: { startsWith: 'SAMPLE ONLY' } },
        select: { id: true },
      },
      workExperiences: { select: { id: true } },
    },
  });
  const existingDetails = await prisma.onboardingDetails.findMany({
    where: { employeeId: { in: employeeIds } },
    select: { employeeId: true },
  });
  if (
    employees.length !== workerEmails.length ||
    employees.some((employee) => employee.firstName !== 'Demo' || employee.documents.length < 1 || employee.workExperiences.length < 1) ||
    existingDetails.length !== workerEmails.length
  ) {
    throw new Error('A worker is missing a linked demo profile, sample document placeholder, work experience, or onboarding record. No changes were applied.');
  }

  const userIds = users.map((user) => user.id);
  const completedAt = new Date();
  const [employeeResult, userResult, onboardingResult] = await prisma.$transaction([
    prisma.employee.updateMany({
      where: { id: { in: employeeIds } },
      data: { onboardingCompleted: true, onboardingCompletedAt: completedAt },
    }),
    prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { onboardingCompleted: true },
    }),
    prisma.onboardingDetails.updateMany({
      where: { employeeId: { in: employeeIds } },
      data: {
        personalDetailsComplete: true,
        documentsUploadComplete: true,
        experienceComplete: true,
        // Demo access skips the form without recording legal consent or a signature.
        agreementsComplete: false,
        agreedToTerms: false,
        agreedToConductCode: false,
        agreedToNda: false,
        signatureText: null,
        agreedAt: null,
        completedAt,
      },
    }),
  ]);

  if (
    employeeResult.count !== workerEmails.length ||
    userResult.count !== workerEmails.length ||
    onboardingResult.count !== workerEmails.length
  ) {
    throw new Error('The update count did not match all nine demo workers.');
  }

  const oldLaserLogin = await prisma.user.findUnique({
    where: { email: 'rahul@gmail.com' },
    select: { id: true },
  });
  console.log(`Marked ${workerEmails.length} local demo worker profiles onboarding-ready.`);
  console.log('Agreement checkboxes and signatures remain unsigned.');
  console.log(`Old Laser Cutting login rahul@gmail.com present: ${Boolean(oldLaserLogin)}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Demo onboarding seed failed.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
