import {
    Activity,
    CheckCircle2,
    XCircle,
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

function actionLabel(action) {
    const labels = {
        CONTACT_MESSAGE_STATUS_CHANGED:
            "تغییر وضعیت پیام تماس",
    };

    return labels[action] ?? action;
}

function targetLabel(
    targetType,
    targetId,
) {
    const labels = {
        CONTACT_MESSAGE:
            "پیام تماس",
        USER: "کاربر",
    };

    const type =
        labels[targetType] ??
        targetType;

    return `${type} #${formatNumber(
        targetId,
    )}`;
}

function outcomeLabel(outcome) {
    return outcome === "SUCCESS"
        ? "موفق"
        : "ناموفق";
}

export function AdminActivitySection({
    accessToken,
}) {
    const [result, setResult] =
        useState(null);

    const [status, setStatus] =
        useState("loading");

    useEffect(() => {
        let isCurrent = true;

        fetch(
            `${API_BASE_URL}/admin/audit?page=1&pageSize=20`,
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
                        "Audit request failed",
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
            aria-labelledby="admin-activity-heading"
            className="mx-auto max-w-7xl"
        >
            <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2
                        id="admin-activity-heading"
                        className="text-xl font-black text-slate-900"
                    >
                        فعالیت‌ها
                    </h2>

                    <p className="mt-2 text-sm leading-7 text-slate-500">
                        سابقه تغییرات و عملیات انجام‌شده توسط مدیران
                    </p>
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

            {status === "loading" ? (
                <div
                    role="status"
                    aria-label="در حال دریافت فعالیت‌ها"
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
                        دریافت سابقه فعالیت‌ها ناموفق بود.
                    </p>

                    <p className="mt-2 text-sm leading-6 text-slate-500">
                        اتصال به سرور را بررسی کرده و دوباره تلاش کنید.
                    </p>
                </div>
            ) : null}

            {status === "success" &&
                events.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                    <Activity
                        className="mx-auto size-8 text-slate-300"
                        aria-hidden="true"
                    />

                    <p className="mt-4 font-bold text-slate-700">
                        فعالیتی ثبت نشده است
                    </p>

                    <p className="mt-2 text-sm text-slate-400">
                        رویدادهای مدیریتی در این بخش نمایش داده می‌شوند.
                    </p>
                </div>
            ) : null}

            {status === "success" &&
                events.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_-26px_rgba(15,23,42,0.35)]">
                    <table className="w-full text-sm">
                        <thead className="hidden border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500 md:table-header-group">
                            <tr>
                                <th className="px-5 py-4 text-right font-bold">
                                    فعالیت
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    مدیر
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    هدف
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    نتیجه
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    زمان
                                </th>
                            </tr>
                        </thead>

                        <tbody className="block space-y-3 p-3 md:table-row-group md:space-y-0 md:p-0">
                            {events.map(
                                (event) => (
                                    <tr
                                        key={
                                            event.id
                                        }
                                        className="block overflow-hidden rounded-xl border border-slate-200 bg-white md:table-row md:rounded-none md:border-0 md:border-b md:border-slate-100 md:last:border-b-0 md:hover:bg-slate-50/60"
                                    >
                                        <td className="block border-b border-slate-100 px-4 py-4 md:table-cell md:border-b-0 md:px-5">
                                            <div className="flex items-center gap-3">
                                                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                                                    <Activity
                                                        className="size-4"
                                                        aria-hidden="true"
                                                    />
                                                </div>

                                                <div>
                                                    <p className="font-bold text-slate-800">
                                                        {actionLabel(
                                                            event.action,
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

                                        <td className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 md:table-cell md:border-b-0 md:px-5 md:py-4">
                                            <span className="text-xs font-bold text-slate-400 md:hidden">
                                                مدیر
                                            </span>

                                            <span className="font-medium text-slate-600">
                                                مدیر #
                                                {formatNumber(
                                                    event.actorUserId,
                                                )}
                                            </span>
                                        </td>

                                        <td className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 md:table-cell md:border-b-0 md:px-5 md:py-4">
                                            <span className="text-xs font-bold text-slate-400 md:hidden">
                                                هدف
                                            </span>

                                            <span className="text-slate-600">
                                                {targetLabel(
                                                    event.targetType,
                                                    event.targetId,
                                                )}
                                            </span>
                                        </td>

                                        <td className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 md:table-cell md:border-b-0 md:px-5 md:py-4">
                                            <span className="text-xs font-bold text-slate-400 md:hidden">
                                                نتیجه
                                            </span>

                                            <span
                                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${event.outcome ===
                                                        "SUCCESS"
                                                        ? "bg-emerald-50 text-emerald-700"
                                                        : "bg-red-50 text-red-700"
                                                    }`}
                                            >
                                                {event.outcome ===
                                                    "SUCCESS" ? (
                                                    <CheckCircle2
                                                        className="size-3.5"
                                                        aria-hidden="true"
                                                    />
                                                ) : (
                                                    <XCircle
                                                        className="size-3.5"
                                                        aria-hidden="true"
                                                    />
                                                )}

                                                {outcomeLabel(
                                                    event.outcome,
                                                )}
                                            </span>
                                        </td>

                                        <td className="flex items-center justify-between gap-4 px-4 py-3 md:table-cell md:px-5 md:py-4">
                                            <span className="text-xs font-bold text-slate-400 md:hidden">
                                                زمان
                                            </span>

                                            <span className="text-slate-500">
                                                {formatDate(
                                                    event.createdAt,
                                                )}
                                            </span>
                                        </td>
                                    </tr>
                                ),
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