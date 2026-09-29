const formatter = new Intl.DateTimeFormat(
    "fa-IR-u-ca-persian",
    {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "Asia/Tehran",
    },
);

const persianMonthNames = [
    "فروردین",
    "اردیبهشت",
    "خرداد",
    "تیر",
    "مرداد",
    "شهریور",
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
];

function toPersianDigits(value) {
    return String(value).replace(
        /\d/g,
        (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)],
    );
}

export function formatPersianJoinDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new TypeError("Invalid membership date");
    }

    return formatter.format(date);
}

export function formatPersianBirthday({
    birthYear,
    birthMonth,
    birthDay,
}) {
    return `${toPersianDigits(birthDay)} ${persianMonthNames[birthMonth - 1]} ${toPersianDigits(birthYear)}`;
}