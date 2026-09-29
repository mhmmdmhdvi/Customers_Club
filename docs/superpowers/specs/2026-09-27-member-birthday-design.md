# Member Birthday Feature Design

Date: 2026-09-27  
Branch: `feat/member-birthday`

## 1. Purpose

Add a required Jalali/Shamsi date of birth during MEMBER registration and use it to send an annual birthday SMS.

The feature must:

- collect a valid Jalali birth date during registration
- store Jalali year, month, and day
- display the birthday on the member dashboard
- display the birthday in Admin Users
- send at most one birthday SMS per MEMBER per Jalali year
- use `Asia/Tehran` for birthday matching
- exclude ADMIN accounts from birthday SMS
- preserve the existing authentication, ADMIN MFA, and session behavior

---

## 2. Scope

### Included

- required birthday during new MEMBER registration
- a single ready-made Persian/Jalali calendar picker in the registration UI
- Jalali birth-year, birth-month, and birth-day storage
- backend Jalali validation
- member dashboard birthday display
- Admin Users birthday display
- birthday SMS delivery service
- persistent delivery ledger
- scheduler-independent one-shot birthday processing command
- deterministic local testing with an injectable clock
- future Ubuntu/systemd scheduling strategy
- automated backend and frontend tests

### Not included

- editing birthdays
- birthday-change history
- birthday campaign management UI
- configurable send time in Admin Console
- birthday SMS for ADMIN accounts
- general-purpose background-job infrastructure

---

## 3. Current Environment

The application currently uses:

- React / JSX
- Vite
- Tailwind CSS
- Node.js / Express
- PostgreSQL
- Prisma
- the existing SMS provider abstraction

The production Ubuntu server does not exist yet.

Therefore the birthday feature must be completely testable locally without systemd, cron, or any other production scheduler.

No database reset or destructive migration workflow is allowed.

---

## 4. Birthday Storage

The Jalali birthday will be stored directly on `User`:

```prisma
birthYear  Int
birthMonth Int
birthDay   Int

@@index([role, birthMonth, birthDay])
```

The application will not store the birthday as a Gregorian date.

This preserves exactly what the member entered and makes annual Jalali birthday matching straightforward.

---

## 5. Registration API

The existing registration request:

```json
{
  "verificationToken": "...",
  "firstName": "...",
  "lastName": "..."
}
```

will become:

```json
{
  "verificationToken": "...",
  "firstName": "...",
  "lastName": "...",
  "birthYear": 1375,
  "birthMonth": 7,
  "birthDay": 12
}
```

All birthday fields are required for registration.

The backend is authoritative for validation.

---

## 6. Jalali Validation

The backend must verify:

- year is an integer
- month is between 1 and 12
- day is valid for that Jalali month
- Esfand leap-year rules are correct
- the complete Jalali date is valid
- the birthday is in the past

There is no minimum-age requirement.

Validation will live in a focused reusable module rather than directly inside a controller.

The frontend date picker improves usability, but browser input can be bypassed, so backend validation remains mandatory.

---

## 7. Registration Birthday Picker

Registration will use one clear Jalali date-picker field rather than three separate year/month/day controls.

The field will use `react-multi-date-picker` with its Persian/Solar Hijri calendar and Farsi locale.

### Visible field

The registration form will show:

```text
تاریخ تولد
[  انتخاب تاریخ تولد                 📅 ]
```

Requirements:

- full-width box matching the existing registration inputs
- clear label: `تاریخ تولد`
- placeholder: `انتخاب تاریخ تولد`
- visible calendar icon
- clicking/tapping anywhere on the field opens the calendar
- manual free-form typing is disabled
- selected value is shown in a clear Persian Jalali format
- RTL-friendly calendar position

### Calendar behavior

The calendar must:

- use the Persian/Solar Hijri calendar
- use the Farsi locale
- keep both month and year pickers enabled
- make it practical to jump directly to an older birth year rather than clicking backward month-by-month
- prevent selection of future dates in the UI where practical
- remain usable on narrow/mobile screens
- close after a single date is selected

The date-picker library is responsible for calendar presentation and normal Jalali month/day behavior in the browser. The application must not reimplement the first-six-months/31-days rule in React.

When the user selects a date, the frontend extracts and sends numeric values:

```js
{
  birthYear,
  birthMonth,
  birthDay,
}
```

The backend remains the final authority for date validity and whether the selected date is in the past.

---

## 8. Member Dashboard

The member dashboard will display the birthday in Jalali format.

Example:

```text
۱۲ مهر ۱۳۷۵
```

No birthday editing UI is included.

---

## 9. Admin Users

The Admin Users page will display each user's birthday using the same Jalali presentation format.

Example:

```text
۱۲ مهر ۱۳۷۵
```

Existing ADMIN authorization remains unchanged.

---

## 10. Birthday SMS Delivery Ledger

A dedicated table will prevent duplicate annual sends.

```prisma
enum BirthdaySmsDeliveryStatus {
  PENDING
  SENT
  FAILED
}

model BirthdaySmsDelivery {
  id         Int                       @id @default(autoincrement())
  userId     Int
  user       User                      @relation(fields: [userId], references: [id], onDelete: Cascade)
  jalaliYear Int
  status     BirthdaySmsDeliveryStatus
  attempts   Int                       @default(0)
  sentAt     DateTime?
  createdAt  DateTime                  @default(now())
  updatedAt  DateTime                  @updatedAt

  @@unique([userId, jalaliYear])
  @@index([status, jalaliYear])
}
```

`User` will also gain:

```prisma
birthdaySmsDeliveries BirthdaySmsDelivery[]
```

The unique constraint on:

```text
(userId, jalaliYear)
```

is the database-level protection against duplicate annual birthday deliveries.

---

## 11. Eligibility

A birthday SMS candidate must satisfy all of these rules:

- role is `MEMBER`
- `birthMonth` matches today's Jalali month
- `birthDay` matches today's Jalali day
- the current Jalali year has not already been successfully delivered
- no other processor has already claimed the same `(userId, jalaliYear)`

ADMIN accounts must never be selected.

---

## 12. One-Shot Birthday Processor

The backend will expose a command such as:

```text
node scripts/process-birthdays.js
```

The command will:

1. determine the current time in `Asia/Tehran`
2. determine today's Jalali year/month/day
3. find eligible MEMBER accounts
4. claim a delivery ledger row
5. send the birthday SMS
6. record success or failure
7. continue processing other eligible members
8. exit when complete

It will not remain running.

---

## 13. Scheduling and Local Development

There will be no scheduler inside the Node web server.

During local development, the birthday processor will be invoked manually:

```text
node scripts/process-birthdays.js
```

Tests will use an injectable clock so we can simulate any date without waiting for a real birthday.

The application must not add:

- `setInterval()` birthday processing
- an in-process cron loop
- a permanently running birthday worker

When an Ubuntu production server exists later, we will schedule the same one-shot command externally.

The planned production schedule is:

```text
09:00 Asia/Tehran
```

The preferred future mechanism is a systemd service + timer.

Installing and enabling systemd scheduling is deferred until the server actually exists.

---

## 14. SMS Integration

Birthday SMS will reuse the project's existing SMS provider abstraction.

Birthday delivery will have its own method/template rather than reusing OTP messages.

The birthday domain service should depend on an interface similar to:

```js
sendBirthdayMessage({
  phone,
  firstName,
})
```

Provider-specific details remain outside the birthday business logic.

---

## 15. Delivery States

### PENDING

The delivery has been claimed for processing.

### SENT

The SMS provider confirmed successful delivery submission.

`sentAt` is populated.

### FAILED

The attempt failed.

`attempts` records the number of attempts.

Retries must be conservative because an ambiguous provider timeout could mean the provider accepted the SMS even though the application did not receive confirmation.

---

## 16. Concurrency and Duplicate Protection

The birthday command must remain safe if executed more than once.

The database constraint:

```text
(userId, jalaliYear)
```

is authoritative.

The application must claim a delivery before sending the SMS.

Two concurrent processors must not be able to send two birthday messages for the same member/year.

---

## 17. Timezone

Birthday calculations must explicitly use:

```text
Asia/Tehran
```

The implementation must not rely on the computer/server's implicit local timezone.

Date/time dependencies should be injectable for deterministic tests.

---

## 18. Failure Handling

One member's SMS failure must not stop processing other eligible members.

Expected delivery failures should be recorded in the ledger.

Unexpected command-level failures should cause the command to exit unsuccessfully.

Logs must not expose:

- SMS provider secrets
- OTP values
- ADMIN MFA secrets
- access tokens
- refresh tokens

---

## 19. Security and Privacy

Birth date is personal member data.

The implementation must:

- expose birthday information only where required
- preserve existing ADMIN authorization
- preserve CSRF/origin/session protection
- avoid logging complete member records
- avoid adding birthday information to security telemetry
- leave ADMIN MFA behavior unchanged

Birthday data must not affect authentication or authorization.

---

## 20. Migration

The Prisma migration will add:

- `birthYear`
- `birthMonth`
- `birthDay`
- birthday lookup index
- `BirthdaySmsDeliveryStatus`
- `BirthdaySmsDelivery`
- its foreign key
- its indexes
- the unique `(userId, jalaliYear)` constraint

Migration SQL must be reviewed before application.

We will not use:

```text
prisma db push
database reset
destructive migration commands
```

Existing disposable local test data may be handled deliberately if required, but no database-wide reset is permitted.

---

## 21. Testing

Development will use RED → GREEN TDD.

### Jalali validation

Test:

- valid date
- invalid month
- invalid day
- month-length boundaries
- Esfand
- leap-year Esfand
- future birthday
- valid historical birthday

### Registration UI

Test:

- one clearly labelled `تاریخ تولد` field appears after OTP verification for a new member
- placeholder is `انتخاب تاریخ تولد`
- calendar input is not free-form editable
- selected Jalali date produces numeric year/month/day in the registration request
- missing birthday prevents registration
- existing MEMBER login and ADMIN MFA flows remain unchanged

### Registration backend

Test:

- birthday fields required
- valid birthday saved
- invalid Jalali date rejected
- existing verification-token behavior unchanged

### Member dashboard

Test:

- birthday displayed
- Jalali month name displayed correctly

### Admin Users

Test:

- birthday fields returned by backend
- birthday displayed in Admin UI
- existing ADMIN authorization unchanged

### Birthday SMS

Test:

- matching MEMBER selected
- ADMIN excluded
- non-matching MEMBER ignored
- one delivery per Jalali year
- duplicate concurrent claim prevented
- success becomes `SENT`
- failure becomes `FAILED`
- attempt count updated
- one member failure does not stop others
- Tehran/Jalali date boundary behavior

### Command

Test:

- one-shot processor runs
- injectable clock allows simulated dates
- command exits after processing
- fatal command failure returns failure
- no scheduler runs inside the web server

---

## 22. Local Verification

Before considering the feature finished:

Backend:

```text
full backend test suite passes
```

Frontend:

```text
full frontend test suite passes
lint has zero warnings/errors
production build succeeds
```

Database:

```text
migration SQL reviewed
migration applied only to customer_club_db
Prisma reports database schema up to date
```

Manual verification:

1. register a MEMBER using the Jalali calendar picker
2. confirm the picker is easy to open and the year/month can be changed quickly
3. see the selected birthday on the member dashboard
4. see it in Admin Users
5. run the processor using a simulated matching date
6. confirm one delivery ledger record is created
7. run it again and confirm no duplicate annual delivery is created

---

## 23. Acceptance Criteria

The feature is complete when:

- MEMBER registration requires a valid past Jalali birthday
- registration uses one clear ready-made Persian/Jalali calendar picker
- users can navigate to their birth year/month without stepping backward month-by-month
- birthday is stored as Jalali year/month/day
- invalid Jalali dates cannot be registered
- member dashboard displays the birthday
- Admin Users displays the birthday
- ADMIN accounts are excluded from birthday SMS
- birthday matching uses `Asia/Tehran`
- each MEMBER receives at most one birthday SMS per Jalali year
- concurrent duplicate delivery is prevented by the database
- birthday processing is a scheduler-independent one-shot command
- no birthday scheduler runs inside the Node web process
- production systemd scheduling is deferred until an Ubuntu server exists
- existing login, sessions, ADMIN MFA, and Admin Console continue working
