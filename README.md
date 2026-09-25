# Alexa + n8n + Node-RED + Home Assistant - Conexion Bidireccional

Proyecto completo para conectar **Amazon Echo (Alexa)** con **n8n**, **Node-RED** y **Home Assistant** de forma bidireccional usando una **Custom Skill** y **AWS Lambda**.

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────────┐
│                    HOMELAB - FLUJO COMPLETO                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ALEXA → n8n → Node-RED → Home Assistant (Comandos de voz)          │
│  ┌──────┐   ┌───────┐   ┌────────┐   ┌─────────┐   ┌───────────┐  │
│  │ Echo │──>│ Lambda│──>│  n8n   │──>│Node-RED │──>│Home Assist│  │
│  └──────┘   └───────┘   └────────┘   └─────────┘   └───────────┘  │
│      ▲                       │                           │           │
│      └───── Alexa habla ◄────┘     ◄── estado/confirm ──┘           │
│                                                                      │
│  Home Assistant → Node-RED → n8n → Alexa (Alertas proactivas)       │
│  ┌───────────┐   ┌─────────┐   ┌────────┐   ┌──────────┐   ┌────┐│
│  │ Sensores  │──>│Node-RED │──>│  n8n   │──>│VoiceMonk │──>│Echo││
│  │ HA events │   │(bridge) │   │(process│   │   API    │   │    ││
│  └───────────┘   └─────────┘   └────────┘   └──────────┘   └────┘│
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Estructura del Proyecto

```
alexa_y_n8n/
├── lambda/                        # Funcion AWS Lambda
│   ├── src/
│   │   └── index.js              # Handler principal (Alexa SDK + llamadas a n8n)
│   ├── package.json              # Dependencias (ask-sdk, axios)
│   └── .env.example              # Variables de entorno de ejemplo
├── skill-model/                   # Modelo de la Skill de Alexa
│   ├── es-ES.json                # Interaction Model (intents, slots, utterances)
│   └── skill.json                # Manifest de la skill
├── n8n-workflows/                 # Workflows exportados de n8n
│   ├── alexa-bidireccional-workflow.json  # Hub central (Alexa -> n8n)
│   ├── alexa-ha-mcp-agent.json           # AI Agent + ha-mcp (RECOMENDADO)
│   ├── n8n-a-alexa-notificacion.json     # Notificaciones (n8n -> Alexa)
│   ├── ha-events-processor.json          # Procesa eventos de Home Assistant
│   └── node-red-orchestrator.json        # Enruta comandos via Node-RED a HA
├── node-red/                      # Flows de Node-RED
│   ├── flows-alexa-n8n-ha.json   # Flow principal (bridge n8n <-> HA)
│   └── README-node-red.md        # Guia de setup de Node-RED
├── home-assistant/                # Config de Home Assistant
│   ├── automations-alexa-n8n.yaml # Automaciones HA para n8n
│   ├── configuration-extras.yaml  # rest_commands, scripts, templates
│   └── README-ha-mcp.md          # Guia setup ha-mcp + n8n AI Agent
├── docs/                          # Documentacion adicional
│   ├── diagramas.md              # Diagramas de flujo detallados
│   ├── asistente-personal-mcps.md # Ampliar el AI Agent con mas MCPs (correo/agenda/WhatsApp)
│   └── ai-agent-system-prompt.md  # System prompt ampliado listo para pegar
├── .gitignore
└── README.md
```

## Requisitos Previos

1. **Cuenta de Amazon Developer** - [developer.amazon.com](https://developer.amazon.com)
2. **Cuenta de AWS** - [aws.amazon.com](https://aws.amazon.com) (Lambda free tier es suficiente)
3. **Instancia de n8n accesible desde internet** - Opciones:
   - [n8n Cloud](https://n8n.io/cloud/) (mas facil)
   - Self-hosted con dominio + SSL (Cloudflare Tunnel, ngrok, VPS)
4. **ha-mcp** corriendo en tu homelab - [github.com/homeassistant-ai/ha-mcp](https://github.com/homeassistant-ai/ha-mcp)
5. **Cuenta de Voice Monkey** (solo para n8n -> Alexa) - [voicemonkey.io](https://voicemonkey.io)
6. **Un LLM** para el AI Agent: OpenAI API key, o Ollama local (gratis)
7. **Node.js 18+** instalado localmente (para desarrollo)

---

## Guia de Configuracion Paso a Paso

### Paso 1: Configurar ha-mcp (Home Assistant MCP Server)

> **Esta es la pieza clave** que permite a n8n controlar HA con lenguaje natural.
> Consulta la guia detallada en `home-assistant/README-ha-mcp.md`

**Opcion rapida con Docker:**
```bash
docker run -d \
  --name ha-mcp \
  --restart unless-stopped \
  -e HOMEASSISTANT_URL=http://TU_IP_HA:8123 \
  -e HOMEASSISTANT_TOKEN=TU_LONG_LIVED_TOKEN \
  -e TRANSPORT=sse \
  -e PORT=3000 \
  -p 3000:3000 \
  ghcr.io/homeassistant-ai/ha-mcp:latest
```

Verifica que funciona: `curl http://TU_IP:3000/sse` (deberia mantener conexion abierta)

### Paso 2: Configurar n8n

1. Accede a tu instancia de n8n
2. **Importa el workflow principal (AI Agent + ha-mcp)**:
   - Importa `n8n-workflows/alexa-ha-mcp-agent.json` ⭐ **RECOMENDADO**
   - Configura el nodo "Home Assistant MCP Tools":
     - SSE Endpoint: `http://TU_IP_HOMELAB:3000/sse`
     - Authentication: Bearer → tu Long-Lived Token de HA
   - Configura el Chat Model (OpenAI o Ollama)
   - Activa el workflow
3. **Opcionalmente**, importa los workflows adicionales:
   - `alexa-bidireccional-workflow.json` - Hub clasico con webhooks (sin AI)
   - `n8n-a-alexa-notificacion.json` - Notificaciones n8n → Echo
   - `ha-events-processor.json` - Alertas de HA
4. Anota la URL de produccion del webhook principal

### Paso 2: Crear la Skill en Alexa Developer Console

1. Ve a [developer.amazon.com/alexa/console/ask](https://developer.amazon.com/alexa/console/ask)
2. Click **"Create Skill"**
3. Configuracion:
   - **Nombre**: "Mi Automatizacion n8n"
   - **Locale**: Spanish (ES) / Spanish (MX)
   - **Modelo**: Custom
   - **Backend**: Provision your own (AWS Lambda)
4. En el **Build** tab:
   - Ve a **Interaction Model** > **JSON Editor**
   - Pega el contenido de `skill-model/es-ES.json`
   - Click **Save Model** > **Build Model**
5. Ve a **Endpoint**:
   - Selecciona **AWS Lambda ARN**
   - Pega el ARN de tu Lambda (lo obtendras en el paso 3)

### Paso 3: Crear la Lambda en AWS

#### Opcion A: Desde la Consola AWS (recomendado para empezar)

1. Ve a [AWS Lambda Console](https://console.aws.amazon.com/lambda)
2. **Create Function**:
   - Nombre: `alexa-n8n-skill`
   - Runtime: Node.js 18.x
   - Arquitectura: arm64 (mas barato)
3. **Agregar trigger**:
   - Selecciona "Alexa Skills Kit"
   - Pega tu **Skill ID** (lo encuentras en la Alexa Developer Console)
4. **Subir el codigo**:
   ```bash
   cd lambda
   npm install
   zip -r ../lambda-deployment.zip .
   ```
   - Sube `lambda-deployment.zip` en la consola de Lambda
5. **Variables de entorno** (Configuration > Environment variables):
   - `N8N_WEBHOOK_URL` = `https://tu-n8n.com/webhook`
6. **Timeout**: Subir a 10 segundos (Configuration > General)
7. Copia el **ARN** de la Lambda y pegalo en el Endpoint de la skill (Paso 2.5)

#### Opcion B: Usando AWS CLI

```bash
# Instalar dependencias y crear zip
cd lambda
npm install
zip -r ../lambda-deployment.zip .

# Crear la funcion Lambda
aws lambda create-function \
  --function-name alexa-n8n-skill \
  --runtime nodejs18.x \
  --handler src/index.handler \
  --role arn:aws:iam::TU_ACCOUNT_ID:role/lambda-alexa-role \
  --zip-file fileb://../lambda-deployment.zip \
  --timeout 10 \
  --memory-size 128 \
  --architecture arm64 \
  --environment "Variables={N8N_WEBHOOK_URL=https://tu-n8n.com/webhook}"

# Agregar permiso para que Alexa invoque la Lambda
aws lambda add-permission \
  --function-name alexa-n8n-skill \
  --statement-id alexa-skill \
  --action lambda:InvokeFunction \
  --principal alexa-appkit.amazon.com \
  --event-source-token amzn1.ask.skill.TU_SKILL_ID
```

### Paso 4: Configurar Voice Monkey (para n8n -> Alexa)

1. Registrate en [voicemonkey.io](https://voicemonkey.io)
2. Habilita la skill "Voice Monkey" en la app Alexa
3. En el dashboard de Voice Monkey:
   - Crea un **Speaker Device** vinculado a tu Echo
   - Copia el **token** y el **device ID**
4. En n8n:
   - Importa `n8n-workflows/n8n-a-alexa-notificacion.json`
   - Edita el nodo "Enviar a Alexa (Voice Monkey)"
   - Reemplaza `TU_TOKEN_VOICE_MONKEY` y `TU_DEVICE_ID`
   - Activa el workflow

> **Alternativa a Voice Monkey (evaluada y DESCARTADA por ahora):** existen nodos de
> Node-RED que hacen hablar a los Echo **sin servicio externo** (ej.
> `node-red-contrib-alexa-remote2`, `node-red-contrib-amazon-echo`; método visto en un video
> de "Diego" que conecta Gmail→MQTT→Node-RED→Alexa habla). **No se adopta** porque usan una
> **API NO oficial de Amazon, sin mantenimiento**, con el problema recurrente de tener que
> **re-loguearse para renovar la cookie** "a veces cada semanas, a veces cada horas" (reportes
> de la comunidad HA, 2025-2026). Voice Monkey depende de un tercero pero es **más estable**
> para notificaciones proactivas. Además, ese método es **unidireccional** (solo n8n→Alexa):
> este proyecto ya lo supera con la Custom Skill + Lambda (Alexa→n8n) bidireccional. Se deja
> anotado para no re-evaluarlo; revisar si algún día aparece un nodo mantenido.
> (Ficha en `Varios_tools/tool_catalog/entries/alexa-remote2-nodered.md`, estado DESCARTADO.)

### Paso 5: Configurar Node-RED (bridge con Home Assistant)

1. Instala el nodo de HA en Node-RED:
   ```bash
   cd ~/.node-red
   npm install node-red-contrib-home-assistant-websocket
   ```
2. Reinicia Node-RED
3. Importa `node-red/flows-alexa-n8n-ha.json` en Node-RED
4. Configura el servidor de Home Assistant:
   - Base URL: `http://TU_IP_HA:8123`
   - Long-Lived Access Token (generar en HA > Perfil > Tokens)
5. Configura las variables de entorno de Node-RED:
   - `VOICE_MONKEY_TOKEN`
   - `VOICE_MONKEY_DEVICE`
6. Edita los mapas de dispositivos en los nodos Function para que coincidan con tus entity_ids reales
7. Deploy

### Paso 6: Configurar Home Assistant

1. Agrega el contenido de `home-assistant/configuration-extras.yaml` a tu `configuration.yaml`:
   - `rest_command` para llamar a n8n y Node-RED
   - `script` con rutinas utiles (buenos_dias, buenas_noches, etc.)
   - `template` sensor con resumen del hogar
2. Agrega las automaciones de `home-assistant/automations-alexa-n8n.yaml` a tu archivo de automaciones
3. Cambia las URLs de ejemplo por las tuyas:
   - `https://tu-n8n.ejemplo.com/webhook/ha-event` → tu URL real de n8n
   - `http://localhost:1880/alexa/command` → tu IP de Node-RED
4. Cambia los `entity_id` por los de tu instalacion real
5. Reinicia Home Assistant

### Paso 7: Importar workflow de eventos en n8n

1. Importa `n8n-workflows/ha-events-processor.json` - Procesa alertas de HA
2. Importa `n8n-workflows/node-red-orchestrator.json` - Enruta a Node-RED
3. En el orchestrator, cambia `TU_IP_NODERED:1880` por la IP real de tu Node-RED
4. Activa ambos workflows

### Paso 8: Probar

#### Probar Alexa -> n8n:
1. En la Alexa Developer Console, ve al **Test** tab
2. Cambia a "Development"
3. Escribe o di: "abre mi automatizacion"
4. Prueba los comandos:
   - "ejecuta backup"
   - "cual es el estado del servidor"
   - "dame el resumen del dia"
   - "enciende las luces"
   - "envia un mensaje a Carlos diciendo todo listo"

#### Probar Alexa -> n8n -> Node-RED -> HA:
1. Di: "Alexa, dile a mi automatizacion que encienda las luces"
2. n8n deberia enrutar a Node-RED, que ejecuta la accion en HA
3. Verifica en HA que la entidad cambio de estado

#### Probar HA -> n8n -> Alexa:
1. Activa manualmente un sensor en HA (o simula un evento)
2. La automatizacion de HA enviara el evento a n8n
3. n8n procesara y enviara la alerta via Voice Monkey
4. Tu Echo deberia anunciar la alerta

#### Probar n8n -> Alexa:
1. En n8n, ejecuta manualmente el workflow de notificacion
2. Tu Echo deberia hablar con el mensaje configurado

---

## Comandos de Voz Disponibles

| Comando | Ejemplo | Intent |
|---------|---------|--------|
| Ejecutar tarea | "ejecuta backup" | EjecutarTareaIntent |
| Consultar estado | "como esta el servidor" | ConsultarEstadoIntent |
| Enviar mensaje | "envia mensaje a Juan diciendo hola" | EnviarMensajeIntent |
| Resumen diario | "dame el resumen del dia" | ResumenDiarioIntent |
| Control dispositivo | "enciende las luces" | ControlDispositivoIntent |
| Comando libre | "dile a n8n que haga un deploy" | ComandoLibreIntent |

---

## Personalizacion

### Agregar nuevos intents

1. Agrega el intent en `skill-model/es-ES.json`
2. Agrega el handler en `lambda/src/index.js`
3. Agrega un nuevo webhook en el workflow de n8n
4. Reconstruye el modelo en la consola de Alexa

### Conectar con servicios reales en n8n

En cada nodo "Code" del workflow puedes:
- Reemplazar la logica de ejemplo por llamadas reales
- Agregar nodos adicionales (Slack, Gmail, Notion, etc.)
- Conectar con APIs externas usando el nodo HTTP Request
- Usar el nodo de OpenAI para respuestas inteligentes

### Ejemplo: Resumen diario con datos reales

```
Webhook -> Google Calendar (obtener eventos) -> Gmail (emails no leidos) -> 
Code (formatear mensaje) -> Respond to Webhook
```

---

## Solucion de Problemas

| Problema | Solucion |
|----------|----------|
| "Hubo un problema al ejecutar" | Verifica que el workflow de n8n este activo y la URL sea correcta |
| Timeout en Lambda | Sube el timeout a 10-15 segundos en la config de Lambda |
| Skill no responde | Verifica el ARN de Lambda en la Alexa Console y que el Skill ID este en el trigger |
| n8n no recibe datos | Asegura que n8n sea accesible desde internet (no localhost) |
| Voice Monkey no habla | Verifica token/device ID y que la skill Voice Monkey este habilitada |

---

## Costos Estimados

| Servicio | Costo |
|----------|-------|
| AWS Lambda | Gratis (free tier: 1M requests/mes) |
| Alexa Custom Skill | Gratis |
| n8n Cloud | Desde $20/mes (o gratis self-hosted) |
| Voice Monkey | Gratis (plan basico) |

---

## Licencia

MIT License - Usa este proyecto como quieras.

---

## Casos de Uso con Homelab Completo

### Ejemplo 1: "Alexa, modo pelicula"
```
Echo → Lambda → n8n → Node-RED → Home Assistant
                                    ├─ Apaga luces principales
                                    ├─ Enciende tira LED en modo tenue
                                    ├─ Enciende TV
                                    └─ Baja persianas
```

### Ejemplo 2: Alerta de seguridad automatica
```
Sensor movimiento (HA) → Automation → rest_command → n8n
  n8n evalua: nadie en casa?
    SI → Voice Monkey → Echo: "Alerta: movimiento detectado"
    SI → Telegram/Email notificacion
    SI → Captura camara → guarda snapshot
```

### Ejemplo 3: "Alexa, dame el resumen del dia"
```
Echo → Lambda → n8n:
  ├─ Consulta Google Calendar (reuniones)
  ├─ Consulta HA (temperatura, luces encendidas)
  ├─ Consulta Todoist (tareas pendientes)
  └─ Formatea respuesta → Lambda → Echo habla el resumen
```

### Ejemplo 4: Rutina de "Buenos dias" completa
```
Echo: "Alexa, buenos dias" → Lambda → n8n → Node-RED → HA:
  ├─ Activa scene.modo_dia
  ├─ Lee temperatura actual
  ├─ Consulta calendario
  └─ Echo anuncia: "Buenos dias, 22 grados, tienes 3 reuniones hoy"
```

### Ejemplo 5: n8n detecta email urgente → avisa por Echo
```
n8n (trigger: nuevo email con label "urgente")
  → Procesa contenido
  → Voice Monkey API
  → Echo: "Tienes un email urgente de Juan sobre el proyecto X"
```


---

## Ampliaciones: de domótica a asistente personal

Los ejemplos 3–5 de arriba (correo, agenda, resúmenes) se habilitan **sin crear otro
workflow ni otra skill**: el **AI Agent** de `alexa-ha-mcp-agent.json` admite VARIAS
herramientas a la vez. Se le conectan más nodos-tool (Gmail, Google Calendar, búsqueda web,
WhatsApp vía OpenWA, u otro MCP) y el modelo elige cuál usar según el comando de voz. Es el
enfoque "asistente personal con múltiples MCPs".

- **Cómo añadir esas herramientas (paso a paso):** [`docs/asistente-personal-mcps.md`](docs/asistente-personal-mcps.md)
- **System prompt ampliado (listo para pegar en el AI Agent):** [`docs/ai-agent-system-prompt.md`](docs/ai-agent-system-prompt.md)

> ⚠️ **Timeout de Alexa (~8 s):** cada herramienta que el agente encadena suma latencia.
> Usa un modelo rápido (gpt-4o-mini / gemini-flash-lite), respuestas de máx. 2 frases, y para
> tareas largas responde "voy a ello" y hazlas en segundo plano. La Lambda usa
> `N8N_TIMEOUT_MS` (default 7000 ms, con margen); ver `lambda/.env.example`.
