import {
    AlertTriangle,
    ShieldAlert,
    ShieldCheck,
    UserX,
} from "lucide-react";
import {
    useEffect,
    useState,
} from "react";

const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ??
    "http://localhost:3000";

function formatNumber(value) {
    return new Intl.NumberFormat(
        "fa-IR",
    ).format(value);
}

function formatDate(value) {
    return new Intl.DateTimeFormat(
        "fa-IR",
        {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        },
    ).format(new Date(value));
}

function eventTypeLabel(eventType) {
    const labels = {
        AUTHENTICATION_REJECTED:
            "رد احراز هویت",

        AUTHORIZATION_REJECTED:
            "رد دسترسی",

        CSRF_REJECTED:
            "رد درخواست CSRF",
    };

    return (
        labels[eventType] ??
        eventType
    );
}

function eventTypeIcon(eventType) {
    if (
        eventType ===
        "AUTHENTICATION_REJECTED"
    ) {
        return UserX;
    }

    if (
        eventType ===
        "AUTHORIZATION_REJECTED"
    ) {
        return ShieldAlert;
    }

    return AlertTriangle;
}

function actorLabel(actorUserId) {
    if (
        actorUserId === null ||
        actorUserId === undefined
    ) {
        return "کاربر ناشناس";
    }

    return `کاربر #${formatNumber(
        actorUserId,
    )}`;
}

function outcomeLabel(outcome) {
    return outcome === "SUCCESS"
        ? "موفق"
        : "ناموفق";
}

export function AdminSecuritySection({
    accessToken,
}) {
    const [result, setResult] =
        useState(null);

    const [status, setStatus] =
        useState("loading");

    useEffect(() => {
        let isCurrent = true;

        fetch(
            `${API_BASE_URL}/admin/security?page=1&pageSize=20`,
            {
                headers: {
                    Authorization:
                        `Bearer ${accessToken}`,
                },
            },
        )
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(
                        "Security request failed",
                    );
                }

                return response.json();
            })
            .then((data) => {
                if (!isCurrent) {
                    return;
                }

                setResult(data);
                setStatus("success");
            })
            .catch(() => {
                if (!isCurrent) {
                    return;
                }

                setResult(null);
                setStatus("error");
            });

        return () => {
            isCurrent = false;
        };
    }, [accessToken]);

    const events =
        result?.items ?? [];

    const total =
        result?.pagination?.total ?? 0;

    return (
        <section
            aria-labelledby="admin-security-heading"
            className="mx-auto max-w-7xl"
        >
            <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="grid size-10 place-items-center rounded-xl bg-red-50 text-red-600">
                            <ShieldCheck
                                className="size-5"
                                aria-hidden="true"
                            />
                        </div>

                        <div>
                            <h2
                                id="admin-security-heading"
                                className="text-xl font-black text-slate-900"
                            >
                                امنیت و مانیتورینگ
                            </h2>

                            <p className="mt-1 text-sm leading-7 text-slate-500">
                                رویدادهای امنیتی و درخواست‌های ردشده
                            </p>
                        </div>
                    </div>
                </div>

                {status === "success" ? (
                    <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500">
                        {formatNumber(
                            total,
                        )}{" "}
                        رویداد
                    </div>
                ) : null}
            </header>

            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                <div className="flex items-start gap-3">
                    <AlertTriangle
                        className="mt-0.5 size-5 shrink-0 text-amber-600"
                        aria-hidden="true"
                    />

                    <p className="text-xs leading-6 text-amber-800 sm:text-sm">
                        این بخش تلاش‌های ناموفق برای ورود یا دسترسی به
                        بخش مدیریت و درخواست‌های امنیتی ردشده را نمایش
                        می‌دهد.
                    </p>
                </div>
            </div>

            {status === "loading" ? (
                <div
                    role="status"
                    aria-label="در حال دریافت رویدادهای امنیتی"
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                >
                    <div className="animate-pulse space-y-4 p-6">
                        <div className="h-14 rounded-xl bg-slate-100" />
                        <div className="h-14 rounded-xl bg-slate-100" />
                        <div className="h-14 rounded-xl bg-slate-100" />
                    </div>
                </div>
            ) : null}

            {status === "error" ? (
                <div
                    role="alert"
                    className="rounded-2xl border border-red-200 bg-white p-5"
                >
                    <p className="font-bold text-red-700">
                        دریافت رویدادهای امنیتی ناموفق بود.
                    </p>

                    <p className="mt-2 text-sm leading-6 text-slate-500">
                        اتصال به سرور را بررسی کرده و دوباره تلاش کنید.
                    </p>
                </div>
            ) : null}

            {status === "success" &&
                events.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                    <ShieldCheck
                        className="mx-auto size-8 text-slate-300"
                        aria-hidden="true"
                    />

                    <p className="mt-4 font-bold text-slate-700">
                        رویداد امنیتی ثبت نشده است
                    </p>

                    <p className="mt-2 text-sm leading-6 text-slate-400">
                        رویدادهای امنیتی ثبت‌شده در این بخش نمایش داده
                        می‌شوند.
                    </p>
                </div>
            ) : null}

            {status === "success" &&
                events.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_-26px_rgba(15,23,42,0.35)]">
                    <table className="w-full text-sm">
                        <thead className="hidden border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500 lg:table-header-group">
                            <tr>
                                <th className="px-5 py-4 text-right font-bold">
                                    رویداد
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    کاربر
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    مسیر
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    کد پاسخ
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    نتیجه
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    زمان
                                </th>
                            </tr>
                        </thead>

                        <tbody className="block space-y-3 p-3 lg:table-row-group lg:space-y-0 lg:p-0">
                            {events.map(
                                (event) => {
                                    const Icon =
                                        eventTypeIcon(
                                            event.eventType,
                                        );

                                    return (
                                        <tr
                                            key={
                                                event.id
                                            }
                                            className="block overflow-hidden rounded-xl border border-slate-200 bg-white lg:table-row lg:rounded-none lg:border-0 lg:border-b lg:border-slate-100 lg:last:border-b-0 lg:hover:bg-slate-50/60"
                                        >
                                            <td className="block border-b border-slate-100 px-4 py-4 lg:table-cell lg:border-b-0 lg:px-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600">
                                                        <Icon
                                                            className="size-4"
                                                            aria-hidden="true"
                                                        />
                                                    </div>

                                                    <div className="min-w-0">
                                                        <p className="font-bold text-slate-800">
                                                            {eventTypeLabel(
                                                                event.eventType,
                                                            )}
                                                        </p>

                                                        {event.requestId ? (
                                                            <p
                                                                dir="ltr"
                                                                className="mt-1 max-w-[220px] truncate text-left text-xs text-slate-400"
                                                            >
                                                                {
                                                                    event.requestId
                                                                }
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 lg:table-cell lg:border-b-0 lg:px-5 lg:py-4">
                                                <span className="text-xs font-bold text-slate-400 lg:hidden">
                                                    کاربر
                                                </span>

                                                <span className="font-medium text-slate-600">
                                                    {actorLabel(
                                                        event.actorUserId,
                                                    )}
                                                </span>
                                            </td>

                                            <td className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 lg:table-cell lg:border-b-0 lg:px-5 lg:py-4">
                                                <span className="text-xs font-bold text-slate-400 lg:hidden">
                                                    مسیر
                                                </span>

                                                <span
                                                    dir="ltr"
                                                    className="max-w-[260px] truncate text-left font-mono text-xs text-slate-600"
                                                >
                                                    {
                                                        event.route
                                                    }
                                                </span>
                                            </td>

                                            <td className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 lg:table-cell lg:border-b-0 lg:px-5 lg:py-4">
                                                <span className="text-xs font-bold text-slate-400 lg:hidden">
                                                    کد پاسخ
                                                </span>

                                                <span
                                                    dir="ltr"
                                                    className={`inline-flex min-w-12 justify-center rounded-lg px-2.5 py-1 text-xs font-black ${event.statusCode >=
                                                            500
                                                            ? "bg-red-50 text-red-700"
                                                            : event.statusCode >=
                                                                400
                                                                ? "bg-amber-50 text-amber-700"
                                                                : "bg-slate-100 text-slate-700"
                                                        }`}
                                                >
                                                    {
                                                        event.statusCode
                                                    }
                                                </span>
                                            </td>

                                            <td className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 lg:table-cell lg:border-b-0 lg:px-5 lg:py-4">
                                                <span className="text-xs font-bold text-slate-400 lg:hidden">
                                                    نتیجه
                                                </span>

                                                <span
                                                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${event.outcome ===
                                                            "SUCCESS"
                                                            ? "bg-emerald-50 text-emerald-700"
                                                            : "bg-red-50 text-red-700"
                                                        }`}
                                                >
                                                    {outcomeLabel(
                                                        event.outcome,
                                                    )}
                                                </span>
                                            </td>

                                            <td className="flex items-center justify-between gap-4 px-4 py-3 lg:table-cell lg:px-5 lg:py-4">
                                                <span className="text-xs font-bold text-slate-400 lg:hidden">
                                                    زمان
                                                </span>

                                                <span className="text-slate-500">
                                                    {formatDate(
                                                        event.createdAt,
                                                    )}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                },
                            )}
                        </tbody>
                    </table>

                    <div className="border-t border-slate-100 px-5 py-4">
                        <p className="text-xs text-slate-400">
                            نمایش{" "}
                            {formatNumber(
                                events.length,
                            )}{" "}
                            مورد از{" "}
                            {formatNumber(
                                total,
                            )}{" "}
                            رویداد
                        </p>
                    </div>
                </div>
            ) : null}
        </section>
    );
}