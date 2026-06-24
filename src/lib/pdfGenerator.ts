/**
 * PDF Quote & Invoice Generator — client-side via jsPDF + autoTable.
 * Generates branded A4 PDFs with itemized tables, payment details, and VAT.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Profile, Customer, Job, LineItem, Payment } from './db';
import { formatAmount } from './paymentHelpers';

interface QuotePDFData {
  profile: Profile;
  customer: Customer;
  job: Job;
  lineItems: LineItem[];
  total: number;
  validUntil: string;
}

interface InvoicePDFData {
  profile: Profile;
  customer: Customer;
  job: Job;
  lineItems: LineItem[];
  total: number;
  payments: Payment[];
  amountDue: number;
  dueDate?: string;
}

const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const HAIRLINE: [number, number, number] = [229, 231, 235];
const BRAND_BG: [number, number, number] = [249, 250, 251];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildHeader(doc: jsPDF, profile: Profile, docType: 'QUOTE' | 'INVOICE', docNumber: string, dateStr: string): void {
  // Business name
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.text(profile.business_name || profile.full_name, 14, 20);

  // Contact info
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  if (profile.phone) doc.text(profile.phone, 14, 26);
  if (profile.business_name) doc.text(profile.full_name, 14, 30);

  // Document type + number (right-aligned)
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...INK);
  doc.text(docType, 196, 20, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(docNumber, 196, 26, { align: 'right' });
  doc.text(dateStr, 196, 30, { align: 'right' });

  // Hairline
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.5);
  doc.line(14, 36, 196, 36);
}

function buildCustomerBlock(doc: jsPDF, customer: Customer, startY: number): number {
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MUTED);
  doc.text('BILL TO', 14, startY);

  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(customer.name, 14, startY + 6);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  let y = startY + 12;
  if (customer.address) {
    const lines = doc.splitTextToSize(customer.address, 80);
    doc.text(lines, 14, y);
    y += lines.length * 5;
  }
  if (customer.phone) {
    doc.text(customer.phone, 14, y);
    y += 5;
  }
  return y + 4;
}

function buildFooter(doc: jsPDF, profile: Profile): void {
  const pageHeight = doc.internal.pageSize.height;
  doc.setDrawColor(...HAIRLINE);
  doc.line(14, pageHeight - 24, 196, pageHeight - 24);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text('Powered by Buildlogg', 14, pageHeight - 18);
  doc.text('buildlogg.com', 196, pageHeight - 18, { align: 'right' });

  if (profile.terms_and_conditions) {
    doc.setFontSize(7);
    const lines = doc.splitTextToSize(profile.terms_and_conditions, 182);
    doc.text(lines, 14, pageHeight - 14);
  }
}

export function generateQuotePDF(data: QuotePDFData): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const { profile, customer, job, lineItems, total, validUntil } = data;

  buildHeader(doc, profile, 'QUOTE', job.job_number || 'QUOTE', `Date: ${formatDate(new Date().toISOString())}`);

  let y = buildCustomerBlock(doc, customer, 42);

  // Valid until
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(`Valid until: ${formatDate(validUntil)}`, 196, 42, { align: 'right' });

  // Line items table
  const rows = lineItems.map((item) => [item.description, `£${formatAmount(item.amount)}`]);

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Amount']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9, textColor: INK },
    alternateRowStyles: { fillColor: BRAND_BG },
    columnStyles: { 0: { cellWidth: 140 }, 1: { cellWidth: 42, halign: 'right' } },
    margin: { left: 14, right: 14, bottom: 30 },
    showHead: 'everyPage',
  });

  // Total
  // @ts-expect-error — autoTable adds lastAutoTable to doc
  const afterTableY = doc.lastAutoTable.finalY + 4;

  if (profile.vat_registered && profile.vat_number) {
    const vat = total * 0.2;
    autoTable(doc, {
      startY: afterTableY,
      body: [
        ['Subtotal', `£${formatAmount(total)}`],
        ['VAT (20%)', `£${formatAmount(vat)}`],
        ['Total', `£${formatAmount(total + vat)}`],
      ],
      theme: 'plain',
      bodyStyles: { fontSize: 10, textColor: INK },
      columnStyles: { 0: { cellWidth: 140, halign: 'right', fontStyle: 'bold' }, 1: { cellWidth: 42, halign: 'right', fontStyle: 'bold' } },
      margin: { left: 14, right: 14, bottom: 30 },
    });
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    // @ts-expect-error
    doc.text(`VAT No: ${profile.vat_number}`, 196, doc.lastAutoTable.finalY + 4, { align: 'right' });
  } else {
    autoTable(doc, {
      startY: afterTableY,
      body: [['Total', `£${formatAmount(total)}`]],
      theme: 'plain',
      bodyStyles: { fontSize: 12, textColor: INK, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 140, halign: 'right' }, 1: { cellWidth: 42, halign: 'right' } },
      margin: { left: 14, right: 14, bottom: 30 },
    });
  }

  // Payment terms
  // @ts-expect-error
  const termsY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  const termsLabel = job.payment_terms === 'deposit'
    ? `Payment: ${job.deposit_pct || 20}% deposit on booking, balance on completion`
    : job.payment_terms === 'invoice'
    ? 'Payment: Invoice due within 7 days'
    : 'Payment: Due on completion';
  doc.text(termsLabel, 14, termsY);

  buildFooter(doc, profile);
  return doc.output('blob');
}

export function generateInvoicePDF(data: InvoicePDFData): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const { profile, customer, job, lineItems, payments, amountDue, dueDate } = data;

  buildHeader(doc, profile, 'INVOICE', job.invoice_number || job.job_number || 'INVOICE', `Date: ${formatDate(new Date().toISOString())}`);

  let y = buildCustomerBlock(doc, customer, 42);

  // Due date
  if (dueDate) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(`Due: ${formatDate(dueDate)}`, 196, 42, { align: 'right' });
  }

  // Line items
  const rows = lineItems.map((item) => [item.description, `£${formatAmount(item.amount)}`]);

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Amount']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9, textColor: INK },
    alternateRowStyles: { fillColor: BRAND_BG },
    columnStyles: { 0: { cellWidth: 140 }, 1: { cellWidth: 42, halign: 'right' } },
    margin: { left: 14, right: 14, bottom: 30 },
    showHead: 'everyPage',
  });

  // @ts-expect-error
  let afterTableY = doc.lastAutoTable.finalY + 4;

  // Payments received
  if (payments.length > 0) {
    const payRows = payments.map((p) => [
      `${p.type === 'deposit' ? 'Deposit' : 'Payment'} — ${p.method.replace(/_/g, ' ')}`,
      `£${formatAmount(p.amount)}`,
    ]);
    autoTable(doc, {
      startY: afterTableY,
      head: [['Payments received', '']],
      body: payRows,
      theme: 'plain',
      headStyles: { fillColor: BRAND_BG, textColor: MUTED, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9, textColor: INK },
      columnStyles: { 0: { cellWidth: 140 }, 1: { cellWidth: 42, halign: 'right' } },
      margin: { left: 14, right: 14, bottom: 30 },
    });
    // @ts-expect-error
    afterTableY = doc.lastAutoTable.finalY + 4;
  }

  // Amount due
  autoTable(doc, {
    startY: afterTableY,
    body: [['Amount due', `£${formatAmount(amountDue)}`]],
    theme: 'plain',
    bodyStyles: { fontSize: 12, textColor: INK, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 140, halign: 'right' }, 1: { cellWidth: 42, halign: 'right' } },
    margin: { left: 14, right: 14, bottom: 30 },
  });

  // Bank details
  if (profile.bank_name || profile.bank_account_number) {
    // @ts-expect-error
    const bankY = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MUTED);
    doc.text('PAYMENT DETAILS', 14, bankY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...INK);
    doc.setFontSize(9);
    let by = bankY + 5;
    if (profile.bank_name) { doc.text(`Bank: ${profile.bank_name}`, 14, by); by += 5; }
    if (profile.bank_account_name) { doc.text(`Account: ${profile.bank_account_name}`, 14, by); by += 5; }
    if (profile.bank_sort_code) { doc.text(`Sort code: ${profile.bank_sort_code}`, 14, by); by += 5; }
    if (profile.bank_account_number) { doc.text(`Account no: ${profile.bank_account_number}`, 14, by); by += 5; }
  }

  buildFooter(doc, profile);
  return doc.output('blob');
}
