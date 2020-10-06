import dayjs from "dayjs";
import { Icontent, Ifeed, IfeedInfo } from "../common/Feed";

type Tmethod = "GET" | "PUT" | "DELTE" | "POST";

const api = async (path: string, query: string = null, method: Tmethod = "GET", data: object = null) => {

  const resourceRow = (query)? `${location.origin}/${path}?${query}` : `${location.origin}/${path}`;
  const resource = encodeURI(resourceRow);

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };
  if (data) init.body = JSON.stringify(data);

  const response = await fetch(resource, init);
  return response;
};

const getFeed = async (rssUrl: string): Promise<Ifeed> => {

  const response: Response = await api("rss-feed", `url=${rssUrl}`);

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

export const getFeeds = async (feedInfos: IfeedInfo[]): Promise<Ifeed[]> => {
  const promises = feedInfos.map((feedInfo) => getFeed(feedInfo.url));
  const feeds = await Promise.all(promises);
  return feeds;
};

export const putFeedInfos = async (feedInfos: IfeedInfo[]) => {
  const response: Response = await api("feed-infos", null, "PUT", { feedInfos });
  console.log(response.ok, response.status, response.statusText);
};

export const getFeedInfos = async () => {
  const response: Response = await api("feed-infos", null, "GET");
  if (!response.ok) return null;
  const feedInfos = await response.json();
  return feedInfos;
};
