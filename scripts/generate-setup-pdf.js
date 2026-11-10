const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const outputPath = 'C:\\Users\\MICRO\\Desktop\\Synergy_ERP_Local_Setup_Guide.pdf';

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 45, bottom: 45, left: 45, right: 45 },
  bufferPages: true,
  autoFirstPage: true,
});

const writeStream = fs.createWriteStream(outputPath);
doc.pipe(writeStream);

const primaryColor = '#0f172a'; // slate-900
const accentColor = '#2563eb';  // blue-600
const textColor = '#334155';    // slate-700
const mutedColor = '#64748b';   // slate-500
const codeBgColor = '#f8fafc';  // slate-50
const codeBorder = '#e2e8f0';   // slate-200
const calloutBg = '#eff6ff';    // blue-50
const calloutBorder = '#3b82f6'; // blue-500

function checkPageSpace(requiredHeight = 60) {
  if (doc.y + requiredHeight > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function addTitle(title, subtitle) {
  doc.rect(45, 45, doc.page.width - 90, 80).fill('#0f172a');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text(title, 60, 60, { width: doc.page.width - 120 });
  doc.fillColor('#94a3b8').font('Helvetica').fontSize(10).text(subtitle, 60, 92, { width: doc.page.width - 120 });
  doc.y = 140;
}

function addSectionHeader(num, title) {
  checkPageSpace(50);
  doc.moveDown(0.8);
  const y = doc.y;
  doc.rect(45, y, 4, 18).fill(accentColor);
  doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(13).text(`${num}. ${title}`, 56, y + 2);
  doc.moveDown(0.5);
}

function addSubHeader(title) {
  checkPageSpace(35);
  doc.moveDown(0.4);
  doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(10.5).text(title);
  doc.moveDown(0.2);
}

function addParagraph(text) {
  checkPageSpace(25);
  doc.fillColor(textColor).font('Helvetica').fontSize(9.5).lineGap(2).text(text);
  doc.moveDown(0.3);
}

function addBullet(bulletTitle, bulletDesc) {
  checkPageSpace(20);
  const x = 55;
  doc.circle(x - 3, doc.y + 5, 2).fill(accentColor);
  if (bulletTitle) {
    doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(9).text(bulletTitle + ': ', x + 4, doc.y, { continued: true });
    doc.fillColor(textColor).font('Helvetica').text(bulletDesc);
  } else {
    doc.fillColor(textColor).font('Helvetica').fontSize(9).text(bulletDesc, x + 4, doc.y);
  }
  doc.moveDown(0.2);
}

function addCodeBlock(codeText) {
  const lines = codeText.trim().split('\n');
  const lineHeight = 12;
  const padding = 8;
  const blockHeight = lines.length * lineHeight + padding * 2;

  checkPageSpace(Math.min(blockHeight + 10, 150));

  const y = doc.y;
  const width = doc.page.width - 90;

  doc.rect(45, y, width, blockHeight).fillAndStroke(codeBgColor, codeBorder);
  doc.fillColor('#0f172a').font('Courier').fontSize(8.5);

  let currentY = y + padding;
  for (const line of lines) {
    doc.text(line, 55, currentY, { width: width - 20 });
    currentY += lineHeight;
  }
  doc.y = y + blockHeight + 6;
}

function addCallout(type, text) {
  checkPageSpace(45);
  const y = doc.y;
  const width = doc.page.width - 90;

  // Calculate text height
  doc.font('Helvetica').fontSize(8.5);
  const textHeight = doc.heightOfString(text, { width: width - 25 });
  const blockHeight = textHeight + 16;

  doc.rect(45, y, width, blockHeight).fill(calloutBg);
  doc.rect(45, y, 3.5, blockHeight).fill(calloutBorder);

  doc.fillColor(calloutBorder).font('Helvetica-Bold').fontSize(8.5).text(`[${type}] `, 56, y + 8, { continued: true });
  doc.fillColor(textColor).font('Helvetica').text(text, { width: width - 30 });

  doc.y = y + blockHeight + 6;
}

function addTable(headers, rows) {
  checkPageSpace(rows.length * 20 + 30);
  const startX = 45;
  let currentY = doc.y;
  const totalWidth = doc.page.width - 90;
  const colWidth = totalWidth / headers.length;

  // Header
  doc.rect(startX, currentY, totalWidth, 18).fill('#1e293b');
  headers.forEach((h, i) => {
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5)
      .text(h, startX + i * colWidth + 6, currentY + 4, { width: colWidth - 12 });
  });
  currentY += 18;

  // Rows
  rows.forEach((row, rIdx) => {
    checkPageSpace(20);
    const bg = rIdx % 2 === 0 ? '#f8fafc' : '#ffffff';
    doc.rect(startX, currentY, totalWidth, 18).fillAndStroke(bg, '#e2e8f0');
    row.forEach((cell, cIdx) => {
      const isBold = cIdx === 0;
      doc.fillColor(isBold ? primaryColor : textColor)
        .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8.5)
        .text(cell, startX + cIdx * colWidth + 6, currentY + 4, { width: colWidth - 12 });
    });
    currentY += 18;
  });
  doc.y = currentY + 8;
}

// -------------------------------------------------------------
// BUILD DOCUMENT CONTENT
// -------------------------------------------------------------

addTitle(
  'Synergy ERP — Local Setup Guide (Windows Native)',
  'Complete step-by-step procedure from fresh git clone to running application on local PostgreSQL'
);

addSectionHeader('1', 'Prerequisites Check');
addParagraph('Verify that the required runtimes and tools are installed and present in your system PATH:');
addBullet('Node.js', 'v22.x or v24.x (verify with: node -v)');
addBullet('npm', 'v9.x or v11.x (verify with: npm -v)');
addBullet('Git', 'Git for Windows (verify with: git -v)');
addBullet('PostgreSQL 18', 'Running as a Windows Service (postgresql-x64-18) on Port 5000 with user postgres.');

addSectionHeader('2', 'Clone Repository & Setup Branch');
addParagraph('Open PowerShell, clone the project, and switch to your designated development branch:');
addCodeBlock(`git clone https://github.com/Aelyx-Work/synergy-erp.git
cd synergy-erp
git switch assign/akash`);
addParagraph('Prevent Git from pausing or waiting for an editor tab during future git pull operations:');
addCodeBlock('git config core.mergeoptions "--no-edit"');

addSectionHeader('3', 'Install Dependencies');
addParagraph('Install monorepo dependencies across all workspaces (apps/web, services/api, packages, database):');
addCodeBlock('npm install');

addSectionHeader('4', 'Create Local Database in PostgreSQL');
addParagraph('Using psql.exe on port 5000, create the synergy_erp database:');
addCodeBlock('& "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe" -U postgres -p 5000 -c "CREATE DATABASE synergy_erp;"');
addCallout('NOTE', 'Enter your PostgreSQL master password when prompted (e.g. Akash.2003).');

addSectionHeader('5', 'Environment Configuration (.env)');
addParagraph('Create .env in the root project folder (c:\\synergy-erp\\.env). Key local values:');
addCodeBlock(`NODE_ENV=development
PORT=5001
API_PORT=5001
WEB_PORT=3000

POSTGRES_USER=postgres
POSTGRES_PASSWORD=Akash.2003
POSTGRES_DB=synergy_erp
POSTGRES_PORT=5000

DATABASE_URL="postgresql://postgres:Akash.2003@localhost:5000/synergy_erp?schema=public&connection_limit=20"
DIRECT_URL="postgresql://postgres:Akash.2003@localhost:5000/synergy_erp?schema=public"

NEXT_PUBLIC_API_URL=http://localhost:5001/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000`);
addCallout('PORT ISOLATION', 'Because your local PostgreSQL service uses port 5000, the API is configured on port 5001 to prevent address collisions.');

addSubHeader('Frontend .env.local');
addParagraph('Create apps/web/.env.local so Next.js targets port 5001 directly:');
addCodeBlock(`NEXT_PUBLIC_API_URL=http://localhost:5001/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000`);

addSectionHeader('6', 'Build Packages & Generate Prisma Client');
addParagraph('Compile shared TypeScript packages and generate the Prisma ORM client:');
addCodeBlock(`npm run build --workspace=@synergy/types
npm run build --workspace=@synergy/ui
npm run build --workspace=@synergy/validation
npm run db:generate`);

addSectionHeader('7', 'Apply Migrations & Synchronize Tables');
addParagraph('Apply all 73 schema migrations and push any remaining unmigrated models (assembly batches, finished goods receipts):');
addCodeBlock(`npm run db:deploy
npx dotenv-cli -e .env -- npx prisma db push --schema=database/prisma/schema.prisma --accept-data-loss`);
addParagraph('Verify that migration state is fully synchronized:');
addCodeBlock('npx dotenv-cli -e .env -- npx prisma migrate status --schema=database/prisma/schema.prisma');
addCallout('SUCCESS', 'The output should confirm: "Database schema is up to date!".');

addSectionHeader('8', 'Seed Master Data & Accounts');
addParagraph('Populate the database with all 11 modules (21,135 HSN codes, materials, products, opening inventory, routes, BOMs):');
addCodeBlock(`npm run db:seed-all --workspace=@synergy/database
npm run db:seed-accounts-rbac --workspace=@synergy/database
npm run db:seed-accounts-test-user --workspace=@synergy/database`);

addSectionHeader('9', 'Launch Development Servers');
addCallout('WINDOWS CAUTION', 'Do NOT run "npm run dev" directly because it calls bash scripts/dev-local.sh (requires Docker/WSL). Always run "npm run dev:turbo".');
addCodeBlock('npm run dev:turbo');
addParagraph('Turborepo will build and start both the backend and frontend in parallel:');
addBullet('Web Application', 'http://localhost:3000');
addBullet('Backend API', 'http://localhost:5001 (Health check: http://localhost:5001/api/v1/health)');

addSectionHeader('10', 'Login Credentials');
addParagraph('Navigate to http://localhost:3000 in your browser and log in with any seeded account:');
addTable(
  ['Role', 'Email', 'Password'],
  [
    ['Super Admin', 'admin@gmail.com', 'password123'],
    ['Super Admin (Alt)', 'admin@synergy.com', 'password123'],
    ['Store Manager', 'manager@synergy.com', 'password123'],
    ['Sales Executive', 'sales@synergy.com', 'password123'],
    ['Laser Cutting Head', 'laser.head@synergy.com', 'password123'],
    ['Production Head', 'production.head@synergy.com', 'password123'],
    ['Accounts / Finance', 'accounts.test@synergy.local', 'SynwTzRNbS_oXi0gPmNf1O03FoU!']
  ]
);

addSectionHeader('11', 'Troubleshooting Windows Gotchas');
addBullet('Port Collision', 'If port 3000 or 5001 is held by an old terminal, run: Get-NetTCPConnection -LocalPort 3000, 5001 | Stop-Process -Id {$_.OwningProcess} -Force');
addBullet('NODE_ENV Error', 'services/api/package.json must use: "dev": "ts-node-dev --respawn --transpile-only src/server.ts" (without inline NODE_ENV=development which fails in cmd.exe).');
addBullet('Git Pull Stuck', 'Run: git config core.mergeoptions "--no-edit" to prevent Git from waiting on editor tabs during pull.');
addBullet('401 on /events/stream', 'Completely normal before logging in; visiting /login and authenticating with password123 resolves it.');

// -------------------------------------------------------------
// FOOTER & PAGE NUMBERS
// -------------------------------------------------------------
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  doc.fillColor(mutedColor).font('Helvetica').fontSize(8);
  doc.text(
    `Synergy ERP Windows Local Setup Guide • Page ${i + 1} of ${range.count}`,
    45,
    doc.page.height - 30,
    { align: 'center', width: doc.page.width - 90 }
  );
}

doc.end();

writeStream.on('finish', () => {
  const rootPath = path.resolve(__dirname, '../Synergy_ERP_Local_Setup_Guide.pdf');
  const docsPath = path.resolve(__dirname, '../docs/Synergy_ERP_Local_Setup_Guide.pdf');
  const scriptsPath = path.resolve(__dirname, './Synergy_ERP_Local_Setup_Guide.pdf');
  
  try { fs.copyFileSync(outputPath, rootPath); } catch (e) {}
  try { fs.copyFileSync(outputPath, docsPath); } catch (e) {}
  try { fs.copyFileSync(outputPath, scriptsPath); } catch (e) {}

  console.log('PDF generated successfully at:');
  console.log(' - Desktop:', outputPath);
  console.log(' - Project Root:', rootPath);
  console.log(' - Docs:', docsPath);
});
