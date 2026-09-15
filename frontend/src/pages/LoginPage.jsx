import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import loginImage from "../assets/images/hero-slab.jpg";

const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export function LoginPage() {
    const [step, setStep] = useState("phone");
    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [verification, setVerification] = useState(null);
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const { session, establishSession, clearSession } = useAuth();

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

    async function handleVerifyCode(event) {
        event.preventDefault();

        if (isLoading) return;

        setError("");

        const enteredCode = code.trim();

        if (!/^\d{6}$/.test(enteredCode)) {
            setError("کد تأیید باید دقیقاً ۶ رقم باشد.");
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch(
                `${API_BASE_URL}/auth/verify-code`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        phone,
                        code: enteredCode,
                    }),
                },
            );

            const data = await response.json();

            if (!response.ok) {
                setError(
                    response.status === 429
                        ? "تعداد تلاش‌ها زیاد است. کمی بعد دوباره تلاش کنید."
                        : response.status === 400
                            ? "کد تأیید نامعتبر است یا منقضی شده است."
                            : "تأیید کد فعلاً امکان‌پذیر نیست.",
                );
                return;
            }

            // Check that the successful response has the expected shape.
            if (
                data?.authenticated !== false ||
                !["REGISTER", "LOGIN"].includes(data?.nextStep) ||
                typeof data?.verificationToken !== "string" ||
                !/^[a-f0-9]{64}$/.test(data.verificationToken) ||
                !Number.isFinite(Date.parse(data?.verificationExpiresAt))
            ) {
                setError("پاسخ سرور معتبر نیست. لطفاً دوباره وارد شوید.");
                return;
            }

            if (data.nextStep === "LOGIN") {
                setCode("");

                try {
                    const nextSession = await loginWithProof(
                        data.verificationToken,
                    );

                    establishSession(nextSession);
                    setVerification(null);
                } catch {
                    // Do not automatically repeat a single-use proof exchange.
                    setVerification(null);
                    setStep("phone");
                    setError("ورود کامل نشد. دوباره کد تأیید دریافت کنید.");
                }

                return;
            }

            // A new member still needs to complete the registration form.
            setVerification({
                nextStep: data.nextStep,
                verificationToken: data.verificationToken,
                verificationExpiresAt: data.verificationExpiresAt,
            });

            setCode("");
        } catch {
            setError("تأیید کد انجام نشد. لطفاً دوباره تلاش کنید.");
        } finally {
            setIsLoading(false);
        }
    }

    async function handleRegister(event) {
        event.preventDefault();
        if (isLoading) return;

        setError("");

        const proofExpiresAt = Date.parse(
            verification?.verificationExpiresAt,
        );

        if (
            verification?.nextStep !== "REGISTER" ||
            !Number.isFinite(proofExpiresAt) ||
            proofExpiresAt <= Date.now()
        ) {
            setError("اعتبار تأیید شماره تمام شده است. دوباره وارد شوید.");
            return;
        }

        const cleanFirstName = firstName.normalize("NFC").trim();
        const cleanLastName = lastName.normalize("NFC").trim();

        const invalidName = [cleanFirstName, cleanLastName].some(
            (name) =>
                Array.from(name).length < 1 ||
                Array.from(name).length > 80,
        );

        if (invalidName || /\p{Cc}/u.test(firstName + lastName)) {
            setError(
                "نام و نام خانوادگی باید بین ۱ تا ۸۰ نویسه و بدون کاراکتر کنترلی باشند.",
            );
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch(
                `${API_BASE_URL}/auth/register`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRF-Protection": "1",
                    },
                    body: JSON.stringify({
                        verificationToken: verification.verificationToken,
                        firstName: cleanFirstName,
                        lastName: cleanLastName,
                    }),
                },
            );

            const data = await response.json();

            if (!response.ok) {
                setError(
                    response.status === 409
                        ? "این شماره قبلاً ثبت‌نام شده است. دوباره وارد شوید."
                        : response.status === 503
                            ? "ثبت‌نام فعلاً در دسترس نیست."
                            : "ثبت‌نام انجام نشد. اطلاعات یا اعتبار تأیید شماره را بررسی کنید.",
                );
                return;
            }

            // A successful HTTP response must also contain a usable session.
            if (
                data?.authenticated !== true ||
                data?.tokenType !== "Bearer" ||
                typeof data?.accessToken !== "string" ||
                data.accessToken.length === 0 ||
                !Number.isSafeInteger(data?.user?.id) ||
                data.user.id <= 0 ||
                typeof data.user.firstName !== "string" ||
                typeof data.user.lastName !== "string" ||
                !Number.isFinite(Date.parse(data?.accessExpiresAt)) ||
                Date.parse(data.accessExpiresAt) <= Date.now()
            ) {
                setError("پاسخ ورود معتبر نیست. لطفاً دوباره وارد شوید.");
                return;
            }

            establishSession({
                user: data.user,
                accessToken: data.accessToken,
                tokenType: data.tokenType,
                accessExpiresAt: data.accessExpiresAt,
            });

            // The registration proof has now served its purpose.
            setVerification(null);
            setFirstName("");
            setLastName("");
        } catch {
            setError("نتیجه ثبت‌نام مشخص نیست. لطفاً دوباره وارد شوید.");
        } finally {
            setIsLoading(false);
        }
    }

    async function loginWithProof(verificationToken) {
        const response = await fetch(
            `${API_BASE_URL}/auth/login`,
            {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Protection": "1",
                },
                body: JSON.stringify({ verificationToken }),
            },
        );

        if (!response.ok) {
            throw new Error("Login request failed");
        }

        const data = await response.json();
        const expiresAt = Date.parse(data?.accessExpiresAt);

        if (
            data?.authenticated !== true ||
            data?.tokenType !== "Bearer" ||
            typeof data?.accessToken !== "string" ||
            data.accessToken.length === 0 ||
            !Number.isSafeInteger(data?.user?.id) ||
            data.user.id <= 0 ||
            typeof data.user.firstName !== "string" ||
            typeof data.user.lastName !== "string" ||
            !Number.isFinite(expiresAt) ||
            expiresAt <= Date.now()
        ) {
            throw new Error("Invalid login response");
        }

        return {
            user: data.user,
            accessToken: data.accessToken,
            tokenType: data.tokenType,
            accessExpiresAt: data.accessExpiresAt,
        };
    }

    async function handleLogout() {
        if (isLoading || !session) return;

        setError("");
        setIsLoading(true);

        try {
            const response = await fetch(
                `${API_BASE_URL}/auth/logout`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRF-Protection": "1",
                    },
                    body: JSON.stringify({}),
                },
            );

            if (response.status !== 204) {
                throw new Error("Logout was not confirmed");
            }

            // Successful logout has no JSON response body.
            // Clear the session and reset the form.
            clearSession();
            setVerification(null);
            setPhone("");
            setCode("");
            setFirstName("");
            setLastName("");
            setStep("phone");
        } catch {
            setError("خروج از حساب تأیید نشد. لطفاً دوباره تلاش کنید.");
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

                        {step === "phone" && !session ? (
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
                            <div className="mt-8">
                                {!verification && !session && (
                                    <form onSubmit={handleVerifyCode} noValidate>
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
                                            onChange={(event) => setCode(event.target.value)}
                                            disabled={isLoading}
                                            maxLength={6}
                                            placeholder="123456"
                                            aria-invalid={Boolean(error)}
                                            aria-describedby={error ? "code-error" : undefined}
                                            className="w-full rounded-lg border border-border-strong bg-background px-4 py-3 text-left text-base tracking-[0.3em] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        />

                                        {error && (
                                            <p
                                                id="code-error"
                                                role="alert"
                                                className="mt-4 text-sm text-red-600"
                                            >
                                                {error}
                                            </p>
                                        )}

                                        <div className="mt-7 flex justify-center">
                                            <button
                                                type="submit"
                                                disabled={isLoading}
                                                className="rounded-full bg-primary px-10 py-3 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {isLoading ? "در حال بررسی..." : "تأیید کد"}
                                            </button>
                                        </div>
                                    </form>
                                )}

                                {verification?.nextStep === "REGISTER" && (
                                    <form
                                        aria-label="تکمیل ثبت‌نام"
                                        aria-busy={isLoading}
                                        onSubmit={handleRegister}
                                        noValidate
                                    >
                                        <h3 className="mb-6 text-lg font-bold">
                                            تکمیل ثبت‌نام
                                        </h3>

                                        <label
                                            htmlFor="first-name"
                                            className="mb-2 block text-sm font-semibold"
                                        >
                                            نام
                                        </label>

                                        <input
                                            id="first-name"
                                            name="firstName"
                                            type="text"
                                            autoComplete="given-name"
                                            value={firstName}
                                            onChange={(event) => setFirstName(event.target.value)}
                                            disabled={isLoading}
                                            className="w-full rounded-lg border border-border-strong bg-background px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        />

                                        <label
                                            htmlFor="last-name"
                                            className="mt-5 mb-2 block text-sm font-semibold"
                                        >
                                            نام خانوادگی
                                        </label>

                                        <input
                                            id="last-name"
                                            name="lastName"
                                            type="text"
                                            autoComplete="family-name"
                                            value={lastName}
                                            onChange={(event) => setLastName(event.target.value)}
                                            disabled={isLoading}
                                            className="w-full rounded-lg border border-border-strong bg-background px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        />

                                        {error && (
                                            <p
                                                role="alert"
                                                className="mt-4 text-sm text-red-600"
                                            >
                                                {error}
                                            </p>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={isLoading}
                                            className="mt-7 rounded-full bg-primary px-10 py-3 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isLoading ? "در حال ثبت‌نام..." : "تکمیل ثبت‌نام"}
                                        </button>
                                    </form>
                                )}

                                {session && (
                                    <section
                                        aria-label="ورود موفق"
                                        aria-busy={isLoading}
                                    >
                                        <h2 className="text-2xl font-extrabold text-foreground">
                                            خوش آمدید
                                        </h2>

                                        <p className="mt-4 text-lg font-semibold">
                                            {session.user.firstName}{" "}
                                            {session.user.lastName}
                                        </p>

                                        <p className="mt-3 text-sm leading-7 text-muted-foreground">
                                            وارد حساب خود شده‌اید.
                                        </p>

                                        {error && (
                                            <p
                                                id="logout-error"
                                                role="alert"
                                                className="mt-4 text-sm text-red-600"
                                            >
                                                {error}
                                            </p>
                                        )}

                                        <button
                                            type="button"
                                            onClick={handleLogout}
                                            disabled={isLoading}
                                            aria-describedby={error ? "logout-error" : undefined}
                                            className="mt-7 rounded-full bg-primary px-10 py-3 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isLoading ? "در حال خروج..." : "خروج از حساب"}
                                        </button>
                                    </section>
                                )}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}