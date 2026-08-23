import { Button } from "@superset/ui/button";
import { Pixel404 } from "@superset/ui/pixel-404";
import Link from "next/link";
import { MessageScreen } from "@/components/MessageScreen";

// Also the answer for a page the reader may not see: `page.get` returns
// NOT_FOUND rather than FORBIDDEN so a private page's existence stays private,
// and this copy has to be true of both.
export default function PageNotFound() {
	return (
		<MessageScreen
			graphic={<Pixel404 className="max-w-[260px] text-foreground" />}
			title="This page isn't here"
			description="The link may be wrong, the page may have been deleted, or you may not have access to it."
			action={
				<Button asChild size="sm" variant="outline">
					<Link href="/">Go to Superset</Link>
				</Button>
			}
		/>
	);
}
