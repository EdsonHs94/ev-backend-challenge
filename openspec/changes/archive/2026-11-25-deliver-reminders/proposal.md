# Proposal

## Why

La fase 2 deja cada recordatorio con una hora programada. Hace falta procesar los recordatorios que ya tocan, mantener su estado en PostgreSQL y evitar duplicar entregas cuando el proveedor falla o coinciden varias pasadas.

## What Changes

- Implementar `POST /jobs/reminders/run` con el proveedor simulado de Compose.
- Verificar la elegibilidad de la cita y el paciente justo antes de cada intento, y enviar el texto exacto en hora local.
- Registrar cada intento y clasificar los resultados del proveedor. Programar reintentos de uno y cinco minutos y proteger los envíos concurrentes e inciertos.

## Capabilities

### New Capabilities

- `reminder-delivery` define las pasadas de envío, sus resultados, reintentos y garantías de concurrencia.

### Modified Capabilities

Ninguna.

## Impact

Se añade el endpoint de envío, un adaptador HTTP y una migración incremental para los reintentos. La operación usa las citas, el historial y el reloj de las fases anteriores. Las respuestas de los pacientes llegarán en la fase siguiente.
