# Alexa + n8n - Conexion Bidireccional

Proyecto completo para conectar **Amazon Echo (Alexa)** con **n8n** de forma bidireccional usando una **Custom Skill** y **AWS Lambda**.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO BIDIRECCIONAL                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ALEXA → n8n (Comandos de voz)                                 │
│  ┌───────┐    ┌─────────┐    ┌──────────┐    ┌──────────────┐ │
│  │ Echo  │───>│ Alexa   │───>│  Lambda  │───>│ n8n Webhook  │ │
│  │Device │    │ Service │    │(Node.js) │    │  (responde)  │ │
│  └───────┘    └─────────┘    └──────────┘    └──────────────┘ │
│      ▲                            │                   │        │
│      │                            ▼                   ▼        │
│      └─────── Alexa habla ◄── respuesta ◄── JSON response     │
│                                                                 │
│  n8n → ALEXA (Notificaciones proactivas)                       │
│  ┌──────────────┐    ┌──────────────┐    ┌───────┐            │
│  │ n8n Workflow │───>│ Voice Monkey │───>│ Echo  │            │
│  │  (HTTP Req)  │    │     API      │    │Device │            │
│  └──────────────┘    └──────────────┘    └───────┘            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
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
│   └── n8n-a-alexa-notificacion.json     # Notificaciones (n8n -> Alexa)
├── docs/                          # Documentacion adicional
│   └── diagramas.md              # Diagramas de flujo detallados
├── .gitignore
└── README.md
```

## Requisitos Previos

1. **Cuenta de Amazon Developer** - [developer.amazon.com](https://developer.amazon.com)
2. **Cuenta de AWS** - [aws.amazon.com](https://aws.amazon.com) (Lambda free tier es suficiente)
3. **Instancia de n8n accesible desde internet** - Opciones:
   - [n8n Cloud](https://n8n.io/cloud/) (mas facil)
   - Self-hosted con dominio + SSL (Cloudflare Tunnel, ngrok, VPS)
4. **Cuenta de Voice Monkey** (solo para n8n -> Alexa) - [voicemonkey.io](https://voicemonkey.io)
5. **Node.js 18+** instalado localmente (para desarrollo)

---

## Guia de Configuracion Paso a Paso

### Paso 1: Configurar n8n

1. Accede a tu instancia de n8n
2. Ve a **Workflows** > **Importar desde archivo**
3. Importa `n8n-workflows/alexa-bidireccional-workflow.json`
4. **Activa el workflow** (importante: los webhooks solo funcionan con el workflow activo)
5. Anota la URL base de tus webhooks. Sera algo como:
   ```
   https://tu-n8n.com/webhook/alexa-tarea
   https://tu-n8n.com/webhook/alexa-estado
   https://tu-n8n.com/webhook/alexa-mensaje
   https://tu-n8n.com/webhook/alexa-resumen
   https://tu-n8n.com/webhook/alexa-dispositivo
   https://tu-n8n.com/webhook/alexa-comando
   ```

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

### Paso 5: Probar

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
