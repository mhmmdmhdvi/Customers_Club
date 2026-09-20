const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdminAuditService,
} = require(
    "../src/services/admin-audit.service.factory",
);

test("records a sanitized admin audit event", async () => {
    let createdData;

    const prisma = {
        adminAuditEvent: {
            async create({ data }) {
                createdData = data;

                return {
                    id: 1,
                    ...data,
                    createdAt:
                        new Date(
                            "2026-09-20T05:00:00.000Z",
                        ),
                };
            },
        },
    };

    const service =
        createAdminAuditService(prisma);

    const result =
        await service.record({
            actorUserId: 7,
            action:
                "CONTACT_MESSAGE_STATUS_CHANGED",
            targetType:
                "CONTACT_MESSAGE",
            targetId: "9",
            outcome: "SUCCESS",
            requestId:
                "2bcf5c08-48b9-44a3-9a09-b28101be5bfd",
            details: {
                fromStatus: "NEW",
                toStatus: "READ",
            },
        });

    assert.deepEqual(createdData, {
        actorUserId: 7,
        action:
            "CONTACT_MESSAGE_STATUS_CHANGED",
        targetType:
            "CONTACT_MESSAGE",
        targetId: "9",
        outcome: "SUCCESS",
        requestId:
            "2bcf5c08-48b9-44a3-9a09-b28101be5bfd",
        details: {
            fromStatus: "NEW",
            toStatus: "READ",
        },
    });

    assert.equal(
        result.action,
        "CONTACT_MESSAGE_STATUS_CHANGED",
    );
});

test("rejects invalid audit events before writing", async () => {
    let writes = 0;

    const prisma = {
        adminAuditEvent: {
            async create() {
                writes += 1;
            },
        },
    };

    const service =
        createAdminAuditService(prisma);

    const invalidEvents = [
        {
            actorUserId: 0,
            action:
                "CONTACT_MESSAGE_STATUS_CHANGED",
            targetType:
                "CONTACT_MESSAGE",
            targetId: "9",
            outcome: "SUCCESS",
        },
        {
            actorUserId: 7,
            action: "",
            targetType:
                "CONTACT_MESSAGE",
            targetId: "9",
            outcome: "SUCCESS",
        },
        {
            actorUserId: 7,
            action:
                "CONTACT_MESSAGE_STATUS_CHANGED",
            targetType: "",
            targetId: "9",
            outcome: "SUCCESS",
        },
        {
            actorUserId: 7,
            action:
                "CONTACT_MESSAGE_STATUS_CHANGED",
            targetType:
                "CONTACT_MESSAGE",
            targetId: "9",
            outcome: "UNKNOWN",
        },
    ];

    for (const event of invalidEvents) {
        await assert.rejects(
            service.record(event),
            (error) =>
                error.statusCode === 400,
        );
    }

    assert.equal(writes, 0);
});

test("rejects sensitive audit detail keys before writing", async () => {
    let writes = 0;

    const prisma = {
        adminAuditEvent: {
            async create() {
                writes += 1;
            },
        },
    };

    const service =
        createAdminAuditService(prisma);

    for (const details of [
        {
            accessToken: "secret",
        },
        {
            password: "secret",
        },
        {
            otpCode: "123456",
        },
        {
            authorization: "Bearer secret",
        },
        {
            message: "customer message body",
        },
    ]) {
        await assert.rejects(
            service.record({
                actorUserId: 7,
                action:
                    "CONTACT_MESSAGE_STATUS_CHANGED",
                targetType:
                    "CONTACT_MESSAGE",
                targetId: "9",
                outcome: "SUCCESS",
                details,
            }),
            (error) =>
                error.statusCode === 400,
        );
    }

    assert.equal(writes, 0);
});

test("allows audit writes against a supplied transaction client", async () => {
    let rootWrites = 0;
    let transactionWrites = 0;

    const prisma = {
        adminAuditEvent: {
            async create() {
                rootWrites += 1;
            },
        },
    };

    const transaction = {
        adminAuditEvent: {
            async create({ data }) {
                transactionWrites += 1;

                return {
                    id: 1,
                    ...data,
                };
            },
        },
    };

    const service =
        createAdminAuditService(prisma);

    await service.record(
        {
            actorUserId: 7,
            action:
                "CONTACT_MESSAGE_STATUS_CHANGED",
            targetType:
                "CONTACT_MESSAGE",
            targetId: "9",
            outcome: "SUCCESS",
            details: {
                fromStatus: "NEW",
                toStatus: "READ",
            },
        },
        transaction,
    );

    assert.equal(rootWrites, 0);
    assert.equal(
        transactionWrites,
        1,
    );
});