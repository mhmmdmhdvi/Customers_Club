import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import megatiteMark from "../../assets/branding/megatite-mark.svg";

const navigation = [
    { label: "رویدادها", href: "#events" },
    { label: "درباره ما", href: "#about" },
    { label: "تماس با ما", href: "#contact" },
];

export function SiteHeader() {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        function handleScroll() {
            setIsScrolled(window.scrollY > 12);
        }
        handleScroll();
        window.addEventListener("scroll", handleScroll, {
            passive: true,
        });
        return () => {
            window.removeEventListener("scroll", handleScroll);
        };
    }, []);

    function closeMenu() {
        setIsOpen(false);
    }

    return (
        <header
            className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,box-shadow] duration-300 ${isScrolled
                ? "border-b border-border bg-background/90 backdrop-blur-md shadow-refined"
                : "border-b border-transparent bg-background/0"
                }`}
        >
            <div className="page-container flex min-h-18 items-center justify-between gap-6 py-4">
                <a
                    href="#hero"
                    aria-label="صفحه اصلی باشگاه مشتریان"
                    className="flex items-center gap-3"
                >
                    <img
                        src={megatiteMark}
                        alt="Megatite"
                        className="size-10"
                    />

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

                <nav
                    aria-label="ناوبری اصلی"
                    className="hidden items-center gap-9 md:flex"
                >
                    {navigation.map((item) => (
                        <a
                            key={item.href}
                            href={item.href}
                            className="relative text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground after:absolute after:-bottom-1.5 after:right-0 after:h-px after:w-0 after:bg-primary after:transition-all after:duration-300 hover:after:w-full"
                        >
                            {item.label}
                        </a>
                    ))}

                    <a
                        href="#join"
                        className="border border-border-strong px-5 py-2 text-sm font-semibold text-foreground transition-colors duration-300 hover:border-ink hover:bg-ink hover:text-ink-foreground"
                    >
                        ورود
                    </a>
                </nav>

                <button
                    type="button"
                    aria-label={isOpen ? "بستن منو" : "باز کردن منو"}
                    aria-expanded={isOpen}
                    aria-controls="mobile-navigation"
                    onClick={() => setIsOpen((current) => !current)}
                    className="grid size-10 place-items-center border border-border bg-background text-foreground md:hidden"
                >
                    {isOpen ? (
                        <X className="size-5" aria-hidden="true" />
                    ) : (
                        <Menu className="size-5" aria-hidden="true" />
                    )}
                </button>
            </div>

            {isOpen ? (
                <div className="border-t border-border bg-background md:hidden">
                    <nav
                        id="mobile-navigation"
                        aria-label="ناوبری موبایل"
                        className="page-container flex flex-col py-2"
                    >
                        {navigation.map((item) => (
                            <a
                                key={item.href}
                                href={item.href}
                                onClick={closeMenu}
                                className="border-b border-border py-4 text-sm font-semibold text-foreground"
                            >
                                {item.label}
                            </a>
                        ))}

                        <a
                            href="#join"
                            onClick={closeMenu}
                            className="my-4 bg-ink px-5 py-3 text-center text-sm font-semibold text-ink-foreground"
                        >
                            ورود
                        </a>
                    </nav>
                </div>
            ) : null}
        </header>
    );
}