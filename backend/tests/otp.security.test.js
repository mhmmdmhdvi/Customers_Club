const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createOtpService } = require("../src/services/otp.service.factory");

const PHONE = "09121234567";

function createSecurityFixture(t, nodeEnv) {
    const records = [];
    const logs = [];
    t.mock.method(console, "log", (...args) => logs.push(args));

    const service = createOtpService({
        oTPCode: {
            updateMany: async () => ({ count: 0 }),
            create: async ({ data }) => {
                records.push({ ...data });
                return { id: 1, used: false, ...data };
            },
        },
    }, { nodeEnv });

    return { service, records, logs };
}

for (const value of [100_000, 999_999]) {
    test(`createOtp stores crypto-generated ${value} as a string`, async (t) => {
        const { service, records } = createSecurityFixture(t, "test");

        t.mock.method(crypto, "randomInt", (min, max) => {
            assert.equal(min, 100_000);
            assert.equal(max, 1_000_000);
            return value;
        });
        t.mock.method(Math, "random", () => {
            throw new Error("Math.random must not generate OTPs");
        });

        await service.createOtp(PHONE);

        assert.equal(records.length, 1);
        assert.equal(records[0].code, String(value));
    });
}

for (const nodeEnv of ["production", "test", undefined]) {
    test(`createOtp does not log an OTP when environment is ${nodeEnv ?? "unset"}`, async (t) => {
        const { service, records, logs } = createSecurityFixture(t, nodeEnv);

        await service.createOtp(PHONE);

        assert.equal(records.length, 1);
        assert.deepEqual(logs, []);
    });
}

test("createOtp logs the saved OTP in development", async (t) => {
    const { service, records, logs } = createSecurityFixture(t, "development");

    await service.createOtp(PHONE);

    assert.equal(records.length, 1);
    assert.deepEqual(logs, [[`Generated OTP for ${PHONE}: ${records[0].code}`]]);
});