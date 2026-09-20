const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdminMessagesService,
} = require(
    "../src/services/admin-messages.service.factory",
);

test("returns paginated contact messages ordered by newest", async () => {
    const messages = [
        {
            id: 9,
            name: "خسرو وفایی",
            phone: "09121234567",
            email: "test@example.com",
            subject: "SUPPORT",
            status: "NEW",
            createdAt:
                new Date("2026-09-20T05:00:00.000Z"),
            updatedAt:
                new Date("2026-09-20T05:00:00.000Z"),
        },
    ];

    const prisma = {
        contactMessage: {
            async count({ where }) {
                assert.deepEqual(where, {});
                return 31;
            },

            async findMany(args) {
                assert.deepEqual(args, {
                    where: {},

                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        email: true,
                        subject: true,
                        status: true,
                        createdAt: true,
                        updatedAt: true,
                    },

                    orderBy: {
                        createdAt: "desc",
                    },

                    skip: 0,
                    take: 20,
                });

                return messages;
            },
        },
    };

    const service =
        createAdminMessagesService(prisma);

    const result =
        await service.getMessages({});

    assert.deepEqual(result, {
        items: messages,

        pagination: {
            page: 1,
            pageSize: 20,
            total: 31,
            totalPages: 2,
        },
    });
});

test("filters messages by status, subject and sender search", async () => {
    const expectedWhere = {
        status: "NEW",
        subject: "SUPPORT",

        OR: [
            {
                name: {
                    contains: "خسرو",
                    mode: "insensitive",
                },
            },
            {
                phone: {
                    contains: "خسرو",
                },
            },
            {
                email: {
                    contains: "خسرو",
                    mode: "insensitive",
                },
            },
        ],
    };

    const prisma = {
        contactMessage: {
            async count({ where }) {
                assert.deepEqual(
                    where,
                    expectedWhere,
                );

                return 1;
            },

            async findMany(args) {
                assert.deepEqual(
                    args.where,
                    expectedWhere,
                );

                assert.equal(
                    args.skip,
                    20,
                );

                assert.equal(
                    args.take,
                    20,
                );

                return [];
            },
        },
    };

    const service =
        createAdminMessagesService(prisma);

    const result =
        await service.getMessages({
            search: " خسرو ",
            status: "NEW",
            subject: "SUPPORT",
            page: "2",
            pageSize: "20",
        });

    assert.deepEqual(
        result.pagination,
        {
            page: 2,
            pageSize: 20,
            total: 1,
            totalPages: 1,
        },
    );
});

test("rejects invalid message filters before querying the database", async () => {
    let calls = 0;

    const prisma = {
        contactMessage: {
            async count() {
                calls += 1;
            },

            async findMany() {
                calls += 1;
            },
        },
    };

    const service =
        createAdminMessagesService(prisma);

    for (const query of [
        {
            page: "0",
        },
        {
            pageSize: "101",
        },
        {
            status: "DELETED",
        },
        {
            subject: "SALES",
        },
    ]) {
        await assert.rejects(
            service.getMessages(query),
            (error) =>
                error.statusCode === 400,
        );
    }

    assert.equal(calls, 0);
});

test("returns one contact message with its full body", async () => {
    const message = {
        id: 9,
        name: "خسرو وفایی",
        phone: "09121234567",
        email: "test@example.com",
        subject: "SUPPORT",
        message: "متن کامل پیام مشتری",
        status: "NEW",
        createdAt:
            new Date("2026-09-20T05:00:00.000Z"),
        updatedAt:
            new Date("2026-09-20T05:00:00.000Z"),
    };

    const prisma = {
        contactMessage: {
            async findUnique(args) {
                assert.deepEqual(args, {
                    where: {
                        id: 9,
                    },

                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        email: true,
                        subject: true,
                        message: true,
                        status: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                });

                return message;
            },
        },
    };

    const service =
        createAdminMessagesService(prisma);

    const result =
        await service.getMessageById("9");

    assert.deepEqual(
        result,
        message,
    );
});

test("rejects an invalid contact message id before querying the database", async () => {
    let calls = 0;

    const prisma = {
        contactMessage: {
            async findUnique() {
                calls += 1;
            },
        },
    };

    const service =
        createAdminMessagesService(prisma);

    for (const id of [
        "0",
        "-1",
        "abc",
        "",
        null,
    ]) {
        await assert.rejects(
            service.getMessageById(id),
            (error) =>
                error.statusCode === 400,
        );
    }

    assert.equal(calls, 0);
});

test("returns 404 when the contact message does not exist", async () => {
    const prisma = {
        contactMessage: {
            async findUnique() {
                return null;
            },
        },
    };

    const service =
        createAdminMessagesService(prisma);

    await assert.rejects(
        service.getMessageById("999"),
        (error) =>
            error.statusCode === 404 &&
            error.message ===
            "Contact message not found",
    );
});

test("changes a NEW message to READ and records the audit event in the same transaction", async () => {
    const tx = {
        contactMessage: {
            async findUnique({
                where,
                select,
            }) {
                assert.deepEqual(where, {
                    id: 9,
                });

                if (select.updatedAt) {
                    assert.deepEqual(select, {
                        id: true,
                        status: true,
                        updatedAt: true,
                    });

                    return {
                        id: 9,
                        status: "READ",
                        updatedAt:
                            new Date(
                                "2026-09-20T06:00:00.000Z",
                            ),
                    };
                }

                assert.deepEqual(select, {
                    id: true,
                    status: true,
                });

                return {
                    id: 9,
                    status: "NEW",
                };
            },

            async updateMany(args) {
                assert.deepEqual(args, {
                    where: {
                        id: 9,
                        status: "NEW",
                    },

                    data: {
                        status: "READ",
                    },
                });

                return {
                    count: 1,
                };
            },
        },
    };

    let transactions = 0;
    let auditCalls = 0;

    const prisma = {
        async $transaction(work) {
            transactions += 1;
            return work(tx);
        },
    };

    const adminAuditService = {
        async record(event, db) {
            auditCalls += 1;

            assert.equal(db, tx);

            assert.deepEqual(event, {
                actorUserId: 7,
                action:
                    "CONTACT_MESSAGE_STATUS_CHANGED",
                targetType:
                    "CONTACT_MESSAGE",
                targetId: "9",
                outcome: "SUCCESS",
                requestId:
                    "request-123",
                details: {
                    fromStatus: "NEW",
                    toStatus: "READ",
                },
            });
        },
    };

    const service =
        createAdminMessagesService(
            prisma,
            {
                adminAuditService,
            },
        );

    const result =
        await service.updateMessageStatus({
            id: "9",
            status: "READ",
            actorUserId: 7,
            requestId: "request-123",
        });

    assert.equal(transactions, 1);
    assert.equal(auditCalls, 1);

    assert.equal(
        result.status,
        "READ",
    );
});

test("changes a READ message to RESOLVED", async () => {
    const tx = {
        contactMessage: {
            async findUnique({ select }) {
                if (select.updatedAt) {
                    return {
                        id: 9,
                        status: "RESOLVED",
                        updatedAt:
                            new Date(
                                "2026-09-20T06:00:00.000Z",
                            ),
                    };
                }

                return {
                    id: 9,
                    status: "READ",
                };
            },

            async updateMany({
                where,
                data,
            }) {
                assert.deepEqual(where, {
                    id: 9,
                    status: "READ",
                });

                assert.deepEqual(data, {
                    status: "RESOLVED",
                });

                return {
                    count: 1,
                };
            },
        },
    };

    const prisma = {
        async $transaction(work) {
            return work(tx);
        },
    };

    const adminAuditService = {
        async record(event, db) {
            assert.equal(db, tx);

            assert.equal(
                event.details.fromStatus,
                "READ",
            );

            assert.equal(
                event.details.toStatus,
                "RESOLVED",
            );
        },
    };

    const service =
        createAdminMessagesService(
            prisma,
            {
                adminAuditService,
            },
        );

    const result =
        await service.updateMessageStatus({
            id: "9",
            status: "RESOLVED",
            actorUserId: 7,
        });

    assert.equal(
        result.status,
        "RESOLVED",
    );
});

test("rejects invalid contact message status transitions without writing", async () => {
    let updates = 0;
    let audits = 0;

    const tx = {
        contactMessage: {
            async findUnique() {
                return {
                    id: 9,
                    status: "NEW",
                };
            },

            async update() {
                updates += 1;
            },
        },
    };

    const prisma = {
        async $transaction(work) {
            return work(tx);
        },
    };

    const adminAuditService = {
        async record() {
            audits += 1;
        },
    };

    const service =
        createAdminMessagesService(
            prisma,
            {
                adminAuditService,
            },
        );

    await assert.rejects(
        service.updateMessageStatus({
            id: "9",
            status: "RESOLVED",
            actorUserId: 7,
        }),
        (error) =>
            error.statusCode === 409,
    );

    assert.equal(updates, 0);
    assert.equal(audits, 0);
});

test("returns 404 when changing the status of a missing message", async () => {
    let audits = 0;

    const prisma = {
        async $transaction(work) {
            return work({
                contactMessage: {
                    async findUnique() {
                        return null;
                    },
                },
            });
        },
    };

    const adminAuditService = {
        async record() {
            audits += 1;
        },
    };

    const service =
        createAdminMessagesService(
            prisma,
            {
                adminAuditService,
            },
        );

    await assert.rejects(
        service.updateMessageStatus({
            id: "999",
            status: "READ",
            actorUserId: 7,
        }),
        (error) =>
            error.statusCode === 404 &&
            error.message ===
            "Contact message not found",
    );

    assert.equal(audits, 0);
});

test("concurrent status changes cannot both succeed from the same previous status", async () => {
    const state = {
        status: "NEW",
    };

    let initialReads = 0;
    let releaseInitialReads;

    const bothRead = new Promise(
        (resolve) => {
            releaseInitialReads = resolve;
        },
    );

    let auditCalls = 0;

    const tx = {
        contactMessage: {
            async findUnique({ select }) {
                if (select.updatedAt) {
                    return {
                        id: 9,
                        status: state.status,
                        updatedAt:
                            new Date(
                                "2026-09-20T07:00:00.000Z",
                            ),
                    };
                }

                const snapshot = {
                    id: 9,
                    status: state.status,
                };

                initialReads += 1;

                if (initialReads === 2) {
                    releaseInitialReads();
                }

                await bothRead;

                return snapshot;
            },

            async updateMany({
                where,
                data,
            }) {
                if (
                    where.id !== 9 ||
                    where.status !== state.status
                ) {
                    return {
                        count: 0,
                    };
                }

                state.status = data.status;

                return {
                    count: 1,
                };
            },
        },
    };

    const prisma = {
        async $transaction(work) {
            return work(tx);
        },
    };

    const adminAuditService = {
        async record() {
            auditCalls += 1;
        },
    };

    const service =
        createAdminMessagesService(
            prisma,
            {
                adminAuditService,
            },
        );

    const results =
        await Promise.allSettled([
            service.updateMessageStatus({
                id: "9",
                status: "READ",
                actorUserId: 7,
            }),

            service.updateMessageStatus({
                id: "9",
                status: "READ",
                actorUserId: 8,
            }),
        ]);

    const fulfilled = results.filter(
        (result) =>
            result.status === "fulfilled",
    );

    const rejected = results.filter(
        (result) =>
            result.status === "rejected",
    );

    assert.equal(
        fulfilled.length,
        1,
    );

    assert.equal(
        rejected.length,
        1,
    );

    assert.equal(
        rejected[0].reason.statusCode,
        409,
    );

    assert.equal(
        auditCalls,
        1,
    );

    assert.equal(
        state.status,
        "READ",
    );
});