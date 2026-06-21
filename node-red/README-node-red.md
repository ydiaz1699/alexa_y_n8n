# Node-RED - Configuracion para Alexa + n8n + Home Assistant

## Requisitos

- Node-RED instalado (generalmente en `http://tu-ip:1880`)
- Nodos adicionales necesarios:
  ```bash
  cd ~/.node-red
  npm install node-red-contrib-home-assistant-websocket
  ```

## Importar el Flow

1. Abre Node-RED en tu navegador (`http://tu-homelab-ip:1880`)
2. Menu hamburguesa (arriba derecha) > **Import**
3. Pega el contenido de `flows-alexa-n8n-ha.json`
4. Click **Import**

## Configurar Home Assistant en Node-RED

1. Doble-click en cualquier nodo de Home Assistant
2. Click en el lapiz junto a "Server"
3. Configura:
   - **Base URL**: `http://tu-ip-ha:8123`
   - **Access Token**: (genera un Long-Lived Token en HA > Perfil > Tokens)
4. Deploy

## Configurar Variables de Entorno

En tu archivo `.env` de Node-RED o en Settings > Environment:

```
VOICE_MONKEY_TOKEN=tu_token_voice_monkey
VOICE_MONKEY_DEVICE=tu_device_id
N8N_WEBHOOK_URL=https://tu-n8n.ejemplo.com/webhook
```

## URLs expuestas por Node-RED

| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/alexa/command` | POST | Recibe comandos de n8n (Alexa -> n8n -> Node-RED -> HA) |
| `/n8n/ha-action` | POST | Recibe acciones genericas de n8n para ejecutar en HA |

## Personalizacion

### Agregar dispositivos al mapa

Edita el nodo "Parsear Comando Dispositivo" y agrega tus entity_ids:

```javascript
const deviceMap = {
    'luces': 'light.tu_luz',
    'television': 'media_player.tu_tv',
    // agrega los tuyos aqui
};
```

### Agregar escenas

Edita el nodo "Parsear Escena":

```javascript
const sceneMap = {
    'pelicula': 'scene.tu_escena_pelicula',
    'noche': 'scene.tu_escena_noche',
    // agrega las tuyas aqui
};
```
