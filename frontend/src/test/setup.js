import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

Object.defineProperty(globalThis.navigator, "locks", {
    configurable: true,
    value: {
        request: (_name, callback) => callback(),
    },
});

afterEach(() => {
    cleanup();
    localStorage.clear();
});