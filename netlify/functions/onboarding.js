exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const body = JSON.parse(event.body);
    const { action, data, files } = body;

    // ACTION: extract — lee archivos y extrae info estructurada
    if (action === 'extract') {
      const contentBlocks = [];

      // Agregar archivos (imágenes, PDFs)
      if (files && files.length > 0) {
        for (const f of files) {
          if (f.type.startsWith('image/')) {
            contentBlocks.push({
              type: 'image',
              source: { type: 'base64', media_type: f.type, data: f.data }
            });
          } else if (f.type === 'application/pdf') {
            contentBlocks.push({
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: f.data }
            });
          }
          // Excel/Word: se envían como texto extraído desde el frontend
          else if (f.textContent) {
            contentBlocks.push({
              type: 'text',
              text: `Contenido del archivo "${f.name}":\n${f.textContent}`
            });
          }
        }
      }

      contentBlocks.push({
        type: 'text',
        text: `Eres un extractor de información para LEADOC TECHNOLOGIES. Analiza los archivos adjuntos (pueden ser fotos de menús, listas de precios, diplomas, documentos de servicios, Excel de precios, etc.) y extrae toda la información relevante para configurar un agente de ventas WhatsApp para una clínica o gimnasio en México.

Devuelve ÚNICAMENTE un JSON válido sin markdown ni backticks con esta estructura exacta:
{
  "encontrado": {
    "nombre": "nombre del negocio o null",
    "ciudad": "ciudad y colonia o null",
    "tipo": "tipo de negocio o null",
    "horario": "horarios de atención o null",
    "servicios": "lista de servicios o null",
    "precios": "lista de servicios con precios o null",
    "promo": "promociones activas o null",
    "top_servicios": "servicios más mencionados o destacados o null",
    "diferencia": "diferenciadores o especialidades mencionadas o null",
    "certs": "certificaciones, reconocimientos, doctores mencionados o null",
    "medico": "nombre del médico o responsable o null",
    "extra": "cualquier info operativa relevante (solo acepta citas, estacionamiento, etc.) o null"
  },
  "faltante": ["lista de campos que NO se pudieron extraer de los archivos"],
  "confianza": "alta | media | baja",
  "resumen": "1 oración describiendo qué encontraste en los archivos"
}`
      });

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: contentBlocks }]
        })
      });

      const result = await response.json();
      const text = result.content?.find(b => b.type === 'text')?.text || '{}';
      const clean = text.replace(/```json|```/g, '').trim();
      return { statusCode: 200, headers, body: clean };
    }

    // ACTION: generate — genera el Manual de Ventas ARIA completo
    if (action === 'generate') {
      const d = data;
      const prompt = `Eres el arquitecto de prompts de LEADOC TECHNOLOGIES. Genera el Manual de Ventas completo para el agente ${d.aria_nombre || 'ARIA'} en GoHighLevel.

ARIA es un agente WhatsApp que responde leads en menos de 3 minutos 24/7, precalifica por procedimiento y presupuesto, agenda citas confirmadas. NUNCA menciona IA, bot, tecnología ni automatización. Actúa como asistente humano del negocio. Habla en español mexicano natural.

DATOS DEL CLIENTE:
Negocio: ${d.nombre} | Tipo: ${d.tipo} | Ciudad: ${d.ciudad}
Dirección: ${d.direccion || 'No especificada'} | Horario: ${d.horario}
Servicios: ${d.servicios} | Precios: ${d.precios}
Promociones: ${d.promo || 'Ninguna'} | Más solicitados: ${d.top_servicios || 'No especificado'}
Impulsar: ${d.impulsar || 'No especificado'} | Financiamiento: ${d.financiamiento}
Diferenciadores: ${d.diferencia} | Certificaciones: ${d.certs}
Alcance: ${d.alcance} | Testimonios: ${d.testimonios || 'No especificados'}
Tono: ${d.tono} | Nombre agente: ${d.aria_nombre || 'ARIA'}
Objeciones: ${d.objeciones} | Info reservada: ${d.reservado || 'Ninguna'}
Sistema agenda: ${d.agenda} | Extra: ${d.extra || 'Ninguna'}

Genera el Manual con estas secciones:

# MANUAL DE VENTAS — ${d.nombre.toUpperCase()}
## Agente: ${d.aria_nombre || 'ARIA'}

### IDENTIDAD
### MISIÓN
### SERVICIOS Y PRECIOS
### PROCESO DE CALIFICACIÓN
### MANEJO DE OBJECIONES
### CÓMO AGENDAR
### INFORMACIÓN RESERVADA PARA EL DOCTOR
### HORARIOS Y FUERA DE HORARIO
### DIFERENCIADORES Y CREDIBILIDAD
### PROHIBICIONES ABSOLUTAS
### CIERRE DE CONVERSACIÓN

Reglas: español mexicano natural, instrucciones directas para ${d.aria_nombre || 'ARIA'}, ejemplos de mensajes reales, orientado a citas agendadas. NUNCA mencionar GHL, LEADOC, IA, bot, sistema, automatización.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const result = await response.json();
      const manual = result.content?.find(b => b.type === 'text')?.text || '';
      return { statusCode: 200, headers, body: JSON.stringify({ manual }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Acción no reconocida' }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
