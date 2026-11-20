import json


class BodyLimitMiddleware:
    """ASGI murni: tolak 413 bila `Content-Length` melebihi batas, sebelum body dibaca.
    Body tanpa Content-Length (chunked) ditangani `pdf.upload.save_upload`."""

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["method"] in ("POST", "PUT", "PATCH"):
            raw = dict(scope["headers"]).get(b"content-length")
            if raw and raw.isdigit() and int(raw) > self.max_bytes:
                body = json.dumps({"detail": "Ukuran request terlalu besar"}).encode()
                await send({
                    "type": "http.response.start",
                    "status": 413,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode()),
                        (b"connection", b"close"),
                    ],
                })
                await send({"type": "http.response.body", "body": body})
                return
        await self.app(scope, receive, send)
