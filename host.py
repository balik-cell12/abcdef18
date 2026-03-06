import http.server
import socketserver
# http://localhost:8170/index.html
PORT = 8170

Handler = http.server.SimpleHTTPRequestHandler

try:
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"server ({PORT})")
        httpd.serve_forever()
except OSError as e:
    print(f"{e}")