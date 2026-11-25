# inbound-replies Specification

## Purpose
Aplica las respuestas de pacientes al recordatorio correcto, con un efecto único por mensaje recibido del proveedor.

## Requirements

### Requirement: Recepción y validación

`POST /webhooks/inbound-messages` SHALL validar los campos `messageId`, `from`, `text` y `receivedAt` según OpenAPI. Un cuerpo inválido SHALL devolver HTTP 400 con `{ "error": "<mensaje>" }`. Todo cuerpo válido SHALL devolver HTTP 200 si el sistema lo procesa o lo ignora.

#### Scenario: Aviso mal formado

- **WHEN** faltan campos requeridos, los tipos son incorrectos o `receivedAt` no es un instante ISO 8601 con zona
- **THEN** el webhook devuelve HTTP 400, sin aplicar cambios ni consumir el identificador.

### Requirement: Interpretación de la respuesta

El webhook SHALL reconocer exactamente `SI` y `NO` tras ignorar diferencias de mayúsculas, tildes y espacios o signos alrededor. Cualquier otro texto SHALL ignorarse.

#### Scenario: Variaciones de confirmación y cancelación

- **WHEN** el texto es `Sí`, ` si. ` o `¡NO!`
- **THEN** los dos primeros se interpretan como confirmación y el tercero como cancelación.

#### Scenario: Texto sin instrucción inequívoca

- **WHEN** el texto es `sí, gracias`, `S I`, `SI NO` o está vacío
- **THEN** el webhook devuelve HTTP 200 e ignora el texto.

### Requirement: Selección por el último envío elegible

El webhook SHALL elegir la cita que recibió el recordatorio enviado más reciente para el teléfono `from`, entre las citas activas que comienzan después de la hora del servicio. La fecha `receivedAt` del proveedor SHALL validarse como parte del aviso, y la elegibilidad SHALL depender del reloj del servicio. Si no hay una cita elegible, el webhook SHALL responder HTTP 200 sin modificar citas.

#### Scenario: Teléfono compartido

- **WHEN** varias citas de pacientes de un mismo teléfono tienen recordatorios enviados
- **THEN** se selecciona la cita del último envío elegible, aunque pertenezca a otro paciente o clínica.

#### Scenario: Hora de envío idéntica

- **WHEN** dos recordatorios elegibles tienen el mismo `sentAt`
- **THEN** se elige el que se registró como enviado después. Para envíos históricos sin orden de envío disponible, se usa el orden de registro del recordatorio.

#### Scenario: La cita del envío más reciente dejó de ser elegible

- **WHEN** la cita asociada al último envío está cancelada o ya comenzó
- **THEN** se selecciona la cita del siguiente envío elegible, si existe. Una hora de inicio igual a la del servicio cuenta como ya iniciada.

#### Scenario: Fecha del proveedor y reloj distintos

- **WHEN** `receivedAt` indica una hora anterior al inicio de una cita pero el reloj del servicio indica que ya empezó
- **THEN** esa cita no se considera elegible.

#### Scenario: Sin envíos elegibles

- **WHEN** el teléfono no tiene recordatorios enviados para citas elegibles
- **THEN** el webhook devuelve HTTP 200 y conserva los estados existentes.

### Requirement: Transición de la cita

Para la cita elegible, `SI` SHALL dejarla en `confirmed` y conservar sus recordatorios. `NO` SHALL dejarla en `cancelled` y cancelar el recordatorio pendiente, si lo hay, junto con la cita. El historial de envíos previos SHALL conservarse.

#### Scenario: Confirmación con pendiente

- **WHEN** un paciente envía `SI` para una cita elegible que también tiene un recordatorio pendiente
- **THEN** la cita queda confirmada y el pendiente conserva su estado.

#### Scenario: Cancelación con pendiente

- **WHEN** un paciente envía `NO` para una cita elegible que recibió un recordatorio y tiene otro pendiente
- **THEN** se cancelan la cita y el pendiente y se conserva el recordatorio enviado.

### Requirement: Deduplicación persistente y atómica

El webhook SHALL aceptar un `messageId` válido una sola vez, incluso entre instancias. El primer aviso válido SHALL consumir el identificador aunque se ignore. Si hay una transición, el registro del aviso y su efecto SHALL confirmarse en la misma transacción.

#### Scenario: Repetición simultánea o posterior

- **WHEN** se recibe dos veces el mismo identificador, incluso con otro cuerpo válido o en dos instancias
- **THEN** ambas solicitudes reciben HTTP 200 y solo se procesa la primera.

#### Scenario: Aviso ignorado que vuelve a llegar

- **WHEN** el primer aviso válido se ignora y luego reaparece con el mismo identificador y un texto que sería accionable
- **THEN** el webhook conserva el resultado original y no modifica una cita.

#### Scenario: Fallo al aplicar la transición

- **WHEN** la transacción falla antes de aplicar completamente el aviso
- **THEN** el identificador no queda consumido y una entrega posterior puede procesarse.
