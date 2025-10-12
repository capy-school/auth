# Setup Guide

## Quick Setup

### 1. Create .env file

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Required
TURSO_DATABASE_URL=libsql://local.db
TURSO_AUTH_TOKEN=

BETTER_AUTH_SECRET=your-super-secret-key-at-least-32-characters-long-change-this

# Optional OAuth Providers
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
```

### 2. Set up Turso Database (Production)

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Create database
turso db create auth-gateway

# Get database URL
turso db show auth-gateway --url

# Create auth token
turso db tokens create auth-gateway
```

Update your `.env` with the Turso credentials.

### 3. Run Database Migration

```bash
bun run db:migrate
```

### 4. Start Development Server

```bash
bun dev
```

Visit **http://localhost:4321**

## OAuth Provider Setup

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. Choose **Web application**
6. Add authorized redirect URIs:
   - `http://localhost:4321/api/auth/callback/google`
   - `https://yourdomain.com/api/auth/callback/google` (production)
7. Copy **Client ID** and **Client Secret** to `.env`

### GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - Application name: Your app name
   - Homepage URL: `http://localhost:4321`
   - Authorization callback URL: `http://localhost:4321/api/auth/callback/github`
4. Copy **Client ID** and **Client Secret** to `.env`

### Facebook OAuth

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app
3. Add **Facebook Login** product
4. Configure OAuth redirect URIs:
   - `http://localhost:4321/api/auth/callback/facebook`
5. Copy **App ID** and **App Secret** to `.env`

## Development Workflow

### Local Database

For local development, you can use a local SQLite file:

```env
TURSO_DATABASE_URL=file:local.db
TURSO_AUTH_TOKEN=
```

### Testing OAuth Locally

Use tools like **ngrok** to expose your local server:

```bash
ngrok http 4321
```

Update `.env`:
```env
BETTER_AUTH_URL=https://your-ngrok-url.ngrok.io
```

Update OAuth callback URLs in provider settings to use the ngrok URL.

## Features Implemented

✅ **Core Authentication**
- Better Auth integration
- Kysely ORM with Turso/LibSQL
- Session management
- Secure cookie handling

✅ **OAuth Providers (Configurable)**
- Google
- Facebook
- GitHub
- Apple (needs additional setup)
- Kakao, Naver, Line (custom OAuth proxy)
- Yandex, VK, WeChat (custom OAuth proxy)

✅ **UI Components**
- Beautiful login gateway with gradient design
- Responsive design with Tailwind CSS
- Icon support with Lucide React
- Loading states and error handling

✅ **Database**
- Full schema for auth system
- Support for multiple providers
- Session tracking
- User profiles

## Extending Features

### Adding Passkey Support

1. Install Better Auth passkey plugin
2. Update `src/lib/auth.ts` to include passkey configuration
3. Update UI to enable passkey registration and login

### Adding Magic Link / Email OTP

1. Configure email service (e.g., Resend, SendGrid)
2. Add email plugins to Better Auth configuration
3. Update environment variables with SMTP settings

### Adding 2FA

1. Install Better Auth 2FA plugin
2. Add QR code generation
3. Create 2FA setup and verification UI

### Organization & Multi-Tenancy

1. Configure organization plugin in Better Auth
2. Create organization management UI
3. Add role-based access control

## Deployment

### Environment Variables (Production)

```env
NODE_ENV=production
BETTER_AUTH_SECRET=<long-secure-random-string>
BETTER_AUTH_URL=https://yourdomain.com
TURSO_DATABASE_URL=<your-turso-url>
TURSO_AUTH_TOKEN=<your-turso-token>
```

### Build

```bash
bun run build
```

### Deploy to Vercel

```bash
vercel
```

Or push to GitHub and connect to Vercel.

### Deploy to Netlify

```bash
netlify deploy
```

### Deploy to Cloudflare Pages

```bash
bun run build
wrangler pages publish dist
```

## Troubleshooting

### Database Connection Issues

- Verify `TURSO_DATABASE_URL` format: `libsql://...`
- Check if auth token is valid
- For local development, use `file:local.db`

### OAuth Not Working

- Verify callback URLs match exactly
- Check client ID and secret are correct
- Ensure `BETTER_AUTH_URL` matches your domain
- Check OAuth provider console for errors

### Session Issues

- Clear browser cookies
- Verify `BETTER_AUTH_SECRET` is set and at least 32 characters
- Check database has session table

## Security Checklist

- [ ] Change `BETTER_AUTH_SECRET` to a strong random value
- [ ] Use HTTPS in production (`useSecureCookies: true`)
- [ ] Keep dependencies updated
- [ ] Enable CSRF protection
- [ ] Configure rate limiting
- [ ] Set up proper CORS policies
- [ ] Never commit `.env` to version control
- [ ] Rotate secrets regularly
- [ ] Use environment-specific configurations

## Resources

- [Better Auth Docs](https://www.better-auth.com)
- [Turso Docs](https://docs.turso.tech)
- [Astro Docs](https://docs.astro.build)
- [Kysely Docs](https://kysely.dev)
