"""Connection-reusing HTTP GET (one requests.Session per thread). Drop-in for gmaps/crawl.py's curl-based get()."""
import threading, requests
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
_tl = threading.local()


def get(url, timeout=30):
    s = getattr(_tl, 's', None)
    if s is None:
        s = _tl.s = requests.Session()
        s.headers.update({'User-Agent': UA, 'Accept-Language': 'en-US,en'})
    try:
        return s.get(url, timeout=timeout).text
    except Exception:
        _tl.s = None
        return ''
