function normalizePhone(phone) {
    if (typeof phone !== "string") {
        return null;
    }

    let normalized = phone
        .trim()
        .replace(/\s+/g, "")
        .replace(/-/g, "");

    if (normalized.startsWith("+98")) {
        normalized = `0${normalized.slice(3)}`;
    }

    if (normalized.startsWith("0098")) {
        normalized = `0${normalized.slice(4)}`;
    }

    return normalized;
}

function isValidIranianPhone(phone) {
    return (
        typeof phone === "string" &&
        /^09\d{9}$/.test(phone)
    );
}

module.exports = {
    isValidIranianPhone,
    normalizePhone,
};