import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { boundedFetch } from "./request";

// Keep existing section props usable while routing live app requests through
// the provider's current token and renewal lifecycle.
export function useAuthenticatedRequest(accessToken) {
    const request = useAuth()?.request;
    const active = useRef(new Set());
    useEffect(() => {
        const requests = active.current;
        return () => requests.forEach(controller => controller.abort());
    }, []);
    return useCallback(async (url, options = {}) => {
        const controller = new AbortController();
        active.current.add(controller);
        const abort = () => controller.abort(options.signal.reason);
        if (options.signal?.aborted) abort();
        else options.signal?.addEventListener("abort", abort, { once: true });
        const cleanup = () => { active.current.delete(controller); options.signal?.removeEventListener("abort", abort); };
        try {
            const response = request
                ? await request(url, { ...options, signal: controller.signal })
                : await boundedFetch(url, { ...options, signal: controller.signal, headers: { ...options.headers, Authorization: `Bearer ${accessToken}` } });
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
    }, [request, accessToken]);
}
