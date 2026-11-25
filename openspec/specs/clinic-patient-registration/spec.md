# clinic-patient-registration Specification

## Purpose
Permite registrar clínicas con su zona horaria y pacientes con sus datos de contacto y preferencias de recordatorios.

## Requirements

### Requirement: Alta de una clínica

`POST /clinics` SHALL crear una clínica con identificador, nombre y zona IANA válida y devolver HTTP 201 con los campos del contrato. Una entrada inválida SHALL devolver HTTP 400 con `{ "error": "<mensaje>" }`.

#### Scenario: Clínica en una zona válida

- **WHEN** se registra una clínica con un nombre válido y zona `Atlantic/Canary`
- **THEN** recibe HTTP 201 con un identificador, el nombre y la zona proporcionados.

#### Scenario: Zona inexistente o desplazamiento fijo

- **WHEN** se envía una zona inexistente o un desplazamiento como `+02:00` en el campo `timezone`
- **THEN** recibe HTTP 400 y la clínica no se crea.

### Requirement: Alta de un paciente

`POST /patients` SHALL registrar al paciente con `clinicId`, nombre, preferencia booleana `acceptsReminders` y teléfono opcional en el formato del simulador. Si se proporciona, SHALL empezar por `+` y contener entre 8 y 15 dígitos, con el primero del 1 al 9. Un alta válida SHALL devolver HTTP 201 y representar la ausencia de teléfono con `null`. Un cuerpo inválido SHALL devolver HTTP 400. Una clínica inexistente con un cuerpo válido SHALL devolver HTTP 404.

#### Scenario: Paciente sin teléfono

- **WHEN** se registra un paciente para una clínica existente y se omite `phone` o se envía `null`
- **THEN** el alta devuelve HTTP 201 con `phone: null` y la preferencia indicada.

#### Scenario: Teléfono compartido

- **WHEN** dos pacientes se registran con el mismo teléfono E.164
- **THEN** ambos reciben HTTP 201 con identificadores distintos.

#### Scenario: Teléfono o preferencia inválidos

- **WHEN** la entrada contiene un teléfono fuera del formato E.164 o `acceptsReminders` no es booleano
- **THEN** devuelve HTTP 400.

#### Scenario: Clínica desconocida

- **WHEN** se registra un paciente con datos válidos para una clínica inexistente
- **THEN** devuelve HTTP 404.

#### Scenario: Límites de longitud del teléfono

- **WHEN** se registra un paciente con un número que tiene 7, 8, 15 o 16 dígitos después del signo `+`
- **THEN** los números de 7 y 16 dígitos reciben HTTP 400 y los de 8 y 15 reciben HTTP 201 si su primer dígito está entre 1 y 9.
