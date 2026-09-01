# Customer Club Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clean, mobile-first Persian React landing page that closely reproduces the supplied 1680px reference UI and remains ready for later Django API integration.

**Architecture:** A Vite-powered React JavaScript frontend composes focused layout and section components. Repeated content lives in plain JavaScript data modules and flows into presentational components through props; Tailwind CSS v4 and a small token layer provide the responsive visual system.

**Tech Stack:** Node.js 24, npm 11, Vite 8, React 19, JavaScript, semantic HTML, Tailwind CSS v4, Lucide React, Vitest, and Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-31-customer-club-landing-page-design.md`

## Global Constraints

- The learner writes the implementation; the teacher explains one short step, waits, reviews the actual result, and offers hints before a full solution.
- The desktop result at 1680px must closely match the supplied 1680x4472 screenshot.
- Base Tailwind utilities define the phone layout; `sm`, `md`, and `lg` progressively add tablet and desktop composition.
- Use Persian content, `lang="fa"`, and `dir="rtl"`.
- Use Vazirmatn, a warm off-white background, concrete-neutral surfaces, graphite ink, restrained amber-orange accents, fine borders, and mostly square corners.
- Keep `App.jsx` limited to page composition. Keep each file focused on one responsibility.
- Do not add Django, PostgreSQL, authentication, routing, payments, courses, Docker, or Ubuntu configuration in this milestone.
- Do not copy the reference repository's TypeScript, TanStack Start, Lovable configuration, broad UI library, or unused dependencies.
- Each task ends with review, a relevant test/build/browser check, and a focused Git commit.

---

## File Map

```text
frontend/
|-- index.html                          # Persian document metadata and React mount point
|-- vite.config.js                      # React, Tailwind, and Vitest configuration
|-- src/
|   |-- assets/images/                  # Five supplied local photographs
|   |-- components/
|   |   |-- layout/
|   |   |   |-- SiteHeader.jsx          # Desktop/mobile navigation and header state
|   |   |   `-- SiteFooter.jsx          # Footer navigation, social links, copyright
|   |   `-- sections/
|   |       |-- HeroSection.jsx
|   |       |-- BenefitsSection.jsx
|   |       |-- EventsSection.jsx
|   |       |-- EventCard.jsx
|   |       |-- MembershipCallout.jsx
|   |       |-- AboutSection.jsx
|   |       `-- ContactSection.jsx
|   |-- data/
|   |   |-- benefits.js
|   |   |-- events.js
|   |   `-- contact.js
|   |-- hooks/
|   |   `-- useReveal.js                # Optional intersection-based entrance motion
|   |-- styles/
|   |   `-- index.css                   # Tailwind import, tokens, base rules, grid and motion
|   |-- test/
|   |   `-- setup.js
|   |-- App.jsx                         # Page composition only
|   |-- App.test.jsx                    # Page integration and section-order checks
|   `-- main.jsx                        # React entry point
`-- package.json
```

Automated tests sit beside the component they verify, for example `SiteHeader.test.jsx` beside `SiteHeader.jsx`.

---

### Task 1: Create the frontend and prove the toolchain

**Files:**
- Create: `frontend/` with the Vite React JavaScript template
- Create: `frontend/src/test/setup.js`
- Create: `frontend/src/styles/index.css`
- Modify: `frontend/vite.config.js`
- Modify: `frontend/package.json`
- Modify: `frontend/index.html`
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/src/App.jsx`
- Create: `frontend/src/App.test.jsx`
- Move: the five root JPG files to `frontend/src/assets/images/`

**Interfaces:**
- Consumes: Node.js `v24.18.0`, npm `11.16.0`, and the five supplied JPG files at repository root.
- Produces: `npm run dev`, `npm run test`, `npm run lint`, and `npm run build`; a React application mounted at `#root`.

- [ ] **Step 1: Scaffold the JavaScript React application**

Run from the repository root:

```powershell
npm create vite@latest frontend -- --template react
Set-Location frontend
npm install
```

Expected: Vite creates a JavaScript React application under `frontend/` and `npm install` exits successfully.

- [ ] **Step 2: Install only the dependencies used by this milestone**

```powershell
npm install tailwindcss @tailwindcss/vite lucide-react @fontsource-variable/vazirmatn
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom
npm pkg set scripts.test="vitest run" scripts.test:watch="vitest"
```

Expected: `package.json` has React/Vite from the template, four runtime additions, four testing additions, and test scripts.

- [ ] **Step 3: Configure Vite, Tailwind, and Vitest**

Replace `frontend/vite.config.js` with:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    css: true,
  },
});
```

Create `frontend/src/test/setup.js`:

```js
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Write the first failing render test**

Replace `frontend/src/App.test.jsx` with:

```jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the customer club heading inside the main content", () => {
    render(<App />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "باشگاه مشتریان" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the test and observe the expected failure**

```powershell
npm run test -- App.test.jsx
```

Expected: FAIL because the default Vite screen does not contain the Persian heading.

- [ ] **Step 6: Create the minimal first render**

Replace `frontend/src/App.jsx` with:

```jsx
export default function App() {
  return (
    <main>
      <h1>باشگاه مشتریان</h1>
    </main>
  );
}
```

Replace `frontend/src/styles/index.css` with:

```css
@import "tailwindcss";
```

Ensure `frontend/src/main.jsx` imports the new stylesheet:

```jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/vazirmatn/wght.css";
import "./styles/index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Delete the now-unused `frontend/src/App.css` and `frontend/src/index.css` files.

- [ ] **Step 7: Set Persian document metadata**

In `frontend/index.html`, set the opening tag and head metadata to:

```html
<html lang="fa" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="باشگاه مشتریان؛ جامعه‌ای تخصصی برای فعالان حرفه‌ای صنعت ساختمان"
    />
    <title>باشگاه مشتریان | جامعه حرفه‌ای صنعت ساختمان</title>
  </head>
```

Keep Vite's `<body>`, `#root`, and module script below this head.

- [ ] **Step 8: Organize the supplied images**

Run from `frontend/`:

```powershell
New-Item -ItemType Directory -Force -Path '.\src\assets\images'
Move-Item -LiteralPath '..\hero-slab.jpg' -Destination '.\src\assets\images\hero-slab.jpg'
Move-Item -LiteralPath '..\detail-adhesive.jpg' -Destination '.\src\assets\images\detail-adhesive.jpg'
Move-Item -LiteralPath '..\event-workshop.jpg' -Destination '.\src\assets\images\event-workshop.jpg'
Move-Item -LiteralPath '..\event-conference.jpg' -Destination '.\src\assets\images\event-conference.jpg'
Move-Item -LiteralPath '..\event-training.jpg' -Destination '.\src\assets\images\event-training.jpg'
```

Expected: all five images exist under `frontend/src/assets/images/` and no JPG remains at the repository root.

- [ ] **Step 9: Verify the toolchain**

```powershell
npm run test
npm run lint
npm run build
```

Expected: one test passes, lint passes, and Vite writes a production bundle to `frontend/dist/`.

- [ ] **Step 10: Commit the verified foundation**

```powershell
Set-Location ..
git add frontend
git commit -m "chore: initialize React landing page"
```

Teacher review gate: confirm the learner can explain `index.html`, `main.jsx`, `App.jsx`, `package.json`, and why `node_modules` is not committed.

---

### Task 2: Establish the RTL design system and page shell

**Files:**
- Modify: `frontend/src/styles/index.css`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/App.test.jsx`

**Interfaces:**
- Consumes: Tailwind's Vite plugin and the Persian document direction from Task 1.
- Produces: named Tailwind theme colors (`background`, `foreground`, `surface`, `ink`, `primary`, borders), Vazirmatn typography, `blueprint-grid`, `blueprint-grid-invert`, `eyebrow`, and `page-container` utilities.

- [ ] **Step 1: Extend the App test with the page-shell contract**

Add this assertion inside the existing test after `render(<App />)`:

```jsx
expect(screen.getByTestId("page-shell")).toHaveClass(
  "min-h-screen",
  "bg-background",
);
```

- [ ] **Step 2: Run the test and observe the expected failure**

```powershell
Set-Location frontend
npm run test -- App.test.jsx
```

Expected: FAIL because no element has `data-testid="page-shell"`.

- [ ] **Step 3: Add the page shell**

Replace `frontend/src/App.jsx` with:

```jsx
export default function App() {
  return (
    <div data-testid="page-shell" className="min-h-screen bg-background text-foreground">
      <main>
        <h1>باشگاه مشتریان</h1>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Define the exact global theme and base rules**

Replace `frontend/src/styles/index.css` with:

```css
@import "tailwindcss";

@theme inline {
  --font-sans: "Vazirmatn Variable", ui-sans-serif, system-ui, sans-serif;
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-surface: var(--surface);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-ink: var(--ink);
  --color-ink-foreground: var(--ink-foreground);
  --color-ink-muted: var(--ink-muted);
}

:root {
  --background: oklch(0.985 0.003 90);
  --foreground: oklch(0.21 0.008 60);
  --surface: oklch(0.955 0.005 85);
  --primary: oklch(0.66 0.16 55);
  --primary-foreground: oklch(0.16 0.01 60);
  --muted-foreground: oklch(0.5 0.01 70);
  --border: oklch(0.9 0.005 80);
  --border-strong: oklch(0.82 0.008 75);
  --ink: oklch(0.22 0.008 65);
  --ink-foreground: oklch(0.97 0.004 85);
  --ink-muted: oklch(0.7 0.012 75);
  --shadow-refined: 0 1px 2px oklch(0.2 0.01 60 / 0.04),
    0 12px 28px -18px oklch(0.2 0.01 60 / 0.35);
  --shadow-lift: 0 2px 4px oklch(0.2 0.01 60 / 0.05),
    0 26px 48px -26px oklch(0.2 0.01 60 / 0.45);
}

@layer base {
  * {
    border-color: var(--color-border);
  }

  html {
    scroll-behavior: smooth;
    scroll-padding-top: 6rem;
  }

  body {
    margin: 0;
    min-width: 320px;
    background: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
    font-feature-settings: "ss02";
    -webkit-font-smoothing: antialiased;
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  h1,
  h2,
  h3 {
    letter-spacing: -0.01em;
    text-wrap: balance;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  button,
  a {
    outline-offset: 4px;
  }

  ::selection {
    background: var(--primary);
    color: var(--primary-foreground);
  }
}

@utility page-container {
  width: min(100% - 2.5rem, 84rem);
  margin-inline: auto;
}

@utility eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
}

.eyebrow::before {
  content: "";
  width: 1.75rem;
  height: 2px;
  background: var(--primary);
}

.blueprint-grid {
  background-image:
    linear-gradient(to left, var(--border) 1px, transparent 1px),
    linear-gradient(to bottom, var(--border) 1px, transparent 1px);
  background-size: 88px 88px;
}

.blueprint-grid-invert {
  background-image:
    linear-gradient(to left, oklch(1 0 0 / 0.06) 1px, transparent 1px),
    linear-gradient(to bottom, oklch(1 0 0 / 0.06) 1px, transparent 1px);
  background-size: 88px 88px;
}

.shadow-refined {
  box-shadow: var(--shadow-refined);
}

.shadow-lift {
  box-shadow: var(--shadow-lift);
}

@media (min-width: 40rem) {
  .page-container {
    width: min(100% - 4rem, 84rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}
```

- [ ] **Step 5: Verify tests, build, font, direction, and colors**

```powershell
npm run test -- App.test.jsx
npm run build
npm run dev
```

Expected: test and build pass. In the browser, Persian text uses Vazirmatn, reads right-to-left, and the page background is warm off-white.

- [ ] **Step 6: Commit the design foundation**

```powershell
Set-Location ..
git add frontend/src/App.jsx frontend/src/App.test.jsx frontend/src/styles/index.css
git commit -m "style: establish RTL landing page theme"
```

Teacher review gate: the learner explains mobile-first utilities, CSS custom properties, and why shared colors are named tokens.

---

### Task 3: Build the responsive site header

**Files:**
- Create: `frontend/src/components/layout/SiteHeader.jsx`
- Create: `frontend/src/components/layout/SiteHeader.test.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `page-container`, theme color names, and React `useState`.
- Produces: `SiteHeader()` with anchors `#events`, `#about`, `#contact`, and `#join`; an accessible mobile menu controlled by `aria-expanded`.

- [ ] **Step 1: Write the failing header behavior test**

Create `frontend/src/components/layout/SiteHeader.test.jsx`:

```jsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./SiteHeader";

describe("SiteHeader", () => {
  it("opens and closes the mobile navigation", () => {
    render(<SiteHeader />);

    const menuButton = screen.getByRole("button", { name: "باز کردن منو" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(menuButton);
    expect(
      screen.getByRole("button", { name: "بستن منو" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("mobile-navigation")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the focused test and observe the expected failure**

```powershell
Set-Location frontend
npm run test -- SiteHeader.test.jsx
```

Expected: FAIL because `SiteHeader.jsx` does not exist.

- [ ] **Step 3: Implement the header and its mobile state**

Create `frontend/src/components/layout/SiteHeader.jsx`:

```jsx
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
        <a href="#hero" className="flex items-center gap-3" aria-label="صفحه اصلی باشگاه مشتریان">
          <span className="grid size-10 place-items-center bg-ink text-base font-black text-ink-foreground">چ</span>
          <span className="leading-tight">
            <span className="block text-sm font-extrabold">باشگاه مشتریان</span>
            <span className="block text-[11px] tracking-widest text-muted-foreground">ADHESIVE PRO CLUB</span>
          </span>
        </a>

        <nav className="hidden items-center gap-9 md:flex" aria-label="ناوبری اصلی">
          {navigation.map((item) => (
            <a key={item.href} href={item.href} className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
              {item.label}
            </a>
          ))}
          <a href="#join" className="border border-border-strong px-5 py-2 text-sm font-semibold transition-colors hover:bg-ink hover:text-ink-foreground">
            ورود
          </a>
        </nav>

        <button
          type="button"
          aria-label={isOpen ? "بستن منو" : "باز کردن منو"}
          aria-expanded={isOpen}
          aria-controls="mobile-navigation"
          onClick={() => setIsOpen((current) => !current)}
          className="grid size-10 place-items-center border border-border md:hidden"
        >
          {isOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
        </button>
      </div>

      {isOpen && (
        <nav
          id="mobile-navigation"
          data-testid="mobile-navigation"
          className="border-t border-border bg-background px-5 py-2 md:hidden"
          aria-label="ناوبری موبایل"
        >
          {navigation.map((item) => (
            <a key={item.href} href={item.href} onClick={closeMenu} className="block border-b border-border py-4 text-sm font-semibold">
              {item.label}
            </a>
          ))}
          <a href="#join" onClick={closeMenu} className="my-4 block bg-ink px-5 py-3 text-center text-sm font-semibold text-ink-foreground">
            ورود
          </a>
        </nav>
      )}
    </header>
  );
}
```

- [ ] **Step 4: Compose the header in App**

Update `frontend/src/App.jsx`:

```jsx
import { SiteHeader } from "./components/layout/SiteHeader";

export default function App() {
  return (
    <div data-testid="page-shell" className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <h1>باشگاه مشتریان</h1>
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Verify mobile and desktop behavior**

```powershell
npm run test -- SiteHeader.test.jsx App.test.jsx
npm run dev
```

Expected: tests pass. At widths below 768px, the menu button opens a vertical menu and closes after selecting a link. At 768px and wider, the full navigation is visible and the menu button is hidden.

- [ ] **Step 6: Commit the header**

```powershell
Set-Location ..
git add frontend/src/App.jsx frontend/src/components/layout
git commit -m "feat: add responsive site header"
```

Teacher review gate: the learner explains component imports, local state, event handlers, conditional rendering, `map`, and accessibility attributes.

---

### Task 4: Build the mobile-first hero composition

**Files:**
- Create: `frontend/src/components/sections/HeroSection.jsx`
- Create: `frontend/src/components/sections/HeroSection.test.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `hero-slab.jpg`, `detail-adhesive.jpg`, `page-container`, `blueprint-grid`, and `ArrowLeft` from Lucide React.
- Produces: `HeroSection()` with `id="hero"`, calls to `#join` and `#events`, three statistics, and five audience labels.

- [ ] **Step 1: Write the failing hero content test**

Create `frontend/src/components/sections/HeroSection.test.jsx`:

```jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroSection } from "./HeroSection";

describe("HeroSection", () => {
  it("presents the primary message, actions, statistics, and images", () => {
    render(<HeroSection />);

    expect(
      screen.getByRole("heading", { name: /باشگاه مشتریان؛/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /عضویت در باشگاه/ })).toHaveAttribute("href", "#join");
    expect(screen.getByRole("link", { name: "مشاهده رویدادها" })).toHaveAttribute("href", "#events");
    expect(screen.getByText("۱۲۰۰+")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the focused test and observe the expected failure**

```powershell
Set-Location frontend
npm run test -- HeroSection.test.jsx
```

Expected: FAIL because `HeroSection.jsx` does not exist.

- [ ] **Step 3: Implement the semantic mobile hero**

Create `frontend/src/components/sections/HeroSection.jsx`:

```jsx
import { ArrowLeft } from "lucide-react";
import heroSlab from "../../assets/images/hero-slab.jpg";
import detailAdhesive from "../../assets/images/detail-adhesive.jpg";

const statistics = [
  { value: "۱۲۰۰+", label: "عضو حرفه‌ای" },
  { value: "۴۵", label: "رویداد برگزارشده" },
  { value: "۲۳", label: "شهر فعال" },
];

const audiences = [
  "پیمانکاران ساختمانی",
  "نصابان اسلب و سرامیک",
  "کاشی‌کاران",
  "مجریان پروژه",
  "فروشندگان مصالح",
];

export function HeroSection() {
  return (
    <section id="hero" className="relative overflow-hidden bg-background pt-28 sm:pt-32">
      <div className="blueprint-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-b from-background to-transparent" aria-hidden="true" />

      <div className="page-container relative">
        <div className="grid items-end gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-6 lg:pb-16">
            <span className="eyebrow">جامعه تخصصی صنعت ساختمان</span>
            <h1 className="mt-7 text-4xl leading-[1.25] font-black sm:text-5xl lg:text-[3.4rem] lg:leading-[1.22]">
              باشگاه مشتریان؛
              <br />
              جایی برای{" "}
              <span className="relative inline-block">
                حرفه‌ای‌ها
                <span className="absolute inset-x-0 -bottom-1 h-1.5 bg-primary/70" aria-hidden="true" />
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg sm:leading-9">
              باشگاه مشتریان ما، جامعه‌ای تخصصی برای پیمانکاران، نصابان و فعالان حرفه‌ای صنعت ساختمان است؛ جایی برای یادگیری، ارتباط، تجربه فرصت‌های جدید و بهره‌مندی از مزایای ویژه.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <a href="#join" className="group inline-flex items-center justify-center gap-2 bg-ink px-8 py-4 text-sm font-bold text-ink-foreground transition-colors hover:bg-foreground">
                عضویت در باشگاه
                <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden="true" />
              </a>
              <a href="#events" className="inline-flex items-center justify-center border border-border-strong px-8 py-4 text-sm font-bold transition-colors hover:bg-surface">
                مشاهده رویدادها
              </a>
            </div>

            <dl className="mt-14 grid max-w-lg grid-cols-3 border-t border-border">
              {statistics.map((statistic) => (
                <div key={statistic.label} className="border-l border-border py-6 pl-2 last:border-l-0 sm:pl-4">
                  <dt className="text-2xl font-black sm:text-3xl">{statistic.value}</dt>
                  <dd className="mt-1 text-[11px] font-medium text-muted-foreground sm:text-xs">{statistic.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="lg:col-span-6">
            <div className="relative">
              <div className="relative aspect-[4/3] overflow-hidden bg-surface">
                <img src={heroSlab} alt="نصب اسلب بزرگ‌فرمت توسط نصابان حرفه‌ای در یک پروژه ساختمانی" width="1600" height="1200" className="size-full object-cover" />
                <span className="absolute inset-0 ring-1 ring-ink/10 ring-inset" aria-hidden="true" />
              </div>
              <div className="shadow-lift absolute -bottom-10 left-4 hidden w-40 overflow-hidden border-4 border-background bg-surface sm:block lg:left-0 lg:w-52">
                <img src={detailAdhesive} alt="کشیدن چسب ساختمانی با ماله دندانه‌دار" width="1200" height="1504" loading="lazy" className="aspect-[4/5] w-full object-cover" />
              </div>
              <div className="shadow-lift absolute -top-4 right-4 bg-ink px-5 py-4 text-ink-foreground lg:-right-8">
                <p className="text-[11px] font-medium tracking-widest text-ink-muted">عضویت رایگان</p>
                <p className="mt-1 text-sm font-bold">ویژه فعالان صنعت ساختمان</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-24 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-border py-7 text-xs font-semibold text-muted-foreground sm:mt-28">
          <span className="text-foreground">اعضای باشگاه:</span>
          {audiences.map((audience) => <span key={audience}>{audience}</span>)}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Replace the temporary App heading with the hero**

Update `frontend/src/App.jsx` so its imports and main content are:

```jsx
import { SiteHeader } from "./components/layout/SiteHeader";
import { HeroSection } from "./components/sections/HeroSection";

export default function App() {
  return (
    <div data-testid="page-shell" className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <HeroSection />
      </main>
    </div>
  );
}
```

Update the App test heading query from exact `باشگاه مشتریان` to `/باشگاه مشتریان؛/`.

- [ ] **Step 5: Verify mobile first, then desktop**

```powershell
npm run test -- HeroSection.test.jsx App.test.jsx
npm run dev
```

Expected: tests pass. At 375px, text/actions precede the image with no horizontal overflow. At 1024px and wider, the copy sits on the right and images on the left. At 1680px, the main image, portrait overlap, dark label, and statistics resemble the screenshot.

- [ ] **Step 6: Commit the hero**

```powershell
Set-Location ..
git add frontend/src/App.jsx frontend/src/App.test.jsx frontend/src/components/sections/HeroSection*
git commit -m "feat: build responsive landing hero"
```

Teacher review gate: the learner explains arrays, `map`, image imports, semantic description lists, absolute positioning, and breakpoint-prefixed utilities.

---

### Task 5: Build the data-driven benefits section

**Files:**
- Create: `frontend/src/data/benefits.js`
- Create: `frontend/src/components/sections/BenefitsSection.jsx`
- Create: `frontend/src/components/sections/BenefitsSection.test.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: the theme and Lucide React icons.
- Produces: `benefits` array and `BenefitsSection()` with `id="benefits"` and six articles.

- [ ] **Step 1: Write the failing benefits test**

Create `frontend/src/components/sections/BenefitsSection.test.jsx`:

```jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BenefitsSection } from "./BenefitsSection";

describe("BenefitsSection", () => {
  it("renders all six membership benefits", () => {
    render(<BenefitsSection />);

    expect(screen.getByRole("heading", { name: "چرا به باشگاه مشتریان بپیوندید؟" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(6);
    expect(screen.getByRole("heading", { name: "رویدادهای تخصصی" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "جامعه حرفه‌ای" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the focused test and observe the expected failure**

```powershell
Set-Location frontend
npm run test -- BenefitsSection.test.jsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Create the benefits data**

Create `frontend/src/data/benefits.js`:

```js
import { Award, CalendarDays, GraduationCap, HardHat, Sparkles, Users } from "lucide-react";

export const benefits = [
  { icon: CalendarDays, title: "رویدادهای تخصصی", description: "شرکت در رویدادها، ورکشاپ‌ها و برنامه‌های تخصصی صنعت ساختمان." },
  { icon: GraduationCap, title: "آموزش و یادگیری", description: "دسترسی به آموزش‌ها و تجربه‌های تخصصی برای ارتقای مهارت‌های حرفه‌ای." },
  { icon: Users, title: "ارتباط با متخصصان", description: "فرصتی برای شبکه‌سازی و ارتباط با دیگر فعالان حرفه‌ای صنعت." },
  { icon: Award, title: "مزایای ویژه", description: "دسترسی به فرصت‌ها، خدمات و مزایای اختصاصی اعضای باشگاه." },
  { icon: Sparkles, title: "اطلاع از محصولات جدید", description: "اولین نفری باشید که با محصولات و تکنولوژی‌های جدید آشنا می‌شوید." },
  { icon: HardHat, title: "جامعه حرفه‌ای", description: "عضویت در جامعه‌ای از متخصصان، پیمانکاران و نصابان حرفه‌ای." },
];
```

- [ ] **Step 4: Implement the responsive editorial grid**

Create `frontend/src/components/sections/BenefitsSection.jsx`:

```jsx
import { benefits } from "../../data/benefits";

export function BenefitsSection() {
  return (
    <section id="benefits" className="border-t border-border bg-surface py-24 sm:py-32">
      <div className="page-container grid gap-8 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-4">
          <span className="eyebrow">مزایای عضویت</span>
          <h2 className="mt-6 text-3xl leading-[1.35] font-black sm:text-4xl">چرا به باشگاه مشتریان بپیوندید؟</h2>
          <p className="mt-5 max-w-md text-sm leading-8 text-muted-foreground sm:text-base">باشگاه، فراتر از یک برنامه وفاداری است؛ زیرساختی است برای رشد حرفه‌ای کسانی که هر روز با چسب، اسلب و مصالح ساختمانی کار می‌کنند.</p>
        </div>

        <div className="grid border-t border-border sm:grid-cols-2 lg:col-span-8">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <article key={benefit.title} className="relative border-b border-border p-7 transition-colors hover:bg-background sm:p-8 sm:[&:nth-child(odd)]:border-l">
                <div className="flex items-start gap-4">
                  <Icon className="mt-0.5 size-6 shrink-0 text-primary" strokeWidth="1.5" aria-hidden="true" />
                  <div>
                    <h3 className="text-base font-extrabold">{benefit.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{benefit.description}</p>
                  </div>
                </div>
                <span className="absolute bottom-6 left-7 text-xs font-bold text-border-strong" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Add BenefitsSection after HeroSection in App**

Add the import and composition line:

```jsx
import { BenefitsSection } from "./components/sections/BenefitsSection";
```

```jsx
<HeroSection />
<BenefitsSection />
```

- [ ] **Step 6: Verify the data flow and responsive borders**

```powershell
npm run test -- BenefitsSection.test.jsx
npm run lint
npm run dev
```

Expected: six articles render. Mobile shows one bordered column; 640px and wider show two columns; desktop gives the heading four columns and the benefit grid eight columns.

- [ ] **Step 7: Commit the benefits section**

```powershell
Set-Location ..
git add frontend/src/App.jsx frontend/src/data/benefits.js frontend/src/components/sections/BenefitsSection*
git commit -m "feat: add membership benefits section"
```

Teacher review gate: the learner explains data modules, component variables such as `Icon`, stable keys, and why content is separated from presentation.

---

### Task 6: Build reusable event cards and the events section

**Files:**
- Create: `frontend/src/data/events.js`
- Create: `frontend/src/components/sections/EventCard.jsx`
- Create: `frontend/src/components/sections/EventCard.test.jsx`
- Create: `frontend/src/components/sections/EventsSection.jsx`
- Create: `frontend/src/components/sections/EventsSection.test.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: three event images plus `ArrowLeft` and `MapPin` from Lucide React.
- Produces: `events` array; `EventCard({ event })`; `EventsSection()` with `id="events"` and three event articles.

- [ ] **Step 1: Write the failing events test**

Create `frontend/src/components/sections/EventsSection.test.jsx`:

```jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventsSection } from "./EventsSection";

describe("EventsSection", () => {
  it("renders three event previews with details links", () => {
    render(<EventsSection />);

    expect(screen.getByRole("heading", { name: "رویدادهای باشگاه" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: /مشاهده جزئیات/ })).toHaveLength(3);
    expect(screen.getByText("۲۴ مهر ۱۴۰۴")).toBeInTheDocument();
  });
});
```

Create `frontend/src/components/sections/EventCard.test.jsx` to define the missing-metadata behavior:

```jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventCard } from "./EventCard";

describe("EventCard", () => {
  it("uses the title as image text and omits unavailable metadata", () => {
    render(<EventCard event={{ image: "/event.jpg", title: "کارگاه آزمایشی" }} />);

    expect(screen.getByRole("img", { name: "کارگاه آزمایشی" })).toBeInTheDocument();
    expect(screen.queryByTestId("event-metadata")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the focused test and observe the expected failure**

```powershell
Set-Location frontend
npm run test -- EventsSection.test.jsx EventCard.test.jsx
```

Expected: FAIL because `EventsSection.jsx` does not exist.

- [ ] **Step 3: Create event data with local asset imports**

Create `frontend/src/data/events.js`:

```js
import conference from "../assets/images/event-conference.jpg";
import training from "../assets/images/event-training.jpg";
import workshop from "../assets/images/event-workshop.jpg";

export const events = [
  { image: workshop, alt: "ورکشاپ تخصصی نصب اسلب", type: "ورکشاپ", title: "ورکشاپ تخصصی نصب اسلب", date: "۲۴ مهر ۱۴۰۴", city: "تهران" },
  { image: conference, alt: "همایش فعالان صنعت ساختمان", type: "همایش", title: "همایش فعالان صنعت ساختمان", date: "۱۲ آبان ۱۴۰۴", city: "اصفهان" },
  { image: training, alt: "دوره آموزشی تکنیک‌های نوین اجرا", type: "دوره آموزشی", title: "دوره آموزشی تکنیک‌های نوین اجرا", date: "۳ آذر ۱۴۰۴", city: "مشهد" },
];
```

- [ ] **Step 4: Implement one reusable event card**

Create `frontend/src/components/sections/EventCard.jsx`:

```jsx
import { ArrowLeft, MapPin } from "lucide-react";

export function EventCard({ event }) {
  const title = event.title || "رویداد باشگاه";
  const imageAlt = event.alt || title;

  return (
    <article className="group flex flex-col bg-background transition-colors hover:bg-surface">
      <div className="relative aspect-[4/3] overflow-hidden">
        <img src={event.image} alt={imageAlt} width="1200" height="900" loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
        {event.type && <span className="absolute top-0 right-0 bg-ink px-4 py-2 text-[11px] font-bold text-ink-foreground">{event.type}</span>}
      </div>
      <div className="flex flex-1 flex-col p-7">
        {(event.date || event.city) && (
          <div data-testid="event-metadata" className="flex items-center gap-4 text-xs font-semibold text-muted-foreground">
            {event.date && <span>{event.date}</span>}
            {event.city && <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5 text-primary" aria-hidden="true" />{event.city}</span>}
          </div>
        )}
        <h3 className="mt-4 text-lg leading-8 font-extrabold">{title}</h3>
        <a href="#join" className="mt-auto inline-flex items-center gap-2 pt-8 text-sm font-bold">
          مشاهده جزئیات
          <ArrowLeft className="size-4 text-primary transition-transform group-hover:-translate-x-1" aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}
```

- [ ] **Step 5: Implement the responsive event collection**

Create `frontend/src/components/sections/EventsSection.jsx`:

```jsx
import { ArrowLeft } from "lucide-react";
import { events } from "../../data/events";
import { EventCard } from "./EventCard";

export function EventsSection() {
  return (
    <section id="events" className="border-t border-border bg-background py-24 sm:py-32">
      <div className="page-container">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
          <div>
            <span className="eyebrow">تقویم باشگاه</span>
            <h2 className="mt-6 text-3xl font-black sm:text-4xl">رویدادهای باشگاه</h2>
          </div>
          <a href="#join" className="group hidden items-center gap-2 text-sm font-bold sm:inline-flex">
            مشاهده همه رویدادها
            <ArrowLeft className="size-4 text-primary transition-transform group-hover:-translate-x-1" aria-hidden="true" />
          </a>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => <EventCard key={event.title} event={event} />)}
        </div>
        <a href="#join" className="mt-10 inline-flex w-full items-center justify-center border border-border-strong px-6 py-4 text-sm font-bold sm:hidden">
          مشاهده همه رویدادها
        </a>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Add EventsSection after BenefitsSection in App**

```jsx
import { EventsSection } from "./components/sections/EventsSection";
```

```jsx
<BenefitsSection />
<EventsSection />
```

- [ ] **Step 7: Verify content, crops, and columns**

```powershell
npm run test -- EventsSection.test.jsx EventCard.test.jsx
npm run lint
npm run dev
```

Expected: all three events and images render. Cards stack at 375px, form two columns from 640px, and three columns from 1024px. Images have equal 4:3 crops.

- [ ] **Step 8: Commit the events section**

```powershell
Set-Location ..
git add frontend/src/App.jsx frontend/src/data/events.js frontend/src/components/sections/EventCard* frontend/src/components/sections/EventsSection*
git commit -m "feat: add responsive event previews"
```

Teacher review gate: the learner explains the `event` prop, why an event card is reusable, image aspect ratios, and responsive grid columns.

---

### Task 7: Add the dark membership callout

**Files:**
- Create: `frontend/src/components/sections/MembershipCallout.jsx`
- Create: `frontend/src/components/sections/MembershipCallout.test.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `blueprint-grid-invert`, theme ink colors, and `ArrowLeft`.
- Produces: `MembershipCallout()` with `id="join"` and an action linking to `#contact`.

- [ ] **Step 1: Write the failing callout test**

Create `frontend/src/components/sections/MembershipCallout.test.jsx`:

```jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MembershipCallout } from "./MembershipCallout";

describe("MembershipCallout", () => {
  it("invites professionals to join and points to contact", () => {
    render(<MembershipCallout />);
    expect(screen.getByRole("heading", { name: "به جمع حرفه‌ای‌ها بپیوندید" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /همین حالا عضو شوید/ })).toHaveAttribute("href", "#contact");
  });
});
```

- [ ] **Step 2: Run the test and observe the expected failure**

```powershell
Set-Location frontend
npm run test -- MembershipCallout.test.jsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the mobile and desktop callout**

Create `frontend/src/components/sections/MembershipCallout.jsx`:

```jsx
import { ArrowLeft } from "lucide-react";

export function MembershipCallout() {
  return (
    <section id="join" className="relative overflow-hidden bg-ink py-24 text-ink-foreground sm:py-32">
      <div className="blueprint-grid-invert pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="page-container relative grid items-center gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <span className="eyebrow text-ink-muted">عضویت در باشگاه</span>
          <h2 className="mt-6 text-3xl leading-[1.35] font-black sm:text-5xl">به جمع حرفه‌ای‌ها بپیوندید</h2>
          <p className="mt-6 max-w-xl text-sm leading-8 text-ink-muted sm:text-base sm:leading-9">
            اگر در صنعت ساختمان فعالیت می‌کنید، باشگاه مشتریان فرصتی برای رشد، یادگیری و ارتباط با یک جامعه حرفه‌ای است.
          </p>
        </div>
        <div className="lg:col-span-5 lg:justify-self-end">
          <a href="#contact" className="group inline-flex w-full items-center justify-center gap-2 bg-primary px-10 py-5 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5">
            همین حالا عضو شوید
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden="true" />
          </a>
          <p className="mt-4 text-center text-xs font-medium text-ink-muted">عضویت رایگان است و در کمتر از دو دقیقه انجام می‌شود.</p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Add MembershipCallout after EventsSection in App**

```jsx
import { MembershipCallout } from "./components/sections/MembershipCallout";
```

```jsx
<EventsSection />
<MembershipCallout />
```

- [ ] **Step 5: Verify the callout and commit**

```powershell
npm run test -- MembershipCallout.test.jsx
npm run build
Set-Location ..
git add frontend/src/App.jsx frontend/src/components/sections/MembershipCallout*
git commit -m "feat: add membership callout"
```

Expected: the content stacks on mobile and becomes a 7/5 split at 1024px; the amber action remains prominent against the dark grid.

Teacher review gate: the learner explains content hierarchy, contrast, `aria-hidden` decoration, and why the action points to an existing section instead of a non-existent registration page.

---

### Task 8: Add the editorial About section

**Files:**
- Create: `frontend/src/components/sections/AboutSection.jsx`
- Create: `frontend/src/components/sections/AboutSection.test.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: theme colors and the approved Persian mission copy.
- Produces: `AboutSection()` with `id="about"`, two mission paragraphs, and a three-item description list.

- [ ] **Step 1: Write and run the failing About test**

Create `frontend/src/components/sections/AboutSection.test.jsx`:

```jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AboutSection } from "./AboutSection";

describe("AboutSection", () => {
  it("shows the mission and three principles", () => {
    render(<AboutSection />);
    expect(screen.getByRole("heading", { name: "درباره باشگاه مشتریان" })).toBeInTheDocument();
    expect(screen.getByText("تخصص‌محور")).toBeInTheDocument();
    expect(screen.getByText("بلندمدت")).toBeInTheDocument();
    expect(screen.getByText("میدانی")).toBeInTheDocument();
  });
});
```

```powershell
Set-Location frontend
npm run test -- AboutSection.test.jsx
```

Expected: FAIL because `AboutSection.jsx` does not exist.

- [ ] **Step 2: Implement the semantic section**

Create `frontend/src/components/sections/AboutSection.jsx`:

```jsx
const principles = [
  { title: "تخصص‌محور", description: "محتوا و رویدادها بر پایه نیاز واقعی مجریان و نصابان طراحی می‌شود." },
  { title: "بلندمدت", description: "رابطه‌ای پایدار با کسانی که کیفیت اجرا را در پروژه‌ها می‌سازند." },
  { title: "میدانی", description: "آموزش عملی در کارگاه و پروژه، نه صرفاً محتوای تئوری." },
];

export function AboutSection() {
  return (
    <section id="about" className="border-t border-border bg-background py-24 sm:py-32">
      <div className="page-container grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <span className="eyebrow">درباره ما</span>
          <h2 className="mt-6 text-3xl leading-[1.35] font-black sm:text-4xl">درباره باشگاه مشتریان</h2>
        </div>
        <div className="lg:col-span-7">
          <p className="text-base leading-9 sm:text-lg sm:leading-10">
            ماموریت ما ساختن یک جامعه حرفه‌ای پایدار پیرامون افرادی است که با چسب‌های ساختمانی، مصالح نصب و اجرای پروژه‌های ساختمانی کار می‌کنند؛ از پیمانکار و نصاب اسلب تا کاشی‌کار و فروشنده مصالح.
          </p>
          <p className="mt-6 text-sm leading-8 text-muted-foreground sm:text-base sm:leading-9">
            باور داریم کیفیت نهایی هر پروژه، حاصل دانش و دقت کسی است که محصول را اجرا می‌کند. به همین دلیل باشگاه را به‌عنوان بستری برای انتقال دانش فنی، تبادل تجربه و ایجاد ارتباط مستقیم میان متخصصان و تیم فنی ما طراحی کرده‌ایم.
          </p>
          <dl className="mt-12 grid gap-px border-t border-border bg-border sm:grid-cols-3">
            {principles.map((principle) => (
              <div key={principle.title} className="bg-background py-7 sm:px-6 sm:first:pr-0">
                <dt className="text-sm font-extrabold">{principle.title}</dt>
                <dd className="mt-3 text-sm leading-7 text-muted-foreground">{principle.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Compose, verify, and commit**

Import `AboutSection` and place it after `MembershipCallout` in `App.jsx`, then run:

```powershell
npm run test -- AboutSection.test.jsx
npm run dev
```

Expected: mobile shows the heading above the copy; desktop shows a 5/7 split and three evenly divided principles.

```powershell
Set-Location ..
git add frontend/src/App.jsx frontend/src/components/sections/AboutSection*
git commit -m "feat: add customer club about section"
```

Teacher review gate: the learner explains when data can remain local to a component and why `<dl>`, `<dt>`, and `<dd>` fit title/value relationships.

---

### Task 9: Add data-driven contact information

**Files:**
- Create: `frontend/src/data/contact.js`
- Create: `frontend/src/components/sections/ContactSection.jsx`
- Create: `frontend/src/components/sections/ContactSection.test.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `Phone`, `Mail`, and `MapPin` icons.
- Produces: `contactItems` array and `ContactSection()` with `id="contact"`.

- [ ] **Step 1: Write and run the failing contact test**

Create `frontend/src/components/sections/ContactSection.test.jsx`:

```jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContactSection } from "./ContactSection";

describe("ContactSection", () => {
  it("renders phone, email, and address information", () => {
    render(<ContactSection />);
    expect(screen.getByRole("heading", { name: "تماس با ما" })).toBeInTheDocument();
    expect(screen.getByText("۰۲۱ - ۱۲۳۴ ۵۶۷۸")).toBeInTheDocument();
    expect(screen.getByText("club@example.com")).toBeInTheDocument();
    expect(screen.getByText("تهران، خیابان نمونه، پلاک ۱۲۰")).toBeInTheDocument();
  });
});
```

```powershell
Set-Location frontend
npm run test -- ContactSection.test.jsx
```

Expected: FAIL because `ContactSection.jsx` does not exist.

- [ ] **Step 2: Create the contact data**

Create `frontend/src/data/contact.js`:

```js
import { Mail, MapPin, Phone } from "lucide-react";

export const contactItems = [
  { icon: Phone, label: "شماره تماس", value: "۰۲۱ - ۱۲۳۴ ۵۶۷۸", supportingText: "شنبه تا چهارشنبه، ۹ تا ۱۷" },
  { icon: Mail, label: "ایمیل", value: "club@example.com", supportingText: "پاسخ‌گویی در کمتر از ۲۴ ساعت" },
  { icon: MapPin, label: "آدرس شرکت", value: "تهران، خیابان نمونه، پلاک ۱۲۰", supportingText: "دفتر مرکزی و واحد فنی" },
];
```

- [ ] **Step 3: Implement the responsive contact section**

Create `frontend/src/components/sections/ContactSection.jsx`:

```jsx
import { contactItems } from "../../data/contact";

export function ContactSection() {
  return (
    <section id="contact" className="border-t border-border bg-surface py-24 sm:py-32">
      <div className="page-container grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-4">
          <span className="eyebrow">ارتباط با ما</span>
          <h2 className="mt-6 text-3xl leading-[1.35] font-black sm:text-4xl">تماس با ما</h2>
          <p className="mt-5 max-w-sm text-sm leading-8 text-muted-foreground">برای عضویت، ثبت‌نام در رویدادها یا مشاوره فنی با ما در تماس باشید.</p>
        </div>
        <div className="grid gap-px border-y border-border bg-border sm:grid-cols-3 lg:col-span-8">
          {contactItems.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.label} className="bg-surface p-7">
                <Icon className="size-5 text-primary" strokeWidth="1.5" aria-hidden="true" />
                <h3 className="mt-6 text-xs font-semibold tracking-widest text-muted-foreground">{item.label}</h3>
                <p className="mt-2 text-base font-extrabold">{item.value}</p>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">{item.supportingText}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Compose, verify, and commit**

Import `ContactSection` and place it after `AboutSection` in `App.jsx`.

```powershell
npm run test -- ContactSection.test.jsx
npm run lint
npm run dev
```

Expected: three contact items stack on mobile and form one row from 640px, without truncating the email or Persian address.

```powershell
Set-Location ..
git add frontend/src/App.jsx frontend/src/data/contact.js frontend/src/components/sections/ContactSection*
git commit -m "feat: add contact information section"
```

Teacher review gate: the learner explains why contact content lives in a data module and how semantic articles/headings improve navigation.

---

### Task 10: Complete the page with the responsive footer

**Files:**
- Create: `frontend/src/components/layout/SiteFooter.jsx`
- Create: `frontend/src/components/layout/SiteFooter.test.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: the same anchor IDs used by the header and social icons from Lucide React.
- Produces: `SiteFooter()` with quick links, three labeled non-functional social anchors, and copyright.

- [ ] **Step 1: Write and run the failing footer test**

Create `frontend/src/components/layout/SiteFooter.test.jsx`:

```jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./SiteFooter";

describe("SiteFooter", () => {
  it("provides quick links, labeled social links, and copyright", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "رویدادها" })).toHaveAttribute("href", "#events");
    expect(screen.getByRole("link", { name: "اینستاگرام" })).toBeInTheDocument();
    expect(screen.getByText(/تمامی حقوق برای باشگاه مشتریان محفوظ است/)).toBeInTheDocument();
  });
});
```

```powershell
Set-Location frontend
npm run test -- SiteFooter.test.jsx
```

Expected: FAIL because `SiteFooter.jsx` does not exist.

- [ ] **Step 2: Implement the footer**

Create `frontend/src/components/layout/SiteFooter.jsx`:

```jsx
import { Instagram, Linkedin, Send } from "lucide-react";

const quickLinks = [
  { label: "رویدادها", href: "#events" },
  { label: "درباره ما", href: "#about" },
  { label: "تماس با ما", href: "#contact" },
];

const socialLinks = [
  { label: "اینستاگرام", href: "#hero", icon: Instagram },
  { label: "لینکدین", href: "#hero", icon: Linkedin },
  { label: "تلگرام", href: "#hero", icon: Send },
];

export function SiteFooter() {
  return (
    <footer className="bg-ink text-ink-foreground">
      <div className="page-container py-16">
        <div className="grid gap-10 border-b border-white/10 pb-12 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center bg-primary text-base font-black text-primary-foreground">چ</span>
              <span className="leading-tight">
                <span className="block text-sm font-extrabold">باشگاه مشتریان</span>
                <span className="block text-[11px] tracking-widest text-ink-muted">ADHESIVE PRO CLUB</span>
              </span>
            </div>
            <p className="mt-6 max-w-sm text-sm leading-8 text-ink-muted">جامعه‌ای حرفه‌ای برای پیمانکاران، نصابان و فعالان صنعت ساختمان.</p>
          </div>
          <nav className="lg:col-span-4" aria-label="لینک‌های سریع">
            <p className="text-xs font-semibold tracking-widest text-ink-muted">لینک‌های سریع</p>
            <ul className="mt-5 space-y-3">
              {quickLinks.map((link) => <li key={link.href}><a href={link.href} className="text-sm font-semibold transition-colors hover:text-primary">{link.label}</a></li>)}
            </ul>
          </nav>
          <div className="lg:col-span-3">
            <p className="text-xs font-semibold tracking-widest text-ink-muted">شبکه‌های اجتماعی</p>
            <div className="mt-5 flex gap-3">
              {socialLinks.map((social) => {
                const Icon = social.icon;
                return <a key={social.label} href={social.href} aria-label={social.label} className="grid size-10 place-items-center border border-white/15 transition-colors hover:border-primary hover:text-primary"><Icon className="size-4" aria-hidden="true" /></a>;
              })}
            </div>
          </div>
        </div>
        <p className="pt-8 text-xs text-ink-muted">© تمامی حقوق برای باشگاه مشتریان محفوظ است.</p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Compose, verify, and commit**

Import `SiteFooter` and render it after `</main>` in `App.jsx`.

```powershell
npm run test -- SiteFooter.test.jsx App.test.jsx
npm run build
npm run dev
```

Expected: footer content stacks at 375px, becomes two columns at 640px, and follows a 5/4/3 grid at 1024px. All links have visible keyboard focus.

```powershell
Set-Location ..
git add frontend/src/App.jsx frontend/src/components/layout/SiteFooter*
git commit -m "feat: complete landing page footer"
```

Teacher review gate: the learner explains layout components, accessible labels for icon-only links, and the difference between page navigation and future real social URLs.

---

### Task 11: Add restrained scroll and reveal behavior

**Files:**
- Create: `frontend/src/hooks/useReveal.js`
- Create: `frontend/src/hooks/useReveal.test.jsx`
- Modify: `frontend/src/components/layout/SiteHeader.jsx`
- Modify: `frontend/src/components/layout/SiteHeader.test.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/styles/index.css`
- Modify: each section component to add `data-reveal` to its main inner wrapper

**Interfaces:**
- Consumes: browser `scroll`, `IntersectionObserver`, and `prefers-reduced-motion`.
- Produces: `useReveal()`; `data-visible="true"` on observed elements; `data-scrolled` on `SiteHeader`.

- [ ] **Step 1: Add the failing header scroll-state test**

Add to `SiteHeader.test.jsx`:

```jsx
it("marks the header as scrolled after the page moves", () => {
  render(<SiteHeader />);
  Object.defineProperty(window, "scrollY", { value: 24, configurable: true });
  fireEvent.scroll(window);
  expect(screen.getByRole("banner")).toHaveAttribute("data-scrolled", "true");
});
```

Run `npm run test -- SiteHeader.test.jsx` and expect this new test to fail.

- [ ] **Step 2: Add scroll state without leaking the event listener**

Import `useEffect` beside `useState`. Add:

```jsx
const [isScrolled, setIsScrolled] = useState(false);

useEffect(() => {
  function handleScroll() {
    setIsScrolled(window.scrollY > 12);
  }

  handleScroll();
  window.addEventListener("scroll", handleScroll, { passive: true });
  return () => window.removeEventListener("scroll", handleScroll);
}, []);
```

Change the header opening tag to:

```jsx
<header
  data-scrolled={isScrolled}
  className={`fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,box-shadow] duration-300 ${
    isScrolled
      ? "border-border bg-background/95 shadow-refined backdrop-blur-md"
      : "border-transparent bg-background/90"
  }`}
>
```

- [ ] **Step 3: Write the reveal hook test**

Create `frontend/src/hooks/useReveal.test.jsx`:

```jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useReveal } from "./useReveal";

function Example() {
  useReveal();
  return <section data-testid="revealed" data-reveal>Content</section>;
}

describe("useReveal", () => {
  it("shows content immediately when IntersectionObserver is unavailable", () => {
    render(<Example />);
    expect(screen.getByTestId("revealed")).toHaveAttribute("data-visible", "true");
  });
});
```

- [ ] **Step 4: Implement a progressive-enhancement reveal hook**

Create `frontend/src/hooks/useReveal.js`:

```js
import { useEffect } from "react";

export function useReveal() {
  useEffect(() => {
    const elements = document.querySelectorAll("[data-reveal]");

    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => element.setAttribute("data-visible", "true"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-visible", "true");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
}
```

- [ ] **Step 5: Connect motion to the page**

Call `useReveal()` at the top of `App()`:

```jsx
import { useReveal } from "./hooks/useReveal";

export default function App() {
  useReveal();
```

In each section, add `data-reveal` to the main `.page-container` element. Add this CSS to `styles/index.css`:

```css
[data-reveal] {
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 700ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 700ms cubic-bezier(0.22, 1, 0.36, 1);
}

[data-reveal][data-visible="true"] {
  opacity: 1;
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  [data-reveal] {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

- [ ] **Step 6: Verify behavior, cleanup, and reduced motion**

```powershell
npm run test -- SiteHeader.test.jsx useReveal.test.jsx
npm run lint
npm run build
npm run dev
```

Expected: header gains its border/shadow after 12px of scroll, sections reveal once, tests do not report state-update warnings, and the browser's reduced-motion setting removes movement.

- [ ] **Step 7: Commit the polish behavior**

```powershell
Set-Location ..
git add frontend/src
git commit -m "feat: add restrained landing page motion"
```

Teacher review gate: the learner explains effects, cleanup functions, progressive enhancement, DOM observation, and reduced-motion accessibility.

---

### Task 12: Run integration, responsive, and visual acceptance checks

**Files:**
- Modify: `frontend/src/App.test.jsx`
- Modify: component/styles files only for concrete discrepancies found during comparison
- Modify: `README.md` at repository root

**Interfaces:**
- Consumes: every component and acceptance criterion from the approved spec.
- Produces: a verified landing page, documented local commands, and a final visual-polish commit.

- [ ] **Step 1: Replace the initial App test with the completed page contract**

Use this complete `frontend/src/App.test.jsx`:

```jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("composes the complete landing page in the intended order", () => {
    render(<App />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();

    const sectionIds = [...document.querySelectorAll("main > section")].map(
      (section) => section.id,
    );

    expect(sectionIds).toEqual([
      "hero",
      "benefits",
      "events",
      "join",
      "about",
      "contact",
    ]);
  });
});
```

- [ ] **Step 2: Run the complete automated verification**

```powershell
Set-Location frontend
npm run test
npm run lint
npm run build
```

Expected: every test passes, ESLint reports no issues, and the production build succeeds without warnings.

- [ ] **Step 3: Check phone widths first**

Run `npm run dev`, open browser responsive mode, and check 375px then 390px:

- No horizontal scrollbar.
- Mobile menu is operable by mouse and keyboard.
- Hero content precedes imagery and no label covers important image content.
- Actions are full-width or comfortably tappable.
- Benefits, events, About principles, Contact items, and footer content stack cleanly.
- Text does not clip and long Persian lines remain readable.

- [ ] **Step 4: Check tablet and monitor layouts**

Check 768px, 1024px, and 1440px:

- The header changes to desktop navigation at 768px.
- Benefit, event, About, Contact, and footer grids change at their intended breakpoints.
- The hero becomes two columns at 1024px without overlap or excess whitespace.
- Image crops remain consistent and do not stretch.

- [ ] **Step 5: Compare the 1680px render with the supplied screenshot**

Capture a full-page screenshot at exactly 1680px viewport width. Compare it side by side with `screencapture-localhost-5173-2026-08-31-15_25_08.png` and correct measurable differences in this order:

1. Container width and section heights.
2. RTL column order and alignment.
3. Typography sizes, weights, and line heights.
4. Major vertical and horizontal spacing.
5. Image aspect ratios, crops, and overlaps.
6. Background, ink, surface, accent, and border colors.
7. Fine details such as underlines, labels, icon sizes, and hover states.

After every correction group, repeat `npm run test`, `npm run lint`, and `npm run build`.

- [ ] **Step 6: Perform keyboard and reduced-motion checks**

Use Tab and Shift+Tab from the address bar through the full page. Confirm every link/button receives visible focus in logical RTL order. Enable reduced motion in browser/OS settings and confirm scrolling/reveals do not animate.

- [ ] **Step 7: Document the local workflow**

Create repository-root `README.md` with:

````markdown
# Customer Club

Persian RTL customer-club platform, beginning with a mobile-first public landing page.

## Frontend development

```powershell
Set-Location frontend
npm install
npm run dev
```

## Verification

```powershell
Set-Location frontend
npm run test
npm run lint
npm run build
```

The broader Django, PostgreSQL, Docker, and Ubuntu platform will be added through separately designed milestones.
````

- [ ] **Step 8: Commit the accepted landing page**

```powershell
Set-Location ..
git add README.md frontend
git commit -m "feat: finish responsive customer club landing page"
git status --short
```

Expected: the commit succeeds and `git status --short` is empty.

Teacher review gate: the learner walks through the whole component tree, explains the data flow from modules to props, demonstrates responsive behavior, and identifies where Django API calls will replace local arrays in the next milestone.

---

## Lesson Delivery Rule

Although this document contains complete target snippets for reproducibility, the teacher does not paste an entire task into the learner's project. Each checkbox is delivered as one short lesson. The learner types it, explains what changed, runs the stated check, and receives a code review before moving to the next checkbox.
