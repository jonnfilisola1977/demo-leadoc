exports.handler = async (event) => {
  const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY;
  const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID;
  const BASE_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // GET — leer todos los clientes
    if (event.httpMethod === "GET") {
      const res = await fetch(BASE_URL + "/latest", {
        headers: { "X-Master-Key": JSONBIN_API_KEY },
      });
      const data = await res.json();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data.record),
      };
    }

    // POST — guardar nuevo cliente
    if (event.httpMethod === "POST") {
      const nuevo = JSON.parse(event.body);

      // 1. Leer estado actual
      const getRes = await fetch(BASE_URL + "/latest", {
        headers: { "X-Master-Key": JSONBIN_API_KEY },
      });
      const getData = await getRes.json();
      const clientes = getData.record.clientes || [];

      // 2. Agregar nuevo cliente con timestamp
      clientes.push({
        ...nuevo,
        fecha_registro: new Date().toISOString(),
        id: Date.now().toString(),
      });

      // 3. Guardar de vuelta
      const putRes = await fetch(BASE_URL, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": JSONBIN_API_KEY,
        },
        body: JSON.stringify({ clientes }),
      });
      const putData = await putRes.json();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, clientes: putData.record.clientes }),
      };
    }

    return { statusCode: 405, headers, body: "Method not allowed" };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
