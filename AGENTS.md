<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application rules
- Keep the BUILT website at the index route, with product previews as isolated browser-safe components, so the first screen remains the complete requested experience.
- Define presentation and motion roles in the global design system and use shared UI controls, so animation and theming remain consistent.
- Preserve the uploaded website's external contact destination and request payload for presentation-only changes; do not provision or change storage without a separate request.
- Keep original legal copy as structured content sourced from the uploaded website, so presentation changes do not invent policy terms.
- Pre-optimize React, its renderer, and the initial UI dependencies together in Vite so late dependency discovery cannot mix React instances in an already-open preview.
