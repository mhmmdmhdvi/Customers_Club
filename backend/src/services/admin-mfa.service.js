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

const config =
    readAdminMfaConfig();

const mfaCrypto =
    createAdminMfaCrypto(
        config.encryptionKey,
    );

module.exports =
    createAdminMfaService(
        prisma,
        {
            mfaCrypto,
        },
    );