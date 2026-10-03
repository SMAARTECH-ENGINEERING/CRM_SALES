import PDFDocument from 'pdfkit';

// Renders a quotation as an A4 PDF. Everything printed comes from its
// arguments: `quotation` (populated: company, contact, status) and `profile`
// (our own details, from the Company profile). No business text lives here.

const MARGIN = 50;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = PAGE_HEIGHT - MARGIN - 20;

const COLOR = { text: '#1f2933', muted: '#667085', line: '#d0d5dd', band: '#f2f4f7', accent: '#1d4ed8' };

// Table columns: [key, heading, width, align]. Widths add up to WIDTH.
const COLUMNS = [
  ['index', '#', 24, 'left'],
  ['item', 'Item', 193.28, 'left'],
  ['quantity', 'Qty', 56, 'right'],
  ['unitPrice', 'Unit price', 70, 'right'],
  ['discount', 'Disc %', 40, 'right'],
  ['tax', 'Tax %', 40, 'right'],
  ['total', 'Amount', 72, 'right'],
];
const CELL_PAD = 5;

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

const formatDate = (value) => (value ? dateFormat.format(new Date(value)) : '');
const present = (values) => values.filter(Boolean);

// "12 Main Road" / "Pune, Maharashtra 411001" / "India"
function addressLines(record) {
  return present([
    record.address,
    present([present([record.city, record.state]).join(', '), record.postalCode]).join(' '),
    record.country,
  ]);
}

function columnsWithX() {
  let x = MARGIN;
  return COLUMNS.map(([key, heading, width, align]) => {
    const column = { key, heading, width, align, x };
    x += width;
    return column;
  });
}

function rule(doc, y, color = COLOR.line) {
  doc.moveTo(MARGIN, y).lineTo(MARGIN + WIDTH, y).lineWidth(0.7).strokeColor(color).stroke();
}

function drawHeader(doc, quotation, profile) {
  const rightWidth = 190;
  const leftWidth = WIDTH - rightWidth - 20;
  const top = MARGIN;

  // Us, on the left.
  doc.font('Helvetica-Bold').fontSize(17).fillColor(COLOR.text).text(profile.name, MARGIN, top, { width: leftWidth });
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted);
  const details = present([
    profile.legalName && profile.legalName !== profile.name ? profile.legalName : null,
    ...addressLines(profile),
    present([profile.phone, profile.email]).join('  |  '),
    profile.website,
    present([profile.gstNumber && `GSTIN: ${profile.gstNumber}`, profile.panNumber && `PAN: ${profile.panNumber}`]).join(
      '  |  '
    ),
  ]);
  for (const line of details) doc.text(line, MARGIN, doc.y + 1, { width: leftWidth });
  const leftBottom = doc.y;

  // The document, on the right.
  const rightX = MARGIN + WIDTH - rightWidth;
  doc.font('Helvetica-Bold').fontSize(20).fillColor(COLOR.accent).text('QUOTATION', rightX, top, {
    width: rightWidth,
    align: 'right',
  });
  doc.moveDown(0.3);
  const facts = present([
    ['Number', quotation.quotationNumber],
    ['Date', formatDate(quotation.quotationDate)],
    quotation.validUntil && ['Valid until', formatDate(quotation.validUntil)],
  ]);
  for (const [label, value] of facts) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted).text(label, rightX, y, { width: 80, align: 'right' });
    doc.font('Helvetica-Bold').fillColor(COLOR.text).text(value, rightX + 85, y, { width: rightWidth - 85, align: 'right' });
  }

  const y = Math.max(leftBottom, doc.y) + 12;
  rule(doc, y);
  return y + 14;
}

function drawCustomer(doc, quotation, y) {
  const company = quotation.companyId;
  const contact = quotation.contactId;
  const half = WIDTH / 2 - 10;

  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR.muted).text('QUOTATION FOR', MARGIN, y);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.text).text(company?.name ?? '', MARGIN, doc.y + 3, { width: half });
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted);
  const lines = present([
    company?.legalName && company.legalName !== company.name ? company.legalName : null,
    ...(company ? addressLines(company) : []),
    company?.gstNumber && `GSTIN: ${company.gstNumber}`,
  ]);
  for (const line of lines) doc.text(line, MARGIN, doc.y + 1, { width: half });
  const leftBottom = doc.y;

  let rightBottom = y;
  if (contact) {
    const x = MARGIN + WIDTH / 2 + 10;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR.muted).text('ATTENTION', x, y);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.text).text(contact.fullName, x, doc.y + 3, { width: half });
    doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted);
    for (const line of present([contact.designation, contact.email, contact.phone])) {
      doc.text(line, x, doc.y + 1, { width: half });
    }
    rightBottom = doc.y;
  }
  return Math.max(leftBottom, rightBottom) + 16;
}

function drawTableHead(doc, columns, y) {
  const height = 20;
  doc.rect(MARGIN, y, WIDTH, height).fill(COLOR.band);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR.text);
  for (const column of columns) {
    doc.text(column.heading, column.x + CELL_PAD, y + 6, { width: column.width - CELL_PAD * 2, align: column.align });
  }
  return y + height;
}

function drawItems(doc, quotation, startY) {
  const columns = columnsWithX();
  const itemColumn = columns.find((column) => column.key === 'item');
  const itemWidth = itemColumn.width - CELL_PAD * 2;
  let y = drawTableHead(doc, columns, startY);

  quotation.items.forEach((item, index) => {
    const secondary = present([item.sku, item.description]).join(' - ');
    doc.font('Helvetica-Bold').fontSize(9);
    const nameHeight = doc.heightOfString(item.name, { width: itemWidth });
    doc.font('Helvetica').fontSize(8);
    const secondaryHeight = secondary ? doc.heightOfString(secondary, { width: itemWidth }) + 2 : 0;
    const height = nameHeight + secondaryHeight + 12;

    if (y + height > BOTTOM) {
      doc.addPage();
      y = drawTableHead(doc, columns, MARGIN);
    }

    const textY = y + 6;
    const cells = {
      index: String(index + 1),
      quantity: present([plain.format(item.quantity), item.unit]).join(' '),
      unitPrice: money.format(item.unitPrice),
      discount: item.discountPercent ? plain.format(item.discountPercent) : '-',
      tax: plain.format(item.taxRate ?? 0),
      total: money.format(item.total),
    };
    doc.font('Helvetica').fontSize(9).fillColor(COLOR.text);
    for (const column of columns) {
      if (column.key === 'item') continue;
      doc.text(cells[column.key], column.x + CELL_PAD, textY, { width: column.width - CELL_PAD * 2, align: column.align });
    }
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.text).text(item.name, itemColumn.x + CELL_PAD, textY, { width: itemWidth });
    if (secondary) {
      doc.font('Helvetica').fontSize(8).fillColor(COLOR.muted).text(secondary, itemColumn.x + CELL_PAD, doc.y + 2, { width: itemWidth });
    }

    y += height;
    rule(doc, y);
  });

  return y + 12;
}

function drawTotals(doc, quotation, profile, startY) {
  const labelWidth = 120;
  const valueWidth = 100;
  const x = MARGIN + WIDTH - labelWidth - valueWidth;
  const rows = present([
    ['Subtotal', money.format(quotation.subtotal)],
    quotation.discount > 0 && [`Discount (${plain.format(quotation.discountPercent)}%)`, `- ${money.format(quotation.discount)}`],
    ['Tax', money.format(quotation.tax)],
  ]);

  let y = startY;
  if (y + rows.length * 16 + 34 > BOTTOM) {
    doc.addPage();
    y = MARGIN;
  }

  for (const [label, value] of rows) {
    doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted).text(label, x, y, { width: labelWidth, align: 'right' });
    doc.fillColor(COLOR.text).text(value, x + labelWidth, y, { width: valueWidth - CELL_PAD, align: 'right' });
    y += 16;
  }

  doc.rect(x, y, labelWidth + valueWidth, 24).fill(COLOR.band);
  const label = profile.currency ? `Grand total (${profile.currency})` : 'Grand total';
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLOR.text).text(label, x, y + 7, { width: labelWidth, align: 'right' });
  doc.text(money.format(quotation.grandTotal), x + labelWidth, y + 7, { width: valueWidth - CELL_PAD, align: 'right' });
  return y + 24 + 18;
}

function drawTextBlock(doc, title, body, startY) {
  if (!body) return startY;
  let y = startY;
  doc.font('Helvetica').fontSize(9);
  // Keep the heading with at least the start of its text.
  if (y + 40 > BOTTOM) {
    doc.addPage();
    y = MARGIN;
  }
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR.muted).text(title.toUpperCase(), MARGIN, y);
  // Long text flows onto following pages by itself.
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.text).text(body, MARGIN, doc.y + 3, { width: WIDTH, lineGap: 1.5 });
  return doc.y + 14;
}

function drawFooters(doc, quotation, profile) {
  const { start, count } = doc.bufferedPageRange();
  for (let page = start; page < start + count; page += 1) {
    doc.switchToPage(page);
    // The footer sits inside the bottom margin; without this pdfkit would
    // start a new page for it.
    doc.page.margins.bottom = 0;
    const y = PAGE_HEIGHT - MARGIN - 4;
    rule(doc, y - 6);
    doc.font('Helvetica').fontSize(8).fillColor(COLOR.muted);
    doc.text(`${profile.name}  |  ${quotation.quotationNumber}`, MARGIN, y, { width: WIDTH / 2, lineBreak: false });
    doc.text(`Page ${page - start + 1} of ${count}`, MARGIN + WIDTH / 2, y, {
      width: WIDTH / 2,
      align: 'right',
      lineBreak: false,
    });
  }
}

export function buildQuotationPdf(quotation, profile) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN + 20 },
      bufferPages: true,
      info: {
        Title: `Quotation ${quotation.quotationNumber}`,
        Author: profile.name,
        Subject: quotation.companyId?.name ? `Quotation for ${quotation.companyId.name}` : 'Quotation',
      },
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let y = drawHeader(doc, quotation, profile);
    y = drawCustomer(doc, quotation, y);
    y = drawItems(doc, quotation, y);
    y = drawTotals(doc, quotation, profile, y);
    y = drawTextBlock(doc, 'Notes', quotation.notes, y);
    y = drawTextBlock(doc, 'Terms and conditions', quotation.termsAndConditions, y);
    drawTextBlock(doc, 'Payment details', profile.bankDetails, y);
    drawFooters(doc, quotation, profile);

    doc.end();
  });
}
