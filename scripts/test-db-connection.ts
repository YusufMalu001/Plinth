import { prisma } from '../services/api/src/database';

async function main() {
  const userCount = await prisma.user.count();
  const caseCount = await (prisma as any).intelligenceCase.count();
  console.log({ userCount, caseCount });
}
main().catch(console.error).finally(() => prisma.$disconnect());
