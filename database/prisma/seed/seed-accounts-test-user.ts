import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { randomBytes } from 'crypto';

// Opt-in test user provisioner. Credentials are supplied locally via env and
// are never committed or printed by this script.
const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ACCOUNTS_TEST_EMAIL || 'accounts.test@synergy.local').trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && !process.env.ACCOUNTS_TEST_PASSWORD) {
    throw new Error(`Accounts test user ${email} already exists; set ACCOUNTS_TEST_PASSWORD to rotate its password deliberately.`);
  }
  const password = process.env.ACCOUNTS_TEST_PASSWORD || `Syn${randomBytes(18).toString('base64url')}!`;
  if (password.length < 12) throw new Error('ACCOUNTS_TEST_PASSWORD must be at least 12 characters.');
  await prisma.$transaction(async tx => {
    const accountRole = await tx.rbacRole.findUnique({ where: { name: 'accounts_preparer' } });
    if (!accountRole) throw new Error('Install Accounts RBAC first with db:seed-accounts-rbac.');
    const user = existing
      ? await tx.user.update({ where: { id: existing.id }, data: { password: await argon2.hash(password), isActive: true, mustChangePassword: true } })
      : await tx.user.create({ data: { email, name: 'Accounts Test User', role: 'employee', password: await argon2.hash(password), mustChangePassword: true } });
    const assigned = await tx.userRole.findFirst({ where: { userId: user.id, roleId: accountRole.id } });
    if (!assigned) await tx.userRole.create({ data: { userId: user.id, roleId: accountRole.id } });
  });
  console.log(`Accounts test credentials (change after first login):\nEmail: ${email}\nTemporary password: ${password}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
