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

Get all organizations that the API key holder belongs to.

**Endpoint:** `GET /api/organizations`

**Headers:** `X-API-Key` or `Authorization: Bearer {key}`

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
# With X-API-Key header
curl -X GET https://auth.capyschool.com/api/organizations \
  -H "X-API-Key: your-api-key"

# With Bearer token
curl -X GET https://auth.capyschool.com/api/organizations \
  -H "Authorization: Bearer your-api-key"
```

**Legacy Endpoint:**
The old endpoint `/api/key-organizations` (POST/GET) has been disabled. Use the new endpoint above.

---

### 3. Check Organization Status

Check payment and consumption status for organizations. Returns status for all organizations the API key holder belongs to, or filter by a specific organization slug.

**Endpoint:** `GET /api/organizations/status`

**Headers:** `X-API-Key` or `Authorization: Bearer {key}`

**Query Parameters (optional):**
- `slug` - Filter status for a specific organization

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
        "organization": {
          "id": "org-id",
          "name": "Organization Name",
          "slug": "org-slug"
        },
        "membership": {
          "role": "owner",
          "memberSince": "2024-01-01T00:00:00.000Z"
        },
        "status": {
          "canConsume": true,
          "paymentStatus": "active",
          "consumptionLimits": {
            "maxRequests": 10000,
            "usedRequests": 1234
          },
          "active": true
        }
      }
    ],
    "totalOrganizations": 1
  }
}
```

**Response with slug filter (Success - 200):**
When filtering by slug, the response includes convenience fields at root level:
```json
{
  "success": true,
  "data": {
    "keyId": "key-id",
    "keyName": "My API Key",
    "userId": "user-id",
    "organization": {
      "id": "org-id",
      "name": "Organization Name",
      "slug": "org-slug"
    },
    "membership": {
      "role": "owner",
      "memberSince": "2024-01-01T00:00:00.000Z"
    },
    "status": {
      "canConsume": true,
      "paymentStatus": "active",
      "consumptionLimits": null,
      "active": true
    },
    "organizations": [...],
    "totalOrganizations": 1
  }
}
```

**Error Responses:**
- `400`: API key is required
- `401`: Invalid API key or expired
- `403`: User is not a member of any organization (or specified organization not found)
- `500`: Internal server error

**Example Usage:**

```bash
# Get status for all organizations
curl -X GET https://auth.capyschool.com/api/organizations/status \
  -H "X-API-Key: your-api-key"

# Get status for specific organization
curl -X GET "https://auth.capyschool.com/api/organizations/status?slug=capyschool" \
  -H "Authorization: Bearer your-api-key"
```

**Use Cases:**
- Check if user can consume API resources before processing requests
- Verify payment status and subscription tier
- Monitor consumption limits and usage
- Implement feature gating based on organization status

**Payment Status Values:**
- `active`: Organization has active payment, full access
- `trial`: Organization is in trial period
- `suspended`: Payment issues, limited or no access
- `cancelled`: Subscription cancelled

**Note:** The `status` object can be customized based on your business logic by modifying the organization's metadata in the database.

---

### 4. Get Organization Details by Slug

Get detailed information about a specific organization including membership info and statistics.

**Endpoint:** `GET /api/organizations/:slug`

**Headers:** `X-API-Key` or `Authorization: Bearer {key}`

**URL Parameters:**
- `slug` - Organization slug (e.g., `capyschool`, `my-org`)

**Response (Success - 200):**
```json
{
  "success": true,
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
    },
    "stats": {
      "totalMembers": 15
    }
  }
}
```

**Error Responses:**
- `400`: Organization slug or API key is required
- `401`: Invalid API key or expired
- `403`: Organization not found or user not authorized
- `500`: Internal server error

**Example Usage:**

```bash
# Get organization details
curl -X GET https://auth.capyschool.com/api/organizations/capyschool \
  -H "X-API-Key: your-api-key"

# With Bearer token
curl -X GET https://auth.capyschool.com/api/organizations/my-org \
  -H "Authorization: Bearer your-api-key"
```

**Use Cases:**
- Display organization profile information
- Show organization details in admin dashboards
- Get organization metadata and configuration
- Check member count and statistics

---

### 5. Verify Organization Access

Verify if an API key has access to a specific organization by slug.

**Endpoint:** `GET /api/organization/:slug/verify`

**Headers:** `X-API-Key` or `Authorization: Bearer {key}`

**URL Parameters:**
- `slug` - Organization slug (e.g., `capyschool`, `my-org`)

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
# With X-API-Key header
curl -X GET https://auth.capyschool.com/api/organization/capyschool/verify \
  -H "X-API-Key: your-api-key"

# With Bearer token
curl -X GET https://auth.capyschool.com/api/organization/my-org/verify \
  -H "Authorization: Bearer your-api-key"
```

**Use Cases:**
- Verify a user has access to a specific organization before allowing operations
- Validate organization membership in microservices
- Check user's role in an organization for authorization decisions

**Legacy Endpoint:**
The old endpoint `/api/verify-organization` (POST/GET with body/query params) is still available but deprecated. Use the new RESTful endpoint above.

---

### 6. Check Organization Status by Slug

Check payment and consumption status for a specific organization by slug.

**Endpoint:** `GET /api/organizations/:slug/status`

**Headers:** `X-API-Key` or `Authorization: Bearer {key}`

**URL Parameters:**
- `slug` - Organization slug (e.g., `capyschool`, `my-org`)

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "keyId": "key-id",
    "keyName": "My API Key",
    "userId": "user-id",
    "organization": {
      "id": "org-id",
      "name": "Organization Name",
      "slug": "org-slug"
    },
    "membership": {
      "role": "owner",
      "memberSince": "2024-01-01T00:00:00.000Z"
    },
    "status": {
      "canConsume": true,
      "paymentStatus": "active",
      "consumptionLimits": {
        "maxRequests": 10000,
        "usedRequests": 1234
      },
      "active": true
    }
  }
}
```

**Error Responses:**
- `400`: Organization slug or API key is required
- `401`: Invalid API key or expired
- `403`: Organization not found or user not authorized
- `500`: Internal server error

**Example Usage:**

```bash
# Get status for specific organization
curl -X GET https://auth.capyschool.com/api/organizations/capyschool/status \
  -H "X-API-Key: your-api-key"

# With Bearer token
curl -X GET https://auth.capyschool.com/api/organizations/my-org/status \
  -H "Authorization: Bearer your-api-key"
```

**Use Cases:**
- Check if organization can consume API resources
- Verify payment status for a specific organization
- Monitor consumption limits for an organization
- Gate features based on organization status

---

### 7. Verify Consumption Authorization (Legacy)

Verify if an API key holder can consume resources. This endpoint is hardcoded to only allow consumption for users who are members of the `capyschool` organization.

**Note:** Consider using `/api/organizations/status` instead, which provides more flexible organization status checking.

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

### 8. Get Organization Members

Get all members of an organization using an API key. The API key holder must be a member of the organization to view its members.

**Endpoint:** `GET /api/organization/:slug/members`

**Headers:** `X-API-Key` or `Authorization: Bearer {key}`

**URL Parameters:**
- `slug` - Organization slug (e.g., `capyschool`, `my-org`)

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "organization": {
      "id": "org-id",
      "name": "Organization Name",
      "slug": "org-slug"
    },
    "requestingUser": {
      "userId": "user-id",
      "role": "owner"
    },
    "members": [
      {
        "memberId": "member-id",
        "userId": "user-id",
        "role": "owner",
        "memberSince": "2024-01-01T00:00:00.000Z",
        "user": {
          "id": "user-id",
          "name": "John Doe",
          "email": "john@example.com",
          "image": "https://example.com/avatar.png",
          "emailVerified": true
        }
      }
    ],
    "totalMembers": 1
  }
}
```

**Error Responses:**
- `400`: API key or organization slug is required
- `401`: Invalid API key or expired
- `403`: Organization not found or user not authorized to view members
- `500`: Internal server error

**Example Usage:**

```bash
# With X-API-Key header
curl -X GET https://auth.capyschool.com/api/organization/capyschool/members \
  -H "X-API-Key: your-api-key"

# With Bearer token
curl -X GET https://auth.capyschool.com/api/organization/my-org/members \
  -H "Authorization: Bearer your-api-key"
```

**Use Cases:**
- List all members of an organization for admin dashboards
- Sync organization membership to external systems
- Audit organization access and roles
- Build member management interfaces

**Member Roles:**
- `owner`: Organization owner with full permissions
- `admin`: Administrator with most permissions
- `member`: Regular member with basic permissions

**Legacy Endpoint:**
The old endpoint `/api/organization-members` (POST/GET with body/query params) is still available but deprecated. Use the new RESTful endpoint above.

---

## User Endpoints (API Key Authentication)

### 9. Get Users List (Paginated)

Get all users that belong to the same organizations as the API key holder. The API key holder is excluded from results. Supports pagination.

**Endpoint:** `GET /api/users`

**Headers:** `X-API-Key` or `Authorization: Bearer {key}`

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)
- `organizationSlug` - Optional: Filter users by specific organization

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "requestingUser": {
      "userId": "user-id",
      "keyId": "key-id",
      "keyName": "My API Key"
    },
    "users": [
      {
        "id": "user-id-2",
        "name": "John Doe",
        "email": "john@example.com",
        "image": "https://example.com/avatar.png",
        "emailVerified": true,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "organizations": [
          {
            "organizationId": "org-id",
            "organizationName": "Organization Name",
            "organizationSlug": "org-slug",
            "role": "member",
            "memberSince": "2024-01-01T00:00:00.000Z"
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3,
      "hasNext": true,
      "hasPrevious": false,
      "next": "https://auth.capyschool.com/api/users?page=2&limit=20",
      "previous": null,
      "first": "https://auth.capyschool.com/api/users?page=1&limit=20",
      "last": "https://auth.capyschool.com/api/users?page=3&limit=20"
    }
  }
}
```

**Example Usage:**

```bash
# Get first page (default 20 items)
curl -X GET https://auth.capyschool.com/api/users \
  -H "X-API-Key: your-api-key"

# Get page 2 with 50 items
curl -X GET "https://auth.capyschool.com/api/users?page=2&limit=50" \
  -H "Authorization: Bearer your-api-key"

# Filter by organization
curl -X GET "https://auth.capyschool.com/api/users?organizationSlug=capyschool" \
  -H "X-API-Key: your-api-key"
```

**Use Cases:**
- List all users in your organizations for admin interfaces
- Build user directories and member lists
- Sync user data to external systems
- Search and filter organization members

---

### 10. Get User Details by ID

Get detailed information about a specific user including their organization memberships and statistics. Can only view users in your organizations.

**Endpoint:** `GET /api/users/:id`

**Headers:** `X-API-Key` or `Authorization: Bearer {key}`

**URL Parameters:**
- `id` - User ID

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-id",
      "name": "John Doe",
      "email": "john@example.com",
      "image": "https://example.com/avatar.png",
      "emailVerified": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    "organizations": [
      {
        "id": "org-id",
        "name": "Organization Name",
        "slug": "org-slug",
        "logo": "https://example.com/logo.png",
        "metadata": {
          "custom": "data"
        },
        "role": "member",
        "memberSince": "2024-01-01T00:00:00.000Z",
        "createdAt": "2023-12-01T00:00:00.000Z"
      }
    ],
    "stats": {
      "totalOrganizations": 1,
      "activeSessions": 2,
      "apiKeys": 3
    }
  },
  "meta": {
    "requestingUserId": "your-user-id",
    "keyId": "key-id",
    "keyName": "My API Key"
  }
}
```

**Error Responses:**
- `400`: User ID is required or API key missing
- `401`: Invalid API key
- `403`: Forbidden - Can only view users in your organizations
- `404`: User not found
- `500`: Internal server error

**Example Usage:**

```bash
# Get user details
curl -X GET https://auth.capyschool.com/api/users/user-123 \
  -H "X-API-Key: your-api-key"

# With Bearer token
curl -X GET https://auth.capyschool.com/api/users/user-123 \
  -H "Authorization: Bearer your-api-key"
```

**Use Cases:**
- Display user profile information
- Show user's organization memberships and roles
- View user activity statistics (sessions, API keys)
- Build user detail pages for admin dashboards

---

### 11. Get User Status by ID

Check organization status and consumption authorization for a specific user. Can only view status for users in your organizations.

**Endpoint:** `GET /api/users/:id/status`

**Headers:** `X-API-Key` or `Authorization: Bearer {key}` (or user session)

**URL Parameters:**
- `id` - User ID

**Query Parameters (optional):**
- `slug` - Filter status for a specific organization

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-id",
      "name": "John Doe",
      "email": "john@example.com",
      "image": "https://example.com/avatar.png"
    },
    "organizations": [
      {
        "organization": {
          "id": "org-id",
          "name": "Organization Name",
          "slug": "org-slug"
        },
        "membership": {
          "role": "member",
          "memberSince": "2024-01-01T00:00:00.000Z"
        },
        "status": {
          "canConsume": true,
          "paymentStatus": "active",
          "consumptionLimits": null,
          "active": true
        }
      }
    ],
    "totalOrganizations": 1
  },
  "meta": {
    "authType": "apiKey",
    "requestingUserId": "your-user-id"
  }
}
```

**Error Responses:**
- `400`: User ID is required
- `401`: Authentication required
- `403`: Forbidden - Can only view users in your organizations
- `404`: User not found or not a member of any organization
- `500`: Internal server error

**Example Usage:**

```bash
# Get status for a specific user
curl -X GET https://auth.capyschool.com/api/users/user-123/status \
  -H "X-API-Key: your-api-key"

# Get status for specific organization
curl -X GET "https://auth.capyschool.com/api/users/user-123/status?slug=capyschool" \
  -H "Authorization: Bearer your-api-key"
```

**Use Cases:**
- Check if a team member can access resources
- Verify user's organization membership and roles
- Audit user permissions across organizations
- Build user detail pages with status information

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
