import type { Dayjs } from "dayjs";

export interface Icontent {
  title: string;
  isoDate: string;
  date: Dayjs;
  link: string;
}

export interface Ifeed {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;

  title: string;
  description: string;
  link: string;
  contents: Icontent[];
}

export interface IfeedInfo {
  id: string;
  title: string;
  url: string;
  valid: boolean;
}
