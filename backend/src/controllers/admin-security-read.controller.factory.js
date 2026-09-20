const {
    AdminSecurityReadError,
} = require(
    "../services/admin-security-read.service.factory",
);

function createAdminSecurityReadController({
    adminSecurityReadService,
}) {
    function handleError(
        res,
        error,
        operation,
    ) {
        if (
            error instanceof
            AdminSecurityReadError
        ) {
            return res
                .status(
                    error.statusCode,
                )
                .json({
                    message:
                        error.message,
                });
        }

        console.error(
            `Admin security ${operation} failed`,
        );

        return res
            .status(500)
            .json({
                message:
                    "Internal server error",
            });
    }

    async function security(req, res) {
        res.set(
            "Cache-Control",
            "no-store",
        );

        try {
            const result =
                await adminSecurityReadService
                    .getEvents(
                        req.query,
                    );

            return res
                .status(200)
                .json(result);
        } catch (error) {
            return handleError(
                res,
                error,
                "list operation",
            );
        }
    }

    async function securityEvent(
        req,
        res,
    ) {
        res.set(
            "Cache-Control",
            "no-store",
        );

        try {
            const result =
                await adminSecurityReadService
                    .getEventById(
                        req.params.id,
                    );

            return res
                .status(200)
                .json(result);
        } catch (error) {
            return handleError(
                res,
                error,
                "detail operation",
            );
        }
    }

    return {
        security,
        securityEvent,
    };
}

module.exports = {
    createAdminSecurityReadController,
};