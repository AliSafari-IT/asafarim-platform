import { ConflictError } from "../errors";
import { M13_FEATURE_FLAGS, type M13FeatureFlag } from "./flags";

/**
 * M13 slice G — thrown when a caller tries to USE a capability whose flag is
 * off. Deliberately a 409-family `ConflictError` rather than a 403: nothing
 * about the caller's authorization is wrong, and telling an editor they are
 * "forbidden" from importing a URL when the real answer is "this deployment
 * has URL import switched off" sends them to ask for a permission that would
 * not help.
 *
 * The message names the operator-facing switch, because the person who can
 * fix this is an operator, not the user — and it names only the env var,
 * never its current value or any other flag's state.
 */
export class FeatureDisabledError extends ConflictError {
  readonly flag: M13FeatureFlag;

  constructor(flag: M13FeatureFlag, userFacingMessage: string) {
    super(
      `${userFacingMessage} (Disabled for this deployment via ${M13_FEATURE_FLAGS[flag].envVar}.)`
    );
    this.name = "FeatureDisabledError";
    this.flag = flag;
  }
}
