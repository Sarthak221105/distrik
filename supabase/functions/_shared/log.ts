// Structured JSON line logs. Only ids and codes, never message bodies, names
// or phone numbers (PRD 15: no personal data in logs).

export type LogFields = Record<string, unknown>;

export interface Logger {
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
  readonly fields: LogFields;
}

function emit(level: string, msg: string, fields: LogFields) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields }, (_k, v) => {
    if (v instanceof Error) return { name: v.name, message: v.message };
    if (typeof v === "bigint") return v.toString();
    return v;
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logger(fields: LogFields = {}): Logger {
  return {
    fields,
    info: (msg, f = {}) => emit("info", msg, { ...fields, ...f }),
    warn: (msg, f = {}) => emit("warn", msg, { ...fields, ...f }),
    error: (msg, f = {}) => emit("error", msg, { ...fields, ...f }),
    child: (f) => logger({ ...fields, ...f }),
  };
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") {
      return [o.message, o.details, o.hint].filter((x) => typeof x === "string" && x).join(" | ");
    }
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
}
