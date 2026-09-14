import { useState } from "react";

import loginImage from "../assets/images/hero-slab.jpg";

const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export function LoginPage() {
    const [step, setStep] = useState("phone");
    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleRequestCode(event) {
        event.preventDefault();

        setError("");

        if (!/^09\d{9}$/.test(phone)) {
            setError("لطفاً یک شماره موبایل معتبر وارد کنید.");
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch(
                `${API_BASE_URL}/auth/request-code`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        phone,
                    }),
                },
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message || "ارسال کد با خطا مواجه شد.",
                );
            }

            setStep("code");
        } catch (requestError) {
            setError(
                requestError instanceof Error
                    ? requestError.message
                    : "خطایی رخ داد.",
            );
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <main
            dir="rtl"
            className="min-h-screen bg-surface px-4 py-12 sm:px-6 sm:py-20"
        >
            <div className="mx-auto w-full max-w-3xl">
                <a
                    href="/"
                    className="text-sm text-muted-foreground hover:text-foreground"
                >
                    بازگشت به صفحه اصلی
                </a>

                <h1 className="mt-8 mb-5 text-2xl font-extrabold text-foreground">
                    ورود
                </h1>

                <section
                    aria-label="ورود به باشگاه مشتریان"
                    dir="ltr"
                    className="grid overflow-hidden rounded-2xl border border-border bg-background shadow-refined md:grid-cols-5"
                >
                    <div className="relative hidden bg-ink md:col-span-2 md:block">
                        <img
                            src={loginImage}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                        />

                        <div
                            aria-hidden="true"
                            className="absolute inset-0 bg-ink/50"
                        />

                        <div
                            dir="rtl"
                            className="relative flex min-h-96 items-end p-8"
                        >
                            <p className="text-xl leading-9 font-bold text-ink-foreground">
                                همراه حرفه‌ای‌های
                                <br />
                                صنعت ساختمان
                            </p>
                        </div>
                    </div>

                    <div
                        dir="rtl"
                        className="min-w-0 px-6 py-8 sm:px-10 md:col-span-3 md:py-10"
                    >
                        <div className="border-b border-border">
                            <h2 className="inline-block border-b-2 border-primary pb-3 text-sm font-bold text-foreground">
                                ورود / عضویت
                            </h2>
                        </div>

                        {step === "phone" ? (
                            <form
                                onSubmit={handleRequestCode}
                                className="mt-8"
                            >
                                <label
                                    htmlFor="login-phone"
                                    className="mb-3 block text-sm font-semibold text-foreground"
                                >
                                    شماره موبایل
                                </label>

                                <input
                                    id="login-phone"
                                    name="phone"
                                    type="tel"
                                    inputMode="tel"
                                    autoComplete="tel"
                                    dir="ltr"
                                    value={phone}
                                    onChange={(event) =>
                                        setPhone(event.target.value)
                                    }
                                    placeholder="09123456789"
                                    className="w-full rounded-lg border border-border-strong bg-background px-4 py-3 text-left text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />

                                {error ? (
                                    <p
                                        role="alert"
                                        className="mt-4 text-sm font-medium text-red-600"
                                    >
                                        {error}
                                    </p>
                                ) : null}

                                <div className="mt-7 flex justify-center">
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="rounded-full bg-primary px-10 py-3 text-sm font-bold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isLoading
                                            ? "در حال ارسال..."
                                            : "دریافت کد تأیید"}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <form className="mt-8">
                                <p className="text-sm leading-7 text-muted-foreground">
                                    کد تأیید به شماره موبایل شما ارسال شد.
                                </p>

                                <label
                                    htmlFor="login-code"
                                    className="mt-6 mb-3 block text-sm font-semibold text-foreground"
                                >
                                    کد تأیید
                                </label>

                                <input
                                    id="login-code"
                                    name="code"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    dir="ltr"
                                    value={code}
                                    onChange={(event) =>
                                        setCode(event.target.value)
                                    }
                                    maxLength={6}
                                    placeholder="123456"
                                    className="w-full rounded-lg border border-border-strong bg-background px-4 py-3 text-left text-base tracking-[0.3em] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </form>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}