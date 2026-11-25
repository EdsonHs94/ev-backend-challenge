# Prueba técnica de backend · ClinicSay

API para gestionar citas y sus recordatorios. El [enunciado](enunciado.pdf) define las reglas de negocio y [OpenAPI](openapi.yaml) define el contrato HTTP.

## Arranque local

Requiere Docker con Compose. La API usa Node.js 22 y PostgreSQL 16 dentro de los contenedores.

```sh
docker compose up --build
```

La API escucha en `http://localhost:3000`, el proveedor simulado en `http://localhost:4010` y PostgreSQL queda en la red interna de Compose. La API ejecuta las migraciones antes de abrir el puerto. Los datos permanecen en el volumen `postgres-data` al ejecutar `docker compose down`.

```sh
curl --fail http://localhost:3000/health
curl --include --request PUT http://localhost:3000/test/clock \
  --header 'Content-Type: application/json' \
  --data '{"now":"2027-03-28T10:00:00+02:00"}'
```

La ruta de ajuste responde 204 en modo de prueba. El instante se comparte entre instancias que usan la misma base y dura hasta el siguiente ajuste. Sin un ajuste se usa la hora real. Fuera de `CLOCK_MODE=test`, la API usa la hora real y devuelve 404 en esa ruta.

## Citas y recordatorios

Registra una clínica con `POST /clinics` y un paciente de esa clínica con `POST /patients`. Después usa `POST /appointments` con sus identificadores y un `startsAt` futuro en ISO 8601 con zona. `GET /appointments/{id}` devuelve la cita en UTC y su historial de recordatorios. Usa `PATCH /appointments/{id}` para reprogramarla y `POST /appointments/{id}/cancel` para cancelarla.

El recordatorio se programa a la misma hora local del día anterior en la zona IANA de la clínica. Si esa hora pasó, se parte de la hora del servicio. Entre las 21:00 incluidas y las 09:00 excluidas, la programación se mueve a las próximas 09:00 locales. Si el resultado coincide con el inicio de la cita o queda después, el recordatorio aparece como `skipped` con motivo `too_late`.

Por ejemplo, una cita en Madrid el 28 de marzo de 2027 a las 10:00 locales empieza a las 08:00 UTC. Su recordatorio queda para el 27 de marzo a las 09:00 UTC, las 10:00 locales del día anterior.

## Envío de recordatorios

```sh
curl --fail --request POST http://localhost:3000/jobs/reminders/run
```

La pasada devuelve `processed` con la cantidad de recordatorios que actualizó. Antes de cada llamada comprueba la cita, el teléfono y la preferencia del paciente. Un primer envío atrasado durante la franja nocturna se aplaza hasta las próximas 09:00 locales. Los reintentos vencen un minuto después del primer fallo y cinco minutos después del segundo, también durante la noche. Hay como máximo tres llamadas por recordatorio y cada una espera respuesta hasta cinco segundos.

Las pasadas paralelas toman el trabajo con `FOR UPDATE SKIP LOCKED`. La transacción conserva el bloqueo de la cita y del recordatorio mientras espera al proveedor. Si otra operación tiene la cita bloqueada, el trabajo sigue disponible para una pasada posterior si aún está pendiente.

Cada llamada reutiliza el identificador del recordatorio como clave de idempotencia. Si el proveedor entrega y devuelve 504, el segundo intento puede recibir 200 por la misma entrega. Si se pierde la conexión con PostgreSQL entre la llamada y el commit, la pasada devuelve un error y una pasada posterior puede repetir la llamada con la misma clave. La deduplicación en ese caso depende de que el proveedor conserve la clave.

## Respuestas de pacientes

```sh
curl --fail --request POST http://localhost:3000/webhooks/inbound-messages \
  --header 'Content-Type: application/json' \
  --data '{"messageId":"reply-001","from":"+34600111222","text":"¡Sí!","receivedAt":"2027-03-27T09:10:00Z"}'
```

`SI` confirma y `NO` cancela la cita y cualquier recordatorio pendiente. Se aceptan tildes, mayúsculas o minúsculas y signos alrededor. El webhook elige el último recordatorio enviado a ese teléfono entre citas futuras y activas, incluso cuando varios pacientes comparten número. Si dos envíos tienen el mismo `sentAt`, se desempata por el orden de registro del envío. La elegibilidad se decide con el reloj del servicio.

El webhook valida el cuerpo antes de registrar el aviso. Devuelve HTTP 200 para avisos válidos procesados, repetidos o ignorados y HTTP 400 para cuerpos inválidos. PostgreSQL guarda una clave derivada de `messageId` en la misma transacción que cambia la cita, por lo que un reintento después de un rollback puede aplicar el cambio.

## Recorrido completo

Después de arrancar Compose, ejecuta este ejemplo con datos ficticios. Crea una cita en Madrid el día del cambio a horario de verano, adelanta el reloj hasta la hora del recordatorio y confirma la cita por webhook. El ajuste del reloj y los datos de ejemplo quedan guardados en la base local.

```sh
docker compose exec -T api node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';

async function api(method, path, status, body) {
  const response = await fetch('http://127.0.0.1:3000' + path, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  assert.equal(response.status, status);
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

await api('PUT', '/test/clock', 204, { now: '2027-03-26T09:00:00Z' });
const clinic = await api('POST', '/clinics', 201, { name: 'Clínica Sol', timezone: 'Europe/Madrid' });
const phone = '+346' + randomInt(10000000, 99999999);
const patient = await api('POST', '/patients', 201, {
  clinicId: clinic.id, name: 'Ana', phone, acceptsReminders: true,
});
const appointment = await api('POST', '/appointments', 201, {
  clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-28T08:00:00Z',
});
const due = '2027-03-27T09:00:00.000Z';
assert.equal(appointment.reminders[0].scheduledFor, due);
await api('PUT', '/test/clock', 204, { now: due });
await api('POST', '/jobs/reminders/run', 200);
await api('POST', '/webhooks/inbound-messages', 200, {
  messageId: randomUUID(), from: phone, text: '¡Sí!', receivedAt: due,
});
const result = await api('GET', '/appointments/' + appointment.id, 200);
assert.equal(result.status, 'confirmed');
assert.equal(result.reminders[0].status, 'sent');
console.log({ appointment: result.status, reminder: result.reminders[0].status });
JS
```

## Pruebas

```sh
docker compose run --rm --build checks
```

El comando ejecuta lint, chequeo de tipos, pruebas de calendario y pruebas HTTP de integración con PostgreSQL y el proveedor simulado. Cada suite de integración usa su propia base temporal. GitHub Actions ejecuta estas comprobaciones y verifica el arranque de la pila y los endpoints iniciales.

## Arquitectura y OpenSpec

La API usa NestJS para HTTP y para conectar los adaptadores. Los casos de uso consumen puertos para el reloj, la persistencia y la mensajería. Las reglas de calendario y de interpretación de respuestas viven en el dominio.

El dominio usa Temporal para restar un día del calendario local. Restar 24 horas cambia la hora local cuando hay un salto de horario. PostgreSQL almacena instantes en `timestamptz` y la API los serializa en UTC. Para una hora local repetida elegimos la primera ocurrencia. Si no existe, la desplazamos por la duración del salto.

Usamos `pg` para consultas y `node-pg-migrate` para aplicar SQL versionado. Al reprogramar o cancelar, una transacción bloquea la cita y cambia su estado y recordatorio juntos. Un índice único parcial permite un solo recordatorio pendiente por cita. Reprogramar al mismo instante conserva el historial y una hora nueva devuelve una cita confirmada a `scheduled`. Elegimos PostgreSQL como fuente de estado y coordinación para mantener las transiciones atómicas con las citas. Una cola externa añadiría un segundo sistema y requeriría resolver la publicación consistente con la base.

Las [specs vigentes](openspec/specs/) describen el comportamiento verificado. Las propuestas, el diseño y las tareas quedan en [el historial de cambios](openspec/changes/). Para configurar la integración con Codex, ejecuta `openspec init --tools codex` con la CLI de OpenSpec. Usa la skill `openspec-propose` para el siguiente cambio.

## Alcance y próximos pasos

La entrega incluye el flujo de citas, recordatorios, reintentos y respuestas del paciente con el proveedor simulado. La pasada se invoca por HTTP como pide el ejercicio. La integración real de WhatsApp, el cron, la autenticación y la monitorización quedan para un despliegue. Con más tiempo probaría las ráfagas de las 09:00 y los fallos prolongados del proveedor. También automatizaría pruebas de actualización de bases existentes y ejercicios de recuperación.

## Nota de producción

- **Capacidad.** Para 500 clínicas y unos 20 000 recordatorios diarios, la media es de unos 14 por minuto. Mediría los picos por zona, en especial al reabrir a las 09:00, y dimensionaría por atraso y cuota del proveedor. Separaría la API del despachador. Un cron por minuto habilitaría el trabajo vencido y varios workers tomarían lotes pequeños con concurrencia acotada.
- **Despacho y recuperación.** Publicaría el trabajo de envío en una tabla de salida dentro de la misma transacción que actualiza la cita. Un worker reclamaría cada trabajo por un plazo, comprobaría la versión de la cita antes del envío y liberaría el bloqueo de base antes de esperar al proveedor. Guardaría la clave y el resultado para recuperar trabajos vencidos. Si el proveedor no garantiza deduplicación, reconciliaría los resultados ambiguos con sus estados y dejaría en revisión los casos sin evidencia.
- **WhatsApp y despliegue.** Integraría WhatsApp Business Platform mediante el puerto de mensajería, con una plantilla de recordatorio aprobada y consentimiento del paciente. Guardaría el ID de WhatsApp para correlacionar estados y validaría la firma del webhook. Desplegaría contenedores en una región europea con PostgreSQL gestionado, copias y recuperación probada. Ejecutaría las migraciones como paso del despliegue y usaría un gestor de secretos. [WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview)
- **Monitorización.** Mediría la antigüedad del pendiente más viejo, el p95 del retraso, reintentos, respuestas 429 y 5xx, aceptación, entrega y errores del webhook. Configuraría alertas para una cola atrasada o un aumento sostenido de fallos. Los logs usarían identificadores de correlación y omitirían teléfonos y texto clínico.

## Uso de IA

El autor eligió NestJS, TypeScript, PostgreSQL, Clean Architecture y OpenSpec. Definió el trabajo por fases, pidió incorporar las skills de OpenSpec para Codex y controló los merges. Codex ayudó a redactar las propuestas, implementar los cambios y escribir pruebas.

Durante las verificaciones se acotó el descubrimiento de pruebas, que incluía archivos de aplicación. Se añadió cobertura de regresión al corregir el rechazo de separadores de fecha en minúsculas y un error sin manejar que podía derribar la API si PostgreSQL se desconectaba durante una llamada al proveedor.

## Entrega

El [formulario de entrega](https://docs.google.com/forms/d/e/1FAIpQLSd6OqQxPRvpBz_Cxw8KgOhN9-fsv5idE83PYGsH861BaMITCQ/viewform) cierra el miércoles 25 de noviembre de 2026 a las 17:30 de Madrid (11:30 en Lima).
