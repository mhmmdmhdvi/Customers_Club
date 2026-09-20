function createAdminOverviewController({
    adminOverviewService,
}) {
    async function overview(_req, res) {
        res.set(
            "Cache-Control",
            "no-store",
        );

        try {
            const metrics =
                await adminOverviewService
                    .getOverview();

            return res
                .status(200)
                .json(metrics);
        } catch {
            console.error(
                "Admin overview operation failed",
            );

            return res.status(500).json({
                message:
                    "Internal server error",
            });
        }
    }

    return {
        overview,
    };
}

module.exports = {
    createAdminOverviewController,
};