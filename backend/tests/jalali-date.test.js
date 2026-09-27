const test = require("node:test");
const assert = require("node:assert/strict");

const {
    getTehranJalaliDate,
    isValidPastJalaliDate,
} = require(
    "../src/utils/jalali-date",
);

const NOW =
    new Date(
        "2026-09-27T12:00:00.000Z",
    );

test("accepts a valid historical Jalali birthday", () => {
    assert.equal(
        isValidPastJalaliDate(
            1375,
            7,
            12,
            NOW,
        ),
        true,
    );
});

test("rejects month outside 1 through 12", () => {
    assert.equal(
        isValidPastJalaliDate(
            1375,
            13,
            1,
            NOW,
        ),
        false,
    );
});

test("rejects invalid day for a 30-day month", () => {
    assert.equal(
        isValidPastJalaliDate(
            1400,
            7,
            31,
            NOW,
        ),
        false,
    );
});

test("accepts Esfand 30 in a leap year", () => {
    assert.equal(
        isValidPastJalaliDate(
            1399,
            12,
            30,
            NOW,
        ),
        true,
    );
});

test("rejects Esfand 30 in a non-leap year", () => {
    assert.equal(
        isValidPastJalaliDate(
            1400,
            12,
            30,
            NOW,
        ),
        false,
    );
});

test("rejects today's Jalali date as a birth date", () => {
    const today =
        getTehranJalaliDate(
            NOW,
        );

    assert.equal(
        isValidPastJalaliDate(
            today.year,
            today.month,
            today.day,
            NOW,
        ),
        false,
    );
});

test("accepts the previous Jalali day as a birth date", () => {
    const previousDay =
        getTehranJalaliDate(
            new Date(
                NOW.getTime() -
                24 * 60 * 60 * 1000,
            ),
        );

    assert.equal(
        isValidPastJalaliDate(
            previousDay.year,
            previousDay.month,
            previousDay.day,
            NOW,
        ),
        true,
    );
});

test("uses Asia/Tehran rather than the host timezone", () => {
    // These two instants are two minutes apart,
    // but they fall on opposite sides of midnight
    // in Tehran (UTC+03:30).
    const beforeTehranMidnight =
        new Date(
            "2026-09-27T20:29:00.000Z",
        );

    const afterTehranMidnight =
        new Date(
            "2026-09-27T20:31:00.000Z",
        );

    const previousTehranDate =
        getTehranJalaliDate(
            beforeTehranMidnight,
        );

    assert.equal(
        isValidPastJalaliDate(
            previousTehranDate.year,
            previousTehranDate.month,
            previousTehranDate.day,
            afterTehranMidnight,
        ),
        true,
    );
});