import type { Dayjs } from "dayjs";

export interface Icontent {
  title: string;
  isoDate: string;
  date: Dayjs;
  link: string;
}

export interface Ifeed {
  ok: boolean;
  status: number
  statusText: string;
  url: string;
  contents: Icontent[];
}