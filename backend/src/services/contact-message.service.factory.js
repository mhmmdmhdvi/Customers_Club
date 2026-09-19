const crypto = require("node:crypto");

const {
    isValidIranianPhone,
    normalizePhone,
} = require("../utils/phone");

const ALLOWED_FIELDS = new Set([
    "name",
    "phone",
    "email",
    "subject",
    "message",
]);

const ALLOWED_SUBJECTS = new Set([
    "SUPPORT",
    "SUGGESTION",
    "COMPLAINT",
    "OTHER",
]);

class ContactMessageError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = "ContactMessageError";
        this.statusCode = statusCode;
    }
}

function normalizeRequiredText(
    value,
    label,
    maxLength,
) {
    if (typeof value !== "string") {
        throw new ContactMessageError(
            `${label} is required`,
        );
    }

    const normalized = value
        .normalize("NFC")
        .trim();

    const length = Array.from(normalized).length;

    if (length < 1 || length > maxLength) {
        throw new ContactMessageError(
            `${label} must contain 1 to ${maxLength} characters`,
        );
    }

    return normalized;
}

function normalizeName(value) {
    if (
        typeof value === "string" &&
        /\p{Cc}/u.test(value)
    ) {
        throw new ContactMessageError(
            "Name must not contain control characters",
        );
    }

    return normalizeRequiredText(
        value,
        "Name",
        80,
    );
}

function normalizeEmail(value) {
    if (
        value === undefined ||
        value === null
    ) {
        return null;
    }

    if (typeof value !== "string") {
        throw new ContactMessageError(
            "Invalid email",
        );
    }

    const email = value.trim().toLowerCase();

    // An empty email field is valid because email is optional.
    if (email === "") {
        return null;
    }

    if (
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            email,
        )
    ) {
        throw new ContactMessageError(
            "Invalid email",
        );
    }

    return email;
}

function parseContactMessage(input) {
    if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input)
    ) {
        throw new ContactMessageError(
            "Contact message details are required",
        );
    }

    if (
        Object.keys(input).some(
            (key) => !ALLOWED_FIELDS.has(key),
        )
    ) {
        throw new ContactMessageError(
            "Unexpected contact message field",
        );
    }

    const name = normalizeName(input.name);

    const phone = normalizePhone(input.phone);

    if (!isValidIranianPhone(phone)) {
        throw new ContactMessageError(
            "Invalid phone number",
        );
    }

    if (
        typeof input.subject !== "string" ||
        !ALLOWED_SUBJECTS.has(input.subject)
    ) {
        throw new ContactMessageError(
            "Invalid subject",
        );
    }

    const message = normalizeRequiredText(
        input.message,
        "Message",
        250,
    );

    return {
        name,
        phone,
        email: normalizeEmail(input.email),
        subject: input.subject,
        message,
    };
}

function contactMessageLockKey(phone) {
    return crypto
        .createHash("sha256")
        .update(
            `club-contact-message-lock-v1:${phone}`,
        )
        .digest()
        .readBigInt64BE(0);
}

async function defaultWithPhoneLock(
    prisma,
    phone,
    work,
) {
    return prisma.$transaction(
        async (tx) => {
            await tx.$executeRaw`
                SET LOCAL lock_timeout = '3s'
            `;

            await tx.$queryRaw`
                SELECT pg_advisory_xact_lock(
                    ${contactMessageLockKey(
                phone,
            )}::bigint
                )::text AS lock
            `;

            return work(tx);
        },
        {
            isolationLevel: "ReadCommitted",
            maxWait: 5000,
            timeout: 10000,
        },
    );
}

function createContactMessageService(
    prisma,
    {
        now = () => new Date(),
        withPhoneLock =
        defaultWithPhoneLock,
    } = {},
) {
    async function createMessage(input) {
        const data = parseContactMessage(input);

        return withPhoneLock(
            prisma,
            data.phone,
            async (tx) => {
                const currentTime = now();

                const oneHourAgo = new Date(
                    currentTime.getTime() -
                    60 * 60 * 1000,
                );

                const recentMessageCount =
                    await tx.contactMessage.count({
                        where: {
                            phone: data.phone,
                            createdAt: {
                                gte: oneHourAgo,
                            },
                        },
                    });

                if (
                    recentMessageCount >= 3
                ) {
                    throw new ContactMessageError(
                        "Too many contact messages",
                        429,
                    );
                }

                return tx.contactMessage.create({
                    data,
                });
            },
        );
    }

    return {
        createMessage,
    };
}

module.exports = {
    ContactMessageError,
    createContactMessageService,
};