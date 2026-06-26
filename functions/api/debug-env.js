export async function onRequest(context) {
  const { env } = context;
  const keys = [];
  for (const key in env) {
    if (typeof env[key] === 'string') {
      keys.push({ key, hasValue: env[key].length > 0, length: env[key].length });
    } else {
      keys.push({ key, type: typeof env[key] });
    }
  }
  return new Response(JSON.stringify(keys, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
