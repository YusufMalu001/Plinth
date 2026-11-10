import { PrismaClient } from '@prisma/client';

// Safe, idempotent Accounts-only RBAC installation. It does not seed fixtures,
// assign users, or remove existing grants.
const prisma = new PrismaClient();
const grants: Record<string, string[]> = {
  accounts_preparer: ['read:Accounts', 'read:DebitNote', 'create:DebitNote', 'create:JournalVoucher', 'submit:JournalVoucher', 'create:PurchaseBill', 'update:PurchaseBill', 'submit:PurchaseBill', 'submit:SalesARInvoice', 'update:SalesARInvoice', 'create:SalesARReceipt', 'update:SalesARReceipt', 'create:SalesARMarketplaceBatch'],
  accounts_reviewer: ['read:Accounts', 'read:DebitNote', 'create:DebitNote', 'approve:JournalVoucher', 'resolve:PurchaseBill', 'approve:PurchaseBill', 'approve:SalesARInvoice', 'approve:SalesARReceipt', 'approve:SalesARMarketplaceBatch'],
  finance_manager: ['read:Accounts', 'read:DebitNote', 'create:DebitNote', 'manage:AccountConfiguration', 'approve:AccountConfiguration', 'close:AccountingPeriod', 'post:JournalVoucher', 'reverse:JournalVoucher', 'approve:PurchaseBill', 'post:SalesARInvoice', 'post:SalesARReceipt', 'post:SalesARMarketplaceBatch'],
  accounts_auditor: ['read:Accounts', 'read:DebitNote'],
};
const keys = [...new Set([...Object.values(grants).flat(), 'resolve:PurchaseBill', 'create:PurchaseBill', 'update:PurchaseBill', 'submit:PurchaseBill', 'approve:PurchaseBill'])];

async function main() {
  await prisma.$transaction(async tx => {
    const permissionIds = new Map<string, string>();
    for (const key of keys) {
      const [action, resource] = key.split(':');
      const permission = await tx.permission.upsert({
        where: { action_resource: { action, resource } },
        create: { action, resource, key },
        update: { key },
      });
      permissionIds.set(key, permission.id);
    }
    for (const [name, roleKeys] of Object.entries(grants)) {
      const role = await tx.rbacRole.upsert({
        where: { name },
        create: { name, description: `Accounts: ${name.replace(/_/g, ' ')}` },
        update: {},
      });
      for (const key of roleKeys) {
        const permissionId = permissionIds.get(key)!;
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId } },
          create: { roleId: role.id, permissionId },
          update: {},
        });
      }
    }
    const admin = await tx.rbacRole.findUnique({ where: { name: 'admin' } });
    if (admin) {
      for (const permissionId of permissionIds.values()) {
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: admin.id, permissionId } },
          create: { roleId: admin.id, permissionId },
          update: {},
        });
      }
    }
  });
  console.log(`Installed ${keys.length} Accounts permissions and ${Object.keys(grants).length} roles.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
