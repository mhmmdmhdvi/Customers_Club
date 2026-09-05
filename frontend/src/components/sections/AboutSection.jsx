const principles = [
    {
        title: "ماموریت",
        text: "ایجاد ارتباطی ارزشمند میان متخصصان، پیمانکاران و فعالان صنعت ساختمان.",
    },
    {
        title: "چشم‌انداز",
        text: "ساخت جامعه‌ای حرفه‌ای برای رشد و توسعه فعالان این حوزه.",
    },
    {
        title: "ارزش‌ها",
        text: "تعهد، کیفیت و یادگیری مستمر در مسیر حرفه‌ای اعضای باشگاه.",
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
                            className="reveal max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg"
                            data-reveal
                            style={{
                                transitionDelay: "120ms",
                            }}
                        >
                            باشگاه مشتریان بستری برای ارتباط،
                            یادگیری و رشد حرفه‌ای فعالان صنعت ساختمان است.
                            ما تلاش می‌کنیم با ایجاد تجربه‌های ارزشمند،
                            مسیر توسعه و همکاری اعضا را هموار کنیم.
                        </p>


                        <div className="mt-12 grid border-t border-border sm:grid-cols-3">

                            {principles.map((item, index) => (
                                <article
                                    key={item.title}
                                    data-reveal
                                    style={{
                                        transitionDelay: `${index * 80}ms`,
                                    }}
                                    className="reveal border-b border-border py-6 sm:border-l sm:border-border sm:px-6 last:border-l-0"
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