from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()


def main():
    server = ThreadingHTTPServer(("0.0.0.0", 8080), Handler)
    print("Focus Trainer XR running at http://localhost:8080")
    server.serve_forever()


if __name__ == "__main__":
    main()
