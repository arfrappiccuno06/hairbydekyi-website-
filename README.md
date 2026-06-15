# hairbydekyi - Appointment Booking Website

A mobile-first appointment booking website for hair styling services.

## Stage 1: Static UI with Hardcoded Data ✓

Current features:
- Mobile-first responsive calendar interface
- Day selection with visual feedback
- Available time slot display for selected dates
- 3-slot minimum selection requirement
- Selection summary with confirmation button
- Touch-friendly UI elements (44px+ tap targets)

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Testing Stage 1

1. **Mobile view (375px width)**:
   - Open dev tools and set viewport to 375px width
   - Test calendar day selection
   - Verify time slots appear when tapping available days
   - Select multiple time slots (minimum 3 required)
   - Check that "Confirm Appointment" button is disabled until 3 slots selected

2. **Desktop view**:
   - Resize browser to test responsive breakpoints (768px, 1024px)
   - Verify layout scales appropriately

3. **Interactive features**:
   - Click available days (pink circles) to see time slots
   - Click unavailable days (should do nothing)
   - Select/deselect time slots
   - Watch slot counter update in selection summary
   - Verify confirm button enables at 3 slots

## Tech Stack

- React 18
- Vite
- CSS3 with CSS Custom Properties
- Google Fonts (Playfair Display, Montserrat)

## Project Structure

```
src/
├── components/          # React components
│   ├── Header.jsx
│   ├── Calendar.jsx
│   ├── TimeSlotPicker.jsx
│   ├── SelectionSummary.jsx
│   └── Footer.jsx
├── data/               # Hardcoded data (Stage 1)
│   └── mockAvailability.js
├── assets/
│   └── images/
│       └── hairbydekyibg1.jpg
├── App.jsx
├── App.css
├── index.css
└── main.jsx
```

## Next Stages

- **Stage 2**: Google Calendar API integration (read-only)
- **Stage 3**: Google Form handoff with slot pre-filling
- **Stage 4**: Polling & notification emails
- **Stage 5**: Accept/deny booking flow
- **Stage 6**: Additional pages (Gallery, FAQ, Pricing, About)
