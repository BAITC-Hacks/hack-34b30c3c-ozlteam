---
name: card-loading-skeletons
description: Design and implement loading states for cards in this project's UI. Use whenever creating, changing, or reviewing a card whose content may wait for data, media, or AI output.
---

# Card loading skeletons

For every card, decide whether its first meaningful content can be delayed. If it waits for a request, media, or AI result, include a shimmer skeleton; skip it for static or immediately available content.

- Make the skeleton match the final card's structure and dimensions closely enough to prevent layout shift. Represent the real title, media, metadata, and actions instead of showing a generic rectangle or spinner.
- Reuse the shared `Skeleton` primitive and design tokens when available. Do not create a one-off shimmer implementation inside each card.
- Use the skeleton only when there is no usable content yet. During refetches and mutations, preserve the rendered card and show a local pending affordance instead of replacing it.
- Keep empty, error, and loading states distinct. Mark the loading region with `aria-busy`; skeleton decoration itself must not be announced by assistive technology.
- Keep shimmer subtle and disable its movement for `prefers-reduced-motion: reduce` without hiding the placeholder.
- Verify the initial loading state with a delayed response at desktop and mobile widths, then confirm that the loaded card occupies the same geometry.
