# Team

Initial full-stack project with a **Next.js** frontend and a **Node.js** backend API backed by **PostgreSQL**.

## Structure

```
Team/
├── frontend/   # Next.js 16 (App Router, TypeScript, Tailwind CSS)
├── backend/    # Node.js HTTP API (TypeScript + pg)
└── package.json
```

## Prerequisites

- Node.js 22+
- PostgreSQL running locally (default port `5432`)

## Setup

```bash
# Frontend
cd frontend && npm install && cd ..
cp frontend/.env.local.example frontend/.env.local

# Backend
cd backend && npm install && cd ..
cp backend/.env.example backend/.env
# Edit DATABASE_URL if your Postgres credentials differ

# Create the database and apply schema
npm --prefix backend run db:setup
npm --prefix backend run db:migrate
npm --prefix backend run db:check
```

## Development

```bash
npm run dev:backend    # http://localhost:4000
npm run dev:frontend   # http://localhost:3000
```

`GET /health` reports API status and a live PostgreSQL ping.

## Schema

**users**

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial | primary key |
| `name` | text | required |
| `email` | text | required, unique |
| `password` | text | required |
| `role` | enum | `Member` \| `SubBoss` \| `BigBoss` (default `Member`) |
| `balance` | double precision | required, default `0` |

**bid**

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial | primary key |
| `user_id` | integer | required, references `users(id)` |
| `url` | text | required |
| `proposal` | text | required, long text |
| `created_at` | timestamptz | required, default `NOW()` |

**report**

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial | primary key |
| `user_id` | integer | required, references `users(id)` |
| `working_time` | double precision | required |
| `message` | integer | required |
| `call` | integer | required |
| `offer` | integer | required |
| `accounts` | integer | required, default `0` |
| `created_at` | timestamptz | required, default `NOW()` |

**sub_team**

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial | primary key |
| `name` | text | required, unique |
| `user_ids` | integer[] | array of `users.id` values |

**target**

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial | primary key |
| `month` | integer | required |
| `week` | integer | required |
| `sub1` | double precision | required, default `0` |
| `sub2` | double precision | required, default `0` |
| `created_at` | timestamptz | required, default `NOW()` |

**financial**

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial | primary key |
| `user_id` | integer | required, references `users(id)` |
| `amount` | double precision | required, default `0` |
| `type` | text | required |
| `note` | text | required, default `''` |
| `day` | date | required, calendar day for the cell |
| `created_at` | timestamptz | required, default `NOW()` (set to cell day on save) |
| | | unique on `(user_id, type, day)` |

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check + database status |
| `POST` | `/api/auth/login` | Login → `{ token, user }` |
| `GET` | `/api/auth/me` | Verify JWT (`Authorization: Bearer <token>`) |
| `GET` | `/api` | API welcome payload |
| `GET` | `/api/sub-teams` | List sub teams with members |
| `GET` | `/api/users` | List all users (no passwords) |
| `GET` | `/api/targets` | Get the single target row |
| `PUT` | `/api/targets` | Update (or create) the single target row |
| `GET` | `/api/financial?from=&to=` | List financial rows in date range |
| `PUT` | `/api/financial` | Upsert today's financial cell |

Auth flow:

1. Open `/` → redirects to `/dashboard` if JWT is valid, otherwise `/login`
2. Login stores JWT in `localStorage` (`team.token`) and goes to `/dashboard`
3. Dashboard and session checks call `/api/auth/me`

Demo login (after `npm --prefix backend run db:seed`):

- Email: `demo@team.local`
- Password: `demo1234`

## Environment

**Frontend** (`frontend/.env.local`)

- `NEXT_PUBLIC_API_URL` — backend base URL (default `http://localhost:4000`)

**Backend** (`backend/.env`)

- `PORT` — API port (default `4000`)
- `FRONTEND_ORIGIN` — CORS origin (default `http://localhost:3000`)
- `DATABASE_URL` — PostgreSQL connection string (example: `postgresql://postgres:postgres@localhost:5432/team`)
- `DATABASE_POOL_MAX` — connection pool size (default `10`)
- `JWT_SECRET` — secret used to sign/verify JWT tokens
- `JWT_EXPIRES_IN` — token lifetime in seconds (default `604800` = 7 days)
