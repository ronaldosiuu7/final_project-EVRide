// Tải Leaflet theo cơ chế lazy-import trên trình duyệt để tránh tăng dung lượng bundle ban đầu
// và bảo đảm an toàn khi render trong môi trường kiểm thử không có DOM/window.
let leafletPromise = null;

export function loadLeaflet() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  if (!leafletPromise) {
    leafletPromise = import('leaflet').then((mod) => mod.default || mod);
  }
  return leafletPromise;
}
