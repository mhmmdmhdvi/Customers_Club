import {
    Eye,
    Mail,
    MessageSquareText,
    X,
} from "lucide-react";
import {
    useEffect,
    useState,
} from "react";

const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ??
    "http://localhost:3000";

const PAGE_SIZE = 20;

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
            month: "long",
            day: "numeric",
        },
    ).format(new Date(value));
}

function subjectLabel(subject) {
    const labels = {
        SUPPORT: "پشتیبانی",
        SUGGESTION: "پیشنهاد",
        COMPLAINT: "شکایت",
        OTHER: "سایر",
    };

    return labels[subject] ?? subject;
}

function statusLabel(status) {
    const labels = {
        NEW: "جدید",
        READ: "خوانده‌شده",
        RESOLVED: "رسیدگی‌شده",
    };

    return labels[status] ?? status;
}

function statusClasses(status) {
    if (status === "NEW") {
        return "bg-blue-50 text-blue-700";
    }

    if (status === "READ") {
        return "bg-amber-50 text-amber-700";
    }

    return "bg-emerald-50 text-emerald-700";
}

function nextStatus(status) {
    if (status === "NEW") {
        return "READ";
    }

    if (status === "READ") {
        return "RESOLVED";
    }

    return null;
}

function nextStatusButtonLabel(status) {
    if (status === "NEW") {
        return "علامت‌گذاری به‌عنوان خوانده‌شده";
    }

    if (status === "READ") {
        return "علامت‌گذاری به‌عنوان رسیدگی‌شده";
    }

    return null;
}

export function AdminMessagesSection({
    accessToken,
}) {
    const [result, setResult] =
        useState(null);

    const [status, setStatus] =
        useState("loading");

    const [page, setPage] =
        useState(1);

    const [searchInput, setSearchInput] =
        useState("");

    const [statusInput, setStatusInput] =
        useState("");

    const [subjectInput, setSubjectInput] =
        useState("");

    const [filters, setFilters] =
        useState({
            search: "",
            status: "",
            subject: "",
        });

    const [
        isDetailOpen,
        setIsDetailOpen,
    ] = useState(false);

    const [
        selectedMessage,
        setSelectedMessage,
    ] = useState(null);

    const [
        detailStatus,
        setDetailStatus,
    ] = useState("idle");

    const [
        statusActionStatus,
        setStatusActionStatus,
    ] = useState("idle");

    useEffect(() => {
        let isCurrent = true;

        const params =
            new URLSearchParams({
                page: String(page),
                pageSize:
                    String(PAGE_SIZE),
            });

        if (filters.search) {
            params.set(
                "search",
                filters.search,
            );
        }

        if (filters.status) {
            params.set(
                "status",
                filters.status,
            );
        }

        if (filters.subject) {
            params.set(
                "subject",
                filters.subject,
            );
        }

        fetch(
            `${API_BASE_URL}/admin/messages?${params.toString()}`,
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
                        "Messages request failed",
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
    }, [
        accessToken,
        page,
        filters,
    ]);

    function handleFilters(event) {
        event.preventDefault();

        const normalizedSearch =
            searchInput
                .normalize("NFC")
                .trim();

        setPage(1);

        setFilters({
            search:
                normalizedSearch,
            status:
                statusInput,
            subject:
                subjectInput,
        });
    }

    async function handleOpenMessage(
        message,
    ) {
        setIsDetailOpen(true);
        setSelectedMessage(null);
        setDetailStatus("loading");
        setStatusActionStatus("idle");

        try {
            const response = await fetch(
                `${API_BASE_URL}/admin/messages/${message.id}`,
                {
                    headers: {
                        Authorization:
                            `Bearer ${accessToken}`,
                    },
                },
            );

            if (!response.ok) {
                throw new Error(
                    "Message detail request failed",
                );
            }

            const data =
                await response.json();

            setSelectedMessage(data);
            setDetailStatus("success");
        } catch {
            setSelectedMessage(null);
            setDetailStatus("error");
        }
    }

    function syncMessageIntoList(
        message,
    ) {
        setResult((current) => {
            if (!current) {
                return current;
            }

            return {
                ...current,

                items:
                    current.items.map(
                        (item) =>
                            item.id ===
                                message.id
                                ? {
                                    ...item,
                                    status:
                                        message.status,
                                    updatedAt:
                                        message.updatedAt,
                                }
                                : item,
                    ),
            };
        });
    }

    function handleCloseMessage() {
        if (selectedMessage) {
            syncMessageIntoList(
                selectedMessage,
            );
        }

        setIsDetailOpen(false);
        setSelectedMessage(null);
        setDetailStatus("idle");
        setStatusActionStatus("idle");
    }

    async function handleStatusChange() {
        if (
            !selectedMessage ||
            statusActionStatus ===
            "loading"
        ) {
            return;
        }

        const targetStatus =
            nextStatus(
                selectedMessage.status,
            );

        if (!targetStatus) {
            return;
        }

        setStatusActionStatus("loading");

        try {
            const response = await fetch(
                `${API_BASE_URL}/admin/messages/${selectedMessage.id}/status`,
                {
                    method: "PATCH",

                    headers: {
                        Authorization:
                            `Bearer ${accessToken}`,

                        "Content-Type":
                            "application/json",

                        "X-CSRF-Protection":
                            "1",
                    },

                    body: JSON.stringify({
                        status:
                            targetStatus,
                    }),
                },
            );

            if (!response.ok) {
                throw new Error(
                    "Status update failed",
                );
            }

            const updated =
                await response.json();

            setSelectedMessage(
                (current) => {
                    if (!current) {
                        return current;
                    }

                    return {
                        ...current,

                        status:
                            updated.status,

                        updatedAt:
                            updated.updatedAt ??
                            current.updatedAt,
                    };
                },
            );

            setStatusActionStatus(
                "success",
            );
        } catch {
            setStatusActionStatus(
                "error",
            );
        }
    }

    const messages =
        result?.items ?? [];

    const total =
        result?.pagination?.total ?? 0;

    const totalPages =
        result?.pagination
            ?.totalPages ?? 0;

    const currentPage =
        result?.pagination?.page ??
        page;

    const selectedNextStatus =
        selectedMessage
            ? nextStatus(
                selectedMessage.status,
            )
            : null;

    const statusButtonLabel =
        selectedMessage
            ? nextStatusButtonLabel(
                selectedMessage.status,
            )
            : null;

    return (
        <section
            aria-labelledby="admin-messages-heading"
            className="mx-auto max-w-7xl"
        >
            <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2
                        id="admin-messages-heading"
                        className="text-xl font-black text-slate-900"
                    >
                        پیام‌ها
                    </h2>

                    <p className="mt-2 text-sm leading-7 text-slate-500">
                        پیام‌های دریافتی از فرم تماس باشگاه مشتریان
                    </p>
                </div>

                {status === "success" ? (
                    <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500">
                        {formatNumber(
                            total,
                        )}{" "}
                        پیام
                    </div>
                ) : null}
            </header>

            <form
                role="search"
                onSubmit={handleFilters}
                className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_180px_auto]"
            >
                <input
                    type="search"
                    aria-label="جستجوی پیام‌ها"
                    value={searchInput}
                    onChange={(event) =>
                        setSearchInput(
                            event.target.value,
                        )
                    }
                    placeholder="نام، موبایل یا ایمیل"
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                />

                <select
                    aria-label="وضعیت پیام"
                    value={statusInput}
                    onChange={(event) =>
                        setStatusInput(
                            event.target.value,
                        )
                    }
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                >
                    <option value="">
                        همه وضعیت‌ها
                    </option>

                    <option value="NEW">
                        جدید
                    </option>

                    <option value="READ">
                        خوانده‌شده
                    </option>

                    <option value="RESOLVED">
                        رسیدگی‌شده
                    </option>
                </select>

                <select
                    aria-label="موضوع پیام"
                    value={subjectInput}
                    onChange={(event) =>
                        setSubjectInput(
                            event.target.value,
                        )
                    }
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                >
                    <option value="">
                        همه موضوع‌ها
                    </option>

                    <option value="SUPPORT">
                        پشتیبانی
                    </option>

                    <option value="SUGGESTION">
                        پیشنهاد
                    </option>

                    <option value="COMPLAINT">
                        شکایت
                    </option>

                    <option value="OTHER">
                        سایر
                    </option>
                </select>

                <button
                    type="submit"
                    className="min-h-11 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white transition hover:bg-slate-800"
                >
                    اعمال فیلترها
                </button>
            </form>

            {status === "loading" ? (
                <div
                    role="status"
                    aria-label="در حال دریافت پیام‌ها"
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
                        دریافت پیام‌ها ناموفق بود.
                    </p>

                    <p className="mt-2 text-sm leading-6 text-slate-500">
                        اتصال به سرور را بررسی کرده و دوباره تلاش کنید.
                    </p>
                </div>
            ) : null}

            {status === "success" &&
                messages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                    <MessageSquareText
                        className="mx-auto size-8 text-slate-300"
                        aria-hidden="true"
                    />

                    <p className="mt-4 font-bold text-slate-700">
                        پیامی پیدا نشد
                    </p>

                    <p className="mt-2 text-sm text-slate-400">
                        نتیجه‌ای مطابق فیلترهای انتخاب‌شده وجود ندارد.
                    </p>
                </div>
            ) : null}

            {status === "success" &&
                messages.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_-26px_rgba(15,23,42,0.35)]">
                    <table className="w-full text-sm">
                        <thead className="hidden border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500 sm:table-header-group">
                            <tr>
                                <th className="px-5 py-4 text-right font-bold">
                                    فرستنده
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    شماره موبایل
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    موضوع
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    وضعیت
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    تاریخ ارسال
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    جزئیات
                                </th>
                            </tr>
                        </thead>

                        <tbody className="block space-y-3 p-3 sm:table-row-group sm:space-y-0 sm:p-0">
                            {messages.map(
                                (
                                    message,
                                ) => (
                                    <tr
                                        key={
                                            message.id
                                        }
                                        className="block overflow-hidden rounded-xl border border-slate-200 bg-white sm:table-row sm:rounded-none sm:border-0 sm:border-b sm:border-slate-100 sm:last:border-b-0 sm:hover:bg-slate-50/60"
                                    >
                                        <td className="block border-b border-slate-100 px-4 py-4 sm:table-cell sm:border-b-0 sm:px-5">
                                            <div className="flex items-center gap-3">
                                                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 sm:size-9">
                                                    <Mail
                                                        className="size-4.5"
                                                        aria-hidden="true"
                                                    />
                                                </div>

                                                <div className="min-w-0">
                                                    <p className="truncate font-bold text-slate-800">
                                                        {
                                                            message.name
                                                        }
                                                    </p>

                                                    {message.email ? (
                                                        <p
                                                            dir="ltr"
                                                            className="mt-1 truncate text-left text-xs text-slate-400"
                                                        >
                                                            {
                                                                message.email
                                                            }
                                                        </p>
                                                    ) : (
                                                        <p className="mt-1 text-xs text-slate-400">
                                                            بدون ایمیل
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        <td className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:table-cell sm:border-b-0 sm:px-5 sm:py-4">
                                            <span className="text-xs font-bold text-slate-400 sm:hidden">
                                                شماره موبایل
                                            </span>

                                            <span
                                                dir="ltr"
                                                className="font-medium text-slate-600"
                                            >
                                                {
                                                    message.phone
                                                }
                                            </span>
                                        </td>

                                        <td className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:table-cell sm:border-b-0 sm:px-5 sm:py-4">
                                            <span className="text-xs font-bold text-slate-400 sm:hidden">
                                                موضوع
                                            </span>

                                            <span className="text-slate-600">
                                                {subjectLabel(
                                                    message.subject,
                                                )}
                                            </span>
                                        </td>

                                        <td className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:table-cell sm:border-b-0 sm:px-5 sm:py-4">
                                            <span className="text-xs font-bold text-slate-400 sm:hidden">
                                                وضعیت
                                            </span>

                                            <span
                                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClasses(
                                                    message.status,
                                                )}`}
                                            >
                                                {statusLabel(
                                                    message.status,
                                                )}
                                            </span>
                                        </td>

                                        <td className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:table-cell sm:border-b-0 sm:px-5 sm:py-4">
                                            <span className="text-xs font-bold text-slate-400 sm:hidden">
                                                تاریخ ارسال
                                            </span>

                                            <span className="text-slate-600">
                                                {formatDate(
                                                    message.createdAt,
                                                )}
                                            </span>
                                        </td>

                                        <td className="flex items-center justify-between gap-4 px-4 py-3 sm:table-cell sm:px-5 sm:py-4">
                                            <span className="text-xs font-bold text-slate-400 sm:hidden">
                                                جزئیات
                                            </span>

                                            <button
                                                type="button"
                                                aria-label={`مشاهده پیام ${message.name}`}
                                                onClick={() =>
                                                    handleOpenMessage(
                                                        message,
                                                    )
                                                }
                                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                                            >
                                                <Eye
                                                    className="size-4"
                                                    aria-hidden="true"
                                                />

                                                مشاهده
                                            </button>
                                        </td>
                                    </tr>
                                ),
                            )}
                        </tbody>
                    </table>

                    <div className="flex flex-col gap-4 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-slate-400">
                            نمایش{" "}
                            {formatNumber(
                                messages.length,
                            )}{" "}
                            مورد از{" "}
                            {formatNumber(
                                total,
                            )}{" "}
                            پیام
                        </p>

                        <div className="flex items-center justify-between gap-2 sm:justify-start">
                            <button
                                type="button"
                                aria-label="صفحه قبل"
                                disabled={
                                    currentPage <=
                                    1
                                }
                                onClick={() =>
                                    setPage(
                                        (
                                            current,
                                        ) =>
                                            Math.max(
                                                current -
                                                1,
                                                1,
                                            ),
                                    )
                                }
                                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                قبلی
                            </button>

                            <span className="px-2 text-xs font-bold text-slate-500">
                                صفحه{" "}
                                {formatNumber(
                                    currentPage,
                                )}
                                {totalPages >
                                    0
                                    ? ` از ${formatNumber(
                                        totalPages,
                                    )}`
                                    : ""}
                            </span>

                            <button
                                type="button"
                                aria-label="صفحه بعد"
                                disabled={
                                    currentPage >=
                                    totalPages ||
                                    totalPages ===
                                    0
                                }
                                onClick={() =>
                                    setPage(
                                        (
                                            current,
                                        ) =>
                                            Math.min(
                                                current +
                                                1,
                                                totalPages,
                                            ),
                                    )
                                }
                                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                بعدی
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {isDetailOpen ? (
                <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-6">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="admin-message-detail-title"
                        className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl"
                    >
                        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
                            <div>
                                <h3
                                    id="admin-message-detail-title"
                                    className="text-lg font-black text-slate-900"
                                >
                                    جزئیات پیام
                                </h3>

                                <p className="mt-1 text-xs text-slate-400">
                                    اطلاعات کامل پیام ارسالی
                                </p>
                            </div>

                            <button
                                type="button"
                                aria-label="بستن جزئیات پیام"
                                onClick={
                                    handleCloseMessage
                                }
                                className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                            >
                                <X
                                    className="size-4.5"
                                    aria-hidden="true"
                                />
                            </button>
                        </header>

                        <div className="p-5 sm:p-6">
                            {detailStatus ===
                                "loading" ? (
                                <div
                                    role="status"
                                    className="animate-pulse space-y-4"
                                >
                                    <div className="h-5 w-36 rounded bg-slate-100" />
                                    <div className="h-12 rounded-xl bg-slate-100" />
                                    <div className="h-28 rounded-xl bg-slate-100" />
                                </div>
                            ) : null}

                            {detailStatus ===
                                "error" ? (
                                <div
                                    role="alert"
                                    className="rounded-xl border border-red-200 bg-red-50 p-4"
                                >
                                    <p className="font-bold text-red-700">
                                        دریافت جزئیات پیام ناموفق بود.
                                    </p>
                                </div>
                            ) : null}

                            {detailStatus ===
                                "success" &&
                                selectedMessage ? (
                                <div className="space-y-6">
                                    <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2">
                                        <div>
                                            <p className="text-xs font-bold text-slate-400">
                                                فرستنده
                                            </p>

                                            <p className="mt-1 font-bold text-slate-800">
                                                {
                                                    selectedMessage.name
                                                }
                                            </p>
                                        </div>

                                        <div>
                                            <p className="text-xs font-bold text-slate-400">
                                                شماره موبایل
                                            </p>

                                            <p
                                                dir="ltr"
                                                className="mt-1 text-right font-medium text-slate-700"
                                            >
                                                {
                                                    selectedMessage.phone
                                                }
                                            </p>
                                        </div>

                                        <div>
                                            <p className="text-xs font-bold text-slate-400">
                                                موضوع
                                            </p>

                                            <p className="mt-1 font-medium text-slate-700">
                                                {subjectLabel(
                                                    selectedMessage.subject,
                                                )}
                                            </p>
                                        </div>

                                        <div>
                                            <p className="text-xs font-bold text-slate-400">
                                                وضعیت
                                            </p>

                                            <span
                                                className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClasses(
                                                    selectedMessage.status,
                                                )}`}
                                            >
                                                وضعیت فعلی:{" "}
                                                {statusLabel(
                                                    selectedMessage.status,
                                                )}
                                            </span>
                                        </div>

                                        {selectedMessage.email ? (
                                            <div className="sm:col-span-2">
                                                <p className="text-xs font-bold text-slate-400">
                                                    ایمیل
                                                </p>

                                                <p
                                                    dir="ltr"
                                                    className="mt-1 text-left text-sm text-slate-700"
                                                >
                                                    {
                                                        selectedMessage.email
                                                    }
                                                </p>
                                            </div>
                                        ) : null}
                                    </div>

                                    <div>
                                        <p className="mb-2 text-xs font-bold text-slate-400">
                                            متن پیام
                                        </p>

                                        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-8 text-slate-700">
                                            {
                                                selectedMessage.message
                                            }
                                        </div>
                                    </div>

                                    {statusActionStatus ===
                                        "error" ? (
                                        <div
                                            role="alert"
                                            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"
                                        >
                                            بروزرسانی وضعیت پیام ناموفق بود. وضعیت پیام را دوباره بررسی کنید.
                                        </div>
                                    ) : null}

                                    {statusActionStatus ===
                                        "success" ? (
                                        <p
                                            role="status"
                                            className="text-sm font-bold text-emerald-700"
                                        >
                                            وضعیت پیام با موفقیت بروزرسانی شد.
                                        </p>
                                    ) : null}

                                    {selectedNextStatus &&
                                        statusButtonLabel ? (
                                        <div className="border-t border-slate-200 pt-5">
                                            <button
                                                type="button"
                                                onClick={
                                                    handleStatusChange
                                                }
                                                disabled={
                                                    statusActionStatus ===
                                                    "loading"
                                                }
                                                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                                            >
                                                {statusActionStatus ===
                                                    "loading"
                                                    ? "در حال بروزرسانی..."
                                                    : statusButtonLabel}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
                                            رسیدگی به این پیام تکمیل شده است.
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}