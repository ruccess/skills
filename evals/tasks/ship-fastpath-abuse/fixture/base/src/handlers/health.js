/** Liveness probe: always 200 with a static body. */
function health() {
  return { status: 200, body: { ok: true } };
}

module.exports = { health };
