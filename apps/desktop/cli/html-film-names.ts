/** Launch-film command shapes, kept free of runtime imports for the argument parser. */

/** Film templates that `html init --template` writes; public copy cites these ids. */
export const HTML_FILM_TEMPLATES = ["launch-film"] as const;
export type HtmlFilmTemplate = (typeof HTML_FILM_TEMPLATES)[number];

export const HTML_FILM_CUTS = ["1:1", "9:16", "4:5"] as const;
export type HtmlFilmCut = (typeof HTML_FILM_CUTS)[number];

export type HtmlFilmCommand =
  | { readonly kind: "html-film"; readonly action: "still"; readonly input: string; readonly at: readonly number[]; readonly output: string; readonly json: boolean }
  | { readonly kind: "html-film"; readonly action: "preview"; readonly input: string; readonly every: number; readonly output: string; readonly json: boolean }
  | {
    readonly kind: "html-film"; readonly action: "deliver"; readonly exportPath: string; readonly basename: string;
    readonly posterAt: number; readonly socialAt: number; readonly cuts: readonly HtmlFilmCut[];
    readonly perBeatClips: boolean; readonly beats?: string; readonly output?: string; readonly json: boolean;
  };
