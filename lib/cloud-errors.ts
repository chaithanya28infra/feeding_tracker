export type CloudStep =
  | "load profiles"
  | "load backup"
  | "check ownership"
  | "create profile"
  | "save backup";
export class CloudDatabaseError extends Error {
  readonly code: string;
  readonly step: CloudStep;
  constructor(step: CloudStep, rawCode?: string) {
    const code =
      rawCode && /^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(rawCode)
        ? rawCode
        : "UNKNOWN";
    const reason =
      code === "42501"
        ? "Database access was denied. The project’s table permissions and access policies need checking."
        : ["42P01", "42703", "PGRST204", "PGRST205"].includes(code)
          ? "The cloud database schema does not match the app. Database setup needs checking."
          : code === "23503"
            ? "A required account or baby record is missing."
            : code === "23505"
              ? "A matching record already exists. Refresh cloud profiles before retrying."
              : code === "23514" || code === "23502"
                ? "The database rejected a required value or data constraint."
                : "The database could not complete this action.";
    super(`Could not ${step} (${code}). ${reason}`);
    this.code = code;
    this.step = step;
  }
}
