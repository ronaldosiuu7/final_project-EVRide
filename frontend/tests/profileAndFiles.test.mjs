import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_EVIDENCE_FILE_BYTES,
  downloadPrivateFileBlob,
  uploadEvidenceFile,
  validateEvidenceFile,
} from '../src/integrations/fileBridge.js';
import {
  ApiError,
  configurePlatformApi,
  resetPlatformApi,
} from '../src/integrations/apiClient.js';
import {
  createMyDocument,
  getDocumentSensitive,
  listMyDocuments,
  updateMyProfile,
} from '../src/services/accountsApi.js';
import {
  buildCreateDocumentPayload,
  evaluateCustomerDocumentEligibility,
  validateDocumentSubmissionForm,
} from '../src/utils/documentEligibility.js';

function makeJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('validateEvidenceFile and uploadEvidenceFile enforce MIME/size rules, omit manual Content-Type, and propagate upload failures', async () => {
  const originalFetch = globalThis.fetch;
  resetPlatformApi();
  configurePlatformApi({ getAccessToken: () => 'demo-access-token-123' });

  let fetchCalls = 0;
  let capturedHeaders = null;
  let capturedUrl = '';
  let capturedBody = null;

  globalThis.fetch = async (url, init) => {
    fetchCalls += 1;
    capturedUrl = String(url);
    capturedHeaders = new Headers(init.headers);
    capturedBody = init.body;
    if (fetchCalls === 1) {
      return makeJsonResponse(
        {
          data: {
            file_id: '5001',
            original_filename: 'cccd-front.jpg',
            content_type: 'image/jpeg',
            size_bytes: 1024,
            sha256: 'abc123',
            status: 'READY',
          },
          meta: { server_time: '2026-11-25T10:00:00Z' },
        },
        201
      );
    }
    return makeJsonResponse(
      { error: { code: 'FILE_TOO_LARGE', message: 'Kích thước tệp vượt quá giới hạn.' } },
      413
    );
  };

  try {
    // 1. Invalid MIME, empty file, oversized file rejected client-side BEFORE calling fetch
    assert.ok(validateEvidenceFile({ type: 'application/pdf', size: 1024 }));
    assert.ok(validateEvidenceFile({ type: 'image/gif', size: 1024 }));
    assert.ok(validateEvidenceFile({ type: 'image/jpeg', size: 0 }));
    assert.ok(validateEvidenceFile({ type: 'image/png', size: MAX_EVIDENCE_FILE_BYTES + 1 }));
    assert.equal(validateEvidenceFile({ type: 'image/webp', size: MAX_EVIDENCE_FILE_BYTES }), '');

    await assert.rejects(
      () => uploadEvidenceFile(new File(['bad'], 'doc.pdf', { type: 'application/pdf' })),
      (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
    );
    assert.equal(fetchCalls, 0);

    // 2. Valid JPEG upload sends FormData without manual Content-Type and with Bearer header (not in URL)
    const validFile = new File([new Uint8Array([1, 2, 3, 4])], 'cccd-front.jpg', {
      type: 'image/jpeg',
    });
    const uploaded = await uploadEvidenceFile(validFile);
    assert.equal(uploaded.file_id, '5001');
    assert.equal(uploaded.status, 'READY');
    assert.equal(capturedBody instanceof FormData, true);
    assert.equal(capturedHeaders.has('content-type'), false, 'Must NOT manually set Content-Type for multipart FormData');
    assert.equal(capturedHeaders.get('authorization'), 'Bearer demo-access-token-123');
    assert.equal(capturedUrl.includes('demo-access-token-123'), false, 'Must NEVER put token in URL');

    // 3. Server upload error (413) rejects cleanly with ApiError
    await assert.rejects(
      () => uploadEvidenceFile(validFile),
      (err) => err instanceof ApiError && err.status === 413 && err.code === 'FILE_TOO_LARGE'
    );
  } finally {
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});

test('downloadPrivateFileBlob sends Bearer header (never in URL), revokes Blob URL cleanly, and surfaces 403/404 errors', async () => {
  const originalFetch = globalThis.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  resetPlatformApi();
  configurePlatformApi({ getAccessToken: () => 'secret-download-token' });

  const revokedUrls = [];
  let createdSeq = 0;
  URL.createObjectURL = () => {
    createdSeq += 1;
    return `blob:evride-test-${createdSeq}`;
  };
  URL.revokeObjectURL = (url) => {
    revokedUrls.push(url);
  };

  let lastUrl = '';
  let lastAuthHeader = '';

  globalThis.fetch = async (url, init) => {
    lastUrl = String(url);
    lastAuthHeader = new Headers(init.headers).get('authorization') || '';
    if (lastUrl.includes('/files/999/download')) {
      return makeJsonResponse(
        { error: { code: 'NOT_FOUND', message: 'File không tồn tại.' } },
        404
      );
    }
    if (lastUrl.includes('/files/888/download')) {
      return makeJsonResponse(
        { error: { code: 'FORBIDDEN', message: 'Không có quyền truy cập tệp này.' } },
        403
      );
    }
    return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    });
  };

  try {
    // Download using sensitive URL path returned by backend
    const result = await downloadPrivateFileBlob('/api/v1/files/5001/download');
    assert.equal(lastUrl.endsWith('/api/v1/files/5001/download'), true);
    assert.equal(lastUrl.includes('secret-download-token'), false, 'Token must never appear in URL');
    assert.equal(lastAuthHeader, 'Bearer secret-download-token');
    assert.equal(result.objectUrl, 'blob:evride-test-1');
    assert.equal(result.contentType, 'image/jpeg');

    result.revoke();
    assert.deepEqual(revokedUrls, ['blob:evride-test-1']);

    // 404 & 403 errors propagate as ApiError
    await assert.rejects(
      () => downloadPrivateFileBlob('999'),
      (err) => err instanceof ApiError && err.status === 404 && err.code === 'NOT_FOUND'
    );
    await assert.rejects(
      () => downloadPrivateFileBlob('888'),
      (err) => err instanceof ApiError && err.status === 403 && err.code === 'FORBIDDEN'
    );
  } finally {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    resetPlatformApi();
  }
});

test('document submission requires both front and back file_id, supports retry after partial failure, and never treats PENDING as VERIFIED', async () => {
  // 1. Missing back_file_id MUST fail validation (back is mandatory in backend schema)
  const missingBackErrors = validateDocumentSubmissionForm({
    documentType: 'CCCD',
    documentNumber: '079204001234',
    frontFile: { file_id: '5001', status: 'READY' },
    backFile: null,
    birthDate: '2004-05-10',
    expiresOn: '2030-05-10',
  });
  assert.ok(missingBackErrors.back_file_id);
  assert.equal(missingBackErrors.front_file_id, undefined);

  // 2. Eligibility checks: PENDING, expired, under-16, revoked are ALL ineligible; only valid VERIFIED CCCD is eligible
  const refNow = Date.parse('2026-11-25T10:00:00Z'); // 2026-11-25 VN

  const pendingStatus = evaluateCustomerDocumentEligibility(
    [
      {
        id: '1',
        document_type: 'CCCD',
        verified_status: 'PENDING',
        expires_on: '2032-01-01',
        verified_birth_date: '2000-01-01',
        revoked_at: null,
      },
    ],
    refNow
  );
  assert.equal(pendingStatus.eligible, false);
  assert.equal(pendingStatus.tone, 'warning');

  const expiredStatus = evaluateCustomerDocumentEligibility(
    [
      {
        id: '2',
        document_type: 'CCCD',
        verified_status: 'VERIFIED',
        expires_on: '2026-11-24',
        verified_birth_date: '2000-01-01',
        revoked_at: null,
      },
    ],
    refNow
  );
  assert.equal(expiredStatus.eligible, false);
  assert.equal(expiredStatus.tone, 'danger');

  const underageStatus = evaluateCustomerDocumentEligibility(
    [
      {
        id: '3',
        document_type: 'CCCD',
        verified_status: 'VERIFIED',
        expires_on: '2035-01-01',
        verified_birth_date: '2010-11-26', // turns 16 tomorrow!
        revoked_at: null,
      },
    ],
    refNow
  );
  assert.equal(underageStatus.eligible, false);

  const eligibleStatus = evaluateCustomerDocumentEligibility(
    [
      {
        id: '4',
        document_type: 'CCCD',
        verified_status: 'VERIFIED',
        expires_on: '2026-11-25', // valid today
        verified_birth_date: '2010-11-25', // exactly 16 today
        revoked_at: null,
      },
    ],
    refNow
  );
  assert.equal(eligibleStatus.eligible, true);
  assert.equal(eligibleStatus.tone, 'success');

  // 3. Simulate: upload front+back succeeds -> createMyDocument fails -> retry with same file_ids succeeds
  const originalFetch = globalThis.fetch;
  resetPlatformApi();
  configurePlatformApi({ getAccessToken: () => 'customer-token' });

  let docPostAttempt = 0;
  const sentPayloads = [];

  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.endsWith('/users/me/documents') && init.method === 'POST') {
      docPostAttempt += 1;
      sentPayloads.push(JSON.parse(init.body));
      if (docPostAttempt === 1) {
        return makeJsonResponse(
          { error: { code: 'INTERNAL_ERROR', message: 'Lỗi tạm thời khi lưu hồ sơ.' } },
          500
        );
      }
      return makeJsonResponse(
        {
          data: {
            id: '77',
            document_type: 'CCCD',
            document_number_masked: '********1234',
            verified_status: 'PENDING',
            expires_on: '2030-05-10',
          },
          meta: { server_time: '2026-11-25T10:00:00Z' },
        },
        201
      );
    }
    if (target.endsWith('/users/me') && init.method === 'PATCH') {
      const body = JSON.parse(init.body);
      return makeJsonResponse({
        data: { id: '12', name: body.name, email: 'khach@evride.vn', role: 'CUSTOMER', status: 'ACTIVE' },
        meta: { server_time: '2026-11-25T10:00:00Z' },
      });
    }
    if (target.includes('/user-documents/77/sensitive')) {
      return makeJsonResponse({
        data: {
          id: '77',
          document_type: 'CCCD',
          document_number: '079204001234',
          front_download_url: '/api/v1/files/5001/download',
          back_download_url: '/api/v1/files/5002/download',
        },
        meta: { server_time: '2026-11-25T10:00:00Z' },
      });
    }
    return makeJsonResponse({ data: [], meta: { page: 1, page_size: 10, total: 0 } });
  };

  try {
    const payload = buildCreateDocumentPayload({
      documentType: 'CCCD',
      documentNumber: ' 079204001234 ',
      frontFile: { file_id: '5001', status: 'READY' },
      backFile: { file_id: '5002', status: 'READY' },
      birthDate: '2004-05-10',
      expiresOn: '2030-05-10',
    });

    // First submit fails (500) -> must reject, never fake success
    await assert.rejects(
      () => createMyDocument(payload),
      (err) => err instanceof ApiError && err.status === 500
    );

    // Retry reuses the already-uploaded front_file_id & back_file_id and succeeds with PENDING
    const created = await createMyDocument(payload);
    assert.equal(created.data.id, '77');
    assert.equal(created.data.verified_status, 'PENDING');
    assert.deepEqual(sentPayloads[0], sentPayloads[1]);
    assert.equal(sentPayloads[1].front_file_id, '5001');
    assert.equal(sentPayloads[1].back_file_id, '5002');

    // Profile PATCH updates only allowed field (name)
    const updatedProfile = await updateMyProfile({ name: 'Nguyễn Minh Anh' });
    assert.equal(updatedProfile.data.name, 'Nguyễn Minh Anh');

    // Sensitive endpoint returns download URLs without token
    const sensitive = await getDocumentSensitive('77');
    assert.equal(sensitive.data.document_number, '079204001234');
    assert.equal(sensitive.data.front_download_url, '/api/v1/files/5001/download');

    // listMyDocuments hits /users/me/documents
    const docsRes = await listMyDocuments({ page: 1, page_size: 10 });
    assert.deepEqual(docsRes.data, []);
  } finally {
    globalThis.fetch = originalFetch;
    resetPlatformApi();
  }
});
