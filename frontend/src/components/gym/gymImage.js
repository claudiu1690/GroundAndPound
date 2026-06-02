// Gym banner image filenames are coupled to the gym `name` field: renaming a gym
// without renaming its image file at frontend/public/gyms/<slug>.webp silently
// falls back to the placeholder background color (no broken-image icon).

export function gymImageSlug(name) {
    return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

export function gymImageUrl(name) {
    if (!name) return null;
    const slug = gymImageSlug(name);
    if (!slug) return null;
    return `/gyms/${slug}.webp`;
}
