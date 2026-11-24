# Antigravity: next tasks (paste each block as its own message)

## 1. Paystack branding and webhook
Open the Paystack dashboard for SunRootLearn. (a) Settings > Preferences: set business name to "SunRootLearn" and upload the Sunroot logo, so the payment window shows our name. (b) Settings > API Keys & Webhooks: confirm the webhook URL is https://sunrootlearn.com/api/billing/webhook and the live keys match Coolify's PAYSTACK_SECRET_KEY. (c) Make one real 100-naira test payment on the plans page, confirm the plan activates, then report the reference and what the popup looked like. Do not paste any key in your report.

## 2. Coolify persistent volume for the library
In Coolify, open the SunRootLearn app > Storages and add a persistent volume mounted at /data/library (the app reads LIBRARY_DIR, default /data/library). Redeploy. Report the volume name and confirm a file uploaded in the app still exists after a redeploy.

## 3. Enable billing limits (only when I say so)
Do not do this until I confirm: set BILLING_ENFORCED=1 in Coolify so the 7-day trial and plan limits start applying, then redeploy. Report the deployed commit from /api/version.

## 4. Verify FUTO schools and departments
From FUTO's official website (futo.edu.ng), list every school and its departments exactly as published. Compare with lib/academic/futo.ts and send me a diff: names to add, remove or rename. Do not edit the repo, just report.

## 5. Android app rebuild
Follow the earlier rebuild prompt (word wrap, pull-to-refresh, native bars). Report the app root, versionCode and versionName, and the signed APK location. Then open the PR that updates public/app-version.json and the GitHub Release.
