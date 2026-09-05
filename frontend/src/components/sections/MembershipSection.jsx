export function MembershipSection() {
    return (
        <section
            id="join"
            aria-label="عضویت در باشگاه"
            className="relative overflow-hidden bg-ink py-28 sm:py-40"
        >
            <div
                className="blueprint-grid-invert pointer-events-none absolute inset-0 opacity-40"
                aria-hidden="true"
            />

            <div className="page-container relative">
                <div className="mx-auto max-w-4xl text-center">

                    <span
                        className="eyebrow reveal text-ink-muted"
                        data-reveal
                    >
                        عضویت در باشگاه
                    </span>

                    <h2
                        className="reveal mt-6 text-3xl font-black leading-[1.35] text-ink-foreground sm:text-5xl"
                        data-reveal
                        style={{
                            transitionDelay: "60ms",
                        }}
                    >
                        همراه حرفه‌ای‌های صنعت ساختمان باشید
                    </h2>

                    <p
                        className="reveal mt-6 text-base leading-8 text-ink-muted sm:text-lg"
                        data-reveal
                        style={{
                            transitionDelay: "120ms",
                        }}
                    >
                        به جامعه حرفه‌ای صنعت ساختمان بپیوندید و از
                        آموزش‌ها، رویدادها و فرصت‌های ویژه باشگاه بهره‌مند شوید.
                    </p>

                    <a
                        href="#"
                        className="reveal mt-12 inline-flex items-center justify-center bg-primary px-10 py-4 text-sm font-bold text-primary-foreground transition-colors duration-300 hover:opacity-90"
                        data-reveal
                        style={{
                            transitionDelay: "180ms",
                        }}
                    >
                        عضویت رایگان
                    </a>

                </div>
            </div>
        </section>
    );
}