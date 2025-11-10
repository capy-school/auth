# API Endpoints Documentation

## Authentication & API Keys

### 1. Check API Key Information

Verify an API key and get associated user information.

**Endpoint:** `POST /api/key-info`

**Headers (alternative):** `GET /api/key-info` with `X-API-Key` or `Authorization: Bearer {key}`

**Request Body:**
```json
{
  "apiKey": "your-api-key-here"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "keyId": "key-id",
    "keyName": "My API Key",
    "userId": "user-id",
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "name": "User Name",
      "role": "user"
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "expiresAt": "2025-01-01T00:00:00.000Z",
    "lastUsedAt": "2024-11-08T00:00:00.000Z"
  }
}
```

**Error Responses:**
- `400`: API key is required
- `401`: Invalid API key or expired
- `500`: Internal server error

**Example Usage:**

```bash
# POST method
curl -X POST https://auth.capyschool.com/api/key-info \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "your-api-key"}'

# GET method with header
curl -X GET https://auth.capyschool.com/api/key-info \
  -H "X-API-Key: your-api-key"

# GET method with Bearer token
curl -X GET https://auth.capyschool.com/api/key-info \
  -H "Authorization: Bearer your-api-key"
```

---

### 2. Get Organizations for API Key

Get all organizations associated with an API key's user.

**Endpoint:** `POST /api/key-organizations`

**Headers (alternative):** `GET /api/key-organizations` with `X-API-Key` or `Authorization: Bearer {key}`

**Request Body:**
```json
{
  "apiKey": "your-api-key-here"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "keyId": "key-id",
    "keyName": "My API Key",
    "userId": "user-id",
    "organizations": [
      {
        "id": "org-id",
        "name": "Organization Name",
        "slug": "org-slug",
        "logo": "https://example.com/logo.png",
        "metadata": {
          "custom": "data"
        },
        "role": "owner",
        "memberSince": "2024-01-01T00:00:00.000Z",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "totalOrganizations": 1
  }
}
```

**Member Roles:**
- `owner`: Organization owner with full permissions
- `admin`: Administrator with most permissions
- `member`: Regular member with basic permissions

**Error Responses:**
- `400`: API key is required
- `401`: Invalid API key or expired
- `500`: Internal server error

**Example Usage:**

```bash
# POST method
curl -X POST https://auth.capyschool.com/api/key-organizations \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "your-api-key"}'

# GET method with header
curl -X GET https://auth.capyschool.com/api/key-organizations \
  -H "X-API-Key: your-api-key"

# GET method with Bearer token
curl -X GET https://auth.capyschool.com/api/key-organizations \
  -H "Authorization: Bearer your-api-key"
```

---

### 3. Verify Organization Access

Verify if an API key has access to a specific organization by slug.

**Endpoint:** `POST /api/verify-organization`

**Headers (alternative):** `GET /api/verify-organization?organizationSlug=slug` with `X-API-Key` or `Authorization: Bearer {key}`

**Request Body:**
```json
{
  "apiKey": "your-api-key-here",
  "organizationSlug": "org-slug"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "authorized": true,
  "data": {
    "keyId": "key-id",
    "keyName": "My API Key",
    "userId": "user-id",
    "organization": {
      "id": "org-id",
      "name": "Organization Name",
      "slug": "org-slug",
      "logo": "https://example.com/logo.png",
      "metadata": {
        "custom": "data"
      },
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "membership": {
      "role": "owner",
      "memberSince": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: API key or organization slug is required
- `401`: Invalid API key or expired
- `403`: Organization not found or user not authorized
- `500`: Internal server error

**Example Usage:**

```bash
# POST method
curl -X POST https://auth.capyschool.com/api/verify-organization \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "your-api-key", "organizationSlug": "my-org"}'

# GET method with header
curl -X GET "https://auth.capyschool.com/api/verify-organization?organizationSlug=my-org" \
  -H "X-API-Key: your-api-key"

# GET method with Bearer token
curl -X GET "https://auth.capyschool.com/api/verify-organization?organizationSlug=my-org" \
  -H "Authorization: Bearer your-api-key"
```

**Use Cases:**
- Verify a user has access to a specific organization before allowing operations
- Validate organization membership in microservices
- Check user's role in an organization for authorization decisions

---

### 4. Verify Consumption Authorization

Verify if an API key holder can consume resources. This endpoint is hardcoded to only allow consumption for users who are members of the `capyschool` organization.

**Endpoint:** `POST /api/verify-consumption`

**Headers (alternative):** `GET /api/verify-consumption` with `X-API-Key` or `Authorization: Bearer {key}`

**Request Body:**
```json
{
  "apiKey": "your-api-key-here"
}
```

**Response (Authorized - 200):**
```json
{
  "success": true,
  "canConsume": true,
  "data": {
    "keyId": "key-id",
    "keyName": "My API Key",
    "userId": "user-id",
    "organization": {
      "id": "org-id",
      "name": "CapySchool",
      "slug": "capyschool"
    },
    "membership": {
      "role": "owner",
      "memberSince": "2024-01-01T00:00:00.000Z"
    },
    "allowedOrganization": "capyschool"
  }
}
```

**Response (Not Authorized - 403):**
```json
{
  "success": false,
  "canConsume": false,
  "error": "Not authorized to consume resources",
  "reason": "User is not a member of the 'capyschool' organization",
  "requiredOrganization": "capyschool",
  "userId": "user-id"
}
```

**Error Responses:**
- `400`: API key is required
- `401`: Invalid API key or expired
- `403`: User not authorized (not a member of capyschool organization)
- `500`: Internal server error

**Example Usage:**

```bash
# POST method
curl -X POST https://auth.capyschool.com/api/verify-consumption \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "your-api-key"}'

# GET method with header
curl -X GET https://auth.capyschool.com/api/verify-consumption \
  -H "X-API-Key: your-api-key"

# GET method with Bearer token
curl -X GET https://auth.capyschool.com/api/verify-consumption \
  -H "Authorization: Bearer your-api-key"
```

**Use Cases:**
- Gate access to protected resources/services
- Verify user can consume API resources before processing requests
- Implement organization-based access control
- Track resource consumption by authorized users only

**Note:** This endpoint is specifically configured to only allow members of the `capyschool` organization. To change the allowed organization, modify the `ALLOWED_ORGANIZATION_SLUG` constant in the endpoint code.

---

## Authentication Endpoints (Better Auth)

### Sign Out
**Endpoint:** `POST /api/auth/sign-out`

**Redirect Flow:**
1. User clicks "Sign Out" button
2. Redirects to `/logout` page
3. User confirms sign out
4. Calls `/api/auth/sign-out`
5. Redirects to `/` (home)

---

## Notes

### API Key Security
- API keys are sensitive credentials and should be kept secure
- Keys automatically update `lastUsedAt` timestamp on each verification
- Expired keys are rejected automatically
- Keys should be passed via headers (preferred) or request body

### Organization Integration
- Organizations are fully integrated using Better Auth's organization plugin
- Users can be members of multiple organizations
- Each membership has a role (owner, admin, member)
- Organizations support metadata for custom fields

### Rate Limiting
Consider implementing rate limiting on these endpoints to prevent abuse.

### Database
- All endpoints use Kysely ORM with LibSQL (Turso)
- Transactions are not used for read operations
- Write operations (lastUsedAt) are async and non-blocking
