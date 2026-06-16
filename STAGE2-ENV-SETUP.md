# Environment Variables Setup

## Step 1: Encode Your Service Account Key

The JSON file you downloaded needs to be base64 encoded for Vercel.

**On Mac/Linux:**
```bash
cd "/Users/Arfa/Desktop/dekyis website /hairbydekyi-website-"
cat path/to/your-service-account-key.json | base64 | tr -d '\n' > encoded-key.txt
```

Replace `path/to/your-service-account-key.json` with the actual path to your downloaded JSON file.

This creates `encoded-key.txt` with the base64 string.

## Step 2: Create .env.local File

```bash
touch .env.local
```

Add these lines to `.env.local`:

```
GOOGLE_CALENDAR_ID=hairbydekyi@gmail.com
GOOGLE_SERVICE_ACCOUNT_KEY=paste_encoded_key_here
```

Copy the contents of `encoded-key.txt` and paste it after `GOOGLE_SERVICE_ACCOUNT_KEY=`

## Step 3: For Vercel Deployment (Later)

When deploying to Vercel:
1. Go to Project Settings → Environment Variables
2. Add both variables with the same values
3. Select "Production", "Preview", and "Development"

---

**Let me know when you've:**
1. ✅ Found your downloaded JSON file
2. ✅ Created the encoded key

I can help you with the encoding command if needed!
