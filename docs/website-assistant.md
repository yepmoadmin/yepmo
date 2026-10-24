# Website assistant

Each business page has an **Ask a question** button. It opens a small chat panel where visitors type questions in their own words.

## How it answers

The assistant never writes its own answers. It matches the visitor's question against that business's approved answers and shows the best match **word for word**, with up to two related questions the visitor can tap. If nothing matches well enough, it says it has no approved answer yet and shows the business's contact links.

So it cannot invent a price, opening time, policy or medical claim: every fact it shows has already been approved by a human in the business's approved feed.

Matching understands common wording, for example "how much", "cost" and "fee" all mean price; "park" and "car" mean parking; "cancel" and "reschedule" mean cancellation. Unapproved rows never reach it.

## Safety rules built in

- **No personal data.** If a message looks like it contains an email address, phone number, UK postcode, name, date of birth, NHS number or address, the assistant does not process it, hides it from the chat, and asks the visitor not to share personal details.
- **Nothing is saved or sent.** It runs entirely in the visitor's browser using the answers already loaded on the page. It makes no network requests, has no analytics, and the conversation disappears when the page is closed or reloaded.
- **Health businesses** (`"healthcare": true` in the business config): questions about symptoms, pain or injuries get a fixed reply saying the assistant can't assess symptoms or give medical advice and pointing to a practitioner, with the business's contact links. Words that suggest an emergency add "call 999 / NHS 111". These redirect messages are fixed text written into the template, not generated.
- **Business separation.** It only searches the business that the page loaded.
- **Fails closed.** If the business's approved feed doesn't load, the button doesn't appear.

## Limits

- It is a matching assistant, not a generative AI chatbot. A question worded very differently from the approved answers may get "no approved answer yet". The fix is to add or reword approved answers in the business's Sheet.
- The personal-data and symptom checks are pattern checks. They catch common cases, not every possible wording.
- The emergency numbers (999, NHS 111) are UK-specific.

## A generative AI version (owner decision, not built)

A chatbot that rewrites answers conversationally would need a paid AI API, a small server to keep the API key secret, and strict instructions to answer only from approved text. It would also send visitors' messages to the AI provider, which affects the "nothing is sent anywhere" promise and needs a privacy notice. This is not built. It should only be added if the owner decides the extra cost and privacy trade-off are worth it.
