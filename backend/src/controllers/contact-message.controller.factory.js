const {
    ContactMessageError,
} = require(
    "../services/contact-message.service.factory",
);

function createContactMessageController({
    contactMessageService,
}) {
    async function create(req, res) {
        res.set("Cache-Control", "no-store");

        try {
            await contactMessageService.createMessage(
                req.body,
            );

            return res.status(201).json({
                message: "Contact message received",
            });
        } catch (error) {
            if (
                error instanceof ContactMessageError
            ) {
                return res
                    .status(error.statusCode)
                    .json({
                        message: error.message,
                    });
            }

            console.error(
                "Contact message operation failed",
            );

            return res.status(500).json({
                message: "Internal server error",
            });
        }
    }

    return {
        create,
    };
}

module.exports = {
    createContactMessageController,
};