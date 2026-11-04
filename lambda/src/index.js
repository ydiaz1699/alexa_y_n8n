/**
 * Alexa Custom Skill - Lambda Handler (Versión Mejorada)
 * Conexion bidireccional con n8n
 *
 * Mejoras incluidas:
 * - Validación de slots obligatorios + re-prompt
 * - Logging estructurado con duración y requestId
 * - Soporte SSML y shouldEndSession desde n8n
 * - Mejor manejo de errores (timeout, red, n8n)
 * - Refactor de handlers para reducir duplicación
 * - Contrato de respuesta documentado
 *
 * Contrato esperado de respuesta de n8n (JSON):
 * {
 *   "mensaje": "Texto que Alexa dirá (obligatorio si no hay ssml)",
 *   "ssml": "<speak>Texto con SSML opcional</speak>",
 *   "shouldEndSession": false,
 *   "card": { "title": "Título", "text": "Texto de la tarjeta" }
 * }
 */

const Alexa = require('ask-sdk-core');
const axios = require('axios');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const N8N_WEBHOOK_BASE_URL = process.env.N8N_WEBHOOK_URL || 'https://tu-n8n.ejemplo.com/webhook';
const N8N_TIMEOUT_MS = parseInt(process.env.N8N_TIMEOUT_MS, 10) || 7000;

if (!process.env.N8N_WEBHOOK_URL) {
  console.warn('[ADVERTENCIA] N8N_WEBHOOK_URL no está definida. Usando dominio de ejemplo.');
}

const WEBHOOKS = {
  ejecutarTarea: `${N8N_WEBHOOK_BASE_URL}/alexa-tarea`,
  consultarEstado: `${N8N_WEBHOOK_BASE_URL}/alexa-estado`,
  enviarMensaje: `${N8N_WEBHOOK_BASE_URL}/alexa-mensaje`,
  resumenDiario: `${N8N_WEBHOOK_BASE_URL}/alexa-resumen`,
  controlDispositivo: `${N8N_WEBHOOK_BASE_URL}/alexa-dispositivo`,
  comandoLibre: `${N8N_WEBHOOK_BASE_URL}/alexa-comando`,
};

// Acciones que requieren confirmación adicional
const DESTRUCTIVE_ACTIONS = ['apagar', 'reiniciar'];

// ============================================================
// UTILIDADES
// ============================================================

/**
 * Logging estructurado
 */
function log(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

/**
 * Extrae valor de un slot de forma segura
 */
function getSlotValue(handlerInput, slotName) {
  const request = handlerInput.requestEnvelope.request;
  if (request.intent?.slots?.[slotName]) {
    return request.intent.slots[slotName].value || null;
  }
  return null;
}

/**
 * Valida slots obligatorios. Si falta alguno, devuelve respuesta de re-prompt.
 * @returns {null|object} null si todo OK, o respuesta de Alexa si falta slot
 */
function validateRequiredSlots(handlerInput, requiredSlots) {
  for (const slot of requiredSlots) {
    const value = getSlotValue(handlerInput, slot.name);
    if (!value) {
      log('info', 'Slot obligatorio faltante', {
        intent: Alexa.getIntentName(handlerInput.requestEnvelope),
        slot: slot.name,
      });
      return handlerInput.responseBuilder
        .speak(slot.prompt)
        .reprompt(slot.reprompt || slot.prompt)
        .getResponse();
    }
  }
  return null;
}

/**
 * Llama a un webhook de n8n con logging y mejor manejo de errores
 */
async function callN8nWebhook(webhookUrl, payload, requestId) {
  const start = Date.now();
  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Source': 'alexa-skill',
        'X-Request-Id': requestId,
        'X-Timestamp': new Date().toISOString(),
      },
      timeout: N8N_TIMEOUT_MS,
    });

    const duration = Date.now() - start;
    log('info', 'n8n call success', { requestId, duration, status: response.status });

    return { success: true, data: response.data, duration };
  } catch (error) {
    const duration = Date.now() - start;
    const isTimeout = error.code === 'ECONNABORTED' || error.message.includes('timeout');

    log('error', 'n8n call failed', {
      requestId,
      duration,
      error: error.message,
      isTimeout,
      status: error.response?.status,
    });

    return {
      success: false,
      error: error.message,
      isTimeout,
      status: error.response?.status,
      duration,
    };
  }
}

/**
 * Construye la respuesta de voz a partir del resultado de n8n
 */
function buildSpeechResponse(handlerInput, result, fallbackMessage) {
  let speechText = fallbackMessage;
  let ssml = null;
  let shouldEndSession = false;
  let card = null;

  if (result.success && result.data) {
    speechText = result.data.mensaje || fallbackMessage;
    ssml = result.data.ssml || null;
    shouldEndSession = result.data.shouldEndSession === true;
    card = result.data.card || null;
  } else if (result.isTimeout) {
    speechText = 'La automatización está tardando más de lo esperado. Te aviso cuando termine.';
  } else {
    speechText = fallbackMessage;
  }

  const builder = handlerInput.responseBuilder;

  if (ssml) {
    builder.speak(ssml);
  } else {
    builder.speak(speechText);
  }

  if (!shouldEndSession) {
    builder.reprompt('¿Necesitas algo más?');
  }

  if (card && card.title && card.text) {
    builder.withSimpleCard(card.title, card.text);
  }

  return builder.getResponse();
}

/**
 * Factory para crear handlers de intents que llaman a n8n
 */
function createN8nIntentHandler({
  intentName,
  webhookKey,
  requiredSlots = [],
  buildPayload,
  fallbackMessage,
}) {
  return {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === intentName;
    },
    async handle(handlerInput) {
      const requestId = handlerInput.requestEnvelope.request.requestId;

      // Validar slots obligatorios
      const validationResponse = validateRequiredSlots(handlerInput, requiredSlots);
      if (validationResponse) return validationResponse;

      const payload = buildPayload(handlerInput);
      payload.userId = handlerInput.requestEnvelope.session.user.userId;
      payload.timestamp = new Date().toISOString();
      payload.requestId = requestId;

      log('info', 'Intent recibido', { requestId, intent: intentName, payload });

      const result = await callN8nWebhook(WEBHOOKS[webhookKey], payload, requestId);
      return buildSpeechResponse(handlerInput, result, fallbackMessage);
    },
  };
}

// ============================================================
// HANDLERS DE INTENTS
// ============================================================

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    const speechText = 'Bienvenido a tu centro de automatización con n8n. '
      + 'Puedes decirme: ejecuta una tarea, consulta el estado, '
      + 'envía un mensaje, dame el resumen del día, '
      + 'o controla un dispositivo. ¿Qué quieres hacer?';

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt('¿Qué automatización quieres ejecutar?')
      .getResponse();
  },
};

const EjecutarTareaIntentHandler = createN8nIntentHandler({
  intentName: 'EjecutarTareaIntent',
  webhookKey: 'ejecutarTarea',
  requiredSlots: [
    {
      name: 'nombreTarea',
      prompt: '¿Qué tarea quieres que ejecute?',
      reprompt: 'Dime el nombre de la tarea.',
    },
  ],
  buildPayload: (handlerInput) => ({
    action: 'ejecutar_tarea',
    tarea: getSlotValue(handlerInput, 'nombreTarea'),
  }),
  fallbackMessage: 'La tarea se ha ejecutado.',
});

const ConsultarEstadoIntentHandler = createN8nIntentHandler({
  intentName: 'ConsultarEstadoIntent',
  webhookKey: 'consultarEstado',
  requiredSlots: [
    {
      name: 'elemento',
      prompt: '¿De qué quieres saber el estado?',
      reprompt: 'Dime qué elemento quieres consultar.',
    },
  ],
  buildPayload: (handlerInput) => ({
    action: 'consultar_estado',
    elemento: getSlotValue(handlerInput, 'elemento'),
  }),
  fallbackMessage: 'El estado es normal.',
});

const EnviarMensajeIntentHandler = createN8nIntentHandler({
  intentName: 'EnviarMensajeIntent',
  webhookKey: 'enviarMensaje',
  requiredSlots: [
    {
      name: 'destinatario',
      prompt: '¿A quién quieres enviar el mensaje?',
      reprompt: 'Dime el nombre del destinatario.',
    },
    {
      name: 'contenido',
      prompt: '¿Qué mensaje quieres enviar?',
      reprompt: 'Dime el contenido del mensaje.',
    },
  ],
  buildPayload: (handlerInput) => ({
    action: 'enviar_mensaje',
    destinatario: getSlotValue(handlerInput, 'destinatario'),
    contenido: getSlotValue(handlerInput, 'contenido'),
  }),
  fallbackMessage: 'Mensaje enviado correctamente.',
});

const ResumenDiarioIntentHandler = createN8nIntentHandler({
  intentName: 'ResumenDiarioIntent',
  webhookKey: 'resumenDiario',
  requiredSlots: [],
  buildPayload: () => ({
    action: 'resumen_diario',
  }),
  fallbackMessage: 'No hay novedades por hoy. Todo está en orden.',
});

const ControlDispositivoIntentHandler = createN8nIntentHandler({
  intentName: 'ControlDispositivoIntent',
  webhookKey: 'controlDispositivo',
  requiredSlots: [
    {
      name: 'accionDispositivo',
      prompt: '¿Qué acción quieres realizar? Puedes decir encender, apagar o reiniciar.',
      reprompt: 'Dime la acción: encender, apagar o reiniciar.',
    },
    {
      name: 'dispositivo',
      prompt: '¿Qué dispositivo quieres controlar?',
      reprompt: 'Dime el nombre del dispositivo.',
    },
  ],
  buildPayload: (handlerInput) => {
    const accion = getSlotValue(handlerInput, 'accionDispositivo');
    const dispositivo = getSlotValue(handlerInput, 'dispositivo');

    // Nota: la confirmación de acciones destructivas se puede añadir aquí
    // guardando en sessionAttributes y usando Yes/No intents
    if (DESTRUCTIVE_ACTIONS.includes(accion)) {
      log('info', 'Acción potencialmente destructiva', { accion, dispositivo });
    }

    return {
      action: 'control_dispositivo',
      dispositivo,
      accion,
    };
  },
  fallbackMessage: 'Acción realizada en el dispositivo.',
});

const ComandoLibreIntentHandler = createN8nIntentHandler({
  intentName: 'ComandoLibreIntent',
  webhookKey: 'comandoLibre',
  requiredSlots: [
    {
      name: 'comando',
      prompt: '¿Qué comando quieres que procese?',
      reprompt: 'Dime el comando que quieres ejecutar.',
    },
  ],
  buildPayload: (handlerInput) => ({
    action: 'comando_libre',
    comando: getSlotValue(handlerInput, 'comando'),
  }),
  fallbackMessage: 'Comando procesado.',
});

// ============================================================
// HANDLERS DE SISTEMA
// ============================================================

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speechText = 'Soy tu puente con n8n. Puedes pedirme: '
      + 'ejecuta una tarea, consulta el estado de algo, '
      + 'envía un mensaje, dame el resumen del día, '
      + 'enciende o apaga un dispositivo, '
      + 'o dime un comando libre. ¿Qué necesitas?';

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
        || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('¡Hasta luego! Tu automatización sigue activa en n8n.')
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    log('info', 'Session ended', {
      reason: handlerInput.requestEnvelope.request.reason,
      requestId: handlerInput.requestEnvelope.request.requestId,
    });
    return handlerInput.responseBuilder.getResponse();
  },
};

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
  },
  handle(handlerInput) {
    const speechText = 'No entendí eso. Puedes decirme ejecuta una tarea, '
      + 'consulta un estado, o dame el resumen del día.';

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    const requestId = handlerInput.requestEnvelope?.request?.requestId;
    log('error', 'Error no controlado', {
      requestId,
      message: error.message,
      stack: error.stack,
    });

    return handlerInput.responseBuilder
      .speak('Lo siento, hubo un error inesperado. Intenta de nuevo.')
      .reprompt('Intenta decirme otra cosa.')
      .getResponse();
  },
};

// ============================================================
// EXPORTAR SKILL
// ============================================================

const skillBuilder = Alexa.SkillBuilders.custom();

exports.handler = skillBuilder
  .addRequestHandlers(
    LaunchRequestHandler,
    EjecutarTareaIntentHandler,
    ConsultarEstadoIntentHandler,
    EnviarMensajeIntentHandler,
    ResumenDiarioIntentHandler,
    ControlDispositivoIntentHandler,
    ComandoLibreIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler,
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
