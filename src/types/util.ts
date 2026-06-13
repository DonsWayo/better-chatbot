import { JSONSchema7 } from "json-schema";
import { z } from "zod";

export const envBooleanSchema = z
  .union([z.string(), z.boolean()])
  .optional()
  .transform((val) => {
    if (typeof val === "boolean") return val;
    if (typeof val === "string") {
      const lowerVal = val.toLowerCase();
      return lowerVal === "true" || lowerVal === "1" || lowerVal === "y";
    }
    return false;
  });

export type ObjectJsonSchema7 = {
  type: "object";
  required?: string[];
  description?: string;
  properties: {
    [key: string]: JSONSchema7;
  };
};

export type TipTapMentionJsonContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "mention";
      attrs: {
        id: string;
        label: string;
      };
    };

export type TipTapMentionJsonContent = {
  type: "doc";
  content: {
    type: "paragraph";
    content?: (
      | {
          type: "text";
          text: string;
        }
      | {
          type: "mention";
          attrs: {
            id: string;
            label: string;
          };
        }
      | {
          type: "hardBreak";
        }
    )[];
  }[];
};

export const VisibilitySchema = z.enum(["public", "private", "readonly"]);
export type Visibility = z.infer<typeof VisibilitySchema>;

/**
 * Structured result returned by Server Actions that carry user-instructional
 * failure messages.
 *
 * Production Next.js masks errors THROWN from a Server Action into an opaque
 * 500 ("digest") response, so a client's `toast.error(err.message)` only ever
 * shows "An unexpected response was received from the server" — the carefully
 * written reason (permission denial, validation error, policy gate, ...) is
 * lost. Returning the reason as data keeps it readable across the RSC boundary.
 *
 * Mirrors the shape first introduced for `saveMcpClientAction`.
 */
export type ActionResult<T = void> =
  | (T extends void
      ? { success: true; data?: undefined }
      : { success: true; data: T })
  | { success: false; error: string };

/**
 * Wraps a throwing async fn into an {@link ActionResult}. The internal
 * `*OrThrow` logic stays reusable by other server code that wants the throw,
 * while the exported action returns the structured result.
 */
export async function toActionResult<T>(
  fn: () => Promise<T>,
  fallbackMessage = "Something went wrong. Please try again.",
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { success: true, data } as ActionResult<T>;
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : fallbackMessage;
    return { success: false, error: message };
  }
}
