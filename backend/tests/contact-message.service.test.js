const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createContactMessageService,
} = require("../src/services/contact-message.service.factory");

const PHONE = "09121234567";

function fixture() {
    const state = {
        created: [],
    };

    const prisma = {
        contactMessage: {
            async count({ where }) {
                return state.created.filter(
                    (item) =>
                        item.phone === where.phone &&
                        item.createdAt >=
                        where.createdAt.gte,
                ).length;
            },

            async create({ data }) {
                const record = {
                    id: state.created.length + 1,
                    ...data,
                    status: "NEW",
                    createdAt: new Date(
                        "2026-09-19T06:00:00.000Z",
                    ),
                    updatedAt: new Date(
                        "2026-09-19T06:00:00.000Z",
                    ),
                };

                state.created.push(record);

                return record;
            },
        },
    };

    const phoneLocks = new Map();

    async function withPhoneLock(
        _prisma,
        phone,
        work,
    ) {
        const previous =
            phoneLocks.get(phone) ??
            Promise.resolve();

        let release;

        const current = new Promise(
            (resolve) => {
                release = resolve;
            },
        );

        phoneLocks.set(phone, current);

        await previous;

        try {
            return await work(prisma);
        } finally {
            release();

            if (phoneLocks.get(phone) === current) {
                phoneLocks.delete(phone);
            }
        }
    }

    return {
        state,
        service: createContactMessageService(
            prisma,
            {
                now: () =>
                    new Date(
                        "2026-09-19T06:00:00.000Z",
                    ),
                withPhoneLock,
            },
        ),
    };
}

function validInput(overrides = {}) {
    return {
        name: " خسرو وفایی ",
        phone: PHONE,
        email: " TEST@EXAMPLE.COM ",
        subject: "SUPPORT",
        message: " لطفاً با من تماس بگیرید. ",
        ...overrides,
    };
}

test("creates a normalized NEW contact message", async () => {
    const { state, service } = fixture();

    const result = await service.createMessage(
        validInput(),
    );

    assert.equal(state.created.length, 1);

    assert.equal(result.id, 1);
    assert.equal(result.name, "خسرو وفایی");
    assert.equal(result.phone, PHONE);
    assert.equal(result.email, "test@example.com");
    assert.equal(result.subject, "SUPPORT");
    assert.equal(
        result.message,
        "لطفاً با من تماس بگیرید.",
    );
    assert.equal(result.status, "NEW");
});

test("accepts an omitted optional email", async () => {
    const { service } = fixture();

    const result = await service.createMessage(
        validInput({
            email: undefined,
        }),
    );

    assert.equal(result.email, null);
});

for (const subject of [
    "SUPPORT",
    "SUGGESTION",
    "COMPLAINT",
    "OTHER",
]) {
    test(`accepts subject ${subject}`, async () => {
        const { service } = fixture();

        const result = await service.createMessage(
            validInput({ subject }),
        );

        assert.equal(result.subject, subject);
    });
}

for (const [label, overrides] of [
    ["missing name", { name: undefined }],
    ["blank name", { name: "   " }],
    ["invalid phone", { phone: "08121234567" }],
    ["invalid email", { email: "not-an-email" }],
    ["unsupported subject", { subject: "SALES" }],
    ["blank message", { message: "   " }],
    [
        "message over 250 characters",
        { message: "a".repeat(251) },
    ],
]) {
    test(`rejects ${label} without writing`, async () => {
        const { state, service } = fixture();

        await assert.rejects(
            service.createMessage(
                validInput(overrides),
            ),
            (error) => error.statusCode === 400,
        );

        assert.equal(state.created.length, 0);
    });
}

test("rejects unapproved fields without writing", async () => {
    const { state, service } = fixture();

    await assert.rejects(
        service.createMessage(
            validInput({
                status: "RESOLVED",
            }),
        ),
        (error) => error.statusCode === 400,
    );

    assert.equal(state.created.length, 0);
});

test("accepts a message exactly 250 characters long", async () => {
    const { service } = fixture();

    const result = await service.createMessage(
        validInput({
            message: "a".repeat(250),
        }),
    );

    assert.equal(
        Array.from(result.message).length,
        250,
    );
});

test("accepts a name exactly 80 characters long", async () => {
    const { service } = fixture();

    const result = await service.createMessage(
        validInput({
            name: "ا".repeat(80),
        }),
    );

    assert.equal(
        Array.from(result.name).length,
        80,
    );
});

test("rejects a name over 80 characters", async () => {
    const { state, service } = fixture();

    await assert.rejects(
        service.createMessage(
            validInput({
                name: "ا".repeat(81),
            }),
        ),
        (error) => error.statusCode === 400,
    );

    assert.equal(state.created.length, 0);
});

test("normalizes an international Iranian phone", async () => {
    const { service } = fixture();

    const result = await service.createMessage(
        validInput({
            phone: "+989121234567",
        }),
    );

    assert.equal(result.phone, PHONE);
});

test("accepts a blank optional email as null", async () => {
    const { service } = fixture();

    const result = await service.createMessage(
        validInput({
            email: "   ",
        }),
    );

    assert.equal(result.email, null);
});

for (const body of [
    null,
    [],
    "message",
    undefined,
]) {
    test(`rejects non-object input ${JSON.stringify(body)}`, async () => {
        const { state, service } = fixture();

        await assert.rejects(
            service.createMessage(body),
            (error) => error.statusCode === 400,
        );

        assert.equal(state.created.length, 0);
    });
}

test("rejects control characters in the sender name", async () => {
    const { state, service } = fixture();

    await assert.rejects(
        service.createMessage(
            validInput({
                name: "خسرو\nوفایی",
            }),
        ),
        (error) => error.statusCode === 400,
    );

    assert.equal(state.created.length, 0);
});

test("allows up to three messages from one phone within an hour", async () => {
    const { state, service } = fixture();

    for (let index = 0; index < 3; index += 1) {
        await service.createMessage(
            validInput({
                message: `پیام شماره ${index + 1}`,
            }),
        );
    }

    assert.equal(state.created.length, 3);
});

test("rejects a fourth message from the same phone within an hour", async () => {
    const { state, service } = fixture();

    for (let index = 0; index < 3; index += 1) {
        await service.createMessage(
            validInput({
                message: `پیام شماره ${index + 1}`,
            }),
        );
    }

    await assert.rejects(
        service.createMessage(
            validInput({
                message: "پیام چهارم",
            }),
        ),
        (error) =>
            error.statusCode === 429 &&
            error.message ===
            "Too many contact messages",
    );

    assert.equal(state.created.length, 3);
});

test("rate limiting is scoped to the normalized phone number", async () => {
    const { state, service } = fixture();

    for (let index = 0; index < 3; index += 1) {
        await service.createMessage(
            validInput({
                message: `پیام شماره ${index + 1}`,
            }),
        );
    }

    const result = await service.createMessage(
        validInput({
            phone: "09129876543",
            message: "پیام از شماره دیگر",
        }),
    );

    assert.equal(result.phone, "09129876543");
    assert.equal(state.created.length, 4);
});

test("concurrent requests cannot bypass the three-per-hour limit", async () => {
    const { state, service } = fixture();

    const attempts = await Promise.allSettled(
        Array.from(
            { length: 4 },
            (_, index) =>
                service.createMessage(
                    validInput({
                        message:
                            `پیام همزمان ${index + 1}`,
                    }),
                ),
        ),
    );

    const fulfilled = attempts.filter(
        (result) =>
            result.status === "fulfilled",
    );

    const rejected = attempts.filter(
        (result) =>
            result.status === "rejected",
    );

    assert.equal(fulfilled.length, 3);
    assert.equal(rejected.length, 1);

    assert.equal(
        rejected[0].reason.statusCode,
        429,
    );

    assert.equal(
        rejected[0].reason.message,
        "Too many contact messages",
    );

    assert.equal(state.created.length, 3);
});

test("rejects a NUL byte in the message without writing", async () => {
    const { state, service } = fixture();

    await assert.rejects(
        service.createMessage(
            validInput({
                message: "پیام\u0000نامعتبر",
            }),
        ),
        (error) => error.statusCode === 400,
    );

    assert.equal(state.created.length, 0);
});

test("rejects a NUL byte in the optional email without writing", async () => {
    const { state, service } = fixture();

    await assert.rejects(
        service.createMessage(
            validInput({
                email: "test\u0000@example.com",
            }),
        ),
        (error) => error.statusCode === 400,
    );

    assert.equal(state.created.length, 0);
});