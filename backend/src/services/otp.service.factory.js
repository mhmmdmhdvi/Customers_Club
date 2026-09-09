const crypto = require("node:crypto");

function createOtpService(prisma, { nodeEnv } = {}) {

    function generateCode() {
        return crypto.randomInt(100_000, 1_000_000).toString();
    }

    async function createOtp(phone) {
        await prisma.oTPCode.updateMany({
            where: {
                phone,
                used: false,
            },
            data: {
                used: true,
            },
        });
        const code = generateCode();

        const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

        await prisma.oTPCode.create({
            data: {
                phone,
                code,
                expiresAt,
            },
        });

        if (nodeEnv === "development") {
            console.log(`Generated OTP for ${phone}: ${code}`);
        }
    }

    async function verifyOtp(phone, code) {
        const otp = await prisma.oTPCode.findFirst({
            where: {
                phone,
                code,
                used: false,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        if (!otp) {
            throw new Error("Invalid OTP");
        }
        if (otp.expiresAt <= new Date()) {
            throw new Error("OTP expired");
        }
        await prisma.oTPCode.update({
            where: {
                id: otp.id,
            },
            data: {
                used: true,
            },
        });
        return true;
    }

    return {
        createOtp,
        verifyOtp,
    };
}

module.exports = { createOtpService };