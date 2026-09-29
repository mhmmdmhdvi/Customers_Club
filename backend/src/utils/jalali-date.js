const {
    isValidJalaaliDate,
    toJalaali,
} = require("jalaali-js");

function getTehranJalaliDate(
    now = new Date(),
) {
    if (
        !(now instanceof Date) ||
        Number.isNaN(now.getTime())
    ) {
        throw new TypeError(
            "A valid date is required",
        );
    }

    const formatter =
        new Intl.DateTimeFormat(
            "en-CA-u-ca-gregory-nu-latn",
            {
                timeZone:
                    "Asia/Tehran",
                year: "numeric",
                month: "numeric",
                day: "numeric",
            },
        );

    const parts =
        formatter.formatToParts(
            now,
        );

    const values =
        Object.fromEntries(
            parts
                .filter(
                    (part) =>
                        [
                            "year",
                            "month",
                            "day",
                        ].includes(
                            part.type,
                        ),
                )
                .map(
                    (part) => [
                        part.type,
                        Number(
                            part.value,
                        ),
                    ],
                ),
        );

    const jalali =
        toJalaali(
            values.year,
            values.month,
            values.day,
        );

    return {
        year: jalali.jy,
        month: jalali.jm,
        day: jalali.jd,
    };
}

function isValidPastJalaliDate(
    birthYear,
    birthMonth,
    birthDay,
    now = new Date(),
) {
    if (
        !Number.isInteger(
            birthYear,
        ) ||
        !Number.isInteger(
            birthMonth,
        ) ||
        !Number.isInteger(
            birthDay,
        )
    ) {
        return false;
    }

    if (
        !isValidJalaaliDate(
            birthYear,
            birthMonth,
            birthDay,
        )
    ) {
        return false;
    }

    const today =
        getTehranJalaliDate(
            now,
        );

    if (
        birthYear !==
        today.year
    ) {
        return (
            birthYear <
            today.year
        );
    }

    if (
        birthMonth !==
        today.month
    ) {
        return (
            birthMonth <
            today.month
        );
    }

    return (
        birthDay <
        today.day
    );
}

module.exports = {
    getTehranJalaliDate,
    isValidPastJalaliDate,
};