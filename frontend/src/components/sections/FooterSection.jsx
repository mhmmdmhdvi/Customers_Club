const links = [
    {
        label: "درباره ما",
        href: "#about",
    },
    {
        label: "رویدادها",
        href: "#events",
    },
    {
        label: "تماس با ما",
        href: "#contact",
    },
];

export function FooterSection() {
    return (
        <footer
            aria-label="پاورقی سایت"
            className="relative overflow-hidden border-t border-border bg-ink py-16"
        >
            <div
                className="blueprint-grid-invert pointer-events-none absolute inset-0 opacity-40"
                aria-hidden="true"
            />

            <div className="page-container relative">

                <div className="grid gap-10 lg:grid-cols-12 lg:items-start">

                    {/* Brand */}
                    <div
                        className="reveal lg:col-span-6"
                        data-reveal
                    >
                        <p className="text-lg font-black text-ink-foreground">
                            باشگاه مشتریان
                        </p>

                        <p
                            className="mt-1 text-[10px] font-medium tracking-[0.16em] text-ink-muted"
                            dir="ltr"
                        >
                            ADHESIVE PRO CLUB
                        </p>

                        <p className="mt-5 max-w-sm text-sm leading-7 text-ink-muted">
                            جامعه‌ای تخصصی برای ارتباط،
                            یادگیری و رشد حرفه‌ای فعالان
                            صنعت ساختمان.
                        </p>
                    </div>


                    {/* Links */}
                    <div
                        className="reveal lg:col-span-2"
                        data-reveal
                        style={{
                            transitionDelay: "80ms",
                        }}
                    >
                        <h2 className="text-sm font-extrabold text-ink-foreground">
                            دسترسی سریع
                        </h2>

                        <nav
                            aria-label="لینک‌های سریع"
                            className="mt-5 flex flex-col gap-3"
                        >
                            {links.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    className="text-sm text-ink-muted transition-colors duration-300 hover:text-ink-foreground"
                                >
                                    {link.label}
                                </a>
                            ))}
                        </nav>
                    </div>


                    {/* Contact */}
                    <div
                        className="reveal lg:col-span-4"
                        data-reveal
                        style={{
                            transitionDelay: "160ms",
                        }}
                    >
                        <h2 className="text-sm font-extrabold text-ink-foreground">
                            ارتباط
                        </h2>

                        <div className="mt-5 space-y-2 text-sm leading-7 text-ink-muted">
                            <p>
                                تهران، ایران
                            </p>

                            <p>
                                info@example.com
                            </p>

                            <p>
                                ۰۲۱-۱۲۳۴۵۶۷۸
                            </p>
                        </div>
                    </div>

                </div>


                <div className="mt-12 border-t border-ink-muted/20 pt-6 text-xs text-ink-muted">
                    © تمامی حقوق محفوظ است.
                </div>

            </div>
        </footer>
    );
}