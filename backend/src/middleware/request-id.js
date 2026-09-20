const {
    randomUUID,
} = require("node:crypto");

function createRequestIdMiddleware({
    randomUUID: generateRequestId =
        randomUUID,
} = {}) {
    return function requestIdMiddleware(
        req,
        res,
        next,
    ) {
        const requestId =
            generateRequestId();

        req.requestId = requestId;

        res.set(
            "X-Request-Id",
            requestId,
        );

        next();
    };
}

const requestIdMiddleware =
    createRequestIdMiddleware();

module.exports = {
    createRequestIdMiddleware,
    requestIdMiddleware,
};