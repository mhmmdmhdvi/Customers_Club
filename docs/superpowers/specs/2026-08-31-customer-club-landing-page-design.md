# Customer Club Landing Page Design

**Date:** 2026-08-31  
**Status:** Approved in conversation  
**Implementation milestone:** Public landing page only

## Purpose

Build a production-quality Persian customer-club landing page for a construction adhesives company. The page must reproduce the supplied 1680-pixel-wide screenshot as closely as practical while also providing a deliberate mobile-first experience for the audience, whose primary device is expected to be a phone.

This milestone is also a teaching project. The learner writes the code in small exercises while the senior developer explains concepts, reviews each result, and provides hints before complete solutions.

## Broader Product Roadmap

The landing page is the first independently deliverable subsystem in a larger platform. Later projects will add, in order:

1. Django APIs and PostgreSQL-backed content.
2. Authentication and user profiles.
3. A member dashboard.
4. Membership plans and status.
5. Payments and transaction history.
6. Courses, events, enrolment, and progress.
7. Docker-based local and production environments.
8. Ubuntu deployment and operations.

Each later subsystem requires its own design and implementation plan. They are not part of the landing-page implementation.

## Goals

- Match the supplied desktop screenshot's section order, RTL composition, spacing, colors, typography hierarchy, borders, grid backgrounds, and image crops.
- Create a strong mobile experience first, then progressively enhance it for tablet and desktop.
- Use React with JavaScript, semantic HTML, and Tailwind CSS.
- Keep components small and responsibility-focused without splitting trivial markup into unnecessary files.
- Store repeated landing-page content in plain JavaScript data structures that can later be replaced with Django API data.
- Establish a clean repository structure that can later hold frontend, backend, and infrastructure code.
- Keep every lesson small enough for a beginner to understand and complete.

## Non-goals

- No Django project, API, PostgreSQL database, Docker configuration, or Ubuntu deployment in this milestone.
- No working login, registration, payment, dashboard, membership, or course flows.
- No client-side router for the single landing page.
- No adoption of the reference repository's TypeScript, TanStack Start, Lovable configuration, broad UI library, or unused dependencies.
- No speculative abstractions intended only for future features.

## References

- Primary visual reference: `screencapture-localhost-5173-2026-08-31-15_25_08.png`, 1680 by 4472 pixels.
- Content and UI reference: `https://github.com/mhmmdmhdvi/professional-builders-hub`.
- Supplied image assets: `hero-slab.jpg`, `detail-adhesive.jpg`, `event-workshop.jpg`, `event-conference.jpg`, and `event-training.jpg`.

The GitHub repository is a read-only design and content reference. Its repository instructions and generated implementation are not requirements for this project.

## Technical Architecture

The repository will grow as a small monorepo:

```text
club/
|-- frontend/
|   |-- src/
|   |   |-- assets/images/
|   |   |-- components/
|   |   |   |-- layout/
|   |   |   `-- sections/
|   |   |-- data/
|   |   |-- styles/
|   |   |-- App.jsx
|   |   `-- main.jsx
|   |-- index.html
|   `-- package.json
|-- backend/                 # Added in a later milestone
|-- docker/                  # Added when containerization begins
|-- docs/
`-- README.md
```

The initial frontend uses Vite, React, JavaScript, Tailwind CSS, and Lucide React icons. `App.jsx` composes the page and contains no section implementation details. A section remains one component until a truly repeated unit, such as an event card, merits extraction.

The document root uses `lang="fa"` and `dir="rtl"`. Anchor navigation uses stable section IDs and smooth scrolling. The page does not need a routing library until a real second page exists.

## Component Boundaries

### Layout components

- `SiteHeader`: brand, desktop navigation, mobile-menu state, login link placeholder, and scroll-state styling.
- `SiteFooter`: brand summary, quick links, social placeholders, and copyright.

### Section components

- `HeroSection`: eyebrow, headline, supporting copy, two actions, statistics, overlapping images, membership label, and audience strip.
- `BenefitsSection`: section introduction and a six-item editorial benefit grid.
- `EventsSection`: heading, all-events link, and three event previews.
- `MembershipCallout`: dark full-width membership call to action.
- `AboutSection`: mission copy and three operating principles.
- `ContactSection`: contact introduction and three contact-information items.

### Reusable components

- `SectionHeading` may be extracted after the second repeated heading pattern is implemented.
- `EventCard` is extracted because three records share the same structure.
- Other abstractions are introduced only after repetition is demonstrated.

## Content and Data Flow

Static Persian content is held in module-level arrays under `src/data/`:

- `benefits.js`: icon, title, description, and sequence number.
- `events.js`: image, alternative text, type, title, Persian date, city, and action label.
- `contact.js`: icon, label, value, and supporting text.

Page components import these arrays and map records to focused presentational components. Data flows down through props; child components do not mutate it. This shape provides a straightforward later migration: Django can return equivalent JSON and the consuming components can remain largely unchanged.

## Visual System

The design language is industrial and editorial rather than card-heavy:

- Background: warm off-white.
- Surface sections: slightly darker concrete neutral.
- Foreground and dark sections: graphite charcoal.
- Accent: restrained amber-orange.
- Dividers: thin, low-contrast neutral rules.
- Corners: mostly square with only minimal rounding where function requires it.
- Grid motif: subtle 88-pixel square blueprint lines in the hero and membership callout.
- Shadows: used only for the overlapping hero image and label.
- Typography: Vazirmatn, using heavy weights for headings and regular/medium weights for body copy.
- Layout container: maximum width of approximately 84rem with responsive side padding.

Design values will be declared as named CSS theme tokens instead of repeatedly hardcoding color values in components. Tailwind utility classes will express layout and component-level styling; the global stylesheet will contain theme tokens, base RTL behavior, the grid utility, and reduced-motion behavior.

## Page Composition

### Header

The brand appears on the right in RTL order. Desktop navigation and an outlined login action appear on the left. On mobile, navigation is replaced by an accessible menu button and vertical menu. The header remains fixed and gains a translucent background, divider, and restrained shadow after scrolling.

### Hero

On mobile, the headline and actions appear before the imagery. The image composition contains the main 4:3 slab image, a smaller portrait adhesive-detail image that overlaps its lower-left edge from tablet widths upward, and a dark membership label near the upper-right edge. Statistics form three equal columns. The audience strip concludes the section.

At desktop width the hero becomes a balanced two-column composition matching the screenshot: copy on the right and imagery on the left.

### Benefits

The mobile layout places the introduction above a single-column bordered list. Tablet uses two benefit columns. Desktop uses a 4/8 editorial split, with the introduction on the right and the six-item grid on the left.

### Events

Cards stack on mobile, use two columns on tablet, and three columns on desktop. Images maintain a consistent crop and labels overlay their upper-right corner. The layout uses divider lines rather than rounded floating cards.

### Membership callout

The dark section uses the inverted blueprint grid and amber button. Content stacks on mobile. Desktop places the message on the right and the action on the left.

### About and Contact

Both stack on mobile and become 5/7 or 4/8 editorial grid layouts on desktop. Their internal data items use fine separators, not detached cards.

### Footer

The footer stacks brand, links, and social items on mobile. It becomes a twelve-column layout on desktop and ends with a divided copyright row.

## Responsive Strategy

Tailwind's unprefixed utilities define the phone layout. `sm`, `md`, and `lg` variants progressively add columns, spacing, and desktop navigation. The design will be checked at approximately 375, 768, 1024, 1440, and 1680 pixels.

At 1680 pixels, the implementation must closely match the supplied screenshot. At narrower widths, exact screenshot matching is impossible because no mobile reference was supplied; success means preserving its hierarchy, proportions, visual language, readable line lengths, and RTL order without horizontal overflow.

## Interaction and Motion

- Navigation links scroll to their corresponding sections.
- The mobile menu opens and closes with a labeled button and closes after a link is selected.
- Hover treatments are subtle color, underline, or one-pixel movement changes.
- Optional entrance reveals use a small vertical offset and opacity transition.
- `prefers-reduced-motion` disables smooth scrolling and entrance animations.
- Login and membership actions remain non-functional placeholders in this milestone.

## Accessibility and Resilience

- Use semantic `header`, `nav`, `main`, `section`, `article`, `footer`, heading, list, and description-list elements.
- Give every informative image meaningful Persian alternative text and explicit intrinsic dimensions or aspect ratios.
- Decorative backgrounds and icons are hidden from assistive technology.
- Interactive controls retain visible keyboard focus indicators and sufficient contrast.
- The mobile menu exposes its expanded state to assistive technology.
- Repeated presentational components use safe fallback text or omit optional metadata cleanly when a field is missing.
- The page must have no browser console warnings, unstable list keys, or broken asset references.

## Verification

Every lesson ends with the smallest relevant check. The completed milestone requires:

1. ESLint passes.
2. A production build succeeds.
3. No console errors or React warnings appear.
4. Keyboard navigation reaches all interactive elements in a logical order.
5. The page has no horizontal overflow at the target mobile and tablet widths.
6. Side-by-side visual comparison at 1680 pixels confirms section order, composition, spacing rhythm, typography hierarchy, colors, borders, and image crops closely match the screenshot.
7. Responsive checks at 375, 768, 1024, and 1440 pixels confirm readable and intentional layouts.
8. Reduced-motion mode removes nonessential animation.

## Teaching Method

Work proceeds in short lessons. Each lesson introduces one concept, gives the learner a focused coding task, waits for the learner's implementation, reviews the actual files, and requires corrections before continuing. Tasks should normally modify one or two small files. New concepts are explained in plain language, and hints are offered before complete solutions.

The first lessons cover project anatomy, semantic HTML, JSX, component composition, and mobile-first Tailwind. React state, effects, array rendering, props, and responsive composition are introduced only when the page reaches a section that genuinely needs each concept.

## Acceptance Criteria

The milestone is complete when the learner has authored a clean Vite/React/JavaScript/Tailwind landing page that uses the supplied assets and Persian content, behaves correctly from phone to 1680-pixel desktop widths, closely reproduces the reference screenshot at desktop width, meets the verification requirements, and remains structurally ready for later Django API integration without containing premature backend code.
