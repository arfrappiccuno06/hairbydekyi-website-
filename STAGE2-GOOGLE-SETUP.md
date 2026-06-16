# Stage 2: Google Cloud Setup Guide

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name: `hairbydekyi-booking`
4. Click "Create"

## Step 2: Enable Calendar API

1. In the search bar, type "Google Calendar API"
2. Click "Google Calendar API"
3. Click "Enable"

## Step 3: Create Service Account

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "Service Account"
3. Service account name: `hairbydekyi-calendar`
4. Click "Create and Continue"
5. Skip optional steps, click "Done"

## Step 4: Create Service Account Key

1. Click on the service account you just created
2. Go to "Keys" tab
3. Click "Add Key" → "Create new key"
4. Choose "JSON"
5. Click "Create" - a JSON file will download
6. **Save this file securely** - you'll need it for Vercel

## Step 5: Share Your Calendar

1. Open [Google Calendar](https://calendar.google.com)
2. Find your calendar in the left sidebar
3. Click the three dots → "Settings and sharing"
4. Scroll to "Share with specific people"
5. Click "Add people"
6. Paste the service account email (looks like: `hairbydekyi-calendar@hairbydekyi-booking.iam.gserviceaccount.com`)
7. Permission: "See all event details"
8. Click "Send"

## Step 6: Get Your Calendar ID

1. Same settings page from Step 5
2. Scroll to "Integrate calendar"
3. Copy the "Calendar ID" (looks like an email address)
4. Save this - you'll need it for environment variables

---

## What to Do Next

Once you've completed all steps above, provide me with:
1. ✅ Confirmation that the JSON key file is downloaded
2. ✅ The Calendar ID you want to use

I'll then help you set up the environment variables and build the backend.
