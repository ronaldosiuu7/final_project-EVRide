import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ApiError,
  configurePlatformApi,
  resetPlatformApi,
} from '../src/integrations/apiClient.js';
import {
  attachFileToTicket,
  createRentalReview,
  createTicket,
  getFaqSourceText,
  listFaqs,
  postFaqChatbotMessage,
} from '../src/services/operationsApi.js';
import { getIncidentFinanceSummary } from '../src/services/incidentsApi.js';
import {
  canCreateTicketForRental,
  canCustomerReviewRental,
  describeExternalCompensation,
  filterFaqsByQuery,
  formatSafePlainSourceText,
  validateCustomerTicketForm,
  validateReviewForm,
} from '../src/utils/supportHelpers.js';

function makeJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('tickets enforce eligible rental statuses, string attachment IDs, permission checks, and upload/attach error handling', async () => {
  assert.equal(canCreateTicketForRental({ status: 'IN_RENT' }), true);
  assert.equal(canCreateTicketForRental({ status: 'STOLEN' }), true);
  assert.equal(canCreateTicketForRental({ status: 'COMPLETED' }), true);
  assert.equal(canCreateTicketForRental({ status: 'RESERVED' }), false);
  assert.equal(canCreateTicketForRental({ status: 'CLOSED_INCIDENT' }), false);

  const formErrs = validateCustomerTicketForm({ rentalId: '', title: '   ', description: '' });
  assert.ok(formErrs.rental_id && formErrs.title && formErrs.description);

  const originalFetch = globalThis.fetch;
  resetPlatformApi();
  configurePlatformApi({ getAccessToken: () => 'customer-token' });

  let attachedBody = null;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.endsWith('/rentals/50/support-tickets')) {
      return makeJsonResponse(
        {
          data: {
            id: '301',
            rental_id: '50',
            title: 'Báo sự cố phanh',
            description: 'Phanh sau kêu to',
            status: 'OPEN',
            resolution_note: null,
          },
          meta: { server_time: '2026-11-25T10:00:00Z' },
        },
        201
      );
    }
    if (target.endsWith('/files/7001/attachments')) {
      attachedBody = JSON.parse(init.body);
      return makeJsonResponse(
        { data: { id: '801', file_id: '7001', support_ticket_id: '301', purpose: 'TICKET_EVIDENCE' } },
        201
      );
    }
    if (target.endsWith('/files/7002/attachments')) {
      return makeJsonResponse(
        { error: { code: 'FILE_ALREADY_ATTACHED', message: 'Ảnh đã được gắn vào tài nguyên khác.' } },
        409
      );
    }
    return makeJsonResponse(
      { error: { code: 'FORBIDDEN', message: 'Không đủ quyền.' } },
      403
    );
  };

  try {
    const ticket = await createTicket('50', { title: 'Báo sự cố phanh', description: 'Phanh sau kêu to' });
    assert.equal(ticket.data.id, '301');

    await attachFileToTicket('7001', 301, 'attach-key-00000001');
    assert.deepEqual(attachedBody, {
      purpose: 'TICKET_EVIDENCE',
      support_ticket_id: '301',
    });

    await assert.rejects(
      () => attachFileToTicket('7002', '301', 'attach-key-00000002'),
      (err) => err instanceof ApiError && err.code === 'FILE_ALREADY_ATTACHED'
    );

    await assert.rejects(
      () => createTicket('999', { title: 'Test', description: 'Forbidden' }),
      (err) => err instanceof ApiError && err.status === 403
    );
  } finally {
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('incident finance summary distinguishes null vs 0.00 vs positive external compensation and review blocks CLOSED_INCIDENT & duplicates', async () => {
  // 1. External compensation null vs 0.00 vs positive
  const unknownComp = describeExternalCompensation(null, false);
  assert.equal(unknownComp.kind, 'unknown');
  assert.equal(unknownComp.valueText, 'Chưa xác định');

  const zeroComp = describeExternalCompensation('0.00', true);
  assert.equal(zeroComp.kind, 'zero');
  assert.equal(zeroComp.valueText, '0đ');

  const positiveComp = describeExternalCompensation('2500000.00', false);
  assert.equal(positiveComp.kind, 'positive');
  assert.equal(positiveComp.valueText, '2.500.000đ');

  // 2. Review eligibility: COMPLETED only (NEVER CLOSED_INCIDENT, NEVER STAFF)
  assert.equal(canCustomerReviewRental({ status: 'COMPLETED' }, 'CUSTOMER'), true);
  assert.equal(canCustomerReviewRental({ status: 'CLOSED_INCIDENT' }, 'CUSTOMER'), false);
  assert.equal(canCustomerReviewRental({ status: 'IN_RENT' }, 'CUSTOMER'), false);
  assert.equal(canCustomerReviewRental({ status: 'COMPLETED' }, 'STAFF'), false);

  assert.ok(validateReviewForm({ rating: 0, comment: '' }).rating);
  assert.deepEqual(validateReviewForm({ rating: 5, comment: 'Xe chạy êm' }), {});

  const originalFetch = globalThis.fetch;
  resetPlatformApi();
  configurePlatformApi({ getAccessToken: () => 'customer-token' });

  let reviewCalls = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith('/rentals/50/review')) {
      reviewCalls += 1;
      if (reviewCalls === 1) {
        return makeJsonResponse(
          { data: { id: '90', rental_id: '50', rating: 5, comment: 'Tốt' } },
          201
        );
      }
      return makeJsonResponse(
        { error: { code: 'ALREADY_REVIEWED', message: 'Chuyến này đã được đánh giá.' } },
        409
      );
    }
    if (target.endsWith('/rental-incidents/12/finance-summary')) {
      return makeJsonResponse({
        data: {
          incident_id: '12',
          incident_status: 'CONFIRMED',
          rental_status: 'INCIDENT_PENDING',
          compensation_mode: 'EXTERNAL',
          agreement_status: 'PENDING',
          compensation_amount: null,
          external_compensation_settled: false,
          rent_settled: true,
          rent_paid: '45000.00',
          deposit_remaining_held: '500000.00',
          closed_at: null,
        },
      });
    }
    return makeJsonResponse(
      { error: { code: 'INCIDENT_NOT_CONFIRMED', message: 'Hồ sơ chưa được xác nhận.' } },
      409
    );
  };

  try {
    const rev1 = await createRentalReview('50', { rating: 5, comment: 'Tốt' });
    assert.equal(rev1.data.rating, 5);

    await assert.rejects(
      () => createRentalReview('50', { rating: 4, comment: 'Đánh giá lại' }),
      (err) => err instanceof ApiError && err.code === 'ALREADY_REVIEWED'
    );

    const fin = await getIncidentFinanceSummary('12');
    assert.equal(fin.data.compensation_amount, null);
    assert.equal(fin.data.rent_settled, true);

    await assert.rejects(
      () => getIncidentFinanceSummary('13'),
      (err) => err instanceof ApiError && err.code === 'INCIDENT_NOT_CONFIRMED'
    );
  } finally {
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('FAQ search, text/plain source parsing, unavailable 503 source, and unmatched chatbot guidance follow backend contract', async () => {
  const originalFetch = globalThis.fetch;
  resetPlatformApi();
  configurePlatformApi({ getAccessToken: () => 'customer-token' });

  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.endsWith('/faq')) {
      return makeJsonResponse({
        data: [
          {
            id: 'hold',
            question: 'Tôi được giữ xe bao lâu?',
            answer: 'Bạn có 30 phút để đến nhận xe kể từ khi giữ xe thành công.',
            sources: [
              { title: 'EVRide V1 – Cấu hình thời gian giữ xe', url: 'http://localhost:8000/api/v1/faq/sources/decisions' },
            ],
          },
          {
            id: 'battery',
            question: 'Xe cần bao nhiêu pin để thuê?',
            answer: 'Xe cần pin tối thiểu 30% khi đặt và khi bàn giao.',
            sources: [
              { title: 'EVRide V1 – Mục 5: Pin tối thiểu', url: 'http://localhost:8000/api/v1/faq/sources/decisions' },
            ],
          },
        ],
        meta: { server_time: '2026-11-25T10:00:00Z' },
      });
    }
    if (target.endsWith('/faq/sources/decisions')) {
      return new Response('Mục 1: Giữ xe tối đa 30 phút.\r\nMục 5: Pin tối thiểu 30%.', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    if (target.endsWith('/faq/sources/missing')) {
      return makeJsonResponse(
        { error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Tài liệu nguồn chưa sẵn sàng.' } },
        503
      );
    }
    if (target.endsWith('/chatbot/messages') && init?.method === 'POST') {
      const { message } = JSON.parse(init.body);
      if (message.includes('giữ xe')) {
        return makeJsonResponse({
          data: {
            reply: 'Bạn có 30 phút để đến nhận xe kể từ khi giữ xe thành công.',
            sources: [{ title: 'EVRide V1 – Cấu hình thời gian giữ xe', url: '/api/v1/faq/sources/decisions' }],
            mode: 'FAQ',
          },
        });
      }
      return makeJsonResponse({
        data: {
          reply:
            'Tôi chưa xác định được một câu hỏi phù hợp. Bạn hãy hỏi riêng về giữ xe, pin, giá, cọc, trả xe, thanh toán hoặc bảo trì.',
          sources: [],
          mode: 'FAQ',
        },
      });
    }
    return makeJsonResponse({ data: null });
  };

  try {
    const faqRes = await listFaqs();
    assert.equal(faqRes.data.length, 2);
    assert.equal(filterFaqsByQuery(faqRes.data, 'giu xe').length, 1);

    // text/plain source parses as string (never JSON.parse error)
    const sourceRes = await getFaqSourceText('http://localhost:8000/api/v1/faq/sources/decisions');
    assert.equal(typeof sourceRes.data, 'string');
    assert.ok(formatSafePlainSourceText(sourceRes.data).includes('Pin tối thiểu 30%'));

    // Unavailable source returns 503 DEPENDENCY_UNAVAILABLE
    await assert.rejects(
      () => getFaqSourceText('missing'),
      (err) => err instanceof ApiError && err.status === 503 && err.code === 'DEPENDENCY_UNAVAILABLE'
    );

    // Chatbot matched vs unmatched guidance from backend
    const matchedChat = await postFaqChatbotMessage('Tôi được giữ xe bao lâu?');
    assert.equal(matchedChat.data.mode, 'FAQ');
    assert.equal(matchedChat.data.sources.length, 1);

    const unmatchedChat = await postFaqChatbotMessage('Thời tiết hôm nay thế nào?');
    assert.equal(unmatchedChat.data.sources.length, 0);
    assert.ok(unmatchedChat.data.reply.includes('chưa xác định được'));
  } finally {
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});
