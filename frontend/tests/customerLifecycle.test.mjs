import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';

// Bundle JSX in memory; keep React external so renderer and components share hooks.
const compiled = await build({
  stdin: { contents: `
    export { AuthProvider } from './src/integrations/authBridge.jsx';
    export { default as Wallet } from './src/features/wallet/CustomerWalletPage.jsx';
    export { default as Quote } from './src/features/rentals/CustomerReturnQuoteSection.jsx';
    export { default as Profile } from './src/features/profile/CustomerProfilePage.jsx';
    export { default as useApiQuery } from './src/hooks/useApiQuery.js';
    export { ToastProvider } from './src/components/ui/ToastProvider.jsx';
    export { configurePlatformApi, resetPlatformApi } from './src/integrations/apiClient.js';
  `, resolveDir: process.cwd(), loader: 'jsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom', 'react-router-dom'], logLevel: 'silent',
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { AuthProvider, Wallet, Quote, Profile, useApiQuery, ToastProvider, configurePlatformApi, resetPlatformApi } = module.exports;
const h = React.createElement;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const response = (data, meta = {}) => new Response(JSON.stringify({ data, meta }), { headers: { 'content-type': 'application/json' } });

test('profile update uses shared auth interface and does not report failure after successful PATCH', async () => {
  const originalFetch = globalThis.fetch;
  let root;
  let updated;
  let profile = { id: '1', name: 'Old name', role: 'CUSTOMER', status: 'ACTIVE' };
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/users/me')) {
      if (options.method === 'PATCH') profile = { ...profile, ...JSON.parse(options.body) };
      return response(profile);
    }
    return response([], { page: 1, page_size: 10, total: 0 });
  };
  try {
    await act(async () => {
      root = TestRenderer.create(h(MemoryRouter, null, h(AuthProvider, {
        sessionManager: { getState: () => ({}) },
        externalAuth: { user: profile, accessToken: 'token', sessionId: 'session', updateSessionUser: (data) => { updated = data; } },
      }, h(ToastProvider, null, h(Profile)))));
      await flush();
    });
    act(() => root.root.findAllByType('input').find((n) => n.props.value === 'Old name').props.onChange({ target: { value: 'New name' } }));
    await act(async () => { await root.root.findByType('form').props.onSubmit({ preventDefault() {} }); await flush(); });
    assert.equal(updated?.name, 'New name');
    assert.match(JSON.stringify(root.toJSON()), /Đã cập nhật tên hiển thị thành công/);
  } finally { act(() => root?.unmount()); globalThis.fetch = originalFetch; resetPlatformApi(); }
});

test('active query ends loading on synchronous failure or session abort', async () => {
  let root;
  let state;
  function Query({ fetcher }) { state = useApiQuery(fetcher, [fetcher]); return null; }
  try {
    const syncFailure = () => { throw new Error('invalid request'); };
    await act(async () => { root = TestRenderer.create(h(Query, { fetcher: syncFailure })); await flush(); });
    assert.equal(state.loading, false);
    assert.equal(state.error.message, 'invalid request');
    const abortFailure = () => Promise.reject(new DOMException('Session changed', 'AbortError'));
    await act(async () => { root.update(h(Query, { fetcher: abortFailure })); await flush(); });
    assert.equal(state.loading, false);
    assert.equal(state.data, null);
  } finally { act(() => root?.unmount()); }
});

test('account/session changes clear mounted private state; refresh retains it', async () => {
  let mounts = 0;
  let cleanups = 0;
  function PrivateState() {
    const [value, setValue] = React.useState('clean');
    React.useEffect(() => { mounts++; return () => { cleanups++; }; }, []);
    return h('button', { onClick: () => setValue('private draft') }, value);
  }
  const manager = { getState: () => ({}) };
  const tree = (id, sessionId, accessToken) => h(AuthProvider, {
    sessionManager: manager, externalAuth: { user: { id, role: 'CUSTOMER' }, sessionId, accessToken },
  }, h(PrivateState));
  let root;
  try {
    await act(async () => { root = TestRenderer.create(tree('1', 'session-a', 'token-a')); });
    act(() => root.root.findByType('button').props.onClick());
    act(() => root.update(tree('1', 'session-a', 'refreshed-token')));
    assert.equal(root.root.findByType('button').children[0], 'private draft');
    act(() => root.update(tree('2', 'session-b', 'token-b')));
    assert.equal(root.root.findByType('button').children[0], 'clean');
    assert.equal(mounts, 2);
    assert.equal(cleanups, 1);
  } finally { act(() => root?.unmount()); resetPlatformApi(); }
});

test('wallet refreshes authoritative balance when approved request disappears from PENDING filter', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalSet = globalThis.setInterval;
  const originalClear = globalThis.clearInterval;
  let tick;
  let approved = false;
  let walletReads = 0;
  let root;
  globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  globalThis.setInterval = (fn) => { tick = fn; return 1; };
  globalThis.clearInterval = () => { tick = null; };
  resetPlatformApi();
  configurePlatformApi({ getAccessToken: () => 'test-token' });
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.endsWith('/wallets/me')) {
      walletReads++;
      return response({ id: '1', status: 'ACTIVE', balance: approved ? '200000.00' : '50000.00' });
    }
    if (path.includes('/topups')) return response(approved ? [] : [{ id: '1', amount: '150000.00', status: 'PENDING' }], { page: 1, page_size: 10, total: approved ? 0 : 1 });
    return response([], { page: 1, page_size: 10, total: 0 });
  };
  try {
    await act(async () => { root = TestRenderer.create(h(MemoryRouter, null, h(ToastProvider, null, h(Wallet)))); await flush(); });
    const select = root.root.findAllByType('select').find((node) => node.findAllByType('option').some((o) => o.props.value === 'PENDING'));
    await act(async () => { select.props.onChange({ target: { value: 'PENDING' } }); await flush(); });
    const readsBefore = walletReads;
    approved = true;
    await act(async () => { tick(); await flush(); });
    assert.ok(walletReads > readsBefore, 'approval must refresh wallet even if list is now empty');
    assert.match(JSON.stringify(root.toJSON()), /200\.000/);
    assert.doesNotMatch(JSON.stringify(root.toJSON()), /Số dư ví đã được cập nhật/);
  } finally {
    act(() => root?.unmount());
    assert.equal(tick, null, 'polling must stop on unmount/logout');
    globalThis.fetch = originalFetch; globalThis.document = originalDocument;
    globalThis.setInterval = originalSet; globalThis.clearInterval = originalClear;
    resetPlatformApi();
  }
});

test('quote countdown advances and promotion changes invalidate previous quote', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalNow = Date.now;
  let now = Date.parse('2026-11-25T10:00:00Z');
  let tick;
  let root;
  Date.now = () => now;
  globalThis.window = { setInterval: (fn) => { tick = fn; return 1; }, clearInterval: () => { tick = null; } };
  resetPlatformApi();
  configurePlatformApi({ getAccessToken: () => 'test-token' });
  globalThis.fetch = async (url) => String(url).includes('return-quote')
    ? response({ quote_expires_at: '2026-11-25T10:10:00Z', total_amount: '12345.00' }, { server_time: '2026-11-25T10:00:00Z' })
    : response([]);
  try {
    await act(async () => { root = TestRenderer.create(h(MemoryRouter, null, h(Quote, { rental: { id: '1', status: 'RETURN_PENDING', actual_return_station_id: '2' } }))); await flush(); });
    const button = root.root.findByType('button');
    await act(async () => { await button.props.onClick(); });
    assert.match(JSON.stringify(root.toJSON()), /10:00/);
    now += 61000;
    act(() => tick());
    assert.match(JSON.stringify(root.toJSON()), /08:59/);
    act(() => root.root.findByType('input').props.onChange({ target: { value: 'NEWCODE' } }));
    assert.doesNotMatch(JSON.stringify(root.toJSON()), /12\.345/);
  } finally {
    act(() => root?.unmount()); globalThis.fetch = originalFetch; globalThis.window = originalWindow; Date.now = originalNow; resetPlatformApi();
  }
});
