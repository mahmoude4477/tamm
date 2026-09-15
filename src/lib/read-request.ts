/** Share only concurrent GETs. No settled response cache or mutation retries. */
const pending = new Map<string, Promise<Response>>();
export function readRequest(
  url: string,
  options: { signal?: AbortSignal } = {},
): Promise<Response> {
  const { signal } = options;
  if (signal?.aborted)
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  let request = pending.get(url);
  if (!request) {
    request = fetch(url, { cache: "no-store" });
    pending.set(url, request);
    const clear = () => {
      if (pending.get(url) === request) pending.delete(url);
    };
    request.then(clear, clear);
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    request!.then(
      (response) => {
        signal?.removeEventListener("abort", abort);
        if (!signal?.aborted) resolve(response.clone());
      },
      (error) => {
        signal?.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}
