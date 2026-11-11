import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../database';
import { config } from '../../../config';
import { NotFoundError } from '../../../common/errors/AppError';
import { notificationService } from '../../notifications/notification.service';

const JOB_WORK_EMAIL_ORDER_INCLUDE = {
  vendor: true,
  product: { include: { uom: true } },
  targetUom: true,
  deliveryLocation: true,
  lines: {
    include: { material: { include: { uom: true } }, product: { include: { uom: true } }, uom: true },
    orderBy: { createdAt: 'asc' as const },
  },
  purchaseOrder: true,
  createdBy: true,
} satisfies Prisma.JobWorkOrderInclude;

export type EmailJobWorkOrder = Prisma.JobWorkOrderGetPayload<{
  include: typeof JOB_WORK_EMAIL_ORDER_INCLUDE;
}>;

async function loadEmailJobWorkOrder(id: string): Promise<EmailJobWorkOrder | null> {
  return prisma.jobWorkOrder.findUnique({
    where: { id },
    include: JOB_WORK_EMAIL_ORDER_INCLUDE,
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

function resolveLogoPath(): string | undefined {
  // The image logo is retired; emails use the plain-text wordmark fallback.
  return undefined;
}

function getVendorDisplay(vendor: EmailJobWorkOrder['vendor']) {
  let addr: Record<string, unknown> | undefined;
  if (vendor.address && typeof vendor.address === 'object') {
    addr = vendor.address as Record<string, unknown>;
  } else if (typeof vendor.address === 'string') {
    try {
      addr = JSON.parse(vendor.address);
    } catch {
      addr = { street: vendor.address };
    }
  }

  const street = String(addr?.street || addr?.addressLine1 || '').trim();
  const city = String(addr?.city || '').trim();
  const state = String(addr?.state || '').trim();
  const postalCode = String(addr?.postalCode || addr?.pincode || '').trim();
  const country = String(addr?.country || 'India').trim();
  const stateCode = String(addr?.stateCode || '').trim();

  const formattedAddressLines = [
    street,
    [city, state, postalCode].filter(Boolean).join(', '),
    country,
  ].filter(Boolean);

  return {
    name: vendor.legalName || vendor.name,
    addressLines: formattedAddressLines,
    phone: vendor.contactPhone || '—',
    email: vendor.contactEmail || '—',
    gstin: vendor.taxNumber || '—',
    state: state || '—',
    stateCode: stateCode || '—',
  };
}

function extractEmailAddress(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && 'address' in value) {
    const candidate = value['address'];
    if (typeof candidate === 'string') return candidate.trim();
  }
  return '';
}

function htmlEscape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);
}

async function makePdf(order: EmailJobWorkOrder): Promise<Buffer> {
  const vendorInfo = getVendorDisplay(order.vendor);
  const lines = order.lines || [];

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 36,
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageX = 36;
    const pageWidth = 523;

    // Header Title
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#064f7d').text('PLINTH', pageX, 40);
    doc.fontSize(8).font('Helvetica').fillColor('#475569').text('Job Work & Outsourced Processing Order', pageX, 58);

    doc.rect(pageX, 70, pageWidth, 2).fill('#f4b42a');

    // Vendor and Order Info
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Outsource Partner:', pageX, 85);
    doc.fontSize(9).font('Helvetica').fillColor('#334155').text(vendorInfo.name, pageX, 100);
    doc.text(vendorInfo.addressLines.join(', ') || 'Address on record', pageX, 114, { width: 250 });
    doc.text(`Contact: ${vendorInfo.phone} | ${vendorInfo.email}`, pageX, 138);

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Order Metadata:', pageX + 280, 85);
    doc.fontSize(9).font('Helvetica').fillColor('#334155').text(`Order No: ${order.orderNumber}`, pageX + 280, 100);
    doc.text(`Order Date: ${formatIndianDate(order.createdAt)}`, pageX + 280, 114);
    doc.text(`Status: ${order.status}`, pageX + 280, 128);
    if (order.purchaseOrder) {
      doc.text(`Linked PO: ${order.purchaseOrder.poNumber}`, pageX + 280, 142);
    }

    doc.rect(pageX, 160, pageWidth, 1).fill('#e2e8f0');

    // Target Output Specs
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#064f7d').text('Target Output Product & Processing Specs', pageX, 172);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a').text(`Product: ${order.product?.name || 'Custom Assembly'} (${order.product?.sku || 'N/A'})`, pageX, 188);
    doc.font('Helvetica').fillColor('#334155').text(`Target Quantity: ${order.targetQuantity} ${order.targetUom?.code || 'PCS'}`, pageX, 202);
    doc.text(`Nature of Processing: ${order.natureOfProcessing || 'Standard Outsourced Machining & Processing'}`, pageX, 216);
    doc.text(`Expected Scrap Allowance: ${order.expectedScrapRate}%`, pageX, 230);
    if (order.deliveryLocation) {
      doc.text(`Destination / Receiving Store: ${order.deliveryLocation.name} (${order.deliveryLocation.code})`, pageX, 244);
    }

    doc.rect(pageX, 265, pageWidth, 1).fill('#e2e8f0');

    // Allocated Raw Material Lines Table Header
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#064f7d').text('Allocated Raw Material (Deducted from Vendor Custody Deposit)', pageX, 275);
    const tableTop = 295;
    doc.rect(pageX, tableTop, pageWidth, 20).fill('#f1f5f9');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#0f172a');
    doc.text('Item Description', pageX + 8, tableTop + 6);
    doc.text('Required Qty', pageX + 240, tableTop + 6);
    doc.text('Allocated Qty', pageX + 320, tableTop + 6);
    doc.text('UOM', pageX + 410, tableTop + 6);

    let curY = tableTop + 24;
    for (const line of lines) {
      const itemName = line.material?.name || line.product?.name || 'Raw Material';
      const itemCode = line.material?.code || line.product?.sku || '';
      const uomCode = line.uom?.code || line.uom?.symbol || 'Units';

      doc.fontSize(8).font('Helvetica').fillColor('#1e293b');
      doc.text(`${itemName} ${itemCode ? `(${itemCode})` : ''}`, pageX + 8, curY, { width: 220 });
      doc.text(String(line.requiredQuantity), pageX + 240, curY);
      doc.font('Helvetica-Bold').fillColor('#064f7d').text(String(line.allocatedQuantity || line.requiredQuantity), pageX + 320, curY);
      doc.font('Helvetica').fillColor('#1e293b').text(uomCode, pageX + 410, curY);

      curY += 20;
    }

    if (order.notes) {
      curY += 10;
      doc.rect(pageX, curY, pageWidth, 1).fill('#e2e8f0');
      curY += 10;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#0f172a').text('Order Notes & Instructions:', pageX, curY);
      doc.font('Helvetica').fillColor('#475569').text(order.notes, pageX, curY + 12, { width: pageWidth });
    }

    // Footer
    doc.fontSize(7).font('Helvetica').fillColor('#94a3b8').text(
      'Goods dispatched and processed under Job Work regulations remain company property throughout vendor custody.',
      pageX,
      760,
      { align: 'center', width: pageWidth }
    );

    doc.end();
  });
}

export class JobWorkOrderEmailService {
  async getDocument(id: string): Promise<{ filename: string; content: Buffer }> {
    const order = await loadEmailJobWorkOrder(id);
    if (!order) throw new NotFoundError(`JobWorkOrder [${id}] not found.`);
    return { filename: `${order.orderNumber}.pdf`, content: await makePdf(order) };
  }

  async send(id: string): Promise<{ recipient: string; messageId: string | null }> {
    const order = await loadEmailJobWorkOrder(id);
    if (!order) throw new NotFoundError(`JobWorkOrder [${id}] not found.`);

    const recipient = typeof order.vendor.contactEmail === 'string' ? order.vendor.contactEmail.trim() : '';
    const subject = `Job Work Order ${order.orderNumber} — Plinth`;

    let closeTransport: (() => void) | undefined;
    try {
      if (!recipient) {
        console.warn(`[JobWorkOrderEmailService] No contact email configured for vendor ${order.vendor.name} (${order.vendor.code}).`);
        return { recipient: '', messageId: null };
      }

      if (!config.email.enabled) {
        console.warn('[JobWorkOrderEmailService] SMTP email delivery is not enabled or configured.');
        return { recipient, messageId: null };
      }

      const pdf = await makePdf(order);
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

      const orderDateFormatted = formatIndianDate(order.createdAt);

      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Job Work Order ${htmlEscape(order.orderNumber)}</title>
</head>
<body style="margin:0;padding:24px 0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05)">
    <table style="width:100%;border-collapse:collapse;border-bottom:3px solid #f4b42a;background:#ffffff">
      <tr>
        <td style="padding:18px 24px">${logoMarkup}</td>
        <td style="padding:18px 24px;text-align:right">
          <span style="display:inline-block;padding:4px 10px;background:#064f7d;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:1px;border-radius:4px;text-transform:uppercase">Job Work Order</span>
        </td>
      </tr>
    </table>
    
    <div style="padding:26px 28px">
      <h1 style="margin:0 0 4px;font-size:20px;font-weight:800;color:#0f172a">
        ${htmlEscape(order.orderNumber)}
      </h1>
      <p style="margin:0 0 18px;font-size:13px;color:#64748b">Dated: ${orderDateFormatted}</p>

      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#334155">
        Dear <strong>${htmlEscape(order.vendor.legalName || order.vendor.name)}</strong>,
      </p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#334155">
        A new <strong>Job Work / Outsourced Processing Order</strong> has been created with your company by <strong>Plinth</strong>.
        Please review the processing requirements and raw material allocation summary below and in the attached official document.
      </p>

      <table style="width:100%;border-collapse:collapse;margin:18px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
        <tbody>
          <tr style="border-bottom:1px solid #e2e8f0">
            <td style="padding:9px 14px;font-size:12px;font-weight:600;color:#64748b;width:35%">Order Number</td>
            <td style="padding:9px 14px;font-size:13px;font-weight:700;color:#0f172a">${htmlEscape(order.orderNumber)}</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0">
            <td style="padding:9px 14px;font-size:12px;font-weight:600;color:#64748b">Target Output Product</td>
            <td style="padding:9px 14px;font-size:13px;font-weight:600;color:#0f172a">${htmlEscape(order.product?.name || 'Custom Product')} (${htmlEscape(order.product?.sku || 'N/A')})</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0">
            <td style="padding:9px 14px;font-size:12px;font-weight:600;color:#64748b">Target Quantity</td>
            <td style="padding:9px 14px;font-size:13px;font-weight:600;color:#0f172a">${order.targetQuantity} ${htmlEscape(order.targetUom?.code || 'PCS')}</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0">
            <td style="padding:9px 14px;font-size:12px;font-weight:600;color:#64748b">Nature of Processing</td>
            <td style="padding:9px 14px;font-size:13px;color:#334155">${htmlEscape(order.natureOfProcessing || 'Standard Outsourced Machining')}</td>
          </tr>
          <tr>
            <td style="padding:9px 14px;font-size:12px;font-weight:600;color:#64748b">Destination / Receiving Plant</td>
            <td style="padding:9px 14px;font-size:13px;color:#334155">${htmlEscape(order.deliveryLocation?.name || 'Main Receiving Plant')}</td>
          </tr>
        </tbody>
      </table>

      <p style="margin:16px 0 20px;font-size:13px;line-height:1.6;color:#475569">
        The attached official PDF contains full processing specifications, material custody deposit allocations, and statutory notes.
      </p>

      <div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-top:20px">
        <p style="margin:0;font-size:12px;color:#94a3b8">Plinth Procurement &amp; Production Control</p>
      </div>
    </div>
  </div>
</body>
</html>`;

      const attachments: Array<{ filename: string; content?: Buffer; path?: string; contentType?: string; cid?: string }> = [
        { filename: `${order.orderNumber}.pdf`, content: pdf, contentType: 'application/pdf' },
      ];
      if (logo) attachments.push({ filename: 'plinth-logo.png', path: logo, cid: 'plinth-logo' });

      const result = await transporter.sendMail({
        from: { name: config.email.fromName, address: config.email.fromAddress },
        to: recipient,
        subject,
        html,
        attachments,
      });

      const recipientAccepted = (result.accepted ?? []).some(
        (acceptedAddress) => extractEmailAddress(acceptedAddress).toLowerCase() === recipient.toLowerCase()
      );
      if (!recipientAccepted) {
        const rejection = (result.rejected ?? [])
          .map(extractEmailAddress)
          .filter(Boolean)
          .join(', ');
        throw new Error(
          rejection
            ? `Email provider rejected delivery to ${rejection}.`
            : `Email provider did not accept delivery to ${recipient}.`
        );
      }

      return { recipient, messageId: result.messageId };
    } catch (error) {
      console.error(`[JobWorkOrderEmailService] Failed to send email for ${order.orderNumber}:`, error);
      await notificationService.notifyRoles({
        roles: ['admin', 'store-manager'],
        type: 'WORKFLOW',
        title: `Job Work email delivery failed (${order.orderNumber})`,
        message: `Email delivery for ${order.orderNumber} to ${recipient || 'the vendor'} encountered an error.`,
        resource: 'JobWorkOrder',
        resourceId: id,
        href: `/job-work/${id}`,
        priority: 'NORMAL',
      }).catch(() => undefined);
      return { recipient, messageId: null };
    } finally {
      closeTransport?.();
    }
  }
}

export const jobWorkOrderEmailService = new JobWorkOrderEmailService();
