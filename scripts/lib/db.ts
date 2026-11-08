import { Client } from "pg";
import { loadLocalEnv } from "./local-env";

/** Runs `fn` with a pg client on the local env's DATABASE_URL; always closes it. Never prints the URL. */
export async function withLocalDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  loadLocalEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("missing env DATABASE_URL");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
