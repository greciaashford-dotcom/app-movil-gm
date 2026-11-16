#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
user_problem_statement: "GM Conecta (GM Reforma Express) – Expo app with roles Cliente / Admin / Trabajador / Ferretería (PIN per role), client requests & 'Mis solicitudes' (this device), admin CRM (solicitudes, clientes, presupuestos→obra, obras rentabilidad, trabajadores, finanzas EMPRESA vs PERSONAL_HOGAR, agenda, gestoría CSV, ferreterías+comisiones, configuración), real email via Emergent managed Resend, photos in Emergent Object Storage."

backend:
  - task: "Full API (public, auth PIN, admin, worker, store, files, email)"
    implemented: true
    working: "NA"
    file: "backend/server.py, backend/admin_routes.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "New this session: POST /api/admin/configuracion/probar-email, StorePatch.imagen, AnuncioPatch.imagen + empty string clears fecha_fin/imagen. Real email verified once (confirmacion_cliente to delivered@resend.dev -> estado enviado)."

frontend:
  - task: "Worker panel (/trabajador, /trabajador/obra/[id])"
    implemented: true
    working: "NA"
    file: "frontend/app/trabajador/index.tsx, frontend/app/trabajador/obra/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
  - task: "Store panel (/ferreteria-panel) promotions CRUD + store info"
    implemented: true
    working: "NA"
    file: "frontend/app/ferreteria-panel/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
  - task: "Admin Ferreterías y comisiones + Configuración"
    implemented: true
    working: "NA"
    file: "frontend/app/admin/ferreterias.tsx, frontend/app/admin/configuracion.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
  - task: "Client flows + admin screens built previously (never tested)"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/*, frontend/app/admin/*"
    stuck_count: 0
    priority: "high"
    needs_retesting: true

agent_communication:
  - agent: "main"
    message: "Iteration 3: (1) Forgot password: link on /login → /recuperar; POST /api/cuenta/recuperar (always same answer, rate limited 3/email + 10/IP per 15 min) emails a 6-digit code (hash sha256(f'{email}:{code}') in password_resets, 15 min, 5 attempts); POST /api/cuenta/restablecer {email,codigo,password} sets password, deletes other sessions, returns {token,cuenta} (signs in). (2) Welcome with discount: new accounts have bienvenida_pendiente=true → home pushes /bienvenida once (POST /api/cuenta/bienvenida-vista); settings.descuento_bienvenida (default 5%) applies to the FIRST request of each account (Solicitud.descuento_bienvenida) and is pre-filled as descuento_porcentaje in the admin quote editor; /cuenta/me returns descuento_bienvenida (0 after first request). (3) Job notices (avisos.py): client emails on obra created (planificada), en_curso, pausada, reanudada, finalizada and 25/50/75% progress (admin PATCH /api/admin/obras/{id} and worker PATCH /api/trabajador/obras/{id}/avance), one-time events stored in obra.avisos_enviados; toggle settings.avisos_cliente in Admin › Configuración. Quote email 'Tu presupuesto está listo' shows the discount. (4) UI: buttons/icons standardised (ServiceIcon art in lists, EmptyState action icons, Google button style)."
  - agent: "main"
    message: "Iteration 2 (new session): (1) Mandatory app account before using the app: email+password register/login (/api/cuenta/registro, /api/cuenta/login, /api/cuenta/me, /api/cuenta/logout, header X-Account-Token) and Emergent Google auth (POST /api/auth/session). Root gate with Stack.Protected → /login, /registro. Session persists on device. (2) Staff PIN now 6 digits with complexity rules, requires account token, profile linked to the account on first PIN login (403 for other accounts), POST /api/auth/cambiar-pin, admin /api/admin/accesos (list, PATCH pin, DELETE link), screen /admin/accesos. New seeded PINs in /app/memory/test_credentials.md. POST /api/solicitudes and /api/upload now require an account; /api/solicitudes/mine also returns the account's requests. 401s carry header X-Auth-Error (account|staff). (3) iOS: frontend deps aligned with Expo Go SDK 58 (expo install --fix, expo-doctor 20/20)."
  - agent: "main"
    message: "First full test pass. Credentials in /app/memory/test_credentials.md. Use example.com emails for client requests (emails to placeholder domains are simulated, not sent)."
  - agent: "main"
    message: "Iteration 1 fixes: Obra.recalcular counts only comprado materials; per-account PIN lockout (15) on top of per-IP (5); invoiced income can't be deleted / derivación cobrada can't revert (409); upload validates magic bytes; CSV export uses 2-min dl token (POST /api/admin/gestoria/export-token); KPI font shrink; shorter button labels. Backend pytest 26/26 pass. Test data cleaned with backend/tests/cleanup_test_data.py."
