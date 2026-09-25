/**
 * Alexa Custom Skill - Lambda Handler
 * Conexion bidireccional con n8n
 * 
 * Flujo Alexa -> n8n: El usuario habla, Lambda envia datos al webhook de n8n
 * Flujo n8n -> Alexa: n8n responde con datos que Alexa lee al usuario
 */

const Alexa = require('ask-sdk-core');
const axios = require('axios');

// ============================================================
// CONFIGURACION - Cambiar estos valores por los tuyos
// ============================================================
const N8N_WEBHOOK_BASE_URL = process.env.N8N_WEBHOOK_URL || 'https://tu-n8n.ejemplo.com/webhook';

// Aviso claro en logs si la env var no esta configurada (evita fallos silenciosos
// apuntando al dominio de ejemplo). Se ve en CloudWatch al arrancar la Lambda.
if (!process.env.N8N_WEBHOOK_URL) {
  console.warn(
    '[ADVERTENCIA] N8N_WEBHOOK_URL no esta definida; usando el dominio de EJEMPLO. '
    + 'Configura la variable de entorno de la Lambda con la URL real de tu n8n.'
  );
}

// Timeout de las llamadas a n8n. Alexa corta la sesion a ~8 s; se deja MARGEN
// (7 s) para que la Lambda alcance a construir y devolver la respuesta de voz.
// Si un flujo n8n tarda mas, responder rapido y hacer el trabajo pesado async.
const N8N_TIMEOUT_MS = parseInt(process.env.N8N_TIMEOUT_MS, 10) || 7000;

// Endpoints especificos para cada intent
const WEBHOOKS = {
  ejecutarTarea: `${N8N_WEBHOOK_BASE_URL}/alexa-tarea`,
  consultarEstado: `${N8N_WEBHOOK_BASE_URL}/alexa-estado`,
  enviarMensaje: `${N8N_WEBHOOK_BASE_URL}/alexa-mensaje`,
  resumenDiario: `${N8N_WEBHOOK_BASE_URL}/alexa-resumen`,
  controlDispositivo: `${N8N_WEBHOOK_BASE_URL}/alexa-dispositivo`,
  comandoLibre: `${N8N_WEBHOOK_BASE_URL}/alexa-comando`,
};

// ============================================================
// UTILIDADES
// ============================================================

/**
 * Envia datos a un webhook de n8n y espera respuesta
 * @param {string} webhookUrl - URL del webhook en n8n
 * @param {object} payload - Datos a enviar
 * @param {number} timeout - Timeout en ms (default N8N_TIMEOUT_MS=7000ms, con margen
 *                           respecto al corte de ~8s de Alexa)
 * @returns {object} Respuesta de n8n
 */
async function callN8nWebhook(webhookUrl, payload, timeout = N8N_TIMEOUT_MS) {
  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Source': 'alexa-skill',
        'X-Timestamp': new Date().toISOString(),
      },
      timeout: timeout,
    });
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error('Error llamando a n8n:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Extrae el valor de un slot de forma segura
 */
function getSlotValue(handlerInput, slotName) {
  const request = handlerInput.requestEnvelope.request;
  if (request.intent && request.intent.slots && request.intent.slots[slotName]) {
    return request.intent.slots[slotName].value || null;
  }
  return null;
}

// ============================================================
// HANDLERS DE INTENTS
// ============================================================

/**
 * LaunchRequest - Cuando el usuario abre la skill
 * "Alexa, abre mi automatizacion"
 */
const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    const speechText = 'Bienvenido a tu centro de automatizacion con n8n. '
      + 'Puedes decirme: ejecuta una tarea, consulta el estado, '
      + 'envia un mensaje, dame el resumen del dia, '
      + 'o controla un dispositivo. Que quieres hacer?';

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt('Que automatizacion quieres ejecutar?')
      .getResponse();
  },
};

/**
 * EjecutarTareaIntent - Ejecuta una tarea/workflow en n8n
 * "Alexa, ejecuta la tarea {nombreTarea}"
 */
const EjecutarTareaIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'EjecutarTareaIntent';
  },
  async handle(handlerInput) {
    const nombreTarea = getSlotValue(handlerInput, 'nombreTarea') || 'tarea general';

    const result = await callN8nWebhook(WEBHOOKS.ejecutarTarea, {
      action: 'ejecutar_tarea',
      tarea: nombreTarea,
      userId: handlerInput.requestEnvelope.session.user.userId,
      timestamp: new Date().toISOString(),
    });

    let speechText;
    if (result.success && result.data) {
      // n8n puede devolver un mensaje personalizado en result.data.mensaje
      speechText = result.data.mensaje || `La tarea ${nombreTarea} se ha ejecutado correctamente.`;
    } else {
      speechText = `Hubo un problema al ejecutar la tarea ${nombreTarea}. Intenta de nuevo mas tarde.`;
    }

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt('Necesitas algo mas?')
      .getResponse();
  },
};

/**
 * ConsultarEstadoIntent - Consulta estado de algo via n8n
 * "Alexa, cual es el estado de {elemento}"
 */
const ConsultarEstadoIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConsultarEstadoIntent';
  },
  async handle(handlerInput) {
    const elemento = getSlotValue(handlerInput, 'elemento') || 'sistema';

    const result = await callN8nWebhook(WEBHOOKS.consultarEstado, {
      action: 'consultar_estado',
      elemento: elemento,
      userId: handlerInput.requestEnvelope.session.user.userId,
      timestamp: new Date().toISOString(),
    });

    let speechText;
    if (result.success && result.data) {
      speechText = result.data.mensaje || `El estado de ${elemento} es: todo normal.`;
    } else {
      speechText = `No pude obtener el estado de ${elemento}. Verifica que n8n este activo.`;
    }

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt('Quieres consultar algo mas?')
      .getResponse();
  },
};

/**
 * EnviarMensajeIntent - Envia un mensaje a traves de n8n
 * "Alexa, envia un mensaje a {destinatario} diciendo {contenido}"
 */
const EnviarMensajeIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'EnviarMensajeIntent';
  },
  async handle(handlerInput) {
    const destinatario = getSlotValue(handlerInput, 'destinatario') || 'equipo';
    const contenido = getSlotValue(handlerInput, 'contenido') || '';

    const result = await callN8nWebhook(WEBHOOKS.enviarMensaje, {
      action: 'enviar_mensaje',
      destinatario: destinatario,
      contenido: contenido,
      userId: handlerInput.requestEnvelope.session.user.userId,
      timestamp: new Date().toISOString(),
    });

    let speechText;
    if (result.success && result.data) {
      speechText = result.data.mensaje || `Mensaje enviado a ${destinatario} correctamente.`;
    } else {
      speechText = `No pude enviar el mensaje a ${destinatario}. Intenta de nuevo.`;
    }

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt('Algo mas?')
      .getResponse();
  },
};

/**
 * ResumenDiarioIntent - Pide un resumen diario a n8n
 * "Alexa, dame el resumen del dia"
 */
const ResumenDiarioIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ResumenDiarioIntent';
  },
  async handle(handlerInput) {
    const result = await callN8nWebhook(WEBHOOKS.resumenDiario, {
      action: 'resumen_diario',
      userId: handlerInput.requestEnvelope.session.user.userId,
      timestamp: new Date().toISOString(),
    });

    let speechText;
    if (result.success && result.data) {
      speechText = result.data.mensaje || 'No hay novedades por hoy. Todo esta en orden.';
    } else {
      speechText = 'No pude obtener el resumen del dia. Verifica la conexion con n8n.';
    }

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt('Necesitas algo mas?')
      .getResponse();
  },
};

/**
 * ControlDispositivoIntent - Controla dispositivos via n8n
 * "Alexa, enciende {dispositivo}" / "Alexa, apaga {dispositivo}"
 */
const ControlDispositivoIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ControlDispositivoIntent';
  },
  async handle(handlerInput) {
    const dispositivo = getSlotValue(handlerInput, 'dispositivo') || 'dispositivo';
    const accion = getSlotValue(handlerInput, 'accionDispositivo') || 'activar';

    const result = await callN8nWebhook(WEBHOOKS.controlDispositivo, {
      action: 'control_dispositivo',
      dispositivo: dispositivo,
      accion: accion,
      userId: handlerInput.requestEnvelope.session.user.userId,
      timestamp: new Date().toISOString(),
    });

    let speechText;
    if (result.success && result.data) {
      speechText = result.data.mensaje || `${dispositivo} se ha ${accion === 'encender' ? 'encendido' : 'apagado'}.`;
    } else {
      speechText = `No pude ${accion} el ${dispositivo}. Verifica la conexion.`;
    }

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt('Algo mas?')
      .getResponse();
  },
};

/**
 * ComandoLibreIntent - Envia un comando de texto libre a n8n
 * "Alexa, dile a mi automatizacion {comando}"
 */
const ComandoLibreIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ComandoLibreIntent';
  },
  async handle(handlerInput) {
    const comando = getSlotValue(handlerInput, 'comando') || '';

    const result = await callN8nWebhook(WEBHOOKS.comandoLibre, {
      action: 'comando_libre',
      comando: comando,
      userId: handlerInput.requestEnvelope.session.user.userId,
      timestamp: new Date().toISOString(),
    });

    let speechText;
    if (result.success && result.data) {
      speechText = result.data.mensaje || 'Comando ejecutado.';
    } else {
      speechText = 'No pude procesar tu comando. Intenta de nuevo.';
    }

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt('Algo mas?')
      .getResponse();
  },
};

// ============================================================
// HANDLERS DE SISTEMA (obligatorios)
// ============================================================

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speechText = 'Soy tu puente con n8n. Puedes pedirme: '
      + 'ejecuta una tarea, consulta el estado de algo, '
      + 'envia un mensaje, dame el resumen del dia, '
      + 'enciende o apaga un dispositivo, '
      + 'o dime un comando libre. Que necesitas?';

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
      .speak('Hasta luego! Tu automatizacion sigue activa en n8n.')
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log(`Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
    return handlerInput.responseBuilder.getResponse();
  },
};

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
  },
  handle(handlerInput) {
    const speechText = 'No entendi eso. Puedes decirme ejecuta una tarea, '
      + 'consulta un estado, o dame el resumen del dia.';

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
    console.error(`Error handled: ${error.message}`);
    console.error(`Error stack: ${error.stack}`);

    return handlerInput.responseBuilder
      .speak('Lo siento, hubo un error. Intenta de nuevo.')
      .reprompt('Intenta decirme otra cosa.')
      .getResponse();
  },
};

// ============================================================
// LAMBDA HANDLER - Exportar
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
