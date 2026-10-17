# Kiến trúc dự kiến

EVRide là website cho thuê xe điện theo trạm, sử dụng React, FastAPI và PostgreSQL.

```text
Trình duyệt (React)
        |
        | HTTP / JSON
        v
API (FastAPI)
        |
        | Router -> Service -> Repository
        v
PostgreSQL
```

