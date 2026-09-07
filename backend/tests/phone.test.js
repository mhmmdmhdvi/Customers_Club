const test = require("node:test");
const assert = require("node:assert/strict");
const {
    normalizePhone,
    isValidIranianPhone,
} = require("../src/utils/phone");

test("converts a +98 phone number to the local 09 format", () => {
    const result = normalizePhone("+989121234567");

    assert.equal(result, "09121234567");
});

test("converts a 0098 phone number to the local 09 format", () => {
    const result = normalizePhone("00989121234567");

    assert.equal(result, "09121234567");
});

test("removes spaces from a phone number", () => {
    const result = normalizePhone("  +98 912 123 4567  ");

    assert.equal(result, "09121234567");
});

test("removes hyphens from a phone number", () => {
    const result = normalizePhone("0912-123-4567");

    assert.equal(result, "09121234567");
});

test("returns null when the phone is a number instead of a string", () => {
    const result = normalizePhone(9121234567);

    assert.equal(result, null);
});

test("keeps a phone number already in the local 09 format unchanged", () => {
    const result = normalizePhone("09121234567");

    assert.equal(result, "09121234567");
});

test("accepts a phone number in the local 09 format", () => {
    const result = isValidIranianPhone("09121234567");

    assert.equal(result, true);
});

test("rejects a phone number that is shorter than 11 digits", () => {
    const result = isValidIranianPhone("0912123456");

    assert.equal(result, false);
});

test("rejects a phone number that is longer than 11 digits", () => {
    const result = isValidIranianPhone("091212345678");

    assert.equal(result, false);
});

test("rejects an 11-digit phone number that does not start with 09", () => {
    const result = isValidIranianPhone("08121234567");

    assert.equal(result, false);
});

test("rejects a phone number containing a letter", () => {
    const result = isValidIranianPhone("0912123a567");

    assert.equal(result, false);
});

test("rejects an array containing a valid-format phone number", () => {
    const result = isValidIranianPhone(["09121234567"]);

    assert.equal(result, false);
});