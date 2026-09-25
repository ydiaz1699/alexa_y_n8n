# Ampliar el AI Agent: de domótica a asistente personal (más MCPs)

> **Objetivo:** aprovechar el **AI Agent + MCP** que ya tienes (`alexa-ha-mcp-agent.json`)
> para que Alexa no solo controle Home Assistant, sino que también gestione correo, agenda,
> búsquedas web, WhatsApp, etc. — como en el enfoque de "asistente personal" con múltiples MCPs.
>
> **Clave:** NO hay que montar otro workflow ni otra skill. El AI Agent de n8n admite
> **varias herramientas conectadas a la vez**. Se le añaden más nodos-tool al MISMO agente y
> el modelo decide cuál usar según el comando de voz.

---

## Qué tienes hoy (verificado en `alexa-ha-mcp-agent.json`)

```
Webhook Comando Alexa
   → AI Agent (Home Assistant)
        ├─ OpenAI Chat Model
        └─ Home Assistant MCP Tools   ← UN solo MCP (ha-mcp, SSE)
   → Formatear Respuesta para Alexa
   → Responder a Alexa
```

El AI Agent ya funciona con 1 MCP. Ampliarlo = **colgarle más herramientas** al mismo agente.

## Qué añadir (herramientas de asistente personal)

Cada una es un sub-nodo más conectado al AI Agent. Opciones según lo que ya tienes en tu NAS:

| Capacidad | Nodo n8n a añadir | Notas / lo que ya tienes |
|-----------|-------------------|--------------------------|
| **Correo** | Nodo **Gmail Tool** (nativo n8n) o un MCP de correo | Credencial Google OAuth en n8n |
| **Agenda** | Nodo **Google Calendar Tool** (nativo n8n) | Misma credencial Google |
| **Búsqueda web** | Nodo **HTTP Request Tool** a SerpAPI/Tavily, o el MCP de research catalogado | Tavily tiene free tier |
| **WhatsApp** | **HTTP Request Tool** → tu **OpenWA** del NAS (`http://openwa:2785`) | ✅ Ya tienes OpenWA montado (gateway WhatsApp) |
| **Otro MCP** | Nodo **MCP Client Tool** (SSE) → otro servidor MCP | Mismo patrón que ha-mcp |

> **Preferir nodos NATIVOS de n8n** (Gmail Tool, Calendar Tool) cuando existan: no requieren
> montar un MCP aparte y n8n ya trae la credencial. Un MCP Client Tool adicional solo si la
> capacidad no tiene nodo nativo.

## Cómo añadirlas (paso a paso en n8n)

1. Abre el workflow `alexa-ha-mcp-agent` en n8n.
2. En el nodo **AI Agent (Home Assistant)**, pulsa el **+** de "Tool" (igual que se conectó
   `Home Assistant MCP Tools`).
3. Elige el nodo-tool (ej. **Gmail Tool**, **Google Calendar Tool**, **HTTP Request Tool**,
   o **MCP Client Tool** con su SSE endpoint).
4. Configura su credencial (Google OAuth para Gmail/Calendar; API key para SerpAPI/Tavily;
   la URL de OpenWA para WhatsApp).
5. Da a cada tool un **nombre y descripción claros** (el modelo los lee para decidir cuándo
   usarla — regla del explainer de tools: descripción positiva y precisa).
6. Actualiza el **system message** del agente (ver abajo) para que sepa que ahora también
   gestiona correo/agenda/etc.

## System message ampliado (reemplaza el actual del AI Agent)

El actual solo habla de "asistente de hogar". Amplíalo a asistente general **manteniendo las
reglas de brevedad para Alexa** (máx 2 frases, español, confirmar acción). Ver el archivo
[`ai-agent-system-prompt.md`](./ai-agent-system-prompt.md) con el prompt listo para pegar.

## ⚠️ Cuidado crítico con el timeout de Alexa (robustez)

**Alexa corta a los ~8 segundos.** Cada MCP/tool que el agente encadene suma latencia
(cada llamada al LLM + la tool ≈ 2-4 s). Con varias tools, un comando complejo puede
**superar los 8 s y Alexa se queda muda**. Mitigaciones:
- Usar un modelo **rápido** (gpt-4o-mini / gemini-flash-lite).
- Mantener `max frases = 2` y prompts cortos.
- Para tareas largas (redactar y enviar un correo largo), responder rápido *"Voy a ello"* y
  hacer el trabajo pesado en segundo plano (patrón asíncrono), en vez de bloquear la respuesta.
- Tu Lambda ya usa `timeout = 8000ms` en `callN8nWebhook` — mantenerlo alineado.

## Ejemplos de comandos que habilita

```
"Alexa, ejecuta asistente inteligente ... ¿tengo correos sin leer?"
"Alexa, ejecuta asistente inteligente ... agenda una reunión mañana a las 5"
"Alexa, ejecuta asistente inteligente ... mándale un WhatsApp a Papá diciendo que ya voy"
"Alexa, ejecuta asistente inteligente ... enciende el salón al 50%"   (domótica, ya funcionaba)
```

## Referencias

- Setup del MCP base y ventajas AI Agent vs REST: [`../home-assistant/README-ha-mcp.md`](../home-assistant/README-ha-mcp.md)
- MCP de research (búsqueda profunda), si se quiere: catalogado en Varios_tools/tool_catalog/entries/deep-research-mcp.md
- OpenWA (WhatsApp) ya montado en el NAS: red db_net, `http://openwa:2785` (ver nas-dotfiles docs/services/openwa-guide.md)
- Idea original: video "integrar agente de IA en n8n + MCP + Alexa" (Rodrigo de la Torre / Cognitive Data Solutions)
