const prisma = require("../config/database");

function generateCode() {
    return Math.floor(
        100000 + Math.random() * 900000,
    ).toString();
}


async function createOtp(phone) {
    const code = generateCode();

    const expiresAt = new Date(
        Date.now() + 2 * 60 * 1000,
    );

    await prisma.oTPCode.create({
        data: {
            phone,
            code,
            expiresAt,
        },
    });

    console.log(
        `Generated OTP for ${phone}: ${code}`,
    );
}


module.exports = {
    createOtp,
};