# Lambda Mejorada - Alexa + n8n

## Cambios principales respecto a la versión original

### 1. Validación de slots obligatorios
Ahora los intents exigen los slots necesarios antes de llamar a n8n.  
Si falta un dato, Alexa pregunta específicamente en lugar de enviar un payload incompleto.

### 2. Logging estructurado
Todos los logs salen en formato JSON con:
- `requestId`
- duración de la llamada a n8n
- intent
- errores clasificados (timeout vs red vs n8n)

### 3. Contrato de respuesta enriquecido de n8n
n8n puede devolver ahora:

```json
{
  "mensaje": "El aire se ha encendido",
  "ssml": "<speak>El aire <emphasis>se ha encendido</emphasis></speak>",
  "shouldEndSession": false,
  "card": {
    "title": "Dispositivo",
    "text": "Aire acondicionado encendido"
  }
}
```

- Si viene `ssml`, Alexa lo usa.
- `shouldEndSession: true` cierra la sesión.
- Se puede mostrar una tarjeta simple.

### 4. Mejor manejo de errores
- Distingue timeouts (mensaje específico).
- Logging de status HTTP cuando n8n responde con error.
- Mensajes más claros al usuario.

### 5. Refactor (menos duplicación)
Se creó `createN8nIntentHandler()` que genera los handlers de forma declarativa.  
Añadir un nuevo intent es mucho más sencillo.

### 6. Preparado para confirmación de acciones destructivas
El código ya detecta acciones como `apagar` o `reiniciar`.  
Se puede extender fácilmente con session attributes + Yes/No intents.

---

## Cómo usarlo

1. Reemplaza el contenido de `lambda/src/index.js` con el de `index-mejorado.js`.
2. Asegúrate de tener las mismas variables de entorno:
   - `N8N_WEBHOOK_URL`
   - `N8N_TIMEOUT_MS` (opcional)
3. Redeploy a Lambda.
4. Actualiza tus workflows de n8n para que, si quieren, devuelvan `ssml`, `card` o `shouldEndSession`.

## Notas

- Compatible con la estructura actual de webhooks (`/alexa-tarea`, `/alexa-estado`, etc.).
- No requiere cambios en el Interaction Model (`es-ES.json`) para funcionar.
- El código original sigue siendo válido; esta es una evolución directa.
