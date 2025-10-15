# Forward Email API Setup

This project uses [Forward Email's API](https://forwardemail.net/en/email-api) to send magic link emails.

## Setup Steps

### 1. Get Your API Key
1. Go to https://forwardemail.net/en/my-account/security
2. Create a new API key
3. Copy the key (you'll only see it once)

### 2. Configure Environment Variables

Add to your `.env` or `.env.local`:

```bash
# Forward Email API Key
FORWARDEMAIL_KEY=your-api-key-here

# From address (must be from your verified domain)
SMTP_FROM="Capy School Auth <noreply@capyschool.com>"

# Or use EMAIL_FROM as an alternative
# EMAIL_FROM="Capy School Auth <noreply@capyschool.com>"
```

### 3. Domain Verification

Before sending emails, you must verify your domain at Forward Email:
1. Go to https://forwardemail.net/en/my-account/domains
2. Add your domain (e.g., `capyschool.com`)
3. Add the required DNS records (TXT, MX, etc.)
4. Wait for verification to complete

### 4. Production Setup (Vercel)

Add these environment variables in Vercel:
- `FORWARDEMAIL_KEY` = your API key
- `SMTP_FROM` = `"Capy School Auth <noreply@capyschool.com>"`
- `AUTH_BASE_URL` = `https://auth.capyschool.com`
- `PASSKEY_RP_ID` = `auth.capyschool.com`
- All other required env vars (see `.env.example`)

## How It Works

The `sendEmail()` function in `src/lib/email.ts`:
- Uses Forward Email's REST API (`https://api.forwardemail.net/v1/emails`)
- Authenticates with Basic Auth (API key as username, empty password)
- Sends Nodemailer-compatible JSON payload
- Returns the API response

## API Limits

- Free tier: Check your limits at https://api.forwardemail.net/v1/emails/limit
- Paid plans: Higher limits available

## Testing

Once configured, test the magic link flow:
1. Start dev server: `bun run dev`
2. Go to http://localhost:4321
3. Click "Sign in with Email"
4. Enter your email
5. Click "Magic Link"
6. Check your inbox for the sign-in email

## Troubleshooting

### "FORWARDEMAIL_KEY is required"
- Ensure the env var is set in your `.env` or `.env.local`
- Restart the dev server after adding env vars

### "Forward Email API error: 401"
- Invalid API key
- Get a new key at https://forwardemail.net/en/my-account/security

### "Forward Email API error: 403"
- Domain not verified
- From address doesn't match a verified domain
- Check your domain setup at https://forwardemail.net/en/my-account/domains

### Emails not arriving
- Check spam folder
- Verify DNS records are correct
- Check Forward Email logs at https://forwardemail.net/en/my-account/logs

## Documentation

- API Docs: https://forwardemail.net/en/email-api
- Guides: https://forwardemail.net/en/guides
- Support: https://forwardemail.net/en/help
