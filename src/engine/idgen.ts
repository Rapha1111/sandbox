import { nanoid } from "nanoid";

export const genId = (prefix: string): string => `${prefix}_${nanoid(10)}`;
