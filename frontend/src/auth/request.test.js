import { afterEach, expect, test, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

test("same-site API requests add /api exactly once", async () => {
 vi.stubEnv("VITE_API_BASE_URL", "/api"); vi.resetModules();
 const fetch = vi.fn().mockResolvedValue({ status: 204 }); vi.stubGlobal("fetch",fetch);
 const { boundedFetch } = await import("./request");
 await boundedFetch("/auth/me"); await boundedFetch("/api/auth/me");
 expect(fetch.mock.calls.map(([url])=>url)).toEqual(["/api/auth/me","/api/auth/me"]);
});

test("same-site logout clears its coordination block with a relative base", async () => {
 vi.stubEnv("VITE_API_BASE_URL","/api");vi.resetModules();
 vi.stubGlobal("navigator",{locks:{request:(_name,_options,callback)=>callback()}});
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({status:204,ok:true}));
 localStorage.setItem("club-auth-refresh-blocked","1");
 const { credentialRequest } = await import("./refreshSession");
 await credentialRequest("/api/auth/logout",{method:"POST"});
 expect(localStorage.getItem("club-auth-refresh-blocked")).toBeNull();
 expect(fetch.mock.calls[0][0]).toBe("/api/auth/logout");
});
