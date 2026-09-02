import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { getPluginByName } from "@superset/shared/plugins";
import { toast } from "@superset/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "renderer/lib/posthog";
import { PLUGIN_CATALOG_KEY } from "renderer/routes/_authenticated/_dashboard/plugins/hooks/usePluginCatalog";
import {
	PLUGIN_CONNECTIONS_KEY,
	registerPluginEnabled,
	registerPluginInstall,
	registerPluginUninstall,
} from "renderer/routes/_authenticated/_dashboard/plugins/hooks/usePluginConnections";

const displayName = (name: string) =>
	getPluginByName(name)?.interface.displayName ?? name;

/** Install/uninstall/toggle with shared toasts, analytics, and invalidation. */
export function usePluginMutations() {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey: PLUGIN_CATALOG_KEY });
		void queryClient.invalidateQueries({ queryKey: PLUGIN_CONNECTIONS_KEY });
	};

	const syncAccount = async (
		name: string,
		action: "install" | "uninstall",
	): Promise<boolean> => {
		try {
			if (action === "install") await registerPluginInstall(name);
			else await registerPluginUninstall(name);
			return true;
		} catch (error) {
			toast.warning(
				t({
					id: "dashboard.plugins.mutations.accountSyncFailed",
					message: `${displayName(name)} is set up on this machine, but not on your account`,
				}),
				{ description: errorMessage(error) },
			);
			return false;
		} finally {
			invalidate();
		}
	};

	const installMutation = electronTrpc.plugins.install.useMutation({
		onSuccess: (_data, variables) => {
			posthog.capture("plugin_installed", { plugin: variables.name });
			toast.success(
				t({
					id: "dashboard.plugins.mutations.installed",
					message: `${displayName(variables.name)} installed`,
				}),
				{
					description: t({
						id: "dashboard.plugins.mutations.takesEffectNewSessions",
						message: "Takes effect in new agent sessions.",
					}),
				},
			);
		},
		onError: (error) => {
			toast.error(
				t({
					id: "dashboard.plugins.mutations.installFailed",
					message: "Install failed",
				}),
				{ description: errorMessage(error) },
			);
		},
	});
	const uninstallMutation = electronTrpc.plugins.uninstall.useMutation({
		onSuccess: (_data, variables) => {
			void syncAccount(variables.name, "uninstall");
			posthog.capture("plugin_uninstalled", { plugin: variables.name });
			toast.success(
				t({
					id: "dashboard.plugins.mutations.uninstalled",
					message: `${displayName(variables.name)} uninstalled`,
				}),
			);
		},
		onError: (error) => {
			toast.error(
				t({
					id: "dashboard.plugins.mutations.uninstallFailed",
					message: "Uninstall failed",
				}),
				{ description: errorMessage(error) },
			);
		},
	});
	const setEnabledMutation = electronTrpc.plugins.setEnabled.useMutation({
		onSuccess: (_data, variables) => {
			void registerPluginEnabled(variables.name, variables.enabled)
				.catch((error) =>
					toast.warning(
						t({
							id: "dashboard.plugins.mutations.accountSyncFailed",
							message: `${displayName(variables.name)} is set up on this machine, but not on your account`,
						}),
						{ description: errorMessage(error) },
					),
				)
				.finally(() => invalidate());
			posthog.capture(
				variables.enabled ? "plugin_enabled" : "plugin_disabled",
				{ plugin: variables.name },
			);
			toast.success(
				variables.enabled
					? t({
							id: "dashboard.plugins.mutations.enabled",
							message: `${displayName(variables.name)} enabled`,
						})
					: t({
							id: "dashboard.plugins.mutations.disabled",
							message: `${displayName(variables.name)} disabled`,
						}),
				{
					description: t({
						id: "dashboard.plugins.mutations.takesEffectNewSessions",
						message: "Takes effect in new agent sessions.",
					}),
				},
			);
		},
		onError: (error) => {
			toast.error(
				t({
					id: "dashboard.plugins.mutations.updateFailed",
					message: "Could not update plugin",
				}),
				{
					description: errorMessage(error),
				},
			);
		},
	});

	const updateMutation = electronTrpc.plugins.install.useMutation({
		onSuccess: (_data, variables) => {
			posthog.capture("plugin_updated", { plugin: variables.name });
			toast.success(
				t({
					id: "dashboard.plugins.mutations.updated",
					message: `${displayName(variables.name)} updated`,
				}),
				{
					description: t({
						id: "dashboard.plugins.mutations.takesEffectNewSessions",
						message: "Takes effect in new agent sessions.",
					}),
				},
			);
		},
		onError: (error) => {
			toast.error(
				t({
					id: "dashboard.plugins.mutations.updateFailed",
					message: "Could not update plugin",
				}),
				{ description: errorMessage(error) },
			);
		},
	});

	const add = async (name: string): Promise<boolean> => {
		navigate({ to: "/plugins/$pluginName", params: { pluginName: name } });
		await installMutation.mutateAsync({ name });
		return await syncAccount(name, "install");
	};

	const update = async (name: string): Promise<boolean> => {
		await updateMutation.mutateAsync({ name });
		return await syncAccount(name, "install");
	};

	return {
		add,
		update,
		install: async (name: string) => {
			await installMutation.mutateAsync({ name });
			return await syncAccount(name, "install");
		},
		uninstall: (name: string) => uninstallMutation.mutate({ name }),
		setEnabled: (name: string, enabled: boolean) =>
			setEnabledMutation.mutate({ name, enabled }),
		isBusy:
			installMutation.isPending ||
			updateMutation.isPending ||
			uninstallMutation.isPending ||
			setEnabledMutation.isPending,
	};
}
