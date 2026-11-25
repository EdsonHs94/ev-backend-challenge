# Spec Delta

## Purpose

Procesa los recordatorios que vencen, registra el resultado y evita que las pasadas concurrentes o las respuestas ambiguas dupliquen entregas.

## ADDED Requirements

### Requirement: Ejecución de la pasada

`POST /jobs/reminders/run` SHALL recorrer los recordatorios pendientes cuya fecha programada o próximo reintento ya venció según el reloj del servicio. SHALL esperar a que terminen sus operaciones y devolver HTTP 200 con `{ "processed": <entero> }`. El contador SHALL incluir solo los recordatorios evaluados y actualizados por esa pasada.

#### Scenario: Recordatorios vencidos y futuros

- **WHEN** una pasada encuentra dos pendientes vencidos y uno futuro
- **THEN** trata los dos vencidos, deja el futuro intacto y devuelve `{ "processed": 2 }`.

#### Scenario: Pasada sin trabajo

- **WHEN** no hay pendientes disponibles para la pasada
- **THEN** devuelve `{ "processed": 0 }` y no llama al proveedor.

### Requirement: Elegibilidad antes de cada intento

La pasada SHALL verificar la cita y el paciente antes de llamar al proveedor. Si la cita ya empezó SHALL marcar el recordatorio como `skipped` con motivo `too_late`. Si la cita aún puede recibir un recordatorio, la falta de teléfono SHALL producir `no_phone` y la falta de consentimiento SHALL producir `opted_out`. En esos casos SHALL conservar el número de intentos realizados y no llamar al proveedor.

#### Scenario: La cita comienza antes del reintento

- **WHEN** el próximo intento vence y el reloj está en el inicio de la cita o después
- **THEN** queda `skipped` con `too_late` y sin sumar un intento.

#### Scenario: El paciente no puede recibir el recordatorio

- **WHEN** el recordatorio vence y el paciente no tiene teléfono o no acepta recordatorios
- **THEN** se registra `no_phone` u `opted_out`, respectivamente, sin llamar al proveedor. Si ambas condiciones coinciden se usa `no_phone`.

#### Scenario: Recordatorio cancelado o reemplazado

- **WHEN** una cancelación o reprogramación ya canceló un recordatorio antes de que la pasada lo tome
- **THEN** esa pasada no lo envía ni altera su estado.

### Requirement: Franja nocturna en un primer envío atrasado

Si al tratar un recordatorio elegible y sin intentos ya llegó la franja local `[21:00, 09:00)`, la pasada SHALL aplazarlo hasta las próximas 09:00 locales. Si esa apertura coincide con el inicio de la cita o lo supera, SHALL marcarlo `skipped` con `too_late`. Los reintentos SHALL ejecutarse aun dentro de la franja nocturna.

#### Scenario: La primera pasada ocurre tarde

- **WHEN** un recordatorio programado para la tarde sigue pendiente a las 21:00
- **THEN** la pasada lo aplaza a las próximas 09:00 locales sin llamar al proveedor ni modificar el `scheduledFor` original ni el número de intentos.

### Requirement: Contenido de la solicitud al proveedor

La llamada SHALL usar `POST /messages` con el teléfono del paciente y el texto exacto de OpenAPI. La fecha y la hora del texto SHALL corresponder al inicio de la cita en la zona de la clínica, con formato `dd/MM/yyyy` y `HH:mm`.

#### Scenario: Texto de una cita en Madrid

- **WHEN** se envía el recordatorio de Ana en Clínica Sol para el 28 de marzo de 2027 a las 10:05 en Madrid
- **THEN** el texto es exactamente `Hola Ana, te recordamos tu cita en Clínica Sol el 28/03/2027 a las 10:05. Responde SI para confirmar o NO para cancelar.`

### Requirement: Resultados e intento siguiente

Cada llamada SHALL contar como un intento. Los estados HTTP 200 y 202 SHALL dejar el recordatorio `sent`, con `sentAt` según el reloj del servicio al recibir la aceptación. HTTP 422 SHALL dejarlo `failed`. HTTP 503, HTTP 504, un fallo de red o la falta de respuesta tras cinco segundos SHALL producir un reintento, salvo que ya se hayan realizado tres llamadas.

#### Scenario: Fallo temporal y réplica de la pasada

- **WHEN** el primer intento falla y vuelve a ejecutarse la pasada antes de que transcurra un minuto
- **THEN** el recordatorio sigue `pending` y el proveedor aún ha recibido una sola llamada.

#### Scenario: Agotamiento de intentos

- **WHEN** el primer y el segundo intento fallan de forma reintentable
- **THEN** el segundo vence un minuto después del primer fallo y el tercero cinco minutos después del segundo. Si falla el tercero, el recordatorio queda `failed` y no vuelve a intentarse.

#### Scenario: Rechazo definitivo

- **WHEN** el proveedor devuelve HTTP 422
- **THEN** la pasada registra la llamada, marca `failed` y no programa otro intento.

### Requirement: Concurrencia e idempotencia de entrega

Pasadas simultáneas y distintas instancias SHALL realizar como máximo una llamada concurrente para un intento de un mismo recordatorio. Todos los intentos de ese recordatorio SHALL usar la misma `Idempotency-Key`. Un nuevo recordatorio de una cita reprogramada SHALL usar una clave distinta.

#### Scenario: Dos pasadas simultáneas

- **WHEN** dos instancias arrancan una pasada sobre el mismo pendiente
- **THEN** solo una lo procesa y el proveedor recibe una sola llamada para ese intento.

#### Scenario: Entrega con respuesta perdida

- **WHEN** el proveedor entrega el mensaje, responde HTTP 504 y posteriormente acepta el reintento como duplicado
- **THEN** registra dos llamadas con la misma clave, una entrega y un recordatorio `sent`.
