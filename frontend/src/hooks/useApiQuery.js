import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook gọi API đọc dữ liệu (GET) và quản lý 3 trạng thái: loading, error, data/meta.
 * Tự động hủy request cũ qua AbortController và đối chiếu callId khi đổi bộ lọc hoặc unmount
 * để response cũ không bao giờ ghi đè kết quả mới.
 */
export default function useApiQuery(fetcher, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({
    data: null,
    meta: null,
    pagination: null,
    loading: Boolean(enabled),
    error: null,
  });
  const latestCall = useRef(0);
  const controllerRef = useRef(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;

    if (!enabled) {
      setState({ data: null, meta: null, pagination: null, loading: false, error: null });
      return Promise.resolve(null);
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    controllerRef.current = controller;

    const callId = latestCall.current + 1;
    latestCall.current = callId;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    return Promise.resolve()
      .then(() => fetcherRef.current({ signal: controller?.signal }))
      .then((res) => {
        if (latestCall.current !== callId) return null;
        setState({
          data: res?.data ?? null,
          meta: res?.meta ?? null,
          pagination: res?.pagination ?? null,
          loading: false,
          error: null,
        });
        return res;
      })
      .catch((error) => {
        if (latestCall.current !== callId) return null;
        setState({ data: null, meta: null, pagination: null, loading: false, error });
        return null;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    run();
    return () => {
      latestCall.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [run]);

  return { ...state, reload: run };
}
