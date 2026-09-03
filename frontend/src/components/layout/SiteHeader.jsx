import { useState } from "react";
import { Menu, X } from "lucide-react";

const navigation = [
    { label: "رویدادها", href: "#events" },
    { label: "درباره ما", href: "#about" },
    { label: "تماس با ما", href: "#contact" },
];
export function SiteHeader() {
    const [isOpen, setIsOpen] = useState(false);
    function closeMenu() {
        setIsOpen(false);
    }
    return (
        <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
            <div className="page-container flex min-h-18 items-center justify-between gap-6 py-4">
                <a
                    href="#hero"
                    aria-label="صفحه اصلی باشگاه مشتریان"
                    className="flex items-center gap-3"
                >
                    <span
                        className="grid size-10 place-items-center bg-ink text-base font-black text-ink-foreground"
                        aria-hidden="true"
                    >
                        چ
                    </span>
                    <span className="leading-tight">
                        <span className="block text-sm font-extrabold">
                            باشگاه مشتریان
                        </span>
                        <span
                            className="block text-[10px] font-medium tracking-[0.16em] text-muted-foreground"
                            dir="ltr"
                        >
                            ADHESIVE PRO CLUB
                        </span>
                    </span>
                </a>
                {!isOpen && (
                    <button
                        type="button"
                        aria-label="باز کردن منو"
                        aria-expanded="false"
                        aria-controls="mobile-navigation"
                        onClick={() => setIsOpen(true)}
                        className="grid size-10 place-items-center border border-border bg-background text-foreground"
                    >
                        <Menu className="size-5" aria-hidden="true" />
                    </button>
                )}
            </div>
            {isOpen && (
                <>
                    <button
                        type="button"
                        aria-label="بستن منو با کلیک روی پس زمینه"
                        onClick={closeMenu}
                        className="fixed inset-0 z-40 cursor-default border-0 bg-ink/55 p-0 backdrop-blur-[1px]"
                    />
                    <nav
                        id="mobile-navigation"
                        aria-label="ناوبری موبایل"
                        className="fixed inset-y-0 right-0 z-50 w-[82vw] max-w-80 overflow-y-auto border-l border-border bg-background px-5 pb-6 shadow-lift"
                    >
                        <div className="flex items-center justify-between border-b border-border py-4">
                            <span className="text-sm font-extrabold">
                                فهرست
                            </span>
                            <button
                                type="button"
                                aria-label="بستن منوی کناری"
                                onClick={closeMenu}
                                className="grid size-10 place-items-center border border-border text-foreground"
                            >
                                <X className="size-5" aria-hidden="true" />
                            </button>
                        </div>
                        {navigation.map((item) => (
                            <a
                                key={item.href}
                                href={item.href}
                                onClick={closeMenu}
                                className="block border-b border-border py-4 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {item.label}
                            </a>
                        ))}
                        <a
                            href="#join"
                            onClick={closeMenu}
                            className="my-4 block bg-ink px-5 py-3 text-center text-sm font-semibold text-ink-foreground"
                        >
                            ورود
                        </a>
                    </nav>
                </>
            )}
        </header>
    );
}