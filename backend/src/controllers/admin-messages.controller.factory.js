const {
    AdminMessagesError,
} = require(
    "../services/admin-messages.service.factory",
);

function createAdminMessagesController({
    adminMessagesService,
}) {
    function handleError(
        res,
        error,
        operation,
    ) {
        if (
            error instanceof
            AdminMessagesError
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
            `Admin messages ${operation} failed`,
        );

        return res
            .status(500)
            .json({
                message:
                    "Internal server error",
            });
    }

    async function messages(req, res) {
        res.set(
            "Cache-Control",
            "no-store",
        );

        try {
            const result =
                await adminMessagesService
                    .getMessages(
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

    async function message(req, res) {
        res.set(
            "Cache-Control",
            "no-store",
        );

        try {
            const result =
                await adminMessagesService
                    .getMessageById(
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

    async function updateMessageStatus(req, res) {
        res.set(
            "Cache-Control",
            "no-store",
        );

        try {
            const result =
                await adminMessagesService
                    .updateMessageStatus({
                        id: req.params.id,
                        status:
                            req.body?.status,
                        actorUserId:
                            req.auth?.user?.id,
                        requestId:
                            req.requestId,
                    });

            return res
                .status(200)
                .json(result);
        } catch (error) {
            return handleError(
                res,
                error,
                "status update operation",
            );
        }
    }

    return {
        messages,
        message,
        updateMessageStatus,
    };
}

module.exports = {
    createAdminMessagesController,
};