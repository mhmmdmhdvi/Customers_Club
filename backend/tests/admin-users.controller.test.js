const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdminUsersController,
} = require(
    "../src/controllers/admin-users.controller.factory",
);

const {
    AdminUsersError,
} = require(
    "../src/services/admin-users.service.factory",
);

function response() {
    return {
        statusCode: 200,
        headers: {},
        body: null,

        set(name, value) {
            this.headers[name] = value;
            return this;
        },

        status(value) {
            this.statusCode = value;
            return this;
        },

        json(value) {
            this.body = value;
            return this;
        },
    };
}

test("users returns paginated admin user data", async () => {
    const result = {
        items: [
            {
                id: 12,
                phone: "09121234567",
                firstName: "خسرو",
                lastName: "وفایی",
                role: "MEMBER",
                createdAt:
                    "2026-09-20T05:00:00.000Z",
                updatedAt:
                    "2026-09-20T05:00:00.000Z",
            },
        ],

        pagination: {
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
        },
    };

    const controller =
        createAdminUsersController({
            adminUsersService: {
                async getUsers(query) {
                    assert.deepEqual(query, {
                        page: "1",
                        search: "خسرو",
                    });

                    return result;
                },
            },
        });

    const res = response();

    await controller.users(
        {
            query: {
                page: "1",
                search: "خسرو",
            },
        },
        res,
    );

    assert.equal(
        res.statusCode,
        200,
    );

    assert.deepEqual(
        res.body,
        result,
    );

    assert.equal(
        res.headers["Cache-Control"],
        "no-store",
    );
});

test("users maps invalid query input to 400", async () => {
    const controller =
        createAdminUsersController({
            adminUsersService: {
                async getUsers() {
                    throw new AdminUsersError(
                        "Invalid page",
                    );
                },
            },
        });

    const res = response();

    await controller.users(
        {
            query: {
                page: "0",
            },
        },
        res,
    );

    assert.equal(
        res.statusCode,
        400,
    );

    assert.deepEqual(
        res.body,
        {
            message: "Invalid page",
        },
    );
});

test("users does not expose unexpected database errors", async (t) => {
    const log = t.mock.method(
        console,
        "error",
        () => {},
    );

    const controller =
        createAdminUsersController({
            adminUsersService: {
                async getUsers() {
                    throw new Error(
                        "database password secret-value",
                    );
                },
            },
        });

    const res = response();

    await controller.users(
        {
            query: {},
        },
        res,
    );

    assert.equal(
        res.statusCode,
        500,
    );

    assert.deepEqual(
        res.body,
        {
            message:
                "Internal server error",
        },
    );

    assert.equal(
        res.headers["Cache-Control"],
        "no-store",
    );

    assert.ok(
        !JSON.stringify(
            log.mock.calls,
        ).includes(
            "secret-value",
        ),
    );
});