import dayjs from "dayjs";
import type { Icontent, Ifeed } from "../common/Feed";

export const getFeed = async (rssUrl: string): Promise<Ifeed> => {
  
  const url = "https://8080-cs-994772306133-default.asia-east1.cloudshell.dev/rss-feed/";
  const query = `?url=${rssUrl}`;
  const inputRow = `${url}${query}`;
  const input = encodeURI(inputRow);

  const response = await fetch(input);

  const feed: Ifeed =  { 
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: "",

    title: "",
    description: "",
    link: "",
    contents: [],
  };

  const urlParse = new URL(response.url);
  feed.url = urlParse.searchParams.get("url");

  if (!response.ok) return feed;
  const result = await response.json();

  feed.title = result.title;
  feed.description = result.description;
  feed.link = result.link;

  const contents: Icontent[] = result.contents.map((content: Icontent) => ({
    ...content,
    date: dayjs(content.isoDate),
  }));
  feed.contents = contents;

  return feed;
};
