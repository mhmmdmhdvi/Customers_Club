/*
  Warnings:

  - Added the required column `birthDay` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `birthMonth` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `birthYear` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "birthDay" INTEGER NOT NULL,
ADD COLUMN     "birthMonth" INTEGER NOT NULL,
ADD COLUMN     "birthYear" INTEGER NOT NULL;
