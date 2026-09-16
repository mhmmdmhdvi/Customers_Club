const test = require("node:test");
const assert = require("node:assert/strict");

const { getSender } = require("../src/services/otp-delivery");

test("getSender returns a FarazSMS sender when provider config is valid", () => {
    const sender = getSender(
        {
            FARAZSMS_API_KEY: "test-api-key",
            FARAZSMS_LINE_NUMBER: "50002178584000",
            FARAZSMS_PATTERN_CODE: "test-pattern-code",
        },
        async () => {
            throw new Error("fetch must not run while creating the sender");
        },
    );

    assert.equal(typeof sender, "function");
});

test("sender posts the OTP to FarazSMS using the configured pattern", async () => {
    const calls = [];

    const sender = getSender(
        {
            FARAZSMS_API_KEY: "test-api-key",
            FARAZSMS_LINE_NUMBER: "50002178584000",
            FARAZSMS_PATTERN_CODE: "test-pattern-code",
        },
        async (...args) => {
            calls.push(args);

            return {
                ok: true,
                status: 201,
            };
        },
    );

    const controller = new AbortController();

    await sender({
        phone: "09121234567",
        code: "123456",
        expiresAt: new Date("2026-09-16T12:00:00Z"),
        signal: controller.signal,
    });

    assert.equal(calls.length, 1);

    const [url, options] = calls[0];

    assert.equal(
        url,
        "https://api.iranpayamak.com/ws/v1/sms/pattern",
    );

    assert.equal(options.method, "POST");
    assert.equal(options.signal, controller.signal);

    assert.deepEqual(options.headers, {
        Accept: "application/json",
        "Api-Key": "test-api-key",
        "Content-Type": "application/json",
    });

    assert.deepEqual(JSON.parse(options.body), {
        code: "test-pattern-code",
        attributes: {
            code: "123456",
        },
        recipient: "09121234567",
        line_number: "50002178584000",
        number_format: "english",
    });
});

test("sender fails closed without retrying when FarazSMS transport fails", async () => {
    let attempts = 0;

    const sender = getSender(
        {
            FARAZSMS_API_KEY: "test-api-key",
            FARAZSMS_LINE_NUMBER: "50002178584000",
            FARAZSMS_PATTERN_CODE: "test-pattern-code",
        },
        async () => {
            attempts += 1;
            throw new Error("socket reset");
        },
    );

    await assert.rejects(
        sender({
            phone: "09121234567",
            code: "123456",
            expiresAt: new Date("2026-09-16T12:00:00Z"),
            signal: new AbortController().signal,
        }),
        {
            message: "OTP service unavailable",
            statusCode: 503,
        },
    );

    assert.equal(attempts, 1);
});

test("sender fails closed when FarazSMS rejects the request", async () => {
    let attempts = 0;

    const sender = getSender(
        {
            FARAZSMS_API_KEY: "test-api-key",
            FARAZSMS_LINE_NUMBER: "50002178584000",
            FARAZSMS_PATTERN_CODE: "test-pattern-code",
        },
        async () => {
            attempts += 1;

            return {
                ok: false,
                status: 422,
            };
        },
    );

    await assert.rejects(
        sender({
            phone: "09121234567",
            code: "123456",
            expiresAt: new Date("2026-09-16T12:00:00Z"),
            signal: new AbortController().signal,
        }),
        {
            message: "OTP service unavailable",
            statusCode: 503,
        },
    );

    assert.equal(attempts, 1);
});

test("sender accepts FarazSMS HTTP 200 when provider status is success", async () => {
    const sender = getSender(
        {
            FARAZSMS_API_KEY: "test-api-key",
            FARAZSMS_LINE_NUMBER: "50002178584000",
            FARAZSMS_PATTERN_CODE: "test-pattern-code",
        },
        async () => ({
            status: 200,
            json: async () => ({
                status: "success",
                data: {
                    queued: true,
                },
                messages: null,
            }),
        }),
    );

    await sender({
        phone: "09121234567",
        code: "123456",
        expiresAt: new Date("2026-09-16T12:00:00Z"),
        signal: new AbortController().signal,
    });
});

test("sender rejects FarazSMS HTTP 200 when provider status is not success", async () => {
    const sender = getSender(
        {
            FARAZSMS_API_KEY: "test-api-key",
            FARAZSMS_LINE_NUMBER: "50002178584000",
            FARAZSMS_PATTERN_CODE: "test-pattern-code",
        },
        async () => ({
            status: 200,
            json: async () => ({
                status: "error",
                data: null,
                messages: "provider rejected request",
            }),
        }),
    );

    await assert.rejects(
        sender({
            phone: "09121234567",
            code: "123456",
            expiresAt: new Date("2026-09-16T12:00:00Z"),
            signal: new AbortController().signal,
        }),
        {
            message: "OTP service unavailable",
            statusCode: 503,
        },
    );
});