# Web Data Scraper

A research tool inside the CRM: it collects **public business details** from
websites, keeps them as results to review, and imports only what the user
approves into the existing **Companies, Contacts and Leads**. It never creates
CRM records by itself, and it is not a second company or contact database.

```text
New job → sources → settings → scraping (in the background, with progress)
→ results: cleaned, scored, compared with the CRM (new / possible duplicate / existing)
→ review: correct, compare side by side, choose (skip / update existing / create new)
→ select → import preview → import in batches
→ Companies → Contacts → optionally Leads (with what the user entered)
```

- [Screens](#screens)
- [Responsible collection - what it will and will not do](#responsible-collection---what-it-will-and-will-not-do)
- [What it reads from a page](#what-it-reads-from-a-page)
- [Cleaning, quality and duplicates](#cleaning-quality-and-duplicates)
- [Importing](#importing)
- [Permissions](#permissions)
- [Settings and limits](#settings-and-limits)
- [API](#api)
- [Limits - what it cannot do](#limits---what-it-cannot-do)
- [Code and tests](#code-and-tests)

## Screens

Menu: **Sales → Web Data Scraper**.

| Screen | Address | |
| ------ | ------- | - |
| Jobs (dashboard) | `/scraper` | Figures (jobs, records collected, new companies, new contacts, duplicates, imported, failed pages - each opens the matching list) and every job with its status, progress and counts. Each job's ⋮ menu: View results, Import remaining, Re-run, Cancel, Export to Excel / CSV, Delete |
| New scraping job | `/scraper/new` | A wizard: **Job** (name, companies / contacts / both, target business type from your Industries list) → **Sources** (Add URL / Remove, or paste a list) → **Settings** → **Review and start** |
| A job | `/scraper/jobs/:id` | Progress while it runs; then its figures, its **Results** and the **Pages** it visited |
| Results | `/scraper/results` | Results of every job. **Duplicates** and **Imported** are the same list filtered |
| Failed pages | `/scraper/failed` | Every page that could not be read, with the reason and time |

**The results table**: company, contact, designation, email, phone, location,
website, *In the CRM* (New / Possible duplicate / Existing), quality, import
status, job, date, source link. Search, filters (job, type, in the CRM,
duplicates, import status, has email, has phone, location, industry/category,
quality, date), sort, pages, column choice. Tick rows (or the header box for
the page) to **Import**, **Skip**, **Create new**, **Clear choice** or **Check
again**; **Import all not imported** takes every result matching the filters.

**Reviewing one result** (click its name): what was found next to the
matching CRM record, field by field; what is complete (✓ / ✗); every page it
was seen on; **Correct details**; and the choice for the import.

## Responsible collection - what it will and will not do

The scraper is for legitimate business research. These rules are built in -
no setting turns them off:

| | |
| - | - |
| **robots.txt** | Read first on every site and obeyed - its rules for our robot's name, or for "*", and its Crawl-delay. A site whose robots.txt refuses robots (401 / 403) or cannot be read (5xx) is not visited |
| **Slow** | One page at a time; at least 1 second between pages of a site (more if the job or the site asks); at most 200 pages and 1000 records per job |
| **Sign-in, CAPTCHA, paywall** | Never worked around. Sign-in, account, cart and checkout pages are not visited; forms are never submitted; links are not followed from a page with a password field. A page showing a CAPTCHA or anti-bot check stops all visits to that site for the job |
| **Refusals** | "Too many requests" (429) or "unavailable" (503): the site is left alone for the rest of the job. Nothing is retried automatically |
| **Identity** | It names itself (`SCRAPER_USER_AGENT`) and sends no cookies or credentials |
| **Network safety** | Only `http(s)` on ports 80 / 443; never addresses inside private networks (localhost, 10.x, 192.168.x, cloud metadata ...) - checked on the address actually connected to and on every redirect |
| **What is kept** | Only business details a page displays: names, business emails and phone numbers, addresses, websites, job titles, public profile links. Never passwords, tokens or anything behind a sign-in |

The user confirms, when starting a job, that the sources are public pages they
are permitted to collect business contact details from. Respecting each site's
terms of service remains the user's responsibility - the software cannot read
them.

## What it reads from a page

Most reliable first; a field is filled only when the page states it:

1. **Structured data** the site publishes: schema.org JSON-LD and microdata
   (Organization, LocalBusiness, Person - with their address, email, telephone,
   job title, employees), and vCard / hCard markup.
2. **Directory tables**: a table with a name column (Name, Company, FPO,
   Organisation, ...) and a way to reach them (Email, Phone / Mobile, Website,
   Contact person) - each row becomes a company, and its contact person a
   contact.
3. **Team cards**: a block (team, member, staff, people, profile ...) with a
   person's name and a job title, email or phone; and email links whose text is
   a person's name.
4. **The site itself**: its name (site name or page title), description, the
   emails and phone numbers it shows (`mailto:`, `tel:` and numbers written in
   the text), and its address (`<address>`, or "City, State PIN" patterns).

Pages likely to hold contact details (contact, about, team, members, directory)
are visited first.

Each result says how it was found: *the website's own details*, *published by
the site about itself*, or *listed on the page (directory)*.

**Scraped facts only.** The scraper records what the page says - "Agricultural
FPO" stays a category or description. It never turns that into a requirement
("5 MT cold storage"): a lead's requirement is only what the user types when
importing.

## Cleaning, quality and duplicates

**Cleaning** (before anything is compared): spaces and invisible characters
removed; ALL-CAPS names tidied ("MAA TARINI FPO" → "Maa Tarini FPO"); emails
lower-cased and checked; phone numbers checked (8-15 digits; years such as
"2024-2025" are not phone numbers); web addresses reduced to the site; names
split into first and last; the same email, number or page found twice kept
once.

**Comparing names**: legal forms are ignored, so "ABC PVT LTD", "ABC Pvt. Ltd."
and "ABC Private Limited" are the same name.

**Quality** (0-100%): for a company - name 25, email 20, phone 20, website 15,
address 10, contact person 10; for a person - name 25, email 25, phone 20,
company 20, designation 10. The review shows what is missing.

**In the CRM** - each result against existing companies and contacts:

| | When |
| - | - |
| **Existing** | Same website, same email (or an email at the company's own domain), or same name together with the same phone or city. A person: same email, or same phone / name at the same company |
| **Possible duplicate** | Only the name, a similar name or only the phone agrees - or another result of the same job is the same company or person |
| **New** | Nothing alike |

Nothing is merged automatically. A possible duplicate is **not imported until
the user chooses**: Skip, Update existing, Use existing or Create new. **Check
again** compares results with the CRM again (after corrections, or after other
imports).

## Importing

1. Select results (or **Import all not imported**).
2. Options: industry for new companies, who to assign them to, and -
   optionally - **Also create a lead for each company**: title (`{company}` is
   replaced), **requirement** (what the user knows or has confirmed - optional),
   source, status, priority. Leads are never created unless ticked.
3. **Preview**: how many companies and contacts will be created, updated or
   linked, how many leads, and which results need a choice or have a problem.
   Nothing has changed yet.
4. **Import**: in batches of 50 with a progress bar ("45 / 75").

What happens to each result:

| Choice | Company | Person |
| ------ | ------- | ------ |
| Create new (default for New) | A new company | A new contact - at the CRM company it matched, the company imported with it, or a new company made from its details ("create company + contact") |
| Use existing (default for Existing) | Nothing changes; the record is linked | Nothing changes |
| Update existing | **Only empty fields** are filled (website, email, phone, address, city, state, country, PIN, industry); nothing is overwritten | Only empty designation, email, phone |
| Skip | - | - |

Values the CRM would refuse (a phone in an odd format, ...) are left out
rather than failing the record. A person needs a first and a last name; one
found with a single name must be completed in the review first.

**Source tracking**: every company and contact created or updated gets a note
with the source page, its profile link, the scraping job, the date it was
scraped, and the date and person importing it; its history shows "Imported from
the web data scraper". The result keeps links to the company, contact and lead
it became. A result is imported once only.

## Permissions

| Permission | Allows |
| ---------- | ------ |
| `scraper.read` | See jobs and their results (your own jobs) |
| `scraper.viewAll` | See every user's jobs |
| `scraper.create` | Create, cancel and re-run jobs; correct results and make choices |
| `scraper.import` | Import - also needs `companies.create` and `contacts.create`, and `leads.create` for leads |
| `scraper.export` | Export results to Excel or CSV |
| `scraper.delete` | Delete a job and its results (never what was imported) |

Suggested roles (set them up in **Roles**): a sales executive - read, create,
import (with companies/contacts create); a manager - the same plus export and
view all; administrators have everything.

## Settings and limits

Per job (wizard step 3): maximum pages (1-200, default 20), maximum records
(1-1000, default 200), crawl depth (0-3, default 1 - 0 reads only the pages
entered), delay between pages (1-30 seconds, default 2), follow links, same
website only, and what to extract (company names, emails, phones, addresses,
websites, contact names, job titles). Up to 50 sources per job.

Server (`server/.env`):

| Variable | Default | |
| -------- | ------- | - |
| `SCRAPER_USER_AGENT` | `CRMResearchBot/1.0 (...)` | How the scraper names itself; robots.txt groups for this name apply |
| `SCRAPER_MIN_DELAY_MS` | 1000 | The least time between pages of one site, whatever a job asks |
| `SCRAPER_TIMEOUT_MS` | 15000 | Time limit per page |
| `SCRAPER_ALLOW_PRIVATE_HOSTS` | false | Allows localhost / private addresses. **For tests and local trials only** - keep it false in production |

Jobs run one at a time in the API process. A job that was running when the
server restarted is marked as interrupted (re-run it); queued jobs start again.

## API

All under `/api/v1/scraper`; see the Postman folder **Web Data Scraper**.

| Method | Path | Permission | |
| ------ | ---- | ---------- | - |
| GET | `/stats` | read | Figures and limits |
| GET POST | `/jobs` | read / create | List (`status`, `search`, paging) / create |
| GET | `/jobs/:id` | read | One job, with progress |
| POST | `/jobs/:id/cancel`, `/jobs/:id/rerun` | create | |
| DELETE | `/jobs/:id` | delete | The job and its results |
| GET | `/pages` | read | Pages visited: `jobId`, `status` (done, failed, skipped) |
| GET | `/records` | read | Results, with the filters above and sorting |
| GET | `/records/ids` | read | Every id matching the filters |
| GET | `/records/export` | export | `format=xlsx` or `csv`, same filters |
| GET PATCH | `/records/:id` | read / create | One result / corrections and `decision` |
| POST | `/records/recheck` | create | Compare with the CRM again |
| POST | `/import/preview` | import | What would happen (up to 1000 ids) |
| POST | `/import` | import | Import (up to 50 ids per call) |

## Limits - what it cannot do

- **Pages built by JavaScript** in the browser show the scraper only what the
  server sends; details loaded later by scripts are not seen.
- **Free-text pages** are read only as far as the patterns above go: a person
  mentioned in a paragraph without markup, a phone written as words, or an
  address without a PIN may be missed or only partly read. Review is part of
  the process for this reason.
- **Indian formats first**: phone and address patterns are tuned for India
  (10-digit mobiles, STD landlines, 6-digit PINs); international numbers with a
  "+" country code are read too.
- **Social networks** and most large directories do not permit automated
  collection (their robots.txt or terms forbid it); the scraper will be refused
  or must not be pointed at them.
- One job runs at a time; large jobs take minutes by design (the delay).

## Code and tests

| Where | What |
| ----- | ---- |
| `server/src/models/ScrapeJob.js`, `ScrapePage.js`, `ScrapedRecord.js` | Jobs, pages visited, results |
| `server/src/services/scraper/safeFetch.js` | Fetching safely (addresses, ports, redirects, size, time) |
| `server/src/services/scraper/robots.js` | robots.txt |
| `server/src/services/scraper/extract.js` | Reading a page |
| `server/src/services/scraper/crawler.js` | Visiting pages politely |
| `server/src/services/scraper/normalize.js` | Cleaning, names, phones, quality |
| `server/src/services/scraper/match.js` | Comparing with the CRM |
| `server/src/services/scraper.service.js` | Jobs, the queue, results, export |
| `server/src/services/scraperImport.service.js` | The import, through the company, contact and lead services |
| `client/src/features/scraper/` | Pages (dashboard, wizard, job, results, failed pages) and components |

Tests: `server/tests/scraperUnits.test.js` (address blocking, robots.txt,
cleaning, quality, extraction), `server/tests/scraper.test.js` (a whole job
against two local test websites - one well-behaved, one with a CAPTCHA -
duplicates, import, leads, export, permissions),
`client/src/features/scraper/components/Scraper.test.jsx`, and the Postman
folder (which `npm run test:postman` runs against its own small local site).
