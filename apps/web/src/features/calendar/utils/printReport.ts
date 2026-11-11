import { DayOperationalSummary } from '../types';

const money = (value: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);

const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function printDayOperationsReport(summary: DayOperationalSummary, dateStr: string) {
  const formattedDate = new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const generatedAt = new Date().toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const quotaPct = summary.plannedOutputUnits > 0
    ? Math.round((summary.actualOutputUnits / summary.plannedOutputUnits) * 100)
    : 0;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Plinth Operations Manifest - ${summary.dateStr}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 15mm 15mm 15mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 11px;
      line-height: 1.4;
    }
    .header {
      border-bottom: 2px solid #004a80;
      padding-bottom: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .brand-title {
      font-size: 20px;
      font-weight: 800;
      color: #004a80;
      letter-spacing: -0.5px;
      margin: 0;
    }
    .brand-subtitle {
      font-size: 10px;
      color: #64748b;
      margin-top: 2px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .report-meta {
      text-align: right;
      font-size: 10px;
      color: #475569;
    }
    .report-title-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .report-date {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
    }
    .lead-badge {
      font-size: 10px;
      color: #334155;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
      margin-bottom: 18px;
    }
    .kpi-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 10px;
      background: #ffffff;
    }
    .kpi-label {
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 4px;
    }
    .kpi-val {
      font-size: 13px;
      font-weight: 800;
      color: #004a80;
    }
    .kpi-sub {
      font-size: 9px;
      color: #64748b;
      margin-top: 2px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: #004a80;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
      margin-top: 14px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 10px;
    }
    th {
      background: #f1f5f9;
      color: #334155;
      text-align: left;
      padding: 5px 8px;
      font-weight: 700;
      border: 1px solid #cbd5e1;
      font-size: 9px;
      text-transform: uppercase;
    }
    td {
      padding: 5px 8px;
      border: 1px solid #e2e8f0;
      color: #1e293b;
    }
    tr:nth-child(even) td {
      background: #f8fafc;
    }
    .badge {
      display: inline-block;
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-success { background: #dcfce7; color: #15803d; }
    .badge-info { background: #e0f2fe; color: #0369a1; }
    .badge-warning { background: #fef3c7; color: #b45309; }
    .badge-neutral { background: #f1f5f9; color: #475569; }
    .footer-sign {
      margin-top: 24px;
      border-top: 1px solid #cbd5e1;
      padding-top: 12px;
      display: flex;
      justify-content: space-between;
      page-break-inside: avoid;
    }
    .sign-block {
      width: 45%;
      border-top: 1px dashed #94a3b8;
      padding-top: 6px;
      margin-top: 28px;
      font-size: 9.5px;
      color: #64748b;
    }
    .empty-msg {
      padding: 10px;
      color: #94a3b8;
      font-style: italic;
      text-align: center;
      border: 1px dashed #e2e8f0;
      border-radius: 4px;
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand-title">PLINTH</div>
      <div class="brand-subtitle">Enterprise Operations & Production Manifest</div>
    </div>
    <div class="report-meta">
      <div><strong>Report Code:</strong> OPS-MNF-${summary.dateStr.replace(/-/g, '')}</div>
      <div><strong>Generated:</strong> ${generatedAt}</div>
      <div><strong>Classification:</strong> Internal Operations Only</div>
    </div>
  </div>

  <div class="report-title-box">
    <div>
      <span class="report-date">${formattedDate}</span>
    </div>
    <div class="lead-badge">
      <strong>Shift Lead:</strong> ${summary.shiftSupervisor || 'Operations Lead'} | <strong>Plant Utilization:</strong> ${summary.plantUtilizationPct}%
    </div>
  </div>

  <!-- 5 Pillar KPI Header -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Production Yield</div>
      <div class="kpi-val">${number.format(summary.actualOutputUnits)} <span style="font-size:9px;font-weight:normal;">/ ${number.format(summary.plannedOutputUnits)}</span></div>
      <div class="kpi-sub">${quotaPct}% Quota Achieved</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Sales Bookings</div>
      <div class="kpi-val">${money(summary.ordersTotalValue)}</div>
      <div class="kpi-sub">${summary.ordersCount} Confirmed Orders</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Inbound GRNs</div>
      <div class="kpi-val">${summary.inboundReceipts.length} Lots</div>
      <div class="kpi-sub">${summary.inboundReceipts.filter(i => i.status === 'cleared').length} QA Cleared</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Outbound Dispatches</div>
      <div class="kpi-val">${number.format(summary.dispatchedWeightKg)} kg</div>
      <div class="kpi-sub">${summary.dispatchesCount} Gate Manifests</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Finance & Accounts</div>
      <div class="kpi-val">${money(summary.financeTotalValue)}</div>
      <div class="kpi-sub">${summary.financeCount} Debit Notes</div>
    </div>
  </div>

  <!-- Section 1: Production Runs -->
  <div class="section-title">
    <span>1. Production & Manufacturing Batches (${summary.productionEvents.length})</span>
  </div>
  ${summary.productionEvents.length === 0 ? '<div class="empty-msg">No manufacturing batches scheduled for this date.</div>' : `
  <table>
    <thead>
      <tr>
        <th style="width: 14%;">Plan Code</th>
        <th style="width: 26%;">Product / Item Name</th>
        <th style="width: 16%;">Work Center Line</th>
        <th style="width: 16%;">Shift / Time</th>
        <th style="width: 14%;">Target / Actual</th>
        <th style="width: 14%;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${summary.productionEvents.map(p => `
        <tr>
          <td><strong>${p.code}</strong></td>
          <td>${p.productName} <br/><span style="color:#64748b;font-size:8.5px;">SKU: ${p.sku} | ${p.bomCode}</span></td>
          <td>${p.line}</td>
          <td>${p.shift}</td>
          <td>${number.format(p.completedQuantity)} / ${number.format(p.targetQuantity)} ${p.unit} (${p.progressPct}%)</td>
          <td><span class="badge ${p.status === 'completed' ? 'badge-success' : p.status === 'delayed' ? 'badge-warning' : 'badge-info'}">${p.status.toUpperCase()}</span></td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  `}

  <!-- Section 2: Sales Orders -->
  <div class="section-title">
    <span>2. Sales & Commercial Orders (${summary.salesOrders.length})</span>
  </div>
  ${summary.salesOrders.length === 0 ? '<div class="empty-msg">No sales orders booked for fulfillment on this date.</div>' : `
  <table>
    <thead>
      <tr>
        <th style="width: 16%;">Order Number</th>
        <th style="width: 26%;">Customer / Client</th>
        <th style="width: 24%;">Destination</th>
        <th style="width: 12%;">Items</th>
        <th style="width: 12%;">Value (INR)</th>
        <th style="width: 10%;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${summary.salesOrders.map(o => `
        <tr>
          <td><strong>${o.orderNumber}</strong></td>
          <td>${o.clientName} <span class="badge badge-neutral">${o.clientTier}</span></td>
          <td>${o.destination}</td>
          <td>${o.itemsCount} line items</td>
          <td><strong>${money(o.totalValue, o.currency)}</strong></td>
          <td><span class="badge ${o.status === 'dispatched' ? 'badge-success' : 'badge-info'}">${o.status.toUpperCase()}</span></td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  `}

  <!-- Section 3: Goods Inward (GRN) -->
  <div class="section-title">
    <span>3. Inbound Goods Receipts & Quality Inspections (${summary.inboundReceipts.length})</span>
  </div>
  ${summary.inboundReceipts.length === 0 ? '<div class="empty-msg">No inbound vendor receipts recorded for this date.</div>' : `
  <table>
    <thead>
      <tr>
        <th style="width: 16%;">PO Reference</th>
        <th style="width: 26%;">Vendor / Supplier</th>
        <th style="width: 26%;">Material Description</th>
        <th style="width: 12%;">Quantity</th>
        <th style="width: 10%;">Dock</th>
        <th style="width: 10%;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${summary.inboundReceipts.map(i => `
        <tr>
          <td><strong>${i.poNumber}</strong></td>
          <td>${i.vendorName}</td>
          <td>${i.materialName}</td>
          <td>${i.quantity} ${i.unit}</td>
          <td>${i.dockNumber}</td>
          <td><span class="badge ${i.status === 'cleared' ? 'badge-success' : 'badge-neutral'}">${i.status.toUpperCase()}</span></td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  `}

  <!-- Section 4: Dispatches -->
  <div class="section-title">
    <span>4. Outbound Logistics & Material Movement (${summary.dispatches.length})</span>
  </div>
  ${summary.dispatches.length === 0 ? '<div class="empty-msg">No freight manifests cleared for dispatch on this date.</div>' : `
  <table>
    <thead>
      <tr>
        <th style="width: 16%;">Manifest #</th>
        <th style="width: 24%;">Carrier / Logistics</th>
        <th style="width: 20%;">Vehicle & Driver</th>
        <th style="width: 20%;">Destination</th>
        <th style="width: 10%;">Weight</th>
        <th style="width: 10%;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${summary.dispatches.map(d => `
        <tr>
          <td><strong>${d.manifestNumber}</strong></td>
          <td>${d.carrierName}</td>
          <td>${d.vehicleNumber} <br/><span style="color:#64748b;font-size:8px;">${d.driverName}</span></td>
          <td>${d.destination}</td>
          <td>${d.totalWeightKg} kg</td>
          <td><span class="badge ${d.status === 'delivered' ? 'badge-success' : 'badge-info'}">${d.status.toUpperCase()}</span></td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  `}

  <!-- Section 5: Finance & Debit Notes -->
  ${summary.financeEvents.length > 0 ? `
  <div class="section-title">
    <span>5. Finance & Accounts Debit Notes (${summary.financeEvents.length})</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 18%;">Debit Note #</th>
        <th style="width: 26%;">Vendor / Entity</th>
        <th style="width: 32%;">Reason / Description</th>
        <th style="width: 12%;">Amount</th>
        <th style="width: 12%;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${summary.financeEvents.map(f => `
        <tr>
          <td><strong>${f.debitNoteNumber}</strong></td>
          <td>${f.vendorName}</td>
          <td>${f.reason}</td>
          <td><strong>${money(f.totalAmount, f.currency)}</strong></td>
          <td><span class="badge ${f.status === 'APPROVED' ? 'badge-success' : 'badge-neutral'}">${f.status}</span></td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}

  <!-- Section 6: Chronological Audit Timeline -->
  ${summary.timeline.length > 0 ? `
  <div class="section-title">
    <span>6. Daily Operational Audit Log (${summary.timeline.length} Events)</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 12%;">Time</th>
        <th style="width: 15%;">Domain</th>
        <th style="width: 28%;">Event Title</th>
        <th style="width: 30%;">Description</th>
        <th style="width: 15%;">Recorded By</th>
      </tr>
    </thead>
    <tbody>
      ${summary.timeline.map(t => `
        <tr>
          <td><strong>${t.time}</strong></td>
          <td><span class="badge badge-neutral">${t.category.toUpperCase()}</span></td>
          <td><strong>${t.title}</strong></td>
          <td>${t.description}</td>
          <td>${t.actor}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}

  <div class="footer-sign">
    <div class="sign-block">
      <strong>Prepared By:</strong> ${summary.shiftSupervisor || 'Operations Lead'}<br/>
      Date & Signature: _______________________
    </div>
    <div class="sign-block" style="text-align: right;">
      <strong>Plant General Manager Approval:</strong><br/>
      Date & Signature: _______________________
    </div>
  </div>
</body>
</html>
`;

  // Create an iframe to print cleanly without breaking the main app DOM
  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = '0';
  document.body.appendChild(printFrame);

  const doc = printFrame.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(htmlContent);
    doc.close();
    printFrame.contentWindow?.focus();
    setTimeout(() => {
      printFrame.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(printFrame);
      }, 2000);
    }, 400);
  }
}
