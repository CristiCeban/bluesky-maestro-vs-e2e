// Ported from __e2e__/setupServer.js:
//   http.post('http://localhost:1986/' + SERVER_PATH, { headers: {'Content-Type': 'text/plain'}, body: '' })
// The dev-env fixture manager resets the network and seeds the fixtures the
// query names (`?users&follows&posts&feeds`). Each call replaces the data.
export const FIXTURE_URL = 'http://localhost:1986/'

export async function setupServer(path: string) {
  const res = await fetch(FIXTURE_URL + path, {
    method: 'POST',
    headers: {'Content-Type': 'text/plain'},
    body: '',
  })
  if (!res.ok) {
    throw new Error(
      `fixture server ${FIXTURE_URL}${path} answered ${res.status}: ${await res.text()}`,
    )
  }
}
