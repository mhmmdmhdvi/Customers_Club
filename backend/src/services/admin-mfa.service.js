const prisma = require(
    "../config/database",
);

const {
    readAdminMfaConfig,
} = require(
    "../config/admin-mfa",
);

const {
    createAdminMfaCrypto,
} = require(
    "../security/admin-mfa-crypto",
);

const {
    createAdminMfaService,
} = require(
    "./admin-mfa.service.factory",
);

// Validate MFA credentials only when an administrator uses MFA. Importing the
// app and MEMBER sessions must not depend on an administrator encryption key.
function service() {
    const config = readAdminMfaConfig();
    return createAdminMfaService(prisma, {
        mfaCrypto: createAdminMfaCrypto(config.encryptionKey),
    });
}

module.exports = {
    enroll: (...args) => service().enroll(...args),
    begin: (...args) => service().begin(...args),
    complete: (...args) => service().complete(...args),
};
