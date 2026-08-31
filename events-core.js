/* ==========================================================================
   EVENTS CORE — shared by the public events page and the staff dashboard
   ==========================================================================

   content/events.json is the only source of truth for what appears on the
   events page. The staff dashboard at /admin writes that file; events.html
   renders it. Nothing about an event lives in code any more, so Luke can add,
   edit and remove events without a developer.

   Every Selah event is a standing rhythm, not a one-off, so hard-coded dates
   would silently rot the moment a month turned over. Each recurring event
   carries a rule and the next real date is computed in the browser at page
   load, which keeps the page correct in six months with nobody touching it.
   One-off events (cadence "once") carry an explicit date and simply drop off
   the list once they are past.

   The wording under each date — "First & third Tuesday of every month" — is
   DERIVED from the rule, not stored. That is deliberate: when it was stored,
   nothing stopped someone setting a fourth-Wednesday rule while the caption
   still read "second Thursday", and no check would ever catch it.

   This is its own file for one reason: the dashboard shows a live preview of
   the card being edited, and if that preview computed dates or wrote captions
   from its own copy of these rules, the two would drift and the preview would
   start lying. One implementation, both consumers.

   Plain script rather than a module — everything else on this site is, and
   the dashboard wants these on the global scope too.

   Church Center remains the church's own calendar and the events page still
   links to it, but the two are no longer mirrors maintained by hand.
   ========================================================================== */

/* Local rather than reusing script.js's escapeHtml: /admin never loads
   script.js, and a shared file that only works for one of its two consumers
   is not actually shared. */
function escapeEventText(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDINAL_WORDS = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth'];
const ORDINAL_SHORT = ['', '1st', '2nd', '3rd', '4th', '5th'];

/* Join week numbers the way a person would say them: "First & third", not
   "1,3". Lower-cases every ordinal after the first, matching the copy that
   was already on the page ("First & third Tuesday of every month"). */
function joinOrdinals(weeks, words) {
  const parts = weeks.map((n) => words[n]).filter(Boolean);
  if (parts.length <= 1) return parts[0] || '';
  const rest = parts.slice(1).map((w) => w.toLowerCase());
  return [parts[0], ...rest].join(' & ');
}

/* Turn a stored rule into the three display strings a card needs, so the
   caption can never disagree with the rule that generated it. */
function describeCadence(ev) {
  const weekday = Number(ev.weekday);
  if (ev.cadence === 'once') {
    const when = ev.date ? new Date(`${ev.date}T00:00:00`) : null;
    const valid = when && !Number.isNaN(when.getTime());
    return {
      recurrence: valid
        ? when.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : '',
      top: valid ? when.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : 'TBD',
      bottom: valid ? String(when.getDate()) : '',
    };
  }
  if (ev.cadence === 'weekly') {
    return {
      recurrence: `Every ${WEEKDAY_NAMES[weekday]}`,
      top: 'Every',
      bottom: WEEKDAY_ABBR[weekday],
    };
  }
  const weeks = (ev.weeks || []).slice().sort((a, b) => a - b);
  if (!weeks.length) return { recurrence: '', top: 'TBD', bottom: '' };
  return {
    recurrence: `${joinOrdinals(weeks, ORDINAL_WORDS)} ${WEEKDAY_NAMES[weekday]} of every month`,
    top: joinOrdinals(weeks, ORDINAL_SHORT),
    bottom: WEEKDAY_ABBR[weekday],
  };
}

/* The stored shape is flat so the dashboard form stays simple; the date maths
   below wants a rule object. One place converts between them. */
function eventRule(ev) {
  if (ev.cadence === 'once') return { once: ev.date || '' };
  const rule = { weekday: Number(ev.weekday) };
  if (ev.cadence === 'monthly' && (ev.weeks || []).length) {
    rule.nths = ev.weeks.slice().sort((a, b) => a - b);
  }
  if (ev.startsOn) rule.startsOn = ev.startsOn;
  return rule;
}

/* The nth weekday of a month, or null when that month has no nth — a 5th
   Friday does not exist in most months, and asking for one must not silently
   roll into the next month. */
function nthWeekdayOfMonth(year, month, weekday, nth) {
  const first = new Date(year, month, 1);
  const shift = (weekday - first.getDay() + 7) % 7;
  const date = new Date(year, month, 1 + shift + (nth - 1) * 7);
  return date.getMonth() === month ? date : null;
}

/* The first occurrence on or after `from`. An event happening *today* still
   counts as upcoming — nobody wants the page to drop tonight's dinner at
   9am on the day of it. Monthly rules scan 14 months so a rule that skips
   some months (a 5th-weekday rule) still resolves. */
function nextOccurrence(rule, from) {
  // A one-off is its own next occurrence, and null once it's past — that null
  // is what drops a finished event off the page without anyone deleting it.
  if ('once' in rule) {
    if (!rule.once) return null;
    const when = new Date(`${rule.once}T00:00:00`);
    return Number.isNaN(when.getTime()) || when < from ? null : when;
  }
  // A series that hasn't begun yet can't occur before its first date.
  let start = from;
  if (rule.startsOn) {
    const seriesStart = new Date(`${rule.startsOn}T00:00:00`);
    if (seriesStart > start) start = seriesStart;
  }
  if (!rule.nths) {
    const shift = (rule.weekday - start.getDay() + 7) % 7;
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + shift);
  }
  for (let i = 0; i < 14; i += 1) {
    const probe = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const hits = rule.nths
      .map((n) => nthWeekdayOfMonth(probe.getFullYear(), probe.getMonth(), rule.weekday, n))
      .filter((d) => d && d >= start)
      .sort((a, b) => a - b);
    if (hits.length) return hits[0];
  }
  return null;
}

function eventCardHTML(ev, next) {
  const cadence = describeCadence(ev);
  const month = next
    ? next.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
    : cadence.top;
  const day = next ? String(next.getDate()) : cadence.bottom;
  const meta = [cadence.recurrence, ev.time, ev.location].filter(Boolean).join(' · ');
  // Both halves of the link are required — a button with a label and no
  // destination, or a destination and no label, is a broken card either way.
  const cta = ev.linkHref && ev.linkLabel
    ? `<a href="${escapeEventText(ev.linkHref)}" class="btn btn-outline-dark btn-small">${escapeEventText(ev.linkLabel)}</a>`
    : '';
  return `
    <div class="event-card">
      <div class="event-date"><span class="month">${escapeEventText(month)}</span><span class="day">${escapeEventText(day)}</span></div>
      <div class="event-info">
        <h3>${escapeEventText(ev.title)}</h3>
        <p>${escapeEventText(ev.description)}</p>
        <span class="event-meta">${escapeEventText(meta)}</span>
      </div>
      ${cta}
    </div>`;
}

/* Sorted by whichever happens soonest, with past one-offs removed. Both the
   page and the dashboard order events this way — the stored order in the JSON
   file is not display order and nothing should imply that it is. */
function upcomingEvents(items, today) {
  return (items || [])
    .filter((ev) => ev && ev.title)
    .map((ev) => ({ ev, next: nextOccurrence(eventRule(ev), today) }))
    .filter(({ ev, next }) => next || ev.cadence !== 'once')
    .sort((a, b) => {
      if (!a.next) return 1;
      if (!b.next) return -1;
      return a.next - b.next;
    });
}
