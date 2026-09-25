# Diagramas de Flujo - Alexa + n8n + Node-RED + Home Assistant

## Flujo 1: Alexa -> n8n (Comando de Voz)

```
Usuario dice: "Alexa, dile a mi automatizacion que ejecute backup"
                          │
                          ▼
              ┌─────────────────────┐
              │   Alexa Service     │
              │ (reconoce intent)   │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   AWS Lambda        │
              │ (index.js)          │
              │                     │
              │ 1. Recibe intent    │
              │ 2. Extrae slots     │
              │ 3. Llama webhook    │
              └──────────┬──────────┘
                         │ POST /webhook/alexa-tarea
                         ▼
              ┌─────────────────────┐
              │     n8n             │
              │                     │
              │ 1. Recibe datos     │
              │ 2. Procesa logica   │
              │ 3. Retorna JSON     │
              │    {mensaje: "..."}  │
              └──────────┬──────────┘
                         │ HTTP 200 + JSON
                         ▼
              ┌─────────────────────┐
              │   AWS Lambda        │
              │                     │
              │ Lee response.data   │
              │ .mensaje            │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   Alexa Service     │
              │ (Text-to-Speech)    │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   Echo Device       │
              │ "Backup ejecutado   │
              │  correctamente"     │
              └─────────────────────┘
```

## Flujo 2: n8n -> Alexa (Notificacion Proactiva)

```
Trigger: Schedule (9AM) o Evento externo
                          │
                          ▼
              ┌─────────────────────┐
              │     n8n             │
              │                     │
              │ 1. Genera mensaje   │
              │ 2. HTTP POST a      │
              │    Voice Monkey API │
              └──────────┬──────────┘
                         │ POST api-v3.voicemonkey.io/trigger
                         ▼
              ┌─────────────────────┐
              │   Voice Monkey      │
              │                     │
              │ Recibe texto y      │
              │ device ID           │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   Alexa Cloud       │
              │ (Text-to-Speech)    │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   Echo Device       │
              │ "Buenos dias, hoy   │
              │  tienes 3 reuniones"│
              └─────────────────────┘
```

## Formato de Datos

### Request que Lambda envia a n8n:

```json
{
  "action": "ejecutar_tarea",
  "tarea": "backup",
  "userId": "amzn1.ask.account.XXXXX",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Response que n8n debe devolver:

```json
{
  "mensaje": "El backup se ha ejecutado correctamente. Se respaldaron 150 archivos.",
  "status": "completado",
  "tarea": "backup",
  "timestamp": "2024-01-15T10:30:02.000Z"
}
```

> **IMPORTANTE**: El campo `mensaje` es el que Alexa leera al usuario.
> Mantenerlo corto y claro (maximo ~100 palabras para buena experiencia de usuario).

## Timeouts y Limites

- **Alexa**: Espera maximo ~8 segundos de respuesta de Lambda
- **Lambda**: Configurar timeout a 10 segundos
- **n8n**: El webhook debe responder en menos de 7 segundos
- **Voice Monkey**: Sin limite critico (fire-and-forget)

## Seguridad

- La Lambda solo acepta invocaciones del servicio de Alexa (verificado por Skill ID)
- Los webhooks de n8n pueden protegerse con:
  - Header Auth (agregar token en headers)
  - Basic Auth
  - IP Whitelist (IPs de AWS Lambda)



## Flujo 3: Alexa → n8n → Node-RED → Home Assistant

```
Usuario: "Alexa, dile a mi automatizacion que encienda las luces"
                          │
                          ▼
              ┌─────────────────────┐
              │   Alexa → Lambda    │
              │  (extrae intent)    │
              └──────────┬──────────┘
                         │ POST /webhook/alexa-dispositivo
                         ▼
              ┌─────────────────────┐
              │        n8n          │
              │  (recibe comando)   │
              └──────────┬──────────┘
                         │ POST /alexa/command
                         ▼
              ┌─────────────────────┐
              │     Node-RED        │
              │                     │
              │ 1. Parsea comando   │
              │ 2. Mapea entity_id  │
              │ 3. Llama a HA API   │
              └──────────┬──────────┘
                         │ WebSocket / REST API
                         ▼
              ┌─────────────────────┐
              │  Home Assistant      │
              │                     │
              │ light.turn_on       │
              │ entity: light.salon │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   Luces fisicas     │
              │   SE ENCIENDEN      │
              └─────────────────────┘
```

## Flujo 4: Home Assistant → Node-RED → n8n → Alexa (Alertas)

```
Evento: Sensor de movimiento detecta presencia (nadie en casa)
                          │
                          ▼
              ┌─────────────────────┐
              │  Home Assistant      │
              │  (state_changed)    │
              └──────────┬──────────┘
                         │ Automation trigger
                         ▼
              ┌─────────────────────┐
              │     Node-RED        │
              │ (escucha eventos)   │
              └──────────┬──────────┘
                         │ POST /webhook/ha-event
                         ▼
              ┌─────────────────────┐
              │        n8n          │
              │                     │
              │ 1. Recibe evento    │
              │ 2. Clasifica        │
              │ 3. Decide accion    │
              └──────────┬──────────┘
                         │ POST api-v3.voicemonkey.io
                         ▼
              ┌─────────────────────┐
              │   Voice Monkey      │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │      Echo           │
              │ "Alerta: movimiento │
              │  en la entrada"     │
              └─────────────────────┘
```

## Arquitectura Completa del Homelab

```
┌────────────────────────────────────────────────────────────────────────┐
│                         TU HOMELAB                                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────┐     ┌──────────────┐     ┌─────────────────────┐       │
│  │ Echo(s)  │◄───►│   Alexa      │◄───►│  AWS Lambda         │       │
│  │ Devices  │     │   Cloud      │     │  (Custom Skill)     │       │
│  └──────────┘     └──────────────┘     └──────────┬──────────┘       │
│       ▲                                           │                   │
│       │ Voice Monkey                              │ webhooks          │
│       │                                           ▼                   │
│  ┌────┴────────────────────────────────────────────────────┐          │
│  │                      n8n                                 │          │
│  │  - Hub de webhooks (recibe de Lambda)                   │          │
│  │  - Procesador de eventos (recibe de HA/Node-RED)        │          │
│  │  - Orquestador (decide que hacer con cada comando)      │          │
│  │  - Notificador (envia a Voice Monkey -> Echo)           │          │
│  └──────────────────────────┬──────────────────────────────┘          │
│                             │                                         │
│              ┌──────────────┼───────────────┐                         │
│              │              │               │                         │
│              ▼              ▼               ▼                         │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐          │
│  │   Node-RED    │  │   Otros      │  │   APIs externas  │          │
│  │               │  │   Servicios  │  │   (Slack, Gmail,  │          │
│  │ - Orquestador │  │  (MQTT, etc) │  │    Telegram...)   │          │
│  │ - HA bridge   │  │              │  │                   │          │
│  │ - Logica IoT  │  └──────────────┘  └──────────────────┘          │
│  └───────┬───────┘                                                    │
│          │ WebSocket                                                   │
│          ▼                                                            │
│  ┌───────────────────────────────────────┐                            │
│  │         Home Assistant                 │                            │
│  │                                        │                            │
│  │  - Luces (Zigbee/WiFi/Z-Wave)         │                            │
│  │  - Clima (AC, ventiladores)           │                            │
│  │  - Sensores (temp, movimiento, puerta)│                            │
│  │  - Cerraduras inteligentes            │                            │
│  │  - Camaras                            │                            │
│  │  - Escenas y scripts                  │                            │
│  └───────────────────────────────────────┘                            │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```
