exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };

  try {
    const body = JSON.parse(event.body);
    const { action, data, files, key } = body;

    const { getStore } = require('@netlify/blobs');
    const store = getStore({ name: 'clientes', consistency: 'strong' });

    if (action === 'save') {
      const k = 'cli_' + (data.nombre||'sin-nombre').toLowerCase()
        .replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').substring(0,30)
        + '_' + Date.now();
      await store.set(k, JSON.stringify(data));
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, key: k }) };
    }

    if (action === 'list') {
      const { blobs } = await store.list();
      return { statusCode: 200, headers, body: JSON.stringify({ keys: blobs.map(b => b.key) }) };
    }

    if (action === 'get') {
      const val = await store.get(key);
      if (!val) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      return { statusCode: 200, headers, body: val };
    }

    if (action === 'update') {
      await store.set(key, JSON.stringify(data));
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'extract') {
      const blocks = [];
      if (files?.length) {
        for (const f of files) {
          if (f.type.startsWith('image/')) blocks.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: f.data } });
          else if (f.type === 'application/pdf') blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } });
          else if (f.textContent) blocks.push({ type: 'text', text: `Archivo "${f.name}":\n${f.textContent}` });
        }
      }
      blocks.push({ type: 'text', text: `Extrae TODA la informacion posible de estos archivos de una clinica o gimnasio en Mexico. Devuelve SOLO JSON sin markdown:\n{"encontrado":{"nombre":null,"ciudad":null,"tipo":null,"horario":null,"servicios":null,"precios":null,"promo":null,"top_servicios":null,"diferencia":null,"certs":null,"testimonios":null,"extra":null},"faltante":[],"resumen":"1 oracion"}` });
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1200, messages: [{ role: 'user', content: blocks }] })
      });
      const res = await r.json();
      const txt = res.content?.find(b => b.type === 'text')?.text || '{}';
      return { statusCode: 200, headers, body: txt.replace(/```json|```/g,'').trim() };
    }

    if (action === 'generate') {
      const d = data;
      const prompt = `Eres el arquitecto de prompts de LEADOC TECHNOLOGIES. Genera el Manual de Ventas completo para el agente ${d.aria_nombre||'ARIA'} en GoHighLevel.\n\nARIA: agente WhatsApp responde leads menos de 3 min 24/7. NUNCA menciona IA bot tecnologia. Actua como asistente humano. Espanol mexicano natural. Objetivo: calificar y agendar citas.\n\nDATOS:\nNegocio: ${d.nombre} | Tipo: ${d.tipo} | Ciudad: ${d.ciudad} | Horario: ${d.horario}\nServicios: ${d.servicios} | Precios: ${d.precios} | Promo: ${d.promo||'Ninguna'}\nMas solicitados: ${d.top_servicios||'N/A'} | Impulsar: ${d.impulsar||'N/A'} | Financiamiento: ${d.financiamiento}\nDiferenciadores: ${d.diferencia} | Certs: ${d.certs} | Alcance: ${d.alcance}\nTestimonios: ${d.testimonios||'N/A'} | Tono: ${d.tono} | Agente: ${d.aria_nombre||'ARIA'}\nObjeciones: ${d.objeciones} | Info reservada: ${d.reservado||'N/A'} | Agenda: ${d.agenda}\nExtra: ${d.extra||'N/A'}\n\n# MANUAL DE VENTAS — ${d.nombre.toUpperCase()}\n## Agente: ${d.aria_nombre||'ARIA'}\n\n### IDENTIDAD\n### MISION\n### SERVICIOS Y PRECIOS\n### PROCESO DE CALIFICACION\n### MANEJO DE OBJECIONES\n### COMO AGENDAR\n### INFORMACION RESERVADA PARA EL DOCTOR\n### HORARIOS Y FUERA DE HORARIO\n### DIFERENCIADORES Y CREDIBILIDAD\n### PROHIBICIONES ABSOLUTAS\n### CIERRE DE CONVERSACION\n\nInstrucciones directas para ${d.aria_nombre||'ARIA'}, ejemplos de mensajes reales. NUNCA mencionar GHL LEADOC IA bot sistema automatizacion.`;
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
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
