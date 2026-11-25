import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ApiError,
  configurePlatformApi,
  resetPlatformApi,
} from '../src/integrations/apiClient.js';
import {
  claimPromotion,
  listAvailablePromotions,
  listMyPromotions,
} from '../src/services/walletsApi.js';
import {
  createReturnQuote,
  getRentalInvoice,
  listRentalTransactions,
} from '../src/services/rentalsApi.js';
import {
  buildPromotionConditionLines,
  classifyInvoiceFetchResult,
  evaluatePromotionState,
  evaluateQuoteExpiry,
  formatOfficialMoneyOrNull,
  formatPromotionDiscountSummary,
} from '../src/utils/promotionFinanceHelpers.js';

function makeJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('promotion formatting & state evaluation avoid raw enums/JSON and classify expired, exhausted, ineligible, claimed, and used codes accurately', () => {
  const refNow = Date.parse('2026-11-25T10:00:00Z');

  const pctPromo = {
    id: '10',
    code: 'GREEN15',
    discount_type: 'PERCENTAGE',
    discount_value: '15.00',
    max_discount_amount: '30000.00',
    min_rental_amount: '50000.00',
    vehicle_model: 'Klara S',
    usage_limit: 100,
    used_count: 42,
    start_date: '2026-11-01T00:00:00Z',
    end_date: '2026-12-01T00:00:00Z',
    status: 'ACTIVE',
  };

  const pctSummary = formatPromotionDiscountSummary(pctPromo);
  assert.equal(pctSummary, 'Giảm 15% (tối đa 30.000đ)');
  assert.equal(pctSummary.includes('PERCENTAGE'), false);

  const fixedSummary = formatPromotionDiscountSummary({
    discount_type: 'FIXED_AMOUNT',
    discount_value: '20000.00',
  });
  assert.equal(fixedSummary, 'Giảm 20.000đ');
  assert.equal(fixedSummary.includes('FIXED_AMOUNT'), false);

  const lines = buildPromotionConditionLines(pctPromo);
  assert.ok(lines.some((l) => l.includes('50.000đ')));
  assert.ok(lines.some((l) => l.includes('Klara S')));
  assert.ok(lines.some((l) => l.includes('58 lượt')));
  assert.equal(lines.join(' ').includes('{'), false);

  // Available -> canClaim
  assert.equal(evaluatePromotionState(pctPromo, { referenceNowMs: refNow }).canClaim, true);

  // Claimed unused -> canUseInQuote
  const claimed = evaluatePromotionState(pctPromo, {
    claimed: true,
    isUsed: false,
    referenceNowMs: refNow,
  });
  assert.equal(claimed.canUseInQuote, true);
  assert.equal(claimed.canClaim, false);

  // Already used
  assert.equal(
    evaluatePromotionState(pctPromo, { claimed: true, isUsed: true, referenceNowMs: refNow }).key,
    'USED'
  );

  // Expired
  assert.equal(
    evaluatePromotionState(
      { ...pctPromo, end_date: '2026-11-25T09:59:59Z' },
      { claimed: true, referenceNowMs: refNow }
    ).key,
    'EXPIRED'
  );

  // Exhausted
  assert.equal(
    evaluatePromotionState(
      { ...pctPromo, used_count: 100, usage_limit: 100 },
      { claimed: true, referenceNowMs: refNow }
    ).key,
    'EXHAUSTED'
  );

  // Disabled
  assert.equal(
    evaluatePromotionState(
      { ...pctPromo, status: 'DISABLED' },
      { claimed: true, referenceNowMs: refNow }
    ).key,
    'DISABLED'
  );
});

test('claim promotion, return-quote non-consumption, promotion error codes, and quote expiry behave per backend contract', async () => {
  const originalFetch = globalThis.fetch;
  resetPlatformApi();
  configurePlatformApi({ getAccessToken: () => 'customer-token' });

  let claimCalls = 0;
  let claimedUnused = false;

  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.endsWith('/promotions/10/claim') && init?.method === 'POST') {
      claimCalls += 1;
      claimedUnused = true;
      const status = claimCalls === 1 ? 201 : 200;
      return makeJsonResponse(
        {
          data: {
            id: '501',
            user_id: '99',
            promotion_id: '10',
            is_used: false,
            used_at: null,
            promotion: { id: '10', code: 'GREEN15' },
          },
          meta: { server_time: '2026-11-25T10:00:00Z' },
        },
        status
      );
    }
    if (target.endsWith('/promotions/11/claim') && init?.method === 'POST') {
      return makeJsonResponse(
        { error: { code: 'PROMOTION_EXHAUSTED', message: 'Mã khuyến mãi đã hết lượt.' } },
        409
      );
    }
    if (target.includes('/users/me/promotions')) {
      return makeJsonResponse({
        data: claimedUnused
          ? [{ id: '501', promotion_id: '10', is_used: false, promotion: { id: '10', code: 'GREEN15' } }]
          : [],
        meta: { page: 1, page_size: 20, total: claimedUnused ? 1 : 0 },
      });
    }
    if (target.endsWith('/rentals/700/return-quote') && init?.method === 'POST') {
      const body = JSON.parse(init.body);
      if (body.promotion_code === 'WRONGMODEL') {
        return makeJsonResponse(
          { error: { code: 'PROMOTION_INVALID', message: 'Mã không áp dụng cho mẫu xe này.' } },
          409
        );
      }
      return makeJsonResponse({
        data: {
          id: '600',
          rental_id: '700',
          return_station_id: '12',
          is_estimate: false,
          quote_expires_at: '2026-11-25T10:10:00Z',
          elapsed_seconds: 2400,
          rental_fee: '20000.00',
          discount_amount: '3000.00',
          total_amount: '17000.00',
          deposit_held: '500000.00',
          deposit_applied: '17000.00',
          additional_payment: '0.00',
          deposit_refund: '483000.00',
          promotion_code: body.promotion_code || null,
          quote_token: 'tok_demo_01234567890123456789012345678901',
        },
        meta: { server_time: '2026-11-25T10:00:00Z' },
      });
    }
    return makeJsonResponse({ data: [], meta: { page: 1, page_size: 10, total: 0 } });
  };

  try {
    // 1. Claim succeeds (201 first, 200 duplicate); exhausted returns 409 PROMOTION_EXHAUSTED
    const claim1 = await claimPromotion('10', 'claim-promo-key-0001');
    assert.equal(claim1.status, 201);
    assert.equal(claim1.data.is_used, false);

    const claim2 = await claimPromotion('10', 'claim-promo-key-0002');
    assert.equal(claim2.status, 200);

    await assert.rejects(
      () => claimPromotion('11', 'claim-promo-key-0003'),
      (err) => err instanceof ApiError && err.code === 'PROMOTION_EXHAUSTED'
    );

    // 2. Return quote applies promo on server WITHOUT consuming it on frontend/backend
    const quoteRes = await createReturnQuote('700', {
      return_station_id: '12',
      promotion_code: 'GREEN15',
    });
    assert.equal(quoteRes.data.discount_amount, '3000.00');
    assert.equal(quoteRes.data.additional_payment, '0.00');
    assert.equal(quoteRes.data.deposit_refund, '483000.00');

    const myPromosAfterQuote = await listMyPromotions({ is_used: 'false' });
    assert.equal(myPromosAfterQuote.data[0].is_used, false);

    // 3. Ineligible promo returns 409 PROMOTION_INVALID
    await assert.rejects(
      () =>
        createReturnQuote('700', {
          return_station_id: '12',
          promotion_code: 'WRONGMODEL',
        }),
      (err) => err instanceof ApiError && err.code === 'PROMOTION_INVALID'
    );

    // 4. Quote expiry check: valid at 10:05, expired at 10:10:01
    const validExpiry = evaluateQuoteExpiry(quoteRes.data, {
      serverTimeIso: '2026-11-25T10:05:00Z',
    });
    assert.equal(validExpiry.isExpired, false);
    assert.equal(validExpiry.formattedCountdown, '05:00');

    const expiredCheck = evaluateQuoteExpiry(quoteRes.data, {
      serverTimeIso: '2026-11-25T10:10:01Z',
    });
    assert.equal(expiredCheck.isExpired, true);
    assert.equal(expiredCheck.remainingSeconds, 0);

    await listAvailablePromotions({ page: 1, page_size: 10 });
  } finally {
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('invoice 404 is treated as not-issued (distinct from 500 API error) and 0.00 money is distinguished from null', async () => {
  // 1. 0.00 vs null money formatting
  assert.equal(formatOfficialMoneyOrNull('0.00'), '0đ');
  assert.equal(formatOfficialMoneyOrNull('17000.00'), '17.000đ');
  assert.equal(formatOfficialMoneyOrNull(null), 'Chưa cập nhật');
  assert.equal(formatOfficialMoneyOrNull(undefined, 'Chưa phát sinh'), 'Chưa phát sinh');

  // 2. Invoice classification: 404 -> not_issued, 500 -> error, data -> issued
  const notIssued = classifyInvoiceFetchResult({
    error: new ApiError(404, 'NOT_FOUND', 'Hóa đơn chưa được phát hành.'),
  });
  assert.equal(notIssued.state, 'not_issued');

  const serverFail = classifyInvoiceFetchResult({
    error: new ApiError(500, 'INTERNAL_ERROR', 'Lỗi máy chủ.'),
  });
  assert.equal(serverFail.state, 'error');

  const issued = classifyInvoiceFetchResult({
    invoice: { id: '30', total_amount: '0.00', status: 'PAID', created_at: '2026-11-25T10:15:00Z' },
  });
  assert.equal(issued.state, 'issued');
  assert.equal(formatOfficialMoneyOrNull(issued.invoice.total_amount), '0đ');

  // 3. Real API error propagation on getRentalInvoice / listRentalTransactions
  const originalFetch = globalThis.fetch;
  resetPlatformApi();
  configurePlatformApi({ getAccessToken: () => 'customer-token' });

  globalThis.fetch = async (url) => {
    if (String(url).includes('/invoice')) {
      return makeJsonResponse(
        { error: { code: 'NOT_FOUND', message: 'Hóa đơn chưa được phát hành.' } },
        404
      );
    }
    return makeJsonResponse(
      { error: { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống.' } },
      500
    );
  };

  try {
    let invoiceErr = null;
    try {
      await getRentalInvoice('700');
    } catch (err) {
      invoiceErr = err;
    }
    assert.equal(classifyInvoiceFetchResult({ error: invoiceErr }).state, 'not_issued');

    await assert.rejects(
      () => listRentalTransactions('700', { page: 1, page_size: 10 }),
      (err) => err instanceof ApiError && err.status === 500
    );
  } finally {
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});
