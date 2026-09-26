function readAdminMfaConfig(
    env = process.env,
) {
    const raw =
        env.ADMIN_MFA_ENCRYPTION_KEY;

    if (
        typeof raw !== "string" ||
        !/^[a-f0-9]{64}$/i.test(
            raw,
        )
    ) {
        throw new Error(
            "Invalid ADMIN MFA configuration",
        );
    }

    return {
        encryptionKey:
            Buffer.from(
                raw,
                "hex",
            ),
    };
}

module.exports = {
    readAdminMfaConfig,
};