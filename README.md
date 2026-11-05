# 🔐 Login Gateway - Comprehensive Authentication System

A modern, passwordless authentication gateway built with **Astro**, **Turso**, and **Better Auth** with support for multiple authentication methods and providers.

## ✨ Features

### Authentication Methods
- 🔑 **Passwordless Authentication**
  - Passkey (WebAuthn)
  - Magic Link
  - Email OTP
- 🔐 **Two-Factor Authentication (2FA)**
- 🔒 **Session Management**

### OAuth Providers
- Google
- Facebook
- Apple
- GitHub
- Kakao
- Naver
- Line
- Yandex
- VK
- WeChat

### Advanced Features
- 👥 **Organization Management** - Multi-tenant support
- 🔑 **API Key Management** - Generate and manage API keys
- 👑 **Admin Panel** - Administrative controls
- 🔄 **OAuth Proxy** - Custom OAuth provider support
- ⏱️ **One-Time Tokens** - Secure temporary access
- 📖 **OpenAPI Documentation** - Auto-generated API docs

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ or Bun
- Turso account (free at [turso.tech](https://turso.tech))

### 1. Install Dependencies

```bash
bun install
# or
npm install
```

### 2. Set Up Turso Database

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Create a database
turso db create auth-gateway

# Get database URL
turso db show auth-gateway --url

# Create auth token
turso db tokens create auth-gateway
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
```env
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token
BETTER_AUTH_SECRET=your-secret-key-here-min-32-chars
BETTER_AUTH_URL=http://localhost:4321
```

### 4. Run Database Migration

```bash
bun run db:migrate
# or
npm run db:migrate
```

### 5. Configure OAuth Providers (Optional)

Add your OAuth credentials to `.env`:

```env
# Google
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# GitHub
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret

# Add more providers as needed...
```

#### Setting Up OAuth Providers

**Google**: [Google Cloud Console](https://console.cloud.google.com/)
- Callback URL: `http://localhost:4321/api/auth/callback/google`

**GitHub**: [GitHub Developer Settings](https://github.com/settings/developers)
- Callback URL: `http://localhost:4321/api/auth/callback/github`

**Facebook**: [Facebook Developers](https://developers.facebook.com/)
- Callback URL: `http://localhost:4321/api/auth/callback/facebook`

**Apple**: [Apple Developer](https://developer.apple.com/)
- Callback URL: `http://localhost:4321/api/auth/callback/apple`

### 6. Start Development Server

```bash
bun dev
# or
npm run dev
```

Visit `http://localhost:4321` to see the login gateway.

## 📁 Project Structure

```
/
├── public/              # Static assets
├── src/
│   ├── components/      # React components
│   │   ├── AuthButton.tsx
│   │   └── LoginGateway.tsx
│   ├── db/             # Database configuration
│   │   ├── client.ts   # Kysely client
│   │   ├── schema.ts   # TypeScript types
│   │   └── migrate.ts  # Migration script
│   ├── lib/            # Utilities and configs
│   │   ├── auth.ts     # Better Auth config
│   │   ├── auth-client.ts  # Client-side auth
│   │   └── utils.ts    # Helper functions
│   └── pages/          # Astro pages
│       ├── index.astro # Login page
│       ├── dashboard.astro # User dashboard
│       └── api/auth/[...all].ts # Auth API routes
├── .env.example        # Environment template
├── astro.config.mjs    # Astro configuration
├── tailwind.config.mjs # Tailwind CSS config
└── package.json
```

## 🔧 Commands

| Command | Action |
|---------|--------|
| `bun install` | Install dependencies |
| `bun dev` | Start dev server at `localhost:4321` |
| `bun build` | Build production site to `./dist/` |
| `bun preview` | Preview production build |
| `bun run db:migrate` | Run database migrations |

## Static SvelteKit frontend and Nginx image

The Docker target uses SvelteKit 2 / Svelte 5 with `adapter-static` 3.0.10. It
prerenders login, dashboard, logout and six account settings pages into
`.svelte-kit/static/`, then hydrates them with client-side routing. Generic HTML
contains no account data; session checks and account operations use same-origin
`/api` requests. The API remains a separate service with its existing authorization.

Nginx runs in `scratch`, without Node or request-time SSR. `API_UPSTREAM` selects
the backend at container startup; `PORT` defaults to 8080. The image does not need
to be rebuilt when the backend address changes. See the [static image guide](docs/static-image.md)
for the backend origin/cookie contract, local development and read-only startup.

```bash
npm run kit:check
npm run kit:build
npm run test:kit:app
npm run image:build
npm run image:test
```

Kit/Vite retain environment-file isolation under `src/kit/` and the public
`PUBLIC_KIT_` prefix. Existing Astro/backend commands and root `preview` are
unchanged. Intermediate Kit renderer modules are build tools, not runtime files
in the image. There is no automatic image publication or Railway deployment.

### Preserved migration diagnostics

The old disconnected previews are a separate opt-in route tree, selected with
`npm run kit:diagnostic:dev` or `npm run kit:diagnostic:build`.
**Do not deploy the candidate** diagnostics or treat their fictional callbacks as authentication.
`/__migration/build.json` is fixed build metadata, not runtime health. These
routes are not part of the production image.

Diagnostic HTTP checks require their running server and `KIT_SMOKE_URL`; they
fail rather than silently skip without it. Rebuild with `npm run kit:build` after
using the diagnostic build before testing production files. Passing static tests
does not by itself establish browser acceptance, TLS proxy behavior or CDN HIT rates.

## 🎯 Usage Examples

### Client-Side Authentication

```typescript
import { authClient } from './lib/auth-client';

// Magic Link
await authClient.magicLink.sendMagicLink({ 
  email: 'user@example.com' 
});

// Email OTP
await authClient.emailOTP.sendOTP({ 
  email: 'user@example.com' 
});

// Passkey Registration
await authClient.passkey.register();

// Passkey Sign In
await authClient.passkey.signIn();

// Enable 2FA
const { qrCode, secret } = await authClient.twoFactor.enable();

// Create API Key
const apiKey = await authClient.apiKey.create({
  name: 'My API Key',
  expiresIn: 90 // days
});

// Create Organization
const org = await authClient.organization.create({
  name: 'My Company',
  slug: 'my-company'
});
```

### Server-Side Session Check

```typescript
// In Astro page
---
import { auth } from '../lib/auth';

const session = await auth.api.getSession({
  headers: Astro.request.headers,
});

if (!session) {
  return Astro.redirect('/');
}
---
```

## 🔐 Security Features

- **Passwordless**: No passwords to leak or forget
- **Passkey Support**: WebAuthn/FIDO2 hardware security
- **2FA**: Time-based one-time passwords
- **Session Management**: Secure token-based sessions
- **API Key Management**: Scoped and expirable keys
- **Rate Limiting**: Built-in protection
- **CSRF Protection**: Automatic token validation

## 📖 API Documentation

Once running, visit `/api/auth/reference` for the auto-generated OpenAPI documentation.

## 🚀 Deployment

### Deploy to Vercel/Netlify/Cloudflare

1. Build the project:
```bash
bun run build
```

2. Set environment variables in your hosting platform

3. Deploy the `dist/` directory

### Production Checklist

- ✅ Set secure `BETTER_AUTH_SECRET` (min 32 chars)
- ✅ Update `BETTER_AUTH_URL` to production URL
- ✅ Configure OAuth callback URLs
- ✅ Set up email service for Magic Link/OTP
- ✅ Enable rate limiting
- ✅ Configure CORS if needed

## 🛠️ Customization

### Adding Custom OAuth Providers

Edit `src/lib/auth.ts` and add to the `oAuthProxy` plugin:

```typescript
{
  id: 'custom-provider',
  name: 'Custom Provider',
  authorizationUrl: 'https://...',
  tokenUrl: 'https://...',
  userInfoUrl: 'https://...',
  clientId: process.env.CUSTOM_CLIENT_ID || '',
  clientSecret: process.env.CUSTOM_CLIENT_SECRET || '',
  scopes: ['profile', 'email'],
}
```

### Styling

The project uses Tailwind CSS. Customize colors and styles in `tailwind.config.mjs` or modify component classes directly.

## 📚 Documentation

- [Astro Documentation](https://docs.astro.build)
- [Better Auth Documentation](https://www.better-auth.com)
- [Turso Documentation](https://docs.turso.tech)
- [Kysely Documentation](https://kysely.dev)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT License - feel free to use this in your projects!

## 🙏 Credits

Built with:
- [Astro](https://astro.build)
- [Better Auth](https://www.better-auth.com)
- [Turso](https://turso.tech)
- [Kysely](https://kysely.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [React](https://react.dev)
- [Lucide Icons](https://lucide.dev)
