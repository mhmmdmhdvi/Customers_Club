function buildTotpUri({
    secret,
    accountLabel,
    issuer,
}) {
    if (
        typeof secret !== "string" ||
        secret.length < 1 ||
        typeof accountLabel !== "string" ||
        accountLabel.length < 1 ||
        typeof issuer !== "string" ||
        issuer.length < 1
    ) {
        throw new TypeError(
            "Invalid TOTP enrollment input",
        );
    }

    const label =
        encodeURIComponent(
            `${issuer}:${accountLabel}`,
        );

    const encodedIssuer =
        encodeURIComponent(issuer);

    return (
        `otpauth://totp/${label}` +
        `?secret=${encodeURIComponent(secret)}` +
        `&issuer=${encodedIssuer}` +
        `&algorithm=SHA1` +
        `&digits=6` +
        `&period=30`
    );
}

module.exports = {
    buildTotpUri,
};