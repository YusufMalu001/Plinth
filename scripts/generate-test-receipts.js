const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function createReceiptPdf({
  filename,
  invoiceNumber,
  invoiceDate,
  poNumber,
  challanNumber,
  vendorName,
  vendorGstin,
  vendorAddress,
  consigneeName,
  consigneeGstin,
  consigneeAddress,
  items,
  notes,
  isDiscrepancy = false
}) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 in points
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const { width, height } = page.getSize();
  const margin = 40;

  // Header Border & Box
  page.drawRectangle({
    x: margin,
    y: margin,
    width: width - margin * 2,
    height: height - margin * 2,
    borderWidth: 1,
    borderColor: rgb(0.2, 0.2, 0.2),
    color: rgb(0.99, 0.99, 0.99),
  });

  // Top Title Bar
  page.drawRectangle({
    x: margin,
    y: height - margin - 35,
    width: width - margin * 2,
    height: 35,
    color: rgb(0.12, 0.14, 0.18),
  });

  page.drawText('TAX INVOICE / DELIVERY CHALLAN', {
    x: margin + 15,
    y: height - margin - 24,
    size: 14,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(isDiscrepancy ? 'TEST CASE: DISCREPANCY & VARIANCE' : 'ORIGINAL FOR RECIPIENT', {
    x: width - margin - 190,
    y: height - margin - 23,
    size: 9,
    font: fontBold,
    color: isDiscrepancy ? rgb(1, 0.8, 0.2) : rgb(0.8, 0.9, 1),
  });

  // Vendor Info (Left)
  let y = height - margin - 55;
  page.drawText(vendorName.toUpperCase(), {
    x: margin + 15,
    y: y,
    size: 13,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 14;
  page.drawText(`GSTIN: ${vendorGstin}`, {
    x: margin + 15,
    y: y,
    size: 9,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 13;
  page.drawText(vendorAddress, {
    x: margin + 15,
    y: y,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
  });

  // Invoice & PO Metadata (Right)
  let metaY = height - margin - 55;
  const metaX = width / 2 + 10;

  const drawMetaRow = (label, val, highlight = false) => {
    page.drawText(label, { x: metaX, y: metaY, size: 8.5, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(val, {
      x: metaX + 105,
      y: metaY,
      size: 9,
      font: fontBold,
      color: highlight ? rgb(0.75, 0.1, 0.1) : rgb(0.1, 0.1, 0.1),
    });
    metaY -= 14;
  };

  drawMetaRow('Invoice No:', invoiceNumber);
  drawMetaRow('Invoice Date:', invoiceDate);
  drawMetaRow('PO Reference:', poNumber, true);
  drawMetaRow('Challan No:', challanNumber);
  drawMetaRow('Place of Supply:', 'Madhya Pradesh (23)');

  // Divider Line
  y = height - margin - 135;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });

  // Consignee / Bill To / Ship To
  y -= 18;
  page.drawText('BILLED & SHIPPED TO (CONSIGNEE):', {
    x: margin + 15,
    y: y,
    size: 8.5,
    font: fontBold,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 14;
  page.drawText(consigneeName, {
    x: margin + 15,
    y: y,
    size: 10.5,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 13;
  page.drawText(`GSTIN / UIN: ${consigneeGstin}`, {
    x: margin + 15,
    y: y,
    size: 8.5,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 12;
  page.drawText(consigneeAddress, {
    x: margin + 15,
    y: y,
    size: 8,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
  });

  // Table Header
  y = height - margin - 220;
  page.drawRectangle({
    x: margin,
    y: y - 5,
    width: width - margin * 2,
    height: 22,
    color: rgb(0.93, 0.94, 0.96),
  });

  const cols = [
    { name: '#', x: margin + 10, width: 20 },
    { name: 'ITEM CODE & DESCRIPTION', x: margin + 35, width: 230 },
    { name: 'HSN/SAC', x: margin + 265, width: 55 },
    { name: 'QTY', x: margin + 325, width: 45 },
    { name: 'UOM', x: margin + 370, width: 35 },
    { name: 'RATE (INR)', x: margin + 410, width: 55 },
    { name: 'AMOUNT (INR)', x: margin + 470, width: 65 },
  ];

  cols.forEach(c => {
    page.drawText(c.name, {
      x: c.x,
      y: y + 2,
      size: 7.5,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });
  });

  // Table Rows
  y -= 22;
  let subtotal = 0;
  items.forEach((item, index) => {
    const lineTotal = item.quantity * item.unitPrice;
    subtotal += lineTotal;

    page.drawText(String(index + 1), {
      x: cols[0].x,
      y,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(item.itemCode, {
      x: cols[1].x,
      y,
      size: 8.5,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(item.description, {
      x: cols[1].x,
      y: y - 10,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });

    page.drawText(item.hsn || '48191010', {
      x: cols[2].x,
      y,
      size: 8,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(String(item.quantity), {
      x: cols[3].x,
      y,
      size: 8.5,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    page.drawText(item.uom, {
      x: cols[4].x,
      y,
      size: 8,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(Number(item.unitPrice).toFixed(2), {
      x: cols[5].x,
      y,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.1, 0.1, 0.1),
    });

    page.drawText(Number(lineTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 }), {
      x: cols[6].x,
      y,
      size: 8.5,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    // Row divider
    y -= 24;
    page.drawLine({
      start: { x: margin, y: y + 10 },
      end: { x: width - margin, y: y + 10 },
      thickness: 0.5,
      color: rgb(0.88, 0.88, 0.88),
    });
  });

  // Totals Area
  const tax = 0; // matching current PO tax 0 or specified
  const grandTotal = subtotal + tax;

  const totalBoxY = y - 10;
  page.drawRectangle({
    x: width / 2 + 30,
    y: totalBoxY - 75,
    width: width / 2 - margin - 30,
    height: 85,
    color: rgb(0.97, 0.98, 0.99),
    borderWidth: 1,
    borderColor: rgb(0.85, 0.85, 0.85),
  });

  let totY = totalBoxY;
  page.drawText('SUBTOTAL:', { x: width / 2 + 45, y: totY, size: 8.5, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(`INR ${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, {
    x: width - margin - 110,
    y: totY,
    size: 8.5,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  totY -= 16;
  page.drawText('CGST (0%):', { x: width / 2 + 45, y: totY, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
  page.drawText('INR 0.00', { x: width - margin - 110, y: totY, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  totY -= 14;
  page.drawText('SGST (0%):', { x: width / 2 + 45, y: totY, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
  page.drawText('INR 0.00', { x: width - margin - 110, y: totY, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  totY -= 20;
  page.drawText('TOTAL INVOICE VALUE:', { x: width / 2 + 45, y: totY, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`INR ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, {
    x: width - margin - 120,
    y: totY,
    size: 10,
    font: fontBold,
    color: rgb(0.8, 0.2, 0.1),
  });

  // Notes & Signatures Box
  const bottomY = margin + 110;
  if (notes) {
    page.drawText('REMARKS & DISCREPANCY NOTES:', {
      x: margin + 15,
      y: bottomY + 30,
      size: 8,
      font: fontBold,
      color: isDiscrepancy ? rgb(0.8, 0.2, 0.1) : rgb(0.3, 0.3, 0.3),
    });
    page.drawText(notes, {
      x: margin + 15,
      y: bottomY + 16,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  // Footer / Sign-off
  page.drawLine({
    start: { x: margin, y: margin + 70 },
    end: { x: width - margin, y: margin + 70 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });

  page.drawText('Authorized Signatory / Store Incharge', {
    x: margin + 20,
    y: margin + 25,
    size: 8,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  page.drawText(`For ${vendorName}`, {
    x: width - margin - 180,
    y: margin + 45,
    size: 8.5,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  page.drawText('Authorised Signatory', {
    x: width - margin - 180,
    y: margin + 25,
    size: 8,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  const pdfBytes = await pdfDoc.save();
  const outDir = path.join(__dirname, '../apps/web/public/test-receipts');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const filePath = path.join(outDir, filename);
  fs.writeFileSync(filePath, pdfBytes);
  console.log(`Generated: ${filePath}`);
}

async function main() {
  // 1. EXACT MATCH CASE (All items match PO-2026-012 exactly)
  await createReceiptPdf({
    filename: 'fardeen-enterprises-exact-tax-invoice-PO-2026-012.pdf',
    invoiceNumber: 'INV-FE-2026-0042',
    invoiceDate: '09-Sep-2026',
    poNumber: 'PO-2026-012',
    challanNumber: 'DC-2026-0881',
    vendorName: 'Fardeen Enterprises',
    vendorGstin: '23ADEFS1382A1ZL',
    vendorAddress: '65/8, Gram Bardari, Indore, Madhya Pradesh - 453555, India',
    consigneeName: 'SYNERGY INTERNATIONAL',
    consigneeGstin: '23ADYPP8947M1ZW',
    consigneeAddress: 'Khasra no. 378/2/3, Godown 10, Radheshyam Warehouse, Indore HQ Plant - 452001',
    items: [
      {
        itemCode: 'A-ROD-727MM',
        description: 'A ROD - 727MM',
        hsn: '48191010',
        quantity: 100,
        uom: 'kg',
        unitPrice: 120.00
      },
      {
        itemCode: '5-PIPES-10-PCS-SET',
        description: '5 PIPES - 10 PCS / SET',
        hsn: '48191010',
        quantity: 130,
        uom: 'kg',
        unitPrice: 40.00
      }
    ],
    notes: 'Standard Delivery per PO-2026-012 terms. All line items inspected and certified conforming.'
  });

  // 2. DISCREPANCY & SHORTAGE CASE (For testing Shortage Discrepancy & Debit Note Creation)
  // - A-ROD-727MM delivered only 75 kg (shortage of 25 kg)
  // - 5-PIPES-10-PCS-SET billed at 45.00 INR (price variance) or damaged units
  await createReceiptPdf({
    filename: 'fardeen-enterprises-discrepancy-shortage-PO-2026-012.pdf',
    invoiceNumber: 'INV-FE-2026-0043-DISC',
    invoiceDate: '09-Sep-2026',
    poNumber: 'PO-2026-012',
    challanNumber: 'DC-2026-0882',
    vendorName: 'Fardeen Enterprises',
    vendorGstin: '23ADEFS1382A1ZL',
    vendorAddress: '65/8, Gram Bardari, Indore, Madhya Pradesh - 453555, India',
    consigneeName: 'SYNERGY INTERNATIONAL',
    consigneeGstin: '23ADYPP8947M1ZW',
    consigneeAddress: 'Khasra no. 378/2/3, Godown 10, Radheshyam Warehouse, Indore HQ Plant - 452001',
    isDiscrepancy: true,
    items: [
      {
        itemCode: 'A-ROD-727MM',
        description: 'A ROD - 727MM (Delivered 75 kg, Short 25 kg)',
        hsn: '48191010',
        quantity: 75,
        uom: 'kg',
        unitPrice: 120.00
      },
      {
        itemCode: '5-PIPES-10-PCS-SET',
        description: '5 PIPES - 10 PCS / SET (Partial Batch Delivery)',
        hsn: '48191010',
        quantity: 100,
        uom: 'kg',
        unitPrice: 40.00
      }
    ],
    notes: 'SUPPLIER DISPATCH NOTE: 25 kg shortage on A-ROD-727MM and 30 kg shortage on 5-PIPES. Test discrepancy resolution & Debit Note generation.'
  });
}

main().catch(console.error);
