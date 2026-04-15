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
      blocks.push({ type: 'text', text: 'Eres un experto en OCR y extraccion de datos. Lee CON DETALLE ABSOLUTO todos los textos visibles en estas imagenes de una clinica o spa en Mexico. Lee CADA PALABRA en la imagen incluyendo textos pequenos, hashtags, pies de foto, datos de contacto, direcciones, numeros de telefono, listas de servicios, precios, descuentos y promociones. NO inventes datos. Si ves un texto en la imagen, extraelo exactamente como aparece.\n\nDevuelve SOLO JSON valido sin markdown:\n{"encontrado":{"nombre":null,"ciudad":null,"tipo":null,"horario":null,"servicios":null,"precios":null,"promo":null,"top_servicios":null,"diferencia":null,"certs":null,"testimonios":null,"extra":null},"faltante":[],"resumen":"1 oracion"}' });
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': AKEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1200, messages: [{ role: 'user', content: blocks }] })
      });
      const res = await r.json();
      const txt = res.content?.find(b => b.type === 'text')?.text || '{}';
      return { statusCode: 200, headers, body: txt.replace(/```json|```/g,'').trim() };
    }

    if (action === 'generate') {
      const d = data;
      const prompt = 'Eres el arquitecto de prompts de LEADOC TECHNOLOGIES. Genera el Manual de Ventas completo para el agente ' + (d.aria_nombre||'ARIA') + ' en GoHighLevel.\n\nARIA: agente WhatsApp responde leads menos de 3 min 24/7. NUNCA menciona IA bot tecnologia. Actua como asistente humano. Espanol mexicano natural.\n\nDATOS:\nNegocio: ' + d.nombre + ' | Tipo: ' + d.tipo + ' | Ciudad: ' + d.ciudad + ' | Horario: ' + d.horario + '\nServicios: ' + d.servicios + ' | Precios: ' + d.precios + ' | Promo: ' + (d.promo||'Ninguna') + '\nMas solicitados: ' + (d.top_servicios||'N/A') + ' | Financiamiento: ' + d.financiamiento + '\nDiferenciadores: ' + d.diferencia + ' | Certs: ' + d.certs + ' | Alcance: ' + d.alcance + '\nTono: ' + d.tono + ' | Objeciones: ' + d.objeciones + ' | Agenda: ' + d.agenda + '\nExtra: ' + (d.extra||'N/A') + '\n\n# MANUAL DE VENTAS — ' + d.nombre.toUpperCase() + '\n## Agente: ' + (d.aria_nombre||'ARIA') + '\n\n### IDENTIDAD\n### MISION\n### SERVICIOS Y PRECIOS\n### PROCESO DE CALIFICACION\n### MANEJO DE OBJECIONES\n### COMO AGENDAR\n### INFORMACION RESERVADA\n### HORARIOS\n### DIFERENCIADORES\n### PROHIBICIONES\n### CIERRE\n\nInstrucciones directas con ejemplos de mensajes reales. NUNCA mencionar GHL LEADOC IA bot.';
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
