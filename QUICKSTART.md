# 🚀 Quick Start - 5 Minutes to Running

## Step 1: Create Environment File (30 seconds)

```bash
cat > .env << 'EOF'
# Local SQLite database (no Turso needed for testing)
TURSO_DATABASE_URL=file:local.db
TURSO_AUTH_TOKEN=

# Required auth secret (change this!)
BETTER_AUTH_SECRET=this-is-a-test-secret-change-in-production-min-32-chars

# Optional: Add OAuth credentials later
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
EOF
```

## Step 2: Create Database (10 seconds)

```bash
bun run db:migrate
```

You should see: `✅ Database migration completed successfully!`

## Step 3: Start Development Server (10 seconds)

```bash
bun dev
```

## Step 4: Open Browser

Visit: **http://localhost:4321**

You'll see a beautiful login gateway with 10 OAuth providers!

## What Works Right Now

✅ **Beautiful UI** - Fully functional login page
✅ **Database** - All tables created
✅ **Session Management** - Ready to track users
✅ **OAuth Ready** - Add credentials to enable providers

## What Needs Configuration

🔧 **OAuth Providers** - Add client IDs to enable Google, GitHub, Facebook, etc.
🔧 **Email Services** - Configure SMTP for Magic Link and OTP
🔧 **Advanced Features** - Passkey, 2FA, Organizations (require additional plugins)

## Quick OAuth Test - Google

1. **Get Google Credentials** (2 minutes)
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create OAuth Client ID
   - Add redirect: `http://localhost:4321/api/auth/callback/google`

2. **Add to .env**
   ```env
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```

3. **Restart server**
   ```bash
   bun dev
   ```

4. **Click "Google" button** - You'll be able to sign in!

## Quick OAuth Test - GitHub

1. **Get GitHub Credentials** (2 minutes)
   - Go to [GitHub Settings > Developer Settings](https://github.com/settings/developers)
   - New OAuth App
   - Add callback: `http://localhost:4321/api/auth/callback/github`

2. **Add to .env**
   ```env
   GITHUB_CLIENT_ID=your-client-id
   GITHUB_CLIENT_SECRET=your-client-secret
   ```

3. **Restart and test!**

## View Dashboard

After signing in with any provider, you'll be redirected to:
**http://localhost:4321/dashboard**

This shows:
- Your profile information
- Your role (user/admin)
- Security settings
- Sign out button

## Next Steps

- **See README.md** - Full documentation
- **See SETUP.md** - Detailed setup instructions
- **See PROJECT_SUMMARY.md** - Complete feature list

## Troubleshooting

### Port Already in Use
```bash
bun dev --port 3000
```

### Database Locked
```bash
rm local.db
bun run db:migrate
```

### OAuth Not Working
- Check callback URLs match exactly
- Verify credentials in `.env`
- Restart dev server after changing `.env`

## Deploy to Production

When ready:

1. **Get Turso Database** (free)
   ```bash
   curl -sSfL https://get.tur.so/install.sh | bash
   turso db create auth-gateway
   turso db show auth-gateway --url
   turso db tokens create auth-gateway
   ```

2. **Update .env**
   ```env
   TURSO_DATABASE_URL=libsql://your-db.turso.io
   TURSO_AUTH_TOKEN=your-token
   BETTER_AUTH_SECRET=<generate-strong-secret>
   ```

3. **Deploy**
   ```bash
   vercel
   # or
   netlify deploy
   ```

---

**That's it! You now have a production-ready authentication gateway! 🎉**
