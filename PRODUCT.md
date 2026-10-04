# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
One person: the founder of Chekki, working alone on a laptop browser. Sales outreach is done by hand, a few emails a day (the app caps sends at 8 per day).

## Product Purpose
Chekki AI Lead Enrichment finds Korean English academies, kindergartens and similar schools on Naver Local Search, enriches each one with Gemini (institution type, student age range, CEFR levels taught, email with a confidence label, fit reason, priority score), saves the good ones to a Firestore database, and drafts personalized outreach emails for Chekki Schools. Success is a short, trustworthy path from search to a sent email, with no wrong facts in the email.

## Positioning
Built for one seller targeting Korean hagwons, with facts tied to Naver data and an explicit email-confidence label, so nothing unverified gets sent as if it were checked.

## Operating Context
Main workflow, which has to feel fastest: Search, enrich, save, then draft and send an email. The saved-lead list (Database view) is the second job: review leads, filter by status, bulk status changes and send. Statuses: pending, sent, replied, bounced, not_contacted, opted_out. Opted-out leads can never be emailed. Unverified (`unknown`, or `estimated` and not marked verified) emails are blocked from bulk send. Deleting a lead is a soft delete (`deleted: true`). Export to CSV exists. Sign-in is Google, owner only (jsn.benjamin@gmail.com), behind Basic Auth.

## Capabilities and Constraints
- Stack: React 19, Vite, Tailwind 4, Firebase (Firestore, Auth), Express dev server, Vercel deploy, motion, lucide-react, sonner toasts.
- Two views today: Search and Database.
- Lead data includes Korean names (institution_name_kr) with English names, Naver ID, address, phone, email and confidence, website, fit reason, agent notes, priority 1-5.
- Korean text must render well. Product facts in prompts are single-sourced in `src/lib/chekkiFacts.ts`.
- All features, data and behavior stay the same in a redesign. Email prompt structure must not change.

## Brand Commitments
Product name: Chekki AI, "Lead Enrichment". The user did not state other brand constraints.

## Evidence on Hand
63 saved leads in Firestore. Screenshots of the current UI exist in the earlier portfolio work. No testimonials or customer logos, and none should be invented.

## Product Principles
1. The send path is the product: search to sent email in the fewest steps.
2. Never present unverified data as verified. Confidence and verification state stay visible.
3. One person, one laptop: favor density and speed over onboarding and decoration.
4. Destructive and irreversible actions (opt-out, delete, send) stay deliberate.

## Accessibility & Inclusion
No product-specific requirement stated. Korean and English text both appear on every lead.
