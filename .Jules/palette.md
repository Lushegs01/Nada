## 2024-07-04 - ChatListItem Mobile Swipes & Taps
**Learning:** When using Framer Motion's `drag` feature, `onClick` handlers might not fire on mobile touch devices when a drag is enabled on the same element because the interaction is intercepted by the drag gesture.
**Action:** Use Framer Motion's `onTap` event instead of `onClick` for items that have a drag interaction. `onTap` correctly fires only for intentional taps and prevents conflicts with the drag gesture on touch devices.
