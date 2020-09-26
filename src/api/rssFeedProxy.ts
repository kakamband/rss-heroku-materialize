import dayjs from "dayjs";
import type { Icontent, Ifeed } from "../common/Feed";

export const getFeed = async (rssUrl: string): Promise<Ifeed> => {
  
  const url = "https://8080-cs-994772306133-default.asia-east1.cloudshell.dev/rss-feed/";
  const query = `?url=${rssUrl}`;
  const inputRow = `${url}${query}`;
  const input = encodeURI(inputRow);

  const response = await fetch(input);

  let contents: Icontent[] = (response.ok)? await response.json() : [];
  contents = contents.map((content) => ({
    ...content,
    date: dayjs(content.isoDate),
  }));

  const urlParse = new URL(response.url);
  const resRssurl = urlParse.searchParams.get("url");

  return { 
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: resRssurl,
    contents,
  };
};
