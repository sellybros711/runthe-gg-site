import os
import http.server
import socketserver

# Serve the project directory regardless of the (possibly invalid) spawn cwd.
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

PORT = 7788


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"Serving {ROOT} at http://127.0.0.1:{PORT}")
    httpd.serve_forever()
