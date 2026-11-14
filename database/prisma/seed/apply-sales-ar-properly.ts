import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  const content = fs.readFileSync('database/prisma/migrations/20261014150000_accounts_sales_ar/migration.sql', 'utf8');

  // Parse SQL respecting $$ blocks
  const statements: string[] = [];
  let current = '';
  let inDollarQuote = false;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--')) continue; // Skip comments
    
    // Check for $$
    const dollarCount = (line.match(/\$\$/g) || []).length;
    if (dollarCount % 2 === 1) {
      inDollarQuote = !inDollarQuote;
    }

    current += line + '\n';

    if (!inDollarQuote && trimmed.endsWith(';')) {
      statements.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) statements.push(current.trim());

  console.log(`Parsed ${statements.length} complete SQL statements.`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await prisma.$executeRawUnsafe(stmt);
      console.log(`[${i + 1}/${statements.length}] OK: ${stmt.slice(0, 50).replace(/\n/g, ' ')}...`);
    } catch (e: any) {
      if (e.message.includes('already exists') || e.message.includes('duplicate column')) {
        console.log(`[${i + 1}/${statements.length}] Skipped (already exists)`);
      } else {
        console.error(`[${i + 1}/${statements.length}] FAILED: ${stmt.slice(0, 80).replace(/\n/g, ' ')}`);
        console.error(e.message);
      }
    }
  }

  // Verify created tables
  const tables: any = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE 'sales_ar%'
    ORDER BY table_name;
  `;
  console.log('Confirmed sales_ar tables now present:');
  console.log(tables.map((t: any) => t.table_name));
}

main().catch(console.error).finally(() => prisma.$disconnect());
