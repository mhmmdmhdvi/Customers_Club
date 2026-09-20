const {
    AdminUsersError,
} = require(
    "../services/admin-users.service.factory",
);

function createAdminUsersController({
    adminUsersService,
}) {
    async function users(req, res) {
        res.set(
            "Cache-Control",
            "no-store",
        );

        try {
            const result =
                await adminUsersService
                    .getUsers(req.query);

            return res
                .status(200)
                .json(result);
        } catch (error) {
            if (
                error instanceof
                AdminUsersError
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
                "Admin users operation failed",
            );

            return res
                .status(500)
                .json({
                    message:
                        "Internal server error",
                });
        }
    }

    return {
        users,
    };
}

module.exports = {
    createAdminUsersController,
};