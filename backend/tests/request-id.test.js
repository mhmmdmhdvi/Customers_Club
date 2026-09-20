const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createRequestIdMiddleware,
} = require(
    "../src/middleware/request-id",
);

function response() {
    return {
        headers: {},

        set(name, value) {
            this.headers[name] = value;
            return this;
        },
    };
}

test("assigns a server-generated request id and exposes it in the response", () => {
    const requestId =
        "2bcf5c08-48b9-44a3-9a09-b28101be5bfd";

    const middleware =
        createRequestIdMiddleware({
            randomUUID: () => requestId,
        });

    const req = {
        headers: {},
    };

    const res = response();

    let nextCalled = false;

    middleware(
        req,
        res,
        () => {
            nextCalled = true;
        },
    );

    assert.equal(
        req.requestId,
        requestId,
    );

    assert.equal(
        res.headers["X-Request-Id"],
        requestId,
    );

    assert.equal(
        nextCalled,
        true,
    );
});

test("does not trust a client supplied request id", () => {
    const generated =
        "d4f75032-9b58-48bb-a1db-67bf7878603a";

    const middleware =
        createRequestIdMiddleware({
            randomUUID: () => generated,
        });

    const req = {
        headers: {
            "x-request-id":
                "attacker-controlled-id",
        },
    };

    const res = response();

    middleware(
        req,
        res,
        () => {},
    );

    assert.equal(
        req.requestId,
        generated,
    );

    assert.equal(
        res.headers["X-Request-Id"],
        generated,
    );
});