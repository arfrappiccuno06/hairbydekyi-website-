# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mobile-first appointment booking website for a hairstylist. Primary traffic from Instagram bio link (90%+ mobile users). Built with React + Vite frontend, Vercel serverless backend, and Google APIs (Calendar, Sheets, Gmail).

**Critical constraint:** $0 budget - only free tiers, no paid services or subscriptions.

IMPORTANT RULE 1- EVERY RESPONSE YOU GIVE MUST START WITH MY NAME: Arfa

IMPORTANT RULE 2 - DO NOT CREATE UNNECESSARY FILES, MAKE THIS CODEBASE AS CLEAN AS POSSIBLE AND ALWAYS EVALUATE IF ADDING A NEW FILE IS NECESSARY BEFORE DOING IT.

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Production build
npm run preview      # Preview production build
```

## Staged Development Approach

**CRITICAL:** This project is built in 6 sequential stages. Each stage has a CHECKPOINT where development MUST STOP until the client tests and approves. Never skip ahead to the next stage without explicit approval.

### Current Stage: Stage 1 ✓
- Static UI with hardcoded availability data
- 3-slot minimum selection logic
- Mobile-first responsive design (375px baseline)

### Upcoming Stages:
- **Stage 2:** Google Calendar API integration (read-only availability)
- **Stage 3:** Google Form handoff with slot pre-filling via URL params
- **Stage 4:** Polling endpoint + notification emails (cron-job.org pings every 5min)
- **Stage 5:** Accept/deny flow with tokenized email links, race condition handling
- **Stage 6:** Additional pages (Gallery, FAQ, Pricing, About)

## Architecture & Data Flow

### Booking Flow (Full System - Stages 2-5)

1. **Availability Display:** Frontend fetches hairstylist's Google Calendar → shows free times as bookable slots
2. **Client Selection:** Client selects 3+ time slot options (can span multiple days)
3. **Form Submission:** Redirect to embedded Google Form with slots pre-filled → includes e-transfer screenshot upload
4. **Form to Sheet:** Google Form automatically writes to Google Sheet
5. **Polling:** Vercel serverless function polled every 5min (via cron-job.org) → checks Sheet for new rows
6. **Notification:** Email sent to stylist with booking details + Accept links (one per slot) + Deny link
7. **Accept/Deny:** Clicking Accept creates Calendar event, marks Sheet row, emails client confirmation. Deny emails client polite rejection.
8. **Race Condition:** If accepted slot conflicts with another booking, show error + alternative Accept links for remaining slots
9. **Idempotency:** Used Accept/Deny links show "already handled" message

### Data Model

**Slot Format:** `{ date: 'YYYY-MM-DD', time: 'HH:MM AM/PM' }`
- Dates are strings in ISO format (e.g., '2024-10-10')
- Times are 12-hour format with space before AM/PM (e.g., '09:00 AM')
- Timezone: America/Toronto (hardcoded)

**Availability Source (Stage 1):** `src/data/mockAvailability.js` - Will be replaced by Google Calendar API in Stage 2

### State Management

`App.jsx` manages global state:
- `selectedDate` (string | null) - Currently viewing date for time slots
- `selectedSlots` (array) - Array of `{ date, time }` objects
- `showMenu` (boolean) - Mobile menu toggle (Stage 6)

Components communicate via props (no context/Redux needed for this scope).

### Mobile-First Design Constraints

- **Minimum tap target:** 44-48px for all interactive elements
- **Baseline width:** 375px (iPhone SE)
- **Breakpoints:** 768px (tablet), 1024px (desktop)
- **Fonts:** Playfair Display (headings), Montserrat (body)
- **Color palette:**
  - Available: #F8D7DA (pink)
  - Selected: #8B6D7B (purple)
  - Confirm button: #A8BDA8 (sage green)
- **Background:** `src/assets/images/hairbydekyibg1.jpg` with 85% opacity cream overlay + 8px blur

### Component Architecture

**Unidirectional data flow:**
```
App (state container)
├── Header (presentational)
├── Calendar (date selection)
│   ↓ onDateSelect(date)
├── TimeSlotPicker (slot selection, conditionally rendered)
│   ↓ onSlotToggle(date, time)
├── SelectionSummary (3-slot validation + confirm, conditionally rendered)
│   ↓ onConfirm()
└── Footer (presentational)
```

**Conditional rendering logic:**
- `TimeSlotPicker` renders only if `selectedDate !== null`
- `SelectionSummary` renders only if `selectedSlots.length > 0`
- Auto-scroll to `TimeSlotPicker` on mobile after date selection (100ms delay)

### Future Backend (Stages 2-5)

Will add `api/` directory at project root for Vercel serverless functions:
- `api/availability.js` - Fetch Google Calendar free/busy
- `api/poll-bookings.js` - Check Sheet for new rows (triggered by cron-job.org)
- `api/accept-booking.js` - Handle Accept link clicks (tokenized)
- `api/deny-booking.js` - Handle Deny link clicks (tokenized)

**Authentication:** Service account with Calendar/Sheets API access (credentials in Vercel env vars, never in code)

**Email:** Nodemailer + Gmail app password (free tier)

**Cron workaround:** Vercel Hobby only allows 1 cron/day → use cron-job.org to ping `/api/poll-bookings` every 5 minutes

### Google API Integration Notes (Stage 2+)

- **Calendar sharing:** Share stylist's calendar with service account email
- **Sheet sharing:** Share booking Sheet with service account email (edit access for status updates)
- **Token security:** Accept/Deny links use random tokens stored in Sheet (prevent guessing/replay attacks)
- **Caching:** Cache Calendar availability for 1-5min client-side to avoid rate limits
- **Error fallback:** If Calendar API fails, show "DM us on Instagram" message

## Testing

Always test at 375px width first (mobile-first). Open Chrome DevTools → Device Toolbar → iPhone SE.

See `STAGE1-TESTING.md` for current stage testing checklist.

## Deployment

Configured for Vercel via `vercel.json`. SPA routing handled by catch-all rewrite to `/index.html`.

## Key Files

- `src/App.jsx` - Main state container, booking flow orchestration
- `src/data/mockAvailability.js` - Stage 1 only, replace in Stage 2
- `src/components/SelectionSummary.jsx` - 3-slot minimum enforcement logic
- `vercel.json` - Deployment config + SPA routing
