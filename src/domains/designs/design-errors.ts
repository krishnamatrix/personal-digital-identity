/** The chosen design does not exist, is a draft, or was retired before it was chosen (PT422). */
export class DesignUnavailableError extends Error {
  constructor() {
    super("That design is not available any more. Please choose another.");
    this.name = "DesignUnavailableError";
  }
}
