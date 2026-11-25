import { useCallback, useRef, useState } from 'react';
import { createIdempotencyTracker } from '../utils/validation.js';

/**
 * Hook dùng chung cho các thao tác ghi cần Idempotency-Key:
 * - Mỗi thao tác nghiệp vụ mới sinh key ngẫu nhiên mới.
 * - Chặn gửi trùng khi người dùng bấm liên tiếp trong lúc request đang bay (in-flight).
 * - Nếu gặp lỗi chưa rõ kết quả (timeout, mất mạng, 409 đang xử lý, 5xx) và người dùng bấm thử lại
 *   với cùng nội dung -> giữ nguyên Idempotency-Key cũ.
 * - Khi thành công hoặc gặp lỗi nghiệp vụ/validation đã xác định -> xóa key để lần thao tác mới sinh key mới.
 */
export default function useIdempotentMutation(mutationFn) {
  const trackerRef = useRef(null);
  if (!trackerRef.current) {
    trackerRef.current = createIdempotencyTracker();
  }
  const inFlightRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastKey, setLastKey] = useState(null);

  const resetKey = useCallback(() => {
    trackerRef.current?.reset();
    setLastKey(null);
  }, []);

  const execute = useCallback(
    async (actionKey, payload) => {
      const { key: idempotencyKey, fingerprint } = trackerRef.current.begin(actionKey, payload);

      // Nếu cùng thao tác và cùng dữ liệu đang chạy dở, trả về luôn promise hiện tại thay vì bắn request trùng.
      if (
        inFlightRef.current &&
        inFlightRef.current.idempotencyKey === idempotencyKey &&
        inFlightRef.current.fingerprint === fingerprint
      ) {
        return inFlightRef.current.promise;
      }

      setLastKey(idempotencyKey);
      setLoading(true);
      setError(null);

      const promise = (async () => {
        try {
          const result = await mutationFn({ payload, idempotencyKey });
          trackerRef.current.succeed();
          setLoading(false);
          return result;
        } catch (err) {
          const keptForRetry = trackerRef.current.fail(err);
          if (!keptForRetry) {
            setLastKey(null);
          }
          setError(err);
          setLoading(false);
          throw err;
        } finally {
          if (inFlightRef.current?.promise === promise) {
            inFlightRef.current = null;
          }
        }
      })();

      inFlightRef.current = { idempotencyKey, fingerprint, promise };
      return promise;
    },
    [mutationFn]
  );

  return { execute, loading, error, lastKey, resetKey, clearError: () => setError(null) };
}
