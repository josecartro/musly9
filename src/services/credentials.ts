import * as SecureStore from "expo-secure-store";

const API_KEY_STORAGE_KEY = "axforge.soundtrack.api-key";
const API_BASE_STORAGE_KEY = "axforge.soundtrack.api-base";

export const DEFAULT_API_BASE_URL =
  process.env.EXPO_PUBLIC_AXFORGE_API_BASE_URL?.trim() ||
  "https://api.axforge.ai/v1";

export interface ApiCredentials {
  apiKey: string;
  baseUrl: string;
}

export async function loadCredentials(): Promise<ApiCredentials> {
  const [apiKey, baseUrl] = await Promise.all([
    SecureStore.getItemAsync(API_KEY_STORAGE_KEY),
    SecureStore.getItemAsync(API_BASE_STORAGE_KEY),
  ]);
  return {
    apiKey: apiKey ?? "",
    baseUrl: baseUrl ?? DEFAULT_API_BASE_URL,
  };
}

export async function saveCredentials(
  credentials: ApiCredentials,
): Promise<void> {
  const apiKey = credentials.apiKey.trim();
  if (!apiKey) {
    throw new Error("Enter an AxForge API key.");
  }

  await Promise.all([
    SecureStore.setItemAsync(API_KEY_STORAGE_KEY, apiKey),
    SecureStore.setItemAsync(
      API_BASE_STORAGE_KEY,
      normalizeApiBaseUrl(credentials.baseUrl),
    ),
  ]);
}

export function normalizeApiBaseUrl(input: string): string {
  let value = input.trim().replace(/\/+$/, "");
  value = value.replace(/\/audio\/music$/i, "");
  if (!value) {
    return DEFAULT_API_BASE_URL;
  }
  if (!/\/v1$/i.test(value)) {
    value += "/v1";
  }
  return value;
}
