import type { ComponentType } from "react";
import { MinisteringPromo, type MinisteringProps } from "./MinisteringPromo";

export interface MinisteringTemplate {
  id: string;
  name: string;
  description: string;
  Component: ComponentType<MinisteringProps>;
}

// Speaker-intro templates for the Ministering tab. To add one: build a component that takes MinisteringProps,
// then list it here. The first entry is the default for slides saved before templates existed.
export const MINISTERING_TEMPLATES: MinisteringTemplate[] = [
  { id: "swirl", name: "Swirl promo", description: "Orange silhouette resolves into the photo, headline wipes in, then a swirl zoom-out.", Component: MinisteringPromo },
];

export const templateById = (id?: string) => MINISTERING_TEMPLATES.find((t) => t.id === id) ?? MINISTERING_TEMPLATES[0];
