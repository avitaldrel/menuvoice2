# MenuVoice tester usage report

Generated: 2026-06-21

Sources checked:
- Production `events` telemetry in Vercel Postgres.
- Gmail sent/search results for MenuVoice testing, feedback, prototype, and named contacts.
- Google Drive search for the candidate email/name fragments the user provided.

## Bottom line

The strongest match for someone who genuinely tested MenuVoice is probably Joey Arnold.

Telemetry shows a login email recorded as:

`jmarnold1977@gmail.com.jmarnold1977@gmail.com`

That looks like the same email duplicated during capture/login, not two separate users. This account is the only non-internal user with multiple sessions and real product activity across search, menu extraction, Q&A, saves, and photo capture.

## Actual testers

### 1. Probable Joey Arnold

Email recorded in telemetry: `jmarnold1977@gmail.com.jmarnold1977@gmail.com`

Confidence: High for actual usage. Medium-high that this is Joey Arnold, based on the user's note that Joey sent a full report and the `jmarnold1977` email pattern. Gmail and Drive searches did not find a matching message from `jmarnold1977@gmail.com`, so the name match is inferred rather than confirmed from Gmail.

Usage summary:
- 3 sessions
- 174 telemetry events
- First seen: 2026-06-17 11:32 AM ET
- Last seen: 2026-06-19 1:52 PM ET
- 8 restaurant searches
- 3 menu extraction results
- 3 user questions / 3 assistant replies
- 2 saved restaurants
- 5 recorded failures

What he actually did:
- Completed login/profile/onboarding-like activity.
- Used Find mode for restaurant searches.
- Searched for `Olive Garden, Montgomery Alabama`; the app failed with a readable-menu/unreadable-menu type result.
- Searched for `McDonald's, Troy Alabama`; the app failed and said the menu did not seem posted online.
- Searched for `The Butcher's Daughter, Enterprise, Alabama`; one attempt failed, then a later attempt succeeded with 41 items.
- Saved `The Butcher's Daughter`.
- Asked 3 questions in the conversation flow and received 3 assistant replies.
- Later used Capture mode with auto-capture guidance.
- Took several menu photos, got one failed extraction, then succeeded on `Annie's Cafe` with 11 items.
- Saved `Annie's Cafe`.

Interpretation:
This is real testing. He exercised multiple important flows: Find, menu retrieval, save, conversation/Q&A, Capture, auto guidance, OCR/menu extraction, and failure states.

### 2. Sharon Williams

Email recorded in telemetry: `sharonwilliams19771977@gmail.com`

Confidence: Medium for actual usage. Gmail/Drive searches did not find this email, so the name comes from the address itself.

Usage summary:
- 1 session
- 52 telemetry events
- First/last seen: 2026-06-12 11:53-11:56 AM ET
- 2 restaurant searches
- 1 capture-related event
- 1 user question / 1 assistant reply
- 1 saved restaurant
- 2 recorded failures

Interpretation:
This looks like a real, short app test rather than just opening the app. They used search, reached conversation, asked a question, and saved something. It was not as deep as Joey's test.

## Opened or browsed, but did not really test

### Scotty Joffre

Email recorded in telemetry: `scottyjoffre@gmail.com`

Confidence: High that this email opened the app. Low/medium that the person is named Scotty Joffre, because Gmail/Drive searches did not confirm the name; it is inferred from the address.

Usage summary:
- 1 session
- 42 telemetry events
- Seen: 2026-06-13 4:53-4:59 PM ET
- Screens visited: home, find, capture, settings
- 0 searches
- 0 successful menu extractions
- 0 questions / 0 assistant replies
- 0 saves
- 0 failures

Interpretation:
This looks like opening and exploring the app, not a real test. They moved through screens and triggered one capture-related event, but did not search for a restaurant, extract a menu, ask a question, or save anything.

## Likely internal or bad login value

### `avitildrel`

Email recorded in telemetry: `avitildrel`

Usage summary:
- 1 session
- 92 events
- Seen: 2026-06-16 5:05-5:15 PM ET
- 2 searches
- 6 questions / 6 assistant replies
- 1 save

Interpretation:
This looks like your own testing or a typo/bad email value, not an outside tester. It should probably be excluded from tester reporting unless you recognize it as someone else.

## People contacted by email with no matching app telemetry found

These were found in Gmail sent/search results as MenuVoice feedback/testing/outreach recipients, but I did not find matching production app usage under their email addresses:

- Austin Linton: `a.linton81657@gmail.com`
- Sean McElroy: `seanrobertmcelroy@gmail.com`
- Thomas Reid / T. Reid: `treid99@gmail.com`
- Jonathan Mosen: `jmosen@nfb.org`
- Jonathan/Thomas draft target: `ReidMyMindRadio@gmail.com`
- Internship/applicant recipients in the sent outreach batch, including Rodas, Omar, Angela, Anirudh, Ibrahim, Abesira, and others.

Austin did reply that he would see what he could do and might record a first-time experience, but his email address does not appear in telemetry.

Ben Bond:
- I searched Gmail for `Ben Bond`, `benbond`, and `Ben` with MenuVoice context.
- No matching sent or received Gmail result was found in that search.
- No app telemetry match was found for a Ben Bond email because no candidate email was available.

## Candidate address check

From the candidate list the user provided, only this address matched production telemetry:

- `scottyjoffre@gmail.com`: opened/explored, but no evidence of a full test.

The following candidate addresses did not match production telemetry and did not appear in relevant Gmail/Drive searches:

- `Trfox.072@gmail.com`
- `CHernandez481972@gmail.com`
- `visolutioninsights@gmail.com`
- `vacationbyv@yahoo.com`
- `Tajphoto1@gmail.com`
- `brooke.smith04@icloud.com`
- `jenerrose@aol.com`

These candidate addresses appeared in Gmail but did not match production telemetry:

- `A.linton81657@gmail.com` - Austin Linton; testing discussion only.
- `seanrobertmcelroy@gmail.com` - Sean McElroy; feedback request sent, no matching usage.

## Practical takeaway

For feedback follow-up, prioritize Joey Arnold first. His usage is the only one that clearly exercised the product deeply enough to support a useful bug/UX report.

Second priority is Sharon Williams if you can identify or contact her; she appears to have performed a shorter but real test.

Do not treat Scotty Joffre as a real tester yet. The evidence says he opened and browsed the app, but did not use the core flows.
