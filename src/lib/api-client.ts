export async function api(op: string, p: unknown = {}, options?: { timeoutMs?: number }) {
  const csrf =
    typeof document !== 'undefined'
      ? document.cookie
          .split('; ')
          .find((c) =>
            c.startsWith(window.location.protocol === 'https:' ? '__Host-tcm_csrf=' : 'tcm_csrf='),
          )
          ?.split('=')[1]
      : undefined;
  // A read-only CID recheck can otherwise keep the browser's buttons
  // disabled indefinitely if an upstream Ethereum RPC or gateway hangs.
  // This is opt-in: normal mutations (including GO1) retain their behavior.
  const signal=options?.timeoutMs?AbortSignal.timeout(options.timeoutMs):undefined;
  let res:Response, data:any;
  try{
    res = await fetch('/api', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      body: JSON.stringify({ op, p }),
      ...(signal?{signal}:{}),
    });
    data=await res.json();
  }catch(error){
    if(signal?.aborted)
      throw Object.assign(new Error(
        'Existing CID verification exceeded the browser deadline. The server may still finish. Keep the CID; check the saved Mint Page status before another action. Never re-upload merely because this timed out.'),
        {code:'CID_VERIFICATION_TIMEOUT'});
    throw error;
  }
  if (!res.ok) {
    const e = new Error(data.message || 'Request failed') as Error & { code?: string };
    e.code = data.error;
    throw e;
  }
  return data;
}
export const short = (s: string) => (s?.length > 14 ? s.slice(0, 8) + '…' + s.slice(-6) : s);
