declare var Bun: Bun | undefined;
declare var Deno: Deno | undefined;

interface Bun {}

interface Deno {
	noColor: boolean;
	permissions: any;
}
