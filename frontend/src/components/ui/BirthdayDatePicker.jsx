import { CalendarDays } from "lucide-react";
import jalali from "react-date-object/calendars/jalali";
import persianFa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";
import DatePicker from "react-multi-date-picker";

function toPersianDigits(value) {
    return String(value).replace(
        /\d/g,
        (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)],
    );
}

export function getBirthdayParts(date) {
    return {
        birthYear: date.year,
        birthMonth: date.month.number,
        birthDay: date.day,
    };
}

function BirthdayTrigger({
    openCalendar,
    displayValue,
}) {
    return (
        <button
            type="button"
            onClick={openCalendar}
            className="flex w-full items-center gap-2 rounded-lg border border-border-strong bg-background px-4 py-3 text-right outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
            <CalendarDays
                size={20}
                aria-hidden="true"
            />

            {displayValue || "انتخاب تاریخ تولد"}
        </button>
    );
}

export function BirthdayDatePicker({
    value,
    onChange,
}) {
    const datePickerValue = value
        ? new DateObject({
            calendar: jalali,
            locale: persianFa,
            year: value.birthYear,
            month: value.birthMonth,
            day: value.birthDay,
        })
        : null;

    const displayValue = value
        ? `${toPersianDigits(value.birthYear)}/${toPersianDigits(value.birthMonth)}/${toPersianDigits(value.birthDay)}`
        : "";

    const latestBirthday = new Date();
    latestBirthday.setDate(latestBirthday.getDate() - 1);

    return (
        <div>
            <div>تاریخ تولد</div>

            <DatePicker
                value={datePickerValue}
                onChange={(date) => {
                    onChange(getBirthdayParts(date));
                }}
                calendar={jalali}
                locale={persianFa}
                maxDate={latestBirthday}
                containerClassName="w-full"
                render={
                    <BirthdayTrigger
                        displayValue={displayValue}
                    />
                }
            />
        </div>
    );
}