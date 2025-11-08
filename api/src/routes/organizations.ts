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

const listOrganizationsRoute = createRoute({
  method: 'get',
  path: '/organizations',
  tags: ['Organizations'],
  summary: 'List organizations',
  responses: {
    200: { description: 'List of organizations', content: { 'application/json': { schema: z.any() } } },
  },
})

router.openapi(listOrganizationsRoute, async (c: any) => {
  return forwardAndReturnJson(c, '/api/organizations', '/api/auth/organization')
})

const createOrganizationRoute = createRoute({
  method: 'post',
  path: '/organizations',
  tags: ['Organizations'],
  summary: 'Create organization',
  request: {
    body: { content: { 'application/json': { schema: z.any() } } },
  },
  responses: {
    201: { description: 'Organization created', content: { 'application/json': { schema: z.any() } } },
    200: { description: 'Organization created', content: { 'application/json': { schema: z.any() } } },
  },
})

router.openapi(createOrganizationRoute, async (c: any) => {
  return forwardAndReturnJson(c, '/api/organizations', '/api/auth/organization')
})

const updateOrganizationRoute = createRoute({
  method: 'patch',
  path: '/organizations',
  tags: ['Organizations'],
  summary: 'Update organization',
  request: {
    body: { content: { 'application/json': { schema: z.any() } } },
  },
  responses: {
    200: { description: 'Organization updated', content: { 'application/json': { schema: z.any() } } },
  },
})

router.openapi(updateOrganizationRoute, async (c: any) => {
  return forwardAndReturnJson(c, '/api/organizations', '/api/auth/organization')
})

const deleteOrganizationRoute = createRoute({
  method: 'delete',
  path: '/organizations',
  tags: ['Organizations'],
  summary: 'Delete organization',
  responses: {
    200: { description: 'Organization deleted', content: { 'application/json': { schema: z.any() } } },
  },
})

router.openapi(deleteOrganizationRoute, async (c: any) => {
  return forwardAndReturnJson(c, '/api/organizations', '/api/auth/organization')
})

export default router
