const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildTotpUri,
} = require(
    "../src/security/admin-mfa-enrollment",
);

test("builds a standard TOTP authenticator URI", () => {
    const uri =
        buildTotpUri({
            secret:
                "JBSWY3DPEHPK3PXP",
            accountLabel:
                "admin-1",
            issuer:
                "Megatite Customer Club",
        });

    assert.equal(
        uri,
        "otpauth://totp/Megatite%20Customer%20Club%3Aadmin-1?secret=JBSWY3DPEHPK3PXP&issuer=Megatite%20Customer%20Club&algorithm=SHA1&digits=6&period=30",
    );
});