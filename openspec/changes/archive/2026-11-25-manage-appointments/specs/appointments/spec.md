# Spec Delta

## Purpose

Define el ciclo de vida de una cita y cómo se mantienen sus recordatorios cuando cambia su estado o su hora de inicio.

## ADDED Requirements

### Requirement: Creación y consulta de citas

`POST /appointments` SHALL crear en una sola operación una cita `scheduled` y su primer recordatorio, y devolver HTTP 201. `startsAt` SHALL ser un instante ISO 8601 con zona, estrictamente posterior a la hora del servicio. La clínica y el paciente SHALL existir, y el paciente SHALL pertenecer a la clínica indicada. `GET /appointments/{id}` SHALL devolver HTTP 200 con el historial completo ordenado del más antiguo al más nuevo. Las respuestas SHALL usar UTC con sufijo `Z` para los instantes.

#### Scenario: Cita futura de un paciente de la clínica

- **WHEN** se crea una cita con datos válidos y `startsAt` futuro
- **THEN** devuelve HTTP 201 con la cita `scheduled` y su recordatorio. La consulta posterior devuelve esa cita y su historial.

#### Scenario: Cita con datos inválidos o paciente de otra clínica

- **WHEN** la hora está mal formada, es igual o anterior al reloj del servicio, o el paciente pertenece a otra clínica
- **THEN** devuelve HTTP 400 y la cita no se crea.

#### Scenario: Referencia o cita inexistente

- **WHEN** se solicita una cita inexistente o se crea una cita con referencias válidas en forma pero una clínica o paciente inexistentes
- **THEN** devuelve HTTP 404.

### Requirement: Reprogramación de citas

`PATCH /appointments/{id}` SHALL devolver HTTP 200 con la cita y su historial tras un cambio válido. Si cambia el instante, SHALL cancelar el recordatorio pendiente y crear uno para la hora nueva en la misma transacción, conservar los recordatorios finalizados y volver la cita de `confirmed` a `scheduled`.

#### Scenario: Reprogramación con recordatorio pendiente

- **WHEN** se cambia la hora de una cita futura con un recordatorio pendiente
- **THEN** la respuesta contiene el recordatorio original como `cancelled` y uno nuevo calculado para la hora actualizada, en ese orden.

#### Scenario: Cita confirmada con un recordatorio enviado

- **WHEN** se cambia la hora de una cita futura confirmada cuyo recordatorio ya fue enviado
- **THEN** la cita vuelve a `scheduled`, el recordatorio enviado se conserva y se agrega uno para la hora nueva.

#### Scenario: Repetición de la misma hora

- **WHEN** se vuelve a enviar el instante actual de una cita futura y activa, incluso con otro offset equivalente
- **THEN** devuelve HTTP 200 con el mismo estado e historial, sin crear otro recordatorio.

### Requirement: Validación de la reprogramación

`PATCH /appointments/{id}` SHALL devolver HTTP 400 si el cuerpo es inválido o la hora propuesta no es futura, HTTP 404 si la cita no existe y HTTP 409 si la cita está cancelada o ya comenzó, cuando la solicitud propone una hora válida.

#### Scenario: Cita no reprogramable

- **WHEN** se envía una nueva hora futura válida para una cita cancelada o cuya hora de inicio es igual o anterior al reloj
- **THEN** devuelve HTTP 409 y conserva su historial.

#### Scenario: Solicitud inválida o cita desconocida

- **WHEN** se intenta reprogramar con una hora igual o anterior al reloj del servicio, con una fecha sin zona o con una fecha inválida
- **THEN** devuelve HTTP 400. Una solicitud con hora válida y un identificador desconocido devuelve HTTP 404.

### Requirement: Cancelación de citas

`POST /appointments/{id}/cancel` SHALL devolver HTTP 200, poner la cita en `cancelled` y cancelar el recordatorio pendiente en la misma transacción. SHALL conservar los recordatorios finalizados. Si la cita ya está cancelada SHALL devolver HTTP 200 sin alterar el historial. Una cita inexistente SHALL devolver HTTP 404.

#### Scenario: Cancelación repetida

- **WHEN** se cancela una cita con recordatorio pendiente y se repite la solicitud
- **THEN** ambas respuestas son HTTP 200 y la segunda devuelve la misma cita cancelada con el mismo recordatorio cancelado.

#### Scenario: Cancelación después del inicio

- **WHEN** se cancela una cita existente cuya hora de inicio ya pasó
- **THEN** devuelve HTTP 200 con la cita cancelada, según el contrato de esta ruta.
