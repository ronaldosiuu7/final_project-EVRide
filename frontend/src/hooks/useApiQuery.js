import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook gọi API đọc dữ liệu (GET) và quản lý 3 trạng thái: loading, error, data/meta.
 * Bỏ qua phản hồi của các request cũ hơn để tránh race condition khi đổi bộ lọc nhanh.
 */
export default function useApiQuery(fetcher, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({
    data: null,
    meta: null,
    loading: Boolean(enabled),
    error: null,
  });
  const latestCall = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(() => {
    if (!enabled) {
      setState({ data: null, meta: null, loading: false, error: null });
      return Promise.resolve(null);
    }
    const callId = latestCall.current + 1;
    latestCall.current = callId;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    return fetcherRef
      .current()
      .then((res) => {
        if (latestCall.current !== callId) return null;
        setState({
          data: res?.data ?? null,
          meta: res?.meta ?? null,
          loading: false,
          error: null,
        });
        return res;
      })
      .catch((error) => {
        if (latestCall.current !== callId) return null;
        setState({ data: null, meta: null, loading: false, error });
        return null;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    run();
    return () => {
      latestCall.current += 1;
    };
  }, [run]);

  return { ...state, reload: run };
}
