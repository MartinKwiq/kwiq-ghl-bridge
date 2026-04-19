# 06 — Calendarios y agendamiento

## Tipos de calendario en GHL

| Tipo | Cuándo usarlo | Lógica |
|---|---|---|
| **Round Robin** | Distribuir citas entre un equipo | Al solicitar slot, GHL pasa por cada miembro asignado hasta encontrar disponibilidad. Puede ser *strict* (orden fijo) o *equal distribution* (balanceo de carga). |
| **Event** | Calendario de eventos únicos (ej. masterclass) | Slots con fecha/hora fija predefinida. |
| **Class Booking** | Sesiones grupales (1 host ↔ N invitados) | Cada slot tiene capacidad máxima (`seats`). Cada booking reduce en 1 la capacidad. |
| **Collective** | Reunión que requiere **varios miembros a la vez** | Solo se ofrece slot cuando todos los hosts están disponibles. |
| **Service** | Servicios con asignación a un user específico | Típico para spas/consultorios. |

## Modelo

```
Calendar (1) ── (N) Slot
Slot   (1) ── (0..N) Appointment
Appointment (N) ── (1) Contact
```

### Campos principales de un Calendar

- `id`, `locationId`, `name`
- `calendarType` (`round_robin`, `event`, `class_booking`, `collective`, `service`)
- `slotDuration` — duración de cada cita (min)
- `slotInterval` — frecuencia con la que se crean slots
- `appointmentsPerSlot` — concurrencia
- `bufferBefore`, `bufferAfter` — min
- `preBufferTime`, `postBufferTime`
- `minSchedulingNotice` — tiempo mínimo antes de poder agendar
- `maxSchedulingDays` — ventana futura máxima
- `timezone`
- `weeklyAvailability` — disponibilidad por día de la semana
- `dateSpecificHours` — overrides para fechas concretas
- `assignedUserIds` — staff asociado
- `autoConfirm` — confirmar automáticamente
- `googleInvitationEmails`, `outlookInvitationEmails` — envío de invites nativos

## Endpoints

```
GET   /calendars/?locationId=...                       ← listar calendarios
GET   /calendars/{calendarId}
POST  /calendars/                                       ← crear calendar
PUT   /calendars/{calendarId}                           ← actualizar
DELETE /calendars/{calendarId}

GET   /calendars/{calendarId}/free-slots               ← **crítico para agendar**
      ?startDate=2026-04-20&endDate=2026-04-25&timezone=America/Bogota

GET   /calendars/events?locationId=...&calendarId=...&startTime=...&endTime=...
POST  /calendars/events/appointments                    ← crear appointment
GET   /calendars/events/appointments/{appointmentId}
PUT   /calendars/events/appointments/{appointmentId}    ← re-agendar
DELETE /calendars/events/appointments/{appointmentId}

GET   /calendars/{calendarId}/groups
POST  /calendars/{calendarId}/groups
```

## Flujo típico de agendamiento vía bridge

```
1. kwiq-ghl-bridge  →  GET /calendars/{id}/free-slots
                       con startDate, endDate, timezone del contacto
2. Devuelve al canal (SMS, WA, web) las 3-5 opciones más próximas.
3. Usuario elige slot.
4. kwiq-ghl-bridge  →  POST /calendars/events/appointments
                       con calendarId, contactId, startTime, endTime, title
5. GHL responde con el appointmentId y envía notificación según config.
6. Webhook `AppointmentCreate` confirma y nos permite sincronizar con Supabase.
```

### Ejemplo: consultar slots

```bash
curl -X GET "https://services.leadconnectorhq.com/calendars/cal_abc/free-slots?startDate=2026-04-20&endDate=2026-04-25&timezone=America/Bogota" \
  -H "Authorization: Bearer $GHL_TOKEN" \
  -H "Version: 2021-07-28"
```

Respuesta (simplificada):

```json
{
  "2026-04-20": {
    "slots": [
      "2026-04-20T09:00:00-05:00",
      "2026-04-20T09:30:00-05:00",
      "2026-04-20T10:00:00-05:00"
    ]
  },
  "2026-04-21": {
    "slots": [ "2026-04-21T08:00:00-05:00", "..." ]
  }
}
```

### Ejemplo: crear appointment

```bash
curl -X POST "https://services.leadconnectorhq.com/calendars/events/appointments" \
  -H "Authorization: Bearer $GHL_TOKEN" \
  -H "Version: 2021-07-28" \
  -H "Content-Type: application/json" \
  -d '{
    "calendarId": "cal_abc",
    "locationId": "loc_xyz789",
    "contactId": "ct_12345",
    "startTime": "2026-04-20T10:00:00-05:00",
    "endTime":   "2026-04-20T10:30:00-05:00",
    "title": "Demo Kwiq",
    "appointmentStatus": "confirmed",
    "assignedUserId": "usr_staff123",
    "address": "Google Meet",
    "ignoreDateRange": false,
    "toNotify": true
  }'
```

## Estados de appointment

| Estado | Significado |
|---|---|
| `new` | creado, pendiente |
| `confirmed` | confirmado |
| `showed` | el contacto asistió |
| `noshow` | no asistió |
| `cancelled` | cancelado |
| `invalid` | error de datos |

## Sincronización 2-way con Google / Outlook

Configurable por **user**, no a nivel calendar. En `Settings → Profile → Calendars`:

- Conectar Google Workspace / Outlook 365 vía OAuth.
- Permite *push* (GHL → Google) y *pull* (bloqueos de Google marcan al user como no disponible en GHL).
- El bridge **no** debe escribir directo en Google Calendar — siempre pasar por GHL, que replica al calendario del user.

## Webhooks de calendario

| Evento | Cuándo se dispara |
|---|---|
| `AppointmentCreate` | Nueva cita |
| `AppointmentUpdate` | Cambia fecha/hora/estado |
| `AppointmentDelete` | Se elimina |

Payload (simplificado):

```json
{
  "type": "AppointmentCreate",
  "locationId": "loc_xyz789",
  "appointmentId": "apt_abc",
  "calendarId": "cal_abc",
  "contactId": "ct_12345",
  "assignedUserId": "usr_staff123",
  "startTime": "2026-04-20T10:00:00-05:00",
  "endTime": "2026-04-20T10:30:00-05:00",
  "title": "Demo Kwiq",
  "appointmentStatus": "confirmed",
  "source": "api",
  "timestamp": "2026-04-18T15:22:13.482Z"
}
```

## Caso de uso con IA (Conversation AI o LLM propio)

1. Usuario escribe "quiero una cita mañana a las 10".
2. IA parsea intención + hora → pide a kwiq-ghl-bridge slots cercanos.
3. Bridge: `GET /calendars/{id}/free-slots` con `startDate = mañana`.
4. IA propone: "Tengo 10:00, 10:30 y 11:00. ¿Cuál te queda bien?"
5. Usuario elige → IA llama bridge → `POST /appointments` → respuesta con confirmación.
6. Webhook `AppointmentCreate` dispara workflow "Confirmación cita" en GHL (plantilla SMS + email).

## Fuentes

- [Calendars & Appointments — Support](https://help.gohighlevel.com/support/solutions/48000449585)
- [Round Robin Calendars Setup](https://help.gohighlevel.com/support/solutions/articles/155000001485-round-robin-calendars-setup-distribution-availability-explained)
- [Appointment Distribution Logic for Round Robin](https://help.gohighlevel.com/support/solutions/articles/155000001484-appointment-distribution-logic-for-round-robin-calendars)
- [Class Booking Calendar Overview](https://help.gohighlevel.com/support/solutions/articles/48001236022-class-booking-calendar-overview)
- [Understanding Calendar Availability Settings](https://help.gohighlevel.com/support/solutions/articles/48001155718-adjusting-availability-settings-for-individual-calendars)
- [Recurring Appointments](https://help.gohighlevel.com/support/solutions/articles/48001230991-configure-recurring-calendar-appointments)
- [Fix Missing Appointment Slots](https://help.gohighlevel.com/support/solutions/articles/48001181711-why-appointment-time-slots-are-missing-on-your-calendar)
