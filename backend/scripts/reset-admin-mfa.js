require("../src/config/env");

const crypto =
    require("node:crypto");

const prisma =
    require("../src/config/database");

const {
    readAdminMfaConfig,
} = require(
    "../src/config/admin-mfa",
);

const {
    createAdminMfaCrypto,
} = require(
    "../src/security/admin-mfa-crypto",
);

const {
    createAdminMfaResetService,
} = require(
    "../src/services/admin-mfa-reset.service",
);

const {
    buildTotpUri,
} = require(
    "../src/security/admin-mfa-enrollment",
);

const {
    createAdminMfaResetRuntime,
} = require(
    "../src/security/admin-mfa-reset-runtime",
);

const config =
    readAdminMfaConfig();

const mfaCrypto =
    createAdminMfaCrypto(
        config.encryptionKey,
    );

const reset =
    createAdminMfaResetService(
        prisma,
        {
            mfaCrypto,
            randomBytes:
                crypto.randomBytes,
        },
    );

const run =
    createAdminMfaResetRuntime({
        prisma,
        reset,
        buildUri:
            buildTotpUri,

        writeLine: (line) => {
            console.log(line);
        },
    });

run(process.argv)
    .catch((error) => {
        console.error(
            error.message,
        );

        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });