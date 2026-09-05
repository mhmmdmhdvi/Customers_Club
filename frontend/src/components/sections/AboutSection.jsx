const principles = [
    {
        title: "تخصص‌محور",
        text: "محتوا و رویدادها بر پایه نیاز واقعی مجریان و نصابان طراحی می‌شود.",
    },
    {
        title: "بلندمدت",
        text: "رابطه‌ای پایدار با کسانی که کیفیت اجرا را در پروژه‌ها می‌سازند.",
    },
    {
        title: "میدانی",
        text: "آموزش عملی در کارگاه و پروژه، نه صرفاً محتوای تئوری.",
    },
];

export function AboutSection() {
    return (
        <section
            id="about"
            aria-label="درباره باشگاه مشتریان"
            className="border-t border-border bg-background py-28 sm:py-40"
        >
            <div className="page-container">

                <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">

                    <div className="lg:col-span-5">
                        <span
                            className="eyebrow reveal"
                            data-reveal
                        >
                            درباره ما
                        </span>

                        <h2
                            className="reveal mt-6 text-3xl font-black leading-[1.35] text-foreground sm:text-4xl"
                            data-reveal
                            style={{
                                transitionDelay: "60ms",
                            }}
                        >
                            درباره باشگاه مشتریان
                        </h2>
                    </div>


                    <div className="lg:col-span-7">

                        <p
                            className="reveal text-base leading-9 text-foreground sm:text-lg sm:leading-10"
                            data-reveal
                        >
                            ماموریت ما ساختن یک جامعه حرفه‌ای پایدار پیرامون
                            افرادی است که با چسب‌های ساختمانی، مصالح نصب و
                            اجرای پروژه‌های ساختمانی کار می‌کنند؛ از پیمانکار
                            و نصاب اسلب تا کاشی‌کار و فروشنده مصالح.
                        </p>

                        <p
                            className="reveal mt-6 text-sm leading-8 text-muted-foreground sm:text-base sm:leading-9"
                            data-reveal
                            style={{
                                transitionDelay: "80ms",
                            }}
                        >
                            باور داریم کیفیت نهایی هر پروژه، حاصل دانش و دقت
                            کسی است که محصول را اجرا می‌کند. به همین دلیل
                            باشگاه را به‌عنوان بستری برای انتقال دانش فنی،
                            تبادل تجربه و ایجاد ارتباط مستقیم میان متخصصان
                            و تیم فنی طراحی کرده‌ایم.
                        </p>


                        <div className="mt-12 grid gap-px border-t border-border bg-border sm:grid-cols-3">

                            {principles.map((item, index) => (
                                <article
                                    key={item.title}
                                    data-reveal
                                    style={{
                                        transitionDelay: `${index * 80}ms`,
                                    }}
                                    className="reveal bg-background py-7 sm:px-6 sm:first:pr-0"
                                >
                                    <h3 className="text-sm font-extrabold text-foreground">
                                        {item.title}
                                    </h3>

                                    <p className="mt-3 text-sm leading-7 text-muted-foreground">
                                        {item.text}
                                    </p>
                                </article>
                            ))}

                        </div>

                    </div>

                </div>

            </div>
        </section>
    );
}