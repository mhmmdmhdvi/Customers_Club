export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

// Keep the deadline attached while consumers read the response body.
export async function boundedFetch(url, { timeoutMs = 15000, signal, ...options } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException("Request deadline exceeded", "TimeoutError")), timeoutMs);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
    try {
        controller.signal.throwIfAborted();
        const response = await fetch(url.startsWith("/") ? `${API_BASE_URL}${url}` : url, { ...options, signal: controller.signal });
        if (!response.body || response.status === 204) cleanup();
        else {
            for (const method of ["json", "text", "blob", "arrayBuffer", "formData"]) {
                const read = response[method].bind(response);
                response[method] = async (...args) => { try { return await read(...args); } finally { cleanup(); } };
            }
            const cancel = response.body.cancel.bind(response.body);
            response.body.cancel = async (...args) => { try { return await cancel(...args); } finally { cleanup(); } };
        }
        return response;
    } catch (error) { cleanup(); throw error; }
}
