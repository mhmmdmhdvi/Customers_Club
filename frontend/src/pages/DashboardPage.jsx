import { useEffect } from "react";

import { useAuth } from "../auth/AuthContext";
import { SiteHeader } from "../components/layout/SiteHeader";
import { formatPersianJoinDate } from "../utils/formatPersianDate";

export function DashboardPage({
    onRequireLogin = () => { },
}) {
    const { session, authStatus } = useAuth();

    useEffect(() => {
        if (
            authStatus === "unauthenticated" ||
            authStatus === "error"
        ) {
            onRequireLogin();
        }
    }, [authStatus, onRequireLogin]);

    if (authStatus === "restoring") {
        return (
            <main
                dir="rtl"
                className="min-h-screen bg-surface px-4 pt-28"
            >
                <p
                    role="status"
                    className="text-sm text-muted-foreground"
                >
                    در حال بررسی وضعیت ورود...
                </p>
            </main>
        );
    }

    if (
        authStatus !== "authenticated" ||
        !session
    ) {
        return null;
    }

    const rows = [
        {
            label: "نام",
            value: session.user.firstName,
        },
        {
            label: "نام خانوادگی",
            value: session.user.lastName,
        },
        {
            label: "شماره موبایل",
            value: (
                <span
                    dir="ltr"
                    className="inline-block"
                >
                    {session.user.phone}
                </span>
            ),
        },
        {
            label: "وضعیت عضویت",
            value: "فعال",
        },
        {
            label: "تاریخ عضویت",
            value: formatPersianJoinDate(
                session.user.createdAt,
            ),
        },
    ];

    return (
        <div
            dir="rtl"
            className="min-h-screen bg-surface"
        >
            <SiteHeader solid />

            <main className="page-container pt-28 pb-16">
                <h1 className="text-2xl font-extrabold text-foreground">
                    اطلاعات عضویت
                </h1>

                <div className="mt-8 overflow-hidden border border-border bg-background">
                    <table className="w-full border-collapse text-sm">
                        <tbody>
                            {rows.map((row) => (
                                <tr
                                    key={row.label}
                                    className="border-b border-border last:border-b-0"
                                >
                                    <th
                                        scope="row"
                                        className="w-2/5 bg-surface px-4 py-4 text-right font-semibold text-foreground sm:w-1/3 sm:px-6"
                                    >
                                        {row.label}
                                    </th>

                                    <td className="px-4 py-4 text-right text-foreground sm:px-6">
                                        {row.value}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}