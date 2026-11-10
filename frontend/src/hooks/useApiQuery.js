import { useCallback, useEffect, useRef, useState } from 'react';

// Gọi một hàm API trả Promise<{data, meta}> và quản lý 3 trạng thái: đang tải / lỗi / có dữ liệu.
// `deps` thay đổi thì tự gọi lại; `reload()` dùng cho nút "Tải lại".
const useApiQuery = (fetcher, deps = []) => {
  const [state, setState] = useState({ data: null, meta: null, loading: true, error: null });
  const latestCall = useRef(0);

  const run = useCallback(() => {
    const callId = latestCall.current + 1;
    latestCall.current = callId;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetcher()
      .then((res) => {
        if (latestCall.current !== callId) return; // bỏ kết quả của request cũ
        setState({ data: res.data, meta: res.meta, loading: false, error: null });
      })
      .catch((error) => {
        if (latestCall.current !== callId) return;
        setState({ data: null, meta: null, loading: false, error });
      });
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { ...state, reload: run };
};

export default useApiQuery;
