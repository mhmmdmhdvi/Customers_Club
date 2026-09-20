function createAdminOverviewService(
    prisma,
    {
        now = () => new Date(),
    } = {},
) {
    async function getOverview() {
        const currentTime = now();

        const sevenDaysAgo = new Date(
            currentTime.getTime() -
                7 * 24 * 60 * 60 * 1000,
        );

        const [
            totalMembers,
            newMembersLast7Days,
            totalMessages,
            newMessages,
            activeSessions,
        ] = await Promise.all([
            prisma.user.count({
                where: {
                    role: "MEMBER",
                },
            }),

            prisma.user.count({
                where: {
                    role: "MEMBER",
                    createdAt: {
                        gte: sevenDaysAgo,
                    },
                },
            }),

            prisma.contactMessage.count(),

            prisma.contactMessage.count({
                where: {
                    status: "NEW",
                },
            }),

            prisma.authSession.count({
                where: {
                    revokedAt: null,
                    expiresAt: {
                        gt: currentTime,
                    },
                },
            }),
        ]);

        return {
            members: {
                total: totalMembers,
                newLast7Days:
                    newMembersLast7Days,
            },

            messages: {
                total: totalMessages,
                new: newMessages,
            },

            sessions: {
                active: activeSessions,
            },
        };
    }

    return {
        getOverview,
    };
}

module.exports = {
    createAdminOverviewService,
};