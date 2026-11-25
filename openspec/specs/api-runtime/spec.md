# api-runtime Specification

## Purpose
Permite levantar y comprobar la API de ClinicSay en un entorno reproducible, y controlar el tiempo del servicio para las pruebas de integración.

## Requirements

### Requirement: Arranque mediante Docker Compose

El proyecto SHALL ejecutar la API en el puerto 3000, PostgreSQL y el proveedor simulado con `docker compose up --build`. La API SHALL arrancar en modo de prueba con esta configuración y aplicar las migraciones de PostgreSQL antes de aceptar tráfico.

#### Scenario: Arranque con una base vacía

- **WHEN** se inicia la pila de Docker Compose con una base vacía
- **THEN** PostgreSQL queda disponible, la API aplica las migraciones y el proveedor arranca con su configuración original.

#### Scenario: Reinicio con migraciones existentes

- **WHEN** se vuelve a iniciar la API con la misma base migrada
- **THEN** se conserva el estado persistido y la API vuelve a quedar lista.

### Requirement: Salud de la API

La API SHALL responder HTTP 200 en `GET /health` cuando PostgreSQL esté disponible y el arranque haya completado sus migraciones. Si la base pierde disponibilidad después del arranque, SHALL responder HTTP 503.

#### Scenario: API lista

- **WHEN** un cliente consulta `GET /health` con la API lista y PostgreSQL disponible
- **THEN** recibe HTTP 200.

#### Scenario: PostgreSQL deja de responder

- **WHEN** un cliente consulta `GET /health` después de que la API iniciada pierde conexión con PostgreSQL
- **THEN** recibe HTTP 503.

### Requirement: Reloj controlable en pruebas

En modo `CLOCK_MODE=test`, la API SHALL aceptar un instante ISO 8601 con zona mediante `PUT /test/clock` y responder HTTP 204. El puerto de reloj SHALL devolver el instante fijado a todas las instancias en modo de prueba conectadas a la misma base. Sin un instante fijado, y en cualquier otro modo, el puerto SHALL devolver la hora del sistema. En cualquier otro modo la ruta de prueba SHALL estar ausente.

#### Scenario: Ajuste con offset

- **WHEN** un cliente fija `now` en `2027-03-28T10:00:00+02:00`
- **THEN** recibe HTTP 204 y el reloj de prueba devuelve el instante `2027-03-28T08:00:00.000Z`, también desde otra instancia.

#### Scenario: Ajuste con separadores en minúsculas

- **WHEN** un cliente fija `now` en `2027-03-28t08:00:00z`
- **THEN** recibe HTTP 204 y el reloj de prueba devuelve el instante `2027-03-28T08:00:00.000Z`.

#### Scenario: Fecha inválida o sin zona

- **WHEN** un cliente envía un valor de `now` inválido o sin zona
- **THEN** recibe HTTP 400 con un campo `error` y el instante previamente fijado se conserva.

#### Scenario: Modo de ejecución normal

- **WHEN** un cliente intenta fijar la hora con la API fuera de modo de prueba
- **THEN** recibe HTTP 404 y el reloj sigue consultando la hora del sistema.
