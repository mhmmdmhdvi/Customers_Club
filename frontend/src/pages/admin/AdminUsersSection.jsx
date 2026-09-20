import {
    ShieldCheck,
    UserRound,
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

function roleLabel(role) {
    return role === "ADMIN"
        ? "مدیر"
        : "عضو";
}

export function AdminUsersSection({
    accessToken,
}) {
    const [result, setResult] =
        useState(null);

    const [status, setStatus] =
        useState("loading");

    const [page, setPage] = useState(1);

    const [searchInput, setSearchInput] =
        useState("");

    const [search, setSearch] =
        useState("");

    useEffect(() => {
        let isCurrent = true;

        const params =
            new URLSearchParams({
                page: String(page),
                pageSize:
                    String(PAGE_SIZE),
            });

        if (search) {
            params.set(
                "search",
                search,
            );
        }

        fetch(
            `${API_BASE_URL}/admin/users?${params.toString()}`,
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
                        "Users request failed",
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
        search,
    ]);

    function handleSearch(event) {
        event.preventDefault();

        const normalized =
            searchInput
                .normalize("NFC")
                .trim();

        setPage(1);
        setSearch(normalized);
    }

    if (status === "loading") {
        return (
            <section
                aria-labelledby="admin-users-heading"
                className="mx-auto max-w-7xl"
            >
                <header className="mb-6">
                    <h2
                        id="admin-users-heading"
                        className="text-xl font-black text-slate-900"
                    >
                        کاربران
                    </h2>

                    <p className="mt-2 text-sm text-slate-500">
                        مدیریت و بررسی اعضای ثبت‌شده
                    </p>
                </header>

                <div
                    role="status"
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                >
                    <div className="animate-pulse space-y-4 p-6">
                        <div className="h-4 w-28 rounded bg-slate-100" />
                        <div className="h-12 rounded-xl bg-slate-100" />
                        <div className="h-12 rounded-xl bg-slate-100" />
                        <div className="h-12 rounded-xl bg-slate-100" />
                    </div>
                </div>
            </section>
        );
    }

    if (status === "error") {
        return (
            <section
                aria-labelledby="admin-users-heading"
                className="mx-auto max-w-7xl"
            >
                <h2
                    id="admin-users-heading"
                    className="text-xl font-black text-slate-900"
                >
                    کاربران
                </h2>

                <div
                    role="alert"
                    className="mt-6 rounded-2xl border border-red-200 bg-white p-5"
                >
                    <p className="font-bold text-red-700">
                        دریافت اطلاعات کاربران ناموفق بود.
                    </p>

                    <p className="mt-2 text-sm leading-6 text-slate-500">
                        اتصال به سرور را بررسی کرده و دوباره تلاش کنید.
                    </p>
                </div>
            </section>
        );
    }

    const users =
        result?.items ?? [];

    const total =
        result?.pagination?.total ?? 0;

    const totalPages =
        result?.pagination?.totalPages ?? 0;

    const currentPage =
        result?.pagination?.page ?? page;

    return (
        <section
            aria-labelledby="admin-users-heading"
            className="mx-auto max-w-7xl"
        >
            <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2
                        id="admin-users-heading"
                        className="text-xl font-black text-slate-900"
                    >
                        کاربران
                    </h2>

                    <p className="mt-2 text-sm leading-7 text-slate-500">
                        فهرست اعضا و مدیران باشگاه مشتریان
                    </p>
                </div>

                <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500">
                    {formatNumber(total)} کاربر
                </div>
            </header>

            <form
                role="search"
                onSubmit={handleSearch}
                className="mb-4 flex flex-col gap-2 sm:flex-row"
            >
                <input
                    type="search"
                    aria-label="جستجوی کاربران"
                    value={searchInput}
                    onChange={(event) =>
                        setSearchInput(
                            event.target.value,
                        )
                    }
                    placeholder="نام، نام خانوادگی یا شماره موبایل"
                    className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                />

                <button
                    type="submit"
                    className="min-h-11 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white transition hover:bg-slate-800"
                >
                    جستجو
                </button>
            </form>

            {users.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                    <UserRound
                        className="mx-auto size-8 text-slate-300"
                        aria-hidden="true"
                    />

                    <p className="mt-4 font-bold text-slate-700">
                        کاربری پیدا نشد
                    </p>

                    <p className="mt-2 text-sm text-slate-400">
                        هنوز کاربری برای نمایش وجود ندارد.
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_-26px_rgba(15,23,42,0.35)]">
                    <table className="w-full text-sm">
                        <thead className="hidden border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500 sm:table-header-group">
                            <tr>
                                <th className="px-5 py-4 text-right font-bold">
                                    کاربر
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    شماره موبایل
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    نقش
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    تاریخ عضویت
                                </th>

                                <th className="px-5 py-4 text-right font-bold">
                                    شناسه
                                </th>
                            </tr>
                        </thead>

                        <tbody className="block space-y-3 p-3 sm:table-row-group sm:space-y-0 sm:p-0">
                            {users.map((user) => (
                                <tr
                                    key={user.id}
                                    className="block overflow-hidden rounded-xl border border-slate-200 bg-white sm:table-row sm:rounded-none sm:border-0 sm:border-b sm:border-slate-100 sm:last:border-b-0 sm:hover:bg-slate-50/60"
                                >
                                    <td className="block border-b border-slate-100 px-4 py-4 sm:table-cell sm:border-b-0 sm:px-5">
                                        <div className="flex items-center gap-3">
                                            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 sm:size-9">
                                                <UserRound
                                                    className="size-4.5"
                                                    aria-hidden="true"
                                                />
                                            </div>

                                            <div className="min-w-0">
                                                <p className="truncate font-bold text-slate-800">
                                                    {user.firstName}{" "}
                                                    {user.lastName}
                                                </p>

                                                <p className="mt-1 text-xs text-slate-400">
                                                    آخرین بروزرسانی{" "}
                                                    {formatDate(
                                                        user.updatedAt,
                                                    )}
                                                </p>
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
                                            {user.phone}
                                        </span>
                                    </td>

                                    <td className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:table-cell sm:border-b-0 sm:px-5 sm:py-4">
                                        <span className="text-xs font-bold text-slate-400 sm:hidden">
                                            نقش
                                        </span>

                                        <span
                                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${user.role ===
                                                    "ADMIN"
                                                    ? "bg-violet-50 text-violet-700"
                                                    : "bg-blue-50 text-blue-700"
                                                }`}
                                        >
                                            {user.role ===
                                                "ADMIN" ? (
                                                <ShieldCheck
                                                    className="size-3.5"
                                                    aria-hidden="true"
                                                />
                                            ) : null}

                                            {roleLabel(
                                                user.role,
                                            )}
                                        </span>
                                    </td>

                                    <td className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:table-cell sm:border-b-0 sm:px-5 sm:py-4">
                                        <span className="text-xs font-bold text-slate-400 sm:hidden">
                                            تاریخ عضویت
                                        </span>

                                        <span className="text-slate-600">
                                            {formatDate(
                                                user.createdAt,
                                            )}
                                        </span>
                                    </td>

                                    <td className="flex items-center justify-between gap-4 px-4 py-3 sm:table-cell sm:px-5 sm:py-4">
                                        <span className="text-xs font-bold text-slate-400 sm:hidden">
                                            شناسه
                                        </span>

                                        <span className="text-slate-400">
                                            #
                                            {formatNumber(
                                                user.id,
                                            )}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="flex flex-col gap-4 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-slate-400">
                            نمایش{" "}
                            {formatNumber(
                                users.length,
                            )}{" "}
                            مورد از{" "}
                            {formatNumber(total)}{" "}
                            کاربر
                        </p>

                        <div className="flex items-center justify-between gap-2 sm:justify-start">
                            <button
                                type="button"
                                aria-label="صفحه قبل"
                                disabled={
                                    currentPage <= 1
                                }
                                onClick={() =>
                                    setPage(
                                        (current) =>
                                            Math.max(
                                                current - 1,
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
                                {totalPages > 0
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
                                    totalPages === 0
                                }
                                onClick={() =>
                                    setPage(
                                        (current) =>
                                            Math.min(
                                                current + 1,
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
            )}
        </section>
    );
}