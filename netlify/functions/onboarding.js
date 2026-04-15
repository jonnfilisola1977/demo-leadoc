exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };

  const JKEY = process.env.JSONBIN_API_KEY;
  const JBIN = process.env.JSONBIN_BIN_ID;
  const AKEY = process.env.ANTHROPIC_API_KEY;

  if (!JKEY || !JBIN) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Storage not configured' }) };

  const BASE = 'https://api.jsonbin.io/v3/b/' + JBIN;

  async function getAll() {
    const r = await fetch(BASE + '/latest', { headers: { 'X-Master-Key': JKEY } });
    const j = await r.json();
    return j.record || {};
  }
  async function saveAll(rec) {
    await fetch(BASE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': JKEY },
      body: JSON.stringify(rec)
    });
  }

  try {
    const body = JSON.parse(event.body);
    const { action, data, files, key } = body;

    if (action === 'save') {
      const all = await getAll();
      const k = 'cli_' + (data.nombre||'cliente').toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').substring(0,25) + '_' + Date.now();
      all[k] = data;
      await saveAll(all);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, key: k }) };
    }

    if (action === 'list') {
      const all = await getAll();
      return { statusCode: 200, headers, body: JSON.stringify({ keys: Object.keys(all) }) };
    }

    if (action === 'get') {
      const all = await getAll();
      if (!all[key]) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      return { statusCode: 200, headers, body: JSON.stringify(all[key]) };
    }

    if (action === 'update') {
      const all = await getAll();
      all[key] = data;
      await saveAll(all);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'extract') {
      const blocks = [];
      if (files && files.length > 0) {
        for (const f of files) {
          if (f.type && f.type.startsWith('image/') && f.data) blocks.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: f.data } });
          else if (f.type === 'application/pdf' && f.data) blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } });
          else if (f.textContent) blocks.push({ type: 'text', text: 'Archivo "' + f.name + '":\n' + f.textContent });
        }
      }
      blocks.push({ type: 'text', text: `Eres un experto en OCR y extraccion de datos de imagenes de redes sociales de negocios de belleza, salud y bienestar en Mexico.

Lee CON DETALLE ABSOLUTO todos los textos visibles en estas imagenes. Lee CADA PALABRA incluyendo:
- Nombre del negocio (busca en logos, encabezados, perfiles)
- Direccion completa (calle, numero, colonia, ciudad, estado)
- Todos los numeros de telefono que aparezcan
- Redes sociales (@usuario de Instagram, Facebook, etc)
- Sitio web
- Horarios de atencion exactos
- Lista COMPLETA de servicios mencionados
- Precios EXACTOS si aparecen en numeros (si no hay precio exacto en la imagen, pon null — NUNCA inventes precios)
- Promociones y descuentos exactos como aparecen (20% OFF, 15% OFF, etc)
- Diferenciadores o especialidades mencionadas
- Certificaciones o reconocimientos

REGLA CRITICA: Si un dato NO aparece explicitamente en la imagen, pon null. NUNCA inventes datos. NUNCA asumas precios.

Devuelve SOLO JSON valido sin markdown:
{"encontrado":{"nombre":null,"ciudad":null,"tipo":null,"horario":null,"direccion":null,"telefono":null,"redes_sociales":null,"web":null,"servicios":null,"precios":null,"promo":null,"top_servicios":null,"diferencia":null,"certs":null,"testimonios":null,"extra":null},"faltante":[],"resumen":"1 oracion"}` });

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': AKEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: blocks }] })
      });
      const res = await r.json();
      const txt = res.content?.find(b => b.type === 'text')?.text || '{}';
      return { statusCode: 200, headers, body: txt.replace(/```json|```/g,'').trim() };
    }

    if (action === 'generate') {
      const d = data;
      const precios_txt = d.precios && d.precios !== 'null' ? d.precios : 'No especificados — ARIA debe decir "con gusto le informamos los precios por WhatsApp" y NO inventar cifras';
      const prompt = `Eres el arquitecto de prompts de LEADOC TECHNOLOGIES. Genera el Manual de Ventas completo para el agente ${d.aria_nombre||'ARIA'} en GoHighLevel.

ARIA es un agente de WhatsApp que responde leads en menos de 3 minutos, 24/7. NUNCA menciona IA, bot, tecnologia, automatizacion, GoHighLevel ni LEADOC. Actua como asistente humano real del negocio. Espanol mexicano natural. Su unico objetivo es calificar leads y agendar citas confirmadas.

DATOS DEL NEGOCIO:
Nombre: ${d.nombre}
Tipo: ${d.tipo}
Ciudad: ${d.ciudad}
Direccion: ${d.direccion||'No especificada'}
Horario: ${d.horario}
Telefono: ${d.extra||''}
Servicios: ${d.servicios}
Precios: ${precios_txt}
Promociones: ${d.promo||'Ninguna'}
Mas solicitados: ${d.top_servicios||'N/A'}
Servicios a impulsar: ${d.impulsar||'N/A'}
Financiamiento: ${d.financiamiento}
Diferenciadores: ${d.diferencia}
Certificaciones: ${d.certs}
Alcance de pacientes: ${d.alcance}
Testimonios: ${d.testimonios||'N/A'}
Tono: ${d.tono}
Nombre del agente: ${d.aria_nombre||'ARIA'}
Objeciones comunes: ${d.objeciones}
Info reservada para el doctor/dueno: ${d.reservado||'N/A'}
Sistema de agenda: ${d.agenda}
Info adicional: ${d.extra||'N/A'}

Genera el Manual con estas secciones. Cada seccion debe tener instrucciones directas con ejemplos de mensajes REALES en espanol mexicano:

# MANUAL DE VENTAS — ${d.nombre.toUpperCase()}
## Agente: ${d.aria_nombre||'ARIA'}

### IDENTIDAD
Quien es ${d.aria_nombre||'ARIA'}, a quien representa, personalidad y tono (${d.tono}).

### MISION
Objetivo en cada conversacion — 2-3 frases concretas orientadas a citas agendadas.

### SERVICIOS Y PRECIOS
Lista completa. Si hay precios exactos incluirlos. Si no hay precios, ${d.aria_nombre||'ARIA'} debe invitar a preguntar sin inventar cifras.

### PROCESO DE CALIFICACION
Preguntas exactas en orden para calificar: servicio de interes, experiencia previa, presupuesto, disponibilidad. Con ejemplos de mensajes reales.

### MANEJO DE OBJECIONES
Para cada objecion comun (${d.objeciones}), la respuesta exacta que debe dar ${d.aria_nombre||'ARIA'}. Incluir tecnicas de cierre como urgencia, prueba social, beneficio emocional.

### COMO AGENDAR — FLUJO DE CIERRE COMPLETO
Paso a paso de como ${d.aria_nombre||'ARIA'} cierra la cita:
1. Cuando ofrecer la cita (despues de calificar)
2. Como presentar la oferta de agendar
3. Como manejar dudas de ultimo momento
4. Como confirmar la cita (dia, hora, nombre)
5. Mensaje de confirmacion final

### CUANDO ESCALAR A VENDEDORA HUMANA
Triggers exactos para etiquetar el contacto y notificar al equipo humano:
- Lead calificado que no cierra despues de 2 intentos
- Lead con presupuesto alto o procedimiento complejo
- Lead que pide hablar con alguien
- Lead muy interesado listo para cerrar en el momento
Mensaje exacto que usa ${d.aria_nombre||'ARIA'} para hacer la transicion al humano sin que el lead note el cambio.

### INFORMACION RESERVADA PARA EL DUENO/DOCTOR
Temas que ${d.aria_nombre||'ARIA'} NO menciona y como redirige: ${d.reservado||'N/A'}

### HORARIOS Y FUERA DE HORARIO
Que dice dentro y fuera de horario (${d.horario}). Mensaje exacto para cuando el negocio esta cerrado.

### DIFERENCIADORES Y CREDIBILIDAD
Argumentos de venta basados en: ${d.diferencia} y ${d.certs}. Como usarlos naturalmente en conversacion.

### PROHIBICIONES ABSOLUTAS
Lista de lo que ${d.aria_nombre||'ARIA'} NUNCA dice ni hace. Incluir: GHL, LEADOC, IA, bot, sistema, automatizacion, inventar precios, prometer resultados sin consulta.

### CIERRE DE CONVERSACION
Como cerrar: con cita agendada, sin cita (lead frio), lead que necesita mas tiempo. Mensajes exactos para cada caso.

REGLAS DE ESCRITURA: Espanol mexicano natural. Instrucciones directas. Ejemplos de mensajes reales entre comillas. Orientado 100% a citas agendadas. NUNCA mencionar GHL, LEADOC, IA, bot, sistema, automatizacion.`;

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': AKEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
      });
      const res = await r.json();
      const manual = res.content?.find(b => b.type === 'text')?.text || '';
      return { statusCode: 200, headers, body: JSON.stringify({ manual }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Accion no reconocida' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
