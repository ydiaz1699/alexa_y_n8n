# Home Assistant MCP Server (ha-mcp) - Setup para n8n

## Que es ha-mcp?

[ha-mcp](https://github.com/homeassistant-ai/ha-mcp) es un servidor MCP (Model Context Protocol) 
que expone **80+ herramientas** para controlar Home Assistant via AI.

Al conectarlo con el **MCP Client Tool** de n8n, un AI Agent dentro de n8n puede:
- Controlar TODOS los dispositivos de tu HA (luces, clima, locks, covers, etc.)
- Consultar estados de cualquier entidad
- Ejecutar servicios
- Gestionar automaciones
- Consultar historial
- Y mucho mas...

**Ventaja**: No necesitas mapear manualmente cada dispositivo - el AI Agent usa
lenguaje natural para decidir que herramienta MCP llamar.

## Instalacion de ha-mcp

### Opcion A: Home Assistant Add-on (Recomendado si usas HA OS)

1. En Home Assistant, ve a **Settings > Add-ons > Add-on Store**
2. Click en los 3 puntos (arriba derecha) > **Repositories**
3. Agrega: `https://github.com/homeassistant-ai/ha-mcp`
4. Busca "HA MCP" en la tienda de add-ons e instalalo
5. Inicia el add-on
6. La URL SSE sera: `http://TU_IP_HA:8123/api/hassio/ingress/ADDON_SLUG/sse`

### Opcion B: Docker (si usas HA Container o Core)

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

La URL SSE sera: `http://TU_IP_HOMELAB:3000/sse`

### Opcion C: pip install (desarrollo/testing)

```bash
pip install ha-mcp

# Ejecutar con SSE transport
HOMEASSISTANT_URL=http://TU_IP_HA:8123 \
HOMEASSISTANT_TOKEN=TU_LONG_LIVED_TOKEN \
ha-mcp --transport sse --port 3000
```

## Generar el Long-Lived Access Token

1. En Home Assistant, click en tu perfil (abajo izquierda)
2. Scroll hasta **Long-Lived Access Tokens**
3. Click **Create Token**
4. Nombre: "n8n-mcp"
5. Copia el token (solo se muestra una vez!)

## Configurar n8n con ha-mcp

### En n8n: Configurar el MCP Client Tool

1. Crea un nuevo workflow o edita el existente
2. Agrega un nodo **AI Agent**
3. Conecta un **Chat Model** (OpenAI, Anthropic, Ollama, etc.)
4. Agrega un sub-nodo **MCP Client Tool** al AI Agent:
   - **SSE Endpoint**: `http://TU_IP_HOMELAB:3000/sse`
     (o la URL del add-on si usas HA OS)
   - **Authentication**: Bearer
   - **Token**: TU_LONG_LIVED_TOKEN de HA
5. El nodo descubrira automaticamente todas las herramientas disponibles

### Herramientas MCP disponibles (80+):

| Categoria | Herramientas ejemplo |
|-----------|---------------------|
| Luces | `ha_light_turn_on`, `ha_light_turn_off`, `ha_light_set_brightness` |
| Clima | `ha_climate_set_temperature`, `ha_climate_set_mode` |
| Covers | `ha_cover_open`, `ha_cover_close`, `ha_cover_set_position` |
| Locks | `ha_lock_lock`, `ha_lock_unlock` |
| Sensores | `ha_get_entity_state`, `ha_get_entities` |
| Servicios | `ha_call_service` |
| Escenas | `ha_scene_turn_on` |
| Scripts | `ha_script_turn_on` |
| Automaciones | `ha_automation_trigger`, `ha_automation_toggle` |
| Historial | `ha_get_history` |
| General | `ha_get_areas`, `ha_get_devices` |

## Flujo Completo: Alexa → n8n AI Agent → ha-mcp → Home Assistant

```
"Alexa, dile a mi automatizacion que encienda las luces del salon al 50%"
    │
    ▼
AWS Lambda → POST /webhook/alexa-comando
    │
    ▼
n8n Webhook recibe: { action: "comando_libre", comando: "enciende las luces del salon al 50%" }
    │
    ▼
n8n AI Agent (con OpenAI/Anthropic):
  - Interpreta: "necesito encender light.salon al 50%"
  - Llama herramienta MCP: ha_light_turn_on(entity_id="light.salon", brightness_pct=50)
    │
    ▼
ha-mcp → Home Assistant API → Luces se encienden al 50%
    │
    ▼
AI Agent responde: "Luces del salon encendidas al 50 por ciento."
    │
    ▼
n8n → Lambda → Alexa habla: "Luces del salon encendidas al 50 por ciento."
```

## Ventajas sobre el metodo REST directo

| Caracteristica | REST directo (Node-RED) | ha-mcp + AI Agent |
|---------------|------------------------|-------------------|
| Mapeo de dispositivos | Manual (deviceMap) | Automatico (AI decide) |
| Nuevos dispositivos | Editar codigo | Descubiertos automaticamente |
| Comandos complejos | Logica if/else manual | AI interpreta lenguaje natural |
| Consultas de estado | Endpoint especifico | Pregunta en lenguaje natural |
| Escenas | Mapeo manual | AI busca la escena correcta |
| Mantenimiento | Alto | Bajo |

## Notas importantes

- **Latencia**: El AI Agent agrega ~2-4 segundos extra (procesamiento LLM)
- **Costo LLM**: Cada llamada usa tokens del modelo (gpt-4o-mini es barato)
- **Fallback**: Puedes mantener Node-RED como fallback para comandos simples/rapidos
- **Timeout**: Alexa espera max 8 seg. Usa gpt-4o-mini para respuestas rapidas
- **Seguridad**: El token de HA da acceso total - protege bien tu red

## Alternativa gratuita: Ollama como LLM local

Si no quieres pagar por OpenAI, usa Ollama en tu homelab:

```
# En tu server
docker run -d --gpus all -p 11434:11434 ollama/ollama
ollama pull llama3.1:8b
```

En n8n, en lugar de OpenAI Chat Model, usa el nodo **Ollama Chat Model**:
- Base URL: `http://TU_IP:11434`
- Model: `llama3.1:8b`
