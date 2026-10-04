   # User guide – from enquiry to service, with a Cold Storage example

This guide walks through every part of the CRM with one real-looking sale: a
**5 MT solar cold storage** for **Maa Samaleswari FPO**. Do the steps in order -
each one uses what the earlier steps created.

Open the app (in development: http://localhost:5173) and sign in.

---

## Part 1 – Set up once

### 1. Your company details
**Administration → Application settings**

| Tab | What to fill in |
| --- | --------------- |
| Company | Company name, legal name, GST and PAN numbers, address, phone, email, website, **Currency `INR`**, logo address. Printed on every quotation PDF |
| CRM | Time zone `Asia/Kolkata`, Date format `DD/MM/YYYY`. Number prefixes if you want your own (e.g. `SEPL-Q` for quotations) |
| Quotation | Valid for `30` days; your standard terms (payment, delivery, warranty); the email wording |
| Branding | Default colour theme, sign-in page logo, browser tab icon |

Click **Save** on each tab.

### 2. Units and tax
**Catalogue → Units**: add `Set` (symbol `set`) and `Nos` (symbol `nos`).
**Catalogue → Taxes**: check `GST 18%` exists (add it if not: name `GST 18%`, rate `18`).
**Catalogue → Categories**: your business areas are already there - Cold Storage,
Water Monitoring, AquaSense, EPC, Flow Meter, Solar PT, WTP Instrumentation, ESR
Instrumentation, EPC / Partner Company Equipment, IoT / Device Data.

### 3. Products
**Catalogue → Products → New product** - create these three:

| Name | Category | Unit | Base price (₹) | Tax |
| ---- | -------- | ---- | -------------: | --- |
| 5 MT Cold Storage Unit (solar powered) | Cold Storage | Set | 8,50,000 | GST 18% |
| Temperature & Humidity IoT Sensor | IoT / Device Data | Nos | 12,000 | GST 18% |
| Installation & Commissioning | EPC | Set |  | GST 18% |

Leave **SKU** empty - the system creates one from the category (e.g. `COLD-000001`).

> **Partner / OEM equipment** (bought from another company and supplied in an
> EPC project) goes under the category *EPC / Partner Company Equipment*.

### 4. A salesperson
1. **Administration → Roles → New role** - name `Sales Executive`. Open it and
   tick *read, create, update* for Companies, Contacts, Leads, Follow-ups,
   Activities, Opportunities and Quotations. Save.
2. **Administration → Users → New user** - `Ravi Kumar`, his email, a
   password, role `Sales Executive`.

Ravi can now sign in and sees only what his role allows.

---

## Part 2 – The sale

### 5. The company
**Customers → Companies** → open **Maa Samaleswari FPO** (already entered).
Check its city, state, phone and GST number; set **Assigned to** `Ravi Kumar`.

### 6. The contact
On the company page, **Contacts** tab - **Ramesh Behera** is already there.
Add his designation, phone and email if missing.

### 7. The lead (the enquiry)
**Sales → Leads → New lead**

| Field | Value |
| ----- | ----- |
| Title | 5 MT cold storage for potato and vegetable storage |
| Company / Contact | Maa Samaleswari FPO / Ramesh Behera |
| Source | Referral |
| Priority | High |
| Estimated value | 1000000 |
| Expected close date | about a month ahead |
| Assigned to | Ravi Kumar |

Ravi gets a notification (the bell icon, top right).

### 8. Work the lead
Open the lead:
- **Add follow-up** - "Visit site: check space and power supply", due in 2 days.
- **Log activity** after the visit - type `Site Visit`, notes: "Shed 20×15 ft,
  single-phase supply, roof suitable for solar".
- Change **Status** to `Qualified`.

### 9. Convert the lead
Click **Convert lead**. This creates an **opportunity** (a deal in the
pipeline) linked to the same company and contact. The lead is marked converted.

### 10. The pipeline
**Sales → Opportunities** shows a board of stages. Drag the card from
*Qualification* to *Proposal* as the deal moves on.

### 11. The quotation
**Sales → Quotations → New quotation**

- Customer `Maa Samaleswari FPO`, Contact `Ramesh Behera`, Opportunity (from step 9)
- Lines:
  - 5 MT Cold Storage Unit × 1 - discount `5` %
  - Temperature & Humidity IoT Sensor × 4
  - Installation & Commissioning × 1

Click **Create quotation**. The server works out the totals:

| | ₹ |
| --- | ---: |
| Cold storage 8,50,000 − 5 % | 8,07,500 |
| 4 sensors | 48,000 |
| Installation | 75,000 |
| **Subtotal** | **9,30,500** |
| GST 18 % | 1,67,490 |
| **Grand total** | **10,97,990** |

On the quotation page:
- **PDF** - download and check it.
- **Send** - emails it (try your own address first).
- When the customer agrees, change **Status** to `Accepted`.

### 12. The order
On the accepted quotation click **Create order** and give the delivery date.
The order copies the lines and totals. Maa Samaleswari FPO now appears under
**Customers → Customers** - a company becomes a customer with its first order.

### 13. Close the deal
Back on **Opportunities**, move the card to `Won`.

---

## Part 3 – Delivery, money, service

### 14. The project
**Operations → Projects → New project**

- Name `Maa Samaleswari FPO – 5 MT cold storage installation`
- Company and the order from step 12
- Project manager: you; team: Ravi Kumar

On the project page:
- **Add milestone** - `Equipment delivered`, `Installation complete`, `Commissioned`
- **Add task** - `Site civil work check`, `Install solar panels`,
  `Install 4 IoT sensors`, `Test at 2–4 °C for 48 hours` - each with a person
  and a due date

Mark tasks done as the work finishes; progress updates by itself.

### 15. Payment
**Finance → Payments → New payment** - company, the order, amount = order
total, due date 15 days ahead.

When money arrives, open the payment and click **Record payment** - e.g.
₹5,00,000 advance. It shows *Partially paid* and what remains. Record the
balance later and it becomes *Paid*. Late payments are flagged as overdue
automatically.

### 16. AMC contract
**Operations → Contracts → New contract** - type `Annual Maintenance (AMC)`,
start = commissioning date, end = one year later, amount `60000`, billing
cycle `Quarterly`.

Before the end date the system reminds the person responsible by itself (by
default 30, 15 and 7 days before - change these under **Administration →
Lists and statuses → Contract reminder periods**).

### 17. Support ticket
When the customer calls: **Operations → Tickets → New ticket** - subject
`Temperature alarm not triggering`, priority `High`, category `Technical Issue`.
In the ticket, **Reply** (the customer's conversation) or add an internal note
(staff only). Set the status to `Resolved` when fixed.

### 18. Documents
Every record has a **Documents** tab - upload drawings, site photos, the
signed purchase order, test reports.

---

## Part 4 – Watching the business

| Where | What you get |
| ----- | ------------ |
| Dashboard (home) | Leads, pipeline value, won value, payments due, charts. **Customize** to move, resize or hide widgets |
| Insights → Reports | Sales, leads, opportunities, quotations, orders, payments, tickets, contracts … for a date range; export to CSV, Excel or PDF |
| Administration → Audit log | Who changed what, and when |
| Search (**Ctrl + K**) | Type a name or a number (e.g. `QUO-000001`) to jump to it |
| 🌐 button | English, ଓଡ଼ିଆ, हिन्दी |
| Palette button | Colour theme, light / dark, text size |

---

## Tips

- **Numbers are automatic** - LEAD-…, QUO-…, ORD-… are never typed.
- **Your lists, your words** - lead sources, statuses, pipeline stages, ticket
  categories, contract types: **Administration → Lists and statuses**.
- **Deleting is refused while something depends on a record** - e.g. a company
  that still has quotations. The message tells you what is in the way.
- **Check what others see** - sign in as Ravi in a private window: no Users,
  Payments or Settings.
- **Never run `npm run seed:demo` on this database** - it fills it with demo
  companies and products.
