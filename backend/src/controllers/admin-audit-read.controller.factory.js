const {
    AdminAuditReadError,
} = require(
    "../services/admin-audit-read.service.factory",
);

function createAdminAuditReadController({
    adminAuditReadService,
}) {
    function handleError(
        res,
        error,
        operation,
    ) {
        if (
            error instanceof
            AdminAuditReadError
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
            `Admin audit ${operation} failed`,
        );

        return res
            .status(500)
            .json({
                message:
                    "Internal server error",
            });
    }

    async function audit(req, res) {
        res.set(
            "Cache-Control",
            "no-store",
        );

        try {
            const result =
                await adminAuditReadService
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

    async function auditEvent(req, res) {
        res.set(
            "Cache-Control",
            "no-store",
        );

        try {
            const result =
                await adminAuditReadService
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
        audit,
        auditEvent,
    };
}

module.exports = {
    createAdminAuditReadController,
};