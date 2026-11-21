import "server-only";
import { getSession } from "@asafarim/auth";
import { getPublicUrlForKey } from "@asafarim/storage";
import { resolveAccountAvatar, type AccountAvatarSource } from "./accountAvatar";

/** The current session's account photo, if it is one this app can read. */
export async function getAccountAvatarSource(): Promise<AccountAvatarSource | null> {
  const session = await getSession();
  return resolveAccountAvatar(
    session?.user?.image,
    session?.user?.id ?? "",
    getPublicUrlForKey("")
  );
}
