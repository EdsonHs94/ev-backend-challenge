# reminder-scheduling Specification

## Purpose
Define el instante y el estado inicial del recordatorio asociado a la hora vigente de una cita.

## Requirements

### Requirement: Cálculo en el calendario de la clínica

Al crear o cambiar la hora de una cita, el sistema SHALL calcular la misma hora local del inicio en el día civil anterior, en la zona IANA de la clínica. Si una hora local calculada se repite por un cambio de horario, SHALL elegir su primera ocurrencia. Si no existe, SHALL desplazarla por la duración del salto.

#### Scenario: Cambio al horario de verano en Madrid

- **WHEN** una cita comienza el 28 de marzo de 2027 a las 10:00 en `Europe/Madrid` y se crea con antelación suficiente
- **THEN** el recordatorio se programa para `2027-03-27T09:00:00.000Z`, que corresponde a las 10:00 del día anterior en Madrid.

#### Scenario: Cambio al horario de invierno en Madrid

- **WHEN** una cita comienza el 31 de octubre de 2027 a las 10:00 en `Europe/Madrid` y se crea con antelación suficiente
- **THEN** el recordatorio se programa para `2027-10-30T08:00:00.000Z`.

#### Scenario: La misma hora local en Canarias

- **WHEN** una cita comienza el 28 de marzo de 2027 a las 10:00 en `Atlantic/Canary` y se crea con antelación suficiente
- **THEN** el recordatorio se programa para `2027-03-27T10:00:00.000Z`.

### Requirement: Ajustes por reloj y franja nocturna

Si el candidato inicial ya pasó, el sistema SHALL usar la hora del servicio. Después SHALL aplicar la franja nocturna local `[21:00, 09:00)` y mover el candidato a las próximas 09:00 si cae dentro de ella.

#### Scenario: Límites de la franja nocturna

- **WHEN** el candidato es exactamente las 21:00 locales
- **THEN** el recordatorio queda para las 09:00 del siguiente día local. Un candidato a las 08:59 se aplaza a las 09:00 del mismo día y uno a las 09:00 exactas se conserva.

#### Scenario: La hora original ya pasó

- **WHEN** la hora del día anterior ya pasó y el reloj del servicio está dentro del horario permitido
- **THEN** se programa para el instante actual si queda antes del inicio. Si el reloj ya está en la franja nocturna se desplaza primero a las próximas 09:00 locales.

### Requirement: Estado inicial del recordatorio

Si la hora calculada es igual o posterior al inicio de la cita, el sistema SHALL crear el recordatorio como `skipped` con `skipReason: too_late`. Si queda antes del inicio, SHALL crearlo como `pending` con `skipReason: null`. En ambos casos SHALL tener `attempts: 0`, `sentAt: null` y el instante calculado como `scheduledFor`. La falta de teléfono y la preferencia de recordatorios SHALL evaluarse cuando vaya a enviarse el mensaje.

#### Scenario: El aplazamiento coincide con la cita

- **WHEN** la hora candidata se aplaza a las 09:00 locales y la cita empieza a esas mismas 09:00
- **THEN** se registra un recordatorio `skipped` con motivo `too_late` y `scheduledFor` a la hora calculada. Si el aplazamiento queda después del inicio se aplica el mismo estado.

#### Scenario: Programación para un paciente sin teléfono o sin consentimiento

- **WHEN** se crea una cita cuyo recordatorio queda antes del inicio y el paciente no tiene teléfono o no acepta recordatorios
- **THEN** el recordatorio queda `pending` con cero intentos y su elegibilidad se resolverá al intentar procesarlo.
