import { ensureThumbnail, peekThumbnail } from "main/lib/pageThumbnails";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createPageThumbnailRouter = () => {
	return router({
		peek: publicProcedure
			.input(z.object({ pageId: z.string(), version: z.string() }))
			.query(({ input }) => peekThumbnail(input.pageId, input.version)),

		ensure: publicProcedure
			.input(
				z.object({
					pageId: z.string(),
					version: z.string(),
					html: z.string(),
				}),
			)
			.mutation(({ input }) => ensureThumbnail(input)),
	});
};
