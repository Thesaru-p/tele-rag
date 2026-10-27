type WelcomeDocument = { file_name: string; status: string };
export function welcomeMessageReady(
  connected: boolean | undefined,
  documents: WelcomeDocument[],
): boolean;
export function buildWelcomeMessage(options: {
  businessName: string;
  botUsername?: string | null;
  documents?: WelcomeDocument[];
}): string;
