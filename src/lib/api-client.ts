export async function api(op: string, p: unknown = {}) {
  const csrf =
    typeof document !== 'undefined'
      ? document.cookie
          .split('; ')
          .find((c) =>
            c.startsWith(window.location.protocol === 'https:' ? '__Host-tcm_csrf=' : 'tcm_csrf='),
          )
          ?.split('=')[1]
      : undefined;
  const res = await fetch('/api', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    body: JSON.stringify({ op, p }),
  });
  const data = await res.json();
  if (!res.ok) {
    const e = new Error(data.message || 'Request failed') as Error & { code?: string };
    e.code = data.error;
    throw e;
  }
  return data;
}
export const short = (s: string) => (s?.length > 14 ? s.slice(0, 8) + '…' + s.slice(-6) : s);
