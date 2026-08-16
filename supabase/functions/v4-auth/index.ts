// Historical endpoint retained only so existing calls fail explicitly.
Deno.serve(() => new Response(JSON.stringify({error:'RETIRED_ENDPOINT'}), {status:410,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff'}}))
