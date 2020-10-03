import dayjs from "dayjs";
import type { Icontent, Ifeed } from "../common/Feed";

const api = async (query: string): Promise<Response> => {
  const url = `${location.origin}/rss-feed/`;
  const inputRow = `${url}${query}`;
  const input = encodeURI(inputRow);
  const response = await fetch(input);
  return response;
};

const getFeed = async (rssUrl: string): Promise<Ifeed> => {

  const response: Response = await api(`?url=${rssUrl}`);

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

export const getFeeds = async (feedUrls: string[]): Promise<Ifeed[]> => {
  const promises = feedUrls.map((feedUrl) => getFeed(feedUrl));
  const feeds = await Promise.all(promises);
  return feeds;
};
