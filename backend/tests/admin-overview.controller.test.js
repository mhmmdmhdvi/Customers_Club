const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdminOverviewController,
} = require(
    "../src/controllers/admin-overview.controller.factory",
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

test("overview returns admin dashboard metrics", async () => {
    const metrics = {
        members: {
            total: 120,
            newLast7Days: 4,
        },

        messages: {
            total: 42,
            new: 7,
        },

        sessions: {
            active: 18,
        },
    };

    const controller =
        createAdminOverviewController({
            adminOverviewService: {
                async getOverview() {
                    return metrics;
                },
            },
        });

    const res = response();

    await controller.overview({}, res);

    assert.equal(
        res.statusCode,
        200,
    );

    assert.deepEqual(
        res.body,
        metrics,
    );

    assert.equal(
        res.headers["Cache-Control"],
        "no-store",
    );
});

test("overview does not expose unexpected database errors", async (t) => {
    const log = t.mock.method(
        console,
        "error",
        () => {},
    );

    const controller =
        createAdminOverviewController({
            adminOverviewService: {
                async getOverview() {
                    throw new Error(
                        "database password secret-value",
                    );
                },
            },
        });

    const res = response();

    await controller.overview({}, res);

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