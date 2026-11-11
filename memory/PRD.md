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
- Home is width-responsive (useHomeSizes in app/(tabs)/index.tsx, 390pt reference): compact 2-line H1, CTA label always fits (font from available width, chevron hidden <330pt), stacked urgency buttons <340pt; PillButton accepts textStyle and auto-shrinks on native
- Home first view (Jun 2026): hero description removed, service cards always 2×2 with title only (no description, chevron hidden <350pt, title font from card width), height-aware compact spacing (<720pt). Hero grows with spare height (max ~300) and photo is sized from measured hero height (never cropped). Hero + services + 24h urgencies fit without scrolling on ≥360×640; 320×568 still needs a small scroll

## Accounts + PIN (Jun 2026, iteration 2 – tested 42/42 backend + all frontend flows)
- Everyone must sign in before using the app: email + password (register / login) or "Continuar con Google" (Emergent managed Google auth). Root gate in app/_layout.tsx (Stack.Protected) → /login, /registro; account saved on the device (60-day session) like Instagram
- Backend: account_routes.py (/api/cuenta/registro, /cuenta/login, /cuenta/me, /cuenta/logout, /auth/session for Google); accounts + account_sessions collections; header X-Account-Token; 401s tagged X-Auth-Error (account|staff)
- Staff modes (Admin / Trabajador / Ferretería) need a signed-in account + personal 6-digit PIN (no sequences/repeats/common PINs). Profile linked to the first account that enters its PIN; other accounts get 403. Signing out or admin unlink ends the staff mode
- Change own PIN (drawer › Cambiar mi PIN), Admin › Accesos y PIN (change any PIN, unlink accounts); new workers/stores require a valid 6-digit PIN
- Old 4-digit PINs migrated on startup (seed.migrate_pins); unknown profiles get "PIN pendiente" for the admin to set
- Requests and photo uploads require an account; Mis solicitudes shows the account's requests + device ones; request form prefills name/email
- Lockouts: per IP and per account+profile (5), global ceiling per profile (100) / email (50); sign-up limit 10 per IP / 15 min
- iOS: frontend deps aligned with Expo Go SDK 58 (expo install --fix; expo-doctor 20/20). Expo was not running in this fork (node_modules / pwdlib missing) – restored

## Credentials
See /app/memory/test_credentials.md (admin 582047; each worker/store has its own 6-digit PIN)

## Backlog
- P1: set the real alert email in Configuración; change the seeded PINs (Accesos y PIN) before going live
- P1: password reset by email ("¿Olvidaste tu contraseña?")
- P2: corrective invoices (rectificativas), delete/archive solicitudes/presupuestos/obras
- P2: split admin_routes.py into modules
- Test helpers: backend/tests/cleanup_test_data.py, backend/tests/cleanup_accounts.py (unlinks profiles, deletes test accounts)
