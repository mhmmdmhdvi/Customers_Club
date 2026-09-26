require("../src/config/env");

const prisma =
    require("../src/config/database");

const adminMfaService =
    require("../src/services/admin-mfa.service");

const {
    buildTotpUri,
} = require(
    "../src/security/admin-mfa-enrollment",
);

const {
    createAdminMfaEnrollmentRuntime,
} = require(
    "../src/security/admin-mfa-enrollment-runtime",
);

const run =
    createAdminMfaEnrollmentRuntime({
        prisma,
        adminMfaService,

        buildUri: buildTotpUri,

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