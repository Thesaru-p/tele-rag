// Keep short-lived credentials in this tab; share one refresh across requests.
export function createSessionManager({ storage, request, onExpired = () => {} }) {
  const key = 'telerag-session';
  let refreshing;
  let revision = 0;
  const read = () => { try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; } };
  const save = value => {
    revision++;
    const session = { access_token: value.access_token, refresh_token: value.refresh_token, expires_at: value.expires_at || Math.floor(Date.now() / 1000) + (value.expires_in || 3600) };
    storage.setItem(key, JSON.stringify(session));
    return session;
  };
  const clear = () => { revision++; storage.removeItem(key); };
  async function accessToken(force = false) {
    const current = read();
    if (!current?.access_token) throw new Error('Sign in to continue.');
    if (!force && current.expires_at > Date.now() / 1000 + 60) return current.access_token;
    if (!refreshing) {
      const started = revision;
      refreshing = (async () => {
        if (!current.refresh_token) throw new Error('Your session has expired. Sign in again.');
        const renewed = await request('token?grant_type=refresh_token', { refresh_token: current.refresh_token });
        if (revision !== started) throw new Error('You have signed out.');
        if (!renewed.access_token) throw new Error('Your session has expired. Sign in again.');
        return save(renewed).access_token;
      })().catch(error => {
        if (revision === started) { clear(); onExpired(); }
        throw error;
      }).finally(() => { refreshing = undefined; });
    }
    return refreshing;
  }
  return { read, save, clear, accessToken };
}
