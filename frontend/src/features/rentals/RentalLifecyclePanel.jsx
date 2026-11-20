import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  ConfirmDialog,
  SelectField,
  TextField,
  TextareaField,
  useToast,
} from '../../components/ui';
import useIdempotentMutation from '../../hooks/useIdempotentMutation';
import {
  cancelOperationalRental,
  createReturnQuote,
  initiateReturn,
  pickupRental,
  settleReturn,
} from '../../services/rentalsApi';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { formatDateTimeVN, formatDurationSeconds, formatVnd } from '../../utils/format';

export default function RentalLifecyclePanel({ rental, stations = [], onUpdated }) {
  const toast = useToast();
  const activeStations = stations.filter((s) => s.status === 'ACTIVE');

  // --- RESERVED: Pickup ---
  const [pickupStationId, setPickupStationId] = useState(rental.pickup_station_id || '');
  const [pickupBattery, setPickupBattery] = useState('85');
  const [pickupNote, setPickupNote] = useState('');
  const [pickupConfirm, setPickupConfirm] = useState(false);

  // --- RESERVED: Operational Cancel ---
  const [cancelReason, setCancelReason] = useState('VEHICLE_FAULT');
  const [cancelNote, setCancelNote] = useState('');
  const [cancelConfirm, setCancelConfirm] = useState(false);

  // --- IN_RENT: Initiate Return ---
  const [returnStationId, setReturnStationId] = useState(
    rental.actual_return_station_id || rental.pickup_station_id || activeStations[0]?.id || ''
  );
  const [returnBattery, setReturnBattery] = useState('70');
  const [vehicleCondition, setVehicleCondition] = useState('OK');
  const [returnNote, setReturnNote] = useState('');
  const [initiateConfirm, setInitiateConfirm] = useState(false);

  // --- RETURN_PENDING: Quote & Settle ---
  const [promoCode, setPromoCode] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState(null);
  const [quote, setQuote] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [settleConfirm, setSettleConfirm] = useState(false);

  useEffect(() => {
    setPickupStationId(rental.pickup_station_id || '');
    setPickupBattery('85');
    setPickupNote('');
    setPickupConfirm(false);
    setCancelReason('VEHICLE_FAULT');
    setCancelNote('');
    setCancelConfirm(false);
    setReturnStationId(
      rental.actual_return_station_id || rental.pickup_station_id || activeStations[0]?.id || ''
    );
    setReturnBattery('70');
    setVehicleCondition('OK');
    setReturnNote('');
    setInitiateConfirm(false);
    setPromoCode('');
    setQuote(null);
    setQuoteError(null);
    setSettleConfirm(false);
  }, [rental.id, rental.status, rental.pickup_station_id, rental.actual_return_station_id]);

  useEffect(() => {
    if (!quote?.quote_expires_at) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [quote?.quote_expires_at]);

  const pickupMutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    pickupRental(rental.id, payload, idempotencyKey)
  );
  const cancelMutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    cancelOperationalRental(rental.id, payload, idempotencyKey)
  );
  const initiateMutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    initiateReturn(rental.id, payload, idempotencyKey)
  );
  const settleMutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    settleReturn(rental.id, payload, idempotencyKey)
  );

  const handlePickup = async () => {
    setPickupConfirm(false);
    try {
      await pickupMutation.execute(`pickup_${rental.id}`, {
        station_id: String(pickupStationId),
        battery_percent: Number(pickupBattery),
        note: pickupNote.trim() || null,
      });
      toast.success(`Đã bàn giao nhận xe cho chuyến #${rental.id} (thu cọc thành công).`);
      onUpdated();
    } catch {
      // Hiển thị lỗi bên dưới form; retry giữ nguyên Idempotency-Key.
    }
  };

  const handleOpCancel = async () => {
    setCancelConfirm(false);
    try {
      await cancelMutation.execute(`op_cancel_${rental.id}`, {
        reason: cancelReason,
        note: cancelNote.trim(),
      });
      toast.success(`Đã hủy chuyến #${rental.id} và miễn trừ hạn mức 3 lần/ngày cho khách.`);
      onUpdated();
    } catch {
      // Hiển thị lỗi ngay tại form.
    }
  };

  const handleInitiateReturn = async () => {
    setInitiateConfirm(false);
    try {
      await initiateMutation.execute(`initiate_return_${rental.id}`, {
        return_station_id: String(returnStationId),
        battery_percent: Number(returnBattery),
        vehicle_condition: vehicleCondition,
        note: returnNote.trim() || null,
      });
      toast.success(
        `Đã tiếp nhận xe tại trạm và đóng băng cước (RETURN_PENDING) cho chuyến #${rental.id}.`
      );
      onUpdated();
    } catch {
      // Hiển thị lỗi ngay tại form.
    }
  };

  const handleCreateQuote = async (event) => {
    event?.preventDefault();
    setQuoteLoading(true);
    setQuoteError(null);
    settleMutation.resetKey();
    try {
      const stationForQuote = rental.actual_return_station_id || returnStationId;
      const body = { return_station_id: String(stationForQuote) };
      if (promoCode.trim()) {
        body.promotion_code = promoCode.trim().toUpperCase();
      }
      const res = await createReturnQuote(rental.id, body);
      setQuote(res.data);
      toast.info('Đã tạo báo giá trả xe có hiệu lực trong 10 phút.');
    } catch (err) {
      setQuoteError(err);
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleSettle = async () => {
    setSettleConfirm(false);
    if (!quote?.quote_token) return;
    try {
      // Khóa actionKey theo quote_token để khi retry luôn gửi cùng Idempotency-Key và không thu tiền hai lần.
      await settleMutation.execute(`settle_${rental.id}_${quote.quote_token}`, {
        quote_token: quote.quote_token,
      });
      toast.success(`Đã quyết toán xong chuyến #${rental.id} và phát hành hóa đơn PAID.`);
      onUpdated();
    } catch {
      // Khi lỗi (ví dụ INSUFFICIENT_BALANCE, WALLET_UNAVAILABLE, STALE_QUOTE), RETURN_PENDING vẫn được giữ nguyên.
    }
  };

  if (rental.status === 'RESERVED') {
    return (
      <div className="grid-2">
        <div className="card stack-md">
          <h3>Bàn giao nhận xe (Pickup)</h3>
          <p className="muted">
            Kiểm tra hồ sơ khách đủ 16 tuổi &amp; CCCD VERIFIED, pin xe &ge; 30%, số dư ví đủ cọc + block 30p đầu và trong hạn giữ chỗ ({formatDateTimeVN(rental.expires_at)}).
          </p>
          <SelectField
            label="Trạm bàn giao (khớp trạm đã giữ)"
            required
            value={pickupStationId}
            options={activeStations.map((s) => ({
              value: s.id,
              label: `#${s.id} - ${s.name}`,
            }))}
            onChange={(e) => setPickupStationId(e.target.value)}
          />
          <TextField
            label="Pin thực tế khi giao (%)"
            type="number"
            min={0}
            max={100}
            step={1}
            required
            value={pickupBattery}
            onChange={(e) => setPickupBattery(e.target.value)}
          />
          <TextareaField
            label="Ghi chú bàn giao (tùy chọn)"
            rows={2}
            maxLength={2000}
            value={pickupNote}
            onChange={(e) => setPickupNote(e.target.value)}
          />
          {pickupMutation.error && (
            <div className="alert alert-danger" role="alert">
              {getApiErrorMessage(pickupMutation.error)}
            </div>
          )}
          <Button
            variant="primary"
            loading={pickupMutation.loading}
            onClick={() => setPickupConfirm(true)}
          >
            Xác nhận bàn giao &amp; Thu cọc
          </Button>
          <ConfirmDialog
            open={pickupConfirm}
            title="Xác nhận bàn giao xe (Pickup)"
            message={`Chuyển chuyến #${rental.id} sang IN_RENT và thu tiền cọc ${formatVnd(rental.deposit_amount_snapshot)} từ ví khách?`}
            confirmLabel="Xác nhận pickup"
            variant="primary"
            loading={pickupMutation.loading}
            onCancel={() => setPickupConfirm(false)}
            onConfirm={handlePickup}
          />
        </div>

        <div className="card stack-md">
          <h3>Hủy vận hành có miễn trừ hạn mức</h3>
          <p className="muted">
            Chỉ STAFF/MANAGER được phép hủy do lỗi xe hoặc lỗi hệ thống để không tính vào giới hạn 3 lần hủy/ngày của khách.
          </p>
          <SelectField
            label="Lý do hủy vận hành"
            required
            value={cancelReason}
            options={[
              { value: 'VEHICLE_FAULT', label: 'Lỗi xe (VEHICLE_FAULT)' },
              { value: 'SYSTEM_ERROR', label: 'Lỗi hệ thống (SYSTEM_ERROR)' },
            ]}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <TextareaField
            label="Ghi chú chi tiết (bắt buộc)"
            rows={2}
            required
            maxLength={2000}
            placeholder="Mô tả lỗi xe hoặc sự cố hệ thống trước khi giao..."
            value={cancelNote}
            onChange={(e) => setCancelNote(e.target.value)}
          />
          {cancelMutation.error && (
            <div className="alert alert-danger" role="alert">
              {getApiErrorMessage(cancelMutation.error)}
            </div>
          )}
          <Button
            variant="danger"
            disabled={!cancelNote.trim()}
            loading={cancelMutation.loading}
            onClick={() => setCancelConfirm(true)}
          >
            Hủy vận hành (Miễn hạn mức)
          </Button>
          <ConfirmDialog
            open={cancelConfirm}
            title="Xác nhận hủy vận hành"
            message={`Hủy lượt giữ #${rental.id} với lý do ${cancelReason} và miễn hạn mức cho khách?`}
            confirmLabel="Xác nhận hủy"
            loading={cancelMutation.loading}
            onCancel={() => setCancelConfirm(false)}
            onConfirm={handleOpCancel}
          />
        </div>
      </div>
    );
  }

  if (rental.status === 'IN_RENT') {
    return (
      <div className="card stack-md">
        <div className="card-header">
          <h3>Tiếp nhận trả xe thực tế tại trạm (Initiate Return)</h3>
          <div className="page-header-actions">
            <Link to={`/admin/tickets?rental_id=${rental.id}`} className="btn btn-sm">
              Ticket của chuyến
            </Link>
            <Link to={`/admin/incidents?rental_id=${rental.id}`} className="btn btn-sm btn-danger">
              Tiếp nhận nghi mất / sự cố
            </Link>
          </div>
        </div>

        <div className="alert alert-info">
          Giai đoạn 1 (Tiếp nhận xe): chỉ bấm xác nhận sau khi xe thực tế đã có mặt tại trạm và được nhân viên giữ. Hệ thống sẽ đóng băng mốc <code>return_initiated_at</code>, đặt <code>actual_end_time</code> và tách riêng khỏi bước thanh toán.
        </div>

        <div className="grid-2">
          <SelectField
            label="Trạm tiếp nhận trả xe (ACTIVE còn chỗ)"
            required
            value={returnStationId}
            options={activeStations.map((s) => ({
              value: s.id,
              label: `#${s.id} - ${s.name} (Trống ${s.available_spaces}/${s.capacity})`,
            }))}
            onChange={(e) => setReturnStationId(e.target.value)}
          />
          <TextField
            label="Pin khi trả (%)"
            type="number"
            min={0}
            max={100}
            step={1}
            required
            value={returnBattery}
            onChange={(e) => setReturnBattery(e.target.value)}
          />
          <SelectField
            label="Tình trạng xe thực tế"
            required
            value={vehicleCondition}
            options={[
              { value: 'OK', label: 'Bình thường (OK)' },
              { value: 'NEEDS_MAINTENANCE', label: 'Cần bảo trì (NEEDS_MAINTENANCE)' },
            ]}
            onChange={(e) => setVehicleCondition(e.target.value)}
          />
        </div>

        <TextareaField
          label="Ghi chú biên bản trả xe (tùy chọn)"
          rows={2}
          maxLength={2000}
          value={returnNote}
          onChange={(e) => setReturnNote(e.target.value)}
        />

        {initiateMutation.error && (
          <div className="alert alert-danger" role="alert">
            {getApiErrorMessage(initiateMutation.error)}
          </div>
        )}

        <div className="row-wrap">
          <Button
            variant="primary"
            disabled={!returnStationId}
            loading={initiateMutation.loading}
            onClick={() => setInitiateConfirm(true)}
          >
            Tiếp nhận xe &amp; Chuyển RETURN_PENDING
          </Button>
        </div>

        <ConfirmDialog
          open={initiateConfirm}
          title="Xác nhận tiếp nhận trả xe"
          message={`Xác nhận xe của chuyến #${rental.id} đã thực tế về trạm #${returnStationId} (tình trạng: ${vehicleCondition}) và đóng băng cước?`}
          confirmLabel="Tiếp nhận trả xe"
          variant="primary"
          loading={initiateMutation.loading}
          onCancel={() => setInitiateConfirm(false)}
          onConfirm={handleInitiateReturn}
        />
      </div>
    );
  }

  if (rental.status === 'RETURN_PENDING') {
    const quoteRemainingSec = quote?.quote_expires_at
      ? Math.max(0, Math.floor((new Date(quote.quote_expires_at).getTime() - nowMs) / 1000))
      : 0;
    const isQuoteExpired = Boolean(quote && quoteRemainingSec <= 0);

    return (
      <div className="card stack-md">
        <div className="card-header">
          <h3>Giai đoạn 2: Báo giá 10 phút &amp; Quyết toán trả xe (RETURN_PENDING)</h3>
          <span className="muted">
            Mốc dừng cước bất biến: <strong>{formatDateTimeVN(rental.return_initiated_at, { withSeconds: true })}</strong>
          </span>
        </div>

        <div className="alert alert-info">
          Xe đã được tiếp nhận tại trạm #{rental.actual_return_station_id}. Nếu bước thanh toán lỗi (ví thiếu tiền / ví bị khóa / hết hạn báo giá), kết quả tiếp nhận xe <code>RETURN_PENDING</code> vẫn được bảo toàn; bạn có thể tạo lại báo giá hoặc bấm quyết toán lại cùng Idempotency-Key mà không bị thu tiền hai lần.
        </div>

        <form onSubmit={handleCreateQuote} className="row-wrap">
          <TextField
            label="Mã khuyến mãi (tùy chọn)"
            placeholder="VD: EVRIDE10"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
          />
          <Button type="submit" variant="secondary" loading={quoteLoading}>
            {quote ? 'Tạo báo giá mới' : 'Tạo báo giá 10 phút'}
          </Button>
        </form>

        {quoteError && (
          <div className="alert alert-danger" role="alert">
            {getApiErrorMessage(quoteError)}
          </div>
        )}

        {quote && (
          <div className="card stack-md" style={{ background: '#f9fafb' }}>
            <div className="card-header">
              <h4>Chi tiết báo giá #{quote.id}</h4>
              <span className={isQuoteExpired ? 'battery-low' : 'muted'}>
                {isQuoteExpired
                  ? 'Báo giá đã hết hạn — vui lòng tạo báo giá mới'
                  : `Còn hiệu lực: ${formatDurationSeconds(quoteRemainingSec)} (đến ${formatDateTimeVN(quote.quote_expires_at, { withSeconds: true })})`}
              </span>
            </div>

            <dl className="detail-grid">
              <div className="detail-item">
                <dt>Thời gian tính cước</dt>
                <dd>{formatDurationSeconds(quote.elapsed_seconds)}</dd>
              </div>
              <div className="detail-item">
                <dt>Tiền thuê gốc</dt>
                <dd>{formatVnd(quote.rental_fee)}</dd>
              </div>
              <div className="detail-item">
                <dt>Giảm giá ({quote.promotion_code || 'Không áp dụng'})</dt>
                <dd>- {formatVnd(quote.discount_amount)}</dd>
              </div>
              <div className="detail-item">
                <dt>Tổng tiền phải thanh toán</dt>
                <dd>
                  <strong>{formatVnd(quote.total_amount)}</strong>
                </dd>
              </div>
              <div className="detail-item">
                <dt>Cọc đang giữ</dt>
                <dd>{formatVnd(quote.deposit_held)}</dd>
              </div>
              <div className="detail-item">
                <dt>Cọc cấn trừ vào tiền thuê</dt>
                <dd>{formatVnd(quote.deposit_applied)}</dd>
              </div>
              <div className="detail-item">
                <dt>Thu thêm từ ví khách</dt>
                <dd>
                  <strong>{formatVnd(quote.additional_payment)}</strong>
                </dd>
              </div>
              <div className="detail-item">
                <dt>Hoàn cọc dư về ví khách</dt>
                <dd>
                  <strong>{formatVnd(quote.deposit_refund)}</strong>
                </dd>
              </div>
            </dl>

            {settleMutation.error && (
              <div className="alert alert-danger stack-sm" role="alert">
                <div>
                  <strong>Quyết toán chưa hoàn tất:</strong> {getApiErrorMessage(settleMutation.error)}
                </div>
                <div className="muted">
                  Trạng thái tiếp nhận xe (<code>RETURN_PENDING</code>) vẫn được giữ nguyên. Nếu lỗi do timeout, bấm &ldquo;Quyết toán &amp; Hoàn tất chuyến&rdquo; lần nữa sẽ dùng lại cùng Idempotency-Key (<code>{settleMutation.lastKey}</code>) để không thu trùng.
                </div>
              </div>
            )}

            <div className="row-wrap">
              <Button
                variant="primary"
                disabled={isQuoteExpired}
                loading={settleMutation.loading}
                onClick={() => setSettleConfirm(true)}
              >
                Quyết toán &amp; Hoàn tất chuyến
              </Button>
              {isQuoteExpired && (
                <Button variant="secondary" loading={quoteLoading} onClick={handleCreateQuote}>
                  Tạo báo giá 10 phút mới
                </Button>
              )}
            </div>
          </div>
        )}

        <ConfirmDialog
          open={settleConfirm}
          title="Xác nhận quyết toán trả xe"
          message={`Xác nhận quyết toán chuyến #${rental.id}: tổng tiền ${formatVnd(quote?.total_amount)}, cấn cọc ${formatVnd(quote?.deposit_applied)}, thu thêm ví ${formatVnd(quote?.additional_payment)}, hoàn dư ${formatVnd(quote?.deposit_refund)}?`}
          confirmLabel="Xác nhận quyết toán"
          variant="primary"
          loading={settleMutation.loading}
          onCancel={() => setSettleConfirm(false)}
          onConfirm={handleSettle}
        />
      </div>
    );
  }

  return null;
}
