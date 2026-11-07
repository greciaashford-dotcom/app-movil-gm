# GM Conecta – PRD

## Problem statement
Expo (mobile + web) app "GM Conecta" for GM Reforma Express (Madrid): clients request quotes / 24h emergencies and follow their requests; one app with role switcher (Cliente, Admin GM Conecta, Trabajador, Ferretería), staff roles protected by a PIN. Backend FastAPI + MongoDB.

## User choices
- PIN per role for Admin / Trabajador / Ferretería (client needs no login)
- Admin alert email: not provided → editable in Admin › Configuración (alerts are simulated until set)
- "Mis solicitudes" = requests sent from this device (+ lookup by number + phone)
- Email provider: Emergent Managed Email (Resend) – real emails (placeholder domains like example.com are simulated)

## Architecture
- backend/core.py (models, auth, helpers), server.py (public, auth, files, worker, store), admin_routes.py (admin CRM/finance), email_service.py (Emergent email + guardrails + templates), storage_service.py (Emergent Object Storage), seed.py (idempotent demo data)
- frontend: expo-router; (tabs) client area; /admin/*, /trabajador/*, /ferreteria-panel role stacks (RoleStack guard); drawer with role selector + PIN form
- Photos: POST /api/upload → Object Storage (magic-byte validated), served via /api/files/{path}

## Implemented (tested – iteration_1 + backend pytest 26/26)
- Client: home, services, quote/urgency form (≤5 photos), confirmation, Mis solicitudes, store directory, contact
- Admin: dashboard, requests + email reply, clients, quotes (lines, IVA, send, accept → convert to obra), obras (real profitability, purchases, labour, cobros, photos), workers, finance EMPRESA vs PERSONAL_HOGAR, agenda, gestoría + CSV (short-lived download token), ferreterías & comisiones, configuración (integrations status, alert email, test email, simulation toggle, fiscal data)
- Worker panel: assigned works, location + directions, progress %, phase photos, materials, team, office notes
- Store panel: promotions CRUD (pause/publish, image, end date), store info, referred clients
- Security: per IP and per-account PIN lockout, invoices (numbered income) cannot be deleted / reverted

## Branding / Home (Nov 2026)
- Logo: assets/images/gm-logo-trim.png (client artwork trimmed of padding); app icon from client's "Icono GMConecta" art
- Home redesigned after the client's mockup: big logo + "Una plataforma de GM Reforma Express" pill, navy arc into white hero, hero photo (assets/images/home-hero.jpg, from the mockup) on the right with fade, 2×2 horizontal service cards with filled SVG art (src/ui/ServiceArt.tsx), 24h urgency block with siren art + call/send buttons

## Credentials
See /app/memory/test_credentials.md (admin 1234, workers 1111, stores 2222)

## Backlog
- P1: set the real alert email in Configuración; change seeded PINs before going live
- P2: corrective invoices (rectificativas), delete/archive solicitudes/presupuestos/obras
- P2: split admin_routes.py into modules
- Test data cleanup helper: backend/tests/cleanup_test_data.py
