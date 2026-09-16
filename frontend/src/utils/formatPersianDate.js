const formatter = new Intl.DateTimeFormat(
    "fa-IR-u-ca-persian",
    {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "Asia/Tehran",
    },
);

export function formatPersianJoinDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new TypeError("Invalid membership date");
    }

    return formatter.format(date);
}