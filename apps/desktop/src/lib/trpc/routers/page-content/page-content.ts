import { registerPageContent, releasePageContent } from "main/lib/pageContent";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createPageContentRouter = () => {
	return router({
		// A URL to frame, because a `srcdoc` document would inherit the renderer's CSP and lose all inline script.
		register: publicProcedure
			.input(z.object({ html: z.string() }))
			.mutation(({ input }) => registerPageContent(input.html)),

		release: publicProcedure
			.input(z.object({ token: z.string() }))
			.mutation(({ input }) => {
				releasePageContent(input.token);
			}),
	});
};
