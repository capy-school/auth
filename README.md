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

## Non-default SvelteKit diagnostic candidate

Astro remains the default application and the sole production target. The additive
`src/kit/` candidate exposes only `/__migration` and `/__migration/health`.
It has no authentication, API proxy, database access or login implementation.
**Do not deploy the candidate** or use it as evidence of authentication parity.

```bash
bun run kit:test
bun run kit:check
bun run kit:build
bun run kit:dev --host 127.0.0.1 --port 5173 --strictPort
# In another terminal while that server is running:
KIT_SMOKE_URL=http://127.0.0.1:5173 node --test tests/kit-http.test.mjs
```

HTTP checks fail rather than skip when `KIT_SMOKE_URL` is absent. The candidate
uses pinned SvelteKit 2 / Svelte 5 tooling, reuses `public/`, and checks only its own
sources through `tsconfig.sveltekit.json`. Kit may warn that the root tsconfig does
not extend its generated config; that root intentionally remains Astro-owned.

`wrangler.sveltekit.jsonc` is separate from production configuration, with no
custom domains, production routes, secrets or data bindings. The adapter writes
`.svelte-kit/cloudflare/_worker.js` and assets in `.svelte-kit/cloudflare/`; generated
output is ignored. Development binding emulation is disabled, and Kit/Vite discover
environment files only under `src/kit/`, not the root authentication environment.
No candidate deployment command is provided. Existing Astro commands are unchanged.

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
