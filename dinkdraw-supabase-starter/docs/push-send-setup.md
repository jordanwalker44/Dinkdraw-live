# Push Send Setup

This project has a Supabase Edge Function:

```text
supabase/functions/send-test-push/index.ts
```

It sends a test push to the signed-in user's latest iOS token in `public.push_tokens`.

## Required Supabase secrets

Set these in Supabase Dashboard, under Edge Functions secrets:

```text
APNS_TEAM_ID
APNS_KEY_ID
APNS_PRIVATE_KEY
APNS_BUNDLE_ID
APNS_USE_SANDBOX
```

Use:

```text
APNS_BUNDLE_ID=com.dinkdraw.app
APNS_USE_SANDBOX=true
```

Use sandbox while testing from Xcode on a real iPhone. For TestFlight/App Store testing, change `APNS_USE_SANDBOX` to `false`.

Do not put the `.p8` key in app code.

## Deploy

From this folder:

```bash
npx supabase functions deploy send-test-push
```

## Test

After deployment, call the function while signed in. The function is intentionally limited to sending a test notification to your own signed-in user.
