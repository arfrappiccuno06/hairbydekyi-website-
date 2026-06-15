# Stage 1 Testing Guide

## What Was Built

✅ **Complete React + Vite project setup**
- Mobile-first responsive design
- All components match the mockup design
- Hardcoded availability data (no APIs yet)
- Touch-friendly UI (44px+ minimum tap targets)

✅ **Calendar Interface**
- Monthly calendar view with October 2024 as starting month
- Previous/Next month navigation arrows
- Visual indicators for available days (light pink circles)
- Visual indicators for selected days (dark purple circles)
- Days with selected time slots show a pink circle with purple border
- Disabled state for unavailable days
- Calendar legend showing Available/Selected states

✅ **Time Slot Selection**
- Tap any available day to see available time slots
- Displays formatted date (e.g., "Thursday, October 10")
- Time slots in a 2-column grid layout
- Selected slots highlighted in pink
- Auto-scroll to time slots on mobile after selecting a day

✅ **3-Slot Minimum Requirement**
- Selection summary shows "X of 3 minimum"
- Can select time slots across multiple days
- Selected slots displayed in chronological order
- "Confirm Appointment" button disabled until 3+ slots selected
- Button turns green and enabled when requirement met
- Helpful hint message when fewer than 3 slots selected

✅ **Design Matching Mockup**
- Playfair Display serif font for headings
- Montserrat sans-serif for body text
- Soft beige/cream background with blur effect
- Rounded card components (24px border radius)
- Correct color palette (pink, purple, sage green)
- Footer with navigation links and copyright

## How to Test (Step-by-Step)

### 1. Open the Website

The dev server is running at: **http://localhost:5173/**

Open this URL in your web browser (Chrome recommended for best DevTools).

### 2. Test Mobile View (375px - iPhone SE)

**Setup:**
1. Open Chrome DevTools (F12 or Right-click > Inspect)
2. Click the device toolbar icon (or press Ctrl+Shift+M / Cmd+Shift+M)
3. Select "iPhone SE" from the device dropdown (or set custom width to 375px)

**Test the following:**

- [ ] Header displays correctly with menu icon and "hairbydekyi" logo
- [ ] "Book an appointment below:" heading is centered and readable
- [ ] Calendar card has rounded corners and soft shadow
- [ ] Month shows "October 2024" with navigation arrows
- [ ] Calendar shows days 1-31 in a 7-column grid
- [ ] Available days (4, 9, 10, 16) have light pink circles
- [ ] Legend shows "Available" and "Selected" indicators

**Interaction Test:**
1. Tap day 4 (Friday, October 4)
   - Time slot card should appear below calendar
   - Should auto-scroll to show "Available Times"
   - Should show 3 time slots: 09:00 AM, 11:00 AM, 02:00 PM

2. Tap "09:00 AM"
   - Slot button turns pink
   - Selection summary card appears at bottom
   - Shows "1 of 3 minimum" in the counter (pink background)
   - "Confirm Appointment" button is disabled (grayed out)

3. Tap "11:00 AM"
   - Second slot highlighted
   - Counter shows "2 of 3 minimum"
   - Button still disabled

4. Switch to day 10 (Thursday, October 10)
   - Time slots update to show 5 slots
   - Previous selections remain highlighted in summary
   - Day 4 now shows a pink circle with purple border (has selected slots)

5. Select "01:00 PM" on day 10
   - Counter shows "3 of 3 minimum" with GREEN background
   - "Confirm Appointment" button becomes enabled (bright green)
   - All 3 slots listed in summary with date and time

6. Tap "Confirm Appointment"
   - Alert popup should appear: "Booking confirmed with 3 time slot options!"
   - (This will be replaced with Google Form redirect in Stage 3)

7. Test deselection:
   - Tap a selected slot again to deselect it
   - Counter decreases
   - If below 3, button disables again

### 3. Test Desktop View (768px+)

**Resize browser to 1024px width:**

- [ ] Layout scales up nicely
- [ ] Text sizes increase slightly
- [ ] Calendar grid has more spacing
- [ ] All cards remain centered with max-width constraint
- [ ] Touch targets still work (hover states appear on mouse over)

### 4. Test Navigation

**Month Navigation:**
- [ ] Click left arrow to go to September 2024 (no available days)
- [ ] Click right arrow twice to go to November 2024
- [ ] Available days in November: 2, 5, 8, 12, 15, 20, 23
- [ ] Verify each day shows correct time slots when selected

**Menu Button:**
- [ ] Click hamburger menu in header
- [ ] Alert appears: "Menu navigation will be added in Stage 6"

### 5. Visual Design Check

Compare with the mockup image ([hairbydekyiuireference.png](hairbydekyiuireference.png)):

- [ ] Background has soft blur effect over the hair salon image
- [ ] Colors match (pink: #F8D7DA, purple: #8B6D7B, green: #A8BDA8)
- [ ] Border radius on all cards is 24px
- [ ] Fonts: Playfair Display for headings, Montserrat for body
- [ ] Spacing and padding matches mockup proportions
- [ ] Footer has "hairbydekyi" heading, nav links, and copyright

## Expected Hardcoded Availability

**October 2024:**
- Oct 4: 09:00 AM, 11:00 AM, 02:00 PM
- Oct 9: 10:00 AM, 01:00 PM, 03:00 PM
- Oct 10: 09:00 AM, 10:30 AM, 01:00 PM, 02:30 PM, 04:00 PM
- Oct 16: 09:00 AM, 12:00 PM, 02:00 PM, 04:00 PM

**November 2024:**
- Nov 2: 10:00 AM, 01:00 PM, 03:30 PM
- Nov 5: 09:00 AM, 11:30 AM, 02:00 PM
- Nov 8: 09:30 AM, 12:00 PM, 03:00 PM, 05:00 PM
- Nov 12: 10:00 AM, 01:00 PM, 04:00 PM
- Nov 15: 09:00 AM, 11:00 AM, 02:30 PM
- Nov 20: 10:30 AM, 01:00 PM, 03:00 PM
- Nov 23: 09:00 AM, 12:00 PM, 02:00 PM, 04:30 PM

## Common Issues & Troubleshooting

**If the page is blank:**
- Check browser console for errors (F12 > Console tab)
- Verify dev server is running (should see "VITE ready" in terminal)
- Try refreshing the page (Ctrl+R / Cmd+R)

**If background image doesn't load:**
- Check that [hairbydekyibg1.jpg](src/assets/images/hairbydekyibg1.jpg) exists
- Verify image path in App.css is correct

**If fonts look different:**
- Check internet connection (Google Fonts load from CDN)
- Wait a few seconds for fonts to download

**To stop the dev server:**
```bash
# Press Ctrl+C in the terminal where it's running
```

## What to Report Back

After testing, please confirm:

1. ✅ Design matches the mockup on mobile (375px)
2. ✅ 3-slot selection logic works correctly
3. ✅ Calendar navigation (prev/next month) works
4. ✅ Time slots appear when tapping available days
5. ✅ Responsive design scales to desktop (768px+)
6. ❓ Any visual discrepancies or bugs found?
7. ❓ Any accessibility or UX concerns?

## What I Need From You Before Stage 2

Before we move to Stage 2 (Google Calendar integration), I'll need:

1. **Google Cloud Project Setup** - I'll walk you through creating:
   - New Google Cloud project
   - Enable Calendar API
   - Create service account
   - Download credentials JSON file

2. **Google Calendar Access** - Which calendar should we use:
   - Your existing personal calendar?
   - Create a new dedicated calendar for bookings?

3. **Test Calendar** - I recommend creating a test calendar for development

Let me know when you've tested everything and are ready to proceed to Stage 2!
