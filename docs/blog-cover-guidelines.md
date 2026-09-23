# Armature journal cover guideline

The MHS article uses **Common interface**, an original abstract cover rather than a depiction of a real Armature machine. Two other directions, **Kinematic relay** and **Instrument field**, were compared in the local review gallery before selection. The published PNG is a complete static cover; the article adds a restrained SVG/CSS motion overlay.

## Method for each article

1. Write one sentence stating the article's real subject and claim. Pick **one physical cue** that belongs to it: for MHS, a common connector, a joint, or a group of instruments. Never imply a real deployment, partnership or device specification from an abstract cover.
2. Translate the cue into two or three simple forms and one relationship (align, pivot, sense, exchange). Leave ample negative space. Keep the subject within the central 70% so it survives a small listing thumbnail and social crops.
3. Use near-black `#111110`, warm white and one muted accent. Fine measured lines, precision joints and instrument detail fit the existing editorial system. Avoid the approved circular logo, article title, fake labels, generic AI smoke, glossy gradients and copied reference compositions.
4. Finish the **still first**. Check the image at 320 px wide before adding motion. Derive a 5–7 second low-amplitude loop from an actual form in that still. The motion should explain a relationship, not become the main subject.
5. Export a wide static image of at least 1200 px width, with a descriptive filename and alt text. Use it in an ordinary `<img src>` on both article and blog listing. If selected for publication, add the same representative static image to route-specific `og:image`, Twitter metadata and `BlogPosting.image` in the HTML returned for the article URL. Keep the article title and summary as text outside the artwork. Respect reduced motion, pause offscreen/hidden playback and give readers a pause control.
6. Review desktop and phone crops, light/dark/sepia surroundings, loop seam, image bytes, raw HTML metadata and the live article URL. Record the source prompt and rights for each artwork. For future posts, keep the same framing and motion restraint but change the physical cue to match the article.

Google can discover images in `<img src>` and recommends representative, high-resolution images in metadata; its Discover guidance recommends at least 1200 px width and large image previews. These steps improve eligibility; they do not guarantee a particular search preview. Sources: [Google image SEO](https://developers.google.com/search/docs/appearance/google-images), [Discover](https://developers.google.com/search/docs/appearance/google-discover), [Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article).

## Generation prompts used for these studies

**01 · Common interface.** Original abstract robotic visual for an article about a common interface connecting agents to hardware. Three distinct instrument ends — camera barrel, slim gripper and linear-stage socket — converge on a central machined circular coupling. Clean technical construction lines, matte materials, dark charcoal, warm white, muted copper and slate. Calm scientific editorial treatment; 16:9 with a central safe area. No text, logo, watermark, gradients, smoke, neon or copied orbit/blob composition.

**02 · Kinematic relay.** Original abstract robotic visual for controlled physical motion. A spare three-bar articulated linkage, precision pivots, faint ghost positions and measured swing arcs; the tool tip aligns with one target. Tactile but abstract, deep charcoal, warm white, muted copper joints, generous negative space; 16:9 with a central safe area. No text, logo, watermark, gradients, smoke, neon or literal factory scene.

**03 · Instrument field.** Original abstract robotic visual for models interfacing with many instruments. Sparse square cells and hairline connections; a few cells suggest an aperture, gripper, sample well and actuator. Muted copper path travels outward; cool observation path returns. Precise dark editorial geometry, 16:9 with a central safe area. No text, logo, watermark, gradients, smoke, neon or copied blobs/orbits.

Generated with the built-in Image Gen tool on 23 September 2026. The selected PNG is 1672 × 941. Its original SVG/CSS overlay lives in `src/pages/BlogPages.tsx` and `BlogPages.css`; the artwork is not a pre-rendered video.
