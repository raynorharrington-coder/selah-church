# Selah Church website — dashboard guide

This is for whoever on Luke's team keeps the Events page up to date. No
coding, no Git, nothing technical — just a form.

## Sermons — nothing for you to do

Messages are pulled in from YouTube automatically once a day. As long as a
new message gets added to the right series playlist on YouTube (the same
thing that's always been done for the church's own site), it'll show up on
selahchurch.org's Sermons page and homepage on its own within a day. There
is nothing to log in and update for this.

## Events — this is what the dashboard is for

### Logging in

1. Go to **selahchurchfxbg.com/admin**
2. Click **Login with GitHub**
3. If it's your first time, approve the app when GitHub asks

### Adding a new event

1. Once logged in, you'll see **Events** in the left sidebar — click it,
   then click into **Upcoming Events**.
2. You'll see a list called **Events** with the current events already on
   the site. Click **Add "Events"** (or the `+` button, depending on
   screen size) to add a new one.
3. Fill in:
   - **Title** — e.g. "Family Movie Night"
   - **Date** — pick it from the calendar. If you don't know the exact
     date yet, leave this blank and the site will show "TBD" instead of a
     wrong date.
   - **Time / Location** — a short line like `6:30 PM · Fellowship Hall`.
     Leave blank and it'll show "Time & location — TBD".
   - **Description** — a sentence or two, same tone as the others already
     there.
4. Click **Publish** (top right) when you're done. Give it a few seconds —
   it goes live automatically, no separate "deploy" step.
5. Refresh the actual Events page on the site to confirm it looks right.

### Editing or removing an event

1. From the **Upcoming Events** list, click on the event you want to
   change.
2. Edit any field, then **Publish** again — or use the trash/remove
   icon next to an item in the list to delete it entirely.
3. Past events don't disappear automatically — delete them yourself once
   they've happened, the same way you'd remove any other item.

### A few things to know

- Every change here goes live on the real site within seconds of hitting
  **Publish** — there's no draft/review step before the public sees it, so
  double-check before publishing.
- If you make a mistake, just edit the entry again and publish the fix —
  there's no "undo" button in the dashboard itself.
- Nothing here can break the rest of the website. This dashboard only
  controls the Events list — it can't touch the Sermons page, Give page,
  or anything else.
- If login stops working or something looks broken, that's a "call the
  developer" situation, not something to troubleshoot yourself — see
  `STEP-BY-STEP.md` (the technical setup doc) for what might be wrong, or
  just reach out.
