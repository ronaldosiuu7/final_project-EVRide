import React, { useEffect, useState } from 'react';
import {
  Button,
  DataTable,
  ErrorState,
  LoadingState,
  StatusBadge,
  TextField,
  useToast,
} from '../../components/ui';
import GpsRouteMap from '../../components/maps/GpsRouteMap.jsx';
import useApiQuery from '../../hooks/useApiQuery';
import useIdempotentMutation from '../../hooks/useIdempotentMutation';
import {
  getLatestRentalGps,
  listRentalGpsHistory,
  postDemoRentalGps,
} from '../../services/rentalsApi';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { formatDateTimeVN, nowLocalInput, toIsoWithVietnamOffset } from '../../utils/format';

export default function RentalGpsPanel({ rental, pickupStation = null, returnStation = null }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [selectedPointId, setSelectedPointId] = useState(null);
  const [latitude, setLatitude] = useState('21.028500');
  const [longitude, setLongitude] = useState('105.854200');
  const [recordedAt, setRecordedAt] = useState(nowLocalInput());
  const [coordError, setCoordError] = useState('');

  useEffect(() => {
    setPage(1);
    setSelectedPointId(null);
    setCoordError('');
    setRecordedAt(nowLocalInput());
  }, [rental.id]);

  const latestQuery = useApiQuery(() => getLatestRentalGps(rental.id), [rental.id]);
  const historyQuery = useApiQuery(
    () => listRentalGpsHistory(rental.id, { page, page_size: 20 }),
    [rental.id, page]
  );

  const gpsMutation = useIdempotentMutation(({ payload, idempotencyKey }) =>
    postDemoRentalGps(rental.id, payload, idempotencyKey)
  );

  const handlePostDemoGps = async (event) => {
    event.preventDefault();
    const latNum = Number(latitude);
    const lngNum = Number(longitude);
    if (String(latitude).trim() === '' || Number.isNaN(latNum) || latNum < -90 || latNum > 90) {
      setCoordError('Vĩ độ (latitude) phải là số từ -90 đến 90.');
      return;
    }
    if (String(longitude).trim() === '' || Number.isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      setCoordError('Kinh độ (longitude) phải là số từ -180 đến 180.');
      return;
    }
    const recordedIso = toIsoWithVietnamOffset(recordedAt);
    if (!recordedIso) {
      setCoordError('Thời điểm ghi nhận GPS không hợp lệ.');
      return;
    }
    setCoordError('');
    try {
      await gpsMutation.execute(`gps_${rental.id}`, {
        latitude: latNum.toFixed(6),
        longitude: lngNum.toFixed(6),
        recorded_at: recordedIso,
      });
      toast.success('Đã ghi nhận tọa độ GPS.');
      latestQuery.reload();
      historyQuery.reload();
    } catch {
      // Lỗi hiển thị bên dưới form (bao gồm 503 FEATURE_NOT_ENABLED nếu server tắt demo GPS).
    }
  };

  const columns = [
    { key: 'id', header: 'Mã điểm', render: (p) => `#${p.id}` },
    { key: 'latitude', header: 'Vĩ độ' },
    { key: 'longitude', header: 'Kinh độ' },
    {
      key: 'recorded_at',
      header: 'Thời điểm ghi nhận (giờ VN)',
      render: (p) => formatDateTimeVN(p.recorded_at, { withSeconds: true }),
    },
    {
      key: 'focus',
      header: 'Bản đồ',
      render: (p) => (
        <Button
          size="sm"
          variant={String(selectedPointId) === String(p.id) ? 'primary' : 'ghost'}
          onClick={() => setSelectedPointId(String(p.id))}
        >
          {String(selectedPointId) === String(p.id) ? 'Đang xem' : 'Định vị'}
        </Button>
      ),
    },
  ];

  const latest = latestQuery.data;
  const historyRows = historyQuery.data || [];

  return (
    <div className="stack-md">
      <GpsRouteMap
        latestPoint={latest?.point || null}
        isStale={Boolean(latest?.is_stale)}
        historyPoints={historyRows}
        pickupStation={pickupStation}
        returnStation={returnStation}
        selectedPointId={selectedPointId}
        onSelectPoint={(pt) => setSelectedPointId(String(pt.id))}
      />

      <div className="card stack-sm">
        <div className="card-header">
          <h3>Vị trí GPS gần nhất</h3>
          {latest && (
            <StatusBadge
              label={latest.is_stale ? `Dữ liệu cũ (> ${latest.stale_after_seconds}s)` : 'Dữ liệu mới'}
              tone={latest.is_stale ? 'warning' : 'success'}
            />
          )}
        </div>

        {latestQuery.loading && <LoadingState message="Đang tải GPS gần nhất..." />}
        {latestQuery.error && <ErrorState error={latestQuery.error} onRetry={latestQuery.reload} />}
        {!latestQuery.loading && !latestQuery.error && latest && (
          <>
            {latest.is_stale && (
              <div className="alert alert-warning">
                Cảnh báo: Không có tín hiệu mới trong {latest.stale_after_seconds} giây qua (hoặc chưa có điểm GPS). Không coi vị trí cũ là vị trí hiện tại của xe.
              </div>
            )}
            {latest.point ? (
              <dl className="detail-grid">
                <div className="detail-item">
                  <dt>Tọa độ gần nhất</dt>
                  <dd>
                    {latest.point.latitude}, {latest.point.longitude}
                  </dd>
                </div>
                <div className="detail-item">
                  <dt>Thời điểm cập nhật</dt>
                  <dd>{formatDateTimeVN(latest.point.recorded_at, { withSeconds: true })}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted">Chuyến thuê chưa có tọa độ GPS nào được ghi nhận.</p>
            )}
          </>
        )}
      </div>

      {rental.status === 'IN_RENT' && (
        <div className="card stack-md">
          <h4>Cập nhật tọa độ GPS thủ công</h4>
          <form onSubmit={handlePostDemoGps} className="row-wrap">
            <TextField
              label="Vĩ độ"
              type="number"
              step="0.000001"
              min={-90}
              max={90}
              required
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
            <TextField
              label="Kinh độ"
              type="number"
              step="0.000001"
              min={-180}
              max={180}
              required
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
            <TextField
              label="Thời điểm (giờ VN)"
              type="datetime-local"
              required
              value={recordedAt}
              onChange={(e) => setRecordedAt(e.target.value)}
            />
            <Button type="submit" variant="secondary" loading={gpsMutation.loading}>
              Ghi nhận tọa độ GPS
            </Button>
          </form>
          {(coordError || gpsMutation.error) && (
            <div className="alert alert-danger" role="alert">
              {coordError || getApiErrorMessage(gpsMutation.error)}
            </div>
          )}
        </div>
      )}

      <div>
        <h4>Lịch sử tọa độ GPS</h4>
        <DataTable
          columns={columns}
          rows={historyRows}
          loading={historyQuery.loading}
          error={historyQuery.error}
          onRetry={historyQuery.reload}
          meta={historyQuery.meta}
          onPageChange={setPage}
          emptyTitle="Chưa có lịch sử GPS"
        />
      </div>
    </div>
  );
}
