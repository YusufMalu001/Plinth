const { PrismaClient, LifecycleStatus, MaterialType } = require('@prisma/client');
const XLSX = require('xlsx');
const path = require('path');

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply') && !process.argv.includes('--dry-run');
const downloads = '/home/fardeen/Downloads';
const files = ['MRP PROJECT.xlsm', 'PS - CS3-CS6.xlsm', 'PS - CS11.xlsm', 'PS - CS12.xlsm', 'PS - Laser ECONOMY.xlsm', 'PS - Laser GLIDER (1).xlsm', 'PS - RODS CUTTING.xlsm', 'PS - REGULAR.xlsm', 'PS - Laser GLIDER.xlsm', 'PS - CS10.xlsm', 'PS - CS9.xlsm', 'PS - CS8.xlsm'];

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const code = value => clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function collect() {
  const products = new Map();
  const materials = new Map();
  const departments = new Set();
  for (const filename of files) {
    const workbook = XLSX.readFile(path.join(downloads, filename), { cellFormula: false });
    for (const sheetName of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null });
      const headerRows = rows.slice(0, 12).map(row => row.map(clean));
      const master = headerRows.findIndex(row => row[0] === 'SKU' && row.includes('ITEM NAME'));
      if (master >= 0) {
        for (const row of rows.slice(master + 1)) {
          const sku = code(row[0]); const name = clean(row[2]);
          if (sku && name && sku !== 'SKU') products.set(sku, { sku, name, asin: clean(row[1]) || null, mrp: Number(row[3]) || null, source: filename });
        }
      }
      for (const row of rows) {
        const values = row.map(clean);
        const deptIndex = values.findIndex(v => v === 'DEPARTMENT');
        if (deptIndex >= 0 && values[deptIndex + 1]) departments.add(values[deptIndex + 1]);
        const particulars = values.findIndex(v => v === 'PARTICULARS');
        if (particulars >= 0 && values.includes('QUANTITY')) {
          for (const data of rows.slice(rows.indexOf(row) + 1)) {
            const name = clean(data[particulars]); const specs = clean(data[particulars + 3]);
            if (!name || ['DATE', 'SIGN', 'REMARKS', 'PARTICULARS'].includes(name.toUpperCase())) continue;
            const key = code(name); if (key && key.length > 1) materials.set(key, { code: key, name, specs: specs || name, source: filename });
          }
        }
      }
    }
  }
  return { products: [...products.values()], materials: [...materials.values()], departments: [...departments] };
}

async function main() {
  const data = collect();
  console.log(`${apply ? 'APPLY' : 'DRY-RUN'}: ${data.products.length} products, ${data.materials.length} materials, ${data.departments.length} departments`);
  if (!apply) return;
  const factory = await prisma.factory.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!factory) throw new Error('No factory exists; create the organization before importing client data.');
  const uom = await prisma.unitOfMeasure.upsert({ where: { code: 'PCS' }, update: { status: LifecycleStatus.ACTIVE }, create: { code: 'PCS', name: 'Pieces', symbol: 'pcs', dimension: 'COUNT', status: LifecycleStatus.ACTIVE } });
  const category = await prisma.category.upsert({ where: { code: 'FINISHED-GOODS' }, update: { status: LifecycleStatus.ACTIVE }, create: { code: 'FINISHED-GOODS', name: 'Finished Goods', status: LifecycleStatus.ACTIVE } });
  const family = await prisma.productFamily.upsert({ where: { code: 'PLINTH-CATALOG' }, update: { status: LifecycleStatus.ACTIVE }, create: { code: 'PLINTH-CATALOG', name: 'Plinth Product Catalogue', categoryId: category.id, status: LifecycleStatus.ACTIVE } });
  for (const item of data.departments) await prisma.department.upsert({ where: { code: code(item) }, update: { name: item, status: LifecycleStatus.ACTIVE }, create: { code: code(item), name: item, factoryId: factory.id, status: LifecycleStatus.ACTIVE } });
  for (const item of data.materials) await prisma.material.upsert({ where: { code: item.code }, update: { name: item.name, specs: { source: item.source, description: item.specs }, uomId: uom.id, status: LifecycleStatus.ACTIVE }, create: { code: item.code, name: item.name, materialType: MaterialType.RAW_MATERIAL, specs: { source: item.source, description: item.specs }, uomId: uom.id, status: LifecycleStatus.ACTIVE } });
  for (const item of data.products) await prisma.product.upsert({ where: { sku: item.sku }, update: { name: item.name, description: item.name, categoryId: category.id, productFamilyId: family.id, uomId: uom.id, status: LifecycleStatus.ACTIVE, metadata: { asin: item.asin, mrp: item.mrp, source: item.source } }, create: { sku: item.sku, name: item.name, description: item.name, categoryId: category.id, productFamilyId: family.id, uomId: uom.id, status: LifecycleStatus.ACTIVE, metadata: { asin: item.asin, mrp: item.mrp, source: item.source } } });
  console.log('Client workbook master data imported. Vendors were not created because no vendor master was present in the supplied workbooks.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
