import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { renderer } from './renderer'
import { getAuth } from './lib/auth'
import apiKeysRouter from './routes/api-keys'
import organizationsRouter from './routes/organizations'
import { HonoContext } from './types'

const app = new OpenAPIHono<HonoContext>();

app.use(renderer)

app.use(async (c, next) => {
  // cache env and auth on context variables
  c.set('env', c.env)
  c.set('auth', getAuth(c.env))
  return next()
})

const NODE_ENV = (import.meta as any).env?.NODE_ENV || process.env.NODE_ENV
const ALLOWED_ORIGINS = new Set<string>([
  'https://auth.capyschool.com',
  'https://capyschool.com',
  'https://www.capyschool.com',
  'https://cms.capyschool.com',
])
if (NODE_ENV === 'development') {
  ALLOWED_ORIGINS.add('http://localhost:4321')
}

function setCorsHeaders(origin: string, headers: Headers) {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin')
    headers.set('Access-Control-Allow-Credentials', 'true')
  }
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
}

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary: 'Health check',
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({ status: z.string(), timestamp: z.string() }),
        },
      },
    },
  },
})

app.openapi(healthRoute, (c: any) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Expose Better Auth handler under /api/auth/* with CORS and preflight handling
app.all('/api/auth/*', async (c: any) => {
  const req = c.req.raw
  const origin = c.req.header('origin') || ''
  const isPreflight = req.method === 'OPTIONS'

  if (isPreflight) {
    const headers = new Headers()
    setCorsHeaders(origin, headers)
    headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    return new Response(null, { status: 204, headers })
  }

  const auth = c.get('auth')
  const res = await auth.handler(req)

  // If origin allowed, append CORS headers to response
  const headers = new Headers(res.headers)
  setCorsHeaders(origin, headers)
  return new Response(res.body, { status: res.status, headers })
})

app.options('/api/session', (c: any) => {
  const origin = c.req.header('origin') || ''
  const headers = new Headers()
  setCorsHeaders(origin, headers)
  headers.set('Access-Control-Allow-Methods', 'GET,OPTIONS')
  return new Response(null, { status: 204, headers })
})

const sessionRoute = createRoute({
  method: 'get',
  path: '/api/session',
  tags: ['Session'],
  summary: 'Get current session',
  responses: {
    200: { description: 'Session', content: { 'application/json': { schema: z.any() } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
  },
})

app.openapi(sessionRoute, async (c) => {
  const origin = c.req.header('origin') || ''
  const auth = c.var.auth
  const session = await auth.api.getSession({ headers: c.req.raw.headers })

  //
  const a = await auth.api.verifyEmail({
    query: {token: 'a', }
  })
  console.log(a)

  const b = await auth.api.verifyApiKey({
    body: {key: 'a',  },
    headers: c.req.raw.headers,
    method: 'POST',
    path: '/api/api-keys/verify',
    query: {key: 'a', },
    
  })
  console.log(b)

  const headers = new Headers()
  setCorsHeaders(origin, headers)
  headers.set('Content-Type', 'application/json')

  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })
  }

  return new Response(JSON.stringify(session), { status: 200, headers })
})


// Mount split routers
app.route('/api/api-keys', apiKeysRouter)
app.route('/api/organizations', organizationsRouter)

app.doc('/doc', {
  openapi: '3.0.0',
  info: { title: 'Auth API', version: '1.0.0', description: 'Authentication service (Better Auth) with session and management proxies' },
  servers: [
    { url: 'http://localhost:5173', description: 'Local' },
    { url: 'https://auth.capyschool.com', description: 'Production' },
  ],
  tags: [
    { name: 'Health', description: 'Service status' },
    { name: 'Session', description: 'Session endpoints' },
    { name: 'API Keys', description: 'Manage API keys (proxy to Better Auth)' },
    { name: 'Organizations', description: 'Manage organizations (proxy to Better Auth)' },
  ],
})

app.get('/', Scalar({ url: '/doc' }))
app.get('/docs', Scalar({ url: '/doc' }))

export default app

