import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  const content = fs.readFileSync('database/prisma/migrations/20261014150000_accounts_sales_ar/migration.sql', 'utf8');
  
  // Split on semicolon at line end
  const statements = content
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Executing ${statements.length} SQL statements...`);
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (e: any) {
      if (e.message.includes('already exists') || e.message.includes('duplicate column')) {
        // Safe to ignore if table or column already exists
      } else {
        console.error(`Error on statement #${i}:`, stmt.slice(0, 100));
        console.error(e.message);
      }
    }
  }
  console.log('Finished executing sales_ar statements.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
