-- Legacy users retain unknown birthdays. New registrations validate complete DOBs.
ALTER TABLE "User"
    ALTER COLUMN "birthYear" DROP NOT NULL,
    ALTER COLUMN "birthMonth" DROP NOT NULL,
    ALTER COLUMN "birthDay" DROP NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_birthday_all_or_none" CHECK (
    ("birthYear" IS NULL AND "birthMonth" IS NULL AND "birthDay" IS NULL)
    OR ("birthYear" IS NOT NULL AND "birthMonth" IS NOT NULL AND "birthDay" IS NOT NULL)
);
