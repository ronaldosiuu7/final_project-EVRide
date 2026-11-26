import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const compiled = await build({
  stdin: {
    contents: `
      export { AuthProvider, RequireRole } from './src/integrations/authBridge.jsx';
      export { ToastProvider } from './src/components/ui/ToastProvider.jsx';
      export { default as CustomerLayout } from './src/layouts/CustomerLayout.jsx';
      export { default as AdminLayout } from './src/layouts/AdminLayout.jsx';
      export { default as CustomerHomePage } from './src/features/customer/CustomerHomePage.jsx';
      export { default as CustomerStationListPage } from './src/features/stations/CustomerStationListPage.jsx';
      export { default as CustomerStationDetailPage } from './src/features/stations/CustomerStationDetailPage.jsx';
      export { default as CustomerVehicleListPage } from './src/features/vehicles/CustomerVehicleListPage.jsx';
      export { default as CustomerVehicleDetailPage } from './src/features/vehicles/CustomerVehicleDetailPage.jsx';
      export { default as CustomerRentalListPage } from './src/features/rentals/CustomerRentalListPage.jsx';
      export { default as CustomerRentalDetailPage } from './src/features/rentals/CustomerRentalDetailPage.jsx';
      export { default as CustomerWalletPage } from './src/features/wallet/CustomerWalletPage.jsx';
      export { default as CustomerPromotionsPage } from './src/features/promotions/CustomerPromotionsPage.jsx';
      export { default as CustomerProfilePage } from './src/features/profile/CustomerProfilePage.jsx';
      export { default as CustomerTicketListPage } from './src/features/tickets/CustomerTicketListPage.jsx';
      export { default as CustomerFaqPage } from './src/features/faq/CustomerFaqPage.jsx';
      export { default as LoginPage } from './src/features/auth/LoginPage.jsx';
      export { default as RegisterPage } from './src/features/auth/RegisterPage.jsx';
      export { default as ReserveVehicleModal } from './src/features/rentals/ReserveVehicleModal.jsx';
      export { default as StationCard } from './src/components/customer/StationCard.jsx';
      export { default as VehicleCard } from './src/components/customer/VehicleCard.jsx';
      export { resetPlatformApi } from './src/integrations/apiClient.js';
    `,
    resolveDir: process.cwd(),
    loader: 'jsx',
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  loader: { '.css': 'empty' },
  external: ['react', 'react-dom', 'react-router-dom'],
  logLevel: 'silent',
});

const mod = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(
  createRequire(import.meta.url),
  mod,
  mod.exports
);

const {
  AuthProvider,
  RequireRole,
  ToastProvider,
  CustomerLayout,
  AdminLayout,
  CustomerHomePage,
  CustomerStationListPage,
  CustomerStationDetailPage,
  CustomerVehicleListPage,
  CustomerVehicleDetailPage,
  CustomerRentalListPage,
  CustomerRentalDetailPage,
  CustomerWalletPage,
  CustomerPromotionsPage,
  CustomerProfilePage,
  CustomerTicketListPage,
  CustomerFaqPage,
  LoginPage,
  RegisterPage,
  ReserveVehicleModal,
  StationCard,
  VehicleCard,
  resetPlatformApi,
} = mod.exports;

const h = React.createElement;
const flush = () => new Promise((resolve) => setImmediate(resolve));

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('StationCard renders 24/7 hours, preserves 0 vs missing counts, and exposes clear CTAs without technical strings', () => {
  let root;
  try {
    act(() => {
      root = TestRenderer.create(
        h(
          MemoryRouter,
          null,
          h(StationCard, {
            station: {
              id: '101',
              name: 'Trạm Bến Thành',
              address: '01 Lê Lợi, Quận 1, TP.HCM',
              status: 'ACTIVE',
              opens_at: null,
              closes_at: null,
              available_vehicle_count: 0,
              available_spaces: 5,
              capacity: 12,
            },
          })
        )
      );
    });
    const text = JSON.stringify(root.toJSON());
    assert.match(text, /Trạm Bến Thành/);
    assert.match(text, /Mở cửa 24\/7/);
    assert.match(text, /0 xe/);
    assert.match(text, /5 chỗ/);
    assert.match(text, /Sức chứa 12 xe/);
    assert.match(text, /Xem xe/);
    assert.match(text, /Xem chi tiết/);
    assert.doesNotMatch(text, /undefined|NaN|\/ 10|ACTIVE|GET \/api/);
  } finally {
    act(() => root?.unmount());
  }
});

test('CustomerLayout renders accessible desktop navigation, Escape-dismissible account/mobile menus, and password modal with linked labels', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const keyListeners = new Set();
  globalThis.window = {
    addEventListener: (type, fn) => {
      if (type === 'keydown') keyListeners.add(fn);
    },
    removeEventListener: (type, fn) => {
      if (type === 'keydown') keyListeners.delete(fn);
    },
  };
  globalThis.document = { activeElement: null };

  let root;
  const manager = { getState: () => ({}) };
  try {
    await act(async () => {
      root = TestRenderer.create(
        h(
          MemoryRouter,
          { initialEntries: ['/stations'] },
          h(
            AuthProvider,
            {
              sessionManager: manager,
              externalAuth: {
                isAuthenticated: true,
                isBootstrapping: false,
                user: {
                  id: '9',
                  name: 'Nguyễn Minh An',
                  email: 'an.nguyen@evride.test',
                  role: 'CUSTOMER',
                },
                accessToken: 'ram-token',
                sessionId: 'sid-1',
              },
            },
            h(
              ToastProvider,
              null,
              h(
                Routes,
                null,
                h(
                  Route,
                  { path: '/', element: h(CustomerLayout) },
                  h(Route, { path: 'stations', element: h('div', null, 'Nội dung trạm') })
                )
              )
            )
          )
        )
      );
      await flush();
    });

    // Skip link exists
    const skipLink = root.root.findAllByType('a').find(
      (a) => a.props.href === '#customer-main-content'
    );
    assert.ok(skipLink, 'Skip link must target #customer-main-content');

    const trigger = root.root.findAllByType('button').find(
      (btn) => btn.props['aria-haspopup'] === 'menu'
    );
    assert.ok(trigger, 'Account menu trigger button must exist');
    assert.equal(trigger.props['aria-expanded'], false);

    // Mở menu tài khoản rồi nhấn Escape để đóng
    act(() => trigger.props.onClick());
    assert.equal(trigger.props['aria-expanded'], true);
    const renderedMenu = JSON.stringify(root.toJSON());
    assert.match(renderedMenu, /Hồ sơ & Giấy tờ/);
    assert.match(renderedMenu, /Đổi mật khẩu/);
    assert.doesNotMatch(renderedMenu, /CUSTOMER/);

    act(() => {
      for (const fn of keyListeners) fn({ key: 'Escape' });
    });
    assert.equal(trigger.props['aria-expanded'], false);

    // Mở lại menu và bấm Đổi mật khẩu -> kiểm tra hộp thoại có đủ label liên kết input
    act(() => trigger.props.onClick());
    const pwMenuBtn = root.root.findAllByType('button').find(
      (btn) =>
        btn.props.role === 'menuitem' &&
        btn.findAllByType('span').some((s) => s.children.includes('Đổi mật khẩu'))
    );
    act(() => pwMenuBtn.props.onClick());

    const dialog = root.root.findAllByProps({ role: 'dialog' })[0];
    assert.ok(dialog, 'Change password modal must open');
    const pwInputs = dialog.findAllByType('input');
    assert.equal(pwInputs.length, 3);
    for (const inp of pwInputs) {
      assert.ok(inp.props.id, 'Every password input must have an id');
      const matchingLabel = dialog.findAllByType('label').find(
        (lbl) => lbl.props.htmlFor === inp.props.id
      );
      assert.ok(matchingLabel, `Label htmlFor must match input id ${inp.props.id}`);
    }
  } finally {
    act(() => root?.unmount());
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    resetPlatformApi();
  }
});

test('CustomerHomePage shows unresolved rental bar, quick search submit, workflow steps, and featured stations without raw enums', async () => {
  const originalFetch = globalThis.fetch;
  let root;
  resetPlatformApi();

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/rentals')) {
      return jsonResponse({
        data: [
          {
            id: '777',
            status: 'RESERVED',
            vehicle_name: 'EV-Klara-01',
            vehicle_model_snapshot: 'VinFast Klara S',
          },
        ],
        meta: { page: 1, page_size: 5, total: 1 },
      });
    }
    return jsonResponse({
      data: [
        {
          id: '12',
          name: 'Trạm Nguyễn Huệ',
          address: '68 Nguyễn Huệ, Quận 1',
          status: 'ACTIVE',
          opens_at: '06:00:00',
          closes_at: '22:00:00',
          available_vehicle_count: 4,
          available_spaces: 6,
          capacity: 10,
        },
      ],
      meta: { page: 1, page_size: 6, total: 8 },
    });
  };

  try {
    await act(async () => {
      root = TestRenderer.create(
        h(
          MemoryRouter,
          { initialEntries: ['/'] },
          h(
            AuthProvider,
            {
              sessionManager: { getState: () => ({}) },
              externalAuth: {
                isAuthenticated: true,
                isBootstrapping: false,
                user: { id: '9', name: 'An', role: 'CUSTOMER' },
                accessToken: 'ram-token',
                sessionId: 'sid-1',
              },
            },
            h(
              ToastProvider,
              null,
              h(
                Routes,
                null,
                h(Route, { path: '/', element: h(CustomerHomePage) }),
                h(Route, { path: '/stations', element: h(CustomerStationListPage) })
              )
            )
          )
        )
      );
      await flush();
      await flush();
    });

    const html = JSON.stringify(root.toJSON());
    assert.match(html, /Chuyến thuê đang mở của bạn/);
    assert.match(html, /EV-Klara-01/);
    assert.match(html, /Trạm Nguyễn Huệ/);
    assert.match(html, /tổng số/);
    assert.doesNotMatch(html, /RESERVED|RETURN_PENDING|GET \/api/);
  } finally {
    act(() => root?.unmount());
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('CustomerStationListPage links labels to inputs, toggles quick-filter chips, resets filters, and renders clean ErrorState', async () => {
  const originalFetch = globalThis.fetch;
  let root;
  let shouldFail = false;
  const requestedUrls = [];
  resetPlatformApi();

  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    if (shouldFail) {
      return jsonResponse(
        { error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Máy chủ tạm bận.' } },
        503
      );
    }
    return jsonResponse({
      data: [
        {
          id: '20',
          name: 'Trạm Thảo Điền',
          address: '12 Xuân Thủy, TP. Thủ Đức',
          status: 'ACTIVE',
          opens_at: null,
          closes_at: null,
          available_vehicle_count: 3,
          available_spaces: 4,
        },
      ],
      meta: { page: 1, page_size: 12, total: 1 },
    });
  };

  try {
    await act(async () => {
      root = TestRenderer.create(
        h(MemoryRouter, { initialEntries: ['/stations'] }, h(CustomerStationListPage))
      );
      await flush();
      await flush();
    });

    // Kiểm tra mọi input/select trong bộ lọc đều có label htmlFor khớp id
    const labels = root.root.findAllByType('label');
    for (const expectedId of ['station-search-q', 'station-filter-available', 'station-filter-return']) {
      assert.ok(
        labels.some((l) => l.props.htmlFor === expectedId),
        `Filter control ${expectedId} must have a linked <label>`
      );
    }

    const chip = root.root
      .findAllByType('button')
      .find((b) => b.children.includes('Đang có xe sẵn sàng'));
    assert.ok(chip);
    assert.equal(chip.props['aria-pressed'], false);

    // Bật chip lọc nhanh -> gọi lại API với has_available_vehicles=true
    shouldFail = true;
    await act(async () => {
      chip.props.onClick();
      await flush();
      await flush();
    });

    assert.equal(chip.props['aria-pressed'], true);
    assert.ok(requestedUrls.some((u) => u.includes('has_available_vehicles=true')));

    const errorTree = JSON.stringify(root.toJSON());
    assert.match(errorTree, /Không tải được danh sách trạm/);
    assert.doesNotMatch(errorTree, /DEPENDENCY_UNAVAILABLE/);
  } finally {
    act(() => root?.unmount());
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('AdminLayout and /admin route guard remain intact without regressions from customer UI refresh', async () => {
  let root;
  try {
    await act(async () => {
      root = TestRenderer.create(
        h(
          MemoryRouter,
          { initialEntries: ['/admin'] },
          h(
            AuthProvider,
            {
              sessionManager: { getState: () => ({}) },
              externalAuth: {
                isAuthenticated: true,
                isBootstrapping: false,
                user: { id: '2', name: 'Quản lý Vận hành', role: 'MANAGER' },
                accessToken: 'mgr-token',
                sessionId: 'sid-mgr',
              },
            },
            h(
              ToastProvider,
              null,
              h(
                Routes,
                null,
                h(
                  Route,
                  {
                    path: '/admin',
                    element: h(
                      RequireRole,
                      { allowedRoles: ['STAFF', 'MANAGER'] },
                      h(AdminLayout)
                    ),
                  },
                  h(Route, { index: true, element: h('div', null, 'Tổng quan quản trị #16') })
                )
              )
            )
          )
        )
      );
      await flush();
    });

    const text = JSON.stringify(root.toJSON());
    assert.match(text, /Tổng quan quản trị #16/);
    assert.match(text, /Quản lý Vận hành/);
  } finally {
    act(() => root?.unmount());
    resetPlatformApi();
  }
});

test('VehicleCard displays battery, pricing, station name, and triggers onReserve cleanly', () => {
  let root;
  let reserved = null;
  const sampleVehicle = {
    id: '501',
    name: 'EV-Klara-09',
    model: 'VinFast Klara S',
    battery_percent: 82,
    current_station_id: '101',
    first_30_minutes_price: '25000',
    extra_minute_price: '1000',
    deposit_amount: '200000',
  };

  try {
    act(() => {
      root = TestRenderer.create(
        h(
          MemoryRouter,
          null,
          h(VehicleCard, {
            vehicle: sampleVehicle,
            stationName: 'Trạm Bến Thành',
            onReserve: (v) => {
              reserved = v;
            },
          })
        )
      );
    });

    const text = JSON.stringify(root.toJSON());
    assert.match(text, /VinFast Klara S/);
    assert.match(text, /EV-Klara-09/);
    assert.match(text, /Trạm Bến Thành/);
    assert.match(text, /82%/);
    assert.match(text, /Giữ xe 30 phút/);
    assert.match(text, /Xem chi tiết/);
    assert.doesNotMatch(text, /undefined|NaN|AVAILABLE|GET \/api/);

    const reserveBtn = root.root
      .findAllByType('button')
      .find((b) => String(b.props.className || '').includes('btn-primary'));
    assert.ok(reserveBtn);
    act(() => reserveBtn.props.onClick());
    assert.equal(reserved?.id, '501');
  } finally {
    act(() => root?.unmount());
  }
});

test('CustomerStationDetailPage renders stats strip, linked model filter label, and vehicles list', async () => {
  const originalFetch = globalThis.fetch;
  let root;
  resetPlatformApi();

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/vehicles')) {
      return jsonResponse({
        data: [
          {
            id: '501',
            name: 'EV-Evo-02',
            model: 'VinFast Evo200',
            battery_percent: 90,
            current_station_id: '101',
            first_30_minutes_price: '20000',
            extra_minute_price: '800',
            deposit_amount: '150000',
          },
        ],
        meta: { page: 1, page_size: 12, total: 1 },
      });
    }
    return jsonResponse({
      data: {
        id: '101',
        name: 'Trạm Bến Thành',
        address: '01 Lê Lợi, Quận 1',
        status: 'ACTIVE',
        opens_at: null,
        closes_at: null,
        available_vehicle_count: 1,
        available_spaces: 7,
        capacity: 12,
        latitude: 10.772,
        longitude: 106.698,
      },
    });
  };

  try {
    await act(async () => {
      root = TestRenderer.create(
        h(
          MemoryRouter,
          { initialEntries: ['/stations/101'] },
          h(
            AuthProvider,
            {
              sessionManager: { getState: () => ({}) },
              externalAuth: {
                isAuthenticated: false,
                isBootstrapping: false,
                user: null,
                accessToken: null,
                sessionId: null,
              },
            },
            h(
              ToastProvider,
              null,
              h(
                Routes,
                null,
                h(Route, { path: '/stations/:stationId', element: h(CustomerStationDetailPage) })
              )
            )
          )
        )
      );
      await flush();
      await flush();
      await flush();
    });

    const text = JSON.stringify(root.toJSON());
    assert.match(text, /Trạm Bến Thành/);
    assert.match(text, /Mở cửa 24\/7/);
    assert.match(text, /EV-Evo-02/);
    assert.doesNotMatch(text, /ACTIVE|undefined|NaN|\/ 10/);

    const labels = root.root.findAllByType('label');
    assert.ok(
      labels.some((l) => l.props.htmlFor === 'station-vehicle-model'),
      'Station vehicle model filter must link label htmlFor to input id'
    );
  } finally {
    act(() => root?.unmount());
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('CustomerVehicleListPage links station & model filter labels and renders vehicle grid', async () => {
  const originalFetch = globalThis.fetch;
  let root;
  resetPlatformApi();

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/stations')) {
      return jsonResponse({
        data: [{ id: '101', name: 'Trạm Bến Thành' }],
        meta: { page: 1, page_size: 100, total: 1 },
      });
    }
    return jsonResponse({
      data: [
        {
          id: '502',
          name: 'EV-Feliz-05',
          model: 'VinFast Feliz S',
          battery_percent: 76,
          current_station_id: '101',
          first_30_minutes_price: '25000',
          extra_minute_price: '1000',
          deposit_amount: '200000',
        },
      ],
      meta: { page: 1, page_size: 12, total: 1 },
    });
  };

  try {
    await act(async () => {
      root = TestRenderer.create(
        h(
          MemoryRouter,
          { initialEntries: ['/vehicles'] },
          h(
            AuthProvider,
            {
              sessionManager: { getState: () => ({}) },
              externalAuth: {
                isAuthenticated: true,
                isBootstrapping: false,
                user: { id: '9', name: 'An', role: 'CUSTOMER' },
                accessToken: 'ram-token',
                sessionId: 'sid-1',
              },
            },
            h(ToastProvider, null, h(CustomerVehicleListPage))
          )
        )
      );
      await flush();
      await flush();
    });

    const labels = root.root.findAllByType('label');
    for (const id of ['vehicle-filter-station', 'vehicle-filter-model']) {
      assert.ok(
        labels.some((l) => l.props.htmlFor === id),
        `Vehicle filter ${id} must have a linked <label>`
      );
    }

    const text = JSON.stringify(root.toJSON());
    assert.match(text, /EV-Feliz-05/);
    assert.match(text, /Trạm Bến Thành/);
    assert.doesNotMatch(text, /AVAILABLE|GET \/api|undefined/);
  } finally {
    act(() => root?.unmount());
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('CustomerVehicleDetailPage shows pricing, upfront requirement, station summary, and respects staff role restriction', async () => {
  const originalFetch = globalThis.fetch;
  let root;
  resetPlatformApi();

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/stations/101')) {
      return jsonResponse({
        data: {
          id: '101',
          name: 'Trạm Bến Thành',
          address: '01 Lê Lợi, Quận 1',
          status: 'ACTIVE',
          opens_at: '06:00:00',
          closes_at: '22:00:00',
          available_spaces: 5,
        },
      });
    }
    return jsonResponse({
      data: {
        id: '501',
        name: 'EV-Klara-09',
        model: 'VinFast Klara S',
        battery_percent: 88,
        current_station_id: '101',
        first_30_minutes_price: '25000',
        extra_minute_price: '1000',
        deposit_amount: '200000',
      },
    });
  };

  try {
    await act(async () => {
      root = TestRenderer.create(
        h(
          MemoryRouter,
          { initialEntries: ['/vehicles/501'] },
          h(
            AuthProvider,
            {
              sessionManager: { getState: () => ({}) },
              externalAuth: {
                isAuthenticated: true,
                isBootstrapping: false,
                user: { id: '2', name: 'Nhân viên', role: 'STAFF' },
                accessToken: 'staff-token',
                sessionId: 'sid-staff',
              },
            },
            h(
              ToastProvider,
              null,
              h(
                Routes,
                null,
                h(Route, { path: '/vehicles/:vehicleId', element: h(CustomerVehicleDetailPage) })
              )
            )
          )
        )
      );
      await flush();
      await flush();
      await flush();
    });

    const text = JSON.stringify(root.toJSON());
    assert.match(text, /EV-Klara-09/);
    assert.match(text, /Số dư ví tối thiểu cần có/);
    assert.match(text, /Trạm Bến Thành/);
    assert.match(text, /tài khoản vận hành/);
    assert.doesNotMatch(text, /Giữ xe này trong 30 phút|STAFF|AVAILABLE/);
  } finally {
    act(() => root?.unmount());
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('ReserveVehicleModal displays upfront pricing summary and sends Idempotency-Key on confirm', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };
  globalThis.document = { activeElement: null };
  let root;
  let capturedHeaders = null;
  resetPlatformApi();

  globalThis.fetch = async (url, options = {}) => {
    capturedHeaders = options.headers || {};
    return jsonResponse({
      data: { id: '9001', status: 'RESERVED' },
    });
  };

  try {
    await act(async () => {
      root = TestRenderer.create(
        h(
          MemoryRouter,
          null,
          h(
            ToastProvider,
            null,
            h(ReserveVehicleModal, {
              vehicle: {
                id: '501',
                name: 'EV-Klara-09',
                model: 'VinFast Klara S',
                battery_percent: 88,
                current_station_id: '101',
                first_30_minutes_price: '25000',
                extra_minute_price: '1000',
                deposit_amount: '200000',
              },
              station: {
                id: '101',
                name: 'Trạm Bến Thành',
                address: '01 Lê Lợi, Quận 1',
                opens_at: null,
                closes_at: null,
              },
              onClose: () => {},
            })
          )
        )
      );
    });

    const text = JSON.stringify(root.toJSON());
    assert.match(text, /Xác nhận giữ xe máy điện \(30 phút\)/);
    assert.match(text, /Số dư ví tối thiểu cần có/);
    assert.match(text, /CCCD đã xác minh/);

    const confirmBtn = root.root
      .findAllByType('button')
      .find((b) => String(b.props.className || '').includes('btn-primary'));
    assert.ok(confirmBtn);

    await act(async () => {
      await confirmBtn.props.onClick();
      await flush();
    });

    assert.ok(capturedHeaders, 'POST /rentals must be called');
    const headerKeys = Object.keys(capturedHeaders).map((k) => k.toLowerCase());
    assert.ok(headerKeys.includes('idempotency-key'), 'Idempotency-Key header must be preserved');
  } finally {
    act(() => root?.unmount());
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    resetPlatformApi();
  }
});

function extractVisibleText(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractVisibleText).join(' ');
  return extractVisibleText(node.children);
}

test('CustomerRentalListPage shows unresolved rental banner, linked status filter label, and rental cards without raw enums', async () => {
  const originalFetch = globalThis.fetch;
  let root;
  resetPlatformApi();

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/stations')) {
      return jsonResponse({
        data: [{ id: '101', name: 'Trạm Bến Thành' }],
        meta: { page: 1, page_size: 100, total: 1 },
      });
    }
    return jsonResponse({
      data: [
        {
          id: '9001',
          status: 'RESERVED',
          vehicle_name: 'EV-Klara-09',
          vehicle_model_snapshot: 'VinFast Klara S',
          pickup_station_id: '101',
          created_at: '2026-11-26T10:00:00Z',
          first_30_minutes_price_snapshot: '25000',
          deposit_held: '0',
          elapsed_seconds: null,
          total_price: null,
        },
      ],
      meta: { page: 1, page_size: 10, total: 1 },
    });
  };

  try {
    await act(async () => {
      root = TestRenderer.create(
        h(MemoryRouter, { initialEntries: ['/rentals'] }, h(CustomerRentalListPage))
      );
      await flush();
      await flush();
    });

    const labels = root.root.findAllByType('label');
    assert.ok(
      labels.some((l) => l.props.htmlFor === 'rental-status-filter'),
      'Rental status filter must link label htmlFor to select id'
    );

    const text = extractVisibleText(root.toJSON());
    assert.match(text, /Chuyến hiện tại cần theo dõi/);
    assert.match(text, /EV-Klara-09/);
    assert.match(text, /Trạm Bến Thành/);
    assert.doesNotMatch(text, /RESERVED|RETURN_PENDING|GET \/api/);
  } finally {
    act(() => root?.unmount());
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('CustomerRentalDetailPage renders RESERVED hold banner, stats strip, and cancel button without self-pickup button', async () => {
  const originalFetch = globalThis.fetch;
  let root;
  resetPlatformApi();

  const futureExpiry = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/handovers')) {
      return jsonResponse({ data: [], meta: { page: 1, page_size: 20, total: 0 } });
    }
    if (u.includes('/stations/101')) {
      return jsonResponse({
        data: {
          id: '101',
          name: 'Trạm Bến Thành',
          address: '01 Lê Lợi, Quận 1',
          opens_at: null,
          closes_at: null,
        },
      });
    }
    return jsonResponse({
      data: {
        id: '9001',
        status: 'RESERVED',
        vehicle_name: 'EV-Klara-09',
        vehicle_model_snapshot: 'VinFast Klara S',
        pickup_station_id: '101',
        created_at: '2026-11-26T10:00:00Z',
        expires_at: futureExpiry,
        first_30_minutes_price_snapshot: '25000',
        extra_minute_price_snapshot: '1000',
        deposit_amount_snapshot: '200000',
        deposit_held: '0',
      },
    });
  };

  try {
    await act(async () => {
      root = TestRenderer.create(
        h(
          MemoryRouter,
          { initialEntries: ['/rentals/9001'] },
          h(
            AuthProvider,
            {
              sessionManager: { getState: () => ({}) },
              externalAuth: {
                isAuthenticated: true,
                isBootstrapping: false,
                user: { id: '9', name: 'An', role: 'CUSTOMER' },
                accessToken: 'ram-token',
                sessionId: 'sid-1',
              },
            },
            h(
              ToastProvider,
              null,
              h(
                Routes,
                null,
                h(Route, { path: '/rentals/:rentalId', element: h(CustomerRentalDetailPage) })
              )
            )
          )
        )
      );
      await flush();
      await flush();
      await flush();
    });

    const text = JSON.stringify(root.toJSON());
    assert.match(text, /EV-Klara-09/);
    assert.match(text, /Thời gian giữ chỗ còn lại:/);
    assert.match(text, /Hủy giữ xe/);
    assert.match(text, /Trạm Bến Thành/);
    assert.doesNotMatch(text, /RESERVED|GET \/api|Xác nhận nhận xe ngay/);
  } finally {
    act(() => root?.unmount());
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('CustomerWalletPage renders balance, linked topup input & filter labels, and preserves PENDING approval wording', async () => {
  const originalFetch = globalThis.fetch;
  let root;
  resetPlatformApi();

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/wallets/me/topups')) {
      return jsonResponse({
        data: [
          {
            id: 'tp-1',
            amount: '150000.00',
            status: 'PENDING',
            payment_mode: 'DEMO',
            created_at: '2026-11-26T10:10:00Z',
            reviewed_at: null,
          },
        ],
        meta: { page: 1, page_size: 10, total: 1 },
      });
    }
    if (u.includes('/wallets/me/transactions')) {
      return jsonResponse({ data: [], meta: { page: 1, page_size: 10, total: 0 } });
    }
    return jsonResponse({
      data: {
        id: 'w-1',
        balance: '300000.00',
        status: 'ACTIVE',
        updated_at: '2026-11-26T10:00:00Z',
      },
    });
  };

  try {
    await act(async () => {
      root = TestRenderer.create(
        h(
          MemoryRouter,
          { initialEntries: ['/wallet'] },
          h(ToastProvider, null, h(CustomerWalletPage))
        )
      );
      await flush();
      await flush();
    });

    const labels = root.root.findAllByType('label');
    for (const id of ['wallet-topup-amount', 'wallet-topup-status-filter']) {
      assert.ok(
        labels.some((l) => l.props.htmlFor === id),
        `Wallet control ${id} must have a linked <label>`
      );
    }

    const text = extractVisibleText(root.toJSON());
    assert.match(text, /300\.000/);
    assert.match(text, /Tiền mô phỏng/);
    assert.match(text, /Chờ nhân viên xác nhận/);
    assert.doesNotMatch(text, /PENDING|ACTIVE|GET \/api/);
  } finally {
    act(() => root?.unmount());
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('CustomerPromotionsPage renders available voucher cards and triggers claim with Idempotency-Key', async () => {
  const originalFetch = globalThis.fetch;
  let root;
  let claimHeaders = null;
  resetPlatformApi();

  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (options.method === 'POST' && u.includes('/claim')) {
      claimHeaders = options.headers || {};
      return jsonResponse({ data: { id: 'cl-1', promotion_id: 'p-1' } }, 201);
    }
    if (u.includes('/promotions/my')) {
      return jsonResponse({ data: [], meta: { page: 1, page_size: 10, total: 0 } });
    }
    return jsonResponse({
      data: [
        {
          id: 'p-1',
          code: 'EVRIDE20',
          description: 'Giảm 20% cước chuyến đi',
          discount_type: 'PERCENT',
          discount_value: '20',
          is_active: true,
          valid_from: '2026-01-01T00:00:00Z',
          valid_to: '2027-01-01T00:00:00Z',
        },
      ],
      meta: { page: 1, page_size: 10, total: 1 },
    });
  };

  try {
    await act(async () => {
      root = TestRenderer.create(
        h(
          MemoryRouter,
          { initialEntries: ['/promotions'] },
          h(ToastProvider, null, h(CustomerPromotionsPage))
        )
      );
      await flush();
      await flush();
    });

    const text = JSON.stringify(root.toJSON());
    assert.match(text, /EVRIDE20/);
    assert.match(text, /Nhận mã/);
    assert.doesNotMatch(text, /PERCENT|GET \/api/);

    const claimBtn = root.root
      .findAllByType('button')
      .find((b) => String(b.props.className || '').includes('btn-primary'));
    assert.ok(claimBtn);

    await act(async () => {
      await claimBtn.props.onClick();
      await flush();
    });

    assert.ok(claimHeaders, 'POST claim promotion must be called');
    const headerKeys = Object.keys(claimHeaders).map((k) => k.toLowerCase());
    assert.ok(headerKeys.includes('idempotency-key'), 'Claim promotion must send Idempotency-Key');
  } finally {
    act(() => root?.unmount());
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('CustomerProfilePage links display-name label, renders eligibility banner and masked documents without raw enums', async () => {
  const originalFetch = globalThis.fetch;
  let root;
  resetPlatformApi();

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/documents')) {
      return jsonResponse({
        data: [
          {
            id: 'doc-1',
            document_type: 'CCCD',
            document_number_masked: '0792****8912',
            verified_status: 'PENDING',
            expires_on: '2035-01-01',
            created_at: '2026-11-26T09:00:00Z',
          },
        ],
        meta: { page: 1, page_size: 10, total: 1 },
      });
    }
    return jsonResponse({
      data: {
        id: '9',
        name: 'Nguyễn Minh An',
        email: 'an@evride.test',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        created_at: '2026-01-01T08:00:00Z',
      },
    });
  };

  try {
    await act(async () => {
      root = TestRenderer.create(
        h(
          MemoryRouter,
          { initialEntries: ['/profile'] },
          h(
            AuthProvider,
            {
              sessionManager: { getState: () => ({}) },
              externalAuth: {
                isAuthenticated: true,
                isBootstrapping: false,
                user: { id: '9', name: 'Nguyễn Minh An', role: 'CUSTOMER' },
                accessToken: 'ram-token',
                sessionId: 'sid-1',
              },
            },
            h(ToastProvider, null, h(CustomerProfilePage))
          )
        )
      );
      await flush();
      await flush();
    });

    const labels = root.root.findAllByType('label');
    assert.ok(
      labels.some((l) => l.props.htmlFor === 'profile-display-name'),
      'Profile display name input must have a linked <label>'
    );

    const text = extractVisibleText(root.toJSON());
    assert.match(text, /0792\*\*\*\*8912/);
    assert.match(text, /an@evride\.test/);
    assert.doesNotMatch(text, /PENDING|CUSTOMER|ACTIVE|GET \/api/);
  } finally {
    act(() => root?.unmount());
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('CustomerTicketListPage and CustomerFaqPage link filter/search labels and render Vietnamese copy without raw enums', async () => {
  const originalFetch = globalThis.fetch;
  let ticketRoot;
  let faqRoot;
  resetPlatformApi();

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/faq')) {
      return jsonResponse({
        data: [
          {
            id: 'faq-1',
            question: 'Tôi được giữ xe trong bao lâu?',
            answer: 'Lượt giữ xe có hiệu lực trong 30 phút theo đồng hồ máy chủ.',
            sources: [{ title: 'Chính sách giữ xe', url: '/faq/sources/hold' }],
          },
        ],
      });
    }
    return jsonResponse({
      data: [
        {
          id: 'tk-1',
          title: 'Kiểm tra phanh trước',
          description: 'Phanh hơi kêu nhẹ khi bóp mạnh.',
          status: 'OPEN',
          created_at: '2026-11-26T10:00:00Z',
          rental_id: '9001',
        },
      ],
      meta: { page: 1, page_size: 10, total: 1 },
    });
  };

  try {
    await act(async () => {
      ticketRoot = TestRenderer.create(
        h(
          MemoryRouter,
          { initialEntries: ['/support'] },
          h(ToastProvider, null, h(CustomerTicketListPage))
        )
      );
      faqRoot = TestRenderer.create(
        h(
          MemoryRouter,
          { initialEntries: ['/faq'] },
          h(
            AuthProvider,
            {
              sessionManager: { getState: () => ({}) },
              externalAuth: {
                isAuthenticated: true,
                isBootstrapping: false,
                user: { id: '9', name: 'An', role: 'CUSTOMER' },
                accessToken: 'ram-token',
                sessionId: 'sid-1',
              },
            },
            h(CustomerFaqPage)
          )
        )
      );
      await flush();
      await flush();
    });

    assert.ok(
      ticketRoot.root.findAllByType('label').some((l) => l.props.htmlFor === 'ticket-status-filter')
    );
    const ticketText = extractVisibleText(ticketRoot.toJSON());
    assert.match(ticketText, /Kiểm tra phanh trước/);
    assert.doesNotMatch(ticketText, /OPEN|GET \/api/);

    const faqLabels = faqRoot.root.findAllByType('label');
    assert.ok(faqLabels.some((l) => l.props.htmlFor === 'faq-search-input'));
    assert.ok(faqLabels.some((l) => l.props.htmlFor === 'faq-chat-input'));
    const faqText = extractVisibleText(faqRoot.toJSON());
    assert.match(faqText, /Tôi được giữ xe trong bao lâu\?/);
  } finally {
    act(() => ticketRoot?.unmount());
    act(() => faqRoot?.unmount());
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('LoginPage and RegisterPage render split desktop shell with linked labels and password length validation', async () => {
  let loginRoot;
  let regRoot;
  try {
    await act(async () => {
      loginRoot = TestRenderer.create(
        h(
          MemoryRouter,
          { initialEntries: ['/login'] },
          h(
            AuthProvider,
            {
              sessionManager: { getState: () => ({}) },
              externalAuth: {
                isAuthenticated: false,
                isBootstrapping: false,
                user: null,
                accessToken: null,
                sessionId: null,
              },
            },
            h(LoginPage)
          )
        )
      );

      regRoot = TestRenderer.create(
        h(
          MemoryRouter,
          { initialEntries: ['/register'] },
          h(
            AuthProvider,
            {
              sessionManager: { getState: () => ({}) },
              externalAuth: {
                isAuthenticated: false,
                isBootstrapping: false,
                user: null,
                accessToken: null,
                sessionId: null,
              },
            },
            h(ToastProvider, null, h(RegisterPage))
          )
        )
      );
      await flush();
    });

    const loginLabels = loginRoot.root.findAllByType('label');
    for (const id of ['login-email', 'login-password']) {
      assert.ok(loginLabels.some((l) => l.props.htmlFor === id));
    }

    const regLabels = regRoot.root.findAllByType('label');
    for (const id of ['register-name', 'register-email', 'register-password', 'register-confirm-password']) {
      assert.ok(regLabels.some((l) => l.props.htmlFor === id));
    }

    assert.match(extractVisibleText(loginRoot.toJSON()), /Đăng nhập hệ thống/);
    assert.match(extractVisibleText(regRoot.toJSON()), /Đăng ký tài khoản khách hàng/);
  } finally {
    act(() => loginRoot?.unmount());
    act(() => regRoot?.unmount());
    resetPlatformApi();
  }
});
