# Private beta — manual checklist

Only the things that need a human. Everything else (tests, build, typecheck,
schema, RLS, analytics wiring) is verified in the repo and in Supabase.

Work top to bottom; each step depends on the one above it.

---

### 1. Push

```bash
git push origin main
```

Vercel builds every push to `main`. Nothing else to configure.

### 2. Confirm the deploy went out

Vercel → **question_bowl** → the newest deployment reads **Ready**, and its
commit matches your local `HEAD`.

Then open <https://questionbowl.vercel.app> and tap **Roll the First
Question**. If the deck comes up, the build is good.

> If the site loads but nothing ever saves, the environment variables are
> missing. Vercel → Settings → Environment Variables needs
> `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and they are read at
> **build** time — set them and redeploy, or they won't take.

### 3. Confirm the admin account exists

Supabase → **QB Production** → Authentication → Users.

There should be a user for `toddhansmann@gmail.com`. That address is already
in the `admin_emails` allow-list, so nothing else is needed. If you add a
second admin later, add their email to `admin_emails` too — an auth account on
its own reads every metric as zero.

### 4. Sign in to /admin

<https://questionbowl.vercel.app/admin> → sign in.

You should see the dashboard, not a wall of zeros. Zeros with a note about the
allow-list means step 3 isn't done.

**Signing in switches that device to test mode.** That's deliberate — it keeps
your own play out of the beta's numbers. The header shows the toggle if you
ever want it off.

### 5. Test the iPhone Home Screen launch

This is the one thing that could not be verified from a desktop, and the
previous attempt at this bug looked right and wasn't.

1. Open the site in Safari on the phone
2. Share → **Add to Home Screen** (delete the old icon first if one exists)
3. Launch from the Home Screen

Looking for: the orange gradient reaching the very bottom of the screen, with
**no white bar** above the home indicator.

### 6. Play one real session, then check it landed

On a device that is **not** in test mode — someone else's phone is ideal:

1. Tap in, swipe through at least **5** questions (that's what marks a session
   completed)
2. Rate one question 👍 or 👎
3. Submit one suggestion from the ☰ menu

Then reload `/admin` with **Include test data** left unticked. You should see
1 unique visitor, 1 session started, 1 session completed, 1 rating, 1
suggestion. If traffic shows but ratings don't, the write is being blocked —
check the browser console on the phone.

### 7. Announce

---

## Known and accepted for beta

Not blockers — listed so they aren't surprises.

- **Writes aren't rate-limited.** Anyone with the public key can insert
  ratings and events as fast as they like. Invisible among friends; worth a
  Supabase rate limit before the link travels further.
- **"Sessions completed" is a definition, not an observation** — five
  questions in. The deck never ends, so there's nothing natural to measure.
- **Unique visitors leans on localStorage.** Private windows and cleared site
  data each read as a new person, so the number runs slightly high.
- **Test mode is asserted by the browser**, so someone determined could hide
  their own activity. Costs them their own data and nobody else's.
