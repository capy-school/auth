import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { auth } from '../lib/auth'

const router = new OpenAPIHono()

async function forwardAndReturnJson(c: any, from: string, to: string) {
  const req = c.req.raw
  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace(from, to)
  const forwardReq = new Request(url.toString(), {
    method: req.method,
    headers: req.headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.clone().body ?? undefined,
  })
  const res = await auth.handler(forwardReq)
  const contentType = res.headers.get('content-type') || ''
  const status = res.status
  if (contentType.includes('application/json')) {
    const data = await res.json()
    return c.json(data, status)
  }
  const text = await res.text()
  return c.text(text, status)
}

const listApiKeysRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['API Keys'],
  summary: 'List API keys',
  responses: {
    200: { description: 'List of API keys', content: { 'application/json': { schema: z.any() } } },
  },
})

router.openapi(listApiKeysRoute, async (c: any) => {
  return forwardAndReturnJson(c, '/api/api-keys', '/api/auth/api-key')
})

const createApiKeyRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['API Keys'],
  summary: 'Create API key',
  request: {
    body: { content: { 'application/json': { schema: z.any() } } },
  },
  responses: {
    201: { description: 'API key created', content: { 'application/json': { schema: z.any() } } },
    200: { description: 'API key created', content: { 'application/json': { schema: z.any() } } },
  },
})

router.openapi(createApiKeyRoute, async (c: any) => {
  return forwardAndReturnJson(c, '/api/api-keys', '/api/auth/api-key')
})

export default router
