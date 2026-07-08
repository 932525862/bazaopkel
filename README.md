# Tourland CRM — Director's Hub

A modern, role-based CRM admin dashboard for **Tourland**, built with React 19, TanStack Start, and Tailwind CSS v4. Provides separate, scoped experiences for **Directors** and **Employees** with real-time updates via WebSockets.

---

## Features

### Director Role
- 📊 **Dashboard** — Overview stats and analytics with Recharts
- 👥 **Employees** — Manage employee records and profiles
- 🏢 **Departments** — View and organize departments
- ✅ **Tasks** — Create and assign tasks, real-time sync
- 📋 **Forms** — Review and manage submitted forms
- 🧑‍💼 **Clients** — Full client management
- 📅 **Attendance** — Track employee attendance
- 🗃️ **Archive** — Archived records

### Employee Role
- 🏠 **Dashboard** — Personal summary and stats
- ✅ **Tasks** — View and update assigned tasks in real-time
- 📋 **Forms** — Submit and track forms
- 🏢 **Departments** — View department info
- 📅 **Attendance** — View personal attendance
- 👤 **Profile** — Manage personal profile
- 🗃️ **Archive** — Personal archived records

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [TanStack Start](https://tanstack.com/start) + [TanStack Router](https://tanstack.com/router) |
| UI | React 19, Radix UI, shadcn/ui primitives |
| Styling | Tailwind CSS v4 |
| Localization | Professional Uzbek (Asia/Tashkent Timezone) |
| Forms | React Hook Form + Zod |
| Data Fetching | TanStack Query v5 |
| Real-time | Socket.IO Client |
| Charts | Recharts |
| Build | Vite 7 |
| Deployment | Vercel (SSR optimized) |

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm / pnpm

### Installation

```bash
# Clone the repo
git clone git@github.com:Kamalov-Q/Tourland-CRM-Admin.git
cd Tourland-CRM-Admin

# Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the root:

```env
VITE_API_URL=https://your-api.com
VITE_SOCKET_URL=https://your-api.com
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

---

## Project Structure

```
src/
├── routes/                    # File-based routing (TanStack Router)
│   ├── index.tsx              # Login / landing
│   ├── director.*.tsx         # Director-scoped pages
│   ├── employee.*.tsx         # Employee-scoped pages
│   └── __root.tsx             # Application shell & SSR setup
├── components/                # Shared UI components (shadcn/ui)
├── hooks/                     # Custom React hooks
├── lib/                       # API clients, state store, & utilities
│   ├── date-utils.ts          # Uzbek localization & timezone logic
│   └── store.ts               # Global state management
└── styles.css                 # Global styles (Tailwind v4)
```

---

## Deployment

This project is built using **TanStack Start** and is optimized for **Server-Side Rendering (SSR)**.

### Vercel Deployment

Pushing to the `main` branch triggers an automatic deployment.
- **SSR**: No `vercel.json` rewrites are needed; the framework handles routing and server-side rendering natively.
- **Timezone**: The application uses `Asia/Tashkent` globally for consistency across all modules (Attendance, Tasks, Archive).

---

## License

Private — © Tourland. All rights reserved.
# tourland-crm
# Tourland-Logs
