import { useEffect, useState } from 'react';

/**
 * Trì hoãn cập nhật giá trị tìm kiếm (mặc định 300ms) để tránh gọi API trên mỗi phím gõ.
 * Khi giá trị bị xóa về rỗng (ví dụ bấm "Xóa lọc"), cập nhật ngay lập tức.
 */
export default function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (value === '' || value === null || value === undefined || delayMs <= 0) {
      setDebounced(value);
      return undefined;
    }
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
