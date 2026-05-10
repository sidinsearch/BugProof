"""
Demo: a Python script that hangs forever waiting on an external service.
This is the classic "works locally, hangs in CI" failure mode.
"""
import socket
import time
import sys


def fetch_status():
    # Connect to a port nothing is listening on, then block on recv().
    # Real-world equivalent: misconfigured upstream URL, dead Redis,
    # missing service-discovery entry, etc.
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(None)  # blocking
    try:
        sock.connect(("127.0.0.1", 65500))
        return sock.recv(4096)
    except (ConnectionRefusedError, OSError):
        # Connection refused is fast — fall back to a sleep loop so the
        # demo reliably times out across all platforms.
        print("upstream unreachable, retrying...", file=sys.stderr)
        while True:
            time.sleep(5)


def main():
    print("starting workload...")
    status = fetch_status()
    print(f"got status: {status}")


if __name__ == "__main__":
    main()
