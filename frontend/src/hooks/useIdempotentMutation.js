import { useCallback, useRef, useState } from 'react';
import { resolveIdempotencyKey } from '../utils/validation';

/**
 * Hook cho mọi thao tác ghi cần Idempotency-Key:
 * - Nếu thử lại (retry) cùng actionKey và cùng payload -> tự dùng lại đúng Idempotency-Key cũ,
 *   tránh thu tiền / tạo phiếu / bàn giao trùng lặp khi timeout.
 * - Khi thành công -> xóa key đã giữ để thao tác tiếp theo tạo key mới.
 */
export default function useIdempotentMutation(mutationFn) {
  const keyStateRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastKey, setLastKey] = useState(null);

  const resetKey = useCallback(() => {
    keyStateRef.current = null;
    setLastKey(null);
  }, []);

  const execute = useCallback(
    async (actionKey, payload) => {
      const idempotencyKey = resolveIdempotencyKey(keyStateRef, actionKey, payload);
      setLastKey(idempotencyKey);
      setLoading(true);
      setError(null);
      try {
        const result = await mutationFn({ payload, idempotencyKey });
        keyStateRef.current = null;
        setLoading(false);
        return result;
      } catch (err) {
        setError(err);
        setLoading(false);
        throw err;
      }
    },
    [mutationFn]
  );

  return { execute, loading, error, lastKey, resetKey, clearError: () => setError(null) };
}
