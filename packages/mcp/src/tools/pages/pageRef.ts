/**
 * `pageRefSchema` wants `id` or `slug` present, but a `nullish()` tool input
 * arrives as an explicit null, which is not the same as absent — passing it
 * through fails the refine with a confusing message.
 */
export function pageRef(input: { id?: string | null; slug?: string | null }) {
	return {
		...(input.id ? { id: input.id } : {}),
		...(input.slug ? { slug: input.slug } : {}),
	};
}
