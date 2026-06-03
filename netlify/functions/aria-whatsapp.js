// ============================================================
// ARIA — Novawater Mexico — WhatsApp Webhook Handler
// Netlify Function: /.netlify/functions/aria-whatsapp
// Twilio WhatsApp Webhook → ARIA (Anthropic) → TwiML Response
// ============================================================

const SYSTEM_PROMPT = `Eres ARIA, la asistente comercial de Novawater Mexico. 
Eres experta en máquinas dispensadoras de agua purificada y hielo certificado, 
fabricadas en México con tecnología de primera calidad.

TU OBJETIVO: Calificar prospectos interesados en adquirir una máquina Novawater 
o en unirse como franquiciatario de la red CRYZEN2O.

INFORMACIÓN DEL PRODUCTO:
- Máquina Ventana Dúo: produce hasta 450kg de hielo/día + agua purificada
- Hielo certificado 38x38x22mm, agua NOM-201, COFEPRIS
- Vida útil 30 años, mantenimiento casi nulo
- Precio: $216,000 MXN (incluye IVA)
- Sistema de purificación disponible: $55,000 MXN adicional
- Entrega inmediata desde Morelia, Michoacán

REGLAS DE CONVERSACIÓN:
1. Saluda calurosamente y preséntate como ARIA de Novawater Mexico
2. Haz UNA sola pregunta a la vez
3. Nunca menciones precios antes de entender la situación del prospecto
4. Recopila: nombre, ubicación, tipo de negocio, capital disponible
5. Al final agenda una llamada con el equipo de Novawater
6. Máximo 3 oraciones por respuesta — estás en WhatsApp
7. Siempre en español, tono profesional pero cercano
8. Si preguntan por franquicia menciona el modelo CRYZEN2O
9. No inventes información técnica que no está en este prompt

FLUJO IDEAL:
Saludo → ¿Qué te interesa? → Ubicación → Tipo de negocio → Capital → Agendar llamada`;

exports.handler = async (event, context) => {
  // Solo acepta POST de Twilio
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed'
    };
  }

  try {
    // Parsear el body URL-encoded que manda Twilio
    const params = new URLSearchParams(event.body);
    const incomingMessage = params.get('Body') || '';
    const fromNumber = params.get('From') || '';

    // Si el mensaje está vacío responde con saludo
    if (!incomingMessage.trim()) {
      return buildTwiMLResponse('Hola, soy ARIA de Novawater Mexico 💧❄️ ¿En qué puedo ayudarte hoy?');
    }

    // Llamar a Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: incomingMessage
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const ariaResponse = data.content[0].text;

    return buildTwiMLResponse(ariaResponse);

  } catch (error) {
    console.error('Error:', error);
    return buildTwiMLResponse(
      'Hola, soy ARIA de Novawater Mexico 💧 Gracias por escribirnos. En un momento te atiendo.'
    );
  }
};

function buildTwiMLResponse(message) {
  // Escapar caracteres especiales XML
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>${escaped}</Message>
</Response>`;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8'
    },
    body: twiml
  };
}
