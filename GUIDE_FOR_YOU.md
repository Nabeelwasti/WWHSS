# Your Simple Guide — What This Is and What To Do

Written for you, not for a programmer. Read it in order. Nothing here needs you to know how to code.

---

## 1. What did I actually get?

Think of it like a toy box. Inside the box are all the pieces to build a school
app — like Lego pieces already snapped into a working car, but the car still
needs a few more parts (like paint and stickers) before it's finished and
shiny.

The pieces that ARE working right now:
- Logging in and out safely
- Marking who came to school (attendance)
- Homework and quizzes (a teacher gives them, a student does them, it's
  graded automatically)
- Report cards
- A class schedule (timetable)
- A library (search books, borrow, return)
- School fees
- A public website page for notices and events (no login needed)
- A little AI helper that can answer questions
- Changing your password / an admin resetting someone's password

The pieces NOT built yet (this is a big project — that's normal):
- Screens for the school admin to set up the library catalog, fee prices,
  and website notices (right now those need typing commands — a next step)
- A fancy "tour guide" that walks new users around the app
- Games for practicing lessons

---

## 2. How do I actually SEE it and click on it?

Right now, this app lives only as **text files** — like a recipe that hasn't
been cooked yet. To see it as a real working website you can click buttons
on, you need to "cook" it. Here are your two options, easiest first.

### Option A — The easy way (recommended first): a free website helper

1. Go to **github.com** and make a free account if you don't have one.
2. Create a new, empty repository (a repository is just a folder on
   GitHub). Name it something like `wwhs-digital-campus`.
3. Upload the folder I gave you into that repository (GitHub's website has
   an "upload files" button — drag and drop the whole folder onto it).
4. Go to a website called **railway.app** (or **render.com** — both have
   free starting tiers). Make an account, click "New Project", and choose
   "Deploy from GitHub repo" — pick the repository you just made.
5. These sites will ask a few questions (like "what folder is the backend
   in?" — answer `backend`, and later do the same for `frontend`). They
   also need you to add a Postgres database — both sites have a
   one-click "Add Database" button.
6. You'll need to type in a few secret settings (I explain exactly which
   ones in Part 4 below) into a box on their website called
   "Environment Variables."
7. Click deploy. Wait a few minutes. You'll get a real web address
   (like `https://your-app.up.railway.app`) — that's your school's app!

This path needs no terminal typing at all — just clicking buttons on
websites, which is why I recommend starting here.

### Option B — Running it yourself on a computer (more control, more steps)

If you have a Windows or Mac computer:
1. Install **Docker Desktop** (search "Docker Desktop download", it's
   free, click-to-install like any other program).
2. Install **Node.js** (search "Node.js download", click the button that
   says "LTS").
3. Open the app called **Terminal** (Mac) or **Command Prompt** (Windows).
4. Type these lines one at a time, pressing Enter after each:
   ```
   cd Desktop
   ```
   (this just moves you to your Desktop folder — put the project folder
   there first)
   ```
   cd wwhs-digital-campus
   docker compose up -d
   ```
5. Wait a minute or two. Then open your web browser and go to:
   `http://localhost`
6. You should see the school's public homepage!

---

## 3. How do I log in the first time?

Whichever option you used, there's a starting "admin" account so you can get
in the first time:
- **Email:** `admin@wwhs.local`
- **Password:** whatever you set as `ADMIN_PASSWORD` (Option A), or
  `ChangeMe!123` if you're just testing on your own computer (Option B,
  before setting `NODE_ENV=production`)

Once you're in, use the **Administration** screen to create real accounts
for real teachers, students, and parents — each with their own login.

**Important first step:** click **Change my password** at the bottom of
your dashboard and set your own real password immediately.

---

## 4. What are those "secret settings" (environment variables)?

Think of these like the combination to a safe. A few of them are required;
most are optional extras.

**You MUST set these three, always:**
| Name | What it is | How to get it |
|---|---|---|
| `JWT_ACCESS_SECRET` | A password the app uses internally | Just mash your keyboard for 40+ random characters, or ask any AI to "generate a random 64-character string" |
| `JWT_REFRESH_SECRET` | A second, DIFFERENT random password | Same as above — must be different from the first |
| `DATABASE_URL` | Where your data is stored | Railway/Render give you this automatically when you add a database — just copy-paste it in |

**Set this when you go live for real (not just testing):**
| Name | What it is |
|---|---|
| `NODE_ENV` | Type `production` |
| `ADMIN_PASSWORD` | A real password, 12+ characters, for your first admin login |
| `ADMIN_EMAIL` | The email for that first admin account |

**Optional — only if you want the AI helper to work:**
See Part 5 below.

---

## 5. Setting up the AI helper (and using MULTIPLE free API keys)

You asked for the AI to automatically try different services if one doesn't
work, and to support many free ones — this is now built in for real. Here's
how you turn it on, in the simplest terms:

1. Go to **aistudio.google.com/apikey** (Google AI Studio). Sign in with
   any free Google account. Click "Create API key." This is FREE for a
   generous amount of daily use.
2. Copy that key. In your environment variables, add:
   ```
   AI_PROVIDER_1=gemini
   AI_PROVIDER_1_KEY=paste-your-key-here
   ```
3. Want a backup in case the first one runs out for the day? Make a
   SECOND free Google account (or ask a friend/colleague for their key),
   get another key, and add:
   ```
   AI_PROVIDER_2=gemini
   AI_PROVIDER_2_KEY=paste-second-key-here
   ```
4. You can keep adding `AI_PROVIDER_3`, `AI_PROVIDER_4`, etc. — up to 10 —
   mixing Gemini, Anthropic (Claude), or a free self-run model. The app
   tries them in order automatically. If #1 is busy or out of free
   quota for the day, it silently tries #2, and so on — nobody using the
   app sees any error, they just get an answer.

You do NOT need to write any code for this — just add these lines to your
environment variables, wherever you're hosting it.

---

## 6. Does it work on phones? On different computers?

**Yes, by design.** This is what's called a "responsive web app" — it's
one single app that automatically resizes and rearranges itself to fit
whatever screen it's on:
- **On a phone** (Android or iPhone): open the web address in Chrome or
  Safari like any website. Because I built it as an "installable" app
  (a PWA), your phone will offer to **"Add to Home Screen"** — do that,
  and it behaves like a real app icon, opens full-screen, and even
  works a little bit when there's no internet (it remembers the app's
  look, though it still needs internet to show real, current data —
  that's on purpose, so nobody sees old, wrong grades by mistake).
- **On a Windows PC, Mac, or Chromebook**: just open the web address in
  any browser (Chrome, Edge, Firefox, Safari). No installation needed at
  all.
- **On a shared/older device**: it's built to be light and simple on
  purpose, since I know many families may be sharing one older phone.

There is nothing separate to build for "mobile" — it's the same one app
everywhere.

---

## 7. What should I ask an AI coding helper to do next?

You mentioned Google Antigravity and Termux. Quick honest note: Antigravity
is a real, powerful tool, but making it run on Termux (a terminal app for
Android) currently needs some fiddly workarounds from other developers'
scripts — I don't recommend that as your first step. **Gemini CLI**, a
simpler Google tool, is known to work smoothly on Termux directly, if you
want an AI helper that lives right on your phone.

Either way — whether you come back to me, or use Gemini CLI, Antigravity, or
any other AI coding tool — here is a copy-paste-ready list of what to ask
for next, in priority order:

```
1. "Build the admin screens for managing the library catalog, fee
   structures, and website notices/events — the backend for all three
   already exists and works, I just need the buttons and forms."

2. "Add a 'weak topics' feature: look at a student's real quiz scores by
   subject, and show them which subject they should practice more,
   computed from their actual attempts — never a guess."

3. "Build simple practice-quiz 'games' — a timed multiple-choice mode and
   a flashcard-style review mode — reusing the existing Quiz/QuizQuestion
   database tables."

4. "Add a small floating help button that's visible on every screen and
   explains what that screen does when clicked, using the existing AI
   assistant endpoint."

5. "Get a native speaker to review the Urdu text in frontend/src/i18n.tsx,
   then translate the remaining English-only screens the same way."
```

---

## 8. If something breaks or you get confused

You don't need to know what any error message means. Just:
1. Take a screenshot or copy the exact text of the problem.
2. Come back and paste it to me (or whichever AI tool you're using), and
   say "this happened, what do I do?"

That's genuinely the whole process — you are not expected to debug this
yourself.
