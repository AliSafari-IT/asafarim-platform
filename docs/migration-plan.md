# ASafarIM Platform Monorepo Migration Plan

## Summary

We want to recreate and modernize the current ASafarIM codebases into one clean monorepo named:

```txt
asafarim-platform
```

The new platform should mainly use:

```txt
Next.js
TypeScript
PostgreSQL
Docker
Docker Compose
pnpm workspaces
Turborepo
Shared SSO/authentication
One-command deployment to VPS
```

The goal is to bring multiple existing projects into one structured platform while keeping the codebase maintainable, scalable, and easy to deploy.

Current codebases are located at:

```txt
F:\repos\asafarim-digital
D:\repos\asafarim-dot-be
D:\repos\asafarim
```

These should be reviewed, cleaned, and selectively migrated into the new monorepo.

---

# Project Naming

## GitHub Repository Name

```txt
asafarim-platform
```

## Company / Umbrella Brand

```txt
ASafarIM Digital
```

## Platform Name

```txt
ASafarIM Platform
```

## Main User-Facing Product

```txt
ASafarIM Hub
```

## Possible Sub-Products

```txt
ASafarIM Showcase
ASafarIM Labs
ASafarIM Admin
ASafarIM API
```

---

# High-Level Goal

Create one monorepo that contains:

```txt
Main website
Dashboard / Hub
Showcase apps
Admin tools
Backend API
Shared UI components
Shared authentication logic
Shared database access
Shared configuration
Dockerized deployment
Infrastructure scripts
```

The new platform should be deployable to a VPS with one command from the local machine.

Example target command:

```bash
pnpm deploy:prod
```

---

# Existing Projects to Review

The developer should inspect these existing folders:

```txt
F:\repos\asafarim-digital
D:\repos\asafarim-dot-be
D:\repos\asafarim
```

For each project, identify:

```txt
What pages exist
What apps/features exist
What should be migrated
What should be removed
What should be rewritten
What assets should be reused
What environment variables are required
What domains/subdomains are currently used
What APIs or databases are currently used
```

Do not blindly copy old code. The goal is to recreate the platform cleanly, using the old codebases as references.

---

# Proposed Monorepo Structure

Create the new repository with this structure:

```txt
asafarim-platform/
├─ apps/
│  ├─ web/                 # Main ASafarIM Digital website
│  ├─ hub/                 # Logged-in ASafarIM Hub dashboard
│  ├─ showcase/            # Public showcase apps
│  ├─ admin/               # Admin panel
│  └─ api/                 # Backend API
│
├─ packages/
│  ├─ ui/                  # Shared React UI components
│  ├─ auth/                # Shared authentication helpers
│  ├─ db/                  # PostgreSQL client, Prisma schema, migrations
│  ├─ config/              # Shared TypeScript, ESLint, Tailwind config
│  ├─ utils/               # Shared utility functions
│  └─ types/               # Shared TypeScript types
│
├─ infra/
│  ├─ caddy/               # Reverse proxy config
│  ├─ docker/              # Docker-related files
│  └─ scripts/             # Deployment scripts
│
├─ docs/
│  ├─ migration-notes.md
│  ├─ architecture.md
│  └─ deployment.md
│
├─ docker-compose.yml
├─ docker-compose.prod.yml
├─ pnpm-workspace.yaml
├─ package.json
├─ turbo.json
├─ .env.example
├─ .gitignore
└─ README.md
```

---

# Recommended Apps

## `apps/web`

Purpose:

```txt
Public ASafarIM Digital website
```

This app should contain:

```txt
Homepage
About page
Services page
Portfolio / projects page
Contact page
Legal pages
```

Possible domain:

```txt
asafarim.com
www.asafarim.com
```

---

## `apps/hub`

Purpose:

```txt
Main logged-in user dashboard
```

This is the central place where users can access apps, tools, demos, and profile settings.

Possible domain:

```txt
hub.asafarim.com
```

This app should contain:

```txt
Login redirect
Dashboard
User profile
App launcher
Account settings
Billing area if needed later
```

---

## `apps/showcase`

Purpose:

```txt
Public showcase area for demos, apps, and portfolio experiments
```

Possible domain:

```txt
showcase.asafarim.be
```

This app should contain:

```txt
Project cards
Demo pages
Small showcase apps
Case studies
Links to live apps
```

---

## `apps/admin`

Purpose:

```txt
Internal admin panel
```

Possible domain:

```txt
admin.asafarim.com
```

This app should contain:

```txt
User management
App management
Content management
Showcase management
System settings
```

This app must be protected by role-based authentication.

---

## `apps/api`

Purpose:

```txt
Backend API for shared platform logic
```

Possible domain:

```txt
api.asafarim.com
```

The API should handle:

```txt
Users
Authentication callbacks if needed
Projects
Showcase data
Admin actions
Contact messages
Audit logs
Shared backend services
```

Depending on the final architecture, this can be:

```txt
Next.js API routes
Next.js route handlers
Standalone Node.js API
.NET API if needed later
```

For the first version, prefer keeping things simple with Next.js route handlers unless a separate API service is clearly needed.

---

# Recommended Tooling

Use:

```txt
pnpm workspaces
Turborepo
Next.js
TypeScript
PostgreSQL
Prisma
Docker
Docker Compose
Caddy
```

Avoid starting with Nx unless we specifically need advanced workspace generators, strict project graph management, or more enterprise-level monorepo workflows.

For this project, Turborepo is enough because the main need is:

```txt
Shared packages
Fast builds
Simple workspace structure
Build orchestration
Easy deployment
```

---

# Package Manager

Use only:

```txt
pnpm
```

Do not use:

```txt
npm
yarn
bun
```

Add this to the root `package.json`:

```json
{
  "name": "asafarim-platform",
  "private": true,
  "packageManager": "pnpm@latest",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "format": "prettier --write .",
    "deploy:prod": "bash ./infra/scripts/deploy-prod.sh"
  },
  "devDependencies": {
    "turbo": "latest",
    "typescript": "latest",
    "prettier": "latest"
  }
}
```

---

# Workspace Configuration

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**", "build/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "outputs": []
    }
  }
}
```

---

# Database

Use:

```txt
PostgreSQL
Prisma
```

The Prisma schema should live in:

```txt
packages/db
```

Suggested structure:

```txt
packages/db/
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ src/
│  ├─ client.ts
│  └─ index.ts
├─ package.json
└─ tsconfig.json
```

The shared database package should expose a reusable Prisma client.

Example:

```ts
import { db } from "@asafarim/db";
```

The database should support at least:

```txt
User
Account
Session
Project
ShowcaseItem
App
Role
Permission
AuditLog
ContactMessage
```

---

# Authentication and SSO

The platform should support one login system across all apps.

Preferred initial approach:

```txt
Auth.js / NextAuth if most apps are Next.js
```

Better long-term approach:

```txt
Authentik or Keycloak for real cross-domain SSO
```

Because the platform may use both:

```txt
asafarim.com
asafarim.be
```

we should design authentication carefully. Cookies cannot simply be shared across different root domains. For true SSO between `.com` and `.be`, we should use an OIDC-compatible identity provider.

Recommended plan:

```txt
Phase 1:
Use Auth.js in the monorepo for simple authentication.

Phase 2:
Move to Authentik when multiple apps across multiple domains need real SSO.
```

Create shared auth code in:

```txt
packages/auth
```

Example usage:

```ts
import { authOptions } from "@asafarim/auth";
```

---

# Domain Plan

Suggested domain mapping:

```txt
asafarim.com              → apps/web
www.asafarim.com          → apps/web
hub.asafarim.com          → apps/hub
admin.asafarim.com        → apps/admin
api.asafarim.com          → apps/api
showcase.asafarim.be      → apps/showcase
labs.asafarim.be          → future experimental apps
auth.asafarim.com         → future SSO provider
```

---

# Docker Strategy

Use Docker for all deployable apps.

Each app should have its own Dockerfile:

```txt
apps/web/Dockerfile
apps/hub/Dockerfile
apps/showcase/Dockerfile
apps/admin/Dockerfile
apps/api/Dockerfile
```

Use Docker Compose at the root to run the full platform.

Development can run locally with:

```bash
pnpm dev
```

Production should run with:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

---

# Reverse Proxy

Use:

```txt
Caddy
```

Caddy should handle:

```txt
HTTPS
Automatic SSL certificates
Reverse proxy routing
Subdomain routing
```

Example Caddy config:

```txt
asafarim.com {
  reverse_proxy web:3000
}

www.asafarim.com {
  reverse_proxy web:3000
}

hub.asafarim.com {
  reverse_proxy hub:3000
}

admin.asafarim.com {
  reverse_proxy admin:3000
}

api.asafarim.com {
  reverse_proxy api:3000
}

showcase.asafarim.be {
  reverse_proxy showcase:3000
}
```

---

# Docker Compose Production Example

Create `docker-compose.prod.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_DB: asafarim
      POSTGRES_USER: asafarim
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - asafarim_net

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      NEXT_PUBLIC_APP_URL: https://asafarim.com
    depends_on:
      - postgres
    networks:
      - asafarim_net

  hub:
    build:
      context: .
      dockerfile: apps/hub/Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      NEXT_PUBLIC_APP_URL: https://hub.asafarim.com
    depends_on:
      - postgres
    networks:
      - asafarim_net

  showcase:
    build:
      context: .
      dockerfile: apps/showcase/Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      NEXT_PUBLIC_APP_URL: https://showcase.asafarim.be
    depends_on:
      - postgres
    networks:
      - asafarim_net

  admin:
    build:
      context: .
      dockerfile: apps/admin/Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      NEXT_PUBLIC_APP_URL: https://admin.asafarim.com
    depends_on:
      - postgres
    networks:
      - asafarim_net

  caddy:
    image: caddy:latest
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./infra/caddy/Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - web
      - hub
      - showcase
      - admin
    networks:
      - asafarim_net

networks:
  asafarim_net:

volumes:
  postgres_data:
  caddy_data:
  caddy_config:
```

---

# Environment Variables

Create `.env.example`:

```env
NODE_ENV=production

POSTGRES_PASSWORD=change_me

DATABASE_URL=postgresql://asafarim:change_me@postgres:5432/asafarim

AUTH_SECRET=change_me
AUTH_URL=https://hub.asafarim.com

NEXT_PUBLIC_COMPANY_NAME="ASafarIM Digital"
NEXT_PUBLIC_PLATFORM_NAME="ASafarIM Platform"
NEXT_PUBLIC_HUB_NAME="ASafarIM Hub"

NEXT_PUBLIC_WEB_URL=https://asafarim.com
NEXT_PUBLIC_HUB_URL=https://hub.asafarim.com
NEXT_PUBLIC_ADMIN_URL=https://admin.asafarim.com
NEXT_PUBLIC_API_URL=https://api.asafarim.com
NEXT_PUBLIC_SHOWCASE_URL=https://showcase.asafarim.be
```

Do not commit real `.env` files to GitHub.

---

# Deployment Goal

The final platform must be deployable from the local machine with:

```bash
pnpm deploy:prod
```

Create:

```txt
infra/scripts/deploy-prod.sh
```

Example script:

```bash
#!/usr/bin/env bash

set -euo pipefail

SERVER_USER="root"
SERVER_HOST="YOUR_VPS_IP_OR_DOMAIN"
PROJECT_DIR="/srv/asafarim-platform"
BRANCH="main"

echo "Deploying ASafarIM Platform..."

ssh "${SERVER_USER}@${SERVER_HOST}" << EOF
  set -euo pipefail

  cd "${PROJECT_DIR}"

  echo "Fetching latest code..."
  git fetch origin
  git checkout ${BRANCH}
  git pull origin ${BRANCH}

  echo "Installing dependencies..."
  corepack enable
  pnpm install --frozen-lockfile

  echo "Building monorepo..."
  pnpm build

  echo "Starting Docker containers..."
  docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

  echo "Running database migrations..."
  docker compose -f docker-compose.prod.yml exec -T hub pnpm --filter @asafarim/db prisma migrate deploy

  echo "Cleaning old Docker images..."
  docker image prune -f

  echo "Deployment finished."
EOF
```

---

# VPS Folder Structure

On the VPS, use:

```txt
/srv/asafarim-platform
```

The server should contain:

```txt
/srv/asafarim-platform/.env
/srv/asafarim-platform/docker-compose.prod.yml
/srv/asafarim-platform/infra/caddy/Caddyfile
```

---

# GitHub Strategy

Create one GitHub repository:

```txt
asafarim-platform
```

Recommended branch strategy:

```txt
main        → production
develop     → active development
feature/*   → feature branches
fix/*       → bug fixes
```

Example branches:

```txt
feature/initial-monorepo-setup
feature/database-prisma-setup
feature/auth-sso
feature/docker-deployment
feature/showcase-migration
feature/hub-dashboard
```

---

# Migration Strategy

## Phase 1 — Discovery

Review the existing projects:

```txt
F:\repos\asafarim-digital
D:\repos\asafarim-dot-be
D:\repos\asafarim
```

Create a migration inventory:

```txt
Pages
Components
APIs
Styles
Assets
Environment variables
Database usage
Authentication logic
Deployment scripts
Reusable business logic
Dead or outdated code
```

Output file:

```txt
docs/migration-notes.md
```

---

## Phase 2 — Monorepo Setup

Create the new monorepo:

```txt
asafarim-platform
```

Set up:

```txt
pnpm workspaces
Turborepo
TypeScript
ESLint
Prettier
Shared config package
Shared UI package
Shared utilities package
```

---

## Phase 3 — App Shells

Create empty but working app shells:

```txt
apps/web
apps/hub
apps/showcase
apps/admin
```

Each app should:

```txt
Build successfully
Run locally
Use shared UI package
Use shared config
Have its own route structure
Have its own environment variables
Be docker-ready
```

---

## Phase 4 — Database

Set up:

```txt
PostgreSQL
Prisma
packages/db
Initial schema
Migrations
Seed script
```

Add scripts:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
pnpm db:seed
```

---

## Phase 5 — Authentication

Implement shared authentication.

Initial requirements:

```txt
Login
Logout
Session handling
Protected routes
Role-based access
Shared user model
Admin-only access
```

Authentication should be reusable across:

```txt
apps/hub
apps/admin
apps/showcase if needed
```

---

## Phase 6 — Migrate Public Website

Migrate or recreate the best parts of:

```txt
F:\repos\asafarim-digital
D:\repos\asafarim-dot-be
D:\repos\asafarim
```

into:

```txt
apps/web
```

The public website should represent:

```txt
ASafarIM Digital
Services
Portfolio
Projects
Contact
Legal information
```

---

## Phase 7 — Build ASafarIM Hub

Create:

```txt
apps/hub
```

The Hub should include:

```txt
Dashboard
App launcher
Profile page
Account settings
Links to showcase apps
Links to admin panel if user is admin
```

---

## Phase 8 — Build ASafarIM Showcase

Create:

```txt
apps/showcase
```

The showcase should include:

```txt
Project list
Project detail pages
Live demo links
Tech stack tags
Screenshots
Case study content
```

---

## Phase 9 — Admin Panel

Create:

```txt
apps/admin
```

Admin should manage:

```txt
Users
Roles
Showcase items
Apps
Contact messages
System settings
```

---

## Phase 10 — Docker and VPS Deployment

Set up:

```txt
Dockerfiles
docker-compose.prod.yml
Caddy reverse proxy
Deployment script
VPS folder structure
Production environment file
```

Final deployment must work with:

```bash
pnpm deploy:prod
```

---

# Acceptance Criteria

The migration is successful when:

```txt
A new GitHub repo named asafarim-platform exists
The monorepo uses pnpm workspaces
The monorepo uses Turborepo
There are separate apps for web, hub, showcase, admin, and optionally api
Shared packages exist for ui, auth, db, config, utils, and types
PostgreSQL is used as the main database
Prisma is used for schema and migrations
Docker Compose can run the platform
Caddy routes the required domains/subdomains
Authentication works from the Hub
Admin routes are protected
The old codebases are reviewed and useful parts are migrated
Dead code is not copied blindly
The platform can be deployed to the VPS with one local command
Documentation exists in the docs folder
```

---

# Important Developer Notes

Do not create a messy copy of the old projects.

The new repository should be clean, modern, and maintainable.

The old codebases should only be used as references.

Prefer reusable shared packages instead of duplicated code.

Use pnpm only.

Use TypeScript everywhere.

Use PostgreSQL as the source of truth.

Use Docker for deployment.

Keep deployment simple.

Avoid over-engineering in the first version.

Do not introduce Nx unless there is a clear reason.

Do not create many microservices too early.

Start with a simple, working monorepo first, then improve it step by step.

---

# Preferred First Pull Request

The first PR should only set up the foundation.

Suggested branch:

```txt
feature/initial-monorepo-setup
```

The PR should include:

```txt
Root package.json
pnpm-workspace.yaml
turbo.json
apps/web placeholder
apps/hub placeholder
apps/showcase placeholder
apps/admin placeholder
packages/ui placeholder
packages/db placeholder
packages/auth placeholder
packages/config placeholder
docker-compose.prod.yml placeholder
infra/caddy/Caddyfile placeholder
.env.example
README.md
docs/architecture.md
docs/deployment.md
docs/migration-notes.md
```

Do not migrate all old features in the first PR.

The first PR should prove that the monorepo structure is correct and that all apps can build.

---

# Final Target

The final result should be:

```txt
ASafarIM Digital as the company brand
ASafarIM Platform as the technical ecosystem
ASafarIM Hub as the central logged-in dashboard
asafarim-platform as the GitHub monorepo
One VPS deployment command
One shared authentication system
One PostgreSQL database
Multiple apps under one clean architecture
```
