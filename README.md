# Appointment Booking Website on a $0 Budget :p

A real hairstylist runs her business on this: availability, deposits, confirmations, cancellations, and an admin dashboard. Built with no database, no paid APIs, and **no monthly bills**.

**Check it out:** [hairbydekyi.com](https://www.hairbydekyi.com), serving hundreds of visitors every month

> The challenge I set myself: ship a production booking system a real business depends on, for $0/month. This repo is the result!

---

## The Sauce 

Everything a booking app normally pays for is replaced by a free service used slightly off-label:

| Normally you'd pay for | Here it's |
| --- | --- |
| Database | Google Sheets |
| File storage (S3) | Google Forms upload → Drive |
| Payment/booking source of truth | Google Calendar |
| Transactional email | Resend free tier |
| Backend server | Vercel serverless functions |
| Cron scheduler | cron-job.org pinging an endpoint |

---

## Favorite Features

- **One-click tokenized Accept / Deny / Cancel links.** The stylist manages bookings straight from her email. Every link carries a random UUID token, so links can't be guessed and clicking twice is safe.
- **Double-booking race protection.** If two clients want the same slot, the first Accept wins. The second re-checks the live calendar at click time, refuses to conflict, and offers the client's other slots that are still free.
- **24-hour deposit holds.** Accepting creates a temporary calendar hold. Pay within 24h and it flips to confirmed. Miss the window and the slot frees itself automatically.
- **Auto-rebook emails.** If all of a client's requested slots already got taken, the system emails automatically emails them to rebook.
- **A real state machine.** Every booking moves through pending → accepted → deposited → confirmed (or denied / expired / cancelled), with idempotency guards so retries and double-clicks never corrupt state.
- **Stateless admin auth.** HMAC-signed session cookies.
- **Hand-rolled DST-correct timezone logic** pinned to America/Toronto. 

---

## How It Works

```
Client picks 3 slots → Google Form intake → Google Sheet (the "DB")
        │
cron (5 min) → /api/check-bookings → emails stylist Accept/Deny links
        │
stylist clicks Accept → race check → 24h calendar HOLD + deposit email
        │
client pays deposit → cron matches it → HOLD becomes CONFIRMED
        │
no payment in 24h → hold auto-deletes, slot frees itself
```

There is no database. State lives in Google Sheets and Google Calendar, and eight Vercel serverless functions move data between them.

---

## Tech Stack

**Frontend:** React 18, Vite, plain CSS
**Backend:** Vercel serverless (Node), Google Calendar + Sheets APIs, Resend
**Infra:** Google Forms (intake + file storage), cron-job.org, Vercel hosting
**Security:** UUID action tokens, HMAC-signed cookies, service-account auth

---

## Steal This Flow

Building anything with bookings, approvals, or human-in-the-loop steps on $0? Take the Sauce....

> Sheets as your DB, Forms as intake + file storage, a calendar as source of truth, serverless functions as glue, external cron to poll, and tokenized one-click email actions for approvals.

Copy whatever's useful. Built by **Arfa** to prove a dependable product doesn't have to cost anything to run (im broke)...