const test = require("node:test");
const assert = require("node:assert/strict");
const { createOtpService } = require("../src/services/otp.service.factory");

const PHONE = "09121234567";
const CODE = "123456";

test("verifyOtp rejects a missing OTP", async () => {
    const service = createOtpService({
        oTPCode: {
            findFirst: async () => null,
            updateMany: async () => assert.fail("A missing OTP must not be updated"),
        },
    });

    await assert.rejects(service.verifyOtp(PHONE, CODE), {
        message: "Invalid OTP",
    });
});

test("verifyOtp rejects an expired OTP", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 1_000 });

    const service = createOtpService({
        oTPCode: {
            findFirst: async () => ({
                id: "otp-1",
                expiresAt: new Date(999),
                used: false,
            }),
            updateMany: async () => assert.fail("An expired OTP must not be updated"),
        },
    });

    await assert.rejects(service.verifyOtp(PHONE, CODE), {
        message: "OTP expired",
    });
});

test("verifyOtp marks a valid OTP as used", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 1_000 });
    const otp = { id: "otp-1", expiresAt: new Date(2_000), used: false };

    const service = createOtpService({
        oTPCode: {
            findFirst: async () => ({ ...otp }),
            updateMany: async ({ where, data }) => {
                const matches = Object.entries(where).every(([field, value]) =>
                    field === "expiresAt"
                        ? otp.expiresAt > value.gt
                        : otp[field] === value
                );

                if (!matches) {
                    return { count: 0 };
                }

                Object.assign(otp, data);
                return { count: 1 };
            },
        },
    });

    const result = await service.verifyOtp(PHONE, CODE);

    assert.equal(result, true);
    assert.equal(otp.used, true);
});

function createVerificationFixture(t, used = false) {
    t.mock.timers.enable({ apis: ["Date"], now: 1_000 });

    const otp = {
        id: "otp-1",
        phone: PHONE,
        code: CODE,
        expiresAt: new Date(2_000),
        used,
    };

    const service = createOtpService({
        oTPCode: {
            findFirst: async ({ where }) => {
                const matches = Object.entries(where).every(
                    ([field, value]) => otp[field] === value
                );

                return matches ? { ...otp } : null;
            },
            updateMany: async ({ where, data }) => {
                const matches = Object.entries(where).every(([field, value]) =>
                    field === "expiresAt"
                        ? otp.expiresAt > value.gt
                        : otp[field] === value
                );

                if (!matches) {
                    return { count: 0 };
                }

                Object.assign(otp, data);
                return { count: 1 };
            },
        },
    });

    return { service, otp };
}

const rejectedAttempts = [
    ["another phone number", "09129876543", CODE, false],
    ["an incorrect code", PHONE, "654321", false],
    ["an already-used OTP", PHONE, CODE, true],
];

for (const [reason, phone, code, used] of rejectedAttempts) {
    test(`verifyOtp rejects ${reason}`, async (t) => {
        const { service, otp } = createVerificationFixture(t, used);

        await assert.rejects(service.verifyOtp(phone, code), {
            message: "Invalid OTP",
        });

        assert.equal(otp.used, used);
    });
}

test("verifyOtp rejects reuse after a successful verification", async (t) => {
    const { service, otp } = createVerificationFixture(t);

    assert.equal(await service.verifyOtp(PHONE, CODE), true);
    assert.equal(otp.used, true);

    await assert.rejects(service.verifyOtp(PHONE, CODE), {
        message: "Invalid OTP",
    });
});

function createCreationFixture(t, initialRecords = []) {
    t.mock.timers.enable({ apis: ["Date"], now: 1_000 });
    t.mock.method(console, "log", () => { });

    const records = initialRecords.map((record) => ({ ...record }));

    const service = createOtpService({
        oTPCode: {
            updateMany: async ({ where, data }) => {
                const matches = records.filter((record) =>
                    Object.entries(where).every(
                        ([field, value]) => record[field] === value
                    )
                );

                for (const record of matches) {
                    Object.assign(record, data);
                }

                return { count: matches.length };
            },
            create: async ({ data }) => {
                const record = {
                    id: records.length + 1,
                    used: false,
                    ...data,
                };

                records.push(record);
                return { ...record };
            },
        },
    });

    return { service, records };
}

test("createOtp saves one six-digit code for the requested phone", async (t) => {
    const { service, records } = createCreationFixture(t);

    await service.createOtp(PHONE);

    assert.equal(records.length, 1);
    assert.equal(records[0].phone, PHONE);
    assert.match(records[0].code, /^\d{6}$/);
});

test("createOtp sets expiration to exactly two minutes from now", async (t) => {
    const { service, records } = createCreationFixture(t);

    await service.createOtp(PHONE);

    assert.equal(records[0].expiresAt.getTime(), 121_000);
});

test("createOtp invalidates previous OTPs only for the requested phone", async (t) => {
    const { service, records } = createCreationFixture(t, [
        { id: 1, phone: PHONE, used: false },
        { id: 2, phone: PHONE, used: false },
        { id: 3, phone: "09129876543", used: false },
    ]);

    await service.createOtp(PHONE);

    assert.equal(records.length, 4);
    assert.deepEqual(
        records.map((record) => record.used),
        [true, true, false, false]
    );
});

test("verifyOtp accepts an OTP one millisecond before expiration", async (t) => {
    const { service, otp } = createVerificationFixture(t);

    t.mock.timers.setTime(otp.expiresAt.getTime() - 1);

    assert.equal(await service.verifyOtp(PHONE, CODE), true);
    assert.equal(otp.used, true);
});

test("verifyOtp rejects an OTP at its exact expiration time", async (t) => {
    const { service, otp } = createVerificationFixture(t);

    t.mock.timers.setTime(otp.expiresAt.getTime());

    await assert.rejects(service.verifyOtp(PHONE, CODE), {
        message: "OTP expired",
    });

    assert.equal(otp.used, false);
});

test("verifyOtp allows only one of two overlapping attempts to succeed", async (t) => {
    const { service, otp } = createVerificationFixture(t);

    // Start both attempts without waiting for the first to finish.
    const results = await Promise.allSettled([
        service.verifyOtp(PHONE, CODE),
        service.verifyOtp(PHONE, CODE),
    ]);

    const succeeded = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    assert.equal(succeeded.length, 1, "Only one verification may succeed");
    assert.equal(rejected.length, 1);
    assert.equal(succeeded[0].value, true);
    assert.equal(rejected[0].reason.message, "Invalid OTP");
    assert.equal(otp.used, true);
});