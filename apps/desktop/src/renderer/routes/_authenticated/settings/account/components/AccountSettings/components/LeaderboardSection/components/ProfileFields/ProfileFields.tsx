import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { BIO_MAX } from "@superset/trpc/leaderboard-schema";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

export function ProfileFields({ handle }: { handle: string }) {
	const { t } = useLingui();

	const profile = useQuery({
		queryKey: ["leaderboard", "profile", handle] as const,
		queryFn: () =>
			apiTrpcClient.leaderboard.public.participant.query({
				handle,
				period: "all",
			}),
		staleTime: 60_000,
		retry: false,
	});

	const [bio, setBio] = useState("");
	const [xHandle, setXHandle] = useState("");
	const [websiteUrl, setWebsiteUrl] = useState("");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!profile.data) return;
		setBio(profile.data.bio ?? "");
		setXHandle(profile.data.xHandle ?? "");
		setWebsiteUrl(profile.data.websiteUrl ?? "");
	}, [profile.data]);

	const save = async () => {
		setSaving(true);
		try {
			await apiTrpcClient.leaderboard.updateProfile.mutate({
				bio: bio.trim() || null,
				xHandle: xHandle.trim() || null,
				websiteUrl: websiteUrl.trim() || null,
			});
			await profile.refetch();
			toast.success(
				t({
					message: "Saved",
				}),
			);
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't save"));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="mt-4 space-y-3 border-t border-border pt-4">
			<div className="space-y-1.5">
				<Label htmlFor="leaderboard-bio" className="text-xs">
					<Trans>Bio</Trans>
				</Label>
				<Textarea
					id="leaderboard-bio"
					value={bio}
					maxLength={BIO_MAX}
					rows={2}
					onChange={(event) => setBio(event.target.value)}
					placeholder={t({
						message: "One line about how you work",
					})}
				/>
				<p className="text-[0.7rem] text-muted-foreground">
					<Trans>
						{String(bio.length)}/{String(BIO_MAX)}. Links are stripped.
					</Trans>
				</p>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<div className="space-y-1.5">
					<Label htmlFor="leaderboard-x" className="text-xs">
						<Trans>X handle</Trans>
					</Label>
					<Input
						id="leaderboard-x"
						value={xHandle}
						onChange={(event) => setXHandle(event.target.value)}
						placeholder="yourhandle"
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="leaderboard-site" className="text-xs">
						<Trans>Website</Trans>
					</Label>
					<Input
						id="leaderboard-site"
						value={websiteUrl}
						onChange={(event) => setWebsiteUrl(event.target.value)}
						placeholder="https://example.com"
					/>
				</div>
			</div>

			<p className="text-[0.7rem] text-muted-foreground">
				<Trans>
					Your GitHub link comes from the account you signed in with, so it
					shows as verified and cannot be edited here.
				</Trans>
			</p>

			<Button size="sm" onClick={save} disabled={saving || profile.isLoading}>
				{saving ? <Trans>Saving…</Trans> : <Trans>Save profile</Trans>}
			</Button>
		</div>
	);
}
