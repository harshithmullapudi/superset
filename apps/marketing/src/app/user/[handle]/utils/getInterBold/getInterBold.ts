const INTER_BOLD_URL =
	"https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZhrib2Bg-4.ttf";

let interBoldPromise: Promise<ArrayBuffer> | null = null;

export function getInterBold(): Promise<ArrayBuffer> {
	if (!interBoldPromise) {
		interBoldPromise = fetch(INTER_BOLD_URL).then((res) => {
			if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
			return res.arrayBuffer();
		});
		interBoldPromise.catch(() => {
			interBoldPromise = null;
		});
	}
	return interBoldPromise;
}
