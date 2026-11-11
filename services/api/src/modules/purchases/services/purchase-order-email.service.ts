import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';
import { prisma } from '../../../database';
import { config } from '../../../config';
import { ValidationError, NotFoundError } from '../../../common/errors/AppError';
import { notificationService } from '../../notifications/notification.service';

export interface EmailDelivery {
  id: string;
  poId: string;
  revisionNumber: number;
  attempt: number;
  recipient: string;
  subject: string;
  status: string;
  messageId: string | null;
  error: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type EmailPO = NonNullable<Awaited<ReturnType<typeof loadEmailPO>>>;
type PrintableEmailPO = EmailPO & {
  destination?: string | null;
  dispatchedThrough?: string | null;
  termsOfDelivery?: string | null;
  otherReferences?: string | null;
};

async function loadEmailPO(id: string) {
  return prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: true,
      sourcePr: true,
      lines: {
        include: { product: true, material: true, uom: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}

function formatIndianDate(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function amountInIndianWords(value: unknown): string {
  const amount = Math.abs(Number(value || 0));
  if (isNaN(amount) || amount === 0) return 'INR Zero Only';

  const singleDigits = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const twoDigits = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tensMultiple = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertTwoDigits = (n: number): string => {
    if (n === 0) return '';
    if (n < 10) return singleDigits[n];
    if (n >= 10 && n < 20) return twoDigits[n - 10];
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return `${tensMultiple[tens]}${ones > 0 ? ' ' + singleDigits[ones] : ''}`;
  };

  const convertThreeDigits = (n: number): string => {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let res = '';
    if (hundred > 0) res += `${singleDigits[hundred]} Hundred`;
    if (rest > 0) {
      if (res) res += ' ';
      res += convertTwoDigits(rest);
    }
    return res;
  };

  const integerPart = Math.floor(amount);
  const decimalPart = Math.round((amount - integerPart) * 100);

  const crore = Math.floor(integerPart / 10000000);
  const lakh = Math.floor((integerPart % 10000000) / 100000);
  const thousand = Math.floor((integerPart % 100000) / 1000);
  const remainder = integerPart % 1000;

  let words = '';
  if (crore > 0) words += `${convertTwoDigits(crore)} Crore `;
  if (lakh > 0) words += `${convertTwoDigits(lakh)} Lakh `;
  if (thousand > 0) words += `${convertTwoDigits(thousand)} Thousand `;
  if (remainder > 0) words += `${convertThreeDigits(remainder)} `;

  words = words.trim();
  if (!words) words = 'Zero';

  let result = `INR ${words}`;
  if (decimalPart > 0) {
    result += ` and Paise ${convertTwoDigits(decimalPart)}`;
  }
  return `${result} Only`;
}

function resolveLogoPath(): string | undefined {
  const candidates = [
    path.resolve(process.cwd(), 'apps/web/public/icon.svg'),
    path.resolve(process.cwd(), '../../apps/web/public/icon.svg'),
    path.resolve(__dirname, '../../../../../../apps/web/public/icon.svg'),
    path.resolve(__dirname, '../../../../apps/web/public/icon.svg'),
    '/home/fardeen/Documents/aleyx-projects/Plinth/apps/web/public/icon.svg',
  ];
  return candidates.find(candidate => fs.existsSync(candidate));
}

function getVendorDisplay(vendor: EmailPO['vendor']) {
  let addr: Record<string, unknown> | undefined;
  if (vendor.address && typeof vendor.address === 'object') {
    addr = vendor.address as Record<string, unknown>;
  } else if (typeof vendor.address === 'string') {
    try {
      addr = JSON.parse(vendor.address) as Record<string, unknown>;
    } catch {
      addr = { street: vendor.address };
    }
  }

  const street = String(addr?.street || addr?.line1 || (typeof vendor.address === 'string' ? vendor.address : '') || '').trim();
  const city = String(addr?.city || '').trim();
  const state = String(addr?.state || '').trim();
  const postalCode = String(addr?.postalCode || addr?.pincode || '').trim();
  const country = String(addr?.country || '').trim();

  const cityStateZip = [
    city,
    state && postalCode ? `${state} - ${postalCode}` : state || postalCode,
    country,
  ].filter(Boolean).join(', ');

  const gstin = vendor.taxNumber || String(addr?.gstin || '') || '';
  const stateName = state || (gstin.startsWith('23') ? 'Madhya Pradesh' : '');
  const stateCode = String(addr?.stateCode || (gstin.length >= 2 && !isNaN(Number(gstin.slice(0, 2))) ? gstin.slice(0, 2) : (stateName === 'Madhya Pradesh' ? '23' : '')));

  return {
    name: vendor.legalName || vendor.name || '—',
    code: vendor.code || '',
    street,
    cityStateZip,
    fullAddress: [street, cityStateZip].filter(Boolean).join('\n') || street || 'Address not provided',
    gstin,
    stateName,
    stateCode,
    isIntraState: stateCode === '23' || (!stateCode && !gstin),
  };
}

function getPaymentTerms(po: EmailPO): string {
  return typeof po.paymentTerms === 'string' ? po.paymentTerms.trim() : '';
}

function extractEmailAddress(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && 'address' in value) {
    const address = (value as { address?: unknown }).address;
    return typeof address === 'string' ? address.trim() : '';
  }
  return '';
}

async function makePdf(po: EmailPO): Promise<Buffer> {
  const printablePo = po as PrintableEmailPO;
  const vendorInfo = getVendorDisplay(po.vendor);

  // Financial calculations
  const lines = po.lines || [];
  const subtotal = Number(
    po.subtotal ??
      lines.reduce(
        (sum, line) => sum + Number(line.lineTotal ?? Number(line.quantity || 0) * Number(line.unitPrice || 0)),
        0
      )
  );
  const totalTax = Number(po.taxAmount ?? 0);
  const grandTotal = Number(po.totalAmount ?? (subtotal + totalTax));
  const cgstAmount = vendorInfo.isIntraState ? totalTax / 2 : 0;
  const sgstAmount = vendorInfo.isIntraState ? totalTax / 2 : 0;
  const igstAmount = !vendorInfo.isIntraState ? totalTax : 0;
  const quantityTotals = new Map<string, number>();
  for (const line of lines) {
    const unit = line.uom?.symbol || line.uom?.code || '';
    quantityTotals.set(unit, (quantityTotals.get(unit) || 0) + Number(line.quantity || 0));
  }
  const quantitySummary = [...quantityTotals.entries()]
    .map(([unit, quantity]) => `${quantity.toLocaleString('en-IN')} ${unit}`.trim())
    .join(' / ');
  const wordsAmount = amountInIndianWords(grandTotal);

  // Logistics & Voucher references
  const voucherNo = po.poNumber;
  const orderDate = formatIndianDate(po.createdAt);
  const referenceNo = po.sourcePr?.prNumber ? `${po.sourcePr.prNumber} & ${orderDate}` : voucherNo;
  const paymentTerms = getPaymentTerms(po) || '—';
  const dispatchedThrough = printablePo.dispatchedThrough || '—';
  const destination = printablePo.destination || po.deliveryLocation || '—';
  const termsOfDelivery = printablePo.termsOfDelivery || '—';
  const otherReferences = printablePo.otherReferences || '—';

  return new Promise((resolve, reject) => {
    // A4 dimensions: 595.28 x 841.89 points
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Geometry layout: Left margin 40, printable width 515, right border at 555
    const pageX = 40;
    const pageWidth = 515;
    const pageRight = pageX + pageWidth; // 555

    // 1. Top Title Header
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000').text('PURCHASE ORDER', pageX, 36, {
      width: pageWidth,
      align: 'center',
    });

    // 2. Company Header with Plinth Logo and Address
    const logo = resolveLogoPath();
    const logoWidth = 95;
    const logoHeight = 40;
    let headerTextX = pageX;

    if (logo) {
      try {
        doc.image(logo, pageX, 54, { fit: [logoWidth, logoHeight] });
        headerTextX = pageX + logoWidth + 14;
      } catch {
        headerTextX = pageX;
      }
    }

    const headerTextWidth = pageRight - headerTextX;
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000').text('PLINTH', headerTextX, 54);
    doc.fontSize(7.5).font('Helvetica').fillColor('#1e293b')
      .text('Khasra no. 378/2/3, Godown 10, Radheshyam Warehouse,', headerTextX, 67, { width: headerTextWidth })
      .text('Saraswati Udhyog Nagar, Behind Panchmukhi Hanuman Mandir,', headerTextX, 77, { width: headerTextWidth })
      .text('Nemawar Road, Indore - 452001, Madhya Pradesh, India', headerTextX, 87, { width: headerTextWidth })
      .font('Helvetica-Bold').fillColor('#0f172a')
      .text('Phone: +91 - 928 5151 928   |   Email: sales@plinth.example   |   GSTIN: 23AOYPP8347M1ZW', headerTextX, 97, { width: headerTextWidth });

    // Dividing line below company header
    doc.moveTo(pageX, 110).lineTo(pageRight, 110).strokeColor('#000000').lineWidth(1.5).stroke();

    // 3. 2-Column Master ERP Grid Box
    const boxY = 113;
    const boxHeight = 98;
    const colSplitX = pageX + 257.5; // 297.5

    // Outer box border
    doc.rect(pageX, boxY, pageWidth, boxHeight).strokeColor('#000000').lineWidth(1).stroke();
    // Vertical column divider
    doc.moveTo(colSplitX, boxY).lineTo(colSplitX, boxY + boxHeight).strokeColor('#000000').lineWidth(1).stroke();

    // Left Column: Supplier Bill From
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#475569').text('SUPPLIER (BILL FROM)', pageX + 6, boxY + 4);
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#000000').text(vendorInfo.name, pageX + 6, boxY + 14, { width: 245, lineBreak: false });
    const addressStr = vendorInfo.street ? `${vendorInfo.street}${vendorInfo.cityStateZip ? `, ${vendorInfo.cityStateZip}` : ''}` : (vendorInfo.cityStateZip || 'Address not provided');
    doc.fontSize(7.5).font('Helvetica').fillColor('#1e293b').text(addressStr, pageX + 6, boxY + 27, { width: 245, height: 30, ellipsis: true });

    // Inner horizontal line in left column above GSTIN
    doc.moveTo(pageX, boxY + 68).lineTo(colSplitX, boxY + 68).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
    doc.fontSize(7.5).font('Helvetica').fillColor('#475569').text('GSTIN/UIN', pageX + 6, boxY + 72);
    doc.font('Helvetica-Bold').fillColor('#000000').text(`: ${vendorInfo.gstin || '—'}`, pageX + 70, boxY + 72);

    // Right Column: Order Details & Logistics Meta Grid (4 rows of 24.5pt)
    const rightRowH = boxHeight / 4; // 24.5
    const rightSubSplitX = colSplitX + 128.75; // 426.25

    // Horizontal grid dividers in right column
    doc.moveTo(colSplitX, boxY + rightRowH).lineTo(pageRight, boxY + rightRowH).strokeColor('#000000').lineWidth(0.5).stroke();
    doc.moveTo(colSplitX, boxY + rightRowH * 2).lineTo(pageRight, boxY + rightRowH * 2).strokeColor('#000000').lineWidth(0.5).stroke();
    doc.moveTo(colSplitX, boxY + rightRowH * 3).lineTo(pageRight, boxY + rightRowH * 3).strokeColor('#000000').lineWidth(0.5).stroke();
    // Vertical center divider in right column
    doc.moveTo(rightSubSplitX, boxY).lineTo(rightSubSplitX, boxY + boxHeight).strokeColor('#000000').lineWidth(0.5).stroke();

    // Row 1: Voucher No & Dated
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#475569').text('VOUCHER NO.', colSplitX + 6, boxY + 3);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000').text(voucherNo, colSplitX + 6, boxY + 12, { width: 118, ellipsis: true });
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#475569').text('DATED', rightSubSplitX + 6, boxY + 3);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000').text(orderDate, rightSubSplitX + 6, boxY + 12, { width: 118 });

    // Row 2: Reference & Payment Terms
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#475569').text('REFERENCE NO. & DATE.', colSplitX + 6, boxY + rightRowH + 3);
    doc.fontSize(7.5).font('Helvetica').fillColor('#000000').text(referenceNo, colSplitX + 6, boxY + rightRowH + 12, { width: 118, ellipsis: true });
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#475569').text('MODE/TERMS OF PAYMENT', rightSubSplitX + 6, boxY + rightRowH + 3);
    doc.fontSize(7.5).font('Helvetica').fillColor('#000000').text(paymentTerms, rightSubSplitX + 6, boxY + rightRowH + 12, { width: 118, ellipsis: true });

    // Row 3: Dispatch & Other References
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#475569').text('DISPATCHED THROUGH', colSplitX + 6, boxY + rightRowH * 2 + 3);
    doc.fontSize(7.5).font('Helvetica').fillColor('#000000').text(dispatchedThrough, colSplitX + 6, boxY + rightRowH * 2 + 12, { width: 118, ellipsis: true });
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#475569').text('OTHER REFERENCES', rightSubSplitX + 6, boxY + rightRowH * 2 + 3);
    doc.fontSize(7.5).font('Helvetica').fillColor('#000000').text(otherReferences, rightSubSplitX + 6, boxY + rightRowH * 2 + 12, { width: 118, ellipsis: true });

    // Row 4: Terms of Delivery & Destination
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#475569').text('TERMS OF DELIVERY', colSplitX + 6, boxY + rightRowH * 3 + 3);
    doc.fontSize(7.5).font('Helvetica').fillColor('#000000').text(termsOfDelivery, colSplitX + 6, boxY + rightRowH * 3 + 12, { width: 118, ellipsis: true });
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#475569').text('DESTINATION', rightSubSplitX + 6, boxY + rightRowH * 3 + 3);
    doc.fontSize(7.5).font('Helvetica').fillColor('#000000').text(destination, rightSubSplitX + 6, boxY + rightRowH * 3 + 12, { width: 118, ellipsis: true });

    // 4. Ordered Goods Table
    // Columns match the Plinth PO: Sl, description, HSN/SAC, due date,
    // quantity, UOM, rate, per, discount and amount.
    const cols = [40, 62, 212, 257, 302, 342, 372, 412, 450, 480, 555];

    const drawTableHeader = (y: number) => {
      doc.rect(pageX, y, pageWidth, 20).fillColor('#f1f5f9').fill();
      doc.moveTo(pageX, y).lineTo(pageRight, y).strokeColor('#000000').lineWidth(1).stroke();
      doc.moveTo(pageX, y + 20).lineTo(pageRight, y + 20).strokeColor('#000000').lineWidth(1).stroke();

      for (const cx of cols) {
        doc.moveTo(cx, y).lineTo(cx, y + 20).strokeColor('#000000').lineWidth(0.5).stroke();
      }

      doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#000000');
      doc.text('Sl No.', cols[0], y + 6, { width: cols[1] - cols[0], align: 'center' });
      doc.text('Description of Goods', cols[1] + 4, y + 6, { width: cols[2] - cols[1] - 8, align: 'left' });
      doc.text('HSN/SAC', cols[2], y + 6, { width: cols[3] - cols[2], align: 'center' });
      doc.text('Due on', cols[3], y + 6, { width: cols[4] - cols[3], align: 'center' });
      doc.text('Quantity', cols[4], y + 6, { width: cols[5] - cols[4] - 4, align: 'right' });
      doc.text('UOM', cols[5], y + 6, { width: cols[6] - cols[5], align: 'center' });
      doc.text('Rate', cols[6], y + 6, { width: cols[7] - cols[6] - 4, align: 'right' });
      doc.text('per', cols[7], y + 6, { width: cols[8] - cols[7], align: 'center' });
      doc.text('Disc. %', cols[8], y + 6, { width: cols[9] - cols[8] - 3, align: 'right' });
      doc.text('Amount', cols[9], y + 6, { width: cols[10] - cols[9] - 5, align: 'right' });
    };

    let currentY = boxY + boxHeight; // 211
    drawTableHeader(currentY);
    currentY += 20;

    // Line items loop
    lines.forEach((line, idx) => {
      const itemDesc = line.product?.name || line.material?.name || (line.product?.sku ? `Product ${line.product.sku}` : '') || (line.material?.code ? `Material ${line.material.code}` : '') || 'Item';
      const itemCode = line.product?.sku || line.material?.code || '';
      const lineData = line as typeof line & { hsnSac?: string | null };
      const materialSpecs = line.material?.specs && typeof line.material.specs === 'object' ? (line.material.specs as Record<string, unknown>) : null;
      const productMetadata = line.product && (line.product as { metadata?: unknown }).metadata && typeof (line.product as { metadata?: unknown }).metadata === 'object'
        ? ((line.product as { metadata?: unknown }).metadata as Record<string, unknown>)
        : null;
      const hsn = lineData.hsnSac || String(materialSpecs?.hsnCode || materialSpecs?.hsn || productMetadata?.hsnCode || productMetadata?.hsn || '—');
      const dueOn = formatIndianDate(line.needDate);
      const qtyStr = Number(line.quantity || 0).toLocaleString('en-IN');
      const rateStr = Number(line.unitPrice || 0).toFixed(2);
      const uomSymbol = line.uom?.symbol || line.uom?.code || '—';
      const lineAmt = Number(line.lineTotal ?? Number(line.quantity || 0) * Number(line.unitPrice || 0));
      const lineAmtStr = lineAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      // Calculate row height
      const titleHeight = doc.heightOfString(itemDesc.toUpperCase(), { width: cols[2] - cols[1] - 8 });
      const rowHeight = Math.max(22, titleHeight + (itemCode ? 10 : 0) + 7);

      // Check pagination
      if (currentY + rowHeight > 700) {
        doc.addPage();
        currentY = 40;
        drawTableHeader(currentY);
        currentY += 20;
      }

      // Vertical dividers for line row
      for (const cx of cols) {
        doc.moveTo(cx, currentY).lineTo(cx, currentY + rowHeight).strokeColor('#000000').lineWidth(0.5).stroke();
      }
      doc.moveTo(pageX, currentY + rowHeight).lineTo(pageRight, currentY + rowHeight).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

      // Row content
      doc.fontSize(7.5).font('Helvetica').fillColor('#000000');
      doc.text(String(idx + 1), cols[0], currentY + 5, { width: cols[1] - cols[0], align: 'center' });

      // Description
      doc.fontSize(7.5).font('Helvetica-Bold').text(itemDesc.toUpperCase(), cols[1] + 4, currentY + 5, { width: cols[2] - cols[1] - 8 });
      if (itemCode) {
        doc.fontSize(6.5).font('Helvetica').fillColor('#64748b').text(itemCode, cols[1] + 4, currentY + 5 + titleHeight);
      }

      // Rest of columns
      doc.fontSize(7.5).font('Helvetica').fillColor('#000000');
      doc.text(hsn, cols[2], currentY + 5, { width: cols[3] - cols[2], align: 'center' });
      doc.text(dueOn, cols[3], currentY + 5, { width: cols[4] - cols[3], align: 'center' });
      doc.font('Helvetica-Bold').text(qtyStr, cols[4], currentY + 5, { width: cols[5] - cols[4] - 4, align: 'right' });
      doc.font('Helvetica').text(uomSymbol, cols[5], currentY + 5, { width: cols[6] - cols[5], align: 'center' });
      doc.text(rateStr, cols[6], currentY + 5, { width: cols[7] - cols[6] - 4, align: 'right' });
      doc.text(uomSymbol, cols[7], currentY + 5, { width: cols[8] - cols[7], align: 'center' });
      doc.text('—', cols[8], currentY + 5, { width: cols[9] - cols[8] - 3, align: 'right' });
      doc.font('Helvetica-Bold').text(lineAmtStr, cols[9], currentY + 5, { width: cols[10] - cols[9] - 5, align: 'right' });

      currentY += rowHeight;
    });

    // If no line items recorded
    if (lines.length === 0) {
      const emptyH = 30;
      for (const cx of cols) {
        doc.moveTo(cx, currentY).lineTo(cx, currentY + emptyH).strokeColor('#000000').lineWidth(0.5).stroke();
      }
      doc.moveTo(pageX, currentY + emptyH).lineTo(pageRight, currentY + emptyH).strokeColor('#000000').lineWidth(0.5).stroke();
      doc.fontSize(8).font('Helvetica-Oblique').fillColor('#64748b').text('No line items recorded for this purchase order.', pageX, currentY + 10, { width: pageWidth, align: 'center' });
      currentY += emptyH;
    }

    // Tax Sub-Rows inside table
    if (vendorInfo.isIntraState && (cgstAmount > 0 || totalTax > 0)) {
      const taxRowH = 16;
      // C-GST
      for (const cx of cols) {
        doc.moveTo(cx, currentY).lineTo(cx, currentY + taxRowH).strokeColor('#000000').lineWidth(0.5).stroke();
      }
      doc.moveTo(pageX, currentY + taxRowH).lineTo(pageRight, currentY + taxRowH).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000000').text('C-GST', cols[1] + 30, currentY + 4);
      doc.text((cgstAmount || totalTax / 2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), cols[9], currentY + 4, { width: cols[10] - cols[9] - 5, align: 'right' });
      currentY += taxRowH;

      // S-GST
      for (const cx of cols) {
        doc.moveTo(cx, currentY).lineTo(cx, currentY + taxRowH).strokeColor('#000000').lineWidth(0.5).stroke();
      }
      doc.moveTo(pageX, currentY + taxRowH).lineTo(pageRight, currentY + taxRowH).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000000').text('S-GST', cols[1] + 30, currentY + 4);
      doc.text((sgstAmount || totalTax / 2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), cols[9], currentY + 4, { width: cols[10] - cols[9] - 5, align: 'right' });
      currentY += taxRowH;
    } else if (!vendorInfo.isIntraState && igstAmount > 0) {
      const taxRowH = 16;
      for (const cx of cols) {
        doc.moveTo(cx, currentY).lineTo(cx, currentY + taxRowH).strokeColor('#000000').lineWidth(0.5).stroke();
      }
      doc.moveTo(pageX, currentY + taxRowH).lineTo(pageRight, currentY + taxRowH).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000000').text('I-GST', cols[1] + 30, currentY + 4);
      doc.text(igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), cols[9], currentY + 4, { width: cols[10] - cols[9] - 5, align: 'right' });
      currentY += taxRowH;
    }

    // Table Total Footer Row
    const totalRowH = 20;
    doc.rect(pageX, currentY, pageWidth, totalRowH).fillColor('#f8fafc').fill();
    doc.moveTo(pageX, currentY).lineTo(pageRight, currentY).strokeColor('#000000').lineWidth(1.5).stroke();
    doc.moveTo(pageX, currentY + totalRowH).lineTo(pageRight, currentY + totalRowH).strokeColor('#000000').lineWidth(1).stroke();

    for (const cx of cols) {
      doc.moveTo(cx, currentY).lineTo(cx, currentY + totalRowH).strokeColor('#000000').lineWidth(0.5).stroke();
    }

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000000');
    doc.text('TOTAL', cols[1], currentY + 5, { width: cols[2] - cols[1] - 8, align: 'right' });
    doc.text(quantitySummary, cols[4], currentY + 5, { width: cols[6] - cols[4] - 4, align: 'right' });
    const totalFormatted = `INR ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    doc.fontSize(8).text(totalFormatted, cols[9], currentY + 5, { width: cols[10] - cols[9] - 5, align: 'right' });

    currentY += totalRowH;

    // 5. Check if Summary & Signatory box fit on current page
    const remainingH = 30 + 64 + 20; // 114 pt
    if (currentY + remainingH > 800) {
      doc.addPage();
      currentY = 40;
    }

    // 5. Footer Summary Box: Amount Chargeable (in words) & E. & O.E
    const summaryH = 28;
    doc.rect(pageX, currentY, pageWidth, summaryH).strokeColor('#000000').lineWidth(1).stroke();
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#475569').text('AMOUNT CHARGEABLE (IN WORDS)', pageX + 6, currentY + 4);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000').text(wordsAmount, pageX + 6, currentY + 13, { width: 380, lineBreak: false });
    doc.fontSize(8).font('Helvetica-BoldOblique').fillColor('#000000').text('E. & O.E', pageRight - 100, currentY + 10, { width: 94, align: 'right' });

    currentY += summaryH;

    // 6. Signatory Box
    const signBoxH = 64;
    doc.rect(pageX, currentY, pageWidth, signBoxH).strokeColor('#000000').lineWidth(1).stroke();
    doc.moveTo(colSplitX, currentY).lineTo(colSplitX, currentY + signBoxH).strokeColor('#000000').lineWidth(1).stroke();

    // Keep the left half blank, matching the dashboard PO document.
    // Right signatory area: Authorised Signatory
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000').text('for PLINTH 2026-27', colSplitX + 6, currentY + 6, {
      width: 245,
      align: 'right',
    });
    // Signature line
    doc.moveTo(pageRight - 160, currentY + 46).lineTo(pageRight - 10, currentY + 46).strokeColor('#94a3b8').lineWidth(0.8).stroke();
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000000').text('Authorised Signatory', pageRight - 160, currentY + 49, {
      width: 150,
      align: 'center',
    });

    currentY += signBoxH;

    // 7. Bottom Jurisdiction
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000000').text('SUBJECT TO INDORE JURISDICTION', pageX, currentY + 6, {
      width: pageWidth,
      align: 'center',
    });

    doc.end();
  });
}

function htmlEscape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);
}

async function getLatestDelivery(poId: string, revisionNumber: number): Promise<EmailDelivery | undefined> {
  const rows = await prisma.$queryRaw<EmailDelivery[]>`
    SELECT id, "poId", "revisionNumber", attempt, recipient, subject, status, "messageId", error, "sentAt", "createdAt", "updatedAt"
    FROM purchase_order_email_deliveries
    WHERE "poId" = ${poId} AND "revisionNumber" = ${revisionNumber}
    ORDER BY attempt DESC LIMIT 1
  `;
  return rows[0];
}

async function hasSuccessfulDelivery(poId: string, revisionNumber: number): Promise<EmailDelivery | undefined> {
  const rows = await prisma.$queryRaw<EmailDelivery[]>`
    SELECT id, "poId", "revisionNumber", attempt, recipient, subject, status, "messageId", error, "sentAt", "createdAt", "updatedAt"
    FROM purchase_order_email_deliveries
    WHERE "poId" = ${poId} AND "revisionNumber" = ${revisionNumber} AND status = 'SENT'
    ORDER BY attempt DESC LIMIT 1
  `;
  return rows[0];
}

async function createDelivery(poId: string, revisionNumber: number, attempt: number, recipient: string, subject: string): Promise<EmailDelivery> {
  const id = randomUUID();
  const rows = await prisma.$queryRaw<EmailDelivery[]>`
    INSERT INTO purchase_order_email_deliveries (id, "poId", "revisionNumber", attempt, recipient, subject, status, "createdAt", "updatedAt")
    VALUES (${id}, ${poId}, ${revisionNumber}, ${attempt}, ${recipient}, ${subject}, 'SENDING', NOW(), NOW())
    RETURNING id, "poId", "revisionNumber", attempt, recipient, subject, status, "messageId", error, "sentAt", "createdAt", "updatedAt"
  `;
  return rows[0];
}

async function updateDelivery(id: string, status: 'SENT' | 'FAILED', data: { messageId?: string; error?: string | null } = {}): Promise<EmailDelivery> {
  const rows = await prisma.$queryRaw<EmailDelivery[]>`
    UPDATE purchase_order_email_deliveries SET
      status = ${status}, "messageId" = ${data.messageId ?? null}, error = ${data.error ?? null},
      "sentAt" = ${status === 'SENT' ? new Date() : null}, "updatedAt" = NOW()
    WHERE id = ${id}
    RETURNING id, "poId", "revisionNumber", attempt, recipient, subject, status, "messageId", error, "sentAt", "createdAt", "updatedAt"
  `;
  return rows[0];
}

export class PurchaseOrderEmailService {
  async getDocument(id: string): Promise<{ filename: string; content: Buffer }> {
    const po = await loadEmailPO(id);
    if (!po) throw new NotFoundError(`PurchaseOrder [${id}] not found.`);
    return { filename: `${po.poNumber}-R${po.revisionNumber}.pdf`, content: await makePdf(po) };
  }

  async send(id: string, mode: 'approval' | 'initial' | 'resend' = 'initial') {
    const po = await loadEmailPO(id);
    if (!po) throw new NotFoundError(`PurchaseOrder [${id}] not found.`);
    if (mode === 'approval' && po.status !== 'DRAFT') throw new ValidationError('Only a draft purchase order can be confirmed and sent.');
    if (mode === 'initial' && po.status !== 'APPROVED') throw new ValidationError('Only an approved purchase order can be sent to the vendor.');
    if (mode === 'resend' && !po.sentAt) throw new ValidationError('Only a sent purchase order can be emailed again.');

    const recipient = typeof po.vendor.contactEmail === 'string' ? po.vendor.contactEmail.trim() : '';
    const subject = `Purchase Order ${po.poNumber} (Revision ${po.revisionNumber}) — Plinth`;
    const previous = await getLatestDelivery(id, po.revisionNumber);
    if (mode === 'initial' || mode === 'approval') {
      const priorSuccessful = await hasSuccessfulDelivery(id, po.revisionNumber);
      if (priorSuccessful) return priorSuccessful;
    }
    const attempt = (previous?.attempt || 0) + 1;
    const delivery = await createDelivery(id, po.revisionNumber, attempt, recipient, subject);
    let closeTransport: (() => void) | undefined;

    try {
      if (!recipient) throw new ValidationError('Email not configured for the Vendor, configure it first before sending PO');
      if (!config.email.enabled) throw new ValidationError('Email delivery is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD and EMAIL_FROM_ADDRESS.');
      const pdf = await makePdf(po);
      const logo = resolveLogoPath();
      const transporter = nodemailer.createTransport({
        host: config.email.smtpHost,
        port: config.email.smtpPort,
        secure: config.email.smtpSecure,
        auth: { user: config.email.smtpUser, pass: config.email.smtpPassword },
      });
      closeTransport = () => transporter.close();

      const logoMarkup = logo
        ? '<img src="cid:plinth-logo" alt="Plinth" style="display:block;width:125px;max-height:44px;object-fit:contain">'
        : '<strong style="font-size:18px;letter-spacing:1.5px;color:#064f7d">PLINTH</strong>';

      const orderDateFormatted = formatIndianDate(po.createdAt);
      const totalAmountFormatted = Number(po.totalAmount).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Purchase Order ${htmlEscape(po.poNumber)}</title>
</head>
<body style="margin:0;padding:24px 0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05)">
    <!-- Header -->
    <table style="width:100%;border-collapse:collapse;border-bottom:3px solid #f4b42a;background:#ffffff">
      <tr>
        <td style="padding:18px 24px">${logoMarkup}</td>
        <td style="padding:18px 24px;text-align:right">
          <span style="display:inline-block;padding:4px 10px;background:#064f7d;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:1px;border-radius:4px;text-transform:uppercase">Purchase Order</span>
        </td>
      </tr>
    </table>
    
    <!-- Body Content -->
    <div style="padding:26px 28px">
      <h1 style="margin:0 0 4px;font-size:20px;font-weight:800;color:#0f172a">
        ${htmlEscape(po.poNumber)} <span style="font-size:14px;font-weight:500;color:#64748b">(Revision ${po.revisionNumber})</span>
      </h1>
      <p style="margin:0 0 18px;font-size:13px;color:#64748b">Dated: ${orderDateFormatted}</p>

      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#334155">
        Dear <strong>${htmlEscape(po.vendor.legalName || po.vendor.name)}</strong>,
      </p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#334155">
        Please find attached the official Purchase Order document issued by <strong>Plinth</strong>.
        Please review the order specification below and in the attached PDF, and confirm receipt and delivery schedule.
      </p>

      <!-- Order Details Summary Table -->
      <table style="width:100%;border-collapse:collapse;margin:18px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
        <tbody>
          <tr style="border-bottom:1px solid #e2e8f0">
            <td style="padding:9px 14px;font-size:12px;font-weight:600;color:#64748b;width:35%">PO Voucher No.</td>
            <td style="padding:9px 14px;font-size:13px;font-weight:700;color:#0f172a">${htmlEscape(po.poNumber)} (Rev ${po.revisionNumber})</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0">
            <td style="padding:9px 14px;font-size:12px;font-weight:600;color:#64748b">Supplier</td>
            <td style="padding:9px 14px;font-size:13px;font-weight:600;color:#0f172a">${htmlEscape(po.vendor.legalName || po.vendor.name)}</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0">
            <td style="padding:9px 14px;font-size:12px;font-weight:600;color:#64748b">Line Items</td>
            <td style="padding:9px 14px;font-size:13px;font-weight:600;color:#0f172a">${po.lines.length} Ordered Item(s)</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0">
            <td style="padding:9px 14px;font-size:12px;font-weight:600;color:#64748b">Total Gross Value</td>
            <td style="padding:9px 14px;font-size:14px;font-weight:800;color:#064f7d">₹ ${totalAmountFormatted}</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0">
            <td style="padding:9px 14px;font-size:12px;font-weight:600;color:#64748b">Payment Terms</td>
            <td style="padding:9px 14px;font-size:13px;color:#334155">${htmlEscape(getPaymentTerms(po) || '—')}</td>
          </tr>
          <tr>
            <td style="padding:9px 14px;font-size:12px;font-weight:600;color:#64748b">Delivery Location</td>
            <td style="padding:9px 14px;font-size:13px;color:#334155">${htmlEscape(po.deliveryLocation || 'As agreed with supplier')}</td>
          </tr>
        </tbody>
      </table>

      <p style="margin:16px 0 20px;font-size:13px;line-height:1.6;color:#475569">
        The attached official PDF (<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;color:#064f7d">${htmlEscape(po.poNumber)}-R${po.revisionNumber}.pdf</code>) contains the full statutory purchase order breakdown, item specifications, GST components, and terms.
      </p>

      <div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-top:20px">
        <p style="margin:0 0 2px;font-size:13px;color:#64748b">Warm regards,</p>
        <p style="margin:0;font-size:14px;font-weight:700;color:#0f172a">Plinth Procurement Team</p>
        <p style="margin:2px 0 0;font-size:12px;color:#64748b">PLINTH</p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:14px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;text-align:center;line-height:1.5">
      Khasra no. 378/2/3, Godown 10, Radheshyam Warehouse, Saraswati Udhyog Nagar, Nemawar Road, Indore - 452001, MP, India<br>
      GSTIN: 23AOYPP8347M1ZW | Phone: +91 - 928 5151 928 | sales@plinth.example
    </div>
  </div>
</body>
</html>`;

      const attachments: Array<{ filename: string; content?: Buffer; path?: string; contentType?: string; cid?: string }> = [
        { filename: `${po.poNumber}-R${po.revisionNumber}.pdf`, content: pdf, contentType: 'application/pdf' },
      ];
      if (logo) attachments.push({ filename: 'plinth-logo.png', path: logo, cid: 'plinth-logo' });

      const result = await transporter.sendMail({
        from: { name: config.email.fromName, address: config.email.fromAddress },
        to: recipient,
        subject,
        html,
        attachments,
      });

      // Nodemailer's accepted/rejected recipient entries can be either plain
      // email strings or Address objects depending on the transport/version.
      // Normalize both shapes so a successful SMTP response is not treated as
      // a failed send by assuming every entry has an `.address` field.
      const recipientAccepted = (result.accepted ?? []).some(
        (acceptedAddress) => extractEmailAddress(acceptedAddress).toLowerCase() === recipient.toLowerCase(),
      );
      if (!recipientAccepted) {
        const rejection = (result.rejected ?? [])
          .map(extractEmailAddress)
          .filter(Boolean)
          .join(', ');
        throw new Error(
          rejection
            ? `Email provider rejected delivery to ${rejection}.`
            : `Email provider did not accept delivery to ${recipient}.`,
        );
      }

      return await updateDelivery(delivery.id, 'SENT', { messageId: result.messageId, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Email delivery failed.';
      await updateDelivery(delivery.id, 'FAILED', { error: message });
      const orderState = mode === 'approval'
        ? 'The PO remains in Draft and was not issued.'
        : 'The PO status was not changed by this email attempt.';
      await notificationService.notifyRoles({
        roles: ['admin', 'store-manager'],
        type: 'WORKFLOW',
        title: `PO email delivery failed (${po.poNumber})`,
        message: `Email attempt ${attempt} for ${po.poNumber} to ${recipient || 'the vendor'} failed. ${orderState} Error: ${message}`,
        resource: 'PurchaseOrder',
        resourceId: id,
        href: `/procurement/purchase-orders/${id}`,
        priority: 'HIGH',
        metadata: { event: 'purchase_order_email_failed', attempt, recipient, error: message },
      }).catch(() => undefined);
      throw error;
    } finally {
      closeTransport?.();
    }
  }
}

export const purchaseOrderEmailService = new PurchaseOrderEmailService();
