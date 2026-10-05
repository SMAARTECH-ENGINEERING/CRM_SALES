# Documents, PDF and Excel tools

Everything the CRM does with files: keeping them against records, versions,
types and statuses, viewing, printing, the PDF editor, the spreadsheet editor,
and converting between PDF and Excel. All editing and converting happens **in
the browser**; the API stores files and versions and checks who may do what.

- [What is where](#what-is-where)
- [Documents](#documents)
- [Viewing and printing](#viewing-and-printing)
- [PDF editor](#pdf-editor)
- [Spreadsheet editor](#spreadsheet-editor)
- [PDF to Excel](#pdf-to-excel)
- [Excel to PDF](#excel-to-pdf)
- [Quotation PDFs](#quotation-pdfs)
- [Permissions](#permissions)
- [API](#api)
- [Limits - what it cannot do](#limits---what-it-cannot-do)
- [Code](#code)

## What is where

| Screen | Address | What it is for |
| ------ | ------- | -------------- |
| Documents | `/documents` | Every document you may see: search, filter, upload (button, or drop files anywhere on the page) |
| A document | `/documents/:id` | View it (PDF, spreadsheet, Word, picture, text), print, download, earlier versions (`?version=N`) |
| Edit | `/documents/:id/edit` | The PDF editor or the spreadsheet editor, depending on the file |
| Convert to Excel | `/documents/:id/to-excel` | The tables of a PDF as a spreadsheet |
| Convert to PDF | `/documents/:id/to-pdf` | A spreadsheet or picture as a PDF |
| Edit a quotation's PDF | `/quotations/:id/edit-pdf` | The quotation's PDF in the editor, attached to the quotation when saved |
| A record's Documents tab | companies, quotations, projects, ... | That record's documents, with upload |
| Dashboard | `/` | **Recent documents** widget |
| Settings → Lists | `/settings` | **Document types** and **Document statuses** |

Every document's **⋮** menu has: Open, Edit PDF / Edit spreadsheet, Convert to
Excel / Convert to PDF, Download, Print, Rename / type / status, Versions,
Delete - each shown only when the file allows it and you may do it.

## Documents

A document belongs to one record: a company, contact, lead, opportunity,
quotation, order, customer, project, task, ticket, contract or payment. It also
has:

| | |
| - | - |
| **Type** | From the administrator's list (seeded: Quotation, Purchase Order, Technical Specification, BOQ, Drawing, Installation Report, Commissioning Report, AMC Document, Invoice, Other). Optional |
| **Status** | From the administrator's list; each status means *draft*, *final* or *archived*. New documents get the default status (seeded: Draft) |
| **Version** | Starts at 1. Saving an edited file, a converted file or uploading a new one adds a version; **the file it replaces is kept**. Restoring an earlier version makes a new version too, so nothing is ever lost |
| **Company, record name** | Kept with the document so it can be found by customer and by record number |

**Finding documents.** Search looks in the file name, the record's number and
name, and its company's name - `QUO-000018`, `Lotus`, `boq`. Filters: kind of
file (PDF, Excel / CSV, Word, images, other), type, status, company, who
uploaded it, and when it was last changed. Global search (Ctrl+K) finds
documents too.

**Uploading.** On the Documents page: **Upload** (or drop files on the page),
choose the record with the search box - companies, leads, quotations, orders,
projects, tickets, contracts - then the type and status. On a record's
Documents tab the record is already known. What may be uploaded (types, size,
how many at once) is set in Settings → Application → Documents; the API checks
every file's content against its type and refuses programs and web pages.

## Viewing and printing

| File | Shown as |
| ---- | -------- |
| PDF | Pages with thumbnails, page navigation, zoom (fit width, fit page, 50-300%) |
| Excel (.xlsx, .xls), CSV | The spreadsheet, every sheet, with its formatting (read-only; **Edit** to change it) |
| Word (.docx) | Text, headings, lists, tables and pictures. Page layout, headers and footers are not shown. Old `.doc` files cannot be shown |
| Pictures | The picture; click to zoom |
| Text | The text |

**Print** opens a preview with: which pages (all, the current one, or a range
like `1-3, 5`), copies and collation, paper (as the document, A4, A3, Letter,
Legal), orientation, margins, scaling (fit, actual size, custom %), a header,
a footer and page numbers. Spreadsheets add: which sheets, fit to width or to
one page, gridlines, and top rows repeated on every page. **Print** then opens
the browser's print dialog, which chooses the printer; **Download PDF** saves
exactly what would be printed.

## PDF editor

Open a PDF and choose **Edit** (or **Edit PDF** in the ⋮ menu). The editor
works on a copy in the browser; nothing changes until you save.

| Tool | Key | |
| ---- | --- | - |
| Select and move | V | Click to select; drag to move; corner handles resize; the round handle above rotates (Shift: 15° steps). Arrow keys nudge (Shift: 10 pt) |
| Add text | T | Click and type. Font (Helvetica/Arial, Times, Courier), size, bold, italic, underline, alignment, colour, opacity, rotation. The box grows with the text, or give it a width to wrap. Drag the round corner handle to make the text bigger or smaller |
| Replace text on the page | E | Click a word or line of the PDF: it is covered by a box in the page's colour and the same text appears on top, ready to change, move and resize. See [limits](#limits---what-it-cannot-do) |
| Rectangle, ellipse, line, arrow | R, O, L, A | Drag. Line colour and width, fill |
| Draw | D | Freehand, with mouse, pen or finger |
| Highlight, underline, strike-through | H, U, S | Drag over the text |
| Comment | C | A note on the page. Saved as a real PDF comment, which Acrobat, Edge and other readers show |
| Picture | - | Any PNG, JPEG, WebP or GIF |
| Company logo | - | The logo set in Settings → Application (it must be at a web address that allows it to be fetched; otherwise use Picture) |
| Signature | - | Draw it, type your name, or use a picture. "Remember it on this computer" keeps it for next time (in this browser only) |

**Pages** (left panel): click a thumbnail to go there; drag to reorder, or use
the arrows; rotate left or right; duplicate; delete; add a blank page; **Insert
PDF** adds the pages of another PDF - from your computer or from the CRM's
documents (merge); tick pages and **Extract** them as a new PDF; **Split** into
PDFs of N pages each or by ranges (`1-3; 4-6`). Extracted and split PDFs can be
downloaded or saved as documents of the same record. Edits are included.

**Also:** undo and redo (Ctrl+Z, Ctrl+Y) for everything, copy, paste and
duplicate (Ctrl+C, Ctrl+V, Ctrl+D), Delete, bring to front / send to back,
zoom, and resizable side panels (their widths are remembered). Leaving with
unsaved changes asks first.

**Saving:** **Save new version** (Ctrl+S) replaces the file and keeps the old one
as the previous version; **Save as new document** keeps the original untouched;
**Download** and **Print** use the edited PDF without saving it.

## Spreadsheet editor

Open an Excel or CSV document and choose **Edit**: cells, formulas (recalculated
as you type), number formats, fonts, colours, fills, borders, alignment,
merged cells, row and column sizes, inserting and deleting rows and columns,
several sheets, copy and paste, undo and redo, find, filter. **Save new
version** writes an `.xlsx` file. **Export as PDF** opens the [Excel to PDF](#excel-to-pdf)
settings with the sheet as it is now, and can save the PDF as a document.

## PDF to Excel

**Convert to Excel** on a PDF finds its tables and shows them as a spreadsheet
**to check and correct before saving**. Words are grouped into rows by where
they sit on the page, into cells by the gaps between them, and into columns
where cells line up. Amounts such as `7,77,000.00`, `₹ 1,500` or `(250.50)`
become numbers, so they add up in Excel.

Options: which pages, one sheet per page or everything on one sheet, and OCR.
**Scanned pages** (pictures of paper, with no text in them) are read with OCR -
in English, English and Hindi, or English and Odia. Each page is marked with how
it was read; OCR pages show how sure the reading is, and a warning to check
names and numbers. The first use of OCR downloads the language data, so it
needs an internet connection then.

**Save to documents** adds the `.xlsx` to the same record; **Download .xlsx**
saves it to your computer.

## Excel to PDF

**Convert to PDF** on a spreadsheet (or picture): which sheets, paper (A4, A3,
Letter, Legal), orientation, margins, scaling (fit to width, fit on one page,
actual size, custom %), header, footer, page numbers, top rows repeated on every
page, and gridlines - with a live preview. Column widths, row heights, fonts,
colours, fills, borders, alignment and merged cells are kept. **Save PDF to
documents** adds it to the same record.

## Quotation PDFs

On a quotation, **Edit PDF** opens the quotation's PDF - as the CRM makes it -
in the PDF editor. The usual flow:

1. **Replace text** (E) on a line to change it; drag it to move it; drag its
   round handle to resize it.
2. **Company logo**, then **Signature** (drawn, typed or a picture).
3. **Attach to quotation** - the first time it asks for the name, type and
   status. It is saved in the quotation's Documents; saving again adds a new
   version.
4. **Print** or **Download**.

Changing the quotation itself (items, prices) is still done with **Edit** on
the quotation; the PDF editor changes only this copy of the PDF.

## Permissions

| Permission | Allows |
| ---------- | ------ |
| `documents.read` | See, open, download, print and convert (download the result) |
| `documents.create` | Upload; save converted, extracted and split files as new documents; delete your own uploads |
| `documents.update` | Rename, set the type and status, edit (PDF and spreadsheet editors), upload a new version |
| `documents.manageVersions` | Restore an earlier version |
| `documents.delete` | Delete anyone's documents |
| `documents.manageSettings` | Manage the document types and statuses |

Every one also needs **access to the record** the document belongs to
(`quotations.read` for a quotation's documents, and so on). Editing a
quotation's PDF needs `quotations.read`, `documents.read`, `documents.create`
and `documents.update`.

## API

| Method | Path | Permission | |
| ------ | ---- | ---------- | - |
| GET | `/documents` | read | List and search. `search`, `kind`, `documentTypeId`, `statusId`, `companyId`, `uploadedBy`, `from`, `to`, `entityType` + `entityId`, `page`, `limit`, `sortBy` (`fileName`, `fileSize`, `fileType`, `createdAt`, `updatedAt`), `sortOrder` |
| POST | `/documents` | create | Upload. `multipart/form-data`: `entityType`, `entityId`, optional `documentTypeId`, `statusId`, files in `files` |
| GET | `/documents/config` | read or create | Upload rules |
| GET | `/documents/:id` | read | Details, with `version`, `versionCount`, `documentType`, `status`, `updatedByUser` |
| PATCH | `/documents/:id` | update | `fileName` (the extension is kept), `documentTypeId`, `statusId` |
| GET | `/documents/:id/download` | read | The file; `?version=N` for an earlier one |
| GET | `/documents/:id/versions` | read | Every version, newest first |
| POST | `/documents/:id/versions` | update | A new version: `multipart/form-data`, the file in `file`, optional `note`, `fileName` |
| POST | `/documents/:id/versions/:version/restore` | manageVersions | Restore an earlier version (as a new version) |
| DELETE | `/documents/:id` | own: create; any: delete | Deletes the document and every version's file |
| GET POST PUT DELETE | `/document-types`, `/document-statuses` | manageSettings (reading: read, create or update) | The lists |

All of these are in the Postman collection (folder **Documents**).

## Limits - what it cannot do

These are limits of doing the work in a browser with PDF's own building
blocks. The screens say so where they apply.

- **Existing PDF text is not rewritten.** "Replace text" covers the original
  with a box in the page's colour and writes new text on top. The original is
  still in the file underneath: it can be found by copying text or by search,
  and shows through on a coloured or patterned background. For a clean change,
  edit the source (for quotations: the quotation itself) and make the PDF again.
- **Fonts.** Text added to a PDF uses PDF's built-in fonts - Helvetica, Times and
  Courier - not the PDF's own fonts, so replaced text may look slightly
  different. These fonts only have Western European characters: the rupee sign
  is written as "Rs.", and Odia, Hindi and other scripts cannot be added as text
  (the editor warns). Put such text in as a picture instead.
- **Scanned PDFs** have no text: "Replace text" finds nothing there (use Add
  text), and PDF to Excel needs OCR, which can misread characters.
- **Protected (encrypted) PDFs** can be viewed and printed but not edited.
- **Form fields** in a PDF cannot be filled in in the editor, and may no longer be
  fillable after the PDF is saved from it.
- **PDF to Excel** finds tables from positions on the page: merged cells,
  tables without clear gaps, and multi-line cells may need correcting in the
  preview before saving.
- **Spreadsheets:** charts, pictures, pivot tables, macros and conditional
  formatting are not kept when an Excel file is saved from the editor; old
  `.xls` files lose their formatting; saving always writes `.xlsx`.
- **Word** files are shown and printed, not edited, and their page layout is
  approximate. `.doc` (before 2007) cannot be shown.
- **Printing** goes through the browser's print dialog: the printer, duplex and
  colour are chosen there.

## Code

| Where | What |
| ----- | ---- |
| `server/src/models/Document.js`, `DocumentType.js`, `DocumentStatus.js` | The records |
| `server/src/services/document.service.js` | Upload checks, versions, restore, access rules |
| `server/src/seeds/document.seed.js` | The first types and statuses |
| `client/src/features/documents/lib/` | `fileKinds` (what a file is), `pdfjs` (showing PDFs), `pdfLayout` (print layout, page ranges), `printJob`, `sheetPdf` (spreadsheet → PDF), `spreadsheet` (Excel in and out of the grid), `pdfToSheet` (tables and OCR), `editorModel`, `pdfExport` (writing the edits), `fontMetrics` |
| `client/src/features/documents/editor/` | `PdfEditor`, its pages, panels and dialogs; `SheetEditor` |
| `client/src/features/documents/viewers/` | `PdfViewer`, `SheetView`, `FilePreview` |
| `client/src/features/documents/components/` | Actions menu, upload, details, versions and print dialogs, record picker |
| `client/src/features/documents/pages/` | Viewer, editor, converters, quotation PDF editor |

Libraries: [PDF.js](https://mozilla.github.io/pdf.js/) (showing PDFs, reading
their text), [pdf-lib](https://pdf-lib.js.org/) (writing PDFs), Fortune-sheet
(the spreadsheet grid), ExcelJS and SheetJS (reading and writing Excel and
CSV), tesseract.js (OCR), mammoth (Word). They are loaded only when a document
needs them.

Tests: `server/tests/documents.test.js`, `server/tests/documentTools.test.js`,
`client/src/features/documents/lib/documentTools.test.js`,
`client/src/features/documents/components/DocumentActions.test.jsx`,
`client/src/components/documents/DocumentList.test.jsx`.
