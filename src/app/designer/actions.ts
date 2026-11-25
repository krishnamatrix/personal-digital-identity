"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  extractHtmlDocument,
  extractHtmlTitle,
} from "@/domains/folio-designer/folio-designer-schema";
import {
  NoWebsiteAddressError,
  publishCustomWebsiteDesign,
  WebsitePersistenceError,
} from "@/domains/website/website-service";
import {
  AuthenticationRequiredError,
  AuthorizationError,
} from "@/lib/supabase/server";

export type PublishDesignActionResult = {
  ok: boolean;
  message: string;
  slug?: string;
  needsAddress?: boolean;
};

export async function publishFolioDesignerAction(input: {
  html: string;
  title?: string;
}): Promise<PublishDesignActionResult> {
  try {
    const html = extractHtmlDocument(String(input?.html ?? ""));
    const title = (input?.title?.trim() || extractHtmlTitle(html)).slice(
      0,
      160,
    );
    const { slug } = await publishCustomWebsiteDesign({ title, html });
    revalidatePath("/website");
    revalidatePath("/designer");
    revalidatePath(`/${slug}`);
    return {
      ok: true,
      slug,
      message: `Published live at /${slug}.`,
    };
  } catch (error) {
    if (error instanceof NoWebsiteAddressError) {
      return {
        ok: false,
        needsAddress: true,
        message: error.message,
      };
    }
    if (error instanceof AuthenticationRequiredError) {
      return {
        ok: false,
        message: "Your session has ended. Sign in again to publish.",
      };
    }
    if (error instanceof AuthorizationError) {
      return { ok: false, message: error.message };
    }
    if (error instanceof ZodError) {
      return {
        ok: false,
        message: "This design could not be validated for publishing.",
      };
    }
    if (error instanceof WebsitePersistenceError) {
      return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message: "We could not publish this design right now. Please try again.",
    };
  }
}
