const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function main() {
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (input, init) => {
    requests.push({ url: String(input), authorization: new Headers(init.headers).get('Authorization') });
    return new Response(JSON.stringify([{ id: 'test-tournament' }]), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const exports = {};
    const source = fs.readFileSync(path.join(__dirname, '../lib/supabase-browser.ts'), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText, {
      exports, require,
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-test-key' } },
    });
    const signedIn = exports.getSupabaseBrowserClient();
    const publicClient = exports.getSupabasePublicBrowserClient();
    assert.equal(publicClient, exports.getSupabasePublicBrowserClient());
    assert.notEqual(publicClient, signedIn);
    let releaseSession;
    signedIn.auth.getSession = () => new Promise(resolve => { releaseSession = resolve; });
    const privateRequest = Promise.resolve(signedIn.from('saved_co_organizers').select('id'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.length, 0, 'signed-in request should still be waiting on auth');
    let timeout;
    const publicResult = await Promise.race([
      publicClient.from('tournaments').select('id'),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Public read blocked by session')), 1000); }),
    ]).finally(() => clearTimeout(timeout));
    assert.equal(publicResult.error, null);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].authorization, 'Bearer public-test-key');
    releaseSession({ data: { session: { access_token: 'signed-in-test-token' } }, error: null });
    await privateRequest;
    assert.equal(requests[1].authorization, 'Bearer signed-in-test-token', 'private requests retain the user identity');
    console.log('Passed: public reads proceed during blocked auth; private requests retain user authentication.');
  } finally {
    global.fetch = originalFetch;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
